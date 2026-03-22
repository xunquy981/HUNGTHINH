
import { db } from '../db';
import { Order, AppSettings, OrderStatus, PaymentStatus, FulfillmentStatus, DebtRecord, Transaction } from '../../types';
import { generateUUID, getCurrentDate, calcAvailableStock, formatDateISO, addDays } from '../../utils/helpers';
import { logAudit } from '../audit';

// Helper for log inside services
const log = async (entityId: string, action: any, summary: string, user: {id: string, name: string}, refCode?: string) => {
    await logAudit({
        module: 'Orders', entityType: 'Order', entityId, action, summary, refCode,
        actor: user
    });
};

/**
 * Service to handle creating a new order including inventory, debt, and transaction management.
 */
export const createOrderService = async (
    orderData: Partial<Order>,
    settings: AppSettings,
    user: {id: string, name: string}
) => {
    const id = generateUUID('ord');
    const code = orderData.code || `${settings.system.orderPrefix}-${Date.now().toString().slice(-6)}`;
    
    // Add 'transactions' to the RW scope
    await (db as any).transaction('rw', [db.orders, db.products, db.inventoryLogs, db.auditLogs, db.debtRecords, db.partners, db.transactions], async (tx: any) => {
        const total = orderData.total || 0;
        const amountPaid = orderData.amountPaid || 0;

        // 1. Derive Payment Status logic (Single Source of Truth)
        let paymentStatus: PaymentStatus = 'Unpaid';
        if (amountPaid >= total) {
            paymentStatus = 'Paid';
        } else if (amountPaid > 0) {
            paymentStatus = 'Partial';
        }

        // 2. Process Inventory
        for (const item of orderData.items || []) {
            const product = await tx.products.get(item.id);
            if (product) {
                if (orderData.status === 'Completed') {
                    // Check for negative stock prevention
                    if (settings.system.preventNegativeStock && product.stock < item.quantity) {
                        throw new Error(`Sản phẩm ${product.name} không đủ tồn kho (Còn: ${product.stock}).`);
                    }

                    // Direct deduction for immediate orders
                    const newStock = product.stock - item.quantity;
                    await tx.products.update(item.id, { stock: newStock, updatedAt: Date.now() });
                    await tx.inventoryLogs.add({
                        id: generateUUID('log'), productId: item.id, sku: product.sku, productName: product.name,
                        type: 'sale', changeAmount: -item.quantity, oldStock: product.stock, newStock: newStock,
                        date: orderData.date || getCurrentDate(), timestamp: Date.now(), referenceCode: code,
                        note: `Bán hàng (Đơn ${code})`, createdAt: Date.now()
                    } as any);
                } else if (orderData.status === 'Processing') {
                    // Reservation for orders that will be fulfilled later
                    const newReserved = (product.stockReserved || 0) + item.quantity;
                    await tx.products.update(item.id, { stockReserved: newReserved, updatedAt: Date.now() });
                }
            }
        }

        // 3. Create Order
        const order: Order = {
            ...orderData,
            id,
            code,
            date: orderData.date || getCurrentDate(),
            status: orderData.status || 'Processing',
            paymentStatus: paymentStatus, // Use derived status
            fulfillmentStatus: orderData.fulfillmentStatus || (orderData.status === 'Completed' ? 'Delivered' : 'NotShipped'),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isDeleted: false
        } as Order;
        
        await tx.orders.add(order);

        // 4. Handle Financials
        
        // A. Record Income Transaction (if money was paid immediately)
        if (amountPaid > 0) {
            await tx.transactions.add({
                id: generateUUID('txn'),
                date: order.date,
                type: 'income',
                category: 'sale',
                amount: amountPaid,
                method: order.paymentMethod === 'debt' ? 'cash' : order.paymentMethod, // Fallback if debt mixed (shouldn't happen with correct logic)
                description: `Thu tiền đơn hàng ${code}`,
                referenceCode: code,
                partnerName: order.customerName,
                createdAt: Date.now(),
                updatedAt: Date.now()
            } as Transaction);
        }

        // B. Handle Debt (if payment is missing/partial)
        if (order.partnerId && amountPaid < total && order.status !== 'Cancelled') {
            const debtAmount = total - amountPaid;
            await tx.debtRecords.add({
                id: generateUUID('debt'), partnerId: order.partnerId, partnerName: order.customerName,
                orderCode: code, issueDate: order.date,
                dueDate: formatDateISO(addDays(new Date(order.date), settings.system.debtDueDays)),
                totalAmount: total, remainingAmount: debtAmount,
                status: 'Pending', type: 'Receivable', createdAt: Date.now(), updatedAt: Date.now()
            } as DebtRecord);
            
            const partner = await tx.partners.get(order.partnerId);
            if (partner) {
                await tx.partners.update(order.partnerId, { debt: (partner.debt || 0) + debtAmount });
            }
        }
    });

    await log(id, 'Create', `Tạo đơn hàng ${code}`, user, code);
    return (await db.orders.get(id))!;
};

