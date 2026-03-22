
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { Quote, QuoteStatus, ViewState } from '../../types';
import { Drawer, DrawerSection } from '../ui/Drawer';
import { Button } from '../ui/Primitives';
import { formatCurrency, parseDate } from '../../utils/helpers';
import { AuditTimeline } from '../audit/AuditTimeline';
import { useApp as useAppContext } from '../../hooks/useApp';
import { ConvertQuoteModal } from './ConvertQuoteModal';

interface QuoteDetailDrawerProps {
    quote: Quote | null;
    isOpen: boolean;
    onClose: () => void;
    onEdit: (q: Quote) => void;
    onConvert: (id: string, params: any) => void; // Updated signature
    onPrint: (q: Quote) => void;
    onDuplicate: (q: Quote) => void;
    onStatusChange: (id: string, status: QuoteStatus) => void;
    onDelete: (id: string) => void;
    onNavigate?: (view: ViewState, params?: any) => void;
}

export const QuoteDetailDrawer: React.FC<QuoteDetailDrawerProps> = ({ 
    quote, isOpen, onClose, 
    onEdit, onConvert, onPrint, onDuplicate, onStatusChange, onDelete,
    onNavigate
}) => {
    const { showNotification } = useAppContext();
    const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');
    const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);

    const auditLogs = useLiveQuery(async () => {
        if (!quote) return [];
        return db.auditLogs.where('entityId').equals(quote.id).reverse().toArray();
    }, [quote?.id]);

    if (!isOpen || !quote) return null;

    const validDate = parseDate(quote.validUntil);
    const now = new Date(); now.setHours(0,0,0,0);
    const isExpired = validDate < now && quote.status !== 'Accepted';
    const daysDiff = Math.ceil((validDate.getTime() - now.getTime()) / 86400000);
    
    const steps = [
        { id: 'Draft', label: 'Bản nháp', icon: 'edit_note', active: quote.status === 'Draft' },
        { id: 'Sent', label: 'Đã gửi', icon: 'send', active: quote.status === 'Sent' },
        { id: 'Accepted', label: 'Khách chốt', icon: 'thumb_up', active: quote.status === 'Accepted' },
    ];

    const isConverted = !!quote.convertedOrderId;

    const handleConvertConfirm = async (params: { mode: 'reserve' | 'immediate', amountPaid: number, method: string }) => {
        try {
            await onConvert(quote.id, params);
            // Parent onConvert handles success notification and navigation
            onClose(); 
        } catch (e: any) {
            showNotification(e.message || 'Lỗi khi chốt đơn', 'error');
        }
    };

    const handleViewOrder = () => {
        if (onNavigate && quote.convertedOrderId) {
            onNavigate('ORDERS', { highlightId: quote.convertedOrderId });
            onClose();
        }
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={quote.code}
            subtitle={`Ngày tạo: ${quote.date}`}
            width="xl"
            footer={
                <div className="flex flex-col gap-3 w-full">
                    <div className="flex gap-3">
                        {/* Nút In luôn hiển thị */}
                        <Button variant="outline" className="flex-1 border-slate-300 dark:border-slate-600 hover:bg-slate-50" icon="print" onClick={() => onPrint(quote)}>In phiếu</Button>

                        {/* Nếu là bản nháp -> Hiển thị nút Gửi */}
                        {quote.status === 'Draft' && (
                            <Button 
                                variant="primary" 
                                className="flex-1 bg-blue-600 hover:bg-blue-700 border-blue-600 shadow-lg shadow-blue-600/20" 
                                icon="send" 
                                onClick={() => onStatusChange(quote.id, 'Sent')}
                            >
                                Gửi cho khách
                            </Button>
                        )}

                        {/* Nút Chốt đơn (Chuyển đổi) */}
                        {!isConverted && quote.status !== 'Rejected' && quote.status !== 'Cancelled' && (
                            <Button 
                                variant="primary" 
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 border-emerald-600 shadow-lg shadow-emerald-600/20" 
                                icon="shopping_cart_checkout" 
                                onClick={() => setIsConvertModalOpen(true)}
                                disabled={isExpired}
                            >
                                Chốt đơn ngay
                            </Button>
                        )}
                    </div>

                    {/* Các tác vụ phụ */}
                    <div className="flex gap-2 border-t border-slate-200 dark:border-slate-700 pt-3">
                        <Button variant="ghost" className="flex-1 text-slate-500 hover:text-slate-800" icon="content_copy" onClick={() => onDuplicate(quote)}>Nhân bản</Button>
                        {!isConverted && (
                            <Button variant="ghost" className="flex-1 text-slate-500 hover:text-slate-800" icon="edit" onClick={() => onEdit(quote)}>Chỉnh sửa</Button>
                        )}
                        <Button variant="ghost" className="text-red-500 hover:bg-red-50" icon="delete" onClick={() => onDelete(quote.id)}>Xóa</Button>
                    </div>
                </div>
            }
        >
            {/* 1. Workflow Stepper */}
            {!isExpired && quote.status !== 'Rejected' && quote.status !== 'Cancelled' && (
                <div className="mb-8 px-2">
                    <div className="flex items-center justify-between relative">
                        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-200 dark:bg-slate-700 -z-10"></div>
                        {steps.map((step) => (
                            <div key={step.id} className="flex flex-col items-center gap-1.5 bg-white dark:bg-slate-900 px-2">
                                <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border-2 ${step.active ? 'bg-purple-600 border-purple-600 text-white shadow-lg scale-110' : 'bg-white border-slate-300 text-slate-400'}`}>
                                    <span className="material-symbols-outlined text-[16px]">{step.icon}</span>
                                </div>
                                <span className={`text-[9px] font-bold uppercase tracking-wider ${step.active ? 'text-purple-600' : 'text-slate-400'}`}>{step.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 2. Status Alerts */}
            <div className="space-y-4 mb-6">
                {isExpired && (
                    <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl flex items-center gap-3 shadow-sm">
                        <span className="material-symbols-outlined">event_busy</span>
                        <div className="text-xs font-bold">Báo giá này đã quá hạn hiệu lực ({quote.validUntil}).</div>
                    </div>
                )}
                {isConverted && (
                    <div className="p-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined">verified</span>
                            <div className="text-xs font-bold">Báo giá này đã được chuyển thành đơn hàng.</div>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            icon="open_in_new" 
                            className="text-blue-700 hover:bg-blue-100 h-8 px-3 text-[10px]"
                            onClick={handleViewOrder}
                        >
                            Xem đơn
                        </Button>
                    </div>
                )}
            </div>

            <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
                <button
                    onClick={() => setActiveTab('info')}
                    className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'info' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    Nội dung báo giá
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'history' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                    Lịch sử thay đổi
                </button>
            </div>

            {activeTab === 'info' && (
                <div className="space-y-6 animate-[fadeIn_0.2s_ease-out]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 shadow-sm">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Khách hàng</h4>
                            <p className="font-bold text-slate-900 dark:text-white text-base">{quote.customerName || 'Khách lẻ'}</p>
                            <p className="text-sm text-slate-500 mt-1">{quote.phone || '---'}</p>
                            <p className="text-xs text-slate-400 mt-2 line-clamp-1 italic">{quote.address || 'Chưa cập nhật địa chỉ'}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 shadow-sm">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Hạn hiệu lực</h4>
                            <p className={`text-base font-black ${isExpired ? 'text-red-600' : daysDiff <= 3 ? 'text-orange-600' : 'text-slate-900 dark:text-white'}`}>
                                {quote.validUntil}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                                {isExpired ? 'Đã hết hạn' : `Còn lại ${daysDiff} ngày`}
                            </p>
                        </div>
                    </div>

                    <DrawerSection title="Danh sách sản phẩm" action={<span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded border border-slate-200">{quote.items.length} SP</span>}>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 dark:bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black border-b border-slate-200 dark:border-slate-700 tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3">Sản phẩm</th>
                                        <th className="px-3 py-3 text-center">SL</th>
                                        <th className="px-4 py-3 text-right">Đơn giá</th>
                                        <th className="px-4 py-3 text-right">Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {quote.items.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{item.productName}</div>
                                                <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.sku}</div>
                                            </td>
                                            <td className="px-3 py-3 text-center font-bold text-slate-700 dark:text-slate-300">{item.quantity}</td>
                                            <td className="px-4 py-3 text-right text-slate-600 font-medium">{formatCurrency(item.price)}</td>
                                            <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-white">{formatCurrency(item.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
                                    <tr>
                                        <td colSpan={3} className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Tổng cộng</td>
                                        <td className="px-4 py-3 text-right font-black text-purple-600 text-lg">{formatCurrency(quote.total)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </DrawerSection>

                    {quote.notes && (
                        <DrawerSection title="Ghi chú báo giá">
                            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-100 italic">
                                "{quote.notes}"
                            </div>
                        </DrawerSection>
                    )}

                    {!isConverted && quote.status !== 'Rejected' && quote.status !== 'Cancelled' && (
                        <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                            <button 
                                onClick={() => onStatusChange(quote.id, 'Rejected')}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                            >
                                Khách từ chối
                            </button>
                            <button 
                                onClick={() => onStatusChange(quote.id, 'Cancelled')}
                                className="flex-1 py-2.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                            >
                                Hủy báo giá
                            </button>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="space-y-6 animate-[fadeIn_0.2s_ease-out]">
                    <AuditTimeline logs={auditLogs || []} />
                </div>
            )}

            <ConvertQuoteModal 
                isOpen={isConvertModalOpen} 
                onClose={() => setIsConvertModalOpen(false)} 
                quote={quote} 
                onConfirm={handleConvertConfirm} 
            />
        </Drawer>
    );
};
