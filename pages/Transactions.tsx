
import React, { useState, useMemo } from 'react';
import { ViewState, Transaction, TransactionType } from '../types';
import { useDexieTable } from '../hooks/useDexieTable';
import { db } from '../services/db';
import { PageShell, Button } from '../components/ui/Primitives';
import { TableToolbar } from '../components/table/TableToolbar';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import Pagination from '../components/Pagination';
import { FilterChip } from '../components/ui/FilterBar';
import { formatCurrency, formatDateISO, getStartOfMonth, getCurrentDate, toCSV, downloadTextFile } from '../utils/helpers';
import { ManualTransactionModal } from '../components/ManualTransactionModal';
import { useLiveQuery } from 'dexie-react-hooks';
import { useDomainServices } from '../hooks/useDomainServices';
import { useNotification } from '../contexts/NotificationContext';
import { DateRangeFilter } from '../components/filters/DateRangeFilter';
import { TransactionDetailDrawer, CATEGORY_MAP } from '../components/transactions/TransactionDetailDrawer';

const METHOD_MAP: Record<string, string> = {
    cash: 'Tiền mặt',
    transfer: 'Chuyển khoản',
    card: 'Thẻ'
};

const TransactionStatCard = ({ title, cash, bank, icon, color, sub }: any) => (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-500">
        <div className="relative z-10 flex justify-between items-start mb-6">
            <div className={`size-12 rounded-2xl flex items-center justify-center ${color} bg-opacity-10 text-opacity-100 shadow-sm group-hover:scale-110 transition-transform`}>
                <span className="material-symbols-outlined text-[26px]">{icon}</span>
            </div>
            <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</p>
                <p className="text-[9px] font-bold text-slate-500 mt-0.5">{sub}</p>
            </div>
        </div>
        <div className="relative z-10 space-y-3">
            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">payments</span> Tiền mặt
                </span>
                <span className="text-sm font-black text-slate-900 dark:text-white">{formatCurrency(cash).replace(' VND','')}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">account_balance</span> Ngân hàng
                </span>
                <span className="text-sm font-black text-slate-900 dark:text-white">{formatCurrency(bank).replace(' VND','')}</span>
            </div>
        </div>
        <span className={`material-symbols-outlined absolute -bottom-6 -right-6 text-[130px] opacity-[0.02] group-hover:opacity-[0.06] transition-all duration-700 pointer-events-none rotate-12 ${color.replace('bg-','text-')}`}>{icon}</span>
    </div>
);

