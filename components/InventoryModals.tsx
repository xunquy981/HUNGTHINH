
import React, { useState, useEffect, useMemo } from 'react';
import { Product } from '../types';
import { useApp as useAppContext } from '../hooks/useApp';
import { enrichProductInfo } from '../services/ai';
import { Button } from './ui/Primitives';
import { Modal } from './ui/Modal';
import { FormField, FormInput, FormSelect, NumericInput } from './ui/Form';
import { db } from '../services/db';
import { useFormValidation } from '../hooks/useFormValidation';
import { formatCurrency } from '../utils/helpers';
import { WAREHOUSE_CONFIG } from '../constants/options';

interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Product>) => Promise<void>;
  initialData?: Partial<Product>;
  mode?: 'create' | 'edit';
}

const UNIT_SUGGESTIONS = ['Cái', 'Bộ', 'Vòng', 'Sợi', 'Mét', 'Cuộn', 'Thùng', 'Ống', 'Xô', 'Tấm', 'Hộp', 'Kg', 'Lít'];

export const CreateProductModal: React.FC<CreateModalProps> = ({ isOpen, onClose, onSubmit, initialData, mode = 'create' }) => {
  const { showNotification, settings } = useAppContext();
  const [formData, setFormData] = useState<Partial<Product>>({});
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [skuExists, setSkuExists] = useState(false);
  const { errors, setErrors, register, focusFirstError, clearErrors } = useFormValidation<Product>();

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData || { 
        location: 'bearing', stock: 0, minStock: 5, importPrice: 0, retailPrice: 0, unit: 'Cái', brand: '',
      });
      clearErrors();
      setSkuExists(false);
    }
  }, [isOpen, initialData, clearErrors]);

  useEffect(() => {
      const checkSku = async () => {
          if (formData.sku && formData.sku.length > 2) {
              const skuToSearch = formData.sku.trim().toUpperCase();
              const match = await db.products.where('sku').equals(skuToSearch).first();
              if (match && (mode === 'create' || (initialData && match.id !== initialData.id))) setSkuExists(true);
              else setSkuExists(false);
          } else setSkuExists(false);
      };
      const timer = setTimeout(checkSku, 500);
      return () => clearTimeout(timer);
  }, [formData.sku, mode, initialData]);

  const profitMargin = useMemo(() => {
      if (!formData.importPrice || !formData.retailPrice) return 0;
      return ((formData.retailPrice - formData.importPrice) / formData.retailPrice) * 100;
  }, [formData.importPrice, formData.retailPrice]);

  const profitValue = (formData.retailPrice || 0) - (formData.importPrice || 0);

  const handleMagicFill = async () => {
      if (!formData.name || formData.name.trim().length < 3) {
          showNotification('Vui lòng nhập tên sơ bộ để AI phân tích.', 'warning');
          return;
      }
      setIsAiLoading(true);
      try {
          const enriched = await enrichProductInfo(formData.name);
          setFormData(prev => {
              const autoRetail = enriched.retailPrice || (prev.importPrice || 0) * (settings?.finance?.defaultMarkupRate || 1.3);
              return { 
                  ...prev, ...enriched, 
                  sku: (enriched.sku || prev.sku || '').toUpperCase(),
                  retailPrice: prev.retailPrice || Math.round(autoRetail / 1000) * 1000
              };
          });
          showNotification('AI đã hoàn thiện thông tin sản phẩm!', 'success');
      } catch (err: any) { showNotification('Lỗi phân tích AI', 'error'); } finally { setIsAiLoading(false); }
  };

  const validate = async () => {
      const newErrors: any = {};
      if (!formData.name?.trim()) newErrors.name = 'Tên sản phẩm không được để trống';
      if (!formData.sku?.trim()) newErrors.sku = 'Mã SKU là bắt buộc';
      if (skuExists) newErrors.sku = 'Mã SKU này đã tồn tại';
      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) { focusFirstError(newErrors); return false; }
      return true;
  };

  const handleSubmit = async () => {
      if (isSubmitting) return;
      if (await validate()) {
          setIsSubmitting(true);
          try {
              await onSubmit({ ...formData, sku: formData.sku?.trim().toUpperCase() });
              onClose();
          } catch (e: any) { showNotification(e.message || 'Lỗi lưu dữ liệu', 'error'); } finally { setIsSubmitting(false); }
      }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'create' ? 'Thêm Sản Phẩm Mới' : 'Chỉnh Sửa Sản Phẩm'} size="2xl" footer={<div className="flex justify-between items-center w-full"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dữ liệu được đồng bộ Realtime</p><div className="flex gap-3"><Button variant="secondary" onClick={onClose} className="rounded-2xl px-6 h-11">Đóng</Button><Button variant="primary" onClick={handleSubmit} loading={isSubmitting} icon="check_circle" className="bg-indigo-600 shadow-lg shadow-indigo-600/20 px-8 h-11 rounded-2xl font-black uppercase">Lưu kho ngay</Button></div></div>}>
        <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 lg:col-span-7 space-y-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
                    <div className="relative z-10 space-y-5">
                        <FormField label="Tên sản phẩm / Quy cách" required error={errors.name}>
                            <div className="relative group">
                                <FormInput 
                                    ref={register('name')} 
                                    value={formData.name || ''} 
                                    onChange={e => setFormData({...formData, name: e.target.value})} 
                                    placeholder="VD: Vòng bi SKF 6205-2RS1/C3..." 
                                    className="h-12 pr-12 text-sm font-bold border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 shadow-sm" 
                                />
                                <button type="button" onClick={handleMagicFill} disabled={isAiLoading} className="absolute right-1.5 top-1/2 -translate-y-1/2 size-9 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center disabled:opacity-50" title="AI Tự động điền thông tin"><span className={`material-symbols-outlined text-[18px] ${isAiLoading ? 'animate-spin' : ''}`}>{isAiLoading ? 'sync' : 'auto_awesome'}</span></button>
                            </div>
                        </FormField>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField label="Mã SKU (Mã phụ tùng)" required error={errors.sku}>
                                <FormInput 
                                    ref={register('sku')} 
                                    value={formData.sku || ''} 
                                    onChange={e => setFormData({...formData, sku: e.target.value.toUpperCase()})} 
                                    className="h-11 font-mono font-black uppercase text-blue-700 bg-blue-50/50 border-blue-200 focus:border-blue-500 focus:bg-white placeholder:text-blue-300/70 transition-all" 
                                    placeholder="NHAP-MA-SP" 
                                />
                            </FormField>
                            <FormField label="Thương hiệu">
                                <FormInput 
                                    value={formData.brand || ''} 
                                    onChange={e => setFormData({...formData, brand: e.target.value})} 
                                    placeholder="SKF, NSK..." 
                                    className="h-11 font-bold text-orange-700 bg-orange-50/50 border-orange-200 focus:border-orange-500 focus:bg-white placeholder:text-orange-300/70 transition-all" 
                                />
                            </FormField>
                        </div>
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label="Đơn vị tính">
                            <FormInput 
                                list="unit-list" 
                                value={formData.unit || ''} 
                                onChange={e => setFormData({...formData, unit: e.target.value})} 
                                placeholder="Cái..." 
                                className="h-11 font-bold text-slate-700 bg-slate-100/50 border-slate-200 focus:border-slate-400 focus:bg-white transition-all" 
                            />
                            <datalist id="unit-list">{UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}</datalist>
                        </FormField>
                        <FormField label="Kích thước">
                            <FormInput 
                                value={formData.dimensions || ''} 
                                onChange={e => setFormData({...formData, dimensions: e.target.value})} 
                                placeholder="VD: 25 x 52 x 15" 
                                className="h-11 font-mono font-bold text-purple-700 bg-purple-50/50 border-purple-200 focus:border-purple-500 focus:bg-white placeholder:text-purple-300/70 transition-all" 
                            />
                        </FormField>
                    </div>
                    <FormField label="Vị trí lưu kho (Phân loại)">
                        <div className="grid grid-cols-3 gap-2">
                            {WAREHOUSE_CONFIG.map(w => (
                                <button key={w.id} type="button" onClick={() => setFormData({ ...formData, location: w.id })} className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${formData.location === w.id ? 'bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500/30' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50'}`}>
                                    <span className={`material-symbols-outlined text-[20px] mb-1 ${formData.location === w.id ? 'text-indigo-600' : 'text-slate-400'}`}>{w.icon}</span>
                                    <span className="text-[9px] font-bold uppercase truncate w-full text-center">{w.label.replace('Kho ', '')}</span>
                                </button>
                            ))}
                        </div>
                    </FormField>
                </div>
            </div>
            <div className="col-span-12 lg:col-span-5 space-y-6">
                <div className="bg-slate-900 rounded-[2.5rem] p-6 text-white shadow-xl shadow-slate-900/20 relative overflow-hidden h-full flex flex-col justify-between">
                    <div className="relative z-10 space-y-6">
                        <div className="flex items-center gap-3 mb-2"><div className="size-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/10"><span className="material-symbols-outlined text-[20px]">monetization_on</span></div><div><h3 className="text-sm font-bold">Giá & Lợi nhuận</h3></div></div>
                        <div className="space-y-4">
                            <FormField label="Giá vốn (VNĐ)" className="text-slate-400">
                                <NumericInput 
                                    value={formData.importPrice || 0} 
                                    onChange={val => setFormData({...formData, importPrice: val})} 
                                    className="h-14 text-2xl font-black !bg-white/10 !border-white/10 !text-white focus:!bg-white/20 focus:!border-white/30 placeholder:text-white/20" 
                                />
                            </FormField>
                            <FormField label="Giá bán lẻ (VNĐ)" className="text-slate-400">
                                <NumericInput 
                                    value={formData.retailPrice || 0} 
                                    onChange={val => setFormData({...formData, retailPrice: val})} 
                                    className="h-14 text-2xl font-black !bg-white/10 !border-white/10 !text-emerald-400 focus:!bg-white/20 focus:!border-emerald-500/50 placeholder:text-emerald-400/20" 
                                />
                            </FormField>
                        </div>
                    </div>
                    <div className="relative z-10 pt-6 border-t border-white/10 flex justify-between items-end">
                        <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Lãi dự kiến</p><p className="text-xl font-black text-white">{formatCurrency(profitValue).replace(' VND', '')}</p></div>
                        <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${profitMargin >= 30 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>Margin {profitMargin.toFixed(0)}%</div>
                    </div>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none"></div>
                </div>
            </div>
        </div>
    </Modal>
  );
};

