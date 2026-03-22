
import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Primitives';
import { FormField, FormTextarea } from '../ui/Form';
import { Order } from '../../types';

interface CancelOrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order | null;
    onConfirm: (reason: string) => Promise<void>;
}

const CANCEL_REASONS = [
    'Khách đổi ý / Không mua nữa',
    'Khách tìm được giá tốt hơn',
    'Hết hàng / Không đủ tồn kho',
    'Sai sót khi lên đơn (Nhập liệu)',
    'Khách không thanh toán / Quá hạn',
    'Lý do khác'
];

export const CancelOrderModal: React.FC<CancelOrderModalProps> = ({ isOpen, onClose, order, onConfirm }) => {
    const [selectedReason, setSelectedReason] = useState<string>('');
    const [detailNote, setDetailNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!selectedReason) return;
        
        setIsSubmitting(true);
        const finalReason = selectedReason === 'Lý do khác' ? detailNote : `${selectedReason}${detailNote ? `: ${detailNote}` : ''}`;
        
        try {
            await onConfirm(finalReason);
            // Parent handles closing
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!order) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Xác Nhận Hủy Đơn Hàng"
            size="md"
            footer={
                <div className="flex gap-3 w-full">
                    <Button variant="secondary" onClick={onClose} disabled={isSubmitting} className="flex-1">Quay lại</Button>
                    <Button 
                        variant="danger" 
                        onClick={handleSubmit} 
                        loading={isSubmitting} 
                        disabled={!selectedReason}
                        icon="cancel"
                        className="flex-1 bg-red-600 shadow-lg shadow-red-600/20"
                    >
                        Xác nhận Hủy
                    </Button>
                </div>
            }
        >
            <div className="space-y-6">
                <div className="bg-red-50 dark:bg-red-900/10 p-4 rounded-2xl border border-red-100 dark:border-red-900/30 flex gap-3">
                    <span className="material-symbols-outlined text-red-600 text-2xl shrink-0">warning</span>
                    <div className="text-sm text-red-800 dark:text-red-200">
                        <p className="font-bold mb-1">Hành động này sẽ:</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-xs opacity-90">
                            <li>Chuyển trạng thái đơn sang <b>Đã hủy</b>.</li>
                            <li>Hoàn trả tồn kho hàng hóa (nếu đã trừ/giữ).</li>
                            <li>Vô hiệu hóa công nợ phải thu liên quan.</li>
                            <li>Hủy các phiếu giao hàng đang chờ.</li>
                        </ul>
                    </div>
                </div>

                <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 block">Lý do hủy đơn (*)</label>
                    <div className="grid grid-cols-1 gap-2">
                        {CANCEL_REASONS.map(reason => (
                            <button
                                key={reason}
                                onClick={() => setSelectedReason(reason)}
                                className={`text-left px-4 py-3 rounded-xl text-xs font-bold transition-all border ${
                                    selectedReason === reason 
                                    ? 'bg-red-600 text-white border-red-600 shadow-md' 
                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-red-300'
                                }`}
                            >
                                {reason}
                            </button>
                        ))}
                    </div>
                </div>

                {(selectedReason === 'Lý do khác' || selectedReason.includes('Sai sót')) && (
                    <FormField label="Chi tiết lý do">
                        <FormTextarea 
                            value={detailNote} 
                            onChange={e => setDetailNote(e.target.value)} 
                            placeholder="Nhập ghi chú cụ thể..." 
                            rows={2}
                            autoFocus
                        />
                    </FormField>
                )}
            </div>
        </Modal>
    );
};