const Transactions: React.FC<{ onNavigate: (view: ViewState, params?: any) => void }> = ({ onNavigate }) => {
    const { deleteTransaction } = useDomainServices();
    const { showNotification, confirm } = useNotification();
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
    const [methodFilter, setMethodFilter] = useState<'all' | 'cash' | 'transfer'>('all');
    const [dateRange, setDateRange] = useState({ 
        from: formatDateISO(getStartOfMonth(new Date())), 
        to: getCurrentDate() 
    });
    
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);

    const itemsPerPage = 20;

    const stats = useLiveQuery(async () => {
        const txns = await db.transactions
            .where('date')
            .between(dateRange.from, dateRange.to, true, true)
            .toArray();

        let inCash = 0, inBank = 0, outCash = 0, outBank = 0;

        for (const t of txns) {
            if (t.type === 'income') {
                if (t.method === 'cash') inCash += t.amount;
                else inBank += t.amount;
            } else {
                if (t.method === 'cash') outCash += t.amount;
                else outBank += t.amount;
            }
        }

        return { inCash, inBank, outCash, outBank, balance: (inCash + inBank) - (outCash + outBank) };
    }, [dateRange]) || { inCash: 0, inBank: 0, outCash: 0, outBank: 0, balance: 0 };

    const filterFn = useMemo(() => (t: Transaction) => {
        if (typeFilter !== 'all' && t.type !== typeFilter) return false;
        if (methodFilter !== 'all' && t.method !== methodFilter) return false;
        if (dateRange.from && t.date < dateRange.from) return false;
        if (dateRange.to && t.date > dateRange.to) return false;

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            return t.description.toLowerCase().includes(lower) || 
                   (t.referenceCode?.toLowerCase().includes(lower) ?? false) ||
                   (t.partnerName?.toLowerCase().includes(lower) ?? false);
        }
        return true;
    }, [searchTerm, typeFilter, methodFilter, dateRange]);

    const { data: transactions, totalItems, currentPage, setCurrentPage, sortState, requestSort, isLoading } = useDexieTable<Transaction>({
        table: db.transactions,
        itemsPerPage,
        filterFn,
        defaultSort: 'date'
    });

    const handleExport = async () => {
        try {
            const allTxns = await db.transactions
                .where('date').between(dateRange.from, dateRange.to, true, true)
                .filter(filterFn)
                .toArray();

            if (allTxns.length === 0) {
                showNotification('Không có dữ liệu để xuất', 'warning');
                return;
            }

            const exportData = allTxns.map(t => ({
                'Ngày': t.date,
                'Loại': t.type === 'income' ? 'Thu' : 'Chi',
                'Hạng mục': CATEGORY_MAP[t.category] || t.category,
                'Số tiền': t.amount,
                'Hình thức': METHOD_MAP[t.method] || t.method,
                'Nội dung': t.description,
                'Đối tác': t.partnerName || '',
                'Tham chiếu': t.referenceCode || ''
            }));

            const headers = [
                { key: 'Ngày', label: 'Ngày' },
                { key: 'Loại', label: 'Loại phiếu' },
                { key: 'Hạng mục', label: 'Hạng mục' },
                { key: 'Số tiền', label: 'Số tiền' },
                { key: 'Hình thức', label: 'Hình thức' },
                { key: 'Nội dung', label: 'Nội dung' },
                { key: 'Đối tác', label: 'Đối tác' },
                { key: 'Tham chiếu', label: 'Mã chứng từ' },
            ];

            const csvContent = toCSV(exportData, headers);
            downloadTextFile(`SoQuy_${dateRange.from}_${dateRange.to}.csv`, csvContent);
            showNotification(`Đã xuất ${allTxns.length} dòng giao dịch`, 'success');
        } catch (e) {
            showNotification('Lỗi khi xuất file', 'error');
        }
    };

    const columns: ColumnDef<Transaction>[] = [
        { 
            header: 'Thời gian', accessorKey: 'date', width: 'w-32', sortable: true,
            cell: (t) => (
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t.date}</span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{new Date(t.timestamp || t.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            )
        },
        { 
            header: 'Hạng mục', accessorKey: 'category', width: 'w-40',
            cell: (t) => (
                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl border ${t.type === 'income' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                    {CATEGORY_MAP[t.category] || t.category}
                </span>
            )
        },
        { 
            header: 'Nội dung & Đối tác', accessorKey: 'description', sortable: true,
            cell: (t) => (
                <div className="min-w-0 pr-4">
                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[320px] group-hover:text-blue-600 transition-colors uppercase tracking-tight" title={t.description}>{t.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                             <span className="material-symbols-outlined text-[12px]">person</span> {t.partnerName || 'Khách lẻ'}
                        </span>
                        {t.referenceCode && (
                            <span className="text-[9px] font-mono font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded border border-blue-100 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[10px]">link</span> {t.referenceCode}
                            </span>
                        )}
                    </div>
                </div>
            )
        },
        { 
            header: 'Số tiền', accessorKey: 'amount', width: 'w-40', align: 'right', sortable: true,
            cell: (t) => (
                <div className="flex flex-col items-end">
                    <span className={`font-black text-base tracking-tighter ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount).replace(' VND','')}
                    </span>
                    <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase">
                        <span className="material-symbols-outlined text-[12px]">{t.method === 'cash' ? 'payments' : 'account_balance'}</span>
                        {METHOD_MAP[t.method] || t.method}
                    </div>
                </div>
            )
        },
        {
            header: '', width: 'w-10', align: 'center',
            cell: (t) => (
                <button 
                    onClick={(e) => { e.stopPropagation(); setSelectedTxnId(t.id); }} 
                    className="size-8 rounded-full text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                >
                    <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
            )
        }
    ];

    return (
        <PageShell>
            {/* KPI Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-8 pt-8 pb-4 animate-premium">
                <TransactionStatCard title="Tổng thu" cash={stats.inCash} bank={stats.inBank} icon="arrow_downward" color="bg-emerald-500 text-emerald-600" sub="Trong kỳ báo cáo" />
                <TransactionStatCard title="Tổng chi" cash={stats.outCash} bank={stats.outBank} icon="arrow_upward" color="bg-rose-500 text-rose-600" sub="Trong kỳ báo cáo" />
                <div className="bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-xl flex flex-col justify-center relative overflow-hidden group">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] relative z-10">Dòng tiền ròng (Net)</p>
                    <h3 className={`text-4xl font-black mt-2 relative z-10 tracking-tighter ${stats.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {stats.balance > 0 ? '+' : ''}{formatCurrency(stats.balance).replace(' VND','')}
                    </h3>
                    <div className="mt-4 flex items-center gap-2 relative z-10">
                        <div className={`size-2 rounded-full ${stats.balance >= 0 ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`}></div>
                        <span className="text-[9px] font-bold uppercase opacity-60 tracking-widest">{stats.balance >= 0 ? 'Thặng dư ngân sách' : 'Thâm hụt kỳ này'}</span>
                    </div>
                    <span className="material-symbols-outlined absolute -bottom-6 -right-6 text-[140px] opacity-10 rotate-12 group-hover:rotate-0 transition-transform duration-1000">account_balance_wallet</span>
                </div>
                <div 
                    className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-6 rounded-[2.5rem] shadow-xl flex flex-col justify-between relative overflow-hidden group cursor-pointer hover:shadow-2xl transition-all"
                    onClick={() => setIsCreateModalOpen(true)}
                >
                    <div className="relative z-10">
                        <div className="size-12 rounded-2xl bg-white/20 flex items-center justify-center mb-4 backdrop-blur-md border border-white/20 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-[26px]">add</span>
                        </div>
                        <h3 className="text-xl font-black uppercase tracking-tight">Lập phiếu mới</h3>
                        <p className="text-[10px] opacity-80 font-bold uppercase tracking-widest mt-1">Thu chi / Chuyển quỹ</p>
                    </div>
                    <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-[110px] opacity-10 rotate-12 group-hover:rotate-0 transition-all duration-700">payments</span>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-4">
                <TableToolbar 
                    searchValue={searchTerm} 
                    onSearchChange={setSearchTerm} 
                    placeholder="Tìm nội dung, đối tác, mã tham chiếu..."
                    leftFilters={
                        <DateRangeFilter startDate={dateRange.from} endDate={dateRange.to} onChange={(from, to) => setDateRange({ from, to })} />
                    }
                    rightActions={
                        <div className="flex gap-2">
                            <Button variant="outline" icon="file_download" onClick={handleExport} className="rounded-2xl h-11 px-6 border-slate-300">Xuất Excel</Button>
                        </div>
                    }
                >
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        <FilterChip label="Tất cả phiếu" isActive={typeFilter === 'all'} onClick={() => setTypeFilter('all')} />
                        <FilterChip label="Khoản thu (+)" isActive={typeFilter === 'income'} onClick={() => setTypeFilter('income')} color="bg-emerald-50 text-emerald-600" />
                        <FilterChip label="Khoản chi (-)" isActive={typeFilter === 'expense'} onClick={() => setTypeFilter('expense')} color="bg-rose-50 text-rose-600" />
                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                        <FilterChip label="Tất cả nguồn" isActive={methodFilter === 'all'} onClick={() => setMethodFilter('all')} />
                        <FilterChip label="Tiền mặt" isActive={methodFilter === 'cash'} onClick={() => setMethodFilter('cash')} icon="payments" />
                        <FilterChip label="Chuyển khoản" isActive={methodFilter === 'transfer'} onClick={() => setMethodFilter('transfer')} icon="account_balance" />
                    </div>
                </TableToolbar>

                <div className="flex-1 overflow-hidden px-8 pt-4 pb-2">
                    <DataTable 
                        data={transactions} 
                        columns={columns} 
                        isLoading={isLoading} 
                        sort={{ items: sortState, onSort: requestSort }}
                        onRowClick={(t) => setSelectedTxnId(t.id)}
                        emptyIcon="payments"
                        emptyMessage="Không tìm thấy giao dịch nào phù hợp."
                        rowClassName={() => 'h-18 group'}
                    />
                </div>

                <div className="px-8 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={itemsPerPage} onPageChange={setCurrentPage} />
                </div>
            </div>

            <ManualTransactionModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
            
            <TransactionDetailDrawer 
                transactionId={selectedTxnId} 
                isOpen={!!selectedTxnId} 
                onClose={() => setSelectedTxnId(null)} 
                onDelete={deleteTransaction}
                onNavigate={onNavigate}
            />
        </PageShell>
    );
};

export default Transactions;
