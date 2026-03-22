
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ViewState, Product, Partner, OrderItem } from '../types';
import { useDomainServices } from '../hooks/useDomainServices';
import { useNotification } from '../contexts/NotificationContext';
import { PageShell, Button, SearchInput } from '../components/ui/Primitives';
import { formatCurrency, removeVietnameseTones, getCurrentDate } from '../utils/helpers';
import { useDexieTable } from '../hooks/useDexieTable';
import { db } from '../services/db';
import { POS_CATEGORIES } from '../constants/options';
import { NumericInput, FormInput } from '../components/ui/Form';
import { CreatePartnerModal } from '../components/PartnerModals';
import Pagination from '../components/Pagination';
import { useLiveQuery } from 'dexie-react-hooks';

const POS: React.FC<{ onNavigate: (view: ViewState, params?: any) => void }> = ({ onNavigate }) => {
    const { createOrder } = useDomainServices();
    const { showNotification } = useNotification();
    
    // Data
    const partners = useLiveQuery(() => db.partners.filter(p => !p.isDeleted).toArray()) || [];

    // State
    const [cart, setCart] = useState<OrderItem[]>([]);
    const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
    const [partnerSearch, setPartnerSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    
    const [discount, setDiscount] = useState(0);
    const [vatRate, setVatRate] = useState(0);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'debt' | 'card'>('cash');
    const [amountGiven, setAmountGiven] = useState(0);
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
    const [isPartnerDropdownOpen, setIsPartnerDropdownOpen] = useState(false);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const partnerInputRef = useRef<HTMLInputElement>(null);

    // Derived Financials
    const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.total, 0), [cart]);
    const vatAmount = useMemo(() => Math.round((subtotal - discount) * (vatRate / 100)), [subtotal, discount, vatRate]);
    const total = useMemo(() => Math.max(0, subtotal - discount + vatAmount), [subtotal, discount, vatAmount]);
    const changeDue = Math.max(0, amountGiven - total);

    // Filter Logic for Products Table
    const productFilterFn = useMemo(() => (p: Product) => {
        if (activeCategory !== 'all' && p.location !== activeCategory) return false;
        if (productSearch) {
            const norm = removeVietnameseTones(productSearch);
            return removeVietnameseTones(p.name).includes(norm) || p.sku.toLowerCase().includes(norm);
        }
        return true;
    }, [activeCategory, productSearch]);

    const { data: products, totalItems, currentPage, setCurrentPage, isLoading } = useDexieTable<Product>({
        table: db.products,
        itemsPerPage: 15, // Requirement: 15 items per page
        filterFn: productFilterFn,
        defaultSort: 'name'
    });

    const filteredPartners = useMemo(() => {
        if (!partnerSearch) return [];
        const norm = removeVietnameseTones(partnerSearch);
        return partners.filter(p => 
            p.type === 'Customer' && 
            (removeVietnameseTones(p.name).includes(norm) || p.phone.includes(partnerSearch))
        ).slice(0, 5);
    }, [partners, partnerSearch]);

    // Handlers
    const addToCart = (product: Product) => {
        setCart(prev => {
            const exist = prev.find(i => i.id === product.id);
            if (exist) {
                return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.price } : i);
            }
            return [...prev, {
                id: product.id, sku: product.sku, productName: product.name, unit: product.unit || 'Cái',
                quantity: 1, price: product.retailPrice, total: product.retailPrice, costPrice: product.importPrice
            }];
        });
    };

    const updateItem = (id: string, updates: Partial<OrderItem>) => {
        setCart(prev => prev.map(i => {
            if (i.id === id) {
                const updated = { ...i, ...updates };
                updated.total = updated.quantity * updated.price;
                return updated;
            }
            return i;
        }));
    };

    const handleCheckout = async () => {
        if (cart.length === 0) { showNotification('Giỏ hàng trống', 'error'); return; }

        let finalAmountPaid = 0;
        if (paymentMethod === 'debt') {
            finalAmountPaid = 0;
        } else if (paymentMethod === 'transfer' || paymentMethod === 'card') {
            finalAmountPaid = total; 
        } else {
            finalAmountPaid = amountGiven >= total ? total : amountGiven;
        }

        if (!selectedPartner) {
            if (paymentMethod === 'debt') {
                showNotification('Khách lẻ không được phép ghi nợ. Vui lòng chọn khách hàng.', 'error');
                return;
            }
            if (finalAmountPaid < total - 1000) { 
                showNotification(`Khách lẻ phải thanh toán đủ (${formatCurrency(total)}).`, 'error');
                return;
            }
        }
        
        setIsSubmitting(true);
        try {
            const orderData = {
                code: `DH-${Date.now().toString().slice(-6)}`,
                customerName: selectedPartner?.name || 'Khách lẻ',
                phone: selectedPartner?.phone || '',
                partnerId: selectedPartner?.id,
                items: cart,
                date: getCurrentDate(),
                subtotal, discount, vatRate, vatAmount, total,
                amountPaid: finalAmountPaid,
                paymentMethod: paymentMethod === 'debt' ? 'debt' : paymentMethod,
                status: 'Completed',
            };
            
            await createOrder(orderData as any);
            showNotification('Đã tạo đơn hàng thành công!', 'success');
            
            setCart([]);
            setSelectedPartner(null);
            setPartnerSearch('');
            setDiscount(0);
            setPaymentMethod('cash');
            setAmountGiven(0);
            setVatRate(0);
            if(searchInputRef.current) searchInputRef.current.focus();
        } catch (error: any) {
            showNotification(error.message || 'Lỗi thanh toán', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <PageShell className="h-full overflow-hidden bg-slate-50 dark:bg-slate-950">
            <div className="flex flex-row flex-1 w-full min-h-0">
            {/* 1. COMPACT ICON SIDEBAR (LEFT) */}
            <div className="w-[72px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-4 gap-3 shrink-0 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                {POS_CATEGORIES.map(c => (
                    <button 
                        key={c.id} 
                        onClick={() => setActiveCategory(c.id)}
                        className={`size-11 rounded-2xl flex items-center justify-center transition-all duration-300 relative group ${
                            activeCategory === c.id 
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/40 scale-110' 
                            : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-600'
                        }`}
                        title={c.label}
                    >
                        <span className={`material-symbols-outlined text-[24px] ${activeCategory === c.id ? 'filled-icon' : ''}`}>{c.icon}</span>
                        {/* Tooltip on hover */}
                        <div className="absolute left-14 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                            {c.label}
                        </div>
                    </button>
                ))}
            </div>

            {/* 2. MAIN PRODUCT AREA (CENTER) */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-950/50 relative">
                {/* Search Header */}
                <div className="p-4 flex gap-3 items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 z-10 sticky top-0 shadow-sm">
                    <div className="flex-1 relative">
                        <SearchInput 
                            ref={searchInputRef}
                            value={productSearch} 
                            onChange={setProductSearch} 
                            placeholder="Tìm kiếm sản phẩm (Tên, SKU, Quy cách)..." 
                        />
                    </div>
                </div>

                {/* Product Grid */}
                <div className="flex-1 overflow-y-auto p-4 lg:p-6 custom-scrollbar">
                    {/* Fixed 3 cols grid layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {products.map(p => {
                            const available = Math.max(0, p.stock - (p.stockReserved || 0));
                            const isOutOfStock = available <= 0;
                            const isLowStock = available <= (p.minStock || 5);

                            return (
                                <button 
                                    key={p.id} 
                                    onClick={() => !isOutOfStock && addToCart(p)}
                                    disabled={isOutOfStock}
                                    className={`
                                        group relative flex flex-col justify-between h-[160px] p-5 rounded-[1.5rem] text-left border transition-all duration-300
                                        ${isOutOfStock 
                                            ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed grayscale' 
                                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-1 active:scale-[0.98]'
                                        }
                                    `}
                                >
                                    <div className="relative z-10 w-full">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-mono font-black text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 uppercase tracking-tighter">{p.sku}</span>
                                            <div className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                                isOutOfStock ? 'bg-slate-200 text-slate-500' :
                                                isLowStock ? 'bg-amber-100 text-amber-700' : 
                                                'bg-emerald-100 text-emerald-700'
                                            }`}>
                                                <span className={`size-1.5 rounded-full ${isOutOfStock ? 'bg-slate-400' : isLowStock ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                                                {isOutOfStock ? 'HẾT' : `${available}`}
                                            </div>
                                        </div>
                                        
                                        <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-snug line-clamp-2 mb-1 group-hover:text-indigo-600 transition-colors">
                                            {p.name}
                                        </h3>
                                        
                                        <div className="flex flex-wrap gap-1 mt-1 opacity-70">
                                            {p.brand && <span className="text-[9px] font-bold uppercase text-slate-500">{p.brand}</span>}
                                            {p.dimensions && <span className="text-[9px] text-slate-400">• {p.dimensions}</span>}
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-end border-t border-slate-50 dark:border-slate-800 pt-2 mt-auto relative z-10 w-full">
                                        <span className="text-[10px] font-bold text-slate-400">{p.unit}</span>
                                        <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 tracking-tight group-hover:scale-110 transition-transform origin-right">
                                            {formatCurrency(p.retailPrice).replace(' VND','')}
                                        </span>
                                    </div>
                                    
                                    {/* Decor */}
                                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-bl-[2.5rem] -mr-2 -mt-2 transition-transform group-hover:scale-150 duration-500 pointer-events-none"></div>
                                </button>
                            );
                        })}
                        
                        {products.length === 0 && !isLoading && (
                            <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400 opacity-50">
                                <span className="material-symbols-outlined text-6xl mb-2">inventory_2</span>
                                <p className="text-xs font-black uppercase tracking-widest">Không tìm thấy sản phẩm</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Pagination */}
                <div className="px-6 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-t border-slate-200 dark:border-slate-800 sticky bottom-0 z-10">
                    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={15} onPageChange={setCurrentPage} />
                </div>
            </div>

            {/* 3. FIXED CART SIDEBAR (RIGHT) - FIXED HEIGHT */}
            <div className="w-[400px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col z-30 shadow-2xl shrink-0 h-full relative">
                {/* Header: Partner */}
                <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                            <span className="material-symbols-outlined text-indigo-600">shopping_cart</span> Giỏ hàng
                        </h2>
                        <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
                    </div>
                    
                    {selectedPartner ? (
                        <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-indigo-200 dark:border-indigo-900/50 flex justify-between items-center shadow-sm group animate-[fadeIn_0.2s_ease-out]">
                            <div className="flex items-center gap-3">
                                <div className="size-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xs">
                                    {selectedPartner.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-900 dark:text-white uppercase truncate max-w-[180px]">{selectedPartner.name}</p>
                                    <p className="text-[10px] text-slate-500 font-bold font-mono">{selectedPartner.phone}</p>
                                </div>
                            </div>
                            <button onClick={() => { setSelectedPartner(null); setPartnerSearch(''); }} className="text-slate-400 hover:text-red-500 transition-colors p-1"><span className="material-symbols-outlined text-[18px]">close</span></button>
                        </div>
                    ) : (
                        <div className="relative group" ref={partnerInputRef}>
                            <input 
                                value={partnerSearch} 
                                onChange={e => { setPartnerSearch(e.target.value); setIsPartnerDropdownOpen(true); }}
                                onFocus={() => setIsPartnerDropdownOpen(true)}
                                placeholder="Tìm khách hàng (F4)..."
                                className="w-full h-11 pl-10 pr-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 material-symbols-outlined text-[18px] group-focus-within:text-indigo-500 transition-colors">person_search</span>
                            {partnerSearch && filteredPartners.length === 0 && (
                                <button onClick={() => setIsPartnerModalOpen(true)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors">THÊM MỚI</button>
                            )}
                            {isPartnerDropdownOpen && filteredPartners.length > 0 && (
                                <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden animate-[fadeIn_0.1s_ease-out]">
                                    {filteredPartners.map(p => (
                                        <div key={p.id} onClick={() => { setSelectedPartner(p); setPartnerSearch(''); setIsPartnerDropdownOpen(false); }} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-0">
                                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase">{p.name}</p>
                                            <p className="text-[10px] text-slate-400 font-mono">{p.phone}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Cart Items (Scrollable Area) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-slate-50/30 dark:bg-slate-900/50">
                    {cart.map((item) => (
                        <div key={item.id} className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col gap-2 animate-[slideInRight_0.2s_ease-out] group">
                            <div className="flex justify-between items-start">
                                <div className="min-w-0 pr-2">
                                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate leading-snug">{item.productName}</p>
                                    <p className="text-[10px] font-mono text-slate-400">{item.sku}</p>
                                </div>
                                <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{formatCurrency(item.total).replace(' VND','')}</p>
                            </div>
                            
                            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 p-1 rounded-xl">
                                <div className="flex items-center">
                                    <button onClick={() => updateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })} className="size-7 flex items-center justify-center bg-white dark:bg-slate-800 rounded-lg shadow-sm text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors active:scale-90"><span className="material-symbols-outlined text-[16px]">remove</span></button>
                                    <input 
                                        type="number" 
                                        value={item.quantity} 
                                        onChange={e => updateItem(item.id, { quantity: Number(e.target.value) })}
                                        className="w-12 text-center bg-transparent text-sm font-black outline-none appearance-none"
                                    />
                                    <button onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })} className="size-7 flex items-center justify-center bg-white dark:bg-slate-800 rounded-lg shadow-sm text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors active:scale-90"><span className="material-symbols-outlined text-[16px]">add</span></button>
                                </div>
                                <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="size-7 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                            </div>
                        </div>
                    ))}
                    {cart.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center opacity-40 text-slate-400">
                            <span className="material-symbols-outlined text-6xl mb-2">shopping_basket</span>
                            <p className="text-xs font-black uppercase tracking-widest">Giỏ hàng trống</p>
                        </div>
                    )}
                </div>

                {/* Footer: Summary & Pay (Sticky Bottom) */}
                <div className="bg-white dark:bg-slate-900 p-5 border-t border-slate-200 dark:border-slate-800 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-40 shrink-0">
                    <div className="space-y-1.5 mb-4 text-xs font-medium text-slate-500">
                        <div className="flex justify-between"><span>Tạm tính</span><span className="text-slate-900 dark:text-white font-bold">{formatCurrency(subtotal)}</span></div>
                        <div className="flex justify-between items-center">
                            <span>Chiết khấu</span>
                            <NumericInput value={discount} onChange={setDiscount} className="w-24 text-right h-6 bg-slate-50 border-none rounded text-rose-500 font-bold text-xs" />
                        </div>
                        <div className="flex justify-between items-center">
                            <span>VAT</span>
                            <div className="flex gap-1">
                                {[0, 8, 10].map(r => (
                                    <button key={r} onClick={() => setVatRate(r)} className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all ${vatRate === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 hover:border-blue-400'}`}>{r}%</button>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-between items-end pt-3 mt-2 border-t border-dashed border-slate-200">
                            <span className="font-black uppercase text-slate-900 dark:text-white">Tổng cộng</span>
                            <span className="text-2xl font-black text-indigo-600">{formatCurrency(total)}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 mb-4">
                        {[
                            { id: 'cash', label: 'Tiền mặt', icon: 'payments' },
                            { id: 'transfer', label: 'CK', icon: 'account_balance' },
                            { id: 'card', label: 'Thẻ', icon: 'credit_card' },
                            { id: 'debt', label: 'Ghi nợ', icon: 'history_edu' }
                        ].map(m => (
                            <button
                                key={m.id}
                                onClick={() => setPaymentMethod(m.id as any)}
                                className={`flex flex-col items-center justify-center py-2 rounded-xl border-2 transition-all ${paymentMethod === m.id ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-transparent text-slate-400 hover:bg-slate-50'}`}
                            >
                                <span className="material-symbols-outlined text-[20px] mb-0.5">{m.icon}</span>
                                <span className="text-[8px] font-bold uppercase">{m.label}</span>
                            </button>
                        ))}
                    </div>

                    {paymentMethod === 'cash' && (
                        <div className="mb-4 bg-slate-50 p-3 rounded-xl flex items-center justify-between border border-slate-100">
                            <span className="text-xs font-bold text-slate-500">Khách đưa</span>
                            <div className="flex items-center gap-2">
                                <NumericInput value={amountGiven} onChange={setAmountGiven} className="w-28 text-right font-black text-lg bg-transparent border-b border-slate-300 rounded-none px-0 focus:border-indigo-500" />
                                {changeDue > 0 && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded-lg">Thối: {formatCurrency(changeDue)}</span>}
                            </div>
                        </div>
                    )}

                    <Button 
                        onClick={handleCheckout} 
                        disabled={isSubmitting || cart.length === 0} 
                        loading={isSubmitting} 
                        className={`w-full h-14 text-lg font-black uppercase tracking-widest shadow-xl rounded-2xl ${paymentMethod === 'debt' ? 'bg-orange-600 shadow-orange-600/30' : 'bg-indigo-600 shadow-indigo-600/30'} hover:scale-[1.02] active:scale-95 transition-transform`}
                        icon={paymentMethod === 'debt' ? 'save_as' : 'check_circle'}
                    >
                        {paymentMethod === 'debt' ? 'Lưu nợ' : 'Thanh toán'}
                    </Button>
                </div>
            </div>
            </div>

            <CreatePartnerModal 
                isOpen={isPartnerModalOpen} 
                onClose={() => setIsPartnerModalOpen(false)} 
                mode="create" 
                initialData={{ name: partnerSearch, type: 'Customer' } as any}
                onSuccess={(p) => { setSelectedPartner(p as Partner); setIsPartnerModalOpen(false); }}
            />
        </PageShell>
    );
};

export default POS;
