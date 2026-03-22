
import React, { useState, useEffect } from 'react';
import { DocTypeConfig, AppSettings, TemplateSection, TableColumnConfig } from '../../types';
import { TemplateEngine } from './TemplateEngine';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Primitives';
import { FormField, FormInput, FormTextarea } from '../ui/Form';

const DEFAULT_SECTIONS: TemplateSection[] = [
    { id: 'header', visible: true, order: 0, label: 'Tiêu đề & Logo' },
    { id: 'customer_info', visible: true, order: 1, label: 'Thông tin đối tác' },
    { id: 'items_table', visible: true, order: 2, label: 'Bảng danh sách hàng' },
    { id: 'totals', visible: true, order: 3, label: 'Tổng cộng & Bằng chữ' },
    { id: 'notes', visible: true, order: 4, label: 'Ghi chú' },
    { id: 'signatures', visible: true, order: 5, label: 'Ký tên' },
    { id: 'footer_note', visible: true, order: 6, label: 'Lời chào cuối trang' },
];

const DEFAULT_COLUMNS: TableColumnConfig[] = [
    { key: 'stt', label: 'STT', visible: true, width: 'w-10', align: 'center' },
    { key: 'sku', label: 'Mã SKU', visible: false, width: 'w-24' },
    { key: 'name', label: 'MÃ SẢN PHẨM', visible: true },
    { key: 'unit', label: 'ĐVT', visible: true, width: 'w-16', align: 'center' },
    { key: 'quantity', label: 'Số lượng', visible: true, width: 'w-24', align: 'center' },
    { key: 'price', label: 'Đơn giá', visible: true, width: 'w-24', align: 'right' },
    { key: 'total', label: 'Thành tiền', visible: true, width: 'w-28', align: 'right' },
];

const MOCK_DATA_MAP = {
    order: {
        code: 'HDBH-2405-001',
        date: '24/05/2024',
        customerName: 'CÔNG TY TNHH CƠ KHÍ AN PHÁT',
        address: 'Số 45, KCN Vĩnh Lộc, Bình Chánh, TP.HCM',
        phone: '0908 456 789',
        taxId: '0312345678',
        paymentMethod: 'transfer',
        items: [
            { productName: 'Vòng bi cầu SKF 6205-2RS1', sku: 'SKF-6205', unit: 'Cái', quantity: 20, price: 125000, total: 2500000 },
            { productName: 'Vòng bi đũa FAG NU 210 ECP', sku: 'FAG-NU210', unit: 'Cái', quantity: 5, price: 850000, total: 4250000 },
            { productName: 'Dây curoa B-52 Mitsuboshi', sku: 'BELT-B52', unit: 'Sợi', quantity: 15, price: 95000, total: 1425000 },
        ],
        subtotal: 8175000,
        discount: 175000,
        vatRate: 8,
        vatAmount: 640000,
        total: 8640000,
        notes: 'Giao hàng kèm biên bản đối soát.'
    },
    quote: {
        code: 'BG-2024-88',
        date: '24/05/2024',
        validUntil: '31/05/2024',
        customerName: 'CỬA HÀNG PHỤ TÙNG MINH QUANG',
        address: 'Quận 7, TP.HCM',
        phone: '0912 333 444',
        taxId: '0309876543',
        items: [
            { productName: 'Vòng bi côn Timken 32210', sku: 'TMK-32210', unit: 'Bộ', quantity: 10, price: 450000, total: 4500000 },
            { productName: 'Mỡ bò Shell Gadus S2 V220', sku: 'SHELL-G2', unit: 'Xô', quantity: 2, price: 1850000, total: 3700000 },
        ],
        subtotal: 8200000,
        discount: 200000,
        vatRate: 0,
        vatAmount: 0,
        total: 8000000,
        notes: 'Báo giá có giá trị trong vòng 7 ngày.'
    },
    import: {
        code: 'PNK-24-009',
        date: '24/05/2024',
        supplierName: 'TỔNG KHO NSK VIỆT NAM',
        warehouse: 'Kho Chính',
        taxId: '0101234567',
        items: [
            { productName: 'Vòng bi cầu NSK 6204-ZZ', sku: 'NSK-6204', unit: 'Cái', quantity: 500, price: 42000, total: 21000000 },
        ],
        total: 21000000,
        notes: 'Nhập hàng lô đầu tháng 5.'
    },
    delivery: {
        code: 'PGH-24-112',
        date: '24/05/2024',
        orderCode: 'DH-TC-99',
        customerName: 'CÔNG TY CƠ KHÍ TOÀN CẦU',
        address: 'Số 12, Đường số 5, Q.7, TP.HCM',
        taxId: '0315556667',
        shipperName: 'Nguyễn Văn Giao',
        items: [
            { productName: 'Vòng bi đũa FAG NU 210 ECP', sku: 'FAG-NU210', unit: 'Cái', quantity: 5, price: 850000, total: 4250000 },
            { productName: 'Dây curoa B-52 Mitsuboshi', sku: 'BELT-B52', unit: 'Sợi', quantity: 15, price: 95000, total: 1425000 },
        ],
        subtotal: 5675000,
        total: 5675000,
        discount: 0
    }
};

