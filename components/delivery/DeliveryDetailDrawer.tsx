
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { DeliveryNote, DeliveryStatus } from '../../types';
import { Drawer, DrawerSection } from '../ui/Drawer';
import { Button } from '../ui/Primitives';
import StatusBadge from '../StatusBadge';
import { formatCurrency } from '../../utils/helpers';
import { useApp as useAppContext } from '../../hooks/useApp';

const BrandShield = ({ brand }: { brand?: string }) => {
    const brandInitials = brand?.substring(0, 2).toUpperCase() || '??';
    const colors = ['bg-blue-600', 'bg-indigo-600', 'bg-slate-700', 'bg-emerald-600', 'bg-orange-600'];
    const colorIdx = (brand?.charCodeAt(0) || 0) % colors.length;
    return <div className={`size-7 rounded-md flex items-center justify-center text-white text-[8px] font-black shrink-0 ${colors[colorIdx]}`}>{brandInitials}</div>;
};

export const DeliveryDetailDrawer: React.FC<{ isOpen: boolean, noteId: string | null, onClose: () => void, onPrint: (n: DeliveryNote) => void }> = ({ isOpen, noteId, onClose, onPrint }) => {
    const { updateDeliveryNoteStatus, confirm, showNotification } = useAppContext();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const note = useLiveQuery(() => noteId ? db.deliveryNotes.get(noteId) : undefined, [noteId]);

    const handleStatusChange = async (newStatus: DeliveryStatus) => {
        if (!note || isSubmitting) return;
        
        let confirmTitle = 'Xác nhận thay đổi';
        let confirmMsg = `Chuyển trạng thái phiếu giao sang "${newStatus}"?`;

        if (newStatus === 'Cancelled') {
            confirmTitle = 'Hủy lệnh giao hàng?';
            confirmMsg = 'Dữ liệu hàng hóa sẽ được hoàn trả về trạng thái "Chờ giao" trong đơn hàng gốc.';
        } else if (newStatus === 'Delivered') {
            confirmTitle = 'Xác nhận giao thành công?';
            confirmMsg = 'Hệ thống sẽ cập nhật số lượng thực giao vào đơn hàng liên quan.';
        }
        
        const ok = await confirm({ title: confirmTitle, message: confirmMsg, type: newStatus === 'Cancelled' ? 'danger' : 'info' });
        
        if (ok) {
            setIsSubmitting(true);
            try {
                await updateDeliveryNoteStatus(note.id, newStatus);
                showNotification(`Đã chuyển phiếu sang trạng thái ${newStatus}`, 'success');
                if (newStatus === 'Delivered' || newStatus === 'Cancelled') onClose();
            } catch (e: any) {
                showNotification(e.message || 'Lỗi cập nhật', 'error');
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    if (!isOpen || !note) return null;

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={note.code}
            subtitle={
                <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-tighter shadow-sm">Đơn hàng gốc: {note.orderCode}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{note.date}</span>
                </div>
            }
            width="2xl"
            footer={
                <div className="flex gap-3 w-full">
                    <Button variant="outline" className="flex-1 h-12 rounded-2xl" icon="print" onClick={() => onPrint(note)}>In phiếu giao</Button>
                    {note.status === 'Pending' && (
                        <Button 
                            variant="primary" 
                            className="flex-1 h-12 rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/20" 
                            icon="local_shipping" 
                            onClick={() => handleStatusChange('Shipping')}
                            loading={isSubmitting}
                        >
                            Bắt đầu giao
                        </Button>
                    )}
                    {note.status === 'Shipping' && (
                        <Button 
                            variant="primary" 
                            className="flex-1 h-12 rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/20" 
                            icon="done_all" 
                            onClick={() => handleStatusChange('Delivered')}
                            loading={isSubmitting}
                        >
                            Xác nhận thành công
                        </Button>
                    )}
                </div>
            }
        >
            {/* Timeline Hành trình vận chuyển */}
            <div className="mb-10 px-4 pt-4">
                <div className="flex items-center justify-between relative">
                    <div className="absolute top-5 left-0 w-full h-1 bg-slate-100 dark:bg-slate-800 -z-10 rounded-full"></div>
                    {[
                        { s: 'Pending', l: 'Lập lệnh', i: 'inventory_2', t: 'Đã sẵn sàng' },
                        { s: 'Shipping', l: 'Đang giao', i: 'delivery_dining', t: 'Trên đường' },
                        { s: 'Delivered', l: 'Hoàn tất', i: 'verified', t: 'Khách đã nhận' }
                    ].map((step, idx) => {
                        const isDone = note.status === step.s || 
                                     (idx === 0 && note.status !== 'Cancelled') || 
                                     (idx === 1 && note.status === 'Delivered');
                        const isCurrent = note.status === step.s;
                        
                        return (
                            <div key={idx} className="flex flex-col items-center gap-3 bg-white dark:bg-slate-900 px-4">
                                <div className={`size-10 rounded-2xl flex items-center justify-center border-4 transition-all duration-500 ${
                                    isDone 
                                    ? 'bg-blue-600 border-blue-100 dark:border-blue-800 text-white shadow-xl shadow-blue-600/30' 
                                    : 'bg-slate-50 border-white dark:border-slate-800 text-slate-300'
                                } ${isCurrent ? 'scale-125 ring-4 ring-blue-500/10' : ''}`}>
                                    <span className="material-symbols-outlined text-[20px]">{step.i}</span>
                                </div>
                                <div className="text-center">
                                    <p className={`text-[10px] font-black uppercase tracking-tighter ${isDone ? 'text-blue-600' : 'text-slate-400'}`}>{step.l}</p>
                                    <p className="text-[8px] font-bold text-slate-300 uppercase mt-0.5">{isDone ? step.t : ''}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="p-6 bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                    <div className="flex items-start justify-between mb-4 relative z-10">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Địa điểm bàn giao</p>
                            <h4 className="text-lg font-black text-slate-900 dark:text-white leading-tight uppercase">{note.customerName}</h4>
                        </div>
                        <div className="size-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><span className="material-symbols-outlined">person_pin_circle</span></div>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 font-bold space-y-2 relative z-10">
                        <p className="flex items-center gap-2.5"><span className="material-symbols-outlined text-[18px] text-slate-400">call</span> {note.address.split(',')[0] || '---'}</p>
                        <p className="flex items-start gap-2.5 leading-relaxed"><span className="material-symbols-outlined text-[18px] text-slate-400 shrink-0">location_on</span> {note.address || 'Giao tại quầy'}</p>
                    </div>
                    <span className="absolute -bottom-6 -right-6 text-[100px] material-symbols-outlined opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">home_pin</span>
                </div>

                <div className="p-6 bg-indigo-50 dark:bg-indigo-900/10 rounded-[2rem] border border-indigo-100 dark:border-indigo-900/30 relative overflow-hidden group">
                    <div className="flex items-start justify-between mb-4 relative z-10">
                        <div>
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1.5">Nhân sự điều phối</p>
                            <h4 className="text-lg font-black text-indigo-900 dark:text-indigo-300 leading-tight uppercase">{note.shipperName || 'CHƯA GÁN'}</h4>
                        </div>
                        <div className="size-10 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-indigo-600 shadow-sm"><span className="material-symbols-outlined">delivery_dining</span></div>
                    </div>
                    <p className="text-[10px] text-indigo-700/60 font-bold uppercase tracking-widest relative z-10 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[14px]">verified</span> 
                        Bộ phận giao hàng Hưng Thịnh
                    </p>
                    <span className="absolute -bottom-6 -right-6 text-[100px] material-symbols-outlined opacity-[0.05] group-hover:opacity-[0.1] transition-opacity">motorcycle</span>
                </div>
            </div>

            <DrawerSection title={`Chi tiết hàng hóa (${note.items.length})`}>
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black uppercase text-slate-500 tracking-widest">
                            <tr>
                                <th className="px-5 py-4 w-12"></th>
                                <th className="px-2 py-4">Mặt hàng vận chuyển</th>
                                <th className="px-5 py-4 text-center w-28">Số lượng</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {note.items.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="px-5 py-4"><BrandShield brand={(item as any).brand} /></td>
                                    <td className="px-2 py-4">
                                        <p className="font-bold text-slate-800 dark:text-white truncate max-w-[250px] uppercase tracking-tighter leading-tight">{item.productName}</p>
                                        <p className="text-[10px] font-mono text-slate-400 font-bold mt-1">{item.sku}</p>
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        <span className="px-3 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-black text-sm">{item.quantity}</span>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Cái</p>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DrawerSection>

            {note.notes && (
                <div className="mt-8 p-6 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-[2rem] relative">
                    <span className="absolute -top-3 left-6 px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-[9px] font-black uppercase tracking-widest text-slate-400">Ghi chú vận chuyển</span>
                    <p className="text-sm text-slate-600 dark:text-slate-400 font-medium italic leading-relaxed">"{note.notes}"</p>
                </div>
            )}
            
            {note.status !== 'Cancelled' && note.status !== 'Delivered' && (
                <div className="mt-10 text-center">
                    <button 
                        disabled={isSubmitting}
                        onClick={() => handleStatusChange('Cancelled')} 
                        className="text-[11px] font-black text-rose-500 hover:text-rose-700 uppercase tracking-[0.2em] transition-all hover:scale-105 disabled:opacity-30"
                    >
                        Hủy lệnh giao hàng này
                    </button>
                </div>
            )}
        </Drawer>
    );
};
