
import { db } from '../db';
import { Transaction, AppSettings } from '../../types';
import { generateUUID, getCurrentDate } from '../../utils/helpers';
import { logAudit } from '../audit';

const log = async (entityId: string, action: any, summary: string, user: {id: string, name: string}, refCode?: string) => {
    await logAudit({
        module: 'Transactions', entityType: 'Transaction', entityId, action, summary, refCode,
        actor: user
    });
};

const validateLockDate = (date: string, settings: AppSettings) => {
    if (settings.finance.lockDate && date <= settings.finance.lockDate) {
        throw new Error(`Kỳ kế toán đã khóa sổ đến ngày ${settings.finance.lockDate}. Không thể thay đổi dữ liệu.`);
    }
};

export const addManualTransactionService = async (
    txn: any, 
    settings: AppSettings,
    user: {id: string, name: string}
) => {
    validateLockDate(txn.date, settings);

    const id = generateUUID('txn');
    await db.transactions.add({ 
        ...txn, 
        id, 
        createdAt: Date.now(), 
        updatedAt: Date.now() 
    });
    
    await log(id, 'Create', `Ghi sổ: ${txn.amount} (${txn.type})`, user);
    return id;
};

export const deleteTransactionService = async (
    id: string, 
    settings: AppSettings,
    user: {id: string, name: string}
) => {
    const txn = await db.transactions.get(id);
    if (!txn) return;

    validateLockDate(txn.date, settings);

    await db.transactions.delete(id);
    await log(id, 'Delete', `Xóa giao dịch ${txn.amount}`, user);
};

export const addPaymentToDebtService = async (
    debtId: string, 
    payment: any, 
    settings: AppSettings,
    user: {id: string, name: string}
) => {
    validateLockDate(payment.date, settings);

    await (db as any).transaction('rw', [db.debtRecords, db.transactions, db.partners, db.orders], async (tx: any) => {
        const debt = await tx.debtRecords.get(debtId);
        if (!debt) throw new Error("Debt not found");

        const newRemaining = Math.max(0, debt.remainingAmount - payment.amount);
        const newStatus = newRemaining <= 0 ? 'Paid' : 'Partial';
        
        // 1. Update Debt Record
        const payments = debt.payments || [];
        payments.push({ ...payment, id: generateUUID('pay') });
        
        await tx.debtRecords.update(debtId, { 
            remainingAmount: newRemaining, 
            status: newStatus,
            payments,
            updatedAt: Date.now()
        });

        // 2. Update Partner Balance
        const partner = await tx.partners.get(debt.partnerId);
        if (partner) {
            const currentDebt = partner.debt || 0;
            await tx.partners.update(debt.partnerId, { debt: Math.max(0, currentDebt - payment.amount) });
        }

        // 3. Create Transaction
        const type = debt.type === 'Receivable' ? 'income' : 'expense';
        const cat = debt.type === 'Receivable' ? 'debt_collection' : 'debt_payment';
        
        await tx.transactions.add({
            id: generateUUID('txn'),
            date: payment.date || getCurrentDate(),
            type,
            category: cat,
            amount: payment.amount,
            method: payment.method,
            description: payment.notes || `Thanh toán công nợ ${debt.orderCode}`,
            referenceCode: debt.orderCode,
            partnerName: debt.partnerName,
            createdAt: Date.now(),
            updatedAt: Date.now()
        } as Transaction);

        // 4. Sync Order Status (Smart Sync)
        if (debt.orderCode) {
            const order = await tx.orders.where('code').equals(debt.orderCode).first();
            if (order) {
                const currentPaid = order.amountPaid || 0;
                const newAmountPaid = currentPaid + payment.amount;
                
                let newPaymentStatus = order.paymentStatus;
                if (newAmountPaid >= order.total) newPaymentStatus = 'Paid';
                else if (newAmountPaid > 0) newPaymentStatus = 'Partial';

                // LOGIC: Only Complete if Paid AND Delivered
                let newStatus = order.status;
                if (newPaymentStatus === 'Paid' && order.fulfillmentStatus === 'Delivered') {
                    newStatus = 'Completed';
                }

                await tx.orders.update(order.id, {
                    amountPaid: newAmountPaid,
                    paymentStatus: newPaymentStatus,
                    status: newStatus,
                    updatedAt: Date.now()
                });
            }
        }
    });
    
    await logAudit({
        module: 'Debts', entityType: 'Debt', entityId: debtId, action: 'Payment', 
        summary: `Thanh toán: ${payment.amount}`, actor: user
    });
};
