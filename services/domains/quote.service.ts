
import { db } from '../db';
import { Quote, Order, AppSettings } from '../../types';
import { generateUUID, getCurrentDate } from '../../utils/helpers';
import { logAudit } from '../audit';
import { createOrderService } from './order.service';

const log = async (entityId: string, action: any, summary: string, user: {id: string, name: string}, refCode?: string) => {
    await logAudit({
        module: 'Quotes', entityType: 'Quote', entityId, action, summary, refCode,
        actor: user
    });
};

export const createQuoteService = async (
    quoteData: Partial<Quote>, 
    user: {id: string, name: string}
) => {
    const id = generateUUID('qt');
    const quote = { 
        ...quoteData, 
        id, 
        // FIX: Use the status passed from UI (e.g., 'Sent'), fallback to 'Draft' only if undefined
        status: quoteData.status || 'Draft',
        createdAt: Date.now(), 
        updatedAt: Date.now() 
    } as Quote;

    await db.quotes.add(quote);
    await log(id, 'Create', `Tạo báo giá ${quote.code}`, user, quote.code);
    return id;
};

export const updateQuoteService = async (
    quote: Partial<Quote>, 
    user: {id: string, name: string}
) => {
    if (!quote.id) throw new Error("Quote ID is required");
    
    // 1. Snapshot Locking Check
    const existing = await db.quotes.get(quote.id);
    if (!existing) throw new Error("Quote not found");

    if (['Accepted', 'Converted'].includes(existing.status) && existing.status !== quote.status) {
        // Allow status change but prevent content editing if already locked
        // But if trying to edit content on Accepted quote:
        const criticalFields = ['items', 'total', 'discount', 'subtotal'];
        const hasCriticalChanges = criticalFields.some(k => JSON.stringify((quote as any)[k]) !== JSON.stringify((existing as any)[k]));
        
        if (hasCriticalChanges) {
            throw new Error("Báo giá đã được khách chốt. Không thể chỉnh sửa nội dung. Vui lòng tạo bản sao mới.");
        }
    }

    if (existing.convertedOrderId) {
         throw new Error("Báo giá đã chuyển thành đơn hàng. Không thể chỉnh sửa.");
    }

    await db.quotes.update(quote.id, { ...quote, updatedAt: Date.now() });
    await log(quote.id, 'Update', `Cập nhật báo giá ${existing.code}`, user, existing.code);
};

export const convertQuoteToOrderService = async (
    quoteId: string,
    params: { customerId?: string, amountPaid: number, method: string, mode: 'immediate' | 'reserve' },
    settings: AppSettings,
    user: {id: string, name: string}
) => {
    const quote = await db.quotes.get(quoteId);
    if (!quote) throw new Error('Quote not found');
    
    // 2. Strict 1-1 Conversion Check
    if (quote.convertedOrderId) {
        throw new Error(`Báo giá này đã được chuyển thành đơn hàng (ID: ${quote.convertedOrderId}) trước đó.`);
    }

    const orderData: Partial<Order> = {
        customerName: quote.customerName,
        phone: quote.phone,
        address: quote.address,
        taxId: quote.taxId,
        partnerId: params.customerId || quote.customerId,
        // Reset delivered quantity for new order
        items: quote.items.map(i => ({...i, deliveredQuantity: 0})),
        subtotal: quote.subtotal,
        discount: quote.discount,
        vatRate: quote.vatRate,
        vatAmount: quote.vatAmount,
        total: quote.total,
        amountPaid: params.amountPaid || 0,
        paymentMethod: params.method as any,
        status: params.mode === 'immediate' ? 'Completed' : 'Processing',
        quoteId: quoteId,
        notes: quote.notes ? `[Từ Báo Giá: ${quote.code}] ${quote.notes}` : `[Từ Báo Giá: ${quote.code}]`
    };

    // Use existing robust order creation service (handles inventory reservation/deduction)
    const newOrder = await createOrderService(orderData, settings, user);
    
    // 3. Lock the Quote
    await db.quotes.update(quoteId, { 
        status: 'Accepted', 
        convertedOrderId: newOrder.id,
        updatedAt: Date.now()
    });
    
    await log(quoteId, 'Convert', `Chốt đơn thành công: ${newOrder.code}`, user, quote.code);
    return newOrder;
};
