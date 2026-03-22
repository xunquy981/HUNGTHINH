
import React, { useState, useEffect, useRef } from 'react';
import { Partner, PartnerType } from '../types';
import { useApp as useAppContext } from '../hooks/useApp';
import { Button } from './ui/Primitives';
import { Modal } from './ui/Modal';
import { FormField, FormInput, NumericInput, FormTextarea } from './ui/Form';
import { formatCurrency } from '../utils/helpers';
import { useFormValidation } from '../hooks/useFormValidation';
import { scanBusinessCard, parseContactString } from '../services/ai';

interface CreatePartnerModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: Partner;
    mode: 'create' | 'edit';
    onSuccess?: (partner: Partial<Partner>) => void;
}

export const CreatePartnerModal: React.FC<CreatePartnerModalProps> = ({ isOpen, onClose, initialData, mode, onSuccess }) => {
    const { addPartner, updatePartner, showNotification } = useAppContext();
    const [formData, setFormData] = useState<Partial<Partner>>({ type: 'Customer' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [smartPaste, setSmartPaste] = useState('');
    
    const { errors, setErrors, register, focusFirstError, clearErrors } = useFormValidation<Partner>();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData(initialData || { type: 'Customer', debt: 0, debtLimit: 50000000 });
            setSmartPaste('');
            clearErrors();
        }
    }, [isOpen, initialData, clearErrors]);

    const validate = () => {
        const newErrors: any = {};
        if (!formData.name?.trim()) newErrors.name = 'Tên đối tác không được để trống';
        if (!formData.phone?.trim()) newErrors.phone = 'Số điện thoại là bắt buộc';
        
        setErrors(newErrors);
        if (Object.keys(newErrors).length > 0) {
            focusFirstError(newErrors);
            return false;
        }
        return true;
    };

    const handleFileScan = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = (event.target?.result as string).split(',')[1];
            setIsScanning(true);
            try {
                const result = await scanBusinessCard(base64);
                setFormData(prev => ({
                    ...prev,
                    name: result.company || result.name || prev.name,
                    phone: result.phone || prev.phone,
                    email: result.email || prev.email,
                    address: result.address || prev.address,
                    taxId: result.taxId || prev.taxId
                }));
                showNotification('AI đã trích xuất thông tin từ danh thiếp!', 'success');
            } catch (err) {
                showNotification('Không đọc được danh thiếp.', 'error');
            } finally {
                setIsScanning(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSmartPaste = async () => {
        if (!smartPaste.trim()) return;
        setIsScanning(true);
        try {
            const result = await parseContactString(smartPaste);
            setFormData(prev => ({
                ...prev,
                name: result.company || result.name || prev.name,
                phone: result.phone || prev.phone,
                email: result.email || prev.email,
                address: result.address || prev.address,
                taxId: result.taxId || prev.taxId
            }));
            showNotification('Đã điền thông tin từ văn bản!', 'success');
            setSmartPaste('');
        } catch (e) {
            showNotification('Lỗi phân tích văn bản.', 'error');
        } finally {
            setIsScanning(false);
        }
    };

    const handleSubmit = async () => {
        if (isSubmitting) return;
        if (validate()) {
            setIsSubmitting(true);
            try {
                if (mode === 'create') {
                    const codePrefix = formData.type === 'Customer' ? 'KH' : 'NCC';
                    const code = `${codePrefix}-${Date.now().toString().slice(-6)}`;
                    const newPartnerData = { ...formData, code };
                    await addPartner(newPartnerData as any);
                    if (onSuccess) onSuccess(newPartnerData);
                } else {
                    await updatePartner(formData as Partner);
                    if (onSuccess) onSuccess(formData);
                }
                onClose();
            } catch (error) {
                showNotification('Lỗi hệ thống dữ liệu', 'error');
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    const isCustomer = formData.type === 'Customer';
    const themeColor = isCustomer ? 'indigo' : 'orange';
    const ThemeButton = isCustomer ? 'bg-indigo-600 shadow-indigo-600/30' : 'bg-orange-600 shadow-orange-600/30';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'create' ? 'Thêm Đối Tác Mới' : 'Cập Nhật Hồ Sơ'}
            subtitle="Hồ sơ định danh & hạn mức tín dụng"
            size="xl"
            footer={
                <div className="flex justify-between w-full">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">security</span>
                        Dữ liệu được bảo mật
                    </p>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                        <Button variant="primary" onClick={handleSubmit} icon="verified" loading={isSubmitting} className={`${ThemeButton} px-8`}>
                            {mode === 'create' ? 'Lưu hồ sơ' : 'Cập nhật'}
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="grid grid-cols-12 gap-8 h-[500px]">
                {/* LEFT PANEL: IDENTITY & AI */}
                <div className="col-span-4 flex flex-col gap-6 border-r border-slate-200 dark:border-slate-700 pr-6 overflow-y-auto custom-scrollbar">
                    {/* Avatar Placeholder */}
                    <div className="flex flex-col items-center">
                        <div className={`size-24 rounded-[2rem] flex items-center justify-center text-4xl font-black text-white shadow-xl mb-4 transition-colors duration-500 ${isCustomer ? 'bg-indigo-500' : 'bg-orange-500'}`}>
                            {formData.name ? formData.name.charAt(0).toUpperCase() : '?'}
                        </div>
                        
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 w-full">
                            <button 
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, type: 'Customer' }))}
                                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${isCustomer ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Khách Hàng
                            </button>
                            <button 
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, type: 'Supplier' }))}
                                className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!isCustomer ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Nhà Cung Cấp
                            </button>
                        </div>
                    </div>

                    {/* AI Scanner */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`material-symbols-outlined text-[18px] ${isCustomer ? 'text-indigo-500' : 'text-orange-500'} ${isScanning ? 'animate-spin' : ''}`}>
                                {isScanning ? 'sync' : 'document_scanner'}
                            </span>
                            <span className="text-[10px] font-black uppercase text-slate-400">AI Trích xuất thông tin</span>
                        </div>
                        
                        <input type="file" ref={fileInputRef} onChange={handleFileScan} className="hidden" accept="image/*" />
                        <button 
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:border-blue-400 transition-all shadow-sm flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[16px]">add_a_photo</span>
                            Quét danh thiếp
                        </button>

                        <div className="relative">
                            <textarea 
                                value={smartPaste}
                                onChange={e => setSmartPaste(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSmartPaste())}
                                placeholder="Dán thông tin liên hệ (SĐT, Đ/C, MST...)"
                                className="w-full text-[10px] bg-white dark:bg-slate-800 border-none rounded-xl p-2 resize-none focus:ring-1 focus:ring-blue-500/30 min-h-[60px]"
                            />
                            {smartPaste && (
                                <button type="button" onClick={handleSmartPaste} className="absolute bottom-2 right-2 text-blue-600 hover:text-blue-700"><span className="material-symbols-outlined text-[16px]">send</span></button>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL: FORM */}
                <div className="col-span-8 overflow-y-auto custom-scrollbar pr-2">
                    <div className="space-y-6">
                        {/* Section 1: Identity */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">Thông tin định danh</h4>
                            <div className="grid grid-cols-12 gap-4">
                                <div className="col-span-8">
                                    <FormField label="Tên đối tác / Công ty" required error={errors.name}>
                                        <FormInput 
                                            ref={register('name')}
                                            value={formData.name || ''} 
                                            onChange={e => setFormData({...formData, name: e.target.value})} 
                                            placeholder="VD: Công ty TNHH Hưng Thịnh..." 
                                            className="font-black"
                                        />
                                    </FormField>
                                </div>
                                <div className="col-span-4">
                                    <FormField label="Mã số thuế">
                                        <FormInput 
                                            value={formData.taxId || ''} 
                                            onChange={e => setFormData({...formData, taxId: e.target.value})} 
                                            className="font-mono"
                                            placeholder="MST..."
                                        />
                                    </FormField>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Contact */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-2">Liên hệ & Địa chỉ</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <FormField label="Số điện thoại" required error={errors.phone}>
                                    <FormInput 
                                        ref={register('phone')}
                                        value={formData.phone || ''} 
                                        onChange={e => setFormData({...formData, phone: e.target.value})} 
                                        placeholder="090..." 
                                        icon="call"
                                    />
                                </FormField>
                                <FormField label="Email">
                                    <FormInput 
                                        value={formData.email || ''} 
                                        onChange={e => setFormData({...formData, email: e.target.value})} 
                                        placeholder="user@example.com" 
                                        icon="mail"
                                    />
                                </FormField>
                            </div>
                            <FormField label="Địa chỉ giao dịch">
                                <FormTextarea 
                                    value={formData.address || ''} 
                                    onChange={e => setFormData({...formData, address: e.target.value})} 
                                    rows={2}
                                    className="rounded-2xl bg-slate-50 dark:bg-slate-900/50"
                                    placeholder="Số nhà, đường, phường/xã, quận/huyện..."
                                />
                            </FormField>
                        </div>

                        {/* Section 3: Finance */}
                        <div className={`space-y-4 p-5 rounded-2xl border ${isCustomer ? 'bg-indigo-50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/30' : 'bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30'}`}>
                            <h4 className={`text-xs font-black uppercase tracking-widest pb-2 ${isCustomer ? 'text-indigo-400' : 'text-orange-400'}`}>Hạn mức tài chính</h4>
                            <div className="flex gap-6 items-center">
                                <div className="flex-1">
                                    <FormField label="Hạn mức nợ tối đa">
                                        <NumericInput 
                                            value={formData.debtLimit || 0} 
                                            onChange={val => setFormData({...formData, debtLimit: val})} 
                                            className={`font-black h-12 text-lg ${isCustomer ? 'text-indigo-600' : 'text-orange-600'}`}
                                            suffix="VNĐ"
                                        />
                                    </FormField>
                                </div>
                                <div className="flex-1">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Trạng thái hiện tại</div>
                                    <p className="text-xl font-black text-slate-900 dark:text-white">
                                        {formatCurrency(formData.debt || 0)} <span className="text-xs font-bold text-slate-400">dư nợ</span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};