interface TemplateEditorProps {
    isOpen: boolean;
    onClose: () => void;
    initialConfig: DocTypeConfig;
    onSave: (config: DocTypeConfig) => void;
    settings: AppSettings;
    type: 'order' | 'quote' | 'import' | 'delivery';
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ isOpen, onClose, initialConfig, onSave, settings, type }) => {
    const [config, setConfig] = useState<DocTypeConfig>(initialConfig);
    const [activeTab, setActiveTab] = useState<'layout' | 'content' | 'style'>('layout');
    const [zoomLevel, setZoomLevel] = useState(0.85); // Default zoom fit

    useEffect(() => {
        if (isOpen) {
            const sections = (initialConfig.sections && initialConfig.sections.length > 0) 
                ? initialConfig.sections 
                : DEFAULT_SECTIONS;
            const columns = (initialConfig.columns && initialConfig.columns.length > 0)
                ? initialConfig.columns
                : DEFAULT_COLUMNS;

            setConfig({
                ...initialConfig,
                sections,
                columns,
                signatures: initialConfig.signatures || [],
                colorTheme: initialConfig.colorTheme || '#1e3a8a',
                signatureOptions: initialConfig.signatureOptions || {
                    showTitle: true, showStamp: true, showFullName: true
                }
            });
        }
    }, [isOpen, initialConfig]);

    const handleSectionToggle = (id: string) => {
        const newSections = config.sections!.map(s => s.id === id ? { ...s, visible: !s.visible } : s);
        setConfig({ ...config, sections: newSections });
    };

    const moveSection = (index: number, direction: 'up' | 'down') => {
        const newSections = [...config.sections!];
        if (direction === 'up' && index > 0) {
            [newSections[index], newSections[index - 1]] = [newSections[index - 1], newSections[index]];
        } else if (direction === 'down' && index < newSections.length - 1) {
            [newSections[index], newSections[index + 1]] = [newSections[index + 1], newSections[index]];
        }
        newSections.forEach((s, i) => s.order = i);
        setConfig({ ...config, sections: newSections });
    };

    const handleSigOptionToggle = (key: keyof Exclude<DocTypeConfig['signatureOptions'], undefined>) => {
        const current = config.signatureOptions || { showTitle: true, showStamp: true, showFullName: true };
        setConfig({
            ...config,
            signatureOptions: { ...current, [key]: !current[key] }
        });
    };

    const handleSignatureLabelChange = (index: number, value: string) => {
        const newSignatures = [...(config.signatures || [])];
        newSignatures[index] = value;
        setConfig({ ...config, signatures: newSignatures });
    };

    const addSignature = () => {
        setConfig({ ...config, signatures: [...(config.signatures || []), 'Người ký mới'] });
    };

    const removeSignature = (index: number) => {
        const newSignatures = [...(config.signatures || [])];
        newSignatures.splice(index, 1);
        setConfig({ ...config, signatures: newSignatures });
    };

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Thiết kế Mẫu in: ${type === 'order' ? 'Hóa đơn' : type === 'quote' ? 'Báo giá' : type === 'import' ? 'Nhập kho' : 'Giao hàng'}`}
            size="full"
            footer={
                <div className="flex justify-between w-full items-center">
                    <div className="flex items-center gap-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60">Chuẩn A4 (210x297mm) • DPI: 300</p>
                        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700"></div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))} className="size-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"><span className="material-symbols-outlined text-[14px]">remove</span></button>
                            <span className="text-xs font-bold w-10 text-center text-slate-600">{(zoomLevel * 100).toFixed(0)}%</span>
                            <button onClick={() => setZoomLevel(Math.min(1.5, zoomLevel + 0.1))} className="size-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center"><span className="material-symbols-outlined text-[14px]">add</span></button>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={onClose} className="rounded-xl px-6 h-10 text-xs font-bold uppercase tracking-wide bg-slate-100 text-slate-500 border-none">Hủy bỏ</Button>
                        <Button variant="primary" onClick={() => onSave(config)} icon="save" className="rounded-xl px-8 h-10 bg-blue-600 shadow-xl shadow-blue-600/30 text-xs font-bold uppercase tracking-wide">Lưu mẫu</Button>
                    </div>
                </div>
            }
        >
            <div className="flex h-[calc(100vh-200px)] gap-0 overflow-hidden -m-8">
                
                {/* 1. CONFIGURATION SIDEBAR */}
                <div className="w-[360px] flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                    <div className="p-6 pb-2">
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl">
                            {['layout', 'content', 'style'].map((tab) => (
                                <button 
                                    key={tab}
                                    onClick={() => setActiveTab(tab as any)}
                                    className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                                        activeTab === tab 
                                        ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' 
                                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                                >
                                    {tab === 'layout' ? 'Bố cục' : tab === 'content' ? 'Nội dung' : 'Giao diện'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                        {activeTab === 'layout' && (
                            <div className="animate-fadeIn space-y-8">
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[14px]">view_agenda</span> Các phần hiển thị
                                    </h4>
                                    <div className="space-y-2">
                                        {(config.sections || []).sort((a,b) => a.order - b.order).map((section, idx) => (
                                            <div key={section.id} className={`flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border transition-all group ${section.visible ? 'border-slate-200 dark:border-slate-700' : 'opacity-60 border-transparent bg-slate-50/50'}`}>
                                                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => moveSection(idx, 'up')} disabled={idx === 0} className="text-slate-300 hover:text-blue-600 disabled:opacity-0"><span className="material-symbols-outlined text-[14px]">keyboard_arrow_up</span></button>
                                                    <button onClick={() => moveSection(idx, 'down')} disabled={idx === config.sections!.length - 1} className="text-slate-300 hover:text-blue-600 disabled:opacity-0"><span className="material-symbols-outlined text-[14px]">keyboard_arrow_down</span></button>
                                                </div>
                                                <div className="flex-1">
                                                    <span className={`text-xs font-bold uppercase ${section.visible ? 'text-slate-700 dark:text-white' : 'text-slate-400 line-through'}`}>{section.label || section.id}</span>
                                                </div>
                                                <button 
                                                    onClick={() => handleSectionToggle(section.id)} 
                                                    className={`size-8 rounded-lg flex items-center justify-center transition-all ${section.visible ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-200 text-slate-400 dark:bg-slate-800'}`}
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">{section.visible ? 'visibility' : 'visibility_off'}</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[14px]">table_chart</span> Cột bảng hàng hóa
                                    </h4>
                                    <div className="space-y-1">
                                        {(config.columns || []).map(col => (
                                            <div key={col.key} className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors group">
                                                <input 
                                                    type="checkbox" 
                                                    checked={col.visible} 
                                                    disabled={col.key === 'name'}
                                                    onChange={() => {
                                                        const newCols = config.columns!.map(c => c.key === col.key ? { ...c, visible: !c.visible } : c);
                                                        setConfig({...config, columns: newCols});
                                                    }} 
                                                    className="size-4 rounded border-slate-300 text-blue-600 disabled:opacity-50 cursor-pointer" 
                                                />
                                                <input 
                                                    value={col.label} 
                                                    onChange={(e) => {
                                                        const newCols = config.columns!.map(c => c.key === col.key ? { ...c, label: e.target.value } : c);
                                                        setConfig({...config, columns: newCols});
                                                    }} 
                                                    className={`flex-1 bg-transparent border-none text-xs font-bold p-0 focus:ring-0 ${col.visible ? 'text-slate-700 dark:text-white' : 'text-slate-400'}`} 
                                                />
                                                {col.visible && <span className="material-symbols-outlined text-[14px] text-emerald-500 opacity-0 group-hover:opacity-100">check</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'content' && (
                            <div className="animate-fadeIn space-y-6">
                                <FormField label="Tiêu đề chứng từ (H1)">
                                    <FormInput value={config.title} onChange={e => setConfig({...config, title: e.target.value.toUpperCase()})} className="font-black text-blue-600 text-sm uppercase" />
                                </FormField>
                                <FormField label="Lời chào cuối trang">
                                    <FormTextarea value={config.footerNote} onChange={e => setConfig({...config, footerNote: e.target.value})} rows={3} className="text-xs font-bold bg-slate-50" />
                                </FormField>
                                <FormField label="Ghi chú cố định (Quy định/Điều khoản)">
                                    <FormTextarea 
                                        value={config.notes || ''} 
                                        onChange={e => setConfig({...config, notes: e.target.value})} 
                                        rows={4} 
                                        className="text-xs font-medium bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30" 
                                        placeholder="Ví dụ: Quy định đổi trả, thông tin ngân hàng, điều khoản bảo hành..."
                                    />
                                </FormField>
                                
                                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Khu vực chữ ký</h4>
                                    
                                    {/* Signature Items Management */}
                                    <div className="space-y-2 mb-4">
                                        <p className="text-[10px] font-bold text-slate-500">Các vị trí ký tên (Thứ tự từ trái qua phải)</p>
                                        {(config.signatures || []).map((sig, idx) => (
                                            <div key={idx} className="flex gap-2">
                                                <input 
                                                    value={sig} 
                                                    onChange={(e) => handleSignatureLabelChange(idx, e.target.value)}
                                                    className="flex-1 text-xs font-bold border border-slate-300 rounded px-2 py-1.5 focus:border-blue-500 outline-none uppercase"
                                                />
                                                <button 
                                                    onClick={() => removeSignature(idx)}
                                                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                                                    title="Xóa vị trí này"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">delete</span>
                                                </button>
                                            </div>
                                        ))}
                                        <button 
                                            onClick={addSignature}
                                            className="w-full py-2 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg dashed border border-blue-200 flex items-center justify-center gap-1 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">add</span> Thêm vị trí ký
                                        </button>
                                    </div>

                                    <div className="border-t border-slate-200 pt-3 space-y-2">
                                        {[
                                            { key: 'showTitle', label: 'Hiện chức danh (Tiêu đề)' },
                                            { key: 'showStamp', label: 'Chừa chỗ đóng dấu' },
                                            { key: 'showFullName', label: 'Hiện dòng "(Ký, họ tên)"' }
                                        ].map(opt => (
                                            <label key={opt.key} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors">
                                                <input type="checkbox" checked={config.signatureOptions?.[opt.key as keyof typeof config.signatureOptions]} onChange={() => handleSigOptionToggle(opt.key as any)} className="size-4 rounded border-slate-300 text-blue-600" />
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{opt.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'style' && (
                            <div className="animate-fadeIn space-y-8">
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Màu sắc chủ đạo</h4>
                                    <div className="grid grid-cols-5 gap-3">
                                        {['#1e3a8a', '#dc2626', '#16a34a', '#d97706', '#0f172a'].map(color => (
                                            <button 
                                                key={color}
                                                onClick={() => setConfig({...config, colorTheme: color})}
                                                className={`size-10 rounded-full shadow-sm transition-all ${config.colorTheme === color ? 'ring-4 ring-offset-2 ring-blue-200 scale-110' : 'hover:scale-105'}`}
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                        <div className="relative size-10 rounded-full overflow-hidden border border-slate-200">
                                            <input type="color" value={config.colorTheme} onChange={e => setConfig({...config, colorTheme: e.target.value})} className="absolute inset-0 w-[150%] h-[150%] -top-[25%] -left-[25%] cursor-pointer" />
                                        </div>
                                    </div>
                                </div>
                                <FormField label="CSS Tùy biến (Advanced)">
                                    <FormTextarea value={config.customCss || ''} onChange={e => setConfig({...config, customCss: e.target.value})} rows={12} className="font-mono text-[10px] bg-slate-800 text-emerald-400 border-none rounded-xl p-3 leading-relaxed" placeholder="/* .custom-class { color: red; } */" />
                                </FormField>
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. PREVIEW PANEL */}
                <div className="flex-1 bg-slate-200/50 dark:bg-black/50 relative overflow-hidden flex flex-col items-center justify-start py-10 overflow-y-auto custom-scrollbar">
                    {/* Live Indicator */}
                    <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm border border-white/20">
                        <span className="size-2 rounded-full bg-red-500 animate-pulse"></span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Live Preview</span>
                    </div>

                    {/* Paper Container */}
                    <div 
                        className="bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-out origin-top"
                        style={{ 
                            width: '210mm', 
                            minHeight: '297mm', 
                            transform: `scale(${zoomLevel})`
                        }}
                    >
                        <TemplateEngine 
                            data={MOCK_DATA_MAP[type]} 
                            settings={settings} 
                            config={config} 
                            type={type} 
                        />
                    </div>
                </div>
            </div>
        </Modal>
    );
};
