
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { DeliveryNote, OrderItem, Product, Order, Partner } from '../types';
import { useApp as useAppContext } from '../hooks/useApp';
import { removeVietnameseTones, formatCurrency, getCurrentDate } from '../utils/helpers';
import { Button, SearchInput } from './ui/Primitives';
import { Modal } from './ui/Modal';
import { FormField, FormInput, FormSelect, FormTextarea, NumericInput } from './ui/Form';
import { PrintPreviewModal as GenericPrintModal } from './print/PrintPreviewModal';

const BrandShield = ({ brand }: { brand?: string }) => {
    const brandInitials = brand?.substring(0, 2).toUpperCase() || '??';
    const colors = ['bg-blue-600', 'bg-indigo-600', 'bg-slate-700', 'bg-emerald-600', 'bg-orange-600'];
    const colorIdx = (brand?.charCodeAt(0) || 0) % colors.length;
    
    return (
        <div className={`size-8 rounded-lg flex items-center justify-center text-white text-[9px] font-black shadow-inner shrink-0 ${colors[colorIdx]}`}>
            {brandInitials}
        </div>
    );
};

export const CreateDeliveryModal: React.FC<{ isOpen: boolean; onClose: () => void; onSuccess?: (id: string) => void; initialOrderId?: string; }> = ({ isOpen, onClose, onSuccess, initialOrderId }) => {
    const { addDeliveryNote, finalizeOrderWithDelivery, showNotification, settings } = useAppContext();
    
    const products = useLiveQuery(() => db.products.filter(p => !p.isDeleted).toArray()) || [];
    const orders = useLiveQuery(() => db.orders.filter(o => !o.isDeleted).reverse().toArray()) || [];
    const partners = useLiveQuery(() => db.partners.filter(p => !p.isDeleted).toArray()) || [];

    const [creationMode, setCreationMode] = useState<'order' | 'manual'>('order');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [date, setDate] = useState(getCurrentDate());
    const [orderSearch, setOrderSearch] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [manualCustomer, setManualCustomer] = useState({ name: '', address: '', phone: '' });
    const [shipperName, setShipperName] = useState('');
    const [shipperPhone, setShipperPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState<(OrderItem & { _max?: number, _ordered?: number, _delivered?: number, _inTransit?: number })[]>([]);

    const [partnerSearch, setPartnerSearch] = useState('');
    const [isPartnerDropdownOpen, setIsPartnerDropdownOpen] = useState(false);
    const partnerInputRef = useRef<HTMLInputElement>(null);

    const orderPartner = useLiveQuery(() => 
        selectedOrder?.partnerId ? db.partners.get(selectedOrder.partnerId) : undefined
    , [selectedOrder]);

    useEffect(() => {
        if (isOpen) {
            setDate(getCurrentDate());
            setShipperName('');
            setShipperPhone('');
            setNotes('');
            
            if (initialOrderId) {
                setCreationMode('order');
            } else {
                setCreationMode('order');
                setSelectedOrder(null);
                setOrderSearch('');
                setItems([]);
                setManualCustomer({ name: '', address: '', phone: '' });
                setPartnerSearch('');
            }
        }
    }, [isOpen, initialOrderId]);

    useEffect(() => {
        if (isOpen && initialOrderId && orders.length > 0 && !selectedOrder) {
            const ord = orders.find(o => o.id === initialOrderId);
            if (ord) handleSelectOrder(ord);
        }
    }, [isOpen, initialOrderId, orders, selectedOrder]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (partnerInputRef.current && !partnerInputRef.current.contains(event.target as Node)) {
                setIsPartnerDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredPartners = useMemo(() => {
        if (!partnerSearch) return [];
        const norm = removeVietnameseTones(partnerSearch);
        return partners.filter(p => 
            p.type === 'Customer' && 
            (removeVietnameseTones(p.name).includes(norm) || p.phone.includes(partnerSearch))
        ).slice(0, 5);
    }, [partnerSearch, partners]);

    const handleSelectPartner = (p: Partner) => {
        setManualCustomer({ name: p.name, address: p.address || '', phone: p.phone });
        setPartnerSearch(p.name);
        setIsPartnerDropdownOpen(false);
    };

    const handleSelectOrder = async (order: Order) => {
        setSelectedOrder(order);
        setOrderSearch(order.code);

        const activeNotes = await db.deliveryNotes
            .where('orderId').equals(order.id)
            .filter(n => ['Pending', 'Shipping'].includes(n.status))
            .toArray();

        const inTransitMap: Record<string, number> = {};
        activeNotes.forEach(note => {
            note.items.forEach(i => {
                const key = i.id || i.sku;
                inTransitMap[key] = (inTransitMap[key] || 0) + i.quantity;
            });
        });

        const pendingItems = order.items.map(i => {
            const delivered = i.deliveredQuantity || 0;
            const inTransit = inTransitMap[i.id || i.sku] || 0;
            const remaining = Math.max(0, i.quantity - delivered - inTransit);
            
            return {
                ...i,
                quantity: remaining, 
                _max: remaining,     
                _ordered: i.quantity,
                _delivered: delivered,
                _inTransit: inTransit
            };
        }).filter(i => i._max && i._max > 0); 
        
        setItems(pendingItems);
        
        if (pendingItems.length === 0) {
            showNotification('Đơn hàng này đã được lên lịch giao hết (hoặc đã hoàn tất).', 'info');
        }
    };

    const handleQuantityChange = (id: string, qty: number) => {
        setItems(prev => prev.map(i => {
            if (i.id === id) {
                const max = i._max !== undefined ? i._max : 999999;
                const safeQty = Math.min(Math.max(0, qty), max);
                return { ...i, quantity: safeQty };
            }
            return i;
        }));
    };

    const handleRemoveItem = (id: string) => {
        setItems(prev => prev.filter(i => i.id !== id));
    };

    const filteredOrders = useMemo(() => {
        if (selectedOrder) return [];
        let candidates = orders.filter(o => 
            o.fulfillmentStatus !== 'Delivered' && 
            o.status !== 'Cancelled'
        );

        if (orderSearch) {
            const lower = orderSearch.toLowerCase();
            candidates = candidates.filter(o => 
                o.code.toLowerCase().includes(lower) || 
                o.customerName.toLowerCase().includes(lower)
            );
        }
        return candidates.slice(0, 20);
    }, [orders, orderSearch, selectedOrder]);

    const subTotalValue = useMemo(() => {
        return items.reduce((sum, item) => sum + (item.quantity * (item.price || 0)), 0);
    }, [items]);

    const vatRate = selectedOrder ? (selectedOrder.vatRate || 0) : 0;
    const vatAmount = Math.round(subTotalValue * (vatRate / 100));
    const totalValue = subTotalValue + vatAmount;

    const creditHealth = useMemo(() => {
        if (!orderPartner) return null;
        const currentDebt = orderPartner.debt || 0;
        const limit = orderPartner.debtLimit || 0;
        if (limit <= 0) return { status: 'ok', ratio: 0, message: 'Không giới hạn' };
        const newTotalDebt = currentDebt + totalValue; 
        const ratio = (newTotalDebt / limit) * 100;
        if (newTotalDebt > limit) return { status: 'danger', ratio, message: `Vượt hạn mức! (Dư nợ dự kiến: ${formatCurrency(newTotalDebt)})` };
        if (ratio > 80) return { status: 'warning', ratio, message: 'Sắp chạm trần nợ' };
        return { status: 'ok', ratio, message: 'Tín dụng tốt' };
    }, [orderPartner, totalValue]);

    const handleSubmit = async () => {
        if (items.length === 0) {
            showNotification('Vui lòng chọn ít nhất 1 sản phẩm để giao', 'error');
            return;
        }
        if (creationMode === 'manual' && !manualCustomer.name) {
            showNotification('Vui lòng nhập tên khách hàng', 'error');
            return;
        }

        if (creditHealth?.status === 'danger') {
            showNotification(`CHẶN GIAO HÀNG: Khách hàng vượt hạn mức tín dụng (${formatCurrency(orderPartner?.debtLimit)}). Vui lòng thu nợ trước.`, 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const code = `PGH-${Date.now().toString().slice(-6)}`;
            const cleanItems = items.map(({ _max, _ordered, _delivered, _inTransit, ...rest }) => ({
                ...rest,
                total: rest.quantity * rest.price 
            }));

            const deliveryData: Partial<DeliveryNote> = {
                code,
                date: date, 
                orderCode: selectedOrder ? selectedOrder.code : 'GIAO-LE',
                orderId: selectedOrder?.id,
                customerName: selectedOrder ? selectedOrder.customerName : manualCustomer.name,
                address: selectedOrder ? (selectedOrder.address || '') : manualCustomer.address,
                shipperName,
                shipperPhone,
                notes,
                items: cleanItems,
                status: 'Pending',
                subtotal: subTotalValue,
                total: totalValue,
                vatRate: vatRate,
                vatAmount: vatAmount,
                discount: 0
            };

            let newId = '';
            if (selectedOrder) {
                newId = await finalizeOrderWithDelivery(selectedOrder.id, deliveryData);
            } else {
                newId = await addDeliveryNote(deliveryData);
            }

            if (onSuccess) onSuccess(newId);
            onClose();
        } catch (error: any) {
            showNotification(error.message || 'Lỗi khi tạo phiếu giao', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Lập Phiếu Giao Hàng"
            size="lg"
            footer={
                <div className="flex justify-between items-center w-full">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Giá trị phiếu (gồm VAT)</span>
                        <span className="text-xl font-black text-slate-900 dark:text-white">{formatCurrency(totalValue)}</span>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                        <Button variant="primary" onClick={handleSubmit} loading={isSubmitting} icon="local_shipping" className={creditHealth?.status === 'danger' ? 'bg-slate-400 cursor-not-allowed opacity-50' : 'bg-blue-600'}>
                            Xác nhận tạo phiếu
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="space-y-6">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-4">
                    <div className="col-span-2 flex bg-white dark:bg-slate-800 p-1 rounded-xl shadow-sm">
                        <button 
                            onClick={() => { setCreationMode('order'); setSelectedOrder(null); setItems([]); }}
                            className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${creationMode === 'order' ? 'bg-blue-50 text-blue-600' : 'text-slate-400'}`}
                        >
                            Theo đơn hàng
                        </button>
                        <button 
                            onClick={() => { setCreationMode('manual'); setSelectedOrder(null); setItems([]); }}
                            className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-2 ${creationMode === 'manual' ? 'bg-blue-50 text-blue-600' : 'text-slate-400'}`}
                        >
                            Giao lẻ (Ngoài đơn)
                            <span className="bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded text-[8px] font-black border border-orange-200">BETA</span>
                        </button>
                    </div>

                    {creationMode === 'order' ? (
                        <div className="col-span-2 relative">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Chọn đơn hàng cần giao</label>
                            {selectedOrder ? (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900/30 rounded-xl animate-fadeIn">
                                        <div>
                                            <p className="font-black text-blue-600 text-sm">{selectedOrder.code}</p>
                                            <p className="text-xs text-slate-500">{selectedOrder.customerName}</p>
                                        </div>
                                        <button onClick={() => { setSelectedOrder(null); setItems([]); setOrderSearch(''); }} className="size-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
                                            <span className="material-symbols-outlined text-[18px]">close</span>
                                        </button>
                                    </div>
                                    
                                    {creditHealth && (
                                        <div className={`p-2 rounded-lg border flex items-center gap-2 text-xs font-bold ${
                                            creditHealth.status === 'danger' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                                            creditHealth.status === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                            'bg-emerald-50 border-emerald-200 text-emerald-700'
                                        }`}>
                                            <span className="material-symbols-outlined text-[16px]">
                                                {creditHealth.status === 'danger' ? 'block' : creditHealth.status === 'warning' ? 'warning' : 'verified_user'}
                                            </span>
                                            {creditHealth.message}
                                            {creditHealth.status === 'danger' && <span className="ml-auto text-[9px] bg-white px-1.5 py-0.5 rounded uppercase border border-rose-200">Bị chặn</span>}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <SearchInput 
                                        value={orderSearch} 
                                        onChange={setOrderSearch} 
                                        placeholder="Tìm mã đơn, khách hàng..." 
                                    />
                                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm max-h-[220px] overflow-y-auto custom-scrollbar animate-fadeIn">
                                        {filteredOrders.length > 0 ? (
                                            <>
                                                {filteredOrders.map(o => (
                                                    <button 
                                                        key={o.id}
                                                        onClick={() => handleSelectOrder(o)}
                                                        className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800 last:border-0 flex justify-between items-center group transition-colors"
                                                    >
                                                        <div>
                                                            <p className="font-bold text-sm text-slate-700 dark:text-slate-200 group-hover:text-blue-600 transition-colors">{o.code}</p>
                                                            <p className="text-xs text-slate-500">{o.customerName}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-500 block mb-1">{o.date}</span>
                                                            <span className="text-[9px] font-black text-orange-500">{o.fulfillmentStatus === 'Shipped' ? 'Đang giao' : 'Chưa giao'}</span>
                                                        </div>
                                                    </button>
                                                ))}
                                                <div className="p-2 text-center text-[9px] text-slate-400 italic bg-slate-50 dark:bg-slate-800/50">
                                                    Hiển thị {filteredOrders.length} đơn hàng gần nhất
                                                </div>
                                            </>
                                        ) : (
                                            <div className="p-8 text-center text-slate-400">
                                                <span className="material-symbols-outlined text-3xl mb-1">inbox</span>
                                                <p className="text-xs font-bold">Không tìm thấy đơn cần giao</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="col-span-2 grid grid-cols-2 gap-4">
                            <FormField label="Tên khách hàng">
                                <div className="relative" ref={partnerInputRef}>
                                    <FormInput 
                                        value={manualCustomer.name} 
                                        onChange={e => { 
                                            setManualCustomer({...manualCustomer, name: e.target.value}); 
                                            setPartnerSearch(e.target.value); 
                                            setIsPartnerDropdownOpen(true); 
                                        }}
                                        onFocus={() => setIsPartnerDropdownOpen(true)}
                                        placeholder="Nhập tên..." 
                                    />
                                    {isPartnerDropdownOpen && filteredPartners.length > 0 && (
                                        <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                                            {filteredPartners.map(p => (
                                                <div 
                                                    key={p.id} 
                                                    onClick={() => handleSelectPartner(p)}
                                                    className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-0"
                                                >
                                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{p.name}</p>
                                                    <p className="text-[10px] text-slate-400">{p.phone}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </FormField>
                            <FormField label="Số điện thoại">
                                <FormInput value={manualCustomer.phone} onChange={e => setManualCustomer({...manualCustomer, phone: e.target.value})} placeholder="SĐT..." />
                            </FormField>
                            <FormField label="Địa chỉ giao" className="col-span-2">
                                <FormInput value={manualCustomer.address} onChange={e => setManualCustomer({...manualCustomer, address: e.target.value})} placeholder="Địa chỉ..." />
                            </FormField>
                        </div>
                    )}

                    <FormField label="Ngày giao">
                        <FormInput type="date" value={date} onChange={e => setDate(e.target.value)} />
                    </FormField>
                    <FormField label="Shipper (Nếu có)">
                        <FormInput value={shipperName} onChange={e => setShipperName(e.target.value)} placeholder="Tên nhân viên..." />
                    </FormField>
                </div>

                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex justify-between">
                        <span>Danh sách hàng hóa</span>
                        {creationMode === 'order' && items.length > 0 && (
                            <div className="flex items-center gap-2">
                                {vatRate > 0 && (
                                    <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-[9px] font-bold">VAT {vatRate}%</span>
                                )}
                                <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-[9px]">Giao {items.reduce((s, i) => s + i.quantity, 0)} sản phẩm</span>
                            </div>
                        )}
                    </h4>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">Sản phẩm</th>
                                    <th className="px-4 py-3 text-center w-24">Tiến độ</th>
                                    <th className="px-4 py-3 text-center w-24">Cần giao</th>
                                    <th className="px-4 py-3 text-right">Thành tiền</th>
                                    <th className="px-4 py-3 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {items.length > 0 ? items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-3">
                                            <p className="font-bold text-slate-800 dark:text-white truncate max-w-[250px]">{item.productName}</p>
                                            <p className="text-[10px] font-mono text-slate-400">{item.sku}</p>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {creationMode === 'order' ? (
                                                <div className="flex flex-col items-center">
                                                    <span className="text-xs font-bold text-slate-500">{item._delivered}/{item._ordered}</span>
                                                    {item._inTransit ? <span className="text-[8px] text-orange-500 font-bold">({item._inTransit} đang giao)</span> : null}
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-slate-400">---</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col items-center">
                                                <NumericInput 
                                                    value={item.quantity} 
                                                    onChange={v => handleQuantityChange(item.id, v)} 
                                                    className="h-8 text-center font-bold bg-slate-50 border-slate-200 focus:border-blue-500 text-blue-600"
                                                />
                                                {item._max !== undefined && (
                                                    <span className="text-[8px] text-slate-400 mt-0.5">Tối đa: {item._max}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-300">
                                            {formatCurrency(item.quantity * item.price)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button onClick={() => handleRemoveItem(item.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                                                <span className="material-symbols-outlined text-[18px]">close</span>
                                            </button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic text-xs">
                                            {creationMode === 'order' ? 'Chọn đơn hàng để tải danh sách sản phẩm' : 'Chức năng giao lẻ đang phát triển (Tạm thời chỉ hỗ trợ giao theo đơn)'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <FormField label="Ghi chú giao hàng">
                    <FormTextarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Lưu ý cho shipper, thời gian giao..." />
                </FormField>
            </div>
        </Modal>
    );
};

export const PrintDeliveryModal: React.FC<{ isOpen: boolean, onClose: () => void, data: DeliveryNote | null }> = ({ isOpen, onClose, data }) => {
    if (!data) return null;
    return (
        <GenericPrintModal
            isOpen={isOpen}
            onClose={onClose}
            title={`Phiếu Giao Hàng ${data.code}`}
            filename={`PhieuGiao_${data.code}`}
            data={data}
        />
    );
};
