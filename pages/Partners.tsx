
import React, { useState, useMemo } from 'react';
import { ViewState, Partner, PartnerType } from '../types';
import { useDexieTable } from '../hooks/useDexieTable';
import { db } from '../services/db';
import { PageShell, Button } from '../components/ui/Primitives';
import { TableToolbar } from '../components/table/TableToolbar';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import Pagination from '../components/Pagination';
import { FilterChip } from '../components/ui/FilterBar';
import { formatCurrency } from '../utils/helpers';
import { PartnerProfileDrawer } from '../components/partners/PartnerProfileDrawer';
import { CreatePartnerModal } from '../components/PartnerModals';
import { useLiveQuery } from 'dexie-react-hooks';

// --- SUB-COMPONENT: PARTNER CRM CARD (GRID VIEW) ---
const PartnerCrmCard: React.FC<{ partner: Partner, onClick: () => void, onAction: (type: string, p: Partner) => void }> = ({ partner, onClick, onAction }) => {
    const isCustomer = partner.type === 'Customer';
    const initials = partner.name.substring(0, 1).toUpperCase();
    
    // Logic giả lập VIP (Thực tế có thể dựa vào tổng mua hàng)
    const isVip = partner.code.endsWith('01') || partner.code.endsWith('02'); 
    
    const debtRatio = partner.debtLimit && partner.debtLimit > 0 ? (partner.debt || 0) / partner.debtLimit : 0;
    const isHighRisk = debtRatio > 0.8;
    const hasDebt = (partner.debt || 0) > 0;

    return (
        <div 
            onClick={onClick}
            className={`
                group relative bg-white dark:bg-slate-900 rounded-[2rem] border transition-all duration-300 cursor-pointer overflow-hidden flex flex-col h-full
                ${isHighRisk 
                    ? 'border-rose-200 dark:border-rose-900/50 hover:shadow-xl hover:shadow-rose-500/10 ring-1 ring-rose-100 dark:ring-rose-900/30' 
                    : 'border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg'
                }
            `}
        >
            {/* Header Gradient */}
            <div className={`h-24 w-full bg-gradient-to-br ${isCustomer ? 'from-indigo-500 to-blue-600' : 'from-orange-400 to-red-500'} relative p-4 flex justify-between items-start`}>
                <div className="bg-white/20 backdrop-blur-md rounded-lg px-2 py-1 text-[9px] font-black text-white uppercase tracking-widest border border-white/20">
                    {isCustomer ? 'Khách hàng' : 'Nhà cung cấp'}
                </div>
                {isVip && (
                    <div className="flex items-center gap-1 bg-yellow-400 text-yellow-900 px-2 py-1 rounded-full text-[9px] font-black uppercase shadow-sm">
                        <span className="material-symbols-outlined text-[12px]">star</span> VIP
                    </div>
                )}
            </div>

            {/* Avatar & Info */}
            <div className="px-6 relative flex-1 flex flex-col">
                <div className={`size-16 rounded-[1.5rem] border-4 border-white dark:border-slate-900 bg-white dark:bg-slate-800 absolute -top-8 left-6 flex items-center justify-center text-2xl font-black shadow-sm ${isCustomer ? 'text-indigo-600' : 'text-orange-600'}`}>
                    {initials}
                </div>
                
                <div className="mt-10 mb-4">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors uppercase">
                        {partner.name}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">badge</span> {partner.code}
                    </p>
                </div>

                {/* Contact Info */}
                <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <span className="material-symbols-outlined text-[16px] text-slate-300">call</span>
                        <span className="font-bold">{partner.phone || '---'}</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <span className="material-symbols-outlined text-[16px] text-slate-300 shrink-0">location_on</span>
                        <span className="font-medium line-clamp-1">{partner.address || 'Chưa cập nhật địa chỉ'}</span>
                    </div>
                </div>

                {/* Financial Status */}
                <div className={`mt-auto rounded-2xl p-3 mb-6 border ${hasDebt ? (isHighRisk ? 'bg-rose-50 border-rose-100 dark:bg-rose-900/10' : 'bg-slate-50 border-slate-100 dark:bg-slate-800/50') : 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10'}`}>
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Dư nợ hiện tại</span>
                        {hasDebt ? (
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isHighRisk ? 'text-rose-600 bg-rose-100' : 'text-slate-600 bg-slate-200'}`}>
                                {isHighRisk ? 'Rủi ro cao' : 'Chưa thanh toán'}
                            </span>
                        ) : (
                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">Sạch nợ</span>
                        )}
                    </div>
                    <div className={`text-lg font-black ${hasDebt ? (isHighRisk ? 'text-rose-600' : 'text-slate-900 dark:text-white') : 'text-emerald-600'}`}>
                        {formatCurrency(partner.debt || 0).replace(' VND','')}
                    </div>
                    {/* Debt Bar */}
                    {hasDebt && (
                        <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mt-2 overflow-hidden">
                            <div 
                                className={`h-full ${isHighRisk ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                                style={{ width: `${Math.min(debtRatio * 100, 100)}%` }}
                            ></div>
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-between bg-slate-50/50 dark:bg-slate-900/50">
                <button 
                    onClick={(e) => { e.stopPropagation(); onAction('call', partner); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase text-slate-500 hover:bg-white hover:text-indigo-600 hover:shadow-sm transition-all"
                >
                    <span className="material-symbols-outlined text-[16px]">call</span> Gọi
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); onAction('order', partner); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all"
                >
                    <span className="material-symbols-outlined text-[16px]">add_shopping_cart</span> Lên đơn
                </button>
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: KPI HEADER ---
const PartnerKpi = ({ title, value, icon, color, active, onClick }: any) => (
    <div 
        onClick={onClick}
        className={`
            relative overflow-hidden p-5 rounded-[2rem] border transition-all duration-300 cursor-pointer group flex flex-col justify-between h-32
            ${active 
                ? `bg-white dark:bg-slate-800 ring-2 ring-${color}-500 ring-offset-2 dark:ring-offset-slate-950 shadow-xl border-transparent` 
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
            }
        `}
    >
        <div className="flex justify-between items-start relative z-10">
            <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${active ? `bg-${color}-500 text-white` : `bg-${color}-50 text-${color}-600`} transition-colors`}>
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
            </div>
            {active && <div className={`size-2 rounded-full bg-${color}-500 animate-pulse`}></div>}
        </div>
        <div className="relative z-10">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter leading-none mb-1">{value}</h3>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${active ? `text-${color}-600` : 'text-slate-400'}`}>{title}</p>
        </div>
        <span className={`material-symbols-outlined absolute -bottom-4 -right-4 text-[80px] opacity-[0.05] group-hover:opacity-[0.1] transition-opacity rotate-12 text-${color}-500`}>{icon}</span>
    </div>
);

const Partners: React.FC<{ onNavigate: (view: ViewState, params?: any) => void, initialParams?: any }> = ({ onNavigate, initialParams }) => {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | PartnerType>('all');
    const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(initialParams?.highlightId || null);
    
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editPartner, setEditPartner] = useState<Partner | null>(null);

    const itemsPerPage = viewMode === 'grid' ? 12 : 15;

    const stats = useLiveQuery(async () => {
        const partners = await db.partners.filter(p => !p.isDeleted).toArray();
        const customers = partners.filter(p => p.type === 'Customer').length;
        const suppliers = partners.filter(p => p.type === 'Supplier').length;
        const totalDebt = partners.reduce((sum, p) => sum + (p.debt || 0), 0);
        return { customers, suppliers, total: partners.length, totalDebt };
    }, []) || { customers: 0, suppliers: 0, total: 0, totalDebt: 0 };

    const filterFn = useMemo(() => (p: Partner) => {
        if (typeFilter !== 'all' && p.type !== typeFilter) return false;
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            return p.name.toLowerCase().includes(lower) || 
                   p.code.toLowerCase().includes(lower) || 
                   (p.phone?.includes(lower) ?? false);
        }
        return true;
    }, [searchTerm, typeFilter]);

    const { data: partners, totalItems, currentPage, setCurrentPage, sortState, requestSort, isLoading } = useDexieTable<Partner>({
        table: db.partners,
        itemsPerPage,
        filterFn,
        defaultSort: 'name'
    });

    const handleQuickAction = (type: string, p: Partner) => {
        if (type === 'call' && p.phone) {
            window.location.href = `tel:${p.phone}`;
        } else if (type === 'order') {
            setSelectedPartnerId(p.id);
        }
    };

    const columns: ColumnDef<Partner>[] = [
        { 
            header: 'Mã đối tác', accessorKey: 'code', width: 'w-32', sortable: true,
            cell: (p) => <span className="font-black text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-800 uppercase tracking-tighter">{p.code}</span>
        },
        { 
            header: 'Tên đối tác', accessorKey: 'name', sortable: true,
            cell: (p) => (
                <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate group-hover:text-blue-600 transition-colors uppercase">{p.name}</p>
                    <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">call</span> {p.phone || '---'}
                    </p>
                </div>
            )
        },
        { 
            header: 'Phân loại', accessorKey: 'type', width: 'w-32', align: 'center',
            cell: (p) => (
                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border ${p.type === 'Customer' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                    {p.type === 'Customer' ? 'Khách hàng' : 'Nhà cung cấp'}
                </span>
            )
        },
        { 
            header: 'Dư nợ', accessorKey: 'debt', width: 'w-40', align: 'right', sortable: true,
            cell: (p) => <span className={`font-black text-sm ${(p.debt || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(p.debt).replace(' VND','')}</span>
        },
        {
            header: '', width: 'w-10', align: 'center',
            cell: (p) => (
                <button 
                    onClick={(e) => { e.stopPropagation(); setSelectedPartnerId(p.id); }}
                    className="size-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                >
                    <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                </button>
            )
        }
    ];

    return (
        <PageShell>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-8 pt-8 pb-4 animate-premium">
                <PartnerKpi 
                    title="Khách hàng" 
                    value={stats.customers} 
                    icon="groups" 
                    color="indigo" 
                    active={typeFilter === 'Customer'} 
                    onClick={() => setTypeFilter(typeFilter === 'Customer' ? 'all' : 'Customer')} 
                />
                <PartnerKpi 
                    title="Nhà cung cấp" 
                    value={stats.suppliers} 
                    icon="local_shipping" 
                    color="orange" 
                    active={typeFilter === 'Supplier'} 
                    onClick={() => setTypeFilter(typeFilter === 'Supplier' ? 'all' : 'Supplier')} 
                />
                <PartnerKpi 
                    title="Tổng đối tác" 
                    value={stats.total} 
                    icon="contacts" 
                    color="slate" 
                    active={typeFilter === 'all'} 
                    onClick={() => setTypeFilter('all')} 
                />
                <PartnerKpi 
                    title="Tổng dư nợ" 
                    value={formatCurrency(stats.totalDebt).replace(' VND','')} 
                    icon="account_balance_wallet" 
                    color="rose" 
                />
            </div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-4">
                <TableToolbar 
                    searchValue={searchTerm} 
                    onSearchChange={setSearchTerm} 
                    placeholder="Tìm tên, mã, SĐT..."
                    leftFilters={
                        <div className="flex gap-2">
                            <FilterChip label="Tất cả" isActive={typeFilter === 'all'} onClick={() => setTypeFilter('all')} />
                            <FilterChip label="Khách hàng" isActive={typeFilter === 'Customer'} onClick={() => setTypeFilter('Customer')} color="bg-indigo-50 text-indigo-600" />
                            <FilterChip label="Nhà cung cấp" isActive={typeFilter === 'Supplier'} onClick={() => setTypeFilter('Supplier')} color="bg-orange-50 text-orange-600" />
                        </div>
                    }
                    rightActions={
                        <div className="flex items-center gap-2">
                            <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex border border-slate-200 dark:border-slate-700">
                                <button onClick={() => setViewMode('grid')} className={`size-8 flex items-center justify-center rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><span className="material-symbols-outlined text-[20px]">grid_view</span></button>
                                <button onClick={() => setViewMode('list')} className={`size-8 flex items-center justify-center rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><span className="material-symbols-outlined text-[20px]">view_list</span></button>
                            </div>
                            <Button variant="primary" icon="person_add" onClick={() => setIsCreateModalOpen(true)} className="bg-indigo-600 shadow-lg shadow-indigo-600/20 px-6 rounded-2xl h-10">Thêm mới</Button>
                        </div>
                    }
                />

                <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pt-6 pb-20">
                    {viewMode === 'list' ? (
                        <DataTable 
                            data={partners} 
                            columns={columns} 
                            isLoading={isLoading} 
                            sort={{ items: sortState, onSort: requestSort }}
                            onRowClick={(p) => setSelectedPartnerId(p.id)}
                            emptyIcon="groups"
                            emptyMessage="Không tìm thấy đối tác nào."
                            rowClassName={() => 'h-16 group'}
                        />
                    ) : (
                        <>
                            {partners.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 opacity-50">
                                    <span className="material-symbols-outlined text-[64px] text-slate-300">person_off</span>
                                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-4">Không tìm thấy dữ liệu</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
                                    {partners.map(p => (
                                        <PartnerCrmCard 
                                            key={p.id} 
                                            partner={p} 
                                            onClick={() => setSelectedPartnerId(p.id)} 
                                            onAction={handleQuickAction}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-8 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                    <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={itemsPerPage} onPageChange={setCurrentPage} />
                </div>
            </div>

            <PartnerProfileDrawer 
                isOpen={!!selectedPartnerId}
                partnerId={selectedPartnerId}
                onClose={() => setSelectedPartnerId(null)}
                onEdit={(p) => setEditPartner(p)}
            />

            <CreatePartnerModal 
                isOpen={isCreateModalOpen || !!editPartner}
                onClose={() => { setIsCreateModalOpen(false); setEditPartner(null); }}
                mode={editPartner ? 'edit' : 'create'}
                initialData={editPartner || undefined}
            />
        </PageShell>
    );
};

export default Partners;
