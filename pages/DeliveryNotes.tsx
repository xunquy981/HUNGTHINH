
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { ViewState, DeliveryNote, DeliveryStatus } from '../types';
import { useDexieTable } from '../hooks/useDexieTable';
import { PageShell, Button } from '../components/ui/Primitives';
import { TableToolbar } from '../components/table/TableToolbar';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import Pagination from '../components/Pagination';
import { FilterChip } from '../components/ui/FilterBar';
import { DateRangeFilter } from '../components/filters/DateRangeFilter';
import { formatCurrency, formatDateISO, getStartOfMonth, getCurrentDate } from '../utils/helpers';
import StatusBadge from '../components/StatusBadge';
import { DeliveryDetailDrawer } from '../components/delivery/DeliveryDetailDrawer';
import { CreateDeliveryModal, PrintDeliveryModal } from '../components/DeliveryModals';

const DeliveryStatCard = ({ title, count, icon, color, active, onClick }: any) => (
    <div 
        onClick={onClick}
        className={`relative overflow-hidden p-5 rounded-[1.5rem] border transition-all duration-300 cursor-pointer group flex flex-col justify-between h-32 ${
            active 
            ? `bg-white dark:bg-slate-800 ring-2 ring-${color}-500 ring-offset-2 dark:ring-offset-slate-950 shadow-xl border-transparent` 
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300'
        }`}
    >
        <div className="flex justify-between items-start relative z-10">
            <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${active ? `bg-${color}-500 text-white` : `bg-${color}-50 text-${color}-600`} transition-colors`}>
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
            </div>
            {active && <div className={`size-2 rounded-full bg-${color}-500 animate-pulse`}></div>}
        </div>
        <div className="relative z-10">
            <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter leading-none mb-1">{count}</h3>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${active ? `text-${color}-600` : 'text-slate-400'}`}>{title}</p>
        </div>
        <span className={`material-symbols-outlined absolute -bottom-4 -right-4 text-[80px] opacity-[0.05] group-hover:opacity-[0.1] transition-opacity rotate-12 text-${color}-500`}>{icon}</span>
    </div>
);

