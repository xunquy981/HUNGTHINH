import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { useApp as useAppContext } from '../../hooks/useApp';
import { ImportOrder, ImportItem, Partner, Product } from '../../types';
import { removeVietnameseTones, formatCurrency, formatInputDate, generateUUID, getCurrentDate } from '../../utils/helpers';
import { FormField, FormInput, FormSelect, FormTextarea, NumericInput } from '../ui/Form';
import { SearchInput, Button } from '../ui/Primitives';
import { parseImportDocument } from '../../services/ai';
import { WAREHOUSE_CONFIG } from '../../constants/options';
import { Modal } from '../ui/Modal';
import { CreateProductModal } from '../InventoryModals';
import { parseExcel, parseCSV } from '../../utils/importHelpers';

export const ImportWizard: React.FC<{ isOpen: boolean; onClose: () => void; initialItems?: ImportItem[] }> = ({ isOpen, onClose, initialItems }) => {
    const { createImportOrder, addPartner, addProduct, showNotification } = useAppContext();

    const products = useLiveQuery(() => db.products.filter(p => !p.isDeleted).toArray()) || [];
    const partners = useLiveQuery(() => db.partners.filter(p => !p.isDeleted).toArray()) || [];

    const [viewMode, setViewMode] = useState<'catalog' | 'scan'>('catalog');
    const [selectedSupplier, setSelectedSupplier] = useState<Partner | null>(null);
    const [warehouse, setWarehouse] = useState('bearing');
    const [importDate, setImportDate] = useState(getCurrentDate());
    const [invoiceNo, setInvoiceNo] = useState('');
    const [items, setItems] = useState<ImportItem[]>([]);
    const [amountPaid, setAmountPaid] = useState<number>(0);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('transfer');
    const [notes, setNotes] = useState('');
    const [extraCosts, setExtraCosts] = useState<number>(0);

    const [supplierSearch, setSupplierSearch] = useState('');
    const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const [isOcrLoading, setIsOcrLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCreateProductOpen, setIsCreateProductOpen] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const supplierDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setSelectedSupplier(null);
            setWarehouse('bearing');
            setImportDate(getCurrentDate());
            setInvoiceNo('');
            setItems(initialItems || []);
            setAmountPaid(0);
            setExtraCosts(0);
            setNotes('');
            setSupplierSearch('');
            setViewMode('catalog');
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
        showNotification(`Đã thêm ${product.sku}`, 'info');
    };

    /**
     * Updates an existing item in the manifest.
     * @param id Product ID to update
     * @param updates Partial item fields (quantity or price)
     */
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

    /**
     * Removes an item from the manifest by ID.
     * @param id Product ID to remove
     */
    const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');
        const reader = new FileReader();

        reader.onload = async (event) => {
            setIsOcrLoading(true);
            try {
                let aiPayload: { mimeType: string, data: string };
                if (isExcel) {
                    const parsed = file.name.endsWith('.csv') ? parseCSV(event.target?.result as string) : parseExcel(event.target?.result as ArrayBuffer);
                    aiPayload = { mimeType: 'text/plain', data: JSON.stringify(parsed.rows.slice(0, 50)) };
                } else {
                    const base64Data = (event.target?.result as string).split(',')[1];
                    aiPayload = { mimeType: file.type, data: base64Data };
                }

                const result = await parseImportDocument(aiPayload);

                if (result.supplier && !selectedSupplier) {
                    const found = partners.find(p => p.type === 'Supplier' && p.name.toLowerCase().includes(result.supplier.toLowerCase()));
                    if (found) setSelectedSupplier(found);
                    else { setSupplierSearch(result.supplier); setIsSupplierDropdownOpen(true); }
                }
                if (result.invoiceNo) setInvoiceNo(result.invoiceNo);

                const mappedItems: ImportItem[] = [];
                for (const item of result.items) {
                    let product = products.find(p => item.sku && p.sku === item.sku);
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
                showNotification(`AI đã đọc thành công tài liệu!`, 'success');
                setViewMode('catalog');
            } catch (err: any) { 
                showNotification('AI không đọc được file này.', 'error'); 
            } finally { 
                setIsOcrLoading(false); 
                if(fileInputRef.current) fileInputRef.current.value = '';
            }
        };

        if (isExcel && !file.name.endsWith('.csv')) reader.readAsArrayBuffer(file);
        else reader.readAsDataURL(file);
    };

    const subtotal = items.reduce((sum, i) => sum + i.total, 0);
    const totalAmount = subtotal + extraCosts;

    const handleSubmit = async (targetStatus: 'Pending' | 'Received') => {
        if (!selectedSupplier) { showNotification('Vui lòng chọn nhà cung cấp', 'error'); return; }
        if (items.length === 0) { showNotification('Vui lòng chọn hàng hóa', 'error'); return; }

        setIsSubmitting(true);
        try {
            await createImportOrder({
                code: `PN-${Date.now().toString().slice(-6)}`,
                supplierId: selectedSupplier.id, 
                supplierName: selectedSupplier.name,
                date: importDate, 
                total: totalAmount, 
                status: targetStatus, 
                invoiceNo, warehouse, 
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
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Lập phiếu nhập hàng"
            size="full"
            footer={
                <div className="flex justify-between items-center w-full">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tiền hàng</span>
                            <span className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">{formatCurrency(subtotal)}</span>
                        </div>
                        <div className="h-8 w-px bg-slate-200 dark:border-slate-800"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tổng cộng thanh toán</span>
                            <span className="text-2xl font-black text-emerald-600 tracking-tighter">{formatCurrency(totalAmount)}</span>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={onClose} disabled={isSubmitting} className="rounded-xl px-6">Hủy bỏ</Button>
                        <Button variant="outline" onClick={() => handleSubmit('Pending')} disabled={isSubmitting} loading={isSubmitting} icon="save" className="rounded-xl px-6 border-slate-300">Lưu nháp</Button>
                        <Button variant="primary" onClick={() => handleSubmit('Received')} disabled={isSubmitting} loading={isSubmitting} icon="check_circle" className="bg-emerald-600 shadow-xl shadow-emerald-600/20 px-8 rounded-xl font-black uppercase">Hoàn tất & Nhập kho</Button>
                    </div>
                </div>
            }
        >
            <div className="flex h-[calc(100vh-200px)] gap-6 -m-8 overflow-hidden">
                {/* Product/Source Selector */}
                <div className="w-[420px] flex flex-col bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 shrink-0 h-full">
                    <div className="p-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex gap-2">
                        <button onClick={() => setViewMode('catalog')} className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${viewMode === 'catalog' ? 'bg-emerald-50 text-emerald-600 shadow-sm border border-emerald-100' : 'text-slate-400 hover:bg-slate-50'}`}>Danh mục SP</button>
                        <button onClick={() => setViewMode('scan')} className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${viewMode === 'scan' ? 'bg-blue-50 text-blue-600 shadow-sm border border-blue-100' : 'text-slate-400 hover:bg-slate-50'}`}>AI Smart Import</button>
                    </div>

                    {viewMode === 'catalog' ? (
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex gap-2">
                                <SearchInput value={productSearch} onChange={setProductSearch} placeholder="Tìm tên, mã SKU..." className="flex-1 h-11" />
                                <button onClick={() => setIsCreateProductOpen(true)} className="size-11 rounded-xl bg-indigo-600 text-white shadow-lg flex items-center justify-center shrink-0 hover:scale-105 transition-transform"><span className="material-symbols-outlined">add</span></button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                                {filteredProducts.map(p => (
                                    <div key={p.id} onClick={() => addItem(p)} className="p-4 bg-white dark:bg-slate-900 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 cursor-pointer hover:border-emerald-500 hover:shadow-xl transition-all group flex items-center gap-4 active:scale-95">
                                        <div className="size-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 font-black text-xs uppercase shrink-0 group-hover:bg-emerald-50 group-hover:text-emerald-600">{p.sku.charAt(0)}</div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-black text-slate-900 dark:text-white truncate uppercase tracking-tighter">{p.name}</p>
                                            <div className="flex justify-between items-center mt-1">
                                                <span className="text-[10px] font-mono font-bold text-slate-400">{p.sku}</span>
                                                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 rounded">{formatCurrency(p.importPrice).replace(' VND','')}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center group cursor-pointer hover:bg-blue-50/30 transition-colors" onClick={() => fileInputRef.current?.click()}>
                            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,.pdf,.xlsx,.xls,.csv" className="hidden" />
                            <div className={`size-24 rounded-[2.5rem] bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 mb-8 group-hover:scale-110 transition-transform ${isOcrLoading ? 'animate-bounce' : ''}`}>
                                <span className="material-symbols-outlined text-[48px]">{isOcrLoading ? 'sync' : 'document_scanner'}</span>
                            </div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight mb-3">AI Smart Import</h3>
                            <p className="text-sm text-slate-500 leading-relaxed max-w-[280px] font-medium">Hỗ trợ đọc hóa đơn từ: <br/><b>Ảnh chụp, File PDF, Excel, CSV</b></p>
                            {isOcrLoading && <div className="mt-8 text-[10px] font-black uppercase text-blue-600 tracking-widest animate-pulse">Đang giải mã dữ liệu...</div>}
                        </div>
                    )}
                </div>

                {/* Main Manifest Grid */}
                <div className="flex-1 flex flex-col p-8 gap-6 min-w-0 bg-white dark:bg-slate-900">
                    <div className="grid grid-cols-12 gap-6 items-end shrink-0 relative z-20">
                        <div className="col-span-12 md:col-span-5 relative" ref={supplierDropdownRef}>
                            <FormField label="Nhà cung cấp đối tác" required>
                                {selectedSupplier ? (
                                    <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 rounded-2xl p-3 h-12">
                                        <div className="flex items-center gap-3">
                                            <div className="size-8 rounded-xl bg-emerald-100 flex items-center justify-center font-black text-xs text-emerald-600 shadow-sm">{selectedSupplier.name.charAt(0)}</div>
                                            <p className="text-sm font-black text-emerald-800 dark:text-emerald-400 uppercase truncate max-w-[180px]">{selectedSupplier.name}</p>
                                        </div>
                                        <button onClick={() => setSelectedSupplier(null)} className="text-emerald-400 hover:text-emerald-600"><span className="material-symbols-outlined text-[18px]">close</span></button>
                                    </div>
                                ) : (
                                    <FormInput value={supplierSearch} onChange={e => { setSupplierSearch(e.target.value); setIsSupplierDropdownOpen(true); }} onFocus={() => setIsSupplierDropdownOpen(true)} placeholder="Tìm tên hoặc SĐT nhà cung cấp..." className="h-12 font-bold" icon="store" />
                                )}
                            </FormField>
                            {isSupplierDropdownOpen && filteredSuppliers.length > 0 && !selectedSupplier && (
                                <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-[100] overflow-hidden animate-fadeIn">
                                    {filteredSuppliers.map(s => (
                                        <div key={s.id} onClick={() => { setSelectedSupplier(s); setIsSupplierDropdownOpen(false); }} className="px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-3 border-b border-slate-100 last:border-0">
                                            <span className="material-symbols-outlined text-slate-400">store</span>
                                            <div><p className="text-sm font-black text-slate-900 dark:text-white uppercase">{s.name}</p><p className="text-[10px] text-slate-500 font-bold">{s.phone}</p></div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="col-span-12 md:col-span-3">
                            <FormField label="Ngày thực nhập"><FormInput type="date" value={importDate} onChange={e => setImportDate(e.target.value)} className="h-12 font-bold" /></FormField>
                        </div>
                        <div className="col-span-12 md:col-span-4">
                            <FormField label="Số hóa đơn NCC"><FormInput value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className="h-12 font-mono font-bold uppercase" placeholder="HD-..." /></FormField>
                        </div>
                    </div>

                    <div className="flex-1 bg-slate-50/50 dark:bg-slate-950/30 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col relative min-h-0">
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-sm text-left border-separate border-spacing-0">
                                <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-slate-800/95 backdrop-blur-md text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                    <tr>
                                        <th className="px-8 py-5 border-b border-slate-200">Mặt hàng kê khai</th>
                                        <th className="px-2 py-5 text-center border-b border-slate-200 w-28">Số lượng</th>
                                        <th className="px-4 py-5 text-right border-b border-slate-200 w-40">Đơn giá vốn</th>
                                        <th className="px-8 py-5 text-right border-b border-slate-200 w-44">Thành tiền</th>
                                        <th className="px-4 py-5 w-16 border-b border-slate-200"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {items.length > 0 ? items.map((item, idx) => (
                                        <tr key={idx} className="group hover:bg-white dark:hover:bg-slate-900 transition-colors">
                                            <td className="px-8 py-4">
                                                <p className="font-black text-slate-900 dark:text-white uppercase tracking-tight">{item.productName}</p>
                                                <p className="text-[10px] font-mono font-bold text-slate-400 mt-1">{item.sku}</p>
                                            </td>
                                            <td className="px-2 py-4">
                                                <NumericInput value={item.quantity} onChange={v => updateItem(item.id, { quantity: v })} className="h-10 text-center font-black bg-white dark:bg-slate-800 border-2 border-slate-200 focus:border-emerald-500 text-emerald-600" />
                                            </td>
                                            <td className="px-4 py-4">
                                                <NumericInput value={item.price} onChange={v => updateItem(item.id, { price: v })} className="h-10 text-right font-black bg-transparent border-b-2 border-dashed border-slate-300 focus:border-solid focus:border-emerald-500" />
                                            </td>
                                            <td className="px-8 py-4 text-right font-black text-slate-900 dark:text-white text-base">
                                                {formatCurrency(item.total).replace(' VND', '')}
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <button onClick={() => removeItem(item.id)} className="size-8 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan={5} className="py-24 text-center"><div className="flex flex-col items-center opacity-30"><span className="material-symbols-outlined text-6xl mb-4">playlist_add</span><p className="text-sm font-black uppercase tracking-[0.2em]">Kê khai hàng hóa ở bảng bên trái</p></div></td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Sub-footer for financial adjustments */}
                        <div className="p-8 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0 grid grid-cols-12 gap-8 items-start">
                            <div className="col-span-5">
                                <FormField label="Ghi chú chứng từ"><FormTextarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="bg-slate-50 text-xs border-none" placeholder="Lưu ý về lô hàng, phương thức vận chuyển..." /></FormField>
                            </div>
                            <div className="col-span-7 grid grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <FormField label="Chi phí vận chuyển / Bốc xếp">
                                        <NumericInput value={extraCosts} onChange={setExtraCosts} className="h-11 font-bold text-orange-600" suffix="VNĐ" />
                                    </FormField>
                                    <FormField label="Kho hàng nhập đích">
                                        <FormSelect value={warehouse} onChange={e => setWarehouse(e.target.value)} className="h-11 font-black uppercase">
                                            {WAREHOUSE_CONFIG.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                                        </FormSelect>
                                    </FormField>
                                </div>
                                <div className="space-y-4">
                                    <FormField label="Thanh toán ngay (Tiền mặt/CK)">
                                        <div className="flex gap-2">
                                            <NumericInput value={amountPaid} onChange={setAmountPaid} className="h-11 font-black text-emerald-600" />
                                            <button onClick={() => setAmountPaid(totalAmount)} className="px-3 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black border border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all">ALL</button>
                                        </div>
                                    </FormField>
                                    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center border border-slate-100 dark:border-slate-800">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dư nợ NCC dự kiến:</span>
                                        <span className={`text-sm font-black ${totalAmount - amountPaid > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(totalAmount - amountPaid)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <CreateProductModal isOpen={isCreateProductOpen} onClose={() => setIsCreateProductOpen(false)} onSubmit={async (d) => { const id = await addProduct(d as Product); addItem({...d, id} as Product); }} mode="create" />
        </Modal>
    );
};