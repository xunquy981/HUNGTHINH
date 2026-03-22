
import React, { useMemo } from 'react';
import { DocTypeConfig, AppSettings, TableColumnConfig } from '../../types';
import { formatCurrency, readMoney } from '../../utils/helpers';

const THEME_COLOR = '#1e3a8a'; // Navy Blue - Màu chủ đạo đồng bộ

interface TemplateEngineProps {
    data: any;
    settings: AppSettings;
    config: DocTypeConfig;
    type: 'order' | 'quote' | 'import' | 'delivery';
}

const TemplateHeader: React.FC<{ settings: AppSettings, title: string, code?: string, date: string, color?: string }> = ({ settings, title, code, date, color }) => (
    <div className="flex justify-between items-start mb-6 pb-4 border-b-2" style={{ borderColor: color || THEME_COLOR }}>
        <div className="flex gap-4 items-center">
            {settings.general.logo && (
                <img src={settings.general.logo} alt="Logo" className="h-16 w-auto object-contain" />
            )}
            <div>
                <h1 className="text-lg font-black uppercase tracking-tight leading-none mb-2 text-slate-900">{settings.general.name}</h1>
                <div className="text-[11px] text-slate-600 leading-snug space-y-0.5">
                    <p className="font-bold">{settings.general.address}</p>
                    <p><span className="font-bold uppercase opacity-60">SĐT:</span> {settings.general.phone}</p>
                    {settings.general.taxId && <p><span className="font-bold uppercase opacity-60">MST:</span> {settings.general.taxId}</p>}
                    {settings.general.email && <p><span className="font-bold uppercase opacity-60">Email:</span> {settings.general.email}</p>}
                    {settings.general.website && <p><span className="font-bold uppercase opacity-60">Web:</span> {settings.general.website}</p>}
                </div>
            </div>
        </div>
        <div className="text-right">
            <h2 className="text-2xl font-black uppercase tracking-tight" style={{ color: color || THEME_COLOR }}>{title}</h2>
            <div className="mt-1">
                {code && <p className="text-sm font-bold text-slate-800">{code}</p>}
                <p className="text-[11px] italic text-slate-500">Ngày: {date}</p>
            </div>
        </div>
    </div>
);

