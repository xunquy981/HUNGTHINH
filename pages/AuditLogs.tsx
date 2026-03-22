
import React, { useState, useMemo, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { AuditLog, AuditAction, AuditModule, ViewState } from '../types';
import { db } from '../services/db';
import { useDexieTable } from '../hooks/useDexieTable';
import { PageShell, Button } from '../components/ui/Primitives';
import { TableToolbar } from '../components/table/TableToolbar';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import Pagination from '../components/Pagination';
import { DateRangeFilter } from '../components/filters/DateRangeFilter';
import { formatRelativeTime, formatDateISO, addDays, toCSV, downloadTextFile, formatCurrency } from '../utils/helpers';
import { Drawer, DrawerSection } from '../components/ui/Drawer';
import { FilterChip } from '../components/ui/FilterBar';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNotification } from '../contexts/NotificationContext';

const MODULE_CONFIG: Record<AuditModule, { label: string; icon: string; color: string }> = {
    'Orders': { label: 'Đơn hàng', icon: 'receipt_long', color: 'text-blue-600 bg-blue-50' },
    'Inventory': { label: 'Kho hàng', icon: 'inventory_2', color: 'text-emerald-600 bg-emerald-50' },
    'Debts': { label: 'Công nợ', icon: 'account_balance_wallet', color: 'text-rose-600 bg-rose-50' },
    'Imports': { label: 'Nhập hàng', icon: 'move_to_inbox', color: 'text-orange-600 bg-orange-50' },
    'Partners': { label: 'Đối tác', icon: 'groups', color: 'text-indigo-600 bg-indigo-50' },
    'Settings': { label: 'Cấu hình', icon: 'settings', color: 'text-slate-600 bg-slate-50' },
    'Returns': { label: 'Trả hàng', icon: 'assignment_return', color: 'text-purple-600 bg-purple-50' },
    'Transactions': { label: 'Sổ quỹ', icon: 'payments', color: 'text-teal-600 bg-teal-50' },
    'Quotes': { label: 'Báo giá', icon: 'request_quote', color: 'text-amber-600 bg-amber-50' },
    'Delivery': { label: 'Giao nhận', icon: 'local_shipping', color: 'text-cyan-600 bg-cyan-50' },
    'System': { label: 'Hệ thống', icon: 'terminal', color: 'text-slate-600 bg-slate-50' }
};

const ACTION_STYLES: Record<string, string> = {
    Create: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    Update: 'bg-blue-50 text-blue-600 border-blue-100',
    Delete: 'bg-rose-50 text-rose-600 border-rose-100',
    SoftDelete: 'bg-orange-50 text-orange-600 border-orange-100',
    StatusChange: 'bg-purple-50 text-purple-600 border-purple-100',
    Payment: 'bg-teal-50 text-teal-600 border-teal-100',
    Adjust: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    Lock: 'bg-slate-100 text-slate-600 border-slate-200',
    Convert: 'bg-amber-50 text-amber-600 border-amber-100'
};

