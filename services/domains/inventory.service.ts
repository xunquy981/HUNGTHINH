
import { db } from '../db';
import { generateUUID, safeRound, formatDateISO, addDays, parseISOToDate } from '../../utils/helpers';
import { logAudit } from '../audit';

// Helper for log
const log = async (module: any, entityType: string, entityId: string, action: any, summary: string, user: {id: string, name: string}) => {
    await logAudit({
        module, entityType, entityId, action, summary,
        actor: user
    });
};

export const addReceivingNoteService = async (
    importId: string, 
    items: any[], 
    meta: any, 
    extraCost: number,
    user: {id: string, name: string}
) => {
    await (db as any).transaction('rw', [db.importOrders, db.products, db.inventoryLogs, db.receivingNotes, db.auditLogs, db.debtRecords, db.partners, db.settings], async () => {
        const impOrder = await db.importOrders.get(importId);
        if (!impOrder) throw new Error("Import order not found");
        
        const recId = generateUUID('rec');
        const recCode = `RN-${Date.now().toString().slice(-6)}`;
        
        await db.receivingNotes.add({
            id: recId, code: recCode, importCode: impOrder.code, 
            date: meta.date, items, totalLandedCost: extraCost,
            supplierName: impOrder.supplierName, createdAt: Date.now(), updatedAt: Date.now()
        } as any);

        const updatedItems = impOrder.items.map((item: any) => {
            const received = items.find((ri: any) => ri.id === item.id);
            if (received) return { ...item, receivedQuantity: (item.receivedQuantity || 0) + received.quantity };
            return item;
        });
        
        const allReceived = updatedItems.every((i: any) => (i.receivedQuantity || 0) >= i.quantity);
        
        // Update Order Totals
        const currentTotal = impOrder.total || 0;
        const newTotal = currentTotal + extraCost;
        const newExtraCosts = (impOrder.extraCosts || 0) + extraCost;

        await db.importOrders.update(importId, { 
            items: updatedItems, 
            status: allReceived ? 'Completed' : 'Receiving', 
            extraCosts: newExtraCosts,
            total: newTotal, // Ensure Total reflects extra costs
            updatedAt: Date.now() 
        });

        // --- FIX: DEBT CREATION/UPDATE ON RECEIVING ---
        if (impOrder.supplierId) {
            const existingDebt = await db.debtRecords.where('orderCode').equals(impOrder.code).first();
            
            // Calculate Due Date based on Settings
            const settings = await db.settings.get('app_settings');
            const dueDays = settings?.value?.system?.debtDueDays || 30;
            const receiveDate = parseISOToDate(meta.date) || new Date();
            const dueDate = formatDateISO(addDays(receiveDate, dueDays));

            if (!existingDebt) {
                const paid = impOrder.amountPaid || 0;
                
                // If debt doesn't exist (e.g. order was Pending), create it now with full value (including extraCost)
                if (paid < newTotal) {
                    await db.debtRecords.add({
                        id: generateUUID('debt'), partnerId: impOrder.supplierId, partnerName: impOrder.supplierName || 'NCC',
                        orderCode: impOrder.code, issueDate: meta.date,
                        dueDate: dueDate,
                        totalAmount: newTotal, remainingAmount: newTotal - paid, status: 'Pending', type: 'Payable',
                        createdAt: Date.now(), updatedAt: Date.now()
                    } as any);

                    const supplier = await db.partners.get(impOrder.supplierId);
                    if (supplier) await db.partners.update(impOrder.supplierId, { debt: (supplier.debt || 0) + (newTotal - paid) });
                }
            } else {
                // If debt exists, add the extraCost to it
                if (extraCost > 0) {
                    const debtTotal = existingDebt.totalAmount + extraCost;
                    const debtRemaining = existingDebt.remainingAmount + extraCost;
                    // Reactivate debt if it was fully paid but now owes more
                    const newStatus = (debtRemaining > 0 && existingDebt.status === 'Paid') ? 'Partial' : existingDebt.status;

                    await db.debtRecords.update(existingDebt.id, { 
                        totalAmount: debtTotal, 
                        remainingAmount: debtRemaining,
                        status: newStatus,
                        updatedAt: Date.now() 
                    });
                    const supplier = await db.partners.get(impOrder.supplierId);
                    if (supplier) await db.partners.update(impOrder.supplierId, { debt: (supplier.debt || 0) + extraCost });
                }
            }
        }
        // -----------------------------------------------------

        const totalReceivedQty = items.reduce((s: number, i: any) => s + i.quantity, 0);
        const allocatedExtraPerUnit = totalReceivedQty > 0 ? (extraCost / totalReceivedQty) : 0;

        for (const ri of items) {
            const product = await db.products.get(ri.id);
            if (!product) continue;

            const poItem = impOrder.items.find((i: any) => i.id === ri.id);
            const purchasePrice = poItem ? poItem.price : product.importPrice; 
            const actualUnitCost = purchasePrice + allocatedExtraPerUnit;

            const oldStock = product.stock;
            const oldAvgCost = product.importPrice || 0;
            const receivedQty = ri.quantity;
            const newStock = oldStock + receivedQty;

            let newAvgCost = oldAvgCost;
            
            // Standard Weighted Average Costing (MAC)
            if (oldStock < 0) {
                // Reset negative stock basis to current market price
                newAvgCost = actualUnitCost;
            } else if (newStock > 0) {
                const totalOldValue = oldStock * oldAvgCost; 
                const totalNewValue = receivedQty * actualUnitCost;
                newAvgCost = (totalOldValue + totalNewValue) / newStock;
            } else {
                newAvgCost = actualUnitCost;
            }
            
            newAvgCost = Math.max(0, safeRound(newAvgCost));

            await db.products.update(ri.id, { 
                stock: newStock, 
                importPrice: newAvgCost,
                updatedAt: Date.now() 
            });

            await db.inventoryLogs.add({
                id: generateUUID('log'), productId: ri.id, sku: product.sku, productName: product.name,
                type: 'import_receive', changeAmount: receivedQty, oldStock, newStock,
                note: `Nhập ${recCode}. ${meta.notes ? `(${meta.notes})` : ''}`,
                date: meta.date, timestamp: Date.now(), referenceCode: recCode, createdAt: Date.now()
            } as any);
        }
    });
    await log('Imports', 'Import', importId, 'Update', 'Nhập kho hàng về (Receiving)', user);
};
