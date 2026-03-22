
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Primitives';
import { FormField, FormSelect } from '../ui/Form';
import { useApp as useAppContext } from '../../hooks/useApp';
import { parseCSV, parseExcel, SYSTEM_FIELDS, generateErrorCSV } from '../../utils/importHelpers';
import { downloadTextFile, generateUUID, getCurrentDate, removeVietnameseTones } from '../../utils/helpers';
import { WAREHOUSE_CONFIG } from '../../constants/options';
import { db } from '../../services/db';
import { Product } from '../../types';
import { useLiveQuery } from 'dexie-react-hooks';

interface InventoryImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type Step = 'upload' | 'mapping' | 'preview' | 'executing' | 'result';

export const InventoryImportModal: React.FC<InventoryImportModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const { showNotification, createImportOrder } = useAppContext();
    const products = useLiveQuery(() => db.products.toArray()) || [];
    
    const [step, setStep] = useState<Step>('upload');
    const [fileData, setFileData] = useState<{ headers: string[], rows: any[] } | null>(null);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [warehouse, setWarehouse] = useState(WAREHOUSE_CONFIG[0].id);
    const [createMissing, setCreateMissing] = useState(true);
    
    const [processedRows, setProcessedRows] = useState<any[]>([]);
    const [errors, setErrors] = useState<Record<number, string[]>>({});
    const [stats, setStats] = useState({ total: 0, valid: 0, invalid: 0, newSkus: 0 });
    
    const [progress, setProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isOpen) {
            setStep('upload');
            setFileData(null);
            setMapping({});
            setProcessedRows([]);
            setErrors({});
            setProgress(0);
        }
    }, [isOpen]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                let parsed;
                if (isExcel) {
                    parsed = parseExcel(event.target?.result as ArrayBuffer);
                } else {
                    parsed = parseCSV(event.target?.result as string);
                }
                
                if (parsed.headers.length === 0) throw new Error('File trống hoặc sai định dạng.');
                
                setFileData(parsed);
                // Tự động khớp các cột phổ biến
                const initMap: Record<string, string> = {};
                SYSTEM_FIELDS.forEach(field => {
                    const match = parsed.headers.find(h => 
                        h.toLowerCase().includes(field.key.toLowerCase()) || 
                        h.toLowerCase() === field.label.toLowerCase().replace(' (*)', '').toLowerCase()
                    );
                    if (match) initMap[field.key] = match;
                });
                setMapping(initMap);
                setStep('mapping');
            } catch (err: any) {
                showNotification(err.message, 'error');
            }
        };

        if (isExcel) reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    };

    const handleAnalyze = () => {
        if (!fileData) return;

        const missingRequired = SYSTEM_FIELDS.filter(f => f.required && !mapping[f.key]);
        if (missingRequired.length > 0) {
            showNotification(`Thiếu cột bắt buộc: ${missingRequired.map(f => f.label).join(', ')}`, 'error');
            return;
        }

        const newErrors: Record<number, string[]> = {};
        const existingSkusSet = new Set(products.map(p => p.sku));
        const finalRows: any[] = [];
        let newSkuCount = 0;

        fileData.rows.forEach((row, idx) => {
            const sku = String(row[mapping['sku']] || '').trim().toUpperCase();
            if (!sku) {
                newErrors[idx] = ['Mã SKU không được để trống'];
                return;
            }

            const cleanRow: any = { _originalIdx: idx, sku };
            let hasError = false;

            SYSTEM_FIELDS.forEach(field => {
                if (field.key === 'sku') return;
                const header = mapping[field.key];
                let val = header ? row[header] : undefined;
                
                if (field.type === 'number') {
                    if (typeof val === 'string') val = Number(val.replace(/[^0-9.-]+/g, ''));
                    else val = Number(val);
                    if (isNaN(val)) val = 0;
                }
                cleanRow[field.key] = val;
            });

            const isNew = !existingSkusSet.has(sku);
            if (isNew) {
                if (!createMissing) {
                    newErrors[idx] = ['SKU chưa tồn tại (Chế độ chỉ cập nhật)'];
                    hasError = true;
                } else if (!cleanRow.name) {
                    newErrors[idx] = ['Sản phẩm mới thiếu tên'];
                    hasError = true;
                } else {
                    newSkuCount++;
                    cleanRow._isNew = true;
                }
            } else {
                cleanRow._isNew = false;
            }

            if (!hasError) finalRows.push(cleanRow);
        });

        setProcessedRows(finalRows);
        setErrors(newErrors);
        setStats({
            total: fileData.rows.length,
            valid: finalRows.length,
            invalid: Object.keys(newErrors).length,
            newSkus: newSkuCount
        });
        setStep('preview');
    };

    const handleExecute = async () => {
        setStep('executing');
        setProgress(10);

        try {
            const batchId = generateUUID('batch');
            const newProducts = processedRows.filter(r => r._isNew);
            
            // 1. Tạo sản phẩm mới
            if (newProducts.length > 0) {
                const toAdd = newProducts.map(r => ({
                    id: generateUUID('prod'),
                    sku: r.sku,
                    name: r.name,
                    brand: r.brand || 'No Brand',
                    dimensions: r.dimensions || '',
                    importPrice: r.price || 0,
                    retailPrice: r.retailPrice || (r.price * 1.3) || 0,
                    stock: 0,
                    minStock: r.minStock || 10,
                    location: warehouse,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    isDeleted: false
                }));
                await db.products.bulkAdd(toAdd as Product[]);
            }
            setProgress(50);

            // 2. Tạo phiếu nhập kho để cập nhật tồn và giá vốn MAC
            const importItems = await Promise.all(processedRows.map(async r => {
                const product = await db.products.where('sku').equals(r.sku).first();
                return {
                    id: product!.id,
                    sku: r.sku,
                    productName: product!.name,
                    unit: 'Cái',
                    quantity: r.quantity,
                    price: r.price || product!.importPrice,
                    total: r.quantity * (r.price || product!.importPrice)
                };
            }));

            await createImportOrder({
                code: `PN-EXCEL-${Date.now().toString().slice(-4)}`,
                supplierName: `Nhập file Excel (${batchId.slice(-4)})`,
                date: getCurrentDate(),
                total: importItems.reduce((s, i) => s + i.total, 0),
                status: 'Received',
                warehouse: warehouse,
                items: importItems,
                amountPaid: 0,
                notes: `Import tự động từ file. Batch ID: ${batchId}`
            });

            setProgress(100);
            setStep('result');
            onSuccess();
        } catch (error) {
            showNotification('Lỗi khi thực hiện Import', 'error');
            setStep('preview');
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Import Kho Hàng"
            size="2xl"
            footer={
                <div className="flex justify-between w-full">
                    <div className="flex items-center">
                        {step === 'preview' && stats.invalid > 0 && (
                            <button onClick={() => {
                                const csv = generateErrorCSV(fileData!.rows, errors);
                                downloadTextFile('loi_import.csv', csv);
                            }} className="text-rose-600 text-xs font-bold hover:underline">
                                Tải danh sách {stats.invalid} dòng lỗi
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={onClose}>Hủy bỏ</Button>
                        {step === 'mapping' && <Button variant="primary" onClick={handleAnalyze}>Kiểm tra dữ liệu</Button>}
                        {step === 'preview' && <Button variant="primary" onClick={handleExecute} icon="check_circle" className="bg-emerald-600 px-10">Thực hiện</Button>}
                        {step === 'result' && <Button variant="primary" onClick={onClose}>Đóng</Button>}
                    </div>
                </div>
            }
        >
            <div className="space-y-6">
                {/* Stepper UI */}
                <div className="flex items-center justify-between px-20 relative">
                    <div className="absolute top-4 left-20 right-20 h-0.5 bg-slate-200 -z-0"></div>
                    {['File', 'Mapping', 'Review'].map((label, i) => {
                        const stepIndex = i;
                        const isDone = ['upload', 'mapping', 'preview', 'executing', 'result'].indexOf(step) > stepIndex;
                        const isCurrent = ['upload', 'mapping', 'preview'].indexOf(step) === stepIndex;
                        return (
                            <div key={label} className="flex flex-col items-center gap-2 relative z-10">
                                <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${isDone ? 'bg-emerald-500 border-emerald-500 text-white' : isCurrent ? 'bg-white border-blue-500 text-blue-600' : 'bg-white border-slate-300 text-slate-400'}`}>
                                    {isDone ? <span className="material-symbols-outlined text-[16px]">check</span> : i + 1}
                                </div>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${isCurrent ? 'text-blue-600' : 'text-slate-400'}`}>{label}</span>
                            </div>
                        );
                    })}
                </div>

                <div className="min-h-[300px]">
                    {step === 'upload' && (
                        <div 
                            className="flex flex-col items-center justify-center p-16 border-4 border-dashed border-slate-100 rounded-[2.5rem] bg-slate-50/50 hover:bg-slate-50 hover:border-blue-200 transition-all cursor-pointer group"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="size-20 rounded-3xl bg-white shadow-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <span className="material-symbols-outlined text-[40px] text-blue-500">upload_file</span>
                            </div>
                            <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Chọn file dữ liệu</h3>
                            <p className="text-sm text-slate-500 mt-2">Hỗ trợ Excel (.xlsx, .xls) hoặc CSV</p>
                            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls,.csv" className="hidden" />
                        </div>
                    )}

                    {step === 'mapping' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="grid grid-cols-2 gap-6 bg-blue-50 p-6 rounded-3xl border border-blue-100">
                                <FormField label="Kho hàng nhận mặc định">
                                    <FormSelect value={warehouse} onChange={e => setWarehouse(e.target.value)} className="h-12 font-bold">
                                        {WAREHOUSE_CONFIG.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                                    </FormSelect>
                                </FormField>
                                <div className="flex flex-col justify-end gap-3 pb-1">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input type="checkbox" checked={createMissing} onChange={e => setCreateMissing(e.target.checked)} className="size-5 rounded border-slate-300 text-blue-600" />
                                        <span className="text-sm font-bold text-slate-700 group-hover:text-blue-600 transition-colors">Tự động tạo sản phẩm mới nếu chưa có SKU</span>
                                    </label>
                                </div>
                            </div>

                            <div className="rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 tracking-widest border-b">
                                        <tr>
                                            <th className="px-6 py-4 text-left">Thông tin hệ thống</th>
                                            <th className="px-6 py-4 text-left">Cột dữ liệu trong File</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {SYSTEM_FIELDS.map(field => (
                                            <tr key={field.key}>
                                                <td className="px-6 py-4 font-bold text-slate-700">
                                                    {field.label} {field.required && <span className="text-rose-500">*</span>}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <select 
                                                        value={mapping[field.key] || ''} 
                                                        onChange={e => setMapping({...mapping, [field.key]: e.target.value})}
                                                        className={`w-full h-10 px-3 rounded-xl border transition-all text-sm font-bold ${!mapping[field.key] && field.required ? 'border-rose-300 bg-rose-50' : 'border-slate-200 focus:border-blue-500'}`}
                                                    >
                                                        <option value="">-- Bỏ qua cột này --</option>
                                                        {fileData?.headers.map(h => <option key={h} value={h}>{h}</option>)}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="grid grid-cols-4 gap-4">
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Tổng dòng</p>
                                    <p className="text-2xl font-black text-slate-900">{stats.total}</p>
                                </div>
                                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                                    <p className="text-[10px] font-bold text-emerald-500 uppercase mb-1">Hợp lệ</p>
                                    <p className="text-2xl font-black text-emerald-700">{stats.valid}</p>
                                </div>
                                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-center">
                                    <p className="text-[10px] font-bold text-blue-500 uppercase mb-1">SP mới</p>
                                    <p className="text-2xl font-black text-blue-700">{stats.newSkus}</p>
                                </div>
                                <div className={`p-4 rounded-2xl border text-center ${stats.invalid > 0 ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                                    <p className={`text-[10px] font-bold uppercase mb-1 ${stats.invalid > 0 ? 'text-rose-500' : 'text-slate-400'}`}>Dòng lỗi</p>
                                    <p className={`text-2xl font-black ${stats.invalid > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{stats.invalid}</p>
                                </div>
                            </div>

                            <div className="rounded-[2rem] border border-slate-200 overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 sticky top-0 font-black uppercase text-slate-400 text-[9px] tracking-widest border-b">
                                        <tr>
                                            <th className="px-6 py-3">SKU</th>
                                            <th className="px-6 py-3">Tên sản phẩm</th>
                                            <th className="px-6 py-3 text-center">SL</th>
                                            <th className="px-6 py-3 text-right">Trạng thái</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {processedRows.map((row, i) => (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="px-6 py-3 font-mono font-bold text-slate-600">{row.sku}</td>
                                                <td className="px-6 py-3 font-bold text-slate-800 truncate max-w-[200px]">{row.name}</td>
                                                <td className="px-6 py-3 text-center font-black text-emerald-600">{row.quantity}</td>
                                                <td className="px-6 py-3 text-right">
                                                    {row._isNew ? <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-bold">Mới</span> : <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 font-bold">Cập nhật</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {step === 'executing' && (
                        <div className="flex flex-col items-center justify-center py-20 gap-6">
                            <div className="relative size-32">
                                <svg className="size-full rotate-[-90deg]" viewBox="0 0 100 100">
                                    <circle className="text-slate-100 stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent"></circle>
                                    <circle className="text-blue-500 stroke-current transition-all duration-500" strokeWidth="8" strokeLinecap="round" cx="50" cy="50" r="40" fill="transparent" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * progress) / 100}></circle>
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center font-black text-xl text-blue-600">{progress}%</div>
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-black uppercase tracking-tight mb-2">Đang xử lý dữ liệu</h3>
                                <p className="text-sm text-slate-500">Vui lòng không đóng cửa sổ này...</p>
                            </div>
                        </div>
                    )}

                    {step === 'result' && (
                        <div className="flex flex-col items-center justify-center py-10 animate-scaleIn">
                            <div className="size-24 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/10">
                                <span className="material-symbols-outlined text-[48px]">verified</span>
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Import Thành Công!</h3>
                            <p className="text-sm text-slate-500 text-center max-w-sm mb-8 leading-relaxed">
                                Hệ thống đã xử lý xong {stats.valid} mã hàng hóa. Tồn kho và giá vốn MAC đã được cập nhật tự động.
                            </p>
                            <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                                <div className="p-4 rounded-2xl bg-slate-50 text-center"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Mặt hàng mới</p><p className="text-xl font-black text-blue-600">{stats.newSkus}</p></div>
                                <div className="p-4 rounded-2xl bg-slate-50 text-center"><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Cập nhật tồn</p><p className="text-xl font-black text-emerald-600">{stats.valid - stats.newSkus}</p></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};
