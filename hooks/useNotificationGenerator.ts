
import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';
import { useNotification } from '../contexts/NotificationContext';
import { getDaysDiff, parseDate, formatCurrency } from '../utils/helpers';
import { AppNotification } from '../types';

export const useNotificationGenerator = () => {
    const { addNotifications } = useNotification();

    // 1. Monitor Overdue Debts (Optimized)
    const overdueDebts = useLiveQuery(() => 
        db.debtRecords
            .where('status').equals('Overdue')
            .filter(d => d.remainingAmount > 0 && d.type === 'Receivable')
            .toArray()
    );

    useEffect(() => {
        if (!overdueDebts || overdueDebts.length === 0) return;
        
        const checkAndNotify = async () => {
            const newNotifs: Omit<AppNotification, 'id' | 'timestamp' | 'isDismissed'>[] = [];
            const sourceIds = overdueDebts.map(d => `overdue-debt-${d.id}`);
            
            // Batch check for existing notifications
            const existing = await db.notifications.where('sourceId').anyOf(sourceIds).toArray();
            const existingSet = new Set(existing.map(n => n.sourceId));

            for (const debt of overdueDebts) {
                const sourceId = `overdue-debt-${debt.id}`;
                if (!existingSet.has(sourceId)) {
                    newNotifs.push({
                        type: 'debt',
                        severity: 'danger',
                        title: 'Khoản nợ quá hạn nguy cấp!',
                        message: `Khách hàng ${debt.partnerName} vẫn chưa tất toán ${formatCurrency(debt.remainingAmount)} (Đơn: ${debt.orderCode}).`,
                        link: { view: 'DEBTS', params: { highlightId: debt.id } },
                        sourceId: sourceId
                    });
                }
            }

            if (newNotifs.length > 0) {
                await addNotifications(newNotifs);
            }
        };
        
        checkAndNotify();
    }, [overdueDebts, addNotifications]);

    // 2. Monitor Debts Due Soon
    const soonDebts = useLiveQuery(async () => {
        const allDebts = await db.debtRecords
            .where('type').equals('Receivable')
            .filter(d => d.remainingAmount > 0 && d.status !== 'Overdue')
            .toArray();

        return allDebts.filter(d => {
            const days = getDaysDiff(parseDate(d.dueDate));
            return days >= -3 && days <= 0;
        });
    });

    useEffect(() => {
        if (!soonDebts || soonDebts.length === 0) return;

        const checkAndNotify = async () => {
            const newNotifs: Omit<AppNotification, 'id' | 'timestamp' | 'isDismissed'>[] = [];
            const sourceIds = soonDebts.map(d => `due-soon-debt-${d.id}`);
            
            const existing = await db.notifications.where('sourceId').anyOf(sourceIds).toArray();
            const existingSet = new Set(existing.map(n => n.sourceId));

            for (const debt of soonDebts) {
                const sourceId = `due-soon-debt-${debt.id}`;
                if (!existingSet.has(sourceId)) {
                    newNotifs.push({
                        type: 'debt',
                        severity: 'warning',
                        title: 'Sắp đến hạn thu nợ',
                        message: `Khoản thu ${formatCurrency(debt.remainingAmount)} từ ${debt.partnerName} sẽ đến hạn vào ${debt.dueDate}.`,
                        link: { view: 'DEBTS', params: { highlightId: debt.id } },
                        sourceId: sourceId
                    });
                }
            }

            if (newNotifs.length > 0) {
                await addNotifications(newNotifs);
            }
        };

        checkAndNotify();
    }, [soonDebts, addNotifications]);

    // 3. Monitor Stuck Orders
    const stuckOrders = useLiveQuery(async () => {
        const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
        return await db.orders
            .where('status').equals('Processing')
            .filter(o => !o.isDeleted && o.createdAt < fortyEightHoursAgo)
            .toArray();
    });

    useEffect(() => {
        if (!stuckOrders || stuckOrders.length === 0) return;

        const checkAndNotify = async () => {
            const newNotifs: Omit<AppNotification, 'id' | 'timestamp' | 'isDismissed'>[] = [];
            const sourceIds = stuckOrders.map(o => `stuck-order-${o.id}`);
            
            const existing = await db.notifications.where('sourceId').anyOf(sourceIds).toArray();
            const existingSet = new Set(existing.map(n => n.sourceId));

            for (const order of stuckOrders) {
                const sourceId = `stuck-order-${order.id}`;
                if (!existingSet.has(sourceId)) {
                    newNotifs.push({
                        type: 'system',
                        severity: 'info',
                        title: 'Đơn hàng đang xử lý lâu',
                        message: `Đơn ${order.code} của ${order.customerName} đã ở trạng thái "Đang soạn" hơn 48h.`,
                        link: { view: 'ORDERS', params: { highlightId: order.id } },
                        sourceId: sourceId
                    });
                }
            }

            if (newNotifs.length > 0) {
                await addNotifications(newNotifs);
            }
        };

        checkAndNotify();
    }, [stuckOrders, addNotifications]);
};