const AuditLogs: React.FC<{ onNavigate: (view: ViewState, params?: any) => void }> = ({ onNavigate }) => {
    const { showNotification } = useNotification();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeModule, setActiveModule] = useState<AuditModule | 'all'>('all');
    const [dateRange, setDateRange] = useState({ from: formatDateISO(addDays(new Date(), -7)), to: formatDateISO(new Date()) });
    const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

    const itemsPerPage = 20;

    const filterFn = useMemo(() => (log: AuditLog) => {
        if (activeModule !== 'all' && log.module !== activeModule) return false;
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            return log.summary.toLowerCase().includes(lower) || 
                   log.entityCode?.toLowerCase().includes(lower) ||
                   log.createdByName.toLowerCase().includes(lower);
        }
        return true;
    }, [searchTerm, activeModule]);

    const { data: logs, totalItems, currentPage, setCurrentPage, sortState, requestSort, isLoading } = useDexieTable<AuditLog>({
        table: db.auditLogs, itemsPerPage, filterFn, defaultSort: 'createdAt'
    });

    const selectedLog = useLiveQuery(() => selectedLogId ? db.auditLogs.get(selectedLogId) : undefined, [selectedLogId]);

    const columns: ColumnDef<AuditLog>[] = [
        { 
            header: 'Thời gian', accessorKey: 'createdAt', sortable: true, width: 'w-44',
            cell: (l) => (
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{new Date(l.createdAt).toLocaleTimeString('vi-VN')}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{new Date(l.createdAt).toLocaleDateString('vi-VN')}</span>
                </div>
            )
        },
        { 
            header: 'Phân hệ', accessorKey: 'module', width: 'w-36',
            cell: (l) => (
                <div className="flex items-center gap-2">
                    <span className={`material-symbols-outlined text-[18px] ${MODULE_CONFIG[l.module].color.split(' ')[0]}`}>{MODULE_CONFIG[l.module].icon}</span>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{MODULE_CONFIG[l.module].label}</span>
                </div>
            )
        },
        { 
            header: 'Thao tác', accessorKey: 'action', width: 'w-32', align: 'center',
            cell: (l) => (
                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border ${ACTION_STYLES[l.action] || 'bg-slate-100 text-slate-500'}`}>
                    {l.action}
                </span>
            )
        },
        { 
            header: 'Nội dung', accessorKey: 'summary',
            cell: (l) => (
                <div className="min-w-0 pr-4">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate uppercase tracking-tight">{l.summary}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-slate-400">Bởi: {l.createdByName}</span>
                        {l.entityCode && <span className="text-[9px] font-mono font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{l.entityCode}</span>}
                    </div>
                </div>
            )
        },
        {
            header: '', width: 'w-10', align: 'center',
            cell: (l) => (
                <button onClick={(e) => { e.stopPropagation(); setSelectedLogId(l.id); }} className="size-8 rounded-full hover:bg-blue-50 text-slate-300 hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
            )
        }
    ];

    return (
        <PageShell className="bg-slate-50 dark:bg-slate-950">
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <TableToolbar searchValue={searchTerm} onSearchChange={setSearchTerm} placeholder="Tìm nội dung, chứng từ, nhân viên...">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        <FilterChip label="Tất cả" isActive={activeModule === 'all'} onClick={() => setActiveModule('all')} />
                        {Object.entries(MODULE_CONFIG).map(([key, cfg]) => (
                            <FilterChip key={key} label={cfg.label} isActive={activeModule === key} onClick={() => setActiveModule(key as AuditModule)} />
                        ))}
                    </div>
                </TableToolbar>

                <div className="flex-1 overflow-hidden px-8 pt-4 pb-2">
                    <DataTable 
                        data={logs} columns={columns} isLoading={isLoading} sort={{ items: sortState, onSort: requestSort }}
                        onRowClick={(l) => setSelectedLogId(l.id)} emptyIcon="history_edu"
                        rowClassName={() => 'h-16 group hover:shadow-md transition-all duration-300'}
                    />
                </div>

                <div className="px-8 py-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={itemsPerPage} onPageChange={setCurrentPage} />
                </div>
            </div>

            <Drawer
                isOpen={!!selectedLogId} onClose={() => setSelectedLogId(null)} 
                title="Chi tiết Nhật ký" subtitle={selectedLog?.summary} width="xl"
                footer={<Button variant="primary" className="w-full h-12 rounded-2xl bg-slate-900 font-black uppercase" onClick={() => setSelectedLogId(null)}>Đóng</Button>}
            >
                {selectedLog && (
                    <div className="space-y-8 animate-fadeIn">
                        {/* Summary Header */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 shadow-inner">
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-4">
                                    <div className={`size-14 rounded-2xl flex items-center justify-center ${ACTION_STYLES[selectedLog.action] || 'bg-slate-200'} bg-opacity-100 shadow-lg`}>
                                        <span className="material-symbols-outlined text-[32px]">{MODULE_CONFIG[selectedLog.module]?.icon || 'history'}</span>
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">{selectedLog.action}</h4>
                                        <p className="text-xs font-bold text-blue-600 mt-2 uppercase tracking-widest">{MODULE_CONFIG[selectedLog.module]?.label}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase">{selectedLog.createdByName}</p>
                                    <p className="text-[11px] text-slate-400 font-bold mt-1 italic">{new Date(selectedLog.createdAt).toLocaleString('vi-VN')}</p>
                                </div>
                            </div>
                        </div>

                        {/* DIFF VIEWER */}
                        <DrawerSection title="CHI TIẾT THAY ĐỔI (DIFF)">
                            {!selectedLog.diff ? (
                                <div className="py-12 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-200">
                                    <span className="material-symbols-outlined text-4xl mb-2 opacity-20">database_off</span>
                                    <p className="text-xs font-bold uppercase tracking-widest">Không có thay đổi dữ liệu chi tiết</p>
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl overflow-hidden shadow-sm">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-slate-50 dark:bg-slate-900 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b">
                                            <tr>
                                                <th className="px-6 py-4 w-1/3">Trường dữ liệu</th>
                                                <th className="px-6 py-4">Giá trị thay đổi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                            {Object.entries(selectedLog.diff).map(([key, value]: [string, any]) => (
                                                <tr key={key} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors group">
                                                    <td className="px-6 py-4 font-mono font-black text-slate-400 group-hover:text-blue-600 uppercase text-[9px]">{key}</td>
                                                    <td className="px-6 py-4 space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-600 line-through opacity-70 font-bold">{String(value.from ?? '---')}</span>
                                                            <span className="material-symbols-outlined text-slate-300 text-[14px]">arrow_forward</span>
                                                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-black">{String(value.to ?? '---')}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </DrawerSection>
                    </div>
                )}
            </Drawer>
        </PageShell>
    );
};

export default AuditLogs;