const DeliveryNotes: React.FC<{ onNavigate: (view: ViewState, params?: any) => void, initialParams?: any }> = ({ onNavigate, initialParams }) => {
    
    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState({ 
        from: formatDateISO(getStartOfMonth(new Date())), 
        to: getCurrentDate() 
    });
    
    const [selectedNoteId, setSelectedNoteId] = useState<string | null>(initialParams?.highlightId || null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(initialParams?.initialOrderId ? true : false);
    const [printData, setPrintData] = useState<DeliveryNote | null>(null);

    const itemsPerPage = 15;

    // --- REAL-TIME STATS ---
    const stats = useLiveQuery(async () => {
        const all = await db.deliveryNotes.toArray();
        return {
            all: all.length,
            pending: all.filter(n => n.status === 'Pending').length,
            shipping: all.filter(n => n.status === 'Shipping').length,
            delivered: all.filter(n => n.status === 'Delivered').length
        };
    }, []) || { all: 0, pending: 0, shipping: 0, delivered: 0 };

    const filterFn = useMemo(() => (n: DeliveryNote) => {
        if (statusFilter !== 'all' && n.status !== statusFilter) return false;
        
        if (dateRange.from && n.date < dateRange.from) return false;
        if (dateRange.to && n.date > dateRange.to) return false;

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            return n.code.toLowerCase().includes(lower) || 
                   n.customerName.toLowerCase().includes(lower) ||
                   (n.shipperName?.toLowerCase().includes(lower) ?? false) ||
                   n.orderCode.toLowerCase().includes(lower);
        }
        return true;
    }, [searchTerm, statusFilter, dateRange]);

    const { data: notes, totalItems, currentPage, setCurrentPage, sortState, requestSort, isLoading } = useDexieTable<DeliveryNote>({
        table: db.deliveryNotes,
        itemsPerPage,
        filterFn,
        defaultSort: 'date'
    });

    const columns: ColumnDef<DeliveryNote>[] = [
        { 
            header: 'Mã phiếu', accessorKey: 'code', width: 'w-32', sortable: true,
            cell: (n) => <span className="font-mono font-black text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-800 uppercase">{n.code}</span>
        },
        { 
            header: 'Mã đơn', accessorKey: 'orderCode', width: 'w-32',
            cell: (n) => <span className="font-mono font-bold text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded cursor-pointer hover:bg-slate-200" onClick={(e) => { e.stopPropagation(); if(n.orderId) onNavigate('ORDERS', { highlightId: n.orderId }); }}>{n.orderCode}</span>
        },
        { 
            header: 'Khách hàng', accessorKey: 'customerName', sortable: true,
            cell: (n) => (
                <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[200px] group-hover:text-blue-600 transition-colors">{n.customerName}</p>
                    <p className="text-[10px] text-slate-500 truncate max-w-[200px] flex items-center gap-1">
                        <span className="material-symbols-outlined text-[10px]">location_on</span>
                        {n.address || 'Tại quầy'}
                    </p>
                </div>
            )
        },
        { 
            header: 'Ngày giao', accessorKey: 'date', width: 'w-28', sortable: true,
            cell: (n) => <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{n.date}</span>
        },
        { 
            header: 'Trạng thái', accessorKey: 'status', width: 'w-32', align: 'center',
            cell: (n) => <StatusBadge status={n.status} entityType="Delivery" size="sm" />
        },
        { 
            header: 'Shipper', accessorKey: 'shipperName', width: 'w-36',
            cell: (n) => n.shipperName ? (
                <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500">
                        {n.shipperName.charAt(0)}
                    </div>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 truncate">{n.shipperName}</span>
                </div>
            ) : <span className="text-xs text-slate-400 italic">---</span>
        }
    ];

    return (
        <PageShell>
            {/* KPI Dashboard */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-8 pt-8 pb-4 animate-premium">
                <DeliveryStatCard 
                    title="Chờ giao hàng" 
                    count={stats.pending} 
                    icon="inventory_2" 
                    color="slate" 
                    active={statusFilter === 'Pending'} 
                    onClick={() => setStatusFilter(statusFilter === 'Pending' ? 'all' : 'Pending')} 
                />
                <DeliveryStatCard 
                    title="Đang vận chuyển" 
                    count={stats.shipping} 
                    icon="local_shipping" 
                    color="blue" 
                    active={statusFilter === 'Shipping'} 
                    onClick={() => setStatusFilter(statusFilter === 'Shipping' ? 'all' : 'Shipping')} 
                />
                <DeliveryStatCard 
                    title="Giao thành công" 
                    count={stats.delivered} 
                    icon="verified" 
                    color="emerald" 
                    active={statusFilter === 'Delivered'} 
                    onClick={() => setStatusFilter(statusFilter === 'Delivered' ? 'all' : 'Delivered')} 
                />
                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 text-white p-5 rounded-[1.5rem] shadow-xl flex flex-col justify-between relative overflow-hidden group cursor-pointer hover:shadow-2xl transition-all" onClick={() => setIsCreateModalOpen(true)}>
                    <div className="relative z-10">
                        <div className="size-10 rounded-xl bg-white/20 flex items-center justify-center mb-2 backdrop-blur-sm group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-[20px]">add</span>
                        </div>
                        <h3 className="text-lg font-black uppercase tracking-tight">Tạo phiếu giao</h3>
                        <p className="text-[10px] opacity-80 font-bold uppercase tracking-widest mt-1">Điều phối vận đơn</p>
                    </div>
                    <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-[100px] opacity-10 rotate-12 group-hover:rotate-0 transition-transform">post_add</span>
                </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-4">
                <TableToolbar 
                    searchValue={searchTerm} 
                    onSearchChange={setSearchTerm} 
                    placeholder="Tìm mã phiếu, mã đơn, khách, shipper..."
                    leftFilters={
                        <DateRangeFilter startDate={dateRange.from} endDate={dateRange.to} onChange={(f, t) => setDateRange({ from: f, to: t })} />
                    }
                >
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        <FilterChip label="Tất cả" isActive={statusFilter === 'all'} onClick={() => setStatusFilter('all')} count={stats.all} />
                        <FilterChip label="Chờ giao" isActive={statusFilter === 'Pending'} onClick={() => setStatusFilter('Pending')} count={stats.pending} color="bg-slate-100 text-slate-600" />
                        <FilterChip label="Đang giao" isActive={statusFilter === 'Shipping'} onClick={() => setStatusFilter('Shipping')} count={stats.shipping} color="bg-blue-50 text-blue-600" />
                        <FilterChip label="Hoàn tất" isActive={statusFilter === 'Delivered'} onClick={() => setStatusFilter('Delivered')} count={stats.delivered} color="bg-emerald-50 text-emerald-600" />
                    </div>
                </TableToolbar>

                <div className="flex-1 overflow-hidden px-8 pt-4 pb-2">
                    <DataTable 
                        data={notes} 
                        columns={columns} 
                        isLoading={isLoading} 
                        sort={{ items: sortState, onSort: requestSort }}
                        onRowClick={(n) => setSelectedNoteId(n.id)}
                        emptyIcon="local_shipping"
                        emptyMessage="Không tìm thấy phiếu giao hàng nào."
                        rowClassName={() => 'h-16 group'}
                    />
                </div>

                <div className="px-8 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={itemsPerPage} onPageChange={setCurrentPage} />
                </div>
            </div>

            <DeliveryDetailDrawer 
                isOpen={!!selectedNoteId} 
                noteId={selectedNoteId} 
                onClose={() => setSelectedNoteId(null)} 
                onPrint={(n) => {
                    setPrintData(n);
                    setSelectedNoteId(null);
                }}
            />

            <CreateDeliveryModal 
                isOpen={isCreateModalOpen} 
                onClose={() => setIsCreateModalOpen(false)}
                onSuccess={(newId) => setSelectedNoteId(newId)}
                initialOrderId={initialParams?.initialOrderId}
            />

            <PrintDeliveryModal 
                isOpen={!!printData} 
                onClose={() => setPrintData(null)} 
                data={printData} 
            />
        </PageShell>
    );
};

export default DeliveryNotes;
