
import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { Product, InventoryLog } from '../../types';
import { Drawer, DrawerSection } from '../ui/Drawer';
import { Button } from '../ui/Primitives';
import { DetailSkeleton } from '../ui/Skeleton';
import { formatCurrency, calcAvailableStock, formatDateISO, getStartOfMonth, getEndOfMonth, parseISOToDate } from '../../utils/helpers';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { WAREHOUSE_CONFIG } from '../../constants/options';

export const ProductDetailDrawer: React.FC<{ productId: string | null; isOpen: boolean; onClose: () => void; onEdit: (p: Product) => void; onAdjust: (p: Product) => void; }> = ({ productId, isOpen, onClose, onEdit, onAdjust }) => {
    const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');
    const product = useLiveQuery(() => productId ? db.products.get(productId) : undefined, [productId]);
    const allLogs = useLiveQuery(() => productId ? db.inventoryLogs.where('productId').equals(productId).sortBy('timestamp') : [], [productId]) || [];

    const chartData = useMemo(() => {
        if (!allLogs || allLogs.length === 0) return [];
        return allLogs.slice(-15).map(l => ({ date: new Date(l.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }), stock: l.newStock }));
    }, [allLogs]);

    if (!isOpen) return null;
    if (!product) return <Drawer isOpen={isOpen} onClose={onClose} title="Đang tải..." width="2xl"><DetailSkeleton /></Drawer>;

    const available = calcAvailableStock(product.stock, product.stockReserved);

    return (
        <Drawer isOpen={isOpen} onClose={onClose} title={product.name} subtitle={<div className="flex items-center gap-3 mt-1.5"><span className="font-mono font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded border border-blue-100 text-[10px] uppercase tracking-wider">{product.sku}</span><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{product.brand}</span></div>} width="2xl" footer={<div className="flex gap-3 w-full"><Button variant="secondary" className="flex-1 h-12 rounded-2xl" icon="tune" onClick={() => onAdjust(product)}>Kiểm kê nhanh</Button><Button variant="primary" className="flex-1 h-12 rounded-2xl bg-indigo-600" icon="edit" onClick={() => onEdit(product)}>Sửa hồ sơ</Button></div>}>
            <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 sticky top-0 bg-white dark:bg-slate-900 z-10">
                <button onClick={() => setActiveTab('info')} className={`flex-1 py-4 text-[11px] font-black uppercase tracking-[0.2em] border-b-2 transition-all ${activeTab === 'info' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Hồ sơ sản phẩm</button>
                <button onClick={() => setActiveTab('history')} className={`flex-1 py-4 text-[11px] font-black uppercase tracking-[0.2em] border-b-2 transition-all ${activeTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Biến động kho</button>
            </div>
            <div className="space-y-8 animate-fadeIn">
                {activeTab === 'info' ? (
                    <>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Tồn thực tế</p>
                                <p className="text-3xl font-black text-slate-900 dark:text-white">{product.stock} <span className="text-sm font-bold text-slate-400">{product.unit}</span></p>
                            </div>
                            <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Giá bán lẻ</p>
                                <p className="text-3xl font-black text-indigo-600">{formatCurrency(product.retailPrice).replace(' VND','')}</p>
                            </div>
                        </div>
                        <DrawerSection title="Chi tiết kỹ thuật">
                            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                                {[
                                    { l: 'Quy cách', v: product.dimensions || '---' },
                                    { l: 'Vị trí kho', v: WAREHOUSE_CONFIG.find(w => w.id === product.location)?.label || product.location },
                                    { l: 'Giá vốn nhập', v: formatCurrency(product.importPrice) },
                                    { l: 'Min Stock', v: product.minStock || 10 },
                                    { l: 'Đang giữ hàng', v: product.stockReserved || 0 }
                                ].map((item, i) => (
                                    <div key={i} className="flex justify-between p-4"><span className="text-xs font-bold text-slate-500 uppercase">{item.l}</span><span className="text-sm font-black text-slate-900 dark:text-white">{item.v}</span></div>
                                ))}
                            </div>
                        </DrawerSection>
                        <DrawerSection title="Xu hướng tồn kho (15 đợt gần nhất)">
                            <div className="h-48 w-full bg-slate-50 dark:bg-slate-800/50 rounded-3xl p-4 border border-slate-100 dark:border-slate-800">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} /><XAxis dataKey="date" hide /><YAxis hide /><Tooltip contentStyle={{ borderRadius: '12px', border: 'none', fontWeight: 'bold' }} /><Area type="monotone" dataKey="stock" className="stroke-indigo-500 fill-indigo-500" fillOpacity={0.1} strokeWidth={3} /></AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </DrawerSection>
                    </>
                ) : (
                    <div className="space-y-4">
                        {allLogs.length > 0 ? allLogs.slice().reverse().map(l => (
                            <div key={l.id} className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex justify-between items-center group hover:border-indigo-300 transition-all">
                                <div>
                                    <div className="flex items-center gap-2 mb-1"><span className="text-[10px] font-black text-slate-400 uppercase">{new Date(l.timestamp).toLocaleDateString('vi-VN')}</span><span className={`text-[9px] font-black uppercase px-1.5 rounded border ${l.changeAmount > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>{l.type}</span></div>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{l.note || 'Biến động tồn kho'}</p>
                                </div>
                                <div className="text-right">
                                    <p className={`text-sm font-black ${l.changeAmount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{l.changeAmount > 0 ? `+${l.changeAmount}` : l.changeAmount}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Tồn: {l.newStock}</p>
                                </div>
                            </div>
                        )) : <div className="py-20 text-center text-slate-400 italic">Chưa có lịch sử biến động.</div>}
                    </div>
                )}
            </div>
        </Drawer>
    );
};
