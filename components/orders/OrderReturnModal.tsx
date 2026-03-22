
import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Primitives';
import { FormField, FormInput, FormSelect, FormTextarea, NumericInput } from '../ui/Form';
import { InlineNumberEdit } from '../ui/InlineNumberEdit';
import { formatCurrency, getCurrentDate } from '../../utils/helpers';
import { Order } from '../../types';

interface OrderReturnModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order | null;
    onSubmit: (params: any) => Promise<void>;
}

export const OrderReturnModal: React.FC<OrderReturnModalProps> = ({ isOpen, onClose, order, onSubmit }) => {
    const [returnItems, setReturnItems] = useState<Record<string, number>>({});
    const [date, setDate] = useState(getCurrentDate());
    const [notes, setNotes] = useState('');
    const [refundMethod, setRefundMethod] = useState('cash');
    const [restock, setRestock] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch return history for this order to calculate remaining returnable quantities
    const returnHistory = useLiveQuery(() => 
        order ? db.returnNotes.where('orderCode').equals(order.code).toArray() : []
    , [order?.code]);

    // Calculate previously returned quantity per item
    const returnedMap = useMemo(() => {
        const map: Record<string, number> = {};
        if (returnHistory) {
            returnHistory.forEach(note => {
                note.items.forEach((item: any) => {
                    map[item.id] = (map[item.id] || 0) + item.quantity;
                });
            });
        }
        return map;
    }, [returnHistory]);

    useEffect(() => {
        if (isOpen && order) {
            setDate(getCurrentDate());
            setNotes('');
            setRefundMethod('cash');
            setRestock(true);
            setReturnItems({});
        }
    }, [isOpen, order]);

    const handleQuantityChange = (itemId: string, qty: number, max: number) => {
        const validQty = Math.min(Math.max(0, qty), max);
        setReturnItems(prev => ({
            ...prev,
            [itemId]: validQty
        }));
    };

    // --- PROPORTIONAL CALCULATION LOGIC ---
    const refundStats = useMemo(() => {
        if (!order) return { subtotal: 0, discountShare: 0, vatShare: 0, totalRefund: 0 };

        let returnSubtotal = 0;
        
        // 1. Calculate Subtotal of returned items
        order.items.forEach(item => {
            const qty = returnItems[item.id] || 0;
            if (qty > 0) {
                returnSubtotal += qty * item.price;
            }
        });

        // 2. Calculate Order-level Ratios
        // Avoid division by zero
        const orderSubtotal = order.subtotal > 0 ? order.subtotal : 1; 
        const ratio = returnSubtotal / orderSubtotal;

        // 3. Allocate Discount & VAT
        const discountShare = (order.discount || 0) * ratio;
        const netAfterDiscount = returnSubtotal - discountShare;
        const vatShare = netAfterDiscount * ((order.vatRate || 0) / 100);
        
        // 4. Final Total
        // Ensure we don't go below zero (edge case with huge discounts)
        const totalRefund = Math.max(0, netAfterDiscount + vatShare);

        return {
            subtotal: returnSubtotal,
            discountShare,
            vatShare,
            totalRefund
        };
    }, [order, returnItems]);

    const handleSubmit = async () => {
        if (!order) return;
        
        const itemsToReturn = order.items
            .filter(item => (returnItems[item.id] || 0) > 0)
            .map(item => {
                const qty = returnItems[item.id];
                const previouslyReturned = returnedMap[item.id] || 0;
                const totalQty = item.deliveredQuantity || item.quantity;
                const maxReturnable = Math.max(0, totalQty - previouslyReturned);
                const finalQty = Math.min(qty, maxReturnable);

                return {
                    id: item.id,
                    name: item.productName,
                    price: item.price,
                    quantity: finalQty
                };
            })
            .filter(i => i.quantity > 0);

        if (itemsToReturn.length === 0) return;

        setIsSubmitting(true);
        try {
            await onSubmit({
                order,
                items: itemsToReturn,
                refundAmount: Math.round(refundStats.totalRefund), // Round to avoid float issues
                method: refundMethod,
                restock,
                notes,
                date
            });
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!order) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Trả Hàng - ${order.code}`}
            size="2xl"
            footer={
                <div className="flex justify-between items-center w-full">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Thực hoàn (Sau CK & VAT)</span>
                        <span className="text-xl font-black text-rose-600">{formatCurrency(refundStats.totalRefund)}</span>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                        <Button 
                            variant="danger" 
                            onClick={handleSubmit} 
                            loading={isSubmitting} 
                            disabled={refundStats.totalRefund === 0}
                            icon="keyboard_return"
                        >
                            Xác nhận trả hàng
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-200 dark:border-slate-800">
                            <tr>
                                <th className="px-4 py-3">Sản phẩm</th>
                                <th className="px-2 py-3 text-center w-24">Đã trả / Tổng</th>
                                <th className="px-2 py-3 text-center w-24">SL Trả</th>
                                <th className="px-4 py-3 text-right">Giá trị trả</th>
                                <th className="px-4 py-3 text-right text-slate-400">Trừ CK</th>
                                <th className="px-4 py-3 text-right text-slate-400">+VAT</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {order.items.map(item => {
                                const returnQty = returnItems[item.id] || 0;
                                const previouslyReturned = returnedMap[item.id] || 0;
                                const totalQty = item.deliveredQuantity || item.quantity;
                                const maxReturnable = Math.max(0, totalQty - previouslyReturned);
                                
                                // Item specific calc for UI visualization (approximate)
                                const itemTotal = returnQty * item.price;
                                const itemRatio = order.subtotal > 0 ? itemTotal / order.subtotal : 0;
                                const itemDiscount = (order.discount || 0) * itemRatio;
                                const itemVat = (itemTotal - itemDiscount) * ((order.vatRate || 0) / 100);

                                return (
                                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-4 py-3">
                                            <p className="font-bold text-slate-800 dark:text-white truncate max-w-[180px]">{item.productName}</p>
                                            <p className="text-[10px] text-slate-400 font-bold">{formatCurrency(item.price)}</p>
                                        </td>
                                        <td className="px-2 py-3 text-center">
                                            <span className={`text-xs font-bold ${maxReturnable === 0 ? 'text-slate-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                                {previouslyReturned} <span className="text-slate-300 mx-1">/</span> {totalQty}
                                            </span>
                                        </td>
                                        <td className="px-2 py-3">
                                            <InlineNumberEdit 
                                                value={returnQty} 
                                                onChange={v => handleQuantityChange(item.id, v, maxReturnable)}
                                                min={0}
                                                max={maxReturnable}
                                                align="center"
                                                disabled={maxReturnable === 0}
                                                className={`border rounded-lg font-bold ${returnQty > 0 ? 'bg-rose-50 border-rose-200 text-rose-600' : maxReturnable === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-slate-700">
                                            {returnQty > 0 ? formatCurrency(itemTotal).replace(' VND','') : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-xs text-rose-500 font-medium">
                                            {returnQty > 0 && itemDiscount > 0 ? `-${formatCurrency(itemDiscount).replace(' VND','')}` : ''}
                                        </td>
                                        <td className="px-4 py-3 text-right text-xs text-blue-500 font-medium">
                                            {returnQty > 0 && itemVat > 0 ? `+${formatCurrency(itemVat).replace(' VND','')}` : ''}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
                            <tr>
                                <td colSpan={3} className="px-4 py-2 text-right text-[10px] font-black uppercase text-slate-500">Tổng cộng</td>
                                <td className="px-4 py-2 text-right font-bold text-slate-900">{formatCurrency(refundStats.subtotal).replace(' VND','')}</td>
                                <td className="px-4 py-2 text-right font-bold text-rose-600">-{formatCurrency(refundStats.discountShare).replace(' VND','')}</td>
                                <td className="px-4 py-2 text-right font-bold text-blue-600">+{formatCurrency(refundStats.vatShare).replace(' VND','')}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <FormField label="Ngày trả hàng">
                            <FormInput type="date" value={date} onChange={e => setDate(e.target.value)} />
                        </FormField>
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className={`size-5 rounded border flex items-center justify-center transition-colors ${restock ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300'}`}>
                                    {restock && <span className="material-symbols-outlined text-[14px]">check</span>}
                                </div>
                                <input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} className="hidden" />
                                <div>
                                    <span className="text-sm font-bold text-slate-700 dark:text-white group-hover:text-blue-600 transition-colors">Nhập lại kho hàng hóa</span>
                                    <p className="text-[10px] text-slate-500">Bỏ chọn nếu hàng hỏng/lỗi không thể bán lại.</p>
                                </div>
                            </label>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <FormField label="Phương thức hoàn tiền">
                            <FormSelect value={refundMethod} onChange={e => setRefundMethod(e.target.value)}>
                                <option value="cash">Tiền mặt</option>
                                <option value="transfer">Chuyển khoản</option>
                                <option value="debt_deduction">Trừ công nợ</option>
                            </FormSelect>
                        </FormField>
                        <FormField label="Lý do trả hàng">
                            <FormTextarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="VD: Hàng lỗi, khách đổi ý..." />
                        </FormField>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
