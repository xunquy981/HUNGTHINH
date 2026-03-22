
import { db } from '../db';
import { generateUUID, getCurrentDate } from '../../utils/helpers';
import { logAudit } from '../audit';
import { ImportOrder, PurchaseReturnNote, Order, ReturnNote, AppSettings } from '../../types';

const log = async (entityId: string, action: any, summary: string, user: {id: string, name: string}, refCode?: string) => {
    await logAudit({
        module: 'Returns', entityType: 'Return', entityId, action, summary, refCode,
        actor: user
    });
};

interface PurchaseReturnParams {
    importOrder: ImportOrder;
    items: { id: string; quantity: number; price: number; name: string }[];
    refundAmount: number;
    method: string; // 'debt_deduction' | 'cash' | 'transfer'
    notes: string;
    date: string;
}

export const createPurchaseReturnService = async (
    params: PurchaseReturnParams,
    user: {id: string, name: string},
    settings?: AppSettings
) => {
    const { importOrder, items, refundAmount, method, notes, date } = params;
    const returnId = generateUUID('prn');
    const returnCode = `TH-NCC-${Date.now().toString().slice(-6)}`;

    await (db as any).transaction('rw', [
        db.purchaseReturnNotes, db.products, db.inventoryLogs, 
        db.debtRecords, db.partners, db.transactions, db.auditLogs
    ], async (tx: any) => {
        
        const returnNote: PurchaseReturnNote = {
            id: returnId,
            code: returnCode,
            importCode: importOrder.code,
            supplierId: importOrder.supplierId,
            date: date || getCurrentDate(),
            items: items,
            refundAmount: refundAmount,
            method: method,
            notes: notes,
            createdAt: Date.now(),
            seedTag: 'manual'
        };
        await tx.purchaseReturnNotes.add(returnNote);

        for (const item of items) {
            if (item.quantity <= 0) continue;
            const product = await tx.products.get(item.id);
            if (product) {
                // CHECK: Prevent Negative Stock
                if (settings?.system?.preventNegativeStock && product.stock < item.quantity) {
                    throw new Error(`Sản phẩm ${product.name} không đủ tồn kho để trả (Tồn: ${product.stock}, Trả: ${item.quantity}). Vui lòng kiểm tra lại.`);
                }

                const newStock = product.stock - item.quantity;
                await tx.products.update(item.id, { stock: newStock, updatedAt: Date.now() });
                await tx.inventoryLogs.add({
                    id: generateUUID('log'), productId: item.id, sku: product.sku, productName: product.name,
                    type: 'return', changeAmount: -item.quantity, oldStock: product.stock, newStock: newStock,
                    date: date || getCurrentDate(), timestamp: Date.now(), referenceCode: returnCode,
                    note: `Trả hàng NCC (${importOrder.code})`, createdAt: Date.now()
                });
            }
        }

        if (method === 'debt_deduction') {
            const debtRecord = await tx.debtRecords.where('orderCode').equals(importOrder.code).first();
            if (debtRecord) {
                const newRemaining = Math.max(0, debtRecord.remainingAmount - refundAmount);
                let newStatus = debtRecord.status;
                if (newRemaining <= 0) newStatus = 'Paid';
                await tx.debtRecords.update(debtRecord.id, { remainingAmount: newRemaining, status: newStatus, updatedAt: Date.now() });
            }
            const partner = await tx.partners.get(importOrder.supplierId);
            if (partner) {
                const newDebt = Math.max(0, (partner.debt || 0) - refundAmount);
                await tx.partners.update(partner.id, { debt: newDebt, updatedAt: Date.now() });
            }
        } else {
            await tx.transactions.add({
                id: generateUUID('txn'), date: date || getCurrentDate(), type: 'income', category: 'supplier_refund',
                amount: refundAmount, method: method, description: `Hoàn tiền trả hàng NCC (${importOrder.code})`,
                referenceCode: returnCode, partnerName: importOrder.supplierName, createdAt: Date.now(), updatedAt: Date.now()
            });
        }
    });
    await log(returnId, 'Create', `Trả hàng NCC: ${importOrder.code}`, user, returnCode);
    return returnCode;
};

// --- NEW: SALES RETURN (Khách trả hàng) ---
interface SalesReturnParams {
    order: Order;
    items: { id: string; quantity: number; price: number; name: string }[];
    refundAmount: number;
    method: string; // 'debt_deduction' | 'cash' | 'transfer'
    restock: boolean; // Có nhập lại kho không?
    notes: string;
    date: string;
}

