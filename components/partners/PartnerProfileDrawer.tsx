
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { Drawer, DrawerSection } from '../ui/Drawer';
import { Button } from '../ui/Primitives';
import StatusBadge from '../StatusBadge';
import { formatCurrency, formatRelativeTime, getDaysDiff, parseDate, formatDateISO } from '../../utils/helpers';
import { Partner, ViewState, Order, DebtRecord, Transaction } from '../../types';
import { AuditTimeline } from '../audit/AuditTimeline';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { useNotification } from '../../contexts/NotificationContext';
import { useDomainServices } from '../../hooks/useDomainServices';
import { DebtPayDrawer } from '../debts/DebtPayDrawer';

interface Props {
    partnerId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onEdit: (partner: Partner) => void;
}

// --- SUB-COMPONENT: AGING WIDGET ---
const DebtAgingWidget = ({ debts }: { debts: DebtRecord[] }) => {
    const today = new Date();
    const aging = useMemo(() => {
        const buckets = { current: 0, d1_30: 0, d30_90: 0, over90: 0 };
        debts.forEach(d => {
            if (d.remainingAmount <= 0) return;
            const days = getDaysDiff(parseDate(d.dueDate), today); // negative means overdue
            // days > 0: Not due yet (Current)
            // days <= 0: Overdue
            const overdueDays = Math.abs(days);

            if (days >= 0) buckets.current += d.remainingAmount;
            else if (overdueDays <= 30) buckets.d1_30 += d.remainingAmount;
            else if (overdueDays <= 90) buckets.d30_90 += d.remainingAmount;
            else buckets.over90 += d.remainingAmount;
        });
        return buckets;
    }, [debts]);

    // Explicitly sum values to avoid TS inference issues with Object.values().reduce
    const total = aging.current + aging.d1_30 + aging.d30_90 + aging.over90;
    
    if (total === 0) return (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 text-center">
            <span className="material-symbols-outlined text-3xl text-emerald-500 mb-1">check_circle</span>
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Không có dư nợ</p>
        </div>
    );

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px]">timelapse</span> Tuổi nợ (Aging)
            </h4>
            <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-3 bg-slate-100 dark:bg-slate-700">
                <div style={{ width: `${(aging.current / total) * 100}%` }} className="bg-emerald-400 h-full" title="Trong hạn"></div>
                <div style={{ width: `${(aging.d1_30 / total) * 100}%` }} className="bg-amber-400 h-full" title="Quá hạn 1-30 ngày"></div>
                <div style={{ width: `${(aging.d30_90 / total) * 100}%` }} className="bg-orange-500 h-full" title="Quá hạn 30-90 ngày"></div>
                <div style={{ width: `${(aging.over90 / total) * 100}%` }} className="bg-rose-600 h-full" title="Nợ xấu (>90 ngày)"></div>
            </div>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Trong hạn:</span> <span className="font-bold text-emerald-600">{formatCurrency(aging.current).replace(' VND','')}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">1-30 ngày:</span> <span className="font-bold text-amber-500">{formatCurrency(aging.d1_30).replace(' VND','')}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">30-90 ngày:</span> <span className="font-bold text-orange-600">{formatCurrency(aging.d30_90).replace(' VND','')}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">&gt; 90 ngày:</span> <span className="font-bold text-rose-600">{formatCurrency(aging.over90).replace(' VND','')}</span></div>
            </div>
        </div>
    );
};

