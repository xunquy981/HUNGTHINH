
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { ImportOrder, ImportItem, Partner, Product, PartnerType } from '../types';
import { useApp as useAppContext } from '../hooks/useApp';
import { removeVietnameseTones, formatCurrency, getCurrentDate, generateUUID, formatInputDate } from '../utils/helpers';
import { Button, SearchInput } from './ui/Primitives';
import { Modal } from './ui/Modal';
import { FormField, FormInput, FormSelect, FormTextarea, NumericInput } from './ui/Form';
import { PrintPreviewModal as GenericPrintModal } from './print/PrintPreviewModal';
import { WAREHOUSE_CONFIG } from '../constants/options';
import { InlineNumberEdit } from './ui/InlineNumberEdit';
import { parseInvoiceImage } from '../services/ai';
import { CreateProductModal } from './InventoryModals';

interface CreateImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialItems?: ImportItem[]; 
}

export const CreateImportModal: React.FC<CreateImportModalProps> = ({ isOpen, onClose, initialItems = [] }) => {
    const { createImportOrder, showNotification, addPartner, addProduct } = useAppContext();
    
    // Data Fetching
    const products = useLiveQuery(() => db.products.filter(p => !p.isDeleted).toArray()) || [];
    const partners = useLiveQuery(() => db.partners.filter(p => !p.isDeleted).toArray()) || [];
    
    // UI State
    const [viewMode, setViewMode] = useState<'catalog' | 'scan'>('catalog');
    const [productSearch, setProductSearch] = useState('');
    const [supplierSearch, setSupplierSearch] = useState('');
    const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
    const [isOcrLoading, setIsOcrLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCreateProductOpen, setIsCreateProductOpen] = useState(false);
    
    // Form State
    const [selectedSupplier, setSelectedSupplier] = useState<Partner | null>(null);
    const [items, setItems] = useState<ImportItem[]>(initialItems);
    const [invoiceNo, setInvoiceNo] = useState('');
    const [warehouse, setWarehouse] = useState('bearing');
    const [importDate, setImportDate] = useState(getCurrentDate());
    const [amountPaid, setAmountPaid] = useState<number>(0);
    const [extraCosts, setExtraCosts] = useState<number>(0);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('transfer');
    const [notes, setNotes] = useState('');
    const [status, setStatus] = useState<ImportOrder['status']>('Received');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const supplierDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => { 
        if (isOpen) {
            setItems(initialItems || []);
            setInvoiceNo('');
            setAmountPaid(0);
            setExtraCosts(0);
            setNotes('');
            setSelectedSupplier(null);
            setSupplierSearch('');
            setViewMode('catalog');
            setImportDate(getCurrentDate());
        }
    }, [isOpen, initialItems]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target as Node)) {
                setIsSupplierDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const filteredSuppliers = useMemo(() => {
        const suppliers = partners.filter(p => p.type === 'Supplier');
        if (!supplierSearch) return suppliers.slice(0, 5);
        const norm = removeVietnameseTones(supplierSearch);
        return suppliers.filter(p => (
            removeVietnameseTones(p.name).includes(norm) || 
            p.phone.includes(supplierSearch) ||
            p.code.toLowerCase().includes(norm)
        )).slice(0, 5);
    }, [supplierSearch, partners]);

    const filteredProducts = useMemo(() => {
        const norm = removeVietnameseTones(productSearch);
        return products.filter(p => 
            removeVietnameseTones(p.name).includes(norm) || 
            p.sku.toLowerCase().includes(norm)
        ).slice(0, 20);
    }, [productSearch, products]);

    const addItem = (product: Product) => {
        setItems(prev => {
            const existing = prev.find(i => i.id === product.id);
            if (existing) {
                return prev.map(i => i.id === product.id 
                    ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.price } 
                    : i
                );
            }
            return [...prev, {
                id: product.id, sku: product.sku, productName: product.name, unit: product.unit || 'Cái',
                quantity: 1, price: product.importPrice, total: product.importPrice
            }];
        });
        showNotification(`Đã thêm ${product.name}`, 'info');
    };

    const updateItem = (id: string, updates: Partial<ImportItem>) => {
        setItems(prev => prev.map(item => {
            if (item.id === id) {
                const updated = { ...item, ...updates };
                updated.total = updated.quantity * updated.price;
                return updated;
            }
            return item;
        }));
    };

    const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

    const handleQuickAddSupplier = async () => {
        if (!supplierSearch.trim()) return;
        try {
            const newPartner: Partner = {
                id: generateUUID('partner'),
                code: `NCC-${Date.now().toString().slice(-4)}`,
                name: supplierSearch.trim(),
                type: 'Supplier',
                phone: '',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                debt: 0
            };
            const id = await addPartner(newPartner);
            const savedPartner = { ...newPartner, id };
            setSelectedSupplier(savedPartner);
            setIsSupplierDropdownOpen(false);
        } catch (e) {
            showNotification('Không thể thêm nhanh nhà cung cấp', 'error');
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = (event.target?.result as string).split(',')[1];
            setIsOcrLoading(true);
            try {
                const result = await parseInvoiceImage(base64Data);
                if (result.supplier && !selectedSupplier) {
                    const found = partners.find(p => p.type === 'Supplier' && p.name.toLowerCase().includes(result.supplier.toLowerCase()));
                    if (found) setSelectedSupplier(found);
                    else {
                        setSupplierSearch(result.supplier);
                        setIsSupplierDropdownOpen(true);
                    }
                }
                const mappedItems: ImportItem[] = [];
                for (const item of result.items) {
                    let product = products.find(p => p.sku === item.sku);
                    if (!product && item.productName) {
                        const normName = removeVietnameseTones(item.productName);
                        product = products.find(p => removeVietnameseTones(p.name).includes(normName));
                    }
                    if (product) {
                        mappedItems.push({
                            id: product.id, sku: product.sku, productName: product.name, unit: 'Cái',
                            quantity: item.quantity || 1, price: item.price || product.importPrice,
                            total: (item.quantity || 1) * (item.price || product.importPrice)
                        });
                    }
                }
                if (mappedItems.length > 0) setItems(prev => [...prev, ...mappedItems]);
                showNotification('AI đã đọc hóa đơn thành công', 'success');
                setViewMode('catalog');
            } catch (err: any) { 
                showNotification('AI gặp lỗi khi đọc hóa đơn', 'error'); 
            } finally { 
                setIsOcrLoading(false); 
                if(fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsDataURL(file);
    };

    const subtotal = items.reduce((sum, i) => sum + i.total, 0);
    const totalAmount = subtotal + extraCosts;
    const remainingDebt = Math.max(0, totalAmount - amountPaid);

    const handleSubmit = async () => {
        if (!selectedSupplier) { showNotification('Vui lòng chọn nhà cung cấp', 'error'); return; }
        if (items.length === 0) { showNotification('Vui lòng chọn hàng hóa', 'error'); return; }

        if (invoiceNo && invoiceNo.trim()) {
            const existing = await db.importOrders.where('invoiceNo').equals(invoiceNo.trim()).first();
            if (existing) {
                showNotification(`Số hóa đơn "${invoiceNo}" đã tồn tại trong phiếu ${existing.code}!`, 'error');
                return;
            }
        }

        setIsSubmitting(true);
        try {
            await createImportOrder({
                code: `PN-${Date.now().toString().slice(-6)}`,
                supplierId: selectedSupplier.id, 
                supplierName: selectedSupplier.name,
                date: importDate,
                total: totalAmount, status, invoiceNo, warehouse, 
                items, amountPaid, paymentMethod, notes, extraCosts
            });
            onClose();
        } catch (error) { 
            showNotification('Lỗi khi lưu phiếu nhập', 'error'); 
        } finally { 
            setIsSubmitting(false); 
        }
    };

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title="Nhập Kho"
                size="full"
                footer={
                    <div className="flex justify-between items-center w-full">
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tiền hàng</span>
                                <span className="text-lg font-black text-slate-900 dark:text-white">{formatCurrency(subtotal)}</span>
                            </div>
                            <span className="text-xl text-slate-300">/</span>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cần thanh toán</span>
                                <span className="text-lg font-black text-orange-600">{formatCurrency(totalAmount)}</span>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                            <Button 
                                variant="primary" 
                                onClick={handleSubmit} 
                                disabled={isSubmitting} 
                                loading={isSubmitting} 
                                icon="save_alt"
                                className="bg-emerald-600 shadow-xl shadow-emerald-600/20 px-8"
                            >
                                {status === 'Received' ? 'Lưu & Nhập kho' : 'Lưu Nháp'}
                            </Button>
                        </div>
                    </div>
                }
            >
                <div className="flex h-[calc(100vh-200px)] gap-6 overflow-hidden">
                    <div className="w-[400px] flex flex-col bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] border border-slate-200 dark:border-slate-800 overflow-hidden shrink-0">
                        <div className="p-2 flex bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
                            <button onClick={() => setViewMode('catalog')} className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${viewMode === 'catalog' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Danh mục SP</button>
                            <button onClick={() => setViewMode('scan')} className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${viewMode === 'scan' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>AI Scanner</button>
                        </div>

                        {viewMode === 'catalog' ? (
                            <div className="flex-1 flex flex-col min-h-0">
                                <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex gap-2">
                                    <SearchInput value={productSearch} onChange={setProductSearch} placeholder="Tìm tên, mã SKU..." className="flex-1" />
                                    <button 
                                        onClick={() => setIsCreateProductOpen(true)}
                                        className="size-11 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 flex items-center justify-center shrink-0 hover:bg-indigo-700 transition-colors"
                                        title="Thêm sản phẩm mới"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">add</span>
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                                    {filteredProducts.map(p => (
                                        <div key={p.id} onClick={() => addItem(p)} className="p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all group active:scale-95 flex items-center gap-3">
                                            <div className="size-10 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400 font-bold text-xs uppercase shrink-0 shadow-inner group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                                                {p.name.charAt(0)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-black text-slate-900 dark:text-white truncate group-hover:text-emerald-600 transition-colors uppercase tracking-tight">{p.name}</p>
                                                <div className="flex justify-between mt-1 items-end">
                                                    <span className="text-[9px] font-mono font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{p.sku}</span>
                                                    <span className="text-[10px] font-bold text-slate-400">Giá vốn: {formatCurrency(p.importPrice).replace(' VND','')}</span>
                                                </div>
                                            </div>
                                            <div className="size-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                                <span className="material-symbols-outlined text-[16px]">add</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center cursor-pointer hover:bg-blue-50/50 transition-colors group" onClick={() => fileInputRef.current?.click()}>
                                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
                                <div className={`size-20 rounded-3xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 mb-6 group-hover:scale-110 transition-transform ${isOcrLoading ? 'animate-bounce' : ''}`}>
                                    <span className="material-symbols-outlined text-[40px]">{isOcrLoading ? 'sync' : 'document_scanner'}</span>
                                </div>
                                <h3 className="text-sm font-black text-slate-700 dark:text-white uppercase tracking-widest mb-2">Quét Hóa Đơn AI</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-[200px]">
                                    {isOcrLoading ? 'Đang phân tích hình ảnh...' : 'Tải lên ảnh hóa đơn để tự động nhập liệu'}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 flex flex-col gap-6 min-w-0 h-full">
                        <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm grid grid-cols-12 gap-6 items-start shrink-0 relative z-20">
                            <div className="col-span-5 relative" ref={supplierDropdownRef}>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Nhà cung cấp</label>
                                {selectedSupplier ? (
                                    <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-xl p-2 pl-3">
                                        <div className="flex items-center gap-3">
                                            <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-800 text-emerald-600 flex items-center justify-center font-bold text-xs shadow-sm">{selectedSupplier.name.charAt(0)}</div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-black text-emerald-800 dark:text-emerald-400 truncate max-w-[150px]">{selectedSupplier.name}</p>
                                                <p className="text-[9px] font-bold text-emerald-600/70">Nợ: {formatCurrency(selectedSupplier.debt || 0)}</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setSelectedSupplier(null)} className="size-8 flex items-center justify-center text-emerald-500 hover:bg-emerald-100 rounded-lg"><span className="material-symbols-outlined text-[16px]">close</span></button>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <FormInput 
                                            value={supplierSearch} 
                                            onChange={e => { setSupplierSearch(e.target.value); setIsSupplierDropdownOpen(true); }}
                                            onFocus={() => setIsSupplierDropdownOpen(true)}
                                            placeholder="Tìm hoặc thêm NCC..."
                                            className="h-12"
                                            icon="store"
                                        />
                                        {isSupplierDropdownOpen && (
                                            <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-fadeIn max-h-60 overflow-y-auto custom-scrollbar">
                                                {filteredSuppliers.map(s => (
                                                    <div key={s.id} onClick={() => { setSelectedSupplier(s); setIsSupplierDropdownOpen(false); }} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                                                        <span className="material-symbols-outlined text-slate-400 text-[18px]">store</span>
                                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{s.name}</span>
                                                    </div>
                                                ))}
                                                {supplierSearch && filteredSuppliers.length === 0 && (
                                                    <button onClick={handleQuickAddSupplier} className="w-full px-4 py-3 text-left text-xs font-bold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-[16px]">add_circle</span> Thêm mới "{supplierSearch}"
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="col-span-3">
                                <FormField label="Kho nhập">
                                    <FormSelect value={warehouse} onChange={e => setWarehouse(e.target.value)} className="h-12 font-bold">
                                        {WAREHOUSE_CONFIG.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                                    </FormSelect>
                                </FormField>
                            </div>
                            <div className="col-span-2">
                                <FormField label="Ngày nhập">
                                    <FormInput type="date" value={importDate} onChange={e => setImportDate(e.target.value)} className="h-12 font-bold text-slate-600" />
                                </FormField>
                            </div>
                            <div className="col-span-2">
                                <FormField label="Số hóa đơn">
                                    <FormInput value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className="h-12 font-mono font-bold text-blue-600 uppercase" placeholder="HD-..." />
                                </FormField>
                            </div>
                        </div>

                        <div className="flex-1 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-inner-soft overflow-hidden flex flex-col relative z-10 min-h-0">
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-sm text-left">
                                    <thead className="sticky top-0 z-10 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                        <tr>
                                            <th className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">Sản phẩm</th>
                                            <th className="px-2 py-4 text-center border-b border-slate-200 dark:border-slate-800 w-24">Số lượng</th>
                                            <th className="px-4 py-4 text-right border-b border-slate-200 dark:border-slate-800 w-32">Giá nhập</th>
                                            <th className="px-6 py-4 text-right border-b border-slate-200 dark:border-slate-800 w-40">Thành tiền</th>
                                            <th className="px-4 py-4 w-12 border-b border-slate-200 dark:border-slate-800"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {items.length > 0 ? items.map((item, idx) => (
                                            <tr key={idx} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-6 py-3">
                                                    <p className="font-bold text-slate-900 dark:text-white truncate max-w-[250px] uppercase tracking-tight">{item.productName}</p>
                                                    <p className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">{item.sku}</p>
                                                </td>
                                                <td className="px-2 py-3">
                                                    <input 
                                                        type="number" value={item.quantity} 
                                                        onChange={e => updateItem(item.id, { quantity: Number(e.target.value) })}
                                                        className="w-full text-center bg-slate-100 dark:bg-slate-800 rounded-lg py-1.5 text-sm font-black text-emerald-600 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <NumericInput 
                                                        value={item.price} 
                                                        onChange={v => updateItem(item.id, { price: v })} 
                                                        className="h-9 bg-transparent border-b border-slate-200 dark:border-slate-700 rounded-none px-0 text-right font-bold focus:border-emerald-500"
                                                    />
                                                </td>
                                                <td className="px-6 py-3 text-right font-black text-slate-900 dark:text-white">
                                                    {formatCurrency(item.total).replace(' VND', '')}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <button onClick={() => removeItem(item.id)} className="size-8 flex items-center justify-center text-slate-300 hover:text-rose-500 rounded-lg transition-colors"><span className="material-symbols-outlined text-[18px]">close</span></button>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan={5} className="py-20 text-center text-slate-400 opacity-50 uppercase font-black text-xs tracking-widest">Chưa có hàng hóa</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="p-6 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 shrink-0 grid grid-cols-12 gap-8">
                                <div className="col-span-4 space-y-4">
                                    <FormField label="Ghi chú nhập hàng">
                                        <FormTextarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="bg-white dark:bg-slate-900 rounded-2xl border-none shadow-sm" placeholder="Ghi chú..." />
                                    </FormField>
                                    <FormField label="Trạng thái">
                                        <div className="flex bg-white dark:bg-slate-900 p-1 rounded-xl shadow-sm">
                                            <button onClick={() => setStatus('Received')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${status === 'Received' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}>Đã nhập kho</button>
                                            <button onClick={() => setStatus('Pending')} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${status === 'Pending' ? 'bg-orange-50 text-orange-600' : 'text-slate-400'}`}>Chờ duyệt</button>
                                        </div>
                                    </FormField>
                                </div>
                                <div className="col-span-8 grid grid-cols-2 gap-8">
                                    <div className="space-y-3 pt-1">
                                        <div className="flex justify-between items-center text-[11px] font-bold text-slate-500 uppercase"><span>Tiền hàng:</span> <span>{formatCurrency(subtotal)}</span></div>
                                        <div className="flex justify-between items-center text-[11px] font-bold text-slate-500 uppercase">
                                            <span>Chi phí khác:</span> 
                                            <div className="w-24"><NumericInput value={extraCosts} onChange={setExtraCosts} className="h-7 text-right bg-white border-b border-slate-300 rounded-none px-0 font-bold" /></div>
                                        </div>
                                        <div className="border-t border-slate-200 dark:border-slate-700 my-2"></div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">TỔNG CỘNG:</span>
                                            <span className="text-2xl font-black text-emerald-600">{formatCurrency(totalAmount)}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                                        <FormField label="Thanh toán ngay">
                                            <div className="flex gap-2">
                                                <NumericInput value={amountPaid} onChange={setAmountPaid} className="h-10 font-bold text-emerald-600" />
                                                <button onClick={() => setAmountPaid(totalAmount)} className="px-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-[10px] font-black text-slate-500 uppercase">All</button>
                                            </div>
                                        </FormField>
                                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                                            <span className="text-slate-400">Còn nợ:</span>
                                            <span className={`${remainingDebt > 0 ? 'text-rose-500' : 'text-slate-400'}`}>{formatCurrency(remainingDebt)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Modal>

            <CreateProductModal 
                isOpen={isCreateProductOpen} 
                onClose={() => setIsCreateProductOpen(false)} 
                mode="create" 
                onSubmit={async (data) => { await addProduct(data as Product); showNotification('Đã thêm sản phẩm mới', 'success'); }}
            />
        </>
    );
};

export const PrintImportModal: React.FC<{ isOpen: boolean, onClose: () => void, data: ImportOrder | null }> = ({ isOpen, onClose, data }) => {
    if (!data) return null;
    return (
        <GenericPrintModal
            isOpen={isOpen}
            onClose={onClose}
            title={`Phiếu Nhập ${data.code}`}
            filename={`PhieuNhap_${data.code}`}
            data={data}
        />
    );
};

export const ReceiveItemsModal: React.FC<{ isOpen: boolean, onClose: () => void, importOrder: ImportOrder | null }> = ({ isOpen, onClose, importOrder }) => {
    const { addReceivingNote, showNotification } = useAppContext();
    const [items, setItems] = useState<{ id: string, quantity: number, max: number, name: string }[]>([]);
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [notes, setNotes] = useState('');
    const [landedCost, setLandedCost] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && importOrder) {
            setDate(new Date().toISOString().slice(0, 10));
            setNotes('');
            setLandedCost(0);
            
            const mapped = importOrder.items.map(i => {
                const received = i.receivedQuantity || 0;
                const remaining = Math.max(0, i.quantity - received);
                return {
                    id: i.id,
                    name: i.productName,
                    quantity: remaining, 
                    max: remaining
                };
            }).filter(i => i.max > 0);
            
            setItems(mapped);
        }
    }, [isOpen, importOrder]);

    const handleQuantityChange = (id: string, qty: number) => {
        setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
    };

    const handleSubmit = async () => {
        if (!importOrder) return;
        const validItems = items.filter(i => i.quantity > 0);
        if (validItems.length === 0) {
            showNotification('Vui lòng nhập số lượng nhận > 0', 'error');
            return;
        }
        const invalid = validItems.find(i => i.quantity > i.max);
        if (invalid) {
            showNotification(`Sản phẩm ${invalid.name} vượt quá số lượng đặt (${invalid.max})`, 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await addReceivingNote(
                importOrder.id,
                validItems.map(i => ({ id: i.id, quantity: i.quantity })),
                { date: date, notes }, 
                landedCost
            );
            onClose();
        } catch (e: any) {
            showNotification(e.message || 'Lỗi khi nhập kho', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen || !importOrder) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Nhập Kho - ${importOrder.code}`}
            subtitle="Ghi nhận hàng về kho thực tế"
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                    <Button variant="primary" onClick={handleSubmit} loading={isSubmitting} icon="inventory">Xác nhận nhập kho</Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField label="Ngày nhập">
                        <FormInput type="date" value={date} onChange={e => setDate(e.target.value)} />
                    </FormField>
                    <FormField label="Chi phí vận chuyển/khác (Nếu có)">
                        <div className="relative">
                            <FormInput type="number" value={landedCost === 0 ? '' : landedCost} onChange={e => setLandedCost(Number(e.target.value))} placeholder="0" className="pr-12" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">VND</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">Sẽ được phân bổ vào giá vốn sản phẩm.</p>
                    </FormField>
                </div>
                <FormField label="Ghi chú">
                    <FormTextarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="VD: Hàng về đợt 1..." rows={2} />
                </FormField>

                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mt-4">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="px-4 py-2 text-left">Sản phẩm</th>
                                <th className="px-4 py-2 text-center w-24">Còn lại</th>
                                <th className="px-4 py-2 text-center w-32">Thực nhận</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-900">
                            {items.map(item => (
                                <tr key={item.id}>
                                    <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">{item.name}</td>
                                    <td className="px-4 py-2 text-center text-slate-500">{item.max}</td>
                                    <td className="px-4 py-2">
                                        <InlineNumberEdit 
                                            value={item.quantity} 
                                            onChange={v => handleQuantityChange(item.id, v)} 
                                            max={item.max} 
                                            min={0}
                                            align="center"
                                            className="border border-blue-200 bg-blue-50 text-blue-700 rounded font-bold"
                                        />
                                    </td>
                                </tr>
                            ))}
                            {items.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-slate-500 italic">Đã nhập đủ hàng.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
};

export const CreatePurchaseReturnModal: React.FC<{ isOpen: boolean, onClose: () => void, importOrder: ImportOrder }> = ({ isOpen, onClose, importOrder }) => {
    const { addPurchaseReturnNote, showNotification } = useAppContext();
    const [items, setItems] = useState<{ id: string, quantity: number, max: number, name: string, price: number }[]>([]);
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [notes, setNotes] = useState('');
    const [method, setMethod] = useState('debt_deduction');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch previous returns to calculate remaining returnable quantity
    const previousReturns = useLiveQuery(() => 
        isOpen ? db.purchaseReturnNotes.where('importCode').equals(importOrder.code).toArray() : []
    , [isOpen, importOrder.code]);

    useEffect(() => {
        if (isOpen && importOrder && previousReturns) {
            // Calculate total returned per item
            const returnedMap = new Map<string, number>();
            previousReturns.forEach(note => {
                note.items.forEach(item => {
                    const current = returnedMap.get(item.id) || 0;
                    returnedMap.set(item.id, current + item.quantity);
                });
            });

            setDate(new Date().toISOString().slice(0, 10));
            setNotes('');
            const mapped = importOrder.items.map(i => {
                const received = i.receivedQuantity || 0; 
                const alreadyReturned = returnedMap.get(i.id) || 0;
                const maxReturnable = Math.max(0, received - alreadyReturned);
                
                return {
                    id: i.id,
                    name: i.productName,
                    quantity: 0,
                    max: maxReturnable,
                    price: i.price
                };
            }).filter(i => i.max > 0);
            
            setItems(mapped);
        }
    }, [isOpen, importOrder, previousReturns]);

    const handleQuantityChange = (id: string, qty: number) => {
        setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
    };

    const handleSubmit = async () => {
        const validItems = items.filter(i => i.quantity > 0);
        if (validItems.length === 0) {
            showNotification('Vui lòng chọn số lượng trả hàng', 'error');
            return;
        }
        
        setIsSubmitting(true);
        const refundAmount = validItems.reduce((sum, i) => sum + i.quantity * i.price, 0);

        try {
            await addPurchaseReturnNote({
                importOrder,
                items: validItems,
                refundAmount,
                method,
                notes,
                date: date 
            });
            onClose();
        } catch (e: any) {
            showNotification(e.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const totalRefund = items.reduce((sum, i) => sum + i.quantity * i.price, 0);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Trả Hàng NCC - ${importOrder.code}`}
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                    <Button variant="danger" onClick={handleSubmit} loading={isSubmitting} icon="keyboard_return">Xác nhận trả hàng</Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField label="Ngày trả">
                        <FormInput type="date" value={date} onChange={e => setDate(e.target.value)} />
                    </FormField>
                    <FormField label="Phương thức hoàn tiền">
                        <FormSelect value={method} onChange={e => setMethod(e.target.value)}>
                            <option value="debt_deduction">Trừ công nợ</option>
                            <option value="cash">Nhận tiền mặt</option>
                            <option value="transfer">Nhận chuyển khoản</option>
                        </FormSelect>
                    </FormField>
                </div>
                
                <FormField label="Lý do trả hàng">
                    <FormTextarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Hàng lỗi, sai quy cách..." rows={2} />
                </FormField>

                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mt-4">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="px-4 py-2 text-left">Sản phẩm</th>
                                <th className="px-4 py-2 text-center w-24">Khả dụng</th>
                                <th className="px-4 py-2 text-center w-32">Trả lại</th>
                                <th className="px-4 py-2 text-right w-32">Thành tiền</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-900">
                            {items.length > 0 ? items.map(item => (
                                <tr key={item.id}>
                                    <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">{item.name}</td>
                                    <td className="px-4 py-2 text-center text-slate-500">{item.max}</td>
                                    <td className="px-4 py-2">
                                        <InlineNumberEdit 
                                            value={item.quantity} 
                                            onChange={v => handleQuantityChange(item.id, v)} 
                                            max={item.max} 
                                            min={0}
                                            align="center"
                                            className="border border-red-200 bg-red-50 text-red-700 rounded font-bold"
                                        />
                                    </td>
                                    <td className="px-4 py-2 text-right font-bold text-slate-700 dark:text-slate-300">
                                        {formatCurrency(item.quantity * item.price)}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-slate-400 italic">Không có sản phẩm nào có thể trả lại (hoặc đã trả hết).</td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className="bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                            <tr>
                                <td colSpan={3} className="px-4 py-2 text-right font-bold text-slate-500 uppercase">Tổng hoàn lại</td>
                                <td className="px-4 py-2 text-right font-black text-red-600 text-lg">{formatCurrency(totalRefund)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </Modal>
    );
};
