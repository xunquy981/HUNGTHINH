
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { Order, OrderStatus, DeliveryNote, ReturnNote, ViewState } from '../../types';
import { Drawer, DrawerSection } from '../ui/Drawer';
import { Button } from '../ui/Primitives';
import { DetailSkeleton } from '../ui/Skeleton';
import StatusBadge from '../StatusBadge';
import { formatCurrency, formatInputDate } from '../../utils/helpers';
import { AuditTimeline } from '../audit/AuditTimeline';
import { useApp as useAppContext } from '../../hooks/useApp';
import { Tooltip } from '../ui/Tooltip';
import { OrderReturnModal } from './OrderReturnModal';
import { CancelOrderModal } from './CancelOrderModal';

interface OrderDetailDrawerProps {
  order: Order | null;
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
  onPrint: () => void;
  onDelivery: () => void;
  onPayment: (order: Order) => void;
  onReturn: () => void;
  onAction: (id: string, status: OrderStatus) => void;
  onDelete: (id: string) => void; // Used for soft-delete (hide)
  onLock: () => void;
  relatedDeliveries?: DeliveryNote[];
  relatedReturns?: ReturnNote[];
  onNavigate?: (view: ViewState, params?: any) => void;
}

export const OrderDetailDrawer: React.FC<OrderDetailDrawerProps> = ({
  order, isOpen, isLoading = false, onClose,
  onPrint, onDelivery, onPayment, onReturn, onAction, onDelete, onLock,
  relatedDeliveries = [], onNavigate
}) => {
  const { confirm, showNotification, returnOrder, cancelOrder } = useAppContext();
  const [activeTab, setActiveTab] = useState<'info' | 'returns' | 'history'>('info');
  const [isFinishing, setIsFinishing] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const auditLogs = useLiveQuery(async () => {
      if (!order) return [];
      return db.auditLogs.where('entityId').equals(order.id).reverse().toArray();
  }, [order?.id]);

  const returnNotes = useLiveQuery(async () => {
      if (!order) return [];
      return db.returnNotes.where('orderCode').equals(order.code).toArray();
  }, [order?.code]);

  const sourceQuote = useLiveQuery(async () => {
      if (!order?.quoteId) return null;
      return db.quotes.get(order.quoteId);
  }, [order?.quoteId]);

  const paymentTransactions = useLiveQuery(async () => {
      if (!order) return [];
      return db.transactions.where('referenceCode').equals(order.code).reverse().toArray();
  }, [order?.code]);

  if (!isOpen) return null;

  if (isLoading || (!order && isOpen)) {
      return (
          <Drawer isOpen={isOpen} onClose={onClose} title="Đang tải..." width="2xl">
              <DetailSkeleton />
          </Drawer>
      );
  }

  if (!order) return null;

  const isLocked = !!order.lockedAt;
  const isCancelled = order.status === 'Cancelled';
  const isReturned = order.status === 'Returned';
  const isCompleted = order.status === 'Completed';
  const isShipping = order.status === 'Shipping' || order.status === 'PartiallyShipped';
  const isDelivered = order.fulfillmentStatus === 'Delivered';
  const hasDelivery = relatedDeliveries && relatedDeliveries.length > 0;
  const hasReturns = returnNotes && returnNotes.length > 0;

  const amountPaid = order.amountPaid || 0;
  const totalAmount = order.total || 0;
  const remaining = Math.max(0, totalAmount - amountPaid);
  const paidPercent = totalAmount > 0 ? (amountPaid / totalAmount) * 100 : 0;
  
  const customerName = order.customerName || 'Khách lẻ';
  const charCode = customerName?.charCodeAt(0) || 0;
  const items = order.items || [];

  // Extract cancel reason if available
  const cancelReason = order.notes && order.notes.includes('[Hủy:') 
    ? order.notes.split('[Hủy:')[1]?.split(']')[0]?.trim() 
    : null;

  const handleCompleteOrder = async () => {
      if (isFinishing) return;
      let msg = 'Xác nhận hoàn tất đơn hàng?';
      let type: 'info' | 'warning' = 'info';

      if (order.fulfillmentStatus === 'Delivered') {
          msg = 'Đơn hàng đã giao đủ. Hệ thống sẽ chuyển trạng thái sang "Hoàn tất" và ghi nhận doanh thu.';
      } else {
          msg = 'CẢNH BÁO: Đơn hàng CHƯA GIAO HẾT. Hành động này sẽ TỰ ĐỘNG TRỪ KHO số lượng còn lại và đánh dấu đã giao. Bạn có chắc chắn không?';
          type = 'warning';
      }

      const ok = await confirm({ title: 'Hoàn tất đơn hàng?', message: msg, confirmLabel: 'Xác nhận hoàn tất', type });
      
      if (ok) {
          setIsFinishing(true);
          try {
              await onAction(order.id, 'Completed');
              showNotification('Đã hoàn tất đơn hàng', 'success');
          } catch (e) {
              showNotification('Lỗi khi cập nhật trạng thái', 'error');
          } finally {
              setIsFinishing(false);
          }
      }
  };

  const handleCancelConfirm = async (reason: string) => {
      try {
          await cancelOrder(order.id, reason);
          setIsCancelModalOpen(false);
          // Don't close drawer immediately to let user see status change
      } catch (e: any) {
          showNotification(e.message, 'error');
      }
  };

  const handleDeleteOrder = async () => {
      const ok = await confirm({
          title: 'Xóa vĩnh viễn?',
          message: 'Hành động này sẽ ẩn đơn hàng khỏi danh sách. Chỉ nên dùng cho đơn nháp hoặc nhập sai.',
          type: 'danger'
      });
      if (ok) onDelete(order.id);
  };

  const handleViewQuote = () => {
      if (onNavigate && order.quoteId) {
          onNavigate('QUOTES', { highlightId: order.quoteId });
          onClose();
      }
  };

  const handleReturnSubmit = async (params: any) => {
      try {
          await returnOrder(params);
      } catch (e: any) {
          showNotification(e.message, 'error');
      }
  };

  const steps = [
      { id: 'PendingPayment', label: 'Chờ duyệt', icon: 'hourglass_empty', current: order.status === 'PendingPayment' },
      { id: 'Processing', label: 'Đang soạn', icon: 'package_2', current: order.status === 'Processing' },
      { id: 'Shipping', label: 'Vận chuyển', icon: 'local_shipping', current: order.status === 'Shipping' || order.status === 'PartiallyShipped' },
      { id: 'Completed', label: 'Hoàn tất', icon: 'task_alt', current: order.status === 'Completed' }
  ];

  return (
    <>
        <Drawer
        isOpen={isOpen}
        onClose={onClose}
        title={order.code}
        subtitle={order.date}
        width="2xl"
        footer={
            <>
                <div className="flex-1 flex gap-3">
                    <Button variant="outline" icon="print" onClick={onPrint} className="flex-1">In</Button>
                    {!isCancelled && !isReturned && !isCompleted && (
                        <Button variant="secondary" icon="local_shipping" onClick={onDelivery} disabled={isLocked} className="flex-1">{isShipping ? 'Giao thêm' : 'Giao hàng'}</Button>
                    )}
                    {(isCompleted || isReturned) && !isCancelled && (
                        <Button variant="secondary" icon="keyboard_return" onClick={() => setIsReturnModalOpen(true)} className="flex-1 text-rose-600 hover:bg-rose-50 border-rose-200">Trả hàng</Button>
                    )}
                </div>
                {!isCancelled && !isReturned && !isCompleted ? (
                <div className="flex gap-2 items-center">
                    {remaining > 0 && (
                        <Button 
                            variant="primary" 
                            className="bg-emerald-600 hover:bg-emerald-700 border-emerald-600 shadow-lg shadow-emerald-600/20" 
                            icon="payments" 
                            onClick={() => onPayment(order)}
                        >
                            Thu tiền
                        </Button>
                    )}
                    <Button variant="primary" icon="check" onClick={handleCompleteOrder} loading={isFinishing} className="bg-blue-600">Hoàn thành</Button>
                </div>
                ) : (
                    <div className={`px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center ${isCancelled || isReturned ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-slate-100 text-slate-500'}`}>
                        {isCancelled ? 'Đơn đã hủy' : isReturned ? 'Đơn đã trả hàng' : 'Đơn đã hoàn tất'}
                    </div>
                )}
            </>
        }
        >
        {isCancelled ? (
            <div className="mb-8 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-2xl p-6 flex flex-col items-center justify-center text-center animate-fadeIn shadow-sm">
                <div className="size-14 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mb-3 shadow-inner">
                    <span className="material-symbols-outlined text-[32px]">cancel</span>
                </div>
                <h3 className="text-xl font-black text-red-700 dark:text-red-400 uppercase tracking-tight">Đơn hàng đã hủy</h3>
                <p className="text-sm text-red-600/80 dark:text-red-300 mt-1 font-medium max-w-md">
                    Đơn hàng này đã bị hủy bỏ và vô hiệu hóa các giao dịch liên quan.
                </p>
                {cancelReason && (
                    <div className="mt-4 px-4 py-2 bg-white dark:bg-slate-900 rounded-lg border border-red-100 dark:border-red-900/30 text-xs font-bold text-red-600 shadow-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-[14px]">info</span>
                        Lý do: {cancelReason}
                    </div>
                )}
            </div>
        ) : isReturned ? (
            <div className="mb-8 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 rounded-2xl p-6 flex flex-col items-center justify-center text-center animate-fadeIn shadow-sm">
                <div className="size-14 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center mb-3 shadow-inner">
                    <span className="material-symbols-outlined text-[32px]">assignment_return</span>
                </div>
                <h3 className="text-xl font-black text-rose-700 dark:text-rose-400 uppercase tracking-tight">Đơn hàng đã trả</h3>
                <p className="text-sm text-rose-600/80 dark:text-rose-300 mt-1 font-medium max-w-md">
                    Đơn hàng này đã được xử lý trả hàng toàn bộ hoặc một phần.
                </p>
            </div>
        ) : (
            <div className="mb-8 px-2">
                <div className="flex items-center justify-between relative">
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 dark:bg-slate-800 -z-10"></div>
                    {steps.map((step) => (
                        <div key={step.id} className="flex flex-col items-center gap-1.5 bg-white dark:bg-slate-900 px-2">
                            <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step.current ? 'bg-blue-600 text-white shadow-lg scale-110' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                                <span className="material-symbols-outlined text-[16px]">{step.icon}</span>
                            </div>
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${step.current ? 'text-blue-600' : 'text-slate-400'}`}>{step.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}

        <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
                <StatusBadge status={order.status} entityType="Order" size="md" />
                <StatusBadge status={order.fulfillmentStatus || 'NotShipped'} entityType="Fulfillment" size="md" />
                {isLocked && <span className="bg-red-50 text-red-600 px-2 py-1 rounded text-[10px] font-bold border border-red-100 flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">lock</span> Đã khóa</span>}
            </div>
            {!isLocked && (
                <div className="flex gap-2">
                    {/* Allow cancelling even if completed, but button text/modal will warn about refund */}
                    {!isCancelled && !isReturned && (
                        <Button variant="ghost" size="sm" onClick={() => setIsCancelModalOpen(true)} className="text-red-500 hover:bg-red-50">Hủy đơn</Button>
                    )}
                    {/* Allow Delete if Cancelled or Returned just to clean up */}
                    {(isCancelled || isReturned) && (
                        <Button variant="ghost" size="sm" onClick={handleDeleteOrder} className="text-slate-400 hover:text-slate-600">Xóa vĩnh viễn</Button>
                    )}
                    {!isCancelled && !isReturned && !isCompleted && (
                        <Button variant="ghost" size="sm" onClick={onLock} icon="lock" className="text-slate-400 hover:text-slate-600">Khóa</Button>
                    )}
                </div>
            )}
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6 sticky top-0 bg-white dark:bg-slate-900 z-10">
            <button onClick={() => setActiveTab('info')} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'info' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Chi tiết</button>
            <button onClick={() => setActiveTab('returns')} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'returns' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Trả hàng ({returnNotes?.length || 0})</button>
            <button onClick={() => setActiveTab('history')} className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Lịch sử ({auditLogs?.length || 0})</button>
        </div>

        {/* ... (rest of the file remains same) ... */}
        {activeTab === 'info' && (
            <div className="order-detail-container space-y-6 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Customer Card */}
                        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 shadow-sm relative group cursor-pointer" onClick={() => onNavigate && onNavigate('PARTNERS', { highlightId: order.partnerId })}>
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Khách hàng</h4>
                                <span className="material-symbols-outlined text-slate-300 text-[16px] group-hover:text-blue-500">open_in_new</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className={`size-10 rounded-full flex items-center justify-center text-white text-xs font-bold uppercase ${['bg-blue-500', 'bg-indigo-500', 'bg-purple-500'][charCode % 3]}`}>{customerName.charAt(0)}</div>
                                <div className="min-w-0"><p className="font-bold text-slate-900 dark:text-white text-base truncate">{customerName}</p><p className="text-sm text-slate-500">{order.phone || '---'}</p></div>
                            </div>
                        </div>

                        {/* Payment Card */}
                        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="flex justify-between items-start mb-3 relative z-10">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tình trạng thanh toán</h4>
                                <StatusBadge status={order.paymentStatus} entityType="Payment" type="dot" />
                            </div>
                            <div className="flex justify-between items-end relative z-10">
                                <div>
                                    <p className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(totalAmount)}</p>
                                    <p className="text-xs text-slate-500 mt-1">Đã trả: <span className="font-bold text-emerald-600">{formatCurrency(amountPaid)}</span></p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-slate-400 uppercase">Còn lại</p>
                                    <p className={`font-bold text-lg ${remaining > 0 ? 'text-red-600' : 'text-emerald-500'}`}>{formatCurrency(remaining)}</p>
                                </div>
                            </div>
                            {/* Payment Progress Bar */}
                            <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-100 dark:bg-slate-700">
                                <div className={`h-full ${remaining === 0 ? 'bg-emerald-500' : 'bg-orange-500'} transition-all duration-1000`} style={{ width: `${paidPercent}%` }}></div>
                            </div>
                        </div>
                    </div>

                    {order.quoteId && (
                        <DrawerSection title="Nguồn gốc chứng từ">
                            <div className="p-3 bg-purple-50 dark:bg-purple-900/10 border border-purple-100 rounded-xl flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="size-8 rounded-lg bg-purple-100 dark:bg-purple-800 flex items-center justify-center text-purple-600"><span className="material-symbols-outlined text-[18px]">request_quote</span></div>
                                    <div><p className="text-[10px] font-black text-purple-600 uppercase">Chuyển đổi từ Báo giá</p><p className="font-bold text-sm">{sourceQuote?.code || '---'}</p></div>
                                </div>
                                <Button variant="ghost" size="sm" icon="visibility" className="text-purple-600" onClick={handleViewQuote}>Xem báo giá</Button>
                            </div>
                        </DrawerSection>
                    )}

                    {/* Delivery Information Section */}
                    {hasDelivery && (
                        <DrawerSection title="Thông tin giao hàng">
                            <div className="space-y-2">
                                {relatedDeliveries.map(dn => (
                                    <div key={dn.id} className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 rounded-xl group cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors" onClick={() => onNavigate && onNavigate('DELIVERY_NOTES', { highlightId: dn.id })}>
                                        <div className="flex items-center gap-3">
                                            <div className="size-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600"><span className="material-symbols-outlined text-[18px]">local_shipping</span></div>
                                            <div><p className="font-bold text-sm text-blue-700 dark:text-blue-300 group-hover:underline">{dn.code}</p><p className="text-[10px] text-slate-500">{dn.date} • {dn.shipperName || '---'}</p></div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <StatusBadge status={dn.status} entityType="Delivery" size="sm" />
                                            <span className="material-symbols-outlined text-slate-400 text-[16px]">chevron_right</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </DrawerSection>
                    )}

                    <DrawerSection title="Danh sách hàng hóa" action={<span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">{items.length} SP</span>}>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] text-slate-500 uppercase font-bold border-b border-slate-200">
                                    <tr><th className="px-3 py-2">Sản phẩm</th><th className="px-3 py-2 text-center">SL</th><th className="px-3 py-2 text-center">Giao</th><th className="px-3 py-2 text-right">Tổng</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {items.map((item, idx) => {
                                        const delivered = item.deliveredQuantity || 0;
                                        const isFull = delivered >= item.quantity;
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-3 py-2"><div className="font-medium text-slate-900 dark:text-white truncate max-w-[180px]">{item.productName}</div><div className="text-[10px] text-slate-400 font-mono">{item.sku}</div></td>
                                                <td className="px-3 py-2 text-center font-bold">{item.quantity}</td>
                                                <td className="px-3 py-2 text-center"><span className={`font-bold ${isFull ? 'text-emerald-600' : delivered > 0 ? 'text-orange-600' : 'text-slate-400'}`}>{delivered}</span></td>
                                                <td className="px-3 py-2 text-right font-bold">{formatCurrency(item.total)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="bg-slate-50 dark:bg-slate-800 border-t border-slate-200">
                                    <tr>
                                        <td colSpan={3} className="px-3 py-2 text-right font-bold text-xs uppercase text-slate-500">Tổng cộng</td>
                                        <td className="px-3 py-2 text-right font-black text-slate-900 dark:text-white">{formatCurrency(totalAmount)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </DrawerSection>

                    {/* Payment History Section */}
                    {paymentTransactions && paymentTransactions.length > 0 && (
                        <DrawerSection title="Lịch sử thanh toán">
                            <div className="space-y-2">
                                {paymentTransactions.map(txn => (
                                    <div key={txn.id} className="flex justify-between items-center p-3 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 rounded-xl cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/30" onClick={() => onNavigate && onNavigate('TRANSACTIONS')}>
                                        <div className="flex items-center gap-3">
                                            <div className="size-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                                                <span className="material-symbols-outlined text-[18px]">payments</span>
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-emerald-700">{formatCurrency(txn.amount)}</p>
                                                <p className="text-[10px] text-slate-500 font-medium">
                                                    {new Date(txn.createdAt).toLocaleDateString('vi-VN')} • {txn.method === 'transfer' ? 'Chuyển khoản' : 'Tiền mặt'}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="material-symbols-outlined text-emerald-400 text-[16px]">chevron_right</span>
                                    </div>
                                ))}
                            </div>
                        </DrawerSection>
                    )}
            </div>
        )}

        {activeTab === 'returns' && (
            <div className="space-y-4 animate-fadeIn">
                {returnNotes && returnNotes.length > 0 ? returnNotes.map((note) => (
                    <div key={note.id} className="p-5 bg-white dark:bg-slate-800 border border-red-100 dark:border-red-900/30 rounded-2xl shadow-sm hover:border-red-300 transition-colors relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/5 rounded-bl-full -mr-8 -mt-8 pointer-events-none"></div>
                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shadow-sm"><span className="material-symbols-outlined">keyboard_return</span></div>
                                <div>
                                    <p className="font-black text-slate-900 dark:text-white text-sm">{note.code}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{formatInputDate(note.date)}</p>
                                </div>
                            </div>
                            <span className="text-sm font-black text-red-600 bg-red-50 px-3 py-1 rounded-lg border border-red-100">-{formatCurrency(note.refundAmount)}</span>
                        </div>
                        <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3 relative z-10">
                            {note.items.map((it, i) => (
                                <div key={i} className="flex justify-between text-xs items-center">
                                    <span className="text-slate-600 dark:text-slate-400 font-medium truncate max-w-[200px]">{it.name || (it as any).productName}</span>
                                    <span className="font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">x{it.quantity}</span>
                                </div>
                            ))}
                        </div>
                        {note.reason && <p className="text-[10px] text-slate-500 italic mt-3 bg-slate-50 p-2 rounded-lg relative z-10">"{note.reason}"</p>}
                    </div>
                )) : (
                    <div className="py-20 text-center text-slate-400 opacity-50 flex flex-col items-center">
                        <span className="material-symbols-outlined text-5xl mb-2">assignment_return</span>
                        <p className="text-xs font-bold uppercase tracking-widest">Chưa có phiếu trả hàng nào.</p>
                    </div>
                )}
            </div>
        )}

        {activeTab === 'history' && (
            <div className="animate-fadeIn">
                <AuditTimeline logs={auditLogs || []} />
            </div>
        )}
        </Drawer>

        <OrderReturnModal 
            isOpen={isReturnModalOpen} 
            onClose={() => setIsReturnModalOpen(false)} 
            order={order}
            onSubmit={handleReturnSubmit}
        />

        <CancelOrderModal 
            isOpen={isCancelModalOpen} 
            onClose={() => setIsCancelModalOpen(false)} 
            order={order} 
            onConfirm={handleCancelConfirm}
        />
    </>
  );
};
