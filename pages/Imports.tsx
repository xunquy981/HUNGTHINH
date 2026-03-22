
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { ViewState, ImportOrder, PurchaseReturnNote } from '../types';
import { useDexieTable } from '../hooks/useDexieTable';
import { PageShell, Button } from '../components/ui/Primitives';
import { TableToolbar } from '../components/table/TableToolbar';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import Pagination from '../components/Pagination';
import { FilterChip } from '../components/ui/FilterBar';
import { DateRangeFilter } from '../components/filters/DateRangeFilter';
import { formatCurrency, formatDateISO, getStartOfMonth, getCurrentDate } from '../utils/helpers';
import StatusBadge from '../components/StatusBadge';
import { ImportDetailDrawer } from '../components/imports/ImportDetailDrawer';
import { ImportWizard } from '../components/imports/ImportWizard';
import { ReceiveItemsModal, CreatePurchaseReturnModal, PrintImportModal } from '../components/ImportModals';

const ImportStatCard = ({ title, value, sub, icon, color, active, onClick }: any) => (
    <div 
        onClick={onClick}
        className={`relative overflow-hidden p-6 rounded-[2rem] border transition-all duration-300 cursor-pointer group flex flex-col justify-between h-36 ${
            active 
            ? `bg-white dark:bg-slate-800 ring-2 ring-${color}-500 ring-offset-2 shadow-xl border-transparent` 
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300'
        }`}
    >
        <div className="flex justify-between items-start relative z-10">
            <div className={`size-11 rounded-2xl flex items-center justify-center shrink-0 ${active ? `bg-${color}-500 text-white` : `bg-${color}-50 text-${color}-600`} transition-colors`}>
                <span className="material-symbols-outlined text-[24px]">{icon}</span>
            </div>
            {active && <div className={`size-2 rounded-full bg-${color}-500 animate-pulse`}></div>}
        </div>
        <div className="relative z-10 mt-2">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter leading-none mb-1">{value}</h3>
            <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${active ? `text-${color}-600` : 'text-slate-400'}`}>{title}</p>
            {sub && <p className="text-[10px] font-medium text-slate-500 mt-1 opacity-80">{sub}</p>}
        </div>
        <span className={`material-symbols-outlined absolute -bottom-4 -right-4 text-[100px] opacity-[0.03] group-hover:opacity-[0.08] transition-opacity rotate-12 text-${color}-500`}>{icon}</span>
    </div>
);

const Imports: React.FC<{ onNavigate: (view: ViewState, params?: any) => void, initialParams?: any }> = ({ onNavigate, initialParams }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState({ 
        from: formatDateISO(getStartOfMonth(new Date())), 
        to: getCurrentDate() 
    });

    const [selectedImportId, setSelectedImportId] = useState<string | null>(initialParams?.highlightId || null);
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [printData, setPrintData] = useState<ImportOrder | null>(null);

    const itemsPerPage = 15;

    const stats = useLiveQuery(async () => {
        const all = await db.importOrders.toArray();
        const period = all.filter(i => i.date >= dateRange.from && i.date <= dateRange.to);
        
        return {
            totalValue: period.reduce((s, i) => s + i.total, 0),
            pending: all.filter(i => i.status === 'Pending' || i.status === 'Receiving').length,
            debt: all.reduce((s, i) => s + (i.total - (i.amountPaid || 0)), 0),
            count: period.length
        };
    }, [dateRange]) || { totalValue: 0, pending: 0, debt: 0, count: 0 };

    const filterFn = useMemo(() => (i: ImportOrder) => {
        if (statusFilter !== 'all' && i.status !== statusFilter) return false;
        if (dateRange.from && i.date < dateRange.from) return false;
        if (dateRange.to && i.date > dateRange.to) return false;
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            return i.code.toLowerCase().includes(lower) || i.supplierName.toLowerCase().includes(lower);
        }
        return true;
    }, [searchTerm, statusFilter, dateRange]);

    const { data: imports, totalItems, currentPage, setCurrentPage, sortState, requestSort, isLoading } = useDexieTable<ImportOrder>({
        table: db.importOrders,
        itemsPerPage,
        filterFn,
        defaultSort: 'date'
    });

    const columns: ColumnDef<ImportOrder>[] = [
        { 
            header: 'Mã phiếu', accessorKey: 'code', width: 'w-32', sortable: true,
            cell: (i) => <span className="font-mono font-black text-xs text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded border border-orange-100 dark:border-orange-800 uppercase shadow-sm">{i.code}</span>
        },
        { 
            header: 'Nhà cung cấp', accessorKey: 'supplierName', sortable: true,
            cell: (i) => (
                <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[250px] group-hover:text-emerald-600 transition-colors uppercase tracking-tight">{i.supplierName}</p>
                    <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">inventory_2</span>
                        {i.warehouse || 'Kho chính'}
                    </p>
                </div>
            )
        },
        { 
            header: 'Ngày nhập', accessorKey: 'date', width: 'w-28', sortable: true,
            cell: (i) => <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{i.date}</span>
        },
        { 
            header: 'Trạng thái', accessorKey: 'status', width: 'w-36', align: 'center',
            cell: (i) => <StatusBadge status={i.status} entityType="Import" size="sm" showIcon />
        },
        { 
            header: 'Thanh toán', accessorKey: 'amountPaid', width: 'w-40',
            cell: (i) => {
                const percent = i.total > 0 ? ((i.amountPaid || 0) / i.total) * 100 : 100;
                const isPaid = percent >= 100;
                return (
                    <div className="w-full max-w-[120px]">
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[9px] font-black uppercase ${isPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {isPaid ? 'Đã xong' : `${Math.round(percent)}%`}
                            </span>
                        </div>
                        <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full transition-all duration-1000 ${isPaid ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${percent}%` }}></div>
                        </div>
                    </div>
                )
            }
        },
        { 
            header: 'Tổng tiền', accessorKey: 'total', width: 'w-36', align: 'right', sortable: true,
            cell: (i) => <span className="font-black text-sm text-slate-900 dark:text-white">{formatCurrency(i.total).replace(' VND','')}</span>
        }
    ];

    return (
        <PageShell>
            {/* KPI Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-8 pt-8 pb-4 animate-premium">
                <ImportStatCard 
                    title="Tổng giá trị nhập" 
                    value={formatCurrency(stats.totalValue).replace(' VND','')} 
                    sub={`${stats.count} phiếu trong kỳ`}
                    icon="analytics" 
                    color="blue" 
                />
                <ImportStatCard 
                    title="Chờ nhập kho" 
                    value={stats.pending.toString()} 
                    sub="Cần kiểm đếm hàng về"
                    icon="hourglass_top" 
                    color="orange" 
                    active={statusFilter === 'Pending' || statusFilter === 'Receiving'}
                    onClick={() => setStatusFilter(statusFilter === 'Receiving' ? 'all' : 'Receiving')}
                />
                <ImportStatCard 
                    title="Công nợ NCC" 
                    value={formatCurrency(stats.debt).replace(' VND','')} 
                    sub="Tổng tiền chưa thanh toán"
                    icon="money_off" 
                    color="rose" 
                />
                <div 
                    className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-6 rounded-[2rem] shadow-xl flex flex-col justify-between relative overflow-hidden group cursor-pointer hover:shadow-2xl transition-all"
                    onClick={() => setIsWizardOpen(true)}
                >
                    <div className="relative z-10">
                        <div className="size-11 rounded-2xl bg-white/20 flex items-center justify-center mb-3 backdrop-blur-md border border-white/20 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-[24px]">add</span>
                        </div>
                        <h3 className="text-xl font-black uppercase tracking-tight">Nhập hàng mới</h3>
                        <p className="text-[10px] opacity-80 font-bold uppercase tracking-widest mt-1">Quét hóa đơn AI / Excel</p>
                    </div>
                    <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-[110px] opacity-10 rotate-12 group-hover:rotate-0 transition-all duration-700">inventory</span>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-4">
                <TableToolbar 
                    searchValue={searchTerm} 
                    onSearchChange={setSearchTerm} 
                    placeholder="Tìm mã phiếu, nhà cung cấp, số hóa đơn..."
                    leftFilters={
                        <DateRangeFilter startDate={dateRange.from} endDate={dateRange.to} onChange={(f, t) => setDateRange({ from: f, to: t })} />
                    }
                >
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        <FilterChip label="Tất cả phiếu" isActive={statusFilter === 'all'} onClick={() => setStatusFilter('all')} count={stats.count} />
                        <FilterChip label="Đang kiểm đếm" isActive={statusFilter === 'Receiving'} onClick={() => setStatusFilter('Receiving')} color="bg-orange-50 text-orange-600" />
                        <FilterChip label="Hoàn tất" isActive={statusFilter === 'Completed'} onClick={() => setStatusFilter('Completed')} color="bg-emerald-50 text-emerald-600" />
                    </div>
                </TableToolbar>

                <div className="flex-1 overflow-hidden px-8 pt-4 pb-2">
                    <DataTable 
                        data={imports} 
                        columns={columns} 
                        isLoading={isLoading} 
                        sort={{ items: sortState, onSort: requestSort }}
                        onRowClick={(i) => setSelectedImportId(i.id)}
                        emptyIcon="move_to_inbox"
                        emptyMessage="Không tìm thấy dữ liệu nhập hàng."
                        rowClassName={() => 'h-18 group'}
                    />
                </div>

                <div className="px-8 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={itemsPerPage} onPageChange={setCurrentPage} />
                </div>
            </div>

            <ImportDetailDrawer 
                isOpen={!!selectedImportId}
                importId={selectedImportId}
                onClose={() => setSelectedImportId(null)}
                onPrint={(i) => { setPrintData(i); setSelectedImportId(null); }}
                onReceive={() => { setIsReceiveModalOpen(true); }}
                onReturn={() => { setIsReturnModalOpen(true); }}
            />

            <ImportWizard isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} />
            
            <ReceiveItemsModal 
                isOpen={isReceiveModalOpen} 
                onClose={() => setIsReceiveModalOpen(false)} 
                importOrder={imports.find(i => i.id === selectedImportId) || null} 
            />

            <PrintImportModal 
                isOpen={!!printData} 
                onClose={() => setPrintData(null)} 
                data={printData} 
            />
        </PageShell>
    );
};

export default Imports;