export const PartnerProfileDrawer: React.FC<Props> = ({ partnerId, isOpen, onClose, onEdit }) => {
    const { confirm, showNotification } = useNotification();
    const { deletePartner } = useDomainServices();
    const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'debts' | 'transactions' | 'history'>('overview');
    const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

    const partner = useLiveQuery(() => partnerId ? db.partners.get(partnerId) : undefined, [partnerId]);

    const relatedOrders = useLiveQuery(async () => {
        if (!partner) return [];
        return db.orders.filter(o => o.partnerId === partner.id && !o.isDeleted).reverse().limit(20).toArray();
    }, [partner]);

    const relatedDebts = useLiveQuery(async () => {
        if (!partner) return [];
        return db.debtRecords.where('partnerId').equals(partner.id).reverse().toArray();
    }, [partner]);

    const relatedTransactions = useLiveQuery(async () => {
        if (!partner) return [];
        // Filter by partnerName is simpler given current schema, though ID is better if indexed
        // Note: Schema uses 'partnerName' for transactions usually.
        return db.transactions.filter(t => t.partnerName === partner.name).reverse().limit(50).toArray();
    }, [partner]);

    const auditLogs = useLiveQuery(async () => {
        if (!partner) return [];
        return db.auditLogs.where('entityId').equals(partner.id).reverse().toArray();
    }, [partner]);

    // --- LOGIC: THỐNG KÊ TÀI CHÍNH ---
    const stats = useMemo(() => {
        if (!partner || !relatedOrders || !relatedDebts) return { totalValue: 0, paidValue: 0, orderCount: 0, debtUsage: 0, overdue: 0 };
        
        const validOrders = relatedOrders.filter(o => o.status !== 'Cancelled');
        const totalValue = validOrders.reduce((s, o) => s + o.total, 0);
        const paidValue = validOrders.reduce((s, o) => s + o.amountPaid, 0);
        const orderCount = validOrders.length;
        const debtUsage = partner.debtLimit ? ((partner.debt || 0) / partner.debtLimit) * 100 : 0;
        
        // Calculate overdue from actual debt records
        const today = new Date(); today.setHours(0,0,0,0);
        const overdue = relatedDebts
            .filter(d => d.remainingAmount > 0 && new Date(d.dueDate) < today)
            .reduce((s, d) => s + d.remainingAmount, 0);

        return { totalValue, paidValue, orderCount, debtUsage, overdue };
    }, [partner, relatedOrders, relatedDebts]);

    // --- LOGIC: BIỂU ĐỒ ---
    const chartData = useMemo(() => {
        if (!relatedOrders || relatedOrders.length === 0) return [];
        return relatedOrders.slice(0, 6).reverse().map(o => ({
            name: o.code.slice(-4),
            val: o.total
        }));
    }, [relatedOrders]);

    const handleDelete = async () => {
        if (!partner) return;
        const ok = await confirm({
            title: 'Xóa đối tác?',
            message: `Bạn có chắc muốn xóa đối tác ${partner.name}? Hành động này sẽ lưu trữ hồ sơ thay vì xóa vĩnh viễn nếu đã có lịch sử giao dịch.`,
            type: 'danger'
        });
        if (ok) {
            try {
                await deletePartner(partner.id);
                onClose();
            } catch (e: any) {
                showNotification(e.message, 'error');
            }
        }
    };

    const handleQuickAction = () => {
        // Find the oldest unpaid debt or create a general payment?
        // Let's find the oldest pending debt
        const oldestDebt = relatedDebts?.find(d => d.remainingAmount > 0);
        if (oldestDebt) {
            setSelectedDebtId(oldestDebt.id);
        } else {
            showNotification('Đối tác không còn dư nợ cần thanh toán.', 'info');
        }
    };

    if (!isOpen || !partner) return null;

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={partner.name}
            subtitle={
                <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-xl border border-blue-100 dark:border-blue-800 uppercase tracking-tighter shadow-sm">{partner.code}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{partner.type === 'Customer' ? 'Khách hàng' : 'Nhà cung cấp'}</span>
                </div>
            }
            width="2xl"
            footer={
                <div className="flex flex-col gap-3 w-full">
                    <div className="flex gap-3 w-full">
                        <Button variant="outline" className="flex-1 h-12 rounded-[1.25rem]" icon="edit" onClick={() => onEdit(partner)}>Sửa hồ sơ</Button>
                        {partner.type === 'Customer' && (
                            <Button variant="primary" className="flex-1 h-12 rounded-[1.25rem] bg-blue-600 shadow-lg shadow-blue-600/20" icon="add_shopping_cart">Lên đơn mới</Button>
                        )}
                        {(partner.debt || 0) > 0 && (
                            <Button 
                                variant="primary" 
                                className={`flex-1 h-12 rounded-[1.25rem] shadow-lg ${partner.type === 'Customer' ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-orange-600 shadow-orange-600/20'}`} 
                                icon="payments"
                                onClick={handleQuickAction}
                            >
                                {partner.type === 'Customer' ? 'Thu nợ nhanh' : 'Trả nợ nhanh'}
                            </Button>
                        )}
                    </div>
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                        <Button variant="ghost" className="w-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" icon="delete" onClick={handleDelete}>Xóa đối tác</Button>
                    </div>
                </div>
            }
        >
            {/* Header Metrics */}
            <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-6 rounded-[2rem] bg-slate-900 text-white shadow-xl relative overflow-hidden group">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">Giá trị giao dịch (Lũy kế)</p>
                    <h3 className="text-3xl font-black tracking-tighter">{formatCurrency(stats.totalValue).replace(' VND','')}</h3>
                    <div className="mt-4 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: stats.totalValue > 0 ? `${(stats.paidValue / stats.totalValue) * 100}%` : '0%' }}></div>
                        </div>
                        <span className="text-[10px] font-black text-emerald-400 uppercase">Đã thu {stats.totalValue > 0 ? Math.round((stats.paidValue / stats.totalValue) * 100) : 0}%</span>
                    </div>
                    <span className="material-symbols-outlined absolute -bottom-6 -right-6 text-[110px] opacity-[0.05] rotate-12 group-hover:scale-110 transition-transform duration-700">payments</span>
                </div>

                <div className={`p-6 rounded-[2rem] border-2 shadow-sm transition-all relative overflow-hidden flex flex-col justify-between ${stats.overdue > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700'}`}>
                    <div>
                        <div className="flex justify-between items-start mb-2 relative z-10">
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Dư nợ hiện tại</p>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${stats.debtUsage >= 80 ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                                {stats.debtUsage.toFixed(0)}% Limit
                            </span>
                        </div>
                        <h3 className={`text-3xl font-black tracking-tighter relative z-10 ${stats.overdue > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{formatCurrency(partner.debt || 0).replace(' VND','')}</h3>
                    </div>
                    {stats.overdue > 0 && (
                        <div className="relative z-10 mt-2 flex items-center gap-1.5 text-rose-600 bg-white/50 px-2 py-1 rounded-lg w-fit">
                            <span className="material-symbols-outlined text-[16px]">warning</span>
                            <span className="text-[10px] font-black uppercase">Quá hạn: {formatCurrency(stats.overdue).replace(' VND','')}</span>
                        </div>
                    )}
                    <span className="material-symbols-outlined absolute -bottom-6 -right-6 text-[110px] opacity-[0.03] group-hover:opacity-[0.05] transition-all duration-700">account_balance_wallet</span>
                </div>
            </div>

            <div className="flex border-b border-slate-200 dark:border-slate-800 mb-8 sticky top-0 bg-white dark:bg-slate-900 z-10 overflow-x-auto no-scrollbar">
                {[
                    { id: 'overview', label: 'TỔNG QUAN', icon: 'analytics' },
                    { id: 'orders', label: 'ĐƠN HÀNG', icon: 'receipt_long' },
                    { id: 'debts', label: 'CÔNG NỢ', icon: 'account_balance_wallet' },
                    { id: 'transactions', label: 'SỔ QUỸ', icon: 'payments' },
                    { id: 'history', label: 'TRUY VẾT', icon: 'history' }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 py-4 px-2 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                            activeTab === tab.id ? 'border-blue-600 text-blue-600 bg-blue-50/30' : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && (
                <div className="space-y-8 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <DebtAgingWidget debts={relatedDebts || []} />
                        
                        <DrawerSection title="ĐỊNH DANH PHÁP LÝ">
                             <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-4 shadow-sm h-full">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Mã số thuế</span>
                                    <span className="text-xs font-mono font-black text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded border border-slate-100 dark:border-slate-800">{partner.taxId || 'N/A'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Ngày gia nhập</span>
                                    <span className="text-xs font-black text-slate-700 dark:text-slate-300">{new Date(partner.createdAt).toLocaleDateString('vi-VN')}</span>
                                </div>
                                <div className="flex items-start gap-3 mt-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                                    <div className="size-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 shrink-0"><span className="material-symbols-outlined text-[18px]">location_on</span></div>
                                    <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Địa chỉ</p><p className="text-xs font-bold text-slate-600 dark:text-slate-400 leading-relaxed">{partner.address || 'Chưa cập nhật'}</p></div>
                                </div>
                            </div>
                        </DrawerSection>
                    </div>

                    <DrawerSection title="XU HƯỚNG MUA HÀNG (6 ĐƠN GẦN NHẤT)">
                        <div className="h-56 w-full bg-slate-50 dark:bg-slate-800/50 rounded-[2.5rem] p-6 border border-slate-100 dark:border-slate-800 shadow-inner">
                            {chartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" className="text-blue-600" stopOpacity={0.2}/>
                                                <stop offset="95%" className="text-blue-600" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold', fill: 'currentColor'}} className="text-slate-400" />
                                        <YAxis hide />
                                        <RechartsTooltip 
                                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontWeight: 'bold', fontSize: '12px' }}
                                            formatter={(v: any) => formatCurrency(v)}
                                        />
                                        <Area type="monotone" dataKey="val" className="stroke-blue-600" strokeWidth={4} fillOpacity={1} fill="url(#colorVal)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center opacity-30">
                                    <p className="text-xs font-black uppercase tracking-[0.2em]">Chưa có dữ liệu biểu đồ</p>
                                </div>
                            )}
                        </div>
                    </DrawerSection>
                </div>
            )}

            {activeTab === 'orders' && (
                <div className="space-y-4 animate-fadeIn">
                    {relatedOrders?.map(o => (
                        <div key={o.id} className="p-5 bg-white dark:bg-slate-800 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 flex justify-between items-center group hover:border-blue-400 transition-all shadow-sm active:scale-[0.98] cursor-pointer">
                            <div className="flex items-center gap-4">
                                <div className="size-10 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors shadow-inner"><span className="material-symbols-outlined text-[20px]">receipt</span></div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-mono text-xs font-black text-slate-900 dark:text-white uppercase tracking-tighter">{o.code}</span>
                                        <StatusBadge status={o.status} entityType="Order" type="dot" />
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{o.date}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-base font-black text-slate-900 dark:text-white tracking-tighter">{formatCurrency(o.total).replace(' VND','')}</p>
                                <p className={`text-[10px] font-black uppercase tracking-tighter ${o.amountPaid >= o.total ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {o.amountPaid >= o.total ? 'Đã thu đủ' : `Còn nợ: ${formatCurrency(o.total - o.amountPaid)}`}
                                </p>
                            </div>
                        </div>
                    ))}
                    {(!relatedOrders || relatedOrders.length === 0) && (
                        <div className="text-center py-32 flex flex-col items-center opacity-30">
                            <span className="material-symbols-outlined text-6xl mb-4">shopping_cart_off</span>
                            <p className="text-xs font-black uppercase tracking-[0.3em]">Chưa phát sinh giao dịch</p>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'debts' && (
                <div className="space-y-4 animate-fadeIn">
                    {relatedDebts?.map(d => {
                        const isPaid = d.remainingAmount <= 0;
                        const isOverdue = !isPaid && new Date(d.dueDate) < new Date();
                        return (
                            <div key={d.id} className="p-4 bg-white dark:bg-slate-800 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 hover:shadow-md transition-all">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded uppercase border ${isPaid ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                            {d.orderCode}
                                        </span>
                                        {isOverdue && <span className="text-[9px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 animate-pulse">Quá hạn</span>}
                                    </div>
                                    <StatusBadge status={d.status} entityType="Debt" size="sm" />
                                </div>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">Hạn thanh toán</p>
                                        <p className={`text-xs font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>{d.dueDate}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-slate-400 uppercase tracking-widest">Còn nợ</p>
                                        <div className="flex items-center gap-2">
                                            <p className={`text-lg font-black ${isPaid ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>{formatCurrency(d.remainingAmount)}</p>
                                            {!isPaid && (
                                                <button onClick={() => setSelectedDebtId(d.id)} className="size-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-colors" title="Thanh toán ngay">
                                                    <span className="material-symbols-outlined text-[14px]">payments</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                    {(!relatedDebts || relatedDebts.length === 0) && (
                        <div className="text-center py-20 opacity-30"><p className="text-xs font-black uppercase tracking-widest">Không có công nợ</p></div>
                    )}
                </div>
            )}

            {activeTab === 'transactions' && (
                <div className="space-y-2 animate-fadeIn relative pl-4 border-l-2 border-slate-100 dark:border-slate-800 ml-4">
                    {relatedTransactions?.map(t => (
                        <div key={t.id} className="relative group">
                            <div className={`absolute -left-[23px] top-4 size-3 rounded-full border-2 border-white dark:border-slate-900 ${t.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                            <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors flex justify-between items-center">
                                <div>
                                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{t.description}</p>
                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{t.date} • {t.method === 'transfer' ? 'CK' : 'Tiền mặt'}</p>
                                </div>
                                <span className={`text-xs font-black ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount).replace(' VND','')}
                                </span>
                            </div>
                        </div>
                    ))}
                    {(!relatedTransactions || relatedTransactions.length === 0) && (
                        <div className="text-center py-20 opacity-30"><p className="text-xs font-black uppercase tracking-widest">Chưa có giao dịch</p></div>
                    )}
                </div>
            )}

            {activeTab === 'history' && (
                <div className="animate-fadeIn">
                    <AuditTimeline logs={auditLogs || []} />
                </div>
            )}

            <DebtPayDrawer 
                debtId={selectedDebtId} 
                isOpen={!!selectedDebtId} 
                onClose={() => setSelectedDebtId(null)} 
            />
        </Drawer>
    );
};
