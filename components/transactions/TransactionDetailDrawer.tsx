
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { Transaction, ViewState } from '../../types';
import { Drawer, DrawerSection } from '../ui/Drawer';
import { Button } from '../ui/Primitives';
import { formatCurrency } from '../../utils/helpers';
import { useNotification } from '../../contexts/NotificationContext';
import { useSettings } from '../../contexts/SettingsContext';

interface Props {
    transactionId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onDelete: (id: string) => void;
    onNavigate?: (view: ViewState, params?: any) => void;
}

export const CATEGORY_MAP: Record<string, string> = {
    salary: 'Lương nhân viên',
    rent: 'Thuê mặt bằng',
    utilities: 'Điện / Nước / Net',
    marketing: 'Marketing / Quảng cáo',
    maintenance: 'Sửa chữa / Bảo trì',
    tax: 'Thuế / Lệ phí',
    drawing: 'Rút vốn chủ sở hữu',
    other: 'Chi phí khác',
    manual: 'Góp vốn / Đầu tư',
    sale: 'Doanh thu bán lẻ',
    debt_collection: 'Thu nợ khách hàng',
    debt_payment: 'Thanh toán nhà cung cấp',
    import: 'Chi nhập hàng NCC',
    refund: 'Hoàn trả tiền đơn',
    supplier_refund: 'Hoàn tiền từ NCC'
};

