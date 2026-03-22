
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { useApp as useAppContext } from '../hooks/useApp';
import { TransactionType, Partner } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Primitives';
import { FormField, FormInput, FormSelect, FormTextarea, NumericInput } from './ui/Form';
import { parseTransactionText, scanReceiptImage } from '../services/ai';
import { removeVietnameseTones, readMoney } from '../utils/helpers';
import { detectTransactionCategory } from '../utils/categoryIntelligence';

interface ManualTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const EXPENSE_CATEGORIES = [
    { value: 'salary', label: 'Lương nhân viên', icon: 'badge' },
    { value: 'rent', label: 'Tiền mặt bằng', icon: 'storefront' },
    { value: 'utilities', label: 'Điện / Nước / Net', icon: 'bolt' },
    { value: 'marketing', label: 'Marketing / Ads', icon: 'campaign' },
    { value: 'maintenance', label: 'Bảo trì máy móc', icon: 'build' },
    { value: 'tax', label: 'Thuế / Lệ phí', icon: 'account_balance' },
    { value: 'import', label: 'Thanh toán NCC', icon: 'shopping_bag' },
    { value: 'drawing', label: 'Rút vốn chủ sở hữu', icon: 'savings' },
    { value: 'other', label: 'Chi phí khác', icon: 'category' }
];

const INCOME_CATEGORIES = [
    { value: 'sale', label: 'Doanh thu bán lẻ', icon: 'point_of_sale' },
    { value: 'debt_collection', label: 'Thu nợ khách hàng', icon: 'request_quote' },
    { value: 'manual', label: 'Góp vốn / Đầu tư', icon: 'attach_money' },
    { value: 'other', label: 'Thu nhập khác', icon: 'auto_graph' }
];

