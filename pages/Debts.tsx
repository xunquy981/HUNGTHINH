
import React, { useState, useMemo } from 'react';
import { ViewState, DebtRecord, DebtStatus } from '../types';
import { useDexieTable } from '../hooks/useDexieTable';
import { db } from '../services/db';
import { PageShell, Button } from '../components/ui/Primitives';
import { TableToolbar } from '../components/table/TableToolbar';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import Pagination from '../components/Pagination';
import { FilterChip } from '../components/ui/FilterBar';
import { formatCurrency, getDaysDiff, parseDate, formatDateISO } from '../utils/helpers';
import { DebtPayDrawer } from '../components/debts/DebtPayDrawer';
import { useLiveQuery } from 'dexie-react-hooks';
import { DateRangeFilter } from '../components/filters/DateRangeFilter';

// --- SUB-COMPONENT: WALLET CARD (MODE SWITCHER) ---
const WalletCard = ({ title, value, count, type, isActive, onClick }: { 
    title: string, value: number, count: number, type: 'Receivable' | 'Payable', isActive: boolean, onClick: () => void 
}) => {
    const isReceivable = type === 'Receivable';
    const theme = isReceivable 
        ? { 
            bg: 'bg-indigo-600 dark:bg-indigo-500', 
            active: 'ring-4 ring-indigo-500/20 shadow-indigo-500/30',
            icon: 'account_balance_wallet',
            light: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'
          }
        : { 
            bg: 'bg-rose-600 dark:bg-rose-500', 
            active: 'ring-4 ring-rose-500/20 shadow-rose-500/30',
            icon: 'outbound',
            light: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
          };

    return (
        <button 
            onClick={onClick}
            className={`relative overflow-hidden rounded-[2.5rem] p-7 text-left transition-all duration-500 group flex flex-col justify-between h-48 border-2 ${
                isActive 
                ? `${theme.bg} border-transparent text-white shadow-2xl scale-[1.02] ${theme.active}` 
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-lg'
            }`}
        >
            <div className="z-10 relative flex justify-between items-start">
                <div className={`size-12 rounded-2xl flex items-center justify-center transition-all ${isActive ? 'bg-white/20' : theme.light}`}>
                    <span className="material-symbols-outlined text-[28px] filled-icon">{theme.icon}</span>
                </div>
                {isActive && <div className="size-2 rounded-full bg-white animate-pulse"></div>}
            </div>

            <div className="z-10 relative">
                <p className={`text-[10px] font-black uppercase tracking-[0.25em] mb-1.5 ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
                    {title} ({count})
                </p>
                <h3 className="text-3xl font-black tracking-tighter leading-none">
                    {formatCurrency(value).replace(' VND','')}
                </h3>
            </div>

            {/* Background Decoration */}
            <span className={`material-symbols-outlined absolute -bottom-6 -right-6 text-[140px] opacity-[0.03] transition-transform duration-1000 group-hover:rotate-12 ${isActive ? 'text-white' : 'text-slate-900'}`}>
                {theme.icon}
            </span>
        </button>
    );
};

// --- SUB-COMPONENT: NET BALANCE INDICATOR ---
const NetBalanceCard = ({ value }: { value: number }) => (
    <div className="rounded-[2.5rem] bg-slate-900 dark:bg-black p-7 text-white flex flex-col justify-between h-48 relative overflow-hidden border border-slate-800 shadow-xl group">
        <div className="relative z-10">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] mb-4">Dòng tiền dự kiến (Net)</p>
            <h3 className={`text-4xl font-black tracking-tighter ${value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {value >= 0 ? '+' : ''}{formatCurrency(value).replace(' VND','')}
            </h3>
        </div>
        <div className="relative z-10 flex items-center gap-3">
            <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${value >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                {value >= 0 ? 'Thặng dư tài sản' : 'Thâm hụt nợ'}
            </div>
            <span className="text-[10px] font-bold text-slate-500">Dựa trên AR - AP</span>
        </div>
        <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 blur-[80px] rounded-full -mr-10 -mt-10"></div>
        <span className="material-symbols-outlined absolute -bottom-8 -right-8 text-[120px] opacity-[0.05] group-hover:scale-110 transition-transform duration-1000">equalizer</span>
    </div>
);

const Debts: React.FC<{ onNavigate: (view: ViewState, params?: any) => void, initialParams?: any }> = ({ onNavigate, initialParams }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'Receivable' | 'Payable'>('Receivable'); 
    const [statusFilter, setStatusFilter] = useState<DebtStatus | 'all' | 'Unpaid' | 'DueSoon'>('Unpaid');
    const [dateRange, setDateRange] = useState({ from: '', to: '' });
    const [selectedDebtId, setSelectedDebtId] = useState<string | null>(initialParams?.highlightId || null);

    const itemsPerPage = 15;

    // Stats Logic
    const stats = useLiveQuery(async () => {
        const debts = await db.debtRecords.filter(d => d.status !== 'Void').toArray();
        const receivables = debts.filter(d => d.type === 'Receivable' && d.remainingAmount > 0);
        const payables = debts.filter(d => d.type === 'Payable' && d.remainingAmount > 0);

        const totalAR = receivables.reduce((sum, d) => sum + d.remainingAmount, 0);
        const totalAP = payables.reduce((sum, d) => sum + d.remainingAmount, 0);

        return { totalAR, totalAP, recCount: receivables.length, payCount: payables.length, net: totalAR - totalAP };
    }, []) || { totalAR: 0, totalAP: 0, recCount: 0, payCount: 0, net: 0 };

    const filterFn = React.useCallback((d: DebtRecord) => {
        if (d.type !== typeFilter) return false;
        
        // Dynamic Status Check
        const days = getDaysDiff(parseDate(d.dueDate)); // Positive = Overdue (Past), Negative = Future
        
        if (statusFilter !== 'all') {
            if (statusFilter === 'Unpaid') {
                if (d.remainingAmount <= 0) return false;
            } else if (statusFilter === 'Paid') {
                if (d.remainingAmount > 0) return false;
            } else if (statusFilter === 'Overdue') {
                // Must be unpaid AND overdue
                if (d.remainingAmount <= 0 || days <= 0) return false;
            } else if (statusFilter === 'DueSoon') {
                // Unpaid AND due within next 7 days (days is between -7 and 0)
                if (d.remainingAmount <= 0 || days > 0 || days < -7) return false;
            } else if (d.status !== statusFilter) {
                // Fallback for explicitly set statuses like Void
                return false;
            }
        }

        if (dateRange.from && d.dueDate < dateRange.from) return false;
        if (dateRange.to && d.dueDate > dateRange.to) return false;
        
        if (searchTerm) {
             const lower = searchTerm.toLowerCase();
             return d.partnerName.toLowerCase().includes(lower) || 
                    d.orderCode.toLowerCase().includes(lower);
        }

        return true;
    }, [typeFilter, statusFilter, dateRange, searchTerm]);

    const { data: debts, totalItems, currentPage, setCurrentPage, sortState, requestSort, isLoading } = useDexieTable<DebtRecord>({
        table: db.debtRecords,
        itemsPerPage,
        filterFn,
        searchQuery: searchTerm,
        defaultSort: 'dueDate'
    });

    const columns: ColumnDef<DebtRecord>[] = [
        { 
            header: 'Đối tác & Chứng từ', accessorKey: 'partnerName', sortable: true,
            cell: (d) => {
                const days = getDaysDiff(parseDate(d.dueDate));
                const isOverdue = d.remainingAmount > 0 && days > 0;
                
                return (
                    <div className="flex flex-col gap-1 py-1">
                        <div className="flex items-center gap-2">
                            <span className={`font-mono text-[10px] font-black px-2 py-0.5 rounded border uppercase transition-colors ${typeFilter === 'Receivable' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                {d.orderCode}
                            </span>
                            {isOverdue && (
                                <span className="flex items-center gap-1 text-[9px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 animate-pulse">
                                    <span className="material-symbols-outlined text-[12px]">warning</span> QUÁ HẠN
                                </span>
                            )}
                        </div>
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[240px] uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{d.partnerName}</p>
                    </div>
                );
            }
        },
        { 
            header: 'Tiến độ trả', width: 'w-48',
            cell: (d) => {
                const percent = Math.min(100, Math.round(((d.totalAmount - d.remainingAmount) / d.totalAmount) * 100));
                return (
                    <div className="w-full">
                        <div className="flex justify-between items-end mb-1 text-[9px] font-black uppercase text-slate-400">
                            <span>{percent}% Đã trả</span>
                            <span>{formatCurrency(d.totalAmount).replace(' VND','')}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                            <div className={`h-full transition-all duration-1000 ${percent >= 100 ? 'bg-emerald-500' : typeFilter === 'Receivable' ? 'bg-indigo-500' : 'bg-rose-500'}`} style={{ width: `${percent}%` }}></div>
                        </div>
                    </div>
                );
            }
        },
        { 
            header: 'Thời hạn', accessorKey: 'dueDate', width: 'w-32', sortable: true,
            cell: (d) => {
                const days = getDaysDiff(parseDate(d.dueDate)); // days > 0: overdue, days < 0: remaining
                const isOverdue = days > 0 && d.remainingAmount > 0;
                return (
                    <div className="flex flex-col">
                        <span className={`text-xs font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>{d.dueDate}</span>
                        {d.remainingAmount > 0 && (
                            <span className={`text-[10px] font-bold ${isOverdue ? 'text-rose-500' : 'text-emerald-600'}`}>
                                {isOverdue ? `Trễ ${days} ngày` : `Còn ${Math.abs(days)} ngày`}
                            </span>
                        )}
                    </div>
                );
            }
        },
        { 
            header: 'Dư nợ', accessorKey: 'remainingAmount', width: 'w-40', align: 'right', sortable: true,
            cell: (d) => (
                <span className={`text-base font-black tracking-tight ${d.remainingAmount > 0 ? (typeFilter === 'Receivable' ? 'text-indigo-600' : 'text-rose-600') : 'text-slate-300'}`}>
                    {d.remainingAmount > 0 ? formatCurrency(d.remainingAmount).replace(' VND','') : '---'}
                </span>
            )
        },
        {
            header: '', width: 'w-12', align: 'center',
            cell: (d) => (
                <button 
                    onClick={(e) => { e.stopPropagation(); setSelectedDebtId(d.id); }}
                    className={`size-8 rounded-xl transition-all flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 ${typeFilter === 'Receivable' ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white' : 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white'}`}
                >
                    <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
            )
        }
    ];

    return (
        <PageShell className="bg-slate-50 dark:bg-slate-950">
            {/* KPI WALLET SECTION */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-8 pt-8 pb-4 animate-premium">
                <WalletCard 
                    title="Phải thu khách hàng" value={stats.totalAR} count={stats.recCount} type="Receivable" 
                    isActive={typeFilter === 'Receivable'} onClick={() => setTypeFilter('Receivable')} 
                />
                <WalletCard 
                    title="Phải trả nhà cung cấp" value={stats.totalAP} count={stats.payCount} type="Payable" 
                    isActive={typeFilter === 'Payable'} onClick={() => setTypeFilter('Payable')} 
                />
                <NetBalanceCard value={stats.net} />
            </div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-4">
                <TableToolbar 
                    searchValue={searchTerm} onSearchChange={setSearchTerm} placeholder="Tìm tên đối tác, mã đơn hàng..."
                    leftFilters={<DateRangeFilter startDate={dateRange.from} endDate={dateRange.to} onChange={(f, t) => setDateRange({ from: f, to: t })} />}
                >
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        <FilterChip label="Chưa thanh toán" isActive={statusFilter === 'Unpaid'} onClick={() => setStatusFilter('Unpaid')} color={typeFilter === 'Receivable' ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'} />
                        <FilterChip label="Quá hạn" isActive={statusFilter === 'Overdue'} onClick={() => setStatusFilter('Overdue')} color="bg-rose-50 text-rose-600" />
                        <FilterChip label="Sắp đến hạn" isActive={statusFilter === 'DueSoon'} onClick={() => setStatusFilter('DueSoon')} color="bg-amber-50 text-amber-600" />
                        <FilterChip label="Đã tất toán" isActive={statusFilter === 'Paid'} onClick={() => setStatusFilter('Paid')} color="bg-emerald-50 text-emerald-600" />
                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                        <FilterChip label="Tất cả" isActive={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
                    </div>
                </TableToolbar>

                <div className="flex-1 overflow-hidden px-8 pt-4 pb-2 bg-white/40 dark:bg-slate-900/20">
                    <DataTable 
                        data={debts} columns={columns} isLoading={isLoading} sort={{ items: sortState, onSort: requestSort }}
                        onRowClick={(d) => setSelectedDebtId(d.id)} emptyIcon="account_balance_wallet"
                        rowClassName={() => 'h-18 group hover:shadow-md transition-all duration-300'}
                    />
                </div>

                <div className="px-8 py-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={itemsPerPage} onPageChange={setCurrentPage} />
                </div>
            </div>

            <DebtPayDrawer debtId={selectedDebtId} isOpen={!!selectedDebtId} onClose={() => setSelectedDebtId(null)} onNavigate={onNavigate} />
        </PageShell>
    );
};

export default Debts;