export const AdjustStockModal: React.FC<{ product: Product | null, onClose: () => void, onSave: (qty: number, reason: string) => Promise<void> }> = ({ product, onClose, onSave }) => {
    const [qty, setQty] = useState(0);
    const [reason, setReason] = useState('Kiểm kê kho định kỳ');
    const [isSubmitting, setIsSubmitting] = useState(false);
    useEffect(() => { if (product) setQty(product.stock); }, [product]);
    const handleSave = async () => { if (!product || isSubmitting) return; setIsSubmitting(true); try { await onSave(qty, reason); onClose(); } finally { setIsSubmitting(false); } };
    if (!product) return null;
    return (
        <Modal isOpen={!!product} onClose={onClose} title="Kiểm Kê & Điều Chỉnh" subtitle={product.name} size="sm" footer={<><Button variant="secondary" onClick={onClose}>Hủy</Button><Button variant="primary" onClick={handleSave} loading={isSubmitting} className="px-8 rounded-xl shadow-lg">Xác nhận điều chỉnh</Button></>}>
            <div className="space-y-6">
                <div className="text-center p-8 bg-indigo-50 dark:bg-indigo-900/10 rounded-[2.5rem] border-2 border-indigo-100 shadow-inner">
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-4">Số lượng thực tế</p>
                    <div className="flex items-center justify-center gap-6"><button onClick={() => setQty(Math.max(0, qty - 1))} className="size-12 rounded-2xl bg-white dark:bg-slate-800 shadow-md flex items-center justify-center"><span className="material-symbols-outlined">remove</span></button><input type="number" value={qty} onChange={e => setQty(parseInt(e.target.value) || 0)} className="w-24 text-center text-4xl font-black bg-transparent border-none focus:ring-0" /><button onClick={() => setQty(qty + 1)} className="size-12 rounded-2xl bg-white dark:bg-slate-800 shadow-md flex items-center justify-center"><span className="material-symbols-outlined">add</span></button></div>
                </div>
                <FormField label="Lý do điều chỉnh"><FormInput value={reason} onChange={e => setReason(e.target.value)} placeholder="VD: Sai lệch kiểm đếm..." /></FormField>
            </div>
        </Modal>
    );
};
