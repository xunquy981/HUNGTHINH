
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { ViewState, Quote, QuoteStatus } from '../types';
import { useDomainServices } from '../hooks/useDomainServices';
import { useNotification } from '../contexts/NotificationContext';
import { useDexieTable } from '../hooks/useDexieTable';
import { PageShell, Button } from '../components/ui/Primitives';
import { TableToolbar } from '../components/table/TableToolbar';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import Pagination from '../components/Pagination';
import { FilterChip } from '../components/ui/FilterBar';
import { DateRangeFilter } from '../components/filters/DateRangeFilter';
import { formatCurrency, formatDateISO, getStartOfMonth, getCurrentDate, addDays } from '../utils/helpers';
import StatusBadge from '../components/StatusBadge';
import { QuoteDetailDrawer } from '../components/quotes/QuoteDetailDrawer';
import { CreateQuoteModal, PrintPreviewModal } from '../components/QuoteModals';

// --- KPI CARD COMPONENT ---
const QuoteKpiCard = ({ title, value, sub, icon, color }: { title: string, value: string, sub?: string, icon: string, color: string }) => (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-[1.5rem] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4 relative overflow-hidden group hover:shadow-md transition-all">
        <div className={`size-12 rounded-2xl flex items-center justify-center shrink-0 ${color} bg-opacity-10 text-opacity-100 shadow-inner`}>
            <span className="material-symbols-outlined text-[24px]">{icon}</span>
        </div>
        <div className="relative z-10">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
            <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight mt-0.5">{value}</h3>
            {sub && <p className="text-[10px] font-bold text-slate-500 mt-1">{sub}</p>}
        </div>
        <span className={`material-symbols-outlined absolute -bottom-3 -right-3 text-[80px] opacity-[0.03] rotate-12 group-hover:scale-110 transition-transform ${color.replace('bg-', 'text-')}`}>{icon}</span>
    </div>
);

