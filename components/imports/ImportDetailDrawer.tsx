
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { ImportOrder, ImportStatus, ReceivingNote, PurchaseReturnNote } from '../../types';
import { Drawer, DrawerSection } from '../ui/Drawer';
import { Button } from '../ui/Primitives';
import StatusBadge from '../StatusBadge';
import { formatCurrency, formatInputDate } from '../../utils/helpers';
import { useApp as useAppContext } from '../../hooks/useApp';
import { AuditTimeline } from '../audit/AuditTimeline';

const ProgressPill = ({ value, max, label, color }: { value: number, max: number, label: string, color: string }) => {
    const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    return (
        <div className="w-full">
            <div className="flex justify-between items-end mb-1.5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
                <span className={`text-[11px] font-black ${color.replace('bg-', 'text-')}`}>{Math.round(percent)}%</span>
            </div>
            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                <div className={`h-full ${color} transition-all duration-1000 ease-out`} style={{ width: `${percent}%` }}></div>
            </div>
        </div>
    );
};

export const ImportDetailDrawer: React.FC<{ 
    importId: string | null; 
    isOpen: boolean; 
    onClose: () => void; 
    onPrint: (i: ImportOrder) => void; 
    onReceive: () => void; 
    onReturn: () => void;
}> = ({ importId, isOpen, onClose, onPrint, onReceive, onReturn }) => {
    const { updateImportStatus, confirm } = useAppContext();
    const [activeTab, setActiveTab] = useState<'items' | 'receivings' | 'history'>('items');

    const importOrder = useLiveQuery(() => importId ? db.importOrders.get(importId) : undefined, [importId]);
    const auditLogs = useLiveQuery(() => importId ? db.auditLogs.where('entityId').equals(importId).reverse().toArray() : [], [importId]) || [];
    const receivingNotes = useLiveQuery(() => importOrder ? db.receivingNotes.where('importCode').equals(importOrder.code).toArray() : [], [importOrder]) || [];

    if (!isOpen || !importOrder) return null;

    const isCompleted = importOrder.status === 'Completed';
    const isCancelled = importOrder.status === 'Cancelled';
    const totalReceived = importOrder.items.reduce((sum, i) => sum + (i.receivedQuantity || 0), 0);
    const totalOrdered = importOrder.items.reduce((sum, i) => sum + i.quantity, 0);

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={importOrder.code}
            subtitle={
                <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] font-mono font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded border uppercase">{importOrder.date}</span>
                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 uppercase">{importOrder.warehouse}</span>
                </div>
            }
            width="2xl"
            footer={
                <div className="flex gap-3 w-full">
                    <Button variant="outline" className="flex-1 h-12 rounded-2xl" icon="print" onClick={() => onPrint(importOrder)}>In phiếu</Button>
                    {!isCancelled && !isCompleted && (
                        <Button variant="primary" className="flex-[2] bg-emerald-600 shadow-lg shadow-emerald-600/20 rounded-2xl h-12" icon="inventory" onClick={onReceive}>Nhập kho thực tế</Button>
                    )}
                </div>
            }
        >
            {/* Hero Summary Section */}
            <div className="bg-slate-900 dark:bg-black p-6 rounded-[2.5rem] text-white shadow-2xl mb-8 relative overflow-hidden group">
                <div className="relative z-10 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="size-6 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                <span className="material-symbols-outlined text-[16px]">store</span>
                            </div>
                            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{importOrder.supplierName}</span>
                        </div>
                        <h2 className="text-3xl font-black tracking-tighter">{formatCurrency(importOrder.total)}</h2>
                    </div>
                    <StatusBadge status={importOrder.status} entityType="Import" size="md" className="bg-white/10 border-white/20 text-white backdrop-blur-md" />
                </div>

                <div className="relative z-10 grid grid-cols-2 gap-8 mt-8 pt-8 border-t border-white/10">
                    <ProgressPill value={totalReceived} max={totalOrdered} label="Tiến độ nhận hàng" color="bg-orange-500" />
                    <ProgressPill value={importOrder.amountPaid || 0} max={importOrder.total} label="Tiến độ thanh toán" color="bg-emerald-500" />
                </div>

                <span className="material-symbols-outlined absolute -bottom-6 -right-6 text-[120px] opacity-[0.05] rotate-12 group-hover:scale-110 transition-transform duration-700">local_shipping</span>
            </div>

            {/* Navigation Tabs */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl mb-8 overflow-x-auto no-scrollbar">
                {[
                    { id: 'items', label: 'Hàng hóa', icon: 'list' },
                    { id: 'receivings', label: 'Đợt nhận hàng', icon: 'history' },
                    { id: 'history', label: 'Nhật ký truy vết', icon: 'history_edu' }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 py-3 px-4 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap flex items-center justify-center gap-2 ${
                            activeTab === tab.id 
                            ? 'bg-white dark:bg-slate-700 shadow-md text-blue-600 dark:text-blue-400' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                        {tab.label}
                        {tab.id === 'receivings' && receivingNotes.length > 0 && (
                            <span className="size-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px]">{receivingNotes.length}</span>
                        )}
                    </button>
                ))}
            </div>

            <div className="min-h-[300px]">
                {activeTab === 'items' && (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="rounded-[2rem] border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black uppercase text-slate-500 tracking-widest border-b border-slate-200 dark:border-slate-800">
                                    <tr>
                                        <th className="px-6 py-4">Sản phẩm</th>
                                        <th className="px-2 py-4 text-center w-24">Số lượng</th>
                                        <th className="px-6 py-4 text-right w-36">Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {importOrder.items.map((item, idx) => {
                                        const isReceived = (item.receivedQuantity || 0) >= item.quantity;
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <p className="font-bold text-slate-900 dark:text-white truncate max-w-[250px] uppercase tracking-tight">{item.productName}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">{item.sku}</span>
                                                        {item.receivedQuantity! > 0 && (
                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isReceived ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                                                                Đã nhận: {item.receivedQuantity}/{item.quantity}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-4 text-center font-black text-slate-700 dark:text-slate-300">
                                                    {item.quantity} <span className="text-[9px] font-bold text-slate-400">{item.unit || 'Cái'}</span>
                                                </td>
                                                <td className="px-6 py-4 text-right font-black text-slate-900 dark:text-white">
                                                    {formatCurrency(item.total).replace(' VND', '')}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="bg-slate-50/50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
                                    {importOrder.extraCosts! > 0 && (
                                        <tr>
                                            <td colSpan={2} className="px-6 py-3 text-right text-[10px] font-bold uppercase text-slate-500 tracking-wider">Chi phí phát sinh</td>
                                            <td className="px-6 py-3 text-right font-bold text-slate-700 dark:text-slate-300">+{formatCurrency(importOrder.extraCosts)}</td>
                                        </tr>
                                    )}
                                    <tr>
                                        <td colSpan={2} className="px-6 py-4 text-right text-[11px] font-black uppercase text-slate-900 dark:text-white tracking-widest">Tổng giá trị phiếu</td>
                                        <td className="px-6 py-4 text-right font-black text-lg text-emerald-600">{formatCurrency(importOrder.total)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        
                        {importOrder.notes && (
                            <DrawerSection title="Ghi chú nghiệp vụ">
                                <div className="p-5 bg-amber-50 dark:bg-amber-900/10 rounded-[1.5rem] text-sm font-medium text-amber-700 dark:text-amber-300 italic border border-amber-100 dark:border-amber-900/30">
                                    "{importOrder.notes}"
                                </div>
                            </DrawerSection>
                        )}
                    </div>
                )}

                {activeTab === 'receivings' && (
                    <div className="space-y-4 animate-fadeIn">
                        {receivingNotes.length > 0 ? receivingNotes.map((note) => (
                            <div key={note.id} className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm hover:border-emerald-300 transition-all group">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm"><span className="material-symbols-outlined">inventory_2</span></div>
                                        <div>
                                            <p className="font-black text-slate-900 dark:text-white text-sm">{note.code}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{formatInputDate(note.date)}</p>
                                        </div>
                                    </div>
                                    {note.totalLandedCost! > 0 && (
                                        <span className="px-3 py-1 rounded-lg bg-orange-50 text-orange-700 text-[9px] font-black uppercase border border-orange-100 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">local_shipping</span>
                                            +{formatCurrency(note.totalLandedCost)}
                                        </span>
                                    )}
                                </div>
                                <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                                    {note.items.map((it, i) => (
                                        <div key={i} className="flex justify-between text-xs items-center">
                                            <span className="text-slate-600 dark:text-slate-400 font-bold truncate max-w-[200px] uppercase tracking-tighter">{it.productName}</span>
                                            <span className="font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-lg">x{it.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )) : (
                            <div className="py-20 text-center text-slate-400 opacity-50 flex flex-col items-center">
                                <div className="size-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                                    <span className="material-symbols-outlined text-4xl">inbox</span>
                                </div>
                                <p className="text-xs font-black uppercase tracking-widest">Chưa ghi nhận đợt nhận hàng nào</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="animate-fadeIn">
                        <AuditTimeline logs={auditLogs} />
                    </div>
                )}
            </div>
        </Drawer>
    );
};
