
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { Quote, QuoteItem, Partner, Product, PartnerType } from '../types';
import { useDomainServices } from '../hooks/useDomainServices';
import { useNotification } from '../contexts/NotificationContext';
import { useSettings } from '../contexts/SettingsContext';
import { formatCurrency, removeVietnameseTones, getCurrentDate, addDays, formatDateISO, calcAvailableStock } from '../utils/helpers';
import { Button } from './ui/Primitives';
import { Modal } from './ui/Modal';
import { FormField, FormInput, FormSelect, FormTextarea } from './ui/Form';
import { InlineNumberEdit } from './ui/InlineNumberEdit';
import { PrintPreviewModal as GenericPrintModal } from './print/PrintPreviewModal';

const toInputDate = (dateStr: string) => {
    if (!dateStr) return new Date().toISOString().slice(0, 10);
    // Prefer ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    // Fallback Legacy DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    // Fallback parser
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
};

interface CreateQuoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'create' | 'edit';
    initialData?: Quote | null;
}

export const CreateQuoteModal: React.FC<CreateQuoteModalProps> = ({ isOpen, onClose, mode, initialData }) => {
    const { createQuote, updateQuote } = useDomainServices();
    const { showNotification } = useNotification();
    const { settings } = useSettings();

    // Data source
    const products = useLiveQuery(() => db.products.filter(p => !p.isDeleted).toArray()) || [];
    const partners = useLiveQuery(() => db.partners.filter(p => !p.isDeleted).toArray()) || [];

    // Form states
    const [code, setCode] = useState('');
    const [customer, setSelectedCustomer] = useState<Partner | null>(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [isCustDropdownOpen, setIsCustDropdownOpen] = useState(false);
    
    const [date, setDate] = useState(getCurrentDate());
    const [validUntil, setValidUntil] = useState(formatDateISO(addDays(new Date(), 7)));
    const [items, setItems] = useState<QuoteItem[]>([]);
    const [discount, setDiscount] = useState(0);
    const [vatRate, setVatRate] = useState(settings?.finance?.vat || 8);
    const [notes, setNotes] = useState('');
    
    const [productSearch, setProductSearch] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const custInputRef = useRef<HTMLInputElement>(null);

    // Initial load
    useEffect(() => {
        if (isOpen) {
            if (mode === 'edit' && initialData) {
                setCode(initialData.code);
                setDate(toInputDate(initialData.date));
                setValidUntil(toInputDate(initialData.validUntil));
                setItems(initialData.items);
                setDiscount(initialData.discount);
                setVatRate(initialData.vatRate);
                setNotes(initialData.notes || '');
                setCustomerSearch(initialData.customerName);
                const foundCust = partners.find(p => p.id === initialData.customerId);
                if (foundCust) setSelectedCustomer(foundCust);
                else setSelectedCustomer(null); // Ensure no stale customer reference
            } else {
                setCode(`BG-${Date.now().toString().slice(-6)}`);
                setDate(getCurrentDate());
                setValidUntil(formatDateISO(addDays(new Date(), 7)));
                setItems([]);
                setDiscount(0);
                setVatRate(settings?.finance?.vat || 8);
                setNotes('');
                setSelectedCustomer(null);
                setCustomerSearch('');
            }
            setIsSubmitting(false);
        }
    }, [isOpen, mode, initialData, partners]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (custInputRef.current && !custInputRef.current.contains(event.target as Node)) {
                setIsCustDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filtering
    const filteredProducts = useMemo(() => {
        const norm = removeVietnameseTones(productSearch);
        return products.filter(p => 
            removeVietnameseTones(p.name).includes(norm) || 
            p.sku.toLowerCase().includes(norm)
        ).slice(0, 12);
    }, [productSearch, products]);

    const filteredCustomers = useMemo(() => {
        if (!customerSearch || customer) return [];
        const norm = removeVietnameseTones(customerSearch);
        return partners.filter(p => 
            p.type === 'Customer' && 
            (removeVietnameseTones(p.name).includes(norm) || p.phone.includes(customerSearch))
        ).slice(0, 5);
    }, [customerSearch, partners, customer]);

    // Financial logic
    const subtotal = useMemo(() => items.reduce((sum, i) => sum + i.total, 0), [items]);
    const vatAmount = useMemo(() => Math.round((subtotal - discount) * (vatRate / 100)), [subtotal, discount, vatRate]);
    const total = useMemo(() => Math.max(0, subtotal - discount + vatAmount), [subtotal, discount, vatAmount]);

    // Handlers
    const addItem = (p: Product) => {
        setItems(prevItems => {
            const existing = prevItems.find(i => i.id === p.id);
            if (existing) {
                return prevItems.map(i => i.id === p.id 
                    ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.price } 
                    : i
                );
            } else {
                return [...prevItems, {
                    id: p.id, sku: p.sku, productName: p.name, unit: p.unit || 'Cái',
                    quantity: 1, price: p.retailPrice, total: p.retailPrice, costPrice: p.importPrice
                }];
            }
        });
        showNotification(`Đã thêm ${p.sku}`, 'info');
    };

    const updateItem = (id: string, updates: Partial<QuoteItem>) => {
        setItems(items.map(i => {
            if (i.id === id) {
                const updated = { ...i, ...updates };
                // Recalculate total if quantity or price changed
                if (updates.quantity !== undefined || updates.price !== undefined) {
                    updated.total = updated.quantity * updated.price;
                }
                return updated;
            }
            return i;
        }));
    };

    const handleSubmit = async (status: 'Draft' | 'Sent') => {
        if (!customerSearch) { showNotification('Vui lòng nhập tên khách hàng', 'error'); return; }
        if (items.length === 0) { showNotification('Vui lòng chọn ít nhất 1 sản phẩm', 'error'); return; }

        setIsSubmitting(true);
        const payload = {
            code,
            customerName: customer?.name || customerSearch,
            phone: customer?.phone || '',
            address: customer?.address || '',
            taxId: customer?.taxId || '',
            date: date, // Keep ISO string for DB consistency
            validUntil: validUntil, 
            items, subtotal, discount, vatRate, vatAmount, total, notes,
            customerId: customer?.id,
            status: status,
            createdAt: initialData?.createdAt || Date.now(),
            updatedAt: Date.now()
        };

        try {
            if (mode === 'create') await createQuote(payload);
            else await updateQuote({ ...payload, id: initialData!.id });
            
            showNotification(status === 'Draft' ? 'Đã lưu nháp báo giá' : 'Đã lưu và sẵn sàng gửi khách', 'success');
            onClose();
        } catch (e: any) {
            showNotification(e.message || 'Lỗi khi lưu báo giá', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen} onClose={onClose}
            title={mode === 'create' ? 'Lập Báo Giá Mới' : 'Cập Nhật Báo Giá'}
            size="full"
            closeOnOverlay={false}
            footer={
                <div className="flex justify-between items-center w-full">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">Sếp hãy kiểm tra kỹ đơn giá trước khi gửi khách nhé!</p>
                    <div className="flex gap-3 ml-auto">
                        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Hủy bỏ</Button>
                        <Button 
                            variant="outline" 
                            onClick={() => handleSubmit('Draft')} 
                            loading={isSubmitting} 
                            icon="save" 
                            className="text-slate-600 border-slate-300 hover:bg-slate-50"
                        >
                            Lưu Nháp
                        </Button>
                        <Button 
                            variant="primary" 
                            onClick={() => handleSubmit('Sent')} 
                            loading={isSubmitting} 
                            icon="send" 
                            className="bg-purple-600 shadow-purple-600/20 px-6"
                        >
                            Lưu & Gửi
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="flex flex-col lg:flex-row h-[calc(100vh-200px)] gap-0 lg:gap-6">
                {/* 1. PRODUCT CATALOG PANEL */}
                <div className="w-full lg:w-[340px] flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 lg:rounded-2xl shrink-0 h-1/3 lg:h-full lg:shadow-sm">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 sticky top-0 z-10">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Danh mục hàng hóa</h4>
                        <div className="relative group">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 group-focus-within:text-purple-600 transition-colors">search</span>
                            <input 
                                value={productSearch} 
                                onChange={e => setProductSearch(e.target.value)} 
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 shadow-sm transition-all" 
                                placeholder="Tìm mã SKU, tên SP..." 
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-slate-50/30 dark:bg-slate-900">
                        {filteredProducts.map(p => {
                            const available = calcAvailableStock(p.stock, p.stockReserved);
                            const isCritical = available <= 0;
                            const isLow = available <= (p.minStock || 5);

                            return (
                                <div key={p.id} onClick={() => addItem(p)} className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-purple-500 hover:shadow-md transition-all group active:scale-95 flex items-center gap-3">
                                    <div className="size-10 rounded-lg bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400 group-hover:bg-purple-100 group-hover:text-purple-600 transition-colors shrink-0">
                                        <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-black text-slate-900 dark:text-white truncate uppercase tracking-tight leading-tight group-hover:text-purple-700">{p.name}</p>
                                        <div className="flex justify-between mt-1 items-end">
                                            <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">{p.sku}</span>
                                            <span className={`text-[10px] font-bold ${isCritical ? 'text-red-600 bg-red-50 px-1 rounded' : isLow ? 'text-amber-600 bg-amber-50 px-1 rounded' : 'text-emerald-600'}`}>
                                                Sẵn: {available}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 2. FORM PANEL */}
                <div className="flex-1 flex flex-col gap-6 overflow-hidden h-2/3 lg:h-full pt-4 lg:pt-0">
                    
                    {/* SECTION: HEADER INFO */}
                    <div className="grid grid-cols-12 gap-6 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm shrink-0">
                        {/* Customer Column */}
                        <div className="col-span-12 md:col-span-7">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Khách hàng / Đối tác</label>
                            <div className="relative group" ref={custInputRef}>
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                                    <span className="material-symbols-outlined text-slate-400 group-focus-within:text-purple-600">person_search</span>
                                </div>
                                <input 
                                    value={customerSearch} 
                                    onChange={e => { setCustomerSearch(e.target.value); setSelectedCustomer(null); setIsCustDropdownOpen(true); }}
                                    onFocus={() => setIsCustDropdownOpen(true)}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-bold text-slate-900 dark:text-white focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/10 transition-all outline-none"
                                    placeholder="Nhập tên hoặc số điện thoại..."
                                />
                                {customer && (
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-black uppercase pointer-events-none">
                                        <span className="material-symbols-outlined text-[12px]">check_circle</span> Đã chọn
                                    </div>
                                )}
                                {isCustDropdownOpen && filteredCustomers.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 z-[100] overflow-hidden animate-fadeIn">
                                        {filteredCustomers.map(c => (
                                            <div key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerSearch(c.name); setIsCustDropdownOpen(false); }} className="px-4 py-3 hover:bg-purple-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0 group flex justify-between items-center">
                                                <div><p className="font-black text-xs text-slate-900 dark:text-white group-hover:text-purple-700 transition-colors uppercase">{c.name}</p><p className="text-[10px] text-slate-500 font-bold mt-0.5">{c.phone} • {c.code}</p></div>
                                                <span className="material-symbols-outlined text-slate-300 opacity-0 group-hover:opacity-100 transition-all">add_circle</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Meta Info Columns */}
                        <div className="col-span-12 md:col-span-5 grid grid-cols-3 gap-3">
                            <FormField label="Mã báo giá">
                                <FormInput value={code} onChange={e => setCode(e.target.value)} className="h-11 font-mono font-black text-purple-600 uppercase bg-purple-50 border-purple-100 text-center" />
                            </FormField>
                            <FormField label="Ngày lập">
                                <FormInput type="date" value={date} onChange={e => setDate(e.target.value)} className="h-11 font-bold text-slate-600 text-xs" />
                            </FormField>
                            <FormField label="Hết hạn">
                                <FormInput type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="h-11 font-bold text-rose-600 text-xs" />
                            </FormField>
                        </div>
                    </div>

                    {/* SECTION: ITEMS TABLE */}
                    <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                        <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Chi tiết đơn hàng</h4>
                            <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-lg">{items.length} mặt hàng</span>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-sm text-left border-separate border-spacing-0">
                                <thead className="sticky top-0 z-20 bg-white dark:bg-slate-900 shadow-sm">
                                    <tr className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        <th className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">Sản phẩm</th>
                                        <th className="px-2 py-3 w-24 text-center border-b border-slate-100 dark:border-slate-800">SL</th>
                                        <th className="px-4 py-3 w-36 text-right border-b border-slate-100 dark:border-slate-800">Đơn giá</th>
                                        <th className="px-4 py-3 w-40 text-right border-b border-slate-100 dark:border-slate-800">Thành tiền</th>
                                        <th className="px-2 py-3 w-10 border-b border-slate-100 dark:border-slate-800"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {items.length > 0 ? items.map((item, idx) => (
                                        <tr key={idx} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="px-4 py-3 align-middle">
                                                <div className="min-w-0">
                                                    <p className="font-bold text-xs text-slate-900 dark:text-white truncate uppercase tracking-tight">{item.productName}</p>
                                                    <p className="text-[9px] font-mono font-bold text-slate-400 mt-0.5 uppercase">{item.sku}</p>
                                                </div>
                                            </td>
                                            <td className="px-2 py-3 align-middle">
                                                <InlineNumberEdit 
                                                    value={item.quantity} 
                                                    onChange={v => updateItem(item.id, { quantity: v })} 
                                                    min={1} 
                                                    align="center" 
                                                    className="h-9 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-purple-600 font-black shadow-sm" 
                                                />
                                            </td>
                                            <td className="px-4 py-3 align-middle">
                                                <InlineNumberEdit 
                                                    value={item.price} 
                                                    onChange={v => updateItem(item.id, { price: v })} 
                                                    min={0} 
                                                    align="right" 
                                                    className="h-9 border-b border-dashed border-slate-300 dark:border-slate-700 font-bold hover:border-solid hover:border-purple-300" 
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-white align-middle">
                                                {formatCurrency(item.total).replace(' VND', '')}
                                            </td>
                                            <td className="px-2 py-3 text-center align-middle">
                                                <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="size-7 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all flex items-center justify-center"><span className="material-symbols-outlined text-[16px]">close</span></button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={5} className="py-24 text-center select-none">
                                                <div className="flex flex-col items-center opacity-30">
                                                    <span className="material-symbols-outlined text-5xl mb-3">playlist_add</span>
                                                    <p className="text-xs font-black uppercase tracking-[0.2em]">Chọn sản phẩm từ danh mục bên trái</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* SECTION: FOOTER SUMMARY */}
                    <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm shrink-0 grid grid-cols-1 md:grid-cols-12 gap-8">
                        <div className="col-span-1 md:col-span-7">
                            <FormField label="Ghi chú báo giá">
                                <FormTextarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ghi chú giao hàng, điều khoản..." rows={3} className="bg-slate-50 dark:bg-slate-950 border-slate-200 text-xs" />
                            </FormField>
                        </div>
                        <div className="col-span-1 md:col-span-5 space-y-3 pt-2">
                            <div className="flex justify-between items-center text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                                <span>Tiền hàng</span>
                                <span className="text-slate-900 dark:text-white">{formatCurrency(subtotal)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                                <span>Chiết khấu</span>
                                <div className="w-28"><InlineNumberEdit value={discount} onChange={setDiscount} align="right" className="text-rose-500 font-bold border-b border-dashed border-rose-200" /></div>
                            </div>
                            <div className="flex justify-between items-center text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                                <div className="flex items-center gap-1">
                                    <span>VAT</span>
                                    <select value={vatRate} onChange={e => setVatRate(Number(e.target.value))} className="bg-slate-100 dark:bg-slate-800 border-none rounded px-1 py-0 text-[10px] font-black cursor-pointer text-slate-700">
                                        {[0, 5, 8, 10].map(v => <option key={v} value={v}>{v}%</option>)}
                                    </select>
                                </div>
                                <span className="text-slate-900 dark:text-white">{formatCurrency(vatAmount)}</span>
                            </div>
                            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                <span className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Tổng cộng</span>
                                <span className="text-2xl font-black text-purple-600 tracking-tighter">{formatCurrency(total)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export const PrintPreviewModal: React.FC<{ isOpen: boolean, onClose: () => void, data: any }> = ({ isOpen, onClose, data }) => {
    if (!data) return null;
    return (
        <GenericPrintModal isOpen={isOpen} onClose={onClose} title={`In Báo Giá ${data.code}`} filename={`BaoGia_${data.code}`} data={data} />
    );
};
