import { useAppContext } from '../contexts/AppContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNotification } from '../contexts/NotificationContext';
import { db } from '../services/db';
import { generateUUID, getCurrentDate, formatDateISO, addDays } from '../utils/helpers';
import { logAudit } from '../services/audit';
import { Order, Product, Partner, ImportOrder, ImportStatus, DeliveryNote, Quote, OrderStatus, DeliveryStatus, DebtRecord } from '../types';

import { createOrderService, updateOrderStatusService, cancelOrderService, deleteOrderService } from '../services/domains/order.service';
import { createQuoteService, updateQuoteService, convertQuoteToOrderService } from '../services/domains/quote.service';
import { addReceivingNoteService } from '../services/domains/inventory.service';
import { updateDeliveryNoteStatusService } from '../services/domains/delivery.service';
import { addManualTransactionService, deleteTransactionService, addPaymentToDebtService } from '../services/domains/finance.service';
import { createSalesReturnService, createPurchaseReturnService } from '../services/domains/return.service';

export const useDomainServices = () => {
    const { currentUser } = useAppContext();
    const { settings } = useSettings();
    const { showNotification } = useNotification();

    // Order
    const createOrder = async (data: Partial<Order>) => createOrderService(data, settings, currentUser);
    const updateOrderStatus = async (id: string, status: OrderStatus) => updateOrderStatusService(id, status, currentUser, settings);
    const cancelOrder = async (id: string, reason: string) => cancelOrderService(id, reason, currentUser);
    const deleteOrder = async (id: string) => deleteOrderService(id, currentUser);
    const lockOrder = async (id: string) => {
        await db.orders.update(id, { lockedAt: Date.now() });
        await logAudit({ module: 'Orders', entityType: 'Order', entityId: id, action: 'Lock', summary: 'Khóa đơn hàng', actor: currentUser });
    };

    // Quote
    const createQuote = async (data: Partial<Quote>) => createQuoteService(data, currentUser);
    const updateQuote = async (data: Partial<Quote>) => updateQuoteService(data, currentUser);
    const deleteQuote = async (id: string) => {
        await db.quotes.delete(id);
        await logAudit({ module: 'Quotes', entityType: 'Quote', entityId: id, action: 'Delete', summary: 'Xóa báo giá', actor: currentUser });
    };
    const convertQuoteToOrder = async (id: string, params: any) => convertQuoteToOrderService(id, params, settings, currentUser).then(o => o.id);

    // Product
    const addProduct = async (p: Partial<Product>) => {
        const id = generateUUID('prod');
        await db.products.add({ ...p, id, createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false } as Product);
        await logAudit({ module: 'Inventory', entityType: 'Product', entityId: id, action: 'Create', summary: `Thêm SP: ${p.name}`, actor: currentUser });
        return id;
    };
    const updateProduct = async (p: Product) => {
        await db.products.put({ ...p, updatedAt: Date.now() });
        await logAudit({ module: 'Inventory', entityType: 'Product', entityId: p.id, action: 'Update', summary: `Cập nhật SP: ${p.name}`, actor: currentUser });
    };
    const adjustStock = async (id: string, qty: number, reason: string) => {
        const p = await db.products.get(id);
        if(!p) return;
        const diff = qty - p.stock;
        await db.products.update(id, { stock: qty, updatedAt: Date.now() });
        await db.inventoryLogs.add({
            id: generateUUID('log'), productId: id, sku: p.sku, productName: p.name,
            type: 'adjustment', changeAmount: diff, oldStock: p.stock, newStock: qty,
            date: getCurrentDate(), timestamp: Date.now(), referenceCode: '',
            note: reason, createdAt: Date.now()
        } as any);
        await logAudit({ module: 'Inventory', entityType: 'Product', entityId: id, action: 'Adjust', summary: `Kiểm kê kho: ${p.stock} -> ${qty}. Lý do: ${reason}`, actor: currentUser });
    };

    // Partner
    const addPartner = async (p: Partial<Partner>) => {
        const id = generateUUID(p.type === 'Customer' ? 'cust' : 'supp');
        await db.partners.add({ ...p, id, createdAt: Date.now(), updatedAt: Date.now(), isDeleted: false, debt: 0 } as Partner);
        await logAudit({ module: 'Partners', entityType: 'Partner', entityId: id, action: 'Create', summary: `Thêm đối tác: ${p.name}`, actor: currentUser });
        return id;
    };
    const updatePartner = async (p: Partner) => {
        await db.partners.put({ ...p, updatedAt: Date.now() });
        await logAudit({ module: 'Partners', entityType: 'Partner', entityId: p.id, action: 'Update', summary: `Cập nhật đối tác: ${p.name}`, actor: currentUser });
    };
    const deletePartner = async (id: string) => {
        await db.partners.update(id, { isDeleted: true, updatedAt: Date.now() });
        await logAudit({ module: 'Partners', entityType: 'Partner', entityId: id, action: 'SoftDelete', summary: 'Xóa đối tác', actor: currentUser });
    };

    // Import
    const createImportOrder = async (io: Partial<ImportOrder>) => {
        const id = generateUUID('imp');
        const isAutoReceive = io.status === 'Received' || io.status === 'Completed';
        const baseTotal = isAutoReceive ? (io.total || 0) - (io.extraCosts || 0) : (io.total || 0);
        const initialExtraCosts = isAutoReceive ? 0 : (io.extraCosts || 0);

        await (db as any).transaction('rw', [db.importOrders, db.debtRecords, db.partners, db.auditLogs, db.products, db.inventoryLogs, db.receivingNotes, db.settings], async (tx: any) => {
            const paid = io.amountPaid || 0;
            
            await tx.importOrders.add({ 
                ...io, id, total: baseTotal, extraCosts: initialExtraCosts, createdAt: Date.now(), updatedAt: Date.now() 
            } as ImportOrder);

            if (io.supplierId && paid < baseTotal && !isAutoReceive && io.status !== 'Pending') {
                const dueDate = formatDateISO(addDays(new Date(io.date || Date.now()), settings.system.debtDueDays));
                await tx.debtRecords.add({
                    id: generateUUID('debt'), partnerId: io.supplierId, partnerName: io.supplierName || 'NCC',
                    orderCode: io.code || 'IMP', issueDate: io.date || getCurrentDate(),
                    dueDate, totalAmount: baseTotal, remainingAmount: baseTotal - paid, status: 'Pending', type: 'Payable',
                    createdAt: Date.now(), updatedAt: Date.now()
                } as DebtRecord);
                const supplier = await tx.partners.get(io.supplierId);
                if (supplier) await tx.partners.update(io.supplierId, { debt: (supplier.debt || 0) + (baseTotal - paid) });
            }
        });
        
        await logAudit({ module: 'Imports', entityType: 'Import', entityId: id, action: 'Create', summary: `Tạo phiếu nhập ${io.code}`, actor: currentUser });
        
        if (isAutoReceive) {
            const itemsToReceive = (io.items || []).map(i => ({ id: i.id, quantity: i.quantity }));
            await addReceivingNoteService(id, itemsToReceive, { date: io.date || getCurrentDate(), notes: io.notes || 'Nhập kho ban đầu' }, io.extraCosts || 0, currentUser);
        }
        showNotification('Đã tạo phiếu nhập thành công', 'success');
        return id;
    };
    
    const updateImportStatus = async (id: string, status: ImportStatus) => {
        await db.importOrders.update(id, { status, updatedAt: Date.now() });
        await logAudit({ module: 'Imports', entityType: 'Import', entityId: id, action: 'StatusChange', summary: `Đổi trạng thái: ${status}`, actor: currentUser });
    };
    
    const addReceivingNote = async (importId: string, items: any[], meta: any, extraCost: number) => addReceivingNoteService(importId, items, meta, extraCost, currentUser);

    // Delivery
    const addDeliveryNote = async (note: Partial<DeliveryNote>) => {
        const id = generateUUID('dn');
        await db.deliveryNotes.add({ ...note, id, createdAt: Date.now(), updatedAt: Date.now() } as DeliveryNote);
        await logAudit({ module: 'Delivery', entityType: 'Delivery', entityId: id, action: 'Create', summary: `Tạo phiếu giao ${note.code}`, actor: currentUser });
        return id;
    };
    const updateDeliveryNoteStatus = async (id: string, status: DeliveryStatus) => updateDeliveryNoteStatusService(id, status, currentUser, settings);
    const finalizeOrderWithDelivery = async (orderId: string, deliveryData: Partial<DeliveryNote>) => {
        const id = await addDeliveryNote(deliveryData);
        await updateOrderStatusService(orderId, 'Shipping', currentUser, settings);
        return id;
    };

    // Finance
    const addManualTransaction = async (txn: any) => addManualTransactionService(txn, settings, currentUser);
    const deleteTransaction = async (id: string) => deleteTransactionService(id, settings, currentUser);
    const addPaymentToDebt = async (debtId: string, payment: any) => addPaymentToDebtService(debtId, payment, settings, currentUser);

    // Return
    const returnOrder = async (params: any) => createSalesReturnService(params, currentUser);
    const addPurchaseReturnNote = async (params: any) => createPurchaseReturnService(params, currentUser, settings);

    return {
        createOrder, updateOrderStatus, cancelOrder, deleteOrder, lockOrder,
        createQuote, updateQuote, deleteQuote, convertQuoteToOrder,
        addProduct, updateProduct, adjustStock,
        addPartner, updatePartner, deletePartner,
        createImportOrder, updateImportStatus, addReceivingNote,
        addDeliveryNote, updateDeliveryNoteStatus, finalizeOrderWithDelivery,
        addManualTransaction, deleteTransaction, addPaymentToDebt,
        returnOrder, addPurchaseReturnNote
    };
};