export const createSalesReturnService = async (
    params: SalesReturnParams,
    user: {id: string, name: string}
) => {
    const { order, items, refundAmount, method, restock, notes, date } = params;
    const returnId = generateUUID('rtn');
    const returnCode = `TH-${Date.now().toString().slice(-6)}`;

    await (db as any).transaction('rw', [
        db.returnNotes, db.products, db.inventoryLogs, 
        db.debtRecords, db.partners, db.transactions, db.auditLogs, db.orders
    ], async (tx: any) => {
        
        // 0. Safety Guard: Re-verify refund amount limit
        let itemReturnSubtotal = 0;
        items.forEach(i => { itemReturnSubtotal += i.quantity * i.price; });
        
        const orderSubtotal = order.subtotal > 0 ? order.subtotal : 1;
        const ratio = itemReturnSubtotal / orderSubtotal;
        const discountShare = (order.discount || 0) * ratio;
        const netAfterDiscount = itemReturnSubtotal - discountShare;
        const vatShare = netAfterDiscount * ((order.vatRate || 0) / 100);
        const calculatedMaxRefund = Math.floor(netAfterDiscount + vatShare) + 100;

        if (refundAmount > calculatedMaxRefund) {
            throw new Error(`Số tiền hoàn (${refundAmount}) vượt quá giá trị hợp lệ của hàng trả (${calculatedMaxRefund}).`);
        }

        // 1. Create Return Record
        const returnNote: ReturnNote = {
            id: returnId,
            code: returnCode,
            orderCode: order.code,
            customerId: order.partnerId || 'GUEST',
            date: date || getCurrentDate(),
            items: items,
            refundAmount: refundAmount,
            reason: notes, 
            createdAt: Date.now(),
            seedTag: 'manual'
        };
        await tx.returnNotes.add(returnNote);

        // 2. Inventory Handling (If restock is true)
        if (restock) {
            for (const item of items) {
                if (item.quantity <= 0) continue;
                const product = await tx.products.get(item.id);
                if (product) {
                    const newStock = product.stock + item.quantity;
                    await tx.products.update(item.id, { stock: newStock, updatedAt: Date.now() });
                    
                    await tx.inventoryLogs.add({
                        id: generateUUID('log'), productId: item.id, sku: product.sku, productName: product.name,
                        type: 'sale_reversal',
                        changeAmount: item.quantity, oldStock: product.stock, newStock: newStock,
                        date: date || getCurrentDate(), timestamp: Date.now(), referenceCode: returnCode,
                        note: `Khách trả hàng (${order.code})`, createdAt: Date.now()
                    });
                }
            }
        }

        // 3. Financial Handling (SMART DEBT DEDUCTION)
        let actualRefundCash = refundAmount;
        let deductedDebt = 0;

        if (order.partnerId) {
            const debtRecord = await tx.debtRecords.where('orderCode').equals(order.code).first();
            
            // Nếu khách còn nợ đơn này, ưu tiên trừ nợ trước
            if (debtRecord && debtRecord.remainingAmount > 0) {
                if (refundAmount >= debtRecord.remainingAmount) {
                    // Trả hàng nhiều hơn số đang nợ -> Xóa sạch nợ, phần dư trả tiền mặt
                    deductedDebt = debtRecord.remainingAmount;
                    actualRefundCash = refundAmount - debtRecord.remainingAmount;
                } else {
                    // Trả hàng ít hơn số nợ -> Chỉ giảm nợ, không trả tiền mặt
                    deductedDebt = refundAmount;
                    actualRefundCash = 0;
                }

                // Cập nhật phiếu nợ
                const newRemaining = debtRecord.remainingAmount - deductedDebt;
                await tx.debtRecords.update(debtRecord.id, { 
                    remainingAmount: newRemaining, 
                    status: newRemaining <= 0 ? 'Paid' : 'Partial',
                    updatedAt: Date.now() 
                });

                // Cập nhật tổng nợ đối tác
                const partner = await tx.partners.get(order.partnerId);
                if (partner) {
                    const newDebt = Math.max(0, (partner.debt || 0) - deductedDebt);
                    await tx.partners.update(partner.id, { debt: newDebt, updatedAt: Date.now() });
                }
            }
        }

        // Chỉ tạo phiếu chi tiền nếu thực sự có hoàn tiền mặt (sau khi đã trừ nợ)
        if (actualRefundCash > 0) {
            await tx.transactions.add({
                id: generateUUID('txn'), date: date || getCurrentDate(), type: 'expense', category: 'refund',
                amount: actualRefundCash, method: method, description: `Hoàn tiền khách trả hàng (${order.code})`,
                referenceCode: returnCode, partnerName: order.customerName, createdAt: Date.now(), updatedAt: Date.now()
            });
        }

        // 4. Update Order Status Logic
        // Check if all items are fully returned to mark as 'Returned'
        const previousReturns = await tx.returnNotes.where('orderCode').equals(order.code).toArray();
        let totalReturnedItems = items.reduce((sum: number, i: any) => sum + i.quantity, 0);
        
        // Add quantities from previous returns
        previousReturns.forEach((pr: ReturnNote) => {
            pr.items.forEach((pi: any) => totalReturnedItems += pi.quantity);
        });

        const totalOrderItems = order.items.reduce((sum: number, i: any) => sum + i.quantity, 0);

        // If returned quantity meets or exceeds original quantity, mark as Returned
        if (totalReturnedItems >= totalOrderItems) {
            await tx.orders.update(order.id, { status: 'Returned', updatedAt: Date.now() });
        }
    });

    await log(returnId, 'Create', `Khách trả hàng: ${order.code} - Trị giá: ${refundAmount}`, user, returnCode);
    return returnCode;
};
