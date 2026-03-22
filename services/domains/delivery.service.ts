
import { db } from '../db';
import { DeliveryNote, DeliveryStatus, Order, OrderStatus, FulfillmentStatus, AppSettings } from '../../types';
import { generateUUID, getCurrentDate, calcAvailableStock } from '../../utils/helpers';
import { logAudit } from '../audit';

const log = async (entityId: string, action: any, summary: string, user: {id: string, name: string}, refCode?: string) => {
    await logAudit({
        module: 'Delivery', entityType: 'Delivery', entityId, action, summary, refCode,
        actor: user
    });
};

export const updateDeliveryNoteStatusService = async (
    id: string, 
    status: DeliveryStatus, 
    user: {id: string, name: string},
    settings?: AppSettings
) => {
    await (db as any).transaction('rw', [db.deliveryNotes, db.orders, db.products, db.inventoryLogs, db.auditLogs], async (tx: any) => {
        const note = await tx.deliveryNotes.get(id);
        if (!note) throw new Error("Phiếu giao hàng không tồn tại");

        if (note.status === status) return;

        // Invariant: Cannot un-deliver without a Return
        if (note.status === 'Delivered' && status !== 'Delivered') {
            throw new Error("Phiếu đã giao thành công không thể đổi trạng thái. Vui lòng tạo phiếu trả hàng.");
        }

        if (status === 'Delivered') {
            // Attempt to find the linked order
            const order = await tx.orders.where('code').equals(note.orderCode).first();
            
            // --- SCENARIO A: LINKED STANDARD ORDER ---
            if (order) {
                if (order.lockedAt) throw new Error(`Đơn hàng ${order.code} đã khóa.`);

                // Check if Order is already Completed (Inventory already committed?)
                const isStockAlreadyCommitted = order.status === 'Completed';

                // 1. Validate Over-delivery & Stock
                for (const item of note.items) {
                    if (item.quantity <= 0) continue;

                    const orderItem = order.items.find((oi: any) => oi.sku === item.sku || oi.id === item.id);
                    if (orderItem) {
                        const currentDelivered = orderItem.deliveredQuantity || 0;
                        if (currentDelivered + item.quantity > orderItem.quantity) {
                            throw new Error(`Sản phẩm ${item.productName} giao vượt quá số lượng đặt.`);
                        }
                    }

                    if (!isStockAlreadyCommitted && settings?.system?.preventNegativeStock) {
                        const product = await tx.products.get(item.id || item.productId);
                        if (product && product.stock < item.quantity) {
                            throw new Error(`Sản phẩm ${product.sku} không đủ tồn kho (Còn: ${product.stock}).`);
                        }
                    }
                }

                // 2. Commit Inventory (if not already done via Order Complete)
                if (!isStockAlreadyCommitted) {
                    for (const item of note.items) {
                        const product = await tx.products.get(item.id || item.productId);
                        if (product) {
                            const shippedQty = item.quantity;
                            
                            // Correctly transition from Reserved -> Real Deduction
                            const newStock = product.stock - shippedQty;
                            // Release reservation for this specific shipped amount
                            const newReserved = Math.max(0, (product.stockReserved || 0) - shippedQty);

                            await tx.products.update(product.id, { 
                                stock: newStock, 
                                stockReserved: newReserved,
                                updatedAt: Date.now() 
                            });

                            await tx.inventoryLogs.add({
                                id: generateUUID('log'), productId: product.id, sku: product.sku, productName: product.name,
                                type: 'delivery_commit', changeAmount: -shippedQty, oldStock: product.stock, newStock: newStock,
                                date: getCurrentDate(), timestamp: Date.now(), referenceCode: note.code, 
                                note: `Giao hàng theo đơn (${note.orderCode})`, createdAt: Date.now()
                            });
                        }
                    }
                }

                // 3. Update Order Delivered Quantity
                const updatedItems = order.items.map((ordItem: any) => {
                    const deliveredItem = note.items.find((ni: any) => ni.sku === ordItem.sku || ni.id === ordItem.id);
                    if (deliveredItem) {
                        return { 
                            ...ordItem, 
                            deliveredQuantity: (ordItem.deliveredQuantity || 0) + deliveredItem.quantity 
                        };
                    }
                    return ordItem;
                });

                // 4. Update Order Status (Smart Sync Logic)
                const isFullyDelivered = updatedItems.every((i: any) => (i.deliveredQuantity || 0) >= i.quantity);
                const isPartiallyDelivered = updatedItems.some((i: any) => (i.deliveredQuantity || 0) > 0);

                let newOrderStatus: OrderStatus = order.status;
                let newFulfillment: FulfillmentStatus = order.fulfillmentStatus;

                if (isFullyDelivered) {
                    newFulfillment = 'Delivered';
                    // LOGIC: Complete only if Paid AND Delivered
                    if (order.paymentStatus === 'Paid') {
                        newOrderStatus = 'Completed';
                    } else {
                        // FIX: If delivered but not paid, move out of 'Processing'.
                        // 'Shipping' status implies goods have left or are in transit, 
                        // which is better than 'Processing' (Packing).
                        if (newOrderStatus === 'Processing') {
                            newOrderStatus = 'Shipping';
                        }
                    }
                } else if (isPartiallyDelivered) {
                    newFulfillment = 'Shipped';
                    newOrderStatus = 'PartiallyShipped';
                } else {
                    // Fallback (rarely reached in this flow)
                    newFulfillment = 'Shipped';
                }

                await tx.orders.update(order.id, {
                    items: updatedItems,
                    status: newOrderStatus,
                    fulfillmentStatus: newFulfillment,
                    updatedAt: Date.now()
                });
            } 
            // --- SCENARIO B: MANUAL DELIVERY (GIAO LẺ / NO ORDER) ---
            else {
                // 1. Validate Stock
                if (settings?.system?.preventNegativeStock) {
                    for (const item of note.items) {
                        const product = await tx.products.get(item.id || item.productId);
                        if (product && product.stock < item.quantity) {
                            throw new Error(`Sản phẩm ${product.sku} không đủ tồn kho (Còn: ${product.stock}).`);
                        }
                    }
                }

                // 2. Commit Inventory
                for (const item of note.items) {
                    const product = await tx.products.get(item.id || item.productId);
                    if (product) {
                        const shippedQty = item.quantity;
                        const newStock = product.stock - shippedQty;
                        
                        await tx.products.update(product.id, { 
                            stock: newStock,
                            updatedAt: Date.now() 
                        });

                        await tx.inventoryLogs.add({
                            id: generateUUID('log'), productId: product.id, sku: product.sku, productName: product.name,
                            type: 'sale', 
                            changeAmount: -shippedQty, oldStock: product.stock, newStock: newStock,
                            date: getCurrentDate(), timestamp: Date.now(), referenceCode: note.code, 
                            note: `Giao lẻ ngoài đơn (${note.code})`, createdAt: Date.now()
                        });
                    }
                }
            }
        }

        await tx.deliveryNotes.update(id, { status, updatedAt: Date.now() });
    });

    await log(id, 'StatusChange', `Cập nhật trạng thái phiếu giao: ${status}`, user, id);
};