export const ManualTransactionModal: React.FC<ManualTransactionModalProps> = ({ isOpen, onClose }) => {
    const { addManualTransaction, showNotification } = useAppContext();
    const partners = useLiveQuery(() => db.partners.filter(p => !p.isDeleted).toArray()) || [];
    
    // Core Data
    const [type, setType] = useState<TransactionType>('expense');
    const [amount, setAmount] = useState<number>(0);
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [method, setMethod] = useState<'cash' | 'transfer'>('cash');
    const [category, setCategory] = useState('other');
    const [description, setDescription] = useState('');
    const [partnerName, setPartnerName] = useState(''); 
    
    // UI Logic States
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [smartInput, setSmartInput] = useState('');
    const [isAutoCategory, setIsAutoCategory] = useState(false);
    const [manualCategoryLock, setManualCategoryLock] = useState(false);
    const [isPartnerDropdownOpen, setIsPartnerDropdownOpen] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const partnerInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) resetForm();
    }, [isOpen]);

    // REAL-TIME CATEGORY SUGGESTION (Keyword matching)
    useEffect(() => {
        if (manualCategoryLock) return;
        const timer = setTimeout(() => {
            const suggested = detectTransactionCategory(description, type);
            if (suggested && suggested !== category) {
                setCategory(suggested);
                setIsAutoCategory(true);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [description, type, manualCategoryLock, category]);

    const resetForm = () => {
        setType('expense');
        setAmount(0);
        setDate(new Date().toISOString().slice(0, 10));
        setMethod('cash');
        setCategory('other');
        setDescription('');
        setPartnerName('');
        setSmartInput('');
        setIsAiProcessing(false);
        setIsPartnerDropdownOpen(false);
        setManualCategoryLock(false);
        setIsAutoCategory(false);
    };

    const filteredPartners = useMemo(() => {
        if (!partnerName) return [];
        const norm = removeVietnameseTones(partnerName);
        return partners.filter(p => 
            removeVietnameseTones(p.name).includes(norm) || 
            p.phone.includes(partnerName)
        ).slice(0, 5);
    }, [partnerName, partners]);

    const handleSmartAnalyze = async () => {
        if (!smartInput.trim()) return;
        setIsAiProcessing(true);
        try {
            const result = await parseTransactionText(smartInput);
            if (result.type) { setType(result.type); setManualCategoryLock(false); }
            if (result.amount) setAmount(result.amount);
            if (result.category) setCategory(result.category);
            if (result.description) setDescription(result.description);
            if (result.date) setDate(result.date);
            showNotification('AI đã hoàn thiện thông số phiếu!', 'success');
        } catch (e) {
            showNotification('AI không hiểu ý định. Vui lòng nhập tay.', 'warning');
        } finally {
            setIsAiProcessing(false);
        }
    };

    const handleReceiptScan = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = (event.target?.result as string).split(',')[1];
            setIsAiProcessing(true);
            try {
                const result = await scanReceiptImage(base64);
                setType('expense');
                setManualCategoryLock(false);
                if (result.total) setAmount(result.total);
                if (result.date) setDate(result.date);
                if (result.merchant) setPartnerName(result.merchant);
                if (result.category) setCategory(result.category);
                setDescription(`Chi phí từ hóa đơn: ${result.merchant || 'đối tác'}`);
                showNotification('Đã quét hóa đơn bằng AI!', 'success');
            } catch (err) {
                showNotification('Không đọc được nội dung hóa đơn.', 'error');
            } finally {
                setIsAiProcessing(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = async () => {
        if (amount <= 0) { showNotification('Vui lòng nhập số tiền hợp lệ', 'error'); return; }
        if (!description.trim()) { showNotification('Vui lòng nhập nội dung phiếu', 'error'); return; }

        setIsSubmitting(true);
        try {
            await addManualTransaction({
                type, amount, date, method, category,
                description: description.trim(),
                partnerName: partnerName.trim()
            });
            onClose();
        } catch (e: any) {
            showNotification(e.message || 'Lỗi ghi sổ quỹ', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const themeColor = type === 'income' ? 'emerald' : 'rose';
    const accentButton = type === 'income' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/30' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/30';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={type === 'income' ? 'Lập Phiếu Thu Tiền' : 'Lập Phiếu Chi Tiền'}
            subtitle="Chứng từ ghi sổ quỹ nội bộ"
            size="2xl"
            footer={
                <div className="flex gap-4 w-full">
                    <Button variant="secondary" onClick={onClose} disabled={isSubmitting} className="flex-1 h-12 rounded-2xl">Bỏ qua</Button>
                    <Button 
                        variant="primary" 
                        icon="verified" 
                        onClick={handleSubmit} 
                        loading={isSubmitting} 
                        className={`flex-[2] h-12 rounded-2xl shadow-xl transition-all hover:scale-[1.02] ${accentButton}`}
                    >
                        Xác nhận ghi sổ
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col lg:flex-row gap-8 min-h-[500px]">
                {/* 1. LEFT PANEL: CORE INFO */}
                <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
                    {/* TYPE TOGGLE */}
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shrink-0">
                        <button 
                            onClick={() => { setType('income'); setManualCategoryLock(false); }} 
                            className={`flex-1 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${type === 'income' ? 'bg-white text-emerald-600 shadow-md ring-1 ring-emerald-500/10' : 'text-slate-500 hover:text-emerald-600'}`}
                        >
                            Phiếu Thu (+)
                        </button>
                        <button 
                            onClick={() => { setType('expense'); setManualCategoryLock(false); }} 
                            className={`flex-1 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${type === 'expense' ? 'bg-white text-rose-600 shadow-md ring-1 ring-rose-500/10' : 'text-slate-500 hover:text-rose-600'}`}
                        >
                            Phiếu Chi (-)
                        </button>
                    </div>

                    {/* HERO AMOUNT INPUT */}
                    <div className={`p-6 rounded-[2.5rem] border-2 transition-colors relative overflow-hidden ${type === 'income' ? 'bg-emerald-50/50 border-emerald-200' : 'bg-rose-50/50 border-rose-200'}`}>
                        <div className="relative z-10 flex flex-col items-center">
                            <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-3 ${type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>Số tiền ghi sổ</p>
                            <NumericInput 
                                value={amount} 
                                onChange={setAmount} 
                                className={`!bg-transparent !border-none !ring-0 text-5xl font-black p-0 h-auto text-center tracking-tighter w-full ${type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}
                                placeholder="0"
                                autoFocus
                            />
                            <p className="text-[10px] font-bold text-slate-400 mt-4 italic uppercase tracking-wider">{readMoney(amount)}</p>
                        </div>
                        <span className={`material-symbols-outlined absolute -bottom-4 -right-4 text-[100px] opacity-[0.05] pointer-events-none ${type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>monetization_on</span>
                    </div>

                    {/* CATEGORY GRID */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phân loại hạng mục</label>
                            {isAutoCategory && (
                                <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full animate-fadeIn flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px]">auto_awesome</span> Gợi ý AI
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {categories.map(c => (
                                <button
                                    key={c.value}
                                    onClick={() => { setCategory(c.value); setManualCategoryLock(true); setIsAutoCategory(false); }}
                                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all gap-2 ${
                                        category === c.value 
                                        ? `bg-${themeColor}-50 border-${themeColor}-500 text-${themeColor}-700 shadow-sm` 
                                        : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-300 text-slate-500'
                                    }`}
                                >
                                    <span className={`material-symbols-outlined text-[22px] ${category === c.value ? 'filled-icon' : ''}`}>{c.icon}</span>
                                    <span className="text-[10px] font-bold text-center leading-tight uppercase tracking-tight">{c.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* DESCRIPTION & PARTNER */}
                    <div className="space-y-4">
                        <FormField label="Nội dung diễn giải" required>
                            <FormTextarea 
                                value={description} 
                                onChange={e => setDescription(e.target.value)} 
                                placeholder="VD: Chi tiền thuê kho tháng 6..." 
                                rows={2}
                                className="bg-slate-50 dark:bg-slate-900 border-slate-200 focus:bg-white text-sm font-bold"
                            />
                        </FormField>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Ngày thực hiện"><FormInput type="date" value={date} onChange={e => setDate(e.target.value)} className="h-11 font-bold" /></FormField>
                            <FormField label="Hình thức">
                                <FormSelect value={method} onChange={e => setMethod(e.target.value as any)} className="h-11 font-bold">
                                    <option value="cash">Tiền mặt (Cash)</option>
                                    <option value="transfer">Chuyển khoản (Bank)</option>
                                </FormSelect>
                            </FormField>
                        </div>

                        <FormField label="Đối tác (Người nhận/nộp)">
                            <div className="relative" ref={partnerInputRef}>
                                <FormInput 
                                    value={partnerName} 
                                    onChange={e => { setPartnerName(e.target.value); setIsPartnerDropdownOpen(true); }}
                                    onFocus={() => setIsPartnerDropdownOpen(true)}
                                    placeholder="Tìm tên hoặc SĐT đối tác..." 
                                    className="h-11 font-bold"
                                    icon="person_search"
                                    autoComplete="off"
                                />
                                {isPartnerDropdownOpen && filteredPartners.length > 0 && (
                                    <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden animate-fadeIn">
                                        {filteredPartners.map(p => (
                                            <div 
                                                key={p.id} 
                                                onClick={() => { setPartnerName(p.name); setIsPartnerDropdownOpen(false); }}
                                                className="px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-0 group flex justify-between items-center"
                                            >
                                                <div>
                                                    <p className="text-sm font-black text-slate-900 dark:text-white uppercase">{p.name}</p>
                                                    <p className="text-[10px] text-slate-500 font-bold">{p.phone}</p>
                                                </div>
                                                <span className="material-symbols-outlined text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">add_circle</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </FormField>
                    </div>
                </div>

                {/* 2. RIGHT PANEL: AI TOOLS */}
                <div className={`w-full lg:w-[300px] shrink-0 flex flex-col gap-6 bg-${themeColor}-50/30 dark:bg-${themeColor}-900/10 p-6 rounded-[2.5rem] border border-${themeColor}-100 dark:border-${themeColor}-900/30`}>
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="size-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                <span className={`material-symbols-outlined text-[18px] ${isAiProcessing ? 'animate-spin' : ''}`}>
                                    {isAiProcessing ? 'sync' : 'auto_awesome'}
                                </span>
                            </div>
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Trợ lý nhập liệu AI</span>
                        </div>
                        
                        <div className="space-y-3">
                            <textarea 
                                value={smartInput}
                                onChange={e => setSmartInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSmartAnalyze())}
                                placeholder="VD: Sếp chi 10 triệu tiền lương cho bạn Tuấn hôm nay..."
                                className="w-full text-xs font-medium bg-slate-50 dark:bg-slate-800 border-none rounded-2xl p-4 resize-none focus:ring-2 focus:ring-indigo-500/20 leading-relaxed shadow-inner"
                                rows={4}
                            />
                            <Button 
                                onClick={handleSmartAnalyze}
                                disabled={!smartInput.trim() || isAiProcessing}
                                className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                            >
                                Phân tích văn bản
                            </Button>
                        </div>

                        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                             <input type="file" ref={fileInputRef} onChange={handleReceiptScan} className="hidden" accept="image/*" />
                             <button 
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isAiProcessing}
                                className="w-full flex items-center justify-center gap-3 p-3 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-all group"
                             >
                                <span className="material-symbols-outlined group-hover:scale-110 transition-transform">document_scanner</span>
                                <span className="text-[10px] font-black uppercase">Quét hóa đơn/ảnh</span>
                             </button>
                        </div>
                    </div>

                    <div className="mt-auto space-y-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase text-center tracking-[0.2em]">Gợi ý số tiền nhanh</p>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {[500000, 1000000, 5000000, 10000000].map(val => (
                                <button 
                                    key={val}
                                    onClick={() => setAmount(val)}
                                    className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 text-[10px] font-black shadow-sm hover:shadow-md hover:border-indigo-300 transition-all border border-slate-100 dark:border-slate-700"
                                >
                                    {val.toLocaleString()}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
