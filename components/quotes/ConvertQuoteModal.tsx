
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { Quote, Partner } from '../../types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Primitives';
import { FormField, NumericInput, FormSelect, FormInput } from '../ui/Form';
import { formatCurrency, removeVietnameseTones } from '../../utils/helpers';
import { useApp as useAppContext } from '../../hooks/useApp';

interface ConvertQuoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    quote: Quote;
    onConfirm: (params: { mode: 'reserve' | 'immediate', amountPaid: number, method: string, customerId?: string }) => Promise<void>;
}

export const ConvertQuoteModal: React.FC<ConvertQuoteModalProps> = ({ isOpen, onClose, quote, onConfirm }) => {
    const { showNotification } = useAppContext();
    const [mode, setMode] = useState<'reserve' | 'immediate'>('reserve');
    const [amountPaid, setAmountPaid] = useState(0);
    const [method, setMethod] = useState('transfer');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Customer Selection (If missing)
    const [customerId, setCustomerId] = useState(quote.customerId || '');
    const [customerSearch, setCustomerSearch] = useState('');
    const [isCustDropdownOpen, setIsCustDropdownOpen] = useState(false);
    const custInputRef = useRef<HTMLInputElement>(null);

    const partners = useLiveQuery(() => db.partners.filter(p => !p.isDeleted).toArray()) || [];

    useEffect(() => {
        if (isOpen) {
            setMode('reserve');
            setAmountPaid(0); 
            setMethod('transfer');
            setCustomerId(quote.customerId || '');
            setCustomerSearch('');
        }
    }, [isOpen, quote]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (custInputRef.current && !custInputRef.current.contains(event.target as Node)) {
                setIsCustDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredCustomers = useMemo(() => {
        if (!customerSearch) return partners.slice(0, 5);
        const norm = removeVietnameseTones(customerSearch);
        return partners.filter(p => 
            p.type === 'Customer' && 
            (removeVietnameseTones(p.name).includes(norm) || p.phone.includes(customerSearch))
        ).slice(0, 5);
    }, [customerSearch, partners]);

    const remaining = quote.total - amountPaid;
    const isDebt = remaining > 0;
    
    const handleSubmit = async () => {
        if (isDebt && !customerId) {
            showNotification('Đơn nợ bắt buộc phải có thông tin Khách hàng (đã lưu). Vui lòng chọn khách hàng.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await onConfirm({
                mode,
                amountPaid,
                method,
                customerId: customerId || undefined
            });
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Chốt Đơn Hàng"
            subtitle={`Từ báo giá: ${quote.code}`}
            size="md"
            footer={
                <div className="flex gap-3 w-full">
                    <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                    <Button 
                        variant="primary" 
                        onClick={handleSubmit} 
                        loading={isSubmitting} 
                        icon="shopping_cart_checkout"
                        className="bg-emerald-600 shadow-lg shadow-emerald-600/20 px-6"
                    >
                        Tạo đơn hàng
                    </Button>
                </div>
            }
        >
            <div className="space-y-6">
                {/* 1. Fulfillment Mode */}
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Phương án xử lý hàng hóa</label>
                    <div className="grid grid-cols-1 gap-3">
                        <div 
                            onClick={() => setMode('reserve')}
                            className={`cursor-pointer p-3 rounded-xl border-2 flex items-center gap-3 transition-all ${mode === 'reserve' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent bg-white dark:bg-slate-800 hover:border-slate-200'}`}
                        >
                            <div className={`size-5 rounded-full border-2 flex items-center justify-center ${mode === 'reserve' ? 'border-blue-500' : 'border-slate-300'}`}>
                                {mode === 'reserve' && <div className="size-2.5 rounded-full bg-blue-500" />}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-slate-900 dark:text-white">Giữ hàng & Giao sau (Processing)</p>
                                <p className="text-[10px] text-slate-500">Tạo đơn hàng, giữ chỗ tồn kho (Stock Reserved). Phù hợp B2B.</p>
                            </div>
                        </div>

                        <div 
                            onClick={() => setMode('immediate')}
                            className={`cursor-pointer p-3 rounded-xl border-2 flex items-center gap-3 transition-all ${mode === 'immediate' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-transparent bg-white dark:bg-slate-800 hover:border-slate-200'}`}
                        >
                            <div className={`size-5 rounded-full border-2 flex items-center justify-center ${mode === 'immediate' ? 'border-emerald-500' : 'border-slate-300'}`}>
                                {mode === 'immediate' && <div className="size-2.5 rounded-full bg-emerald-500" />}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-slate-900 dark:text-white">Xuất kho & Giao ngay (Completed)</p>
                                <p className="text-[10px] text-slate-500">Trừ tồn kho ngay lập tức. Phù hợp bán tại quầy.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Customer Select (If missing) */}
                {!quote.customerId && (
                    <div className="relative" ref={custInputRef}>
                        <FormField label="Khách hàng (Bắt buộc nếu ghi nợ)" required>
                            <FormInput 
                                value={customerSearch} 
                                onChange={e => { setCustomerSearch(e.target.value); setIsCustDropdownOpen(true); }}
                                onFocus={() => setIsCustDropdownOpen(true)}
                                placeholder="Tìm khách hàng để liên kết..."
                                className={`h-11 ${customerId ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-bold' : ''}`}
                            />
                        </FormField>
                        {isCustDropdownOpen && (
                            <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden max-h-48 overflow-y-auto custom-scrollbar">
                                {filteredCustomers.map(p => (
                                    <div 
                                        key={p.id} 
                                        onClick={() => { setCustomerId(p.id); setCustomerSearch(p.name); setIsCustDropdownOpen(false); }}
                                        className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-0"
                                    >
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{p.name}</p>
                                        <p className="text-[10px] text-slate-400">{p.phone}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 3. Payment */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Thanh toán (Tổng: {formatCurrency(quote.total)})</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Số tiền trả trước/cọc">
                            <NumericInput 
                                value={amountPaid} 
                                onChange={setAmountPaid} 
                                className={`font-black text-emerald-600 ${amountPaid > quote.total ? 'text-red-500' : ''}`}
                            />
                        </FormField>
                        <FormField label="Hình thức">
                            <FormSelect value={method} onChange={e => setMethod(e.target.value)}>
                                <option value="transfer">Chuyển khoản</option>
                                <option value="cash">Tiền mặt</option>
                                <option value="card">Thẻ</option>
                            </FormSelect>
                        </FormField>
                    </div>

                    {/* Debt Warning */}
                    {isDebt && (
                        <div className={`p-3 rounded-xl text-xs font-bold flex items-start gap-2 ${!customerId ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-orange-50 text-orange-700 border border-orange-100'}`}>
                            <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">{!customerId ? 'block' : 'warning'}</span>
                            <div>
                                <p>Công nợ: {formatCurrency(remaining)}</p>
                                {!customerId && <p className="font-black mt-1">LỖI: Chưa chọn Khách Hàng. Không thể ghi nợ.</p>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};