export const updateOrderStatusService = async (
    id: string, 
    status: string, 
    user: {id: string, name: string},
    settings?: AppSettings // Inject Settings
) => {
    await (db as any).transaction('rw', [db.orders, db.products, db.inventoryLogs, db.auditLogs, db.debtRecords, db.partners, db.transactions, db.deliveryNotes], async (tx: any) => {
        const before = await tx.orders.get(id);
        if (!before) throw new Error("Không tìm thấy đơn hàng");
        
        if (before.lockedAt && status !== 'Cancelled') {
             throw new Error("Đơn hàng đã bị khóa kế toán.");
        }

        const oldStatus = before.status;
        if (oldStatus === status) return;

        // Inventory Logic: Move from Reserved to Deducted ONLY for remaining items
        if (status === 'Completed' && (oldStatus === 'Processing' || oldStatus === 'PendingPayment' || oldStatus === 'PartiallyShipped')) {
             for (const item of before.items) {
                 const product = await tx.products.get(item.id);
                 if (product) {
                     // FIX: Calculate actual quantity to commit (Total - Delivered)
                     const deliveredQty = item.deliveredQuantity || 0;
                     const qtyToCommit = Math.max(0, item.quantity - deliveredQty);

                     if (qtyToCommit > 0) {
                         // ENFORCE PREVENT NEGATIVE STOCK
                         if (settings?.system?.preventNegativeStock && product.stock < qtyToCommit) {
                             throw new Error(`Sản phẩm ${product.name} không đủ tồn kho (Còn: ${product.stock}, Cần: ${qtyToCommit}). Vui lòng nhập hàng trước khi hoàn tất đơn.`);
                         }

                         const newStock = product.stock - qtyToCommit;
                         // Release reservation for the committed amount
                         const newReserved = Math.max(0, (product.stockReserved || 0) - qtyToCommit);
                         
                         await tx.products.update(item.id, { stock: newStock, stockReserved: newReserved });
                         
                         await tx.inventoryLogs.add({
                            id: generateUUID('log'), productId: item.id, sku: product.sku, productName: product.name,
                            type: 'sale', changeAmount: -qtyToCommit, oldStock: product.stock, newStock: newStock,
                            date: getCurrentDate(), timestamp: Date.now(), referenceCode: before.code,
                            note: `Hoàn tất đơn hàng ${before.code} (SL còn lại: ${qtyToCommit})`, createdAt: Date.now()
                        } as any);
                     }
                 }
             }
        }

        await tx.orders.update(id, { status, updatedAt: Date.now() });
        const after = await tx.orders.get(id);

        // Detailed Audit Log with Snapshot Diff
        await logAudit({
            module: 'Orders',
            entityType: 'Order',
            entityId: id,
            entityCode: before.code,
            action: 'StatusChange',
            summary: `Đổi trạng thái đơn ${before.code}: ${oldStatus} -> ${status}`,
            actor: user,
            before,
            after
        }, tx);
    });
};