export const TransactionDetailDrawer: React.FC<Props> = ({ transactionId, isOpen, onClose, onDelete, onNavigate }) => {
    const { confirm } = useNotification();
    const { settings } = useSettings();
    const [isDeleting, setIsDeleting] = useState(false);
    
    const transaction = useLiveQuery(() => transactionId ? db.transactions.get(transactionId) : undefined, [transactionId]);

    const handleJumpToSource = async () => {
        if (!transaction?.referenceCode || !onNavigate) return;
        const ref = transaction.referenceCode;
        if (ref.startsWith('DH') || ref.startsWith('ORD')) {
            const order = await db.orders.where('code').equals(ref).first();
            if (order) onNavigate('ORDERS', { highlightId: order.id });
        } else if (ref.startsWith('PN') || ref.startsWith('IMP')) {
            const imp = await db.importOrders.where('code').equals(ref).first();
            if (imp) onNavigate('IMPORTS', { highlightId: imp.id });
        }
        onClose();
    };

    const handleDelete = async () => {
        if (!transaction) return;
        
        // Safety check: Is this transaction locked by accounting date?
        if (settings?.finance?.lockDate && transaction.date <= settings?.finance?.lockDate) {
            confirm({ title: 'Chứng từ đã khóa', message: `Không thể xóa giao dịch này vì kỳ kế toán đã khóa sổ đến ngày ${settings?.finance?.lockDate}.`, type: 'warning', confirmLabel: 'Đã hiểu' });
            return;
        }

        const ok = await confirm({ 
            title: 'Hủy phiếu giao dịch?', 
            message: `Hành động này sẽ xóa vĩnh viễn phiếu ${transaction.type === 'income' ? 'thu' : 'chi'} số tiền ${formatCurrency(transaction.amount)}. \n\nLưu ý: Nếu phiếu liên quan đến Công nợ, bạn sẽ phải thực hiện đối soát lại thủ công.`, 
            type: 'danger',
            confirmLabel: 'Xác nhận xóa' 
        });

        if (ok) {
            setIsDeleting(true);
            try {
                onDelete(transaction.id);
                onClose();
            } finally {
                setIsDeleting(false);
            }
        }
    };

    if (!isOpen || !transaction) return null;

    const isIncome = transaction.type === 'income';
    const colorClass = isIncome ? 'text-emerald-600' : 'text-rose-600';
    const bgClass = isIncome ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20';
    const borderClass = isIncome ? 'border-emerald-100 dark:border-emerald-900/30' : 'border-rose-100 dark:border-rose-900/30';

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={`Phiếu ${isIncome ? 'Thu' : 'Chi'} tiền`}
            subtitle={
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono font-black text-slate-400 uppercase">ID: {transaction.id.slice(-8)}</span>
                    <span className="size-1 rounded-full bg-slate-300"></span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{new Date(transaction.timestamp || transaction.createdAt).toLocaleString('vi-VN')}</span>
                </div>
            }
            width="md"
            footer={
                <div className="flex gap-3 w-full">
                    <Button variant="ghost" className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 px-6 h-12 rounded-2xl" onClick={handleDelete} icon="delete" loading={isDeleting}>Hủy phiếu</Button>
                    <div className="flex-1"></div>
                    <Button variant="primary" onClick={onClose} className="h-12 rounded-2xl px-10 bg-slate-900 dark:bg-white text-white dark:text-slate-900">Đóng</Button>
                </div>
            }
        >
            <div className="space-y-8 animate-fadeIn">
                {/* 1. HERO AMOUNT DISPLAY */}
                <div className={`p-8 rounded-[2.5rem] border ${borderClass} ${bgClass} text-center relative overflow-hidden shadow-sm`}>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 mb-2">Giá trị phiếu</p>
                    <h2 className={`text-4xl font-black ${colorClass} tracking-tighter`}>
                        {isIncome ? '+' : '-'}{formatCurrency(transaction.amount).replace(' VND', '')}
                    </h2>
                    <div className="flex justify-center mt-4">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-white dark:bg-slate-900 border ${borderClass} ${colorClass} shadow-sm`}>
                            {CATEGORY_MAP[transaction.category] || transaction.category}
                        </span>
                    </div>
                </div>

                {/* 2. TRANSACTION SPECS */}
                <DrawerSection title="Thông tin định danh">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                            <div className="flex justify-between items-center p-4">
                                <span className="text-xs font-bold text-slate-500 uppercase">Ngày ghi sổ</span>
                                <span className="text-sm font-black text-slate-900 dark:text-white uppercase">{transaction.date}</span>
                            </div>
                            <div className="flex justify-between items-center p-4">
                                <span className="text-xs font-bold text-slate-500 uppercase">Hình thức</span>
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[18px] text-slate-400">
                                        {transaction.method === 'cash' ? 'payments' : 'account_balance'}
                                    </span>
                                    <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                        {transaction.method === 'cash' ? 'Tiền mặt (Cash)' : 'Chuyển khoản (Bank)'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center p-4">
                                <span className="text-xs font-bold text-slate-500 uppercase">Đối tượng</span>
                                <span className="text-sm font-black text-slate-900 dark:text-white truncate max-w-[200px]">{transaction.partnerName || 'KHÁCH LẺ'}</span>
                            </div>
                        </div>
                    </div>
                </DrawerSection>

                {/* 3. DESCRIPTION */}
                <DrawerSection title="Diễn giải nghiệp vụ">
                    <div className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] text-sm font-medium text-slate-700 dark:text-slate-300 italic border border-slate-100 dark:border-slate-800 leading-relaxed shadow-inner">
                        "{transaction.description || 'Không có ghi chú diễn giải'}"
                    </div>
                </DrawerSection>

                {/* 4. REFERENCE LINK */}
                {transaction.referenceCode && (
                    <DrawerSection title="Chứng từ liên kết">
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 flex items-center justify-between shadow-sm group">
                            <div className="flex items-center gap-4">
                                <div className="size-11 rounded-xl bg-blue-100 dark:bg-blue-800 flex items-center justify-center text-blue-600 shadow-inner group-hover:scale-110 transition-transform">
                                    <span className="material-symbols-outlined">receipt_long</span>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Nguồn chứng từ</p>
                                    <p className="text-sm font-mono font-black text-slate-900 dark:text-white mt-0.5">{transaction.referenceCode}</p>
                                </div>
                            </div>
                            <button 
                                onClick={handleJumpToSource} 
                                className="px-4 py-2 bg-white dark:bg-slate-800 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-blue-200 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm"
                            >
                                Truy xuất
                            </button>
                        </div>
                    </DrawerSection>
                )}
            </div>
        </Drawer>
    );
};
