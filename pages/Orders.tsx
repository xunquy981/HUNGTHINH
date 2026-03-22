
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { ViewState, Order, OrderStatus } from '../types';
import { useDomainServices } from '../hooks/useDomainServices';
import { useNotification } from '../contexts/NotificationContext';
import { useDexieTable } from '../hooks/useDexieTable';
import { PageShell } from '../components/ui/Primitives';
import { TableToolbar } from '../components/table/TableToolbar';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import Pagination from '../components/Pagination';
import { FilterChip } from '../components/ui/FilterBar';
import { DateRangeFilter } from '../components/filters/DateRangeFilter';
import { OrderDetailDrawer } from '../components/orders/OrderDetailDrawer';
import { PrintPreviewModal } from '../components/print/PrintPreviewModal';
import { DebtPayDrawer } from '../components/debts/DebtPayDrawer';
import { formatCurrency, formatDateISO, getStartOfMonth, getCurrentDate } from '../utils/helpers';
import StatusBadge from '../components/StatusBadge';

const Orders: React.FC<{ onNavigate: (view: ViewState, params?: any) => void, initialParams?: any }> = ({ onNavigate, initialParams }) => {
    const { updateOrderStatus, deleteOrder, lockOrder } = useDomainServices();
    const { showNotification } = useNotification();
    
    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [paymentFilter, setPaymentFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState({ 
        from: formatDateISO(getStartOfMonth(new Date())), 
        to: getCurrentDate() 
    });
    
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialParams?.highlightId || null);
    const [printData, setPrintData] = useState<Order | null>(null);
    const [activeDebtId, setActiveDebtId] = useState<string | null>(null);

    const itemsPerPage = 15;

    // --- REAL-TIME STATS ---
    const stats = useLiveQuery(async () => {
        const all = await db.orders.filter(o => !o.isDeleted).toArray();
        return {
            all: all.length,
            processing: all.filter(o => o.status === 'Processing').length,
            completed: all.filter(o => o.status === 'Completed').length,
            cancelled: all.filter(o => o.status === 'Cancelled').length,
            returned: all.filter(o => o.status === 'Returned').length,
            unpaid: all.filter(o => o.paymentStatus === 'Unpaid' || o.paymentStatus === 'Partial').length
        };
    }, []) || { all: 0, processing: 0, completed: 0, cancelled: 0, returned: 0, unpaid: 0 };

    // Data Fetching
    const filterFn = useMemo(() => (o: Order) => {
        if (statusFilter !== 'all' && o.status !== statusFilter) return false;
        if (paymentFilter !== 'all' && o.paymentStatus !== paymentFilter) {
            if (paymentFilter === 'Unpaid' && o.paymentStatus === 'Partial') return true; 
            else return false;
        }
        
        if (dateRange.from && o.date < dateRange.from) return false;
        if (dateRange.to && o.date > dateRange.to) return false;

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            return o.code.toLowerCase().includes(lower) || 
                   o.customerName.toLowerCase().includes(lower) ||
                   (o.phone?.includes(lower) ?? false);
        }
        return true;
    }, [searchTerm, statusFilter, paymentFilter, dateRange]);

    const { data: orders, totalItems, currentPage, setCurrentPage, sortState, requestSort, isLoading } = useDexieTable<Order>({
        table: db.orders,
        itemsPerPage,
        filterFn,
        defaultSort: 'createdAt',
        searchQuery: searchTerm 
    });

    const selectedOrder = useLiveQuery(() => selectedOrderId ? db.orders.get(selectedOrderId) : undefined, [selectedOrderId]);
    
    const relatedDeliveries = useLiveQuery(async () => {
        if (!selectedOrder) return [];
        return db.deliveryNotes.where('orderCode').equals(selectedOrder.code).toArray();
    }, [selectedOrder]);

    const handleAction = async (id: string, status: OrderStatus) => {
        await updateOrderStatus(id, status);
    };

    const handleDelete = async (id: string) => {
        await deleteOrder(id);
        setSelectedOrderId(null);
    };

    const handleOpenPayment = async (order: Order) => {
        // Find the debt record associated with this order
        const debt = await db.debtRecords.where('orderCode').equals(order.code).first();
        if (debt) {
            setActiveDebtId(debt.id);
        } else {
            // Case: Order might be paid on creation, so no debt record exists.
            // Or data inconsistency.
            if (order.paymentStatus === 'Paid') {
                showNotification('Đơn hàng này đã thanh toán đủ.', 'info');
            } else {
                showNotification('Không tìm thấy hồ sơ công nợ cho đơn này. Vui lòng kiểm tra lại.', 'warning');
            }
        }
    };

    const columns: ColumnDef<Order>[] = [
        { 
            header: 'Mã đơn', accessorKey: 'code', width: 'w-32', sortable: true,
            cell: (o) => <span className={`font-mono font-black text-xs px-2 py-0.5 rounded border uppercase ${o.status === 'Cancelled' || o.status === 'Returned' ? 'bg-slate-100 text-slate-500 border-slate-200 decoration-slice line-through' : 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800'}`}>{o.code}</span>
        },
        { 
            header: 'Khách hàng', accessorKey: 'customerName', sortable: true,
            cell: (o) => (
                <div className={o.status === 'Cancelled' || o.status === 'Returned' ? 'opacity-60' : ''}>
                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-[200px]">{o.customerName}</p>
                    <p className="text-[10px] text-slate-500">{o.phone}</p>
                </div>
            )
        },
        { 
            header: 'Ngày lập', accessorKey: 'date', width: 'w-28', sortable: true,
            cell: (o) => <span className={`text-xs font-bold ${o.status === 'Cancelled' ? 'text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>{o.date}</span>
        },
        { 
            header: 'Trạng thái', accessorKey: 'status', width: 'w-32', align: 'center',
            cell: (o) => <StatusBadge status={o.status} entityType="Order" size="sm" />
        },
        { 
            header: 'Thanh toán', accessorKey: 'paymentStatus', width: 'w-40', align: 'left',
            cell: (o) => {
                const percent = o.total > 0 ? (o.amountPaid / o.total) * 100 : 0;
                const isPaid = percent >= 100;
                return (
                    <div className="w-full max-w-[120px]">
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[9px] font-bold uppercase ${isPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {isPaid ? 'Đã xong' : `${percent.toFixed(0)}%`}
                            </span>
                            {!isPaid && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleOpenPayment(o); }}
                                    className="size-5 flex items-center justify-center rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                    title="Thanh toán nhanh"
                                >
                                    <span className="material-symbols-outlined text-[14px]">payments</span>
                                </button>
                            )}
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className={`h-full ${isPaid ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(percent, 100)}%` }}></div>
                        </div>
                    </div>
                )
            }
        },
        { 
            header: 'Tổng tiền', accessorKey: 'total', width: 'w-36', align: 'right', sortable: true,
            cell: (o) => <span className={`font-black text-sm ${o.status === 'Cancelled' || o.status === 'Returned' ? 'text-slate-400 line-through' : 'text-indigo-600'}`}>{formatCurrency(o.total).replace(' VND','')}</span>
        }
    ];

    return (
        <PageShell>
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-4">
                <TableToolbar 
                    searchValue={searchTerm} 
                    onSearchChange={setSearchTerm} 
                    placeholder="Tìm mã đơn, tên khách, SĐT..."
                    leftFilters={
                        <DateRangeFilter startDate={dateRange.from} endDate={dateRange.to} onChange={(f, t) => setDateRange({ from: f, to: t })} />
                    }
                >
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        <FilterChip label="Tất cả" isActive={statusFilter === 'all' && paymentFilter === 'all'} onClick={() => { setStatusFilter('all'); setPaymentFilter('all'); }} count={stats.all} />
                        <FilterChip label="Chờ xử lý" isActive={statusFilter === 'Processing'} onClick={() => { setStatusFilter('Processing'); setPaymentFilter('all'); }} count={stats.processing} color="bg-blue-50 text-blue-600" />
                        <FilterChip label="Hoàn tất" isActive={statusFilter === 'Completed'} onClick={() => { setStatusFilter('Completed'); setPaymentFilter('all'); }} count={stats.completed} color="bg-emerald-50 text-emerald-600" />
                        <FilterChip label="Đã hủy" isActive={statusFilter === 'Cancelled'} onClick={() => { setStatusFilter('Cancelled'); setPaymentFilter('all'); }} count={stats.cancelled} color="bg-slate-100 text-slate-500" />
                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                        <FilterChip label="Chưa thanh toán" isActive={paymentFilter === 'Unpaid'} onClick={() => { setPaymentFilter('Unpaid'); setStatusFilter('all'); }} count={stats.unpaid} color="bg-rose-50 text-rose-600" />
                    </div>
                </TableToolbar>

                <div className="flex-1 overflow-hidden px-8 pt-4 pb-2">
                    <DataTable 
                        data={orders} 
                        columns={columns} 
                        isLoading={isLoading} 
                        sort={{ items: sortState, onSort: requestSort }}
                        onRowClick={(o) => setSelectedOrderId(o.id)}
                        emptyIcon="receipt_long"
                        emptyMessage="Không tìm thấy đơn hàng nào."
                        rowClassName={(o) => o.status === 'Cancelled' || o.status === 'Returned' ? 'h-16 group bg-slate-50/50 dark:bg-slate-900/30 grayscale-[0.8]' : 'h-16 group'}
                    />
                </div>

                <div className="px-8 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={itemsPerPage} onPageChange={setCurrentPage} />
                </div>
            </div>

            <OrderDetailDrawer 
                isOpen={!!selectedOrderId}
                order={selectedOrder || null}
                onClose={() => setSelectedOrderId(null)}
                onPrint={() => {
                    if (selectedOrder) {
                        setPrintData(selectedOrder);
                        setSelectedOrderId(null);
                    }
                }}
                onDelivery={() => { if(selectedOrder) onNavigate('DELIVERY_NOTES', { initialOrderId: selectedOrder.id }); }} 
                onPayment={handleOpenPayment} 
                onReturn={() => {}} 
                onAction={handleAction}
                onDelete={handleDelete}
                onLock={() => { if(selectedOrderId) lockOrder(selectedOrderId); }}
                relatedDeliveries={relatedDeliveries}
                onNavigate={onNavigate}
            />

            <DebtPayDrawer 
                debtId={activeDebtId}
                isOpen={!!activeDebtId}
                onClose={() => setActiveDebtId(null)}
            />

            <PrintPreviewModal 
                isOpen={!!printData} 
                onClose={() => setPrintData(null)} 
                title={`In Đơn Hàng ${printData?.code}`} 
                filename={`DonHang_${printData?.code}`} 
                data={printData} 
            />
        </PageShell>
    );
};

export default Orders;
