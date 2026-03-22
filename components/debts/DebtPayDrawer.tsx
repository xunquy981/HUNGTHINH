
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { useApp as useAppContext } from '../../hooks/useApp';
import { Drawer, DrawerSection } from '../ui/Drawer';
import { Button } from '../ui/Primitives';
import { FormField, FormInput, FormSelect, FormTextarea } from '../ui/Form';
import { formatCurrency, readMoney } from '../../utils/helpers';
import StatusBadge from '../StatusBadge';
import { ViewState } from '../../types';

interface DebtPayDrawerProps {
    debtId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onNavigate?: (view: ViewState, params?: any) => void;
}

export const DebtPayDrawer: React.FC<DebtPayDrawerProps> = ({ debtId, isOpen, onClose, onNavigate }) => {
    const { addPaymentToDebt, showNotification } = useAppContext();
    
    const debt = useLiveQuery(() => debtId ? db.debtRecords.get(debtId) : undefined, [debtId]);
    const [amount, setAmount] = useState<number>(0);
    const [method, setMethod] = useState('transfer');
    const [notes, setNotes] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && debt) {
            setAmount(debt.remainingAmount);
            setMethod('transfer');
            setNotes(`Thanh toán công nợ phiếu ${debt.orderCode}`);
            setDate(new Date().toISOString().slice(0, 10));
        }
    }, [isOpen, debt]);

    const handleSubmit = async () => {
        if (!debt) return;
        if (amount <= 0 || amount > debt.remainingAmount) {
            showNotification('Số tiền không hợp lệ', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await addPaymentToDebt(debt.id, { amount, method, notes, date });
            showNotification('Ghi nhận giao dịch thành công', 'success');
            onClose();
        } catch (error) {
            showNotification('Lỗi hệ thống', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleViewSource = async () => {
        if (!debt || !onNavigate) return;

        // Tìm trong đơn bán hàng trước
        const order = await db.orders.where('code').equals(debt.orderCode).first();
        if (order) {
            onNavigate('ORDERS', { highlightId: order.id });
            onClose();
            return;
        }

        // Tìm trong đơn nhập hàng
        const imp = await db.importOrders.where('code').equals(debt.orderCode).first();
        if (imp) {
            onNavigate('IMPORTS', { highlightId: imp.id });
            onClose();
            return;
        }

        showNotification('Không tìm thấy chứng từ gốc (có thể đã bị xóa)', 'error');
    };

    if (!isOpen || !debt) return null;

    const payments = debt.payments || [];
    const paidPercentage = Math.round(((debt.totalAmount - debt.remainingAmount) / debt.totalAmount) * 100);

    return (
        <Drawer
            isOpen={isOpen} onClose={onClose}
            title={debt.type === 'Receivable' ? 'Thu Nợ Khách Hàng' : 'Thanh Toán NCC'}
            subtitle={
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase">{debt.orderCode}</span>
                    <span className="size-1 rounded-full bg-slate-300"></span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{debt.partnerName}</span>
                </div>
            }
            width="2xl"
            footer={
                <div className="flex gap-3 w-full">
                    {onNavigate && (
                        <Button 
                            variant="outline" 
                            className="flex-1 h-12 rounded-2xl" 
                            icon="open_in_new" 
                            onClick={handleViewSource}
                        >
                            Xem chứng từ gốc
                        </Button>
                    )}
                    {debt.remainingAmount > 0 && (
                        <Button 
                            variant="primary" 
                            className={`flex-[2] h-12 rounded-2xl shadow-xl shadow-blue-500/20 px-8 ${debt.type === 'Receivable' ? 'bg-indigo-600' : 'bg-rose-600'}`} 
                            icon="check_circle" 
                            onClick={handleSubmit} 
                            loading={isSubmitting}
                        >
                            {debt.type === 'Receivable' ? 'Xác nhận thu nợ' : 'Xác nhận trả nợ'}
                        </Button>
                    )}
                </div>
            }
        >
            <div className="space-y-8 animate-fadeIn">
                {/* HERO STAT CARD */}
                <div className={`p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group ${debt.type === 'Receivable' ? 'bg-slate-900' : 'bg-rose-900'}`}>
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em] mb-2">Dư nợ còn lại</p>
                                <h3 className="text-4xl font-black tracking-tighter">{formatCurrency(debt.remainingAmount)}</h3>
                            </div>
                            <StatusBadge status={debt.status} entityType="Debt" size="md" className="bg-white/10 text-white border-white/20 backdrop-blur-md" />
                        </div>
                        <div className="flex justify-between items-end">
                            <div className="flex-1 pr-10">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] font-bold text-white/40 uppercase">Tiến độ tất toán</span>
                                    <span className="text-[10px] font-black text-emerald-400">{paidPercentage}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden shadow-inner">
                                    <div className="h-full bg-emerald-500 transition-all duration-1000 ease-out" style={{ width: `${paidPercentage}%` }}></div>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-white/40 uppercase mb-1">Hạn nợ</p>
                                <p className="text-xs font-black uppercase tracking-widest">{debt.dueDate}</p>
                            </div>
                        </div>
                    </div>
                    <span className="material-symbols-outlined absolute -bottom-8 -right-8 text-[140px] opacity-[0.05] group-hover:scale-110 transition-transform duration-1000">payments</span>
                </div>

                {/* PAYMENT FORM */}
                {debt.remainingAmount > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-700">
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <span className="size-2 rounded-full bg-blue-500 animate-pulse"></span>
                            Ghi nhận giao dịch mới
                        </h4>
                        <div className="space-y-6">
                            <FormField label="Số tiền thanh toán">
                                <div className="relative group">
                                    <FormInput 
                                        type="number" value={amount || ''} onChange={e => setAmount(Number(e.target.value))} 
                                        className="pl-4 pr-16 font-black text-3xl h-16 text-indigo-600 dark:text-indigo-400 bg-white border-2 border-slate-200 focus:border-indigo-500" 
                                        placeholder="0"
                                    />
                                    <button onClick={() => setAmount(debt.remainingAmount)} className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-indigo-600 hover:text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-sm">Tất cả</button>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-2 italic font-bold uppercase">{readMoney(amount)}</p>
                            </FormField>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <FormField label="Ngày thực hiện"><FormInput type="date" value={date} onChange={e => setDate(e.target.value)} className="h-12 font-bold" /></FormField>
                                <FormField label="Phương thức">
                                    <FormSelect value={method} onChange={e => setMethod(e.target.value)} className="h-12 font-bold">
                                        <option value="transfer">Chuyển khoản</option>
                                        <option value="cash">Tiền mặt</option>
                                    </FormSelect>
                                </FormField>
                            </div>

                            <FormField label="Ghi chú diễn giải">
                                <FormTextarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="bg-white border-slate-200 rounded-2xl text-sm" placeholder="VD: Khách trả trước một phần..." />
                            </FormField>
                        </div>
                    </div>
                )}

                {/* TIMELINE HISTORY */}
                <DrawerSection title="Lịch sử đối soát">
                    <div className="relative pl-8 border-l-2 border-slate-100 dark:border-slate-800 space-y-8 ml-2">
                        {payments.length > 0 ? payments.slice().reverse().map((p, idx) => (
                            <div key={idx} className="relative group">
                                <div className={`absolute -left-[41px] top-1 size-6 rounded-full border-4 border-white dark:border-slate-900 shadow-md z-10 transition-transform group-hover:scale-125 ${debt.type === 'Receivable' ? 'bg-indigo-500' : 'bg-rose-500'}`}></div>
                                <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.date}</p>
                                            <h5 className="font-black text-xl text-slate-900 dark:text-white mt-1">{formatCurrency(p.amount)}</h5>
                                        </div>
                                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase">{p.method === 'transfer' ? 'CK' : 'Tiền mặt'}</span>
                                    </div>
                                    {p.notes && <p className="text-xs text-slate-500 dark:text-slate-400 italic leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl">"{p.notes}"</p>}
                                </div>
                            </div>
                        )) : (
                            <div className="py-12 text-center text-slate-400 opacity-50 flex flex-col items-center">
                                <span className="material-symbols-outlined text-5xl mb-2">history</span>
                                <p className="text-xs font-black uppercase tracking-widest">Chưa có giao dịch nào</p>
                            </div>
                        )}
                    </div>
                </DrawerSection>
            </div>
        </Drawer>
    );
};