export const cancelOrderService = async (id: string, reason: string, user: {id: string, name: string}) => {
    await (db as any).transaction('rw', [db.orders, db.products, db.inventoryLogs, db.auditLogs, db.debtRecords, db.partners, db.deliveryNotes, db.transactions], async (tx: any) => {
        const order = await tx.orders.get(id);
        if (!order) throw new Error("Order not found");
        if (order.status === 'Cancelled') return;
        if (order.lockedAt) throw new Error("Đơn hàng đã khóa kế toán.");

        // 1. GUARD: Strict Validation for Physical Inventory Movement
        // ONLY check for formal Delivery Notes. POS orders are "delivered" instantly but don't use Delivery Notes usually.
        // This allows POS cashiers to cancel errors immediately.
        const deliveredNotesCount = await tx.deliveryNotes.where('orderId').equals(id).filter((n: any) => n.status === 'Delivered').count();

        if (deliveredNotesCount > 0) {
            throw new Error("Đơn hàng đã có Phiếu Giao Hàng thành công. Không thể Hủy trực tiếp. Vui lòng sử dụng tính năng 'Trả hàng' (Return) để nhập kho và hoàn tiền chính xác.");
        }

        // 2. Revert Inventory Logic
        for (const item of order.items) {
            const product = await tx.products.get(item.id);
            if (product) {
                if (order.status === 'Completed') {
                    // Completed means stock was deducted. Add it back.
                    const newStock = product.stock + item.quantity;
                    await tx.products.update(item.id, { stock: newStock });
                    await tx.inventoryLogs.add({
                        id: generateUUID('log'), productId: item.id, sku: product.sku, productName: product.name,
                        type: 'revert_delete', changeAmount: item.quantity, oldStock: product.stock, newStock: newStock,
                        date: getCurrentDate(), timestamp: Date.now(), referenceCode: order.code,
                        note: `Hoàn kho do hủy đơn ${order.code}`, createdAt: Date.now()
                    } as any);
                } else if (order.status === 'Processing' || order.status === 'PartiallyShipped') {
                    // Processing means stock was Reserved. Release reservation.
                    const newReserved = Math.max(0, (product.stockReserved || 0) - item.quantity);
                    await tx.products.update(item.id, { stockReserved: newReserved });
                }
            }
        }

        // 3. Cancel only Pending/Shipping Delivery Notes
        await tx.deliveryNotes.where('orderId').equals(id).modify({ status: 'Cancelled', updatedAt: Date.now() });

        // 4. Void Debt & Create Refund Transaction (if needed)
        if (order.partnerId) {
            const debt = await tx.debtRecords.where('orderCode').equals(order.code).first();
            if (debt && debt.status !== 'Void') {
                const partner = await tx.partners.get(order.partnerId);
                if (partner) {
                    // Revert the debt amount from partner balance
                    await tx.partners.update(order.partnerId, { debt: Math.max(0, (partner.debt || 0) - debt.remainingAmount) });
                }
                // Void the debt record
                await tx.debtRecords.update(debt.id, { status: 'Void', remainingAmount: 0, updatedAt: Date.now() });
            }
        }

        // 5. Refund Logic: If money was paid, record a refund transaction
        if (order.amountPaid > 0) {
            await tx.transactions.add({
                id: generateUUID('txn'),
                date: getCurrentDate(),
                type: 'expense',
                category: 'refund',
                amount: order.amountPaid,
                method: order.paymentMethod === 'transfer' ? 'transfer' : 'cash', // Fallback to original method
                description: `Hoàn tiền hủy đơn ${order.code}. Lý do: ${reason}`,
                referenceCode: order.code,
                partnerName: order.customerName,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        // 6. Update Status and save cancellation reason
        await tx.orders.update(id, { 
            status: 'Cancelled', 
            notes: order.notes ? `${order.notes} [Hủy: ${reason}]` : `[Hủy: ${reason}]`,
            updatedAt: Date.now() 
        });
    });

    await log(id, 'StatusChange', `Hủy đơn hàng. Lý do: ${reason}`, user);
};

export const deleteOrderService = async (id: string, user: {id: string, name: string}) => {
    // SAFE MODE: Block deletion if money involved
    await (db as any).transaction('rw', [db.orders, db.products, db.inventoryLogs, db.auditLogs, db.debtRecords, db.partners, db.transactions], async (tx: any) => {
        const order = await tx.orders.get(id);
        if (!order) return;

        // 1. Validation
        if (order.amountPaid > 0) {
            throw new Error(`Đơn hàng ${order.code} đã phát sinh thu tiền (${order.amountPaid.toLocaleString()}). Vui lòng sử dụng tính năng "Hủy đơn" để đảm bảo hoàn tiền và cân bằng sổ quỹ.`);
        }
        
        // If order has a transaction link even if amountPaid is 0 (edge case), block it
        const hasTxn = await tx.transactions.where('referenceCode').equals(order.code).count();
        if (hasTxn > 0) {
            throw new Error(`Đơn hàng ${order.code} có giao dịch liên kết. Vui lòng Hủy đơn thay vì Xóa.`);
        }

        // 2. Cleanup Resources (For UNPAID/DRAFT orders)
        
        // A. Inventory Return
        if (order.status !== 'Cancelled') {
            for (const item of order.items) {
                const product = await tx.products.get(item.id);
                if (product) {
                    if (order.status === 'Completed') {
                        // Return Stock
                        await tx.products.update(item.id, { stock: product.stock + item.quantity });
                        await tx.inventoryLogs.add({
                            id: generateUUID('log'), productId: item.id, sku: product.sku, productName: product.name,
                            type: 'revert_delete', changeAmount: item.quantity, oldStock: product.stock, newStock: product.stock + item.quantity,
                            date: getCurrentDate(), timestamp: Date.now(), referenceCode: order.code,
                            note: `Hoàn kho do xóa đơn nháp ${order.code}`, createdAt: Date.now()
                        } as any);
                    } else if (order.status === 'Processing' || order.status === 'PartiallyShipped') {
                        // Release Reservation
                        const newReserved = Math.max(0, (product.stockReserved || 0) - item.quantity);
                        await tx.products.update(item.id, { stockReserved: newReserved });
                    }
                }
            }
        }

        // B. Void/Delete Debt Record (Since no money changed hands, we can safely delete the debt expectation)
        if (order.partnerId) {
            const debt = await tx.debtRecords.where('orderCode').equals(order.code).first();
            if (debt) {
                const partner = await tx.partners.get(order.partnerId);
                if (partner) {
                    // Reduce the debt on partner profile
                    const newDebt = Math.max(0, (partner.debt || 0) - debt.remainingAmount);
                    await tx.partners.update(order.partnerId, { debt: newDebt });
                }
                // Hard delete debt record for cleanup since order is being soft-deleted
                await tx.debtRecords.delete(debt.id);
            }
        }

        // 3. Soft Delete Order
        await tx.orders.update(id, { isDeleted: true, updatedAt: Date.now() });
    });

    await log(id, 'SoftDelete', 'Xóa đơn hàng chưa thanh toán (Soft Delete)', user);
};

export const updateOrderService = async (id: string, data: Partial<Order>, user: {id: string, name: string}) => {
    await db.orders.update(id, { ...data, updatedAt: Date.now() });
    await log(id, 'Update', 'Cập nhật thông tin đơn hàng', user);
};