export const TemplateEngine: React.FC<TemplateEngineProps> = ({ data, settings, config, type }) => {
    // Determine effective configuration (fallback if missing)
    const effectiveSections = (config.sections && config.sections.length > 0) 
        ? config.sections 
        : [
            { id: 'header', visible: true, order: 0, label: 'Header' },
            { id: 'customer_info', visible: true, order: 1, label: 'Customer' },
            { id: 'items_table', visible: true, order: 2, label: 'Table' },
            { id: 'totals', visible: true, order: 3, label: 'Totals' },
            { id: 'notes', visible: true, order: 4, label: 'Notes' },
            { id: 'signatures', visible: true, order: 5, label: 'Signatures' },
            { id: 'footer_note', visible: true, order: 6, label: 'Footer' }
        ];

    const sortedSections = useMemo(() => {
        return [...effectiveSections].sort((a, b) => a.order - b.order);
    }, [effectiveSections]);

    const isSectionVisible = (id: string) => {
        const section = effectiveSections.find(s => s.id === id);
        return section ? section.visible : true;
    };

    const getThemeColor = () => config.colorTheme || THEME_COLOR;

    // --- RENDERERS ---

    const renderHeader = () => {
        if (!isSectionVisible('header')) return null;
        const title = config.title || (type === 'order' ? 'HÓA ĐƠN BÁN HÀNG' : type === 'quote' ? 'BÁO GIÁ' : type === 'import' ? 'PHIẾU NHẬP KHO' : 'PHIẾU GIAO HÀNG');
        return <TemplateHeader settings={settings} title={title} code={data.code} date={data.date} color={getThemeColor()} />;
    };

    const renderCustomerInfo = () => {
        if (!isSectionVisible('customer_info')) return null;
        
        // Data mapping depending on doc type
        const isImport = type === 'import';
        const targetName = isImport ? data.supplierName : data.customerName;
        // Đồng bộ nhãn: Nếu là phiếu giao hàng, vẫn dùng form khách hàng để đồng bộ với báo giá
        const targetLabel = isImport ? 'Đơn vị cung cấp' : 'Khách hàng / Đơn vị nhận';
        const targetAddress = data.address || (isImport ? '' : ''); 
        const targetPhone = data.phone || (data.shipperPhone ? `(Shipper: ${data.shipperPhone})` : '');
        const targetTaxId = data.taxId || '';

        return (
            <div className="mb-6 bg-slate-50 rounded-xl p-5 border border-slate-200 text-xs">
                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{targetLabel}</p>
                        <p className="font-black text-sm text-slate-900 uppercase mb-2">{targetName || 'KHÁCH LẺ'}</p>
                    </div>
                    
                    <div className="col-span-8 space-y-1">
                        {targetAddress && (
                            <p className="text-slate-700 flex items-start gap-2">
                                <span className="font-bold uppercase opacity-60 shrink-0 w-16">Địa chỉ:</span> 
                                <span>{targetAddress}</span>
                            </p>
                        )}
                        {targetPhone && (
                            <p className="text-slate-700 flex items-center gap-2">
                                <span className="font-bold uppercase opacity-60 shrink-0 w-16">SĐT:</span> 
                                <span>{targetPhone}</span>
                            </p>
                        )}
                        {targetTaxId && (
                            <p className="text-slate-700 flex items-center gap-2">
                                <span className="font-bold uppercase opacity-60 shrink-0 w-16">MST:</span> 
                                <span className="font-mono font-bold">{targetTaxId}</span>
                            </p>
                        )}
                    </div>

                    <div className="col-span-4 text-right flex flex-col justify-end">
                        {type === 'quote' && data.validUntil && (
                            <div className="p-2 bg-rose-50 border border-rose-100 rounded text-rose-700">
                                <p className="text-[9px] font-black uppercase mb-0.5">Hiệu lực báo giá</p>
                                <p className="font-black text-sm">{data.validUntil}</p>
                            </div>
                        )}
                        {type === 'delivery' && data.shipperName && (
                            <div className="p-2 bg-blue-50 border border-blue-100 rounded text-blue-700">
                                <p className="text-[9px] font-black uppercase mb-0.5">Nhân viên giao hàng</p>
                                <p className="font-black text-sm">{data.shipperName}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderItemsTable = () => {
        if (!isSectionVisible('items_table')) return null;

        // Use configured columns or fallbacks
        const columns: TableColumnConfig[] = (config.columns && config.columns.length > 0) 
            ? config.columns 
            : [
                { key: 'stt', label: 'STT', visible: true, width: 'w-10', align: 'center' },
                { key: 'name', label: 'Tên hàng hóa, quy cách', visible: true, align: 'left' },
                { key: 'unit', label: 'ĐVT', visible: true, width: 'w-16', align: 'center' },
                { key: 'quantity', label: 'SL', visible: true, width: 'w-24', align: 'center' },
                { key: 'price', label: 'Đơn giá', visible: true, width: 'w-24', align: 'right' },
                { key: 'total', label: 'Thành tiền', visible: true, width: 'w-28', align: 'right' },
            ];

        const visibleCols = columns.filter(c => c.visible);

        return (
            <div className="mb-6">
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="text-white" style={{ backgroundColor: getThemeColor() }}>
                            {visibleCols.map(col => (
                                <th 
                                    key={col.key} 
                                    className={`p-2 font-bold uppercase border border-white/20 text-${col.align || 'left'} ${col.width || ''}`}
                                >
                                    {col.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="text-slate-700">
                        {data.items.map((item: any, idx: number) => (
                            <tr key={idx} className="border-b border-slate-200">
                                {visibleCols.map(col => {
                                    let content: React.ReactNode = '';
                                    
                                    // Data Mapping Logic
                                    if (col.key === 'stt') content = idx + 1;
                                    else if (col.key === 'price') content = formatCurrency(item.price).replace(' VND', '');
                                    else if (col.key === 'total') content = formatCurrency(item.total).replace(' VND', '');
                                    else if (col.key === 'name') content = (
                                        <div>
                                            <span className="font-bold">{item.productName || item.name}</span>
                                            {item.sku && <div className="text-[10px] text-slate-500 font-mono">{item.sku}</div>}
                                        </div>
                                    );
                                    else if (col.key === 'sku') content = item.sku;
                                    else if (col.key === 'unit') content = item.unit;
                                    else if (col.key === 'quantity') content = item.quantity;
                                    else {
                                        // Fallback for custom keys
                                        content = item[col.key]; 
                                    }

                                    return (
                                        <td 
                                            key={col.key} 
                                            className={`p-2 border-x border-slate-200 text-${col.align || 'left'} align-top ${col.key === 'total' || col.key === 'price' ? 'font-mono' : ''}`}
                                        >
                                            {content}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderTotals = () => {
        if (!isSectionVisible('totals')) return null;
        
        // Ensure values exist
        const subtotal = data.subtotal ?? data.total ?? 0;
        const discount = data.discount ?? 0;
        const vat = data.vatAmount ?? 0;
        const extraCosts = data.extraCosts ?? 0;
        const vatRate = data.vatRate ?? 0;
        
        const displayTotal = data.total ?? 0;

        return (
            <div className="mb-8 break-inside-avoid">
                <div className="flex justify-end">
                    <div className="w-1/2 space-y-2 text-xs">
                        <div className="flex justify-between text-slate-600 border-b border-slate-100 pb-1">
                            <span>Cộng tiền hàng:</span>
                            <span className="font-bold">{formatCurrency(subtotal).replace(' VND', '')}</span>
                        </div>
                        
                        {discount > 0 && (
                            <div className="flex justify-between text-slate-600 border-b border-slate-100 pb-1">
                                <span>Chiết khấu:</span>
                                <span className="font-bold">-{formatCurrency(discount).replace(' VND', '')}</span>
                            </div>
                        )}
                        
                        {vat > 0 && (
                            <div className="flex justify-between text-slate-600 border-b border-slate-100 pb-1">
                                <span>Thuế GTGT ({vatRate}%):</span>
                                <span className="font-bold">{formatCurrency(vat).replace(' VND', '')}</span>
                            </div>
                        )}

                        {extraCosts > 0 && (
                            <div className="flex justify-between text-slate-600 border-b border-slate-100 pb-1">
                                <span>Chi phí khác:</span>
                                <span className="font-bold">{formatCurrency(extraCosts).replace(' VND', '')}</span>
                            </div>
                        )}

                        <div className="flex justify-between text-sm pt-2 border-t-2 border-slate-300 items-end">
                            <span className="font-black uppercase text-slate-900">Tổng cộng:</span>
                            <span className="font-black text-xl" style={{ color: getThemeColor() }}>{formatCurrency(displayTotal)}</span>
                        </div>
                        <div className="text-right italic text-[11px] text-slate-500 mt-1">
                            (Bằng chữ: {readMoney(displayTotal)})
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderNotes = () => {
        if (!isSectionVisible('notes')) return null;
        
        const docNotes = data.notes;
        const templateNotes = config.notes;

        if (!docNotes && !templateNotes) return null;

        return (
            <div className="mb-8 p-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-[11px] text-slate-600 break-inside-avoid">
                {docNotes && (
                    <div className="mb-2">
                        <span className="font-black uppercase text-slate-400 text-[10px] tracking-widest block mb-1">Ghi chú đơn hàng:</span>
                        <p>{docNotes}</p>
                    </div>
                )}
                {templateNotes && (
                    <div className="whitespace-pre-line pt-2 border-t border-slate-200 mt-2">
                        <span className="font-bold text-slate-800">Quy định / Điều khoản:</span>
                        <div className="mt-1">{templateNotes}</div>
                    </div>
                )}
            </div>
        );
    };

    const renderSignatures = () => {
        if (!isSectionVisible('signatures')) return null;
        
        const signatures = config.signatures || [];
        if (signatures.length === 0) return null;

        return (
            <div className="mt-12 mb-8 break-inside-avoid">
                <div className="flex justify-between items-start gap-8">
                    {signatures.map((title, idx) => (
                        <div key={idx} className="flex-1 text-center">
                            {config.signatureOptions?.showTitle !== false && (
                                <p className="text-[11px] font-black uppercase text-slate-800 mb-16 tracking-widest">{title}</p>
                            )}
                            
                            {/* Space for signature */}
                            
                            {config.signatureOptions?.showFullName !== false && (
                                <div className="border-t border-slate-300 w-2/3 mx-auto pt-2">
                                    <p className="text-[10px] text-slate-400 italic">(Ký, ghi rõ họ tên)</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderFooterNote = () => {
        if (!isSectionVisible('footer_note') || !config.footerNote) return null;
        return (
            <div className="text-center text-[10px] text-slate-400 italic mt-auto pt-6 border-t border-slate-100">
                {config.footerNote}
            </div>
        );
    };

    return (
        <div className="flex flex-col min-h-full bg-white font-sans p-10 relative print:p-0">
            {/* Custom CSS Injection */}
            {config.customCss && <style>{config.customCss}</style>}
            
            {sortedSections.map((section: any) => {
                // Ensure unique keys based on ID
                switch(section.id) {
                    case 'header': return <React.Fragment key="sec-header">{renderHeader()}</React.Fragment>;
                    case 'customer_info': return <React.Fragment key="sec-cust">{renderCustomerInfo()}</React.Fragment>;
                    case 'items_table': return <React.Fragment key="sec-items">{renderItemsTable()}</React.Fragment>;
                    case 'totals': return <React.Fragment key="sec-totals">{renderTotals()}</React.Fragment>;
                    case 'notes': return <React.Fragment key="sec-notes">{renderNotes()}</React.Fragment>;
                    case 'signatures': return <React.Fragment key="sec-sigs">{renderSignatures()}</React.Fragment>;
                    case 'footer_note': return <React.Fragment key="sec-foot">{renderFooterNote()}</React.Fragment>;
                    default: return null;
                }
            })}
        </div>
    );
};
