
import React, { useState, useMemo } from 'react';
import { ViewState, Product } from '../types';
import { useDexieTable } from '../hooks/useDexieTable';
import { db } from '../services/db';
import { PageShell, Button } from '../components/ui/Primitives';
import { TableToolbar } from '../components/table/TableToolbar';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import Pagination from '../components/Pagination';
import { formatCurrency } from '../utils/helpers';
import { ProductDetailDrawer } from '../components/products/ProductDetailDrawer';
import { CreateProductModal, AdjustStockModal } from '../components/InventoryModals';
import { InventoryImportModal } from '../components/inventory/InventoryImportModal';
import { InventoryHistoryTab } from '../components/inventory/InventoryHistoryTab';
import { useDomainServices } from '../hooks/useDomainServices';
import { useNotification } from '../contexts/NotificationContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { WAREHOUSE_CONFIG } from '../constants/options';
import { SmartRestockModal } from '../components/inventory/SmartRestockModal';

// Component hiển thị sức khỏe tồn kho trực quan
const StockHealthBar = ({ current, min, reserved }: { current: number, min: number, reserved?: number }) => {
    const max = Math.max(current, min * 3);
    const percent = Math.min((current / max) * 100, 100);
    
    let statusColor = 'text-emerald-700 bg-emerald-50 border-emerald-100';
    let barColor = 'bg-emerald-500';
    let statusText = 'Sẵn sàng';

    if (current === 0) {
        statusColor = 'text-slate-500 bg-slate-100 border-slate-200';
        barColor = 'bg-slate-300';
        statusText = 'Hết hàng';
    } else if (current <= min) {
        statusColor = 'text-rose-700 bg-rose-50 border-rose-100';
        barColor = 'bg-rose-500';
        statusText = 'Báo động';
    } else if (current <= min * 1.5) {
        statusColor = 'text-amber-700 bg-amber-50 border-amber-100';
        barColor = 'bg-amber-500';
        statusText = 'Sắp hết';
    }

    return (
        <div className="w-full py-1">
            <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-baseline gap-1">
                    <span className={`text-sm font-black ${current === 0 ? 'text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {current}
                    </span>
                    {reserved && reserved > 0 && (
                        <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1 rounded" title="Đang giữ đơn">
                            (Giữ {reserved})
                        </span>
                    )}
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${statusColor}`}>
                    {statusText}
                </span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex mb-1">
                <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${percent}%` }}></div>
            </div>
            <div className="flex justify-between items-center text-[9px] font-bold text-slate-400">
                <span>Mức tối thiểu: {min}</span>
            </div>
        </div>
    );
};

const InventoryKpi = ({ title, value, icon, accentColor }: { 
    title: string, value: string | number, icon: string, accentColor: 'blue' | 'rose' | 'emerald' | 'amber'
}) => {
    const theme = {
        blue:    { text: 'text-blue-600', bg: 'bg-blue-500' },
        rose:    { text: 'text-rose-600', bg: 'bg-rose-500' },
        emerald: { text: 'text-emerald-600', bg: 'bg-emerald-500' },
        amber:   { text: 'text-amber-600', bg: 'bg-amber-500' },
    }[accentColor];

    return (
        <div className="relative overflow-hidden p-4 rounded-[1.5rem] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-4 shadow-sm group hover:-translate-y-1 transition-transform duration-300">
            <div className={`size-12 rounded-2xl flex items-center justify-center shrink-0 ${theme.bg} bg-opacity-10 text-opacity-100 group-hover:scale-110 transition-transform`}>
                <span className={`material-symbols-outlined text-[24px] ${theme.text}`}>{icon}</span>
            </div>
            <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight leading-none mb-1">{value}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
            </div>
        </div>
    );
};

const SidebarSection = ({ title, children }: { title: string, children?: React.ReactNode }) => (
    <div className="mb-6">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 px-1">{title}</h3>
        <div className="space-y-1">{children}</div>
    </div>
);

const ZoneFilterItem = ({ label, count, totalCount, isActive, onClick, icon }: any) => {
    const percent = totalCount > 0 ? (count / totalCount) * 100 : 0;
    return (
        <button 
            onClick={onClick}
            className={`w-full flex flex-col gap-1.5 px-3 py-2.5 rounded-xl transition-all group ${
                isActive ? 'bg-indigo-50 dark:bg-indigo-900/20 shadow-sm ring-1 ring-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
        >
            <div className="flex justify-between items-center w-full">
                <div className="flex items-center gap-2">
                    <span className={`material-symbols-outlined text-[16px] ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>{icon}</span>
                    <span className={`text-xs font-bold ${isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'}`}>{label}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400">{count}</span>
            </div>
            <div className="w-full h-1 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${isActive ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'}`} style={{ width: `${percent}%` }}></div>
            </div>
        </button>
    );
};

const Inventory: React.FC<{ onNavigate: (view: ViewState, params?: any) => void, initialParams?: any }> = ({ onNavigate, initialParams }) => {
    const { addProduct, updateProduct, adjustStock } = useDomainServices();
    const { showNotification } = useNotification();
    const [activeTab, setActiveTab] = useState<'products' | 'history'>('products');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeZone, setActiveZone] = useState('all');
    const [activeStatus, setActiveStatus] = useState<'all' | 'safe' | 'low' | 'out'>('all');
    const [selectedProductId, setSelectedProductId] = useState<string | null>(initialParams?.highlightId || null);
    
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const rawProducts = useLiveQuery(() => db.products.filter(p => !p.isDeleted).toArray()) || [];
    
    // Tính toán các thông số cho Sidebar Control Tower
    const facets = useMemo(() => {
        const zones: Record<string, number> = {};
        const status = { safe: 0, low: 0, out: 0 };
        let totalValue = 0;
        rawProducts.forEach(p => {
            zones[p.location] = (zones[p.location] || 0) + 1;
            if (p.stock === 0) status.out++;
            else if (p.stock <= (p.minStock || 10)) status.low++;
            else status.safe++;
            totalValue += (p.stock * p.importPrice);
        });
        return { zones, status, totalValue, totalCount: rawProducts.length };
    }, [rawProducts]);

    const filterFn = useMemo(() => (p: Product) => {
        if (activeZone !== 'all' && p.location !== activeZone) return false;
        if (activeStatus !== 'all') {
            if (activeStatus === 'out' && p.stock > 0) return false;
            if (activeStatus === 'low' && (p.stock === 0 || p.stock > (p.minStock || 10))) return false;
            if (activeStatus === 'safe' && p.stock <= (p.minStock || 10)) return false;
        }
        return true;
    }, [activeZone, activeStatus]);

    const { data: products, totalItems, currentPage, setCurrentPage, sortState, requestSort, isLoading } = useDexieTable<Product>({
        table: db.products, itemsPerPage: 20, filterFn, searchQuery: searchTerm, defaultSort: 'name'
    });

    const columns: ColumnDef<Product>[] = [
        { 
            header: 'SẢN PHẨM', accessorKey: 'name', sortable: true,
            cell: (p) => (
                <div className="min-w-[240px] flex flex-col gap-1 py-1">
                    <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-[10px] text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded border border-blue-100 uppercase tracking-tight">{p.sku}</span>
                        {p.brand && <span className="text-[9px] font-bold text-slate-500 uppercase">{p.brand}</span>}
                    </div>
                    <p className="font-bold text-sm text-slate-900 dark:text-white truncate" title={p.name}>{p.name}</p>
                </div>
            )
        },
        {
            header: 'ĐVT', accessorKey: 'unit', width: 'w-20', align: 'center',
            cell: (p) => <span className="text-xs font-bold text-slate-500">{p.unit || 'Cái'}</span>
        },
        { 
            header: 'VỊ TRÍ', accessorKey: 'location', width: 'w-32',
            cell: (p) => {
                const wh = WAREHOUSE_CONFIG.find(w => w.id === p.location);
                return (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                        <span className="material-symbols-outlined text-[16px] text-slate-400">{wh?.icon || 'inventory_2'}</span>
                        <span className="text-[11px] font-bold uppercase truncate">{wh?.label.replace('Kho ', '') || p.location}</span>
                    </div>
                );
            }
        },
        { header: 'TỒN KHO', accessorKey: 'stock', width: 'w-48', sortable: true, cell: (p) => <StockHealthBar current={p.stock} min={p.minStock || 10} reserved={p.stockReserved} /> },
        { 
            header: 'GIÁ BÁN', accessorKey: 'retailPrice', width: 'w-40', align: 'right', sortable: true,
            cell: (p) => (
                <div className="flex flex-col items-end">
                    <span className="font-black text-slate-900 dark:text-white text-sm">{formatCurrency(p.retailPrice).replace(' VND','')}</span>
                    <span className="text-[9px] font-bold text-slate-400">Vốn: {formatCurrency(p.importPrice).replace(' VND','')}</span>
                </div>
            )
        },
        {
            header: '', width: 'w-12', align: 'center',
            cell: (p) => (
                <button 
                    onClick={(e) => { e.stopPropagation(); setEditingProduct(p); setIsAdjustModalOpen(true); }}
                    className="size-8 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                >
                    <span className="material-symbols-outlined text-[18px]">tune</span>
                </button>
            )
        }
    ];

    return (
        <PageShell className="bg-slate-50 dark:bg-slate-950">
            <div className="flex h-full max-w-[1920px] mx-auto w-full">
                {/* Control Tower Sidebar */}
                {activeTab === 'products' && (
                    <div className="w-[280px] shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-20">
                        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                <span className="material-symbols-outlined text-indigo-600 text-[18px]">dashboard_customize</span>
                                Control Tower
                            </h2>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-8">
                            <SidebarSection title="Trạng thái hàng hóa">
                                <div className="grid grid-cols-3 gap-2">
                                    <button onClick={() => setActiveStatus(activeStatus === 'safe' ? 'all' : 'safe')} className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all gap-1 ${activeStatus === 'safe' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400'}`}>
                                        <span className="text-xl font-black">{facets.status.safe}</span>
                                        <span className="text-[9px] font-bold uppercase">Ổn định</span>
                                    </button>
                                    <button onClick={() => setActiveStatus(activeStatus === 'low' ? 'all' : 'low')} className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all gap-1 ${activeStatus === 'low' ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400'}`}>
                                        <span className="text-xl font-black">{facets.status.low}</span>
                                        <span className="text-[9px] font-bold uppercase">Cần nhập</span>
                                    </button>
                                    <button onClick={() => setActiveStatus(activeStatus === 'out' ? 'all' : 'out')} className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all gap-1 ${activeStatus === 'out' ? 'bg-rose-50 border-rose-500 text-rose-700' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-400'}`}>
                                        <span className="text-xl font-black">{facets.status.out}</span>
                                        <span className="text-[9px] font-bold uppercase">Hết hàng</span>
                                    </button>
                                </div>
                            </SidebarSection>
                            
                            <SidebarSection title="Phân bổ kho">
                                <ZoneFilterItem label="Tất cả kho" count={facets.totalCount} totalCount={facets.totalCount} isActive={activeZone === 'all'} onClick={() => setActiveZone('all')} icon="apps" />
                                {WAREHOUSE_CONFIG.map(w => (
                                    <ZoneFilterItem 
                                        key={w.id} 
                                        label={w.label.replace('Kho ', '')} 
                                        count={facets.zones[w.id] || 0} 
                                        totalCount={facets.totalCount} 
                                        isActive={activeZone === w.id} 
                                        onClick={() => setActiveZone(w.id)} 
                                        icon={w.icon} 
                                    />
                                ))}
                            </SidebarSection>
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                    <div className="flex items-center gap-2 px-6 pt-4 shrink-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
                        <button onClick={() => setActiveTab('products')} className={`px-6 py-3 rounded-t-2xl text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'products' ? 'bg-slate-50 dark:bg-slate-950 text-indigo-600 border-x border-t border-slate-200 dark:border-slate-800 -mb-[1px] z-10' : 'text-slate-400 hover:text-slate-600'}`}>Hàng hóa</button>
                        <button onClick={() => setActiveTab('history')} className={`px-6 py-3 rounded-t-2xl text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'history' ? 'bg-slate-50 dark:bg-slate-950 text-indigo-600 border-x border-t border-slate-200 dark:border-slate-800 -mb-[1px] z-10' : 'text-slate-400 hover:text-slate-600'}`}>Nhật ký biến động</button>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0 relative bg-slate-50 dark:bg-slate-950">
                        {activeTab === 'products' ? (
                            <>
                                <div className="p-6 pb-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                                    <InventoryKpi title="Tổng giá trị vốn" value={formatCurrency(facets.totalValue).replace(' VND','')} icon="monetization_on" accentColor="emerald" />
                                    <InventoryKpi title="Mã hàng hóa" value={facets.totalCount} icon="inventory_2" accentColor="blue" />
                                    <InventoryKpi title="Sản phẩm sắp hết" value={facets.status.low} icon="warning" accentColor="amber" />
                                    <InventoryKpi title="Hết hàng hoàn toàn" value={facets.status.out} icon="error" accentColor="rose" />
                                </div>
                                <div className="flex-1 flex flex-col min-h-0 pt-4">
                                    <TableToolbar 
                                        searchValue={searchTerm} 
                                        onSearchChange={setSearchTerm} 
                                        placeholder="Tìm tên, mã SKU, thương hiệu..." 
                                        rightActions={
                                            <div className="flex items-center gap-3">
                                                <Button 
                                                    variant="secondary" 
                                                    icon="online_prediction" 
                                                    onClick={() => setIsRestockModalOpen(true)} 
                                                    className="rounded-2xl h-11 px-6 text-xs font-bold text-indigo-600 bg-indigo-50 border-indigo-100 hover:bg-indigo-100"
                                                >
                                                    Dự báo AI
                                                </Button>
                                                <Button 
                                                    variant="outline" 
                                                    icon="file_upload" 
                                                    onClick={() => setIsImportModalOpen(true)} 
                                                    className="rounded-2xl h-11 px-6 text-xs font-bold border-slate-300 dark:border-slate-700"
                                                >
                                                    Nhập Excel
                                                </Button>
                                                <Button 
                                                    variant="primary" 
                                                    icon="add" 
                                                    onClick={() => setIsCreateModalOpen(true)} 
                                                    className="bg-indigo-600 shadow-lg shadow-indigo-600/20 rounded-2xl h-11 px-8 font-black uppercase"
                                                >
                                                    Tạo mới
                                                </Button>
                                            </div>
                                        } 
                                    />
                                    <div className="flex-1 overflow-hidden px-8 pt-4 pb-2">
                                        <DataTable 
                                            data={products} 
                                            columns={columns} 
                                            isLoading={isLoading} 
                                            sort={{ items: sortState, onSort: requestSort }} 
                                            onRowClick={(p) => setSelectedProductId(p.id)} 
                                            emptyIcon="inventory" 
                                            rowClassName={() => 'h-16 group'} 
                                        />
                                    </div>
                                    <div className="px-8 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                                        <Pagination currentPage={currentPage} totalItems={totalItems} pageSize={20} onPageChange={setCurrentPage} />
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 overflow-hidden">
                                <InventoryHistoryTab />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals & Drawers */}
            <ProductDetailDrawer 
                isOpen={!!selectedProductId} 
                productId={selectedProductId} 
                onClose={() => setSelectedProductId(null)} 
                onEdit={(p) => { setEditingProduct(p); setIsEditModalOpen(true); }} 
                onAdjust={(p) => { setEditingProduct(p); setIsAdjustModalOpen(true); }} 
            />
            
            <CreateProductModal 
                isOpen={isCreateModalOpen} 
                onClose={() => setIsCreateModalOpen(false)} 
                onSubmit={async (data) => { await addProduct(data as Product); showNotification('Thêm sản phẩm thành công', 'success'); }} 
                mode="create" 
            />
            
            <CreateProductModal 
                isOpen={isEditModalOpen} 
                onClose={() => { setIsEditModalOpen(false); setEditingProduct(null); }} 
                onSubmit={async (data) => { if(editingProduct) { await updateProduct({ ...editingProduct, ...data }); showNotification('Cập nhật thành công', 'success'); } }} 
                initialData={editingProduct || undefined} 
                mode="edit" 
            />
            
            <AdjustStockModal 
                product={editingProduct} 
                onClose={() => { setIsAdjustModalOpen(false); setEditingProduct(null); }} 
                onSave={async (qty, reason) => { if(editingProduct) { await adjustStock(editingProduct.id, qty, reason); showNotification('Đã điều chỉnh tồn kho', 'success'); } }} 
            />

            <InventoryImportModal 
                isOpen={isImportModalOpen} 
                onClose={() => setIsImportModalOpen(false)} 
                onSuccess={() => { showNotification('Dữ liệu đã được nhập thành công', 'success'); }} 
            />

            <SmartRestockModal 
                isOpen={isRestockModalOpen} 
                onClose={() => setIsRestockModalOpen(false)} 
            />
        </PageShell>
    );
};

export default Inventory;
