
import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { InventoryLog } from '../../types';
import { formatDisplayDate, removeVietnameseTones, getCurrentDate, getStartOfMonth, formatDateISO, toCSV, downloadTextFile } from '../../utils/helpers';
import { Button } from '../ui/Primitives';
import { TableToolbar } from '../table/TableToolbar';
import { DataTable, ColumnDef } from '../ui/DataTable';
import Pagination from '../Pagination';
import { DateRangeFilter } from '../filters/DateRangeFilter';
import { FilterChip } from '../ui/FilterBar';
import { useDexieTable } from '../../hooks/useDexieTable';
import { useApp as useAppContext } from '../../hooks/useApp';

const LOG_TYPE_CONFIG: Record<string, { label: string, icon: string, color: string }> = {
    'sale': { label: 'Xuất bán', icon: 'shopping_cart', color: 'text-rose-600 bg-rose-50 border-rose-100' },
    'import': { label: 'Nhập kho', icon: 'inventory_2', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
    'adjustment': { label: 'Kiểm kê', icon: 'tune', color: 'text-amber-600 bg-amber-50 border-amber-100' },
    'revert_delete': { label: 'Hủy đơn', icon: 'history', color: 'text-blue-600 bg-blue-50 border-blue-100' },
    'return': { label: 'Trả hàng', icon: 'assignment_return', color: 'text-purple-600 bg-purple-50 border-purple-100' },
    'sale_reversal': { label: 'Hoàn tác bán', icon: 'undo', color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
};

export const InventoryHistoryTab: React.FC = () => {
    const { showNotification } = useAppContext();
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState({ 
        from: formatDateISO(getStartOfMonth(new Date())), 
        to: getCurrentDate() 
    });

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(t);
    }, [searchTerm]);

    const stats = useLiveQuery(async () => {
        const logs = await db.inventoryLogs.where('date').between(dateRange.from, dateRange.to, true, true).toArray();
        const totalIn = logs.filter(l => l.changeAmount > 0).reduce((s, l) => s + l.changeAmount, 0);
        const totalOut = logs.filter(l => l.changeAmount < 0).reduce((s, l) => s + Math.abs(l.changeAmount), 0);
        return { totalIn, totalOut, count: logs.length };
    }, [dateRange]);

    const filterFn = useMemo(() => (log: InventoryLog) => {
        if (debouncedSearch) {
            const lower = removeVietnameseTones(debouncedSearch);
            if (!removeVietnameseTones(log.productName).includes(lower) && !log.sku.toLowerCase().includes(lower) && !(log.referenceCode && log.referenceCode.toLowerCase().includes(lower))) return false;
        }
        if (typeFilter !== 'all' && log.type !== typeFilter) return false;
        return true;
    }, [debouncedSearch, typeFilter]);

    const { data: logs, totalItems, currentPage, setCurrentPage, sortState, requestSort, isLoading } = useDexieTable<InventoryLog>({
        table: db.inventoryLogs, itemsPerPage: 25, filterFn, defaultSort: 'timestamp'
    });

    const columns: ColumnDef<InventoryLog>[] = [
        { 
            header: 'THỜI ĐIỂM', accessorKey: 'timestamp', width: 'w-44',
            cell: (l) => (
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{new Date(l.timestamp).toLocaleTimeString('vi-VN')}</span>
                    <span className="text-[10px] text-slate-400 font-bold">{formatDisplayDate(l.date)}</span>
                </div>
            )
        },
        { 
            header: 'SẢN PHẨM', accessorKey: 'productName',
            cell: (l) => (
                <div className="min-w-0 pr-4">
                    <p className="text-sm font-black text-slate-900 dark:text-white uppercase truncate group-hover:text-blue-600 transition-colors" title={l.productName}>{l.productName}</p>
                    <p className="text-[10px] font-mono font-bold text-slate-400 mt-1 uppercase">{l.sku}</p>
                </div>
            )
        },
        { 
            header: 'LOẠI BIẾN ĐỘNG', accessorKey: 'type', width: 'w-36', align: 'center',
            cell: (l) => {
                const cfg = LOG_TYPE_CONFIG[l.type] || { label: l.type, icon: 'help', color: 'bg-slate-100 text-slate-500' };
                return (
                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border flex items-center justify-center gap-1.5 ${cfg.color}`}>
                        <span className="material-symbols-outlined text-[14px]">{cfg.icon}</span>{cfg.label}
                    </span>
                );
            }
        },
        { header: 'THAY ĐỔI', accessorKey: 'changeAmount', width: 'w-28', align: 'center', cell: (l) => <span className={`text-sm font-black ${l.changeAmount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{l.changeAmount > 0 ? `+${l.changeAmount}` : l.changeAmount}</span> },
        { header: 'TỒN MỚI', accessorKey: 'newStock', width: 'w-32', align: 'center', cell: (l) => <span className="text-xs font-black text-slate-900 dark:text-white">{l.newStock}</span> },
        { 
            header: 'CHỨNG TỪ', accessorKey: 'referenceCode', width: 'w-32',
            cell: (l) => l.referenceCode ? <span className="text-[10px] font-mono font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded border border-blue-100 uppercase">{l.referenceCode}</span> : <span className="text-slate-300">---</span>
        }
    ];

    return (
        <div className="flex flex-col h-full animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 shrink-0 p-6">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-5"><div className="size-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner"><span className="material-symbols-outlined text-[28px]">trending_up</span></div><div><p className="text-[10px] font-black text-slate-400 uppercase">Tổng nhập kho</p><h3 className="text-2xl font-black text-slate-900 dark:text-white">+{stats?.totalIn || 0}</h3></div></div>
                <div className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-5"><div className="size-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-inner"><span className="material-symbols-outlined text-[28px]">trending_down</span></div><div><p className="text-[10px] font-black text-slate-400 uppercase">Tổng xuất kho</p><h3 className="text-2xl font-black text-slate-900 dark:text-white">-{stats?.totalOut || 0}</h3></div></div>
                <div className="bg-slate-900 text-white p-5 rounded-[2rem] shadow-xl flex items-center gap-5 relative overflow-hidden"><div className="size-12 rounded-2xl bg-white/10 flex items-center justify-center"><span className="material-symbols-outlined text-[28px]">history_edu</span></div><div className="relative z-10"><p className="text-[10px] font-black text-slate-400 uppercase">Số đợt biến động</p><h3 className="text-2xl font-black">{stats?.count || 0}</h3></div><span className="absolute -bottom-6 -right-6 text-[100px] material-symbols-outlined opacity-10 rotate-12">conveyor_belt</span></div>
            </div>
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white dark:bg-slate-900/50 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm">
                <TableToolbar searchValue={searchTerm} onSearchChange={setSearchTerm} placeholder="Tìm sản phẩm, mã SKU, chứng từ..." leftFilters={<DateRangeFilter startDate={dateRange.from} endDate={dateRange.to} onChange={(f, t) => setDateRange({ from: f, to: t })} />} />
                <div className="flex-1 overflow-hidden px-8 pt-4 pb-2"><DataTable data={logs} columns={columns} isLoading={isLoading} sort={{ items: sortState, onSort: requestSort }} emptyIcon="history_toggle_off" rowClassName={() => 'h-16 group'} /></div>
                <div className="px-8 py-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex justify-between items-center rounded-b-[2.5rem]"><Pagination currentPage={currentPage} totalItems={totalItems} pageSize={25} onPageChange={setCurrentPage} /></div>
            </div>
        </div>
    );
};