const Quotes: React.FC<{ onNavigate: (view: ViewState, params?: any) => void, initialParams?: any }> = ({ onNavigate, initialParams }) => {
    const { createQuote, deleteQuote, convertQuoteToOrder, updateQuote } = useDomainServices();
    const { showNotification } = useNotification();
    
    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState({ 
        from: formatDateISO(getStartOfMonth(new Date())), 
        to: getCurrentDate() 
    });
    
    const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(initialParams?.highlightId || null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
    const [editData, setEditData] = useState<Quote | null>(null);
    const [printData, setPrintData] = useState<Quote | null>(null);

    const itemsPerPage = 15;

    // --- REAL-TIME STATS ---
    const stats = useLiveQuery(async () => {
        const all = await db.quotes
            .where('date').between(dateRange.from, dateRange.to, true, true)
            .toArray();
            
        const totalValue = all.reduce((sum, q) => sum + q.total, 0);
        const acceptedCount = all.filter(q => q.status === 'Accepted').length;
        const conversionRate = all.length > 0 ? (acceptedCount / all.length) * 100 : 0;

        return {
            all: all.length,
            draft: all.filter(q => q.status === 'Draft').length,
            sent: all.filter(q => q.status === 'Sent').length,
            accepted: acceptedCount,
            totalValue: totalValue,
            conversionRate: conversionRate
        };
    }, [dateRange]) || { all: 0, draft: 0, sent: 0, accepted: 0, totalValue: 0, conversionRate: 0 };

    const filterFn = useMemo(() => (q: Quote) => {
        if (statusFilter !== 'all' && q.status !== statusFilter) return false;
        
        if (dateRange.from && q.date < dateRange.from) return false;
        if (dateRange.to && q.date > dateRange.to) return false;

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            return q.code.toLowerCase().includes(lower) || 
                   q.customerName.toLowerCase().includes(lower) ||
                   (q.phone?.includes(lower) ?? false);
        }
        return true;
    }, [searchTerm, statusFilter, dateRange]);

    const { data: quotes, totalItems, currentPage, setCurrentPage, sortState, requestSort, isLoading } = useDexieTable<Quote>({
        table: db.quotes,
        itemsPerPage,
        filterFn,
        defaultSort: 'createdAt'
    });

    const selectedQuote = useLiveQuery(() => selectedQuoteId ? db.quotes.get(selectedQuoteId) : undefined, [selectedQuoteId]);

    const handleConvertToOrder = async (id: string, params: any) => {
        const newOrderId = await convertQuoteToOrder(id, params);
        // Tự động chuyển trang và mở chi tiết đơn hàng mới
        onNavigate('ORDERS', { highlightId: newOrderId });
    };

    const handleDuplicate = async (q: Quote) => {
        const newQuote: Partial<Quote> = {
            code: `BG-${Date.now().toString().slice(-6)}`,
            customerName: q.customerName,
            customerId: q.customerId,
            phone: q.phone,
            address: q.address,
            taxId: q.taxId,
            date: getCurrentDate(),
            validUntil: formatDateISO(addDays(new Date(), 7)),
            items: q.items.map(item => ({...item})),
            subtotal: q.subtotal,
            discount: q.discount,
            vatRate: q.vatRate,
            vatAmount: q.vatAmount,
            total: q.total,
            notes: q.notes,
            status: 'Draft',
        };

        const newId = await createQuote(newQuote);
        showNotification('Đã nhân bản báo giá thành công', 'success');
        setSelectedQuoteId(newId);
    };

    const handleEditRequest = (q: Quote) => {
        if (q.convertedOrderId) {
            showNotification('Báo giá đã chuyển đổi không thể sửa.', 'warning');
            return;
        }
        setModalMode('edit');
        setEditData(q);
        setSelectedQuoteId(null);
        setTimeout(() => setIsCreateModalOpen(true), 200);
    };

    const columns: ColumnDef<Quote>[] = [
        { 
            header: 'Mã BG', accessorKey: 'code', width: 'w-32', sortable: true,
            cell: (q) => <span className="font-mono font-black text-xs text-purple-600 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded border border-purple-100 dark:border-purple-800 uppercase">{q.code}</span>
        },
        { 
            header: 'Khách hàng', accessorKey: 'customerName', sortable: true,
            cell: (q) => (
                <div>
                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[200px] hover:text-purple-600 transition-colors cursor-pointer">{q.customerName}</p>
                    <p className="text-[10px] text-slate-500">{q.phone || '---'}</p>
                </div>
            )
        },
        { 
            header: 'Ngày lập', accessorKey: 'date', width: 'w-28', sortable: true,
            cell: (q) => <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{q.date}</span>
        },
        { 
            header: 'Hiệu lực', accessorKey: 'validUntil', width: 'w-28',
            cell: (q) => (
                <div className="flex flex-col">
                    <span className="text-xs text-slate-500">{q.validUntil}</span>
                    {new Date(q.validUntil) < new Date() && q.status !== 'Accepted' && <span className="text-[9px] text-red-500 font-bold">Hết hạn</span>}
                </div>
            )
        },
        { 
            header: 'Trạng thái', accessorKey: 'status', width: 'w-32', align: 'center',
            cell: (q) => <StatusBadge status={q.status} entityType="Quote" size="sm" />
        },
        { 
            header: 'Tổng giá trị', accessorKey: 'total', width: 'w-36', align: 'right', sortable: true,
            cell: (q) => <span className="font-black text-sm text-slate-900 dark:text-white">{formatCurrency(q.total).replace(' VND','')}</span>
        }
    ];

    return (
        <PageShell className="bg-slate-50 dark:bg-slate-950">
            <div className="flex h-full max-w-[1920px] mx-auto w-full flex-col">
                
                {/* KPI DASHBOARD */}
                <div className="px-8 pt-6 pb-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-premium shrink-0">
                    <QuoteKpiCard title="Doanh số tiềm năng" value={formatCurrency(stats.totalValue).replace(' VND','')} sub={`${stats.all} báo giá`} icon="monetization_on" color="bg-purple-600 text-purple-600" />
                    <QuoteKpiCard title="Đang thương thảo" value={stats.sent.toString()} sub="Chờ phản hồi" icon="forum" color="bg-blue-50 text-blue-500" />
                    <QuoteKpiCard title="Tỷ lệ chốt đơn" value={`${stats.conversionRate.toFixed(1)}%`} sub={`${stats.accepted} đơn thành công`} icon="thumb_up" color="bg-emerald-50 text-emerald-500" />
                    
                    <button 
                        onClick={() => { setModalMode('create'); setEditData(null); setIsCreateModalOpen(true); }}
                        className="bg-slate-900 dark:bg-indigo-600 text-white p-5 rounded-[1.5rem] shadow-xl flex items-center justify-between relative overflow-hidden group cursor-pointer hover:scale-[1.02] transition-transform"
                    >
                        <div className="relative z-10 text-left">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-indigo-200">Tác vụ nhanh</p>
                            <h3 className="text-xl font-black mt-1">Tạo Báo Giá Mới</h3>
                        </div>
                        <div className="size-10 rounded-full bg-white/10 flex items-center justify-center relative z-10 group-hover:bg-white group-hover:text-slate-900 dark:group-hover:text-indigo-600 transition-colors">
                            <span className="material-symbols-outlined">add</span>
                        </div>
                        <span className="material-symbols-outlined absolute -bottom-4 -right-4 text-[80px] opacity-10 rotate-12">request_quote</span>
                    </button>
                </div>

                <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 relative shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
                    <TableToolbar 
                        searchValue={searchTerm} 
                        onSearchChange={setSearchTerm} 
                        placeholder="Tìm mã BG, khách hàng..."
                        leftFilters={
                            <DateRangeFilter startDate={dateRange.from} endDate={dateRange.to} onChange={(f, t) => setDateRange({ from: f, to: t })} />
                        }
                        className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800"
                    >
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <FilterChip label="Tất cả" isActive={statusFilter === 'all'} onClick={() => setStatusFilter('all')} count={stats.all} />
                            <FilterChip label="Bản nháp" isActive={statusFilter === 'Draft'} onClick={() => setStatusFilter('Draft')} count={stats.draft} color="bg-slate-100 text-slate-600" />
                            <FilterChip label="Đang gửi" isActive={statusFilter === 'Sent'} onClick={() => setStatusFilter('Sent')} count={stats.sent} color="bg-blue-50 text-blue-600" />
                            <FilterChip label="Đã chốt" isActive={statusFilter === 'Accepted'} onClick={() => setStatusFilter('Accepted')} count={stats.accepted} color="bg-emerald-50 text-emerald-600" />
                        </div>
                    </TableToolbar>

                    <div className="flex-1 overflow-hidden px-8 pt-4 pb-2 bg-white dark:bg-slate-900">
                        <DataTable 
                            data={quotes} 
                            columns={columns} 
                            isLoading={isLoading} 
                            sort={{ items: sortState, onSort: requestSort }}
                            onRowClick={(q) => setSelectedQuoteId(q.id)}
                            emptyIcon="request_quote"
                            emptyMessage="Không tìm thấy báo giá nào."
                            rowClassName={(q) => q.status === 'Accepted' || q.convertedOrderId ? 'h-16 group bg-slate-50/50 grayscale-[0.5]' : 'h-16 group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors'}
                        />
                    </div>

                    <div className="px-8 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                        <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={itemsPerPage} onPageChange={setCurrentPage} />
                    </div>
                </div>
            </div>

            <QuoteDetailDrawer 
                isOpen={!!selectedQuoteId}
                quote={selectedQuote || null}
                onClose={() => setSelectedQuoteId(null)}
                onEdit={handleEditRequest}
                onDelete={async (id) => {
                    await deleteQuote(id);
                    setSelectedQuoteId(null);
                }}
                onConvert={handleConvertToOrder}
                onPrint={(q) => {
                    setPrintData(q);
                    setSelectedQuoteId(null);
                }}
                onDuplicate={handleDuplicate}
                onStatusChange={async (id, s) => {
                    await updateQuote({ id, status: s });
                    showNotification('Đã cập nhật trạng thái báo giá', 'info');
                }}
                onNavigate={onNavigate}
            />

            <CreateQuoteModal 
                isOpen={isCreateModalOpen} 
                onClose={() => { setIsCreateModalOpen(false); setEditData(null); }} 
                mode={modalMode}
                initialData={editData}
            />

            <PrintPreviewModal 
                isOpen={!!printData} 
                onClose={() => setPrintData(null)} 
                data={printData} 
            />
        </PageShell>
    );
};

export default Quotes;
