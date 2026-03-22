import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../services/db';
import { AppNotification, ToastMessage } from '../types';
import { generateUUID } from '../utils/helpers';

interface ConfirmOptions {
    title: string;
    message: string;
    type?: 'info' | 'warning' | 'danger';
    confirmLabel?: string;
    cancelLabel?: string;
}

interface NotificationContextType {
    notifications: AppNotification[];
    addNotifications: (n: Omit<AppNotification, 'id' | 'timestamp' | 'isDismissed'>[]) => Promise<void>;
    dismissNotification: (id: string) => void;
    clearAllNotifications: () => void;
    
    toasts: ToastMessage[];
    showNotification: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
    removeToast: (id: string) => void;
    
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    
    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        options: ConfirmOptions;
        resolve: (value: boolean) => void;
    } | null>(null);

    useEffect(() => {
        const loadNotifications = async () => {
            try {
                const notifs = await db.notifications.orderBy('timestamp').reverse().limit(50).toArray();
                setNotifications(notifs);
            } catch (e) {
                console.error("Failed to load notifications", e);
            }
        };
        loadNotifications();
    }, []);

    const addNotifications = async (items: Omit<AppNotification, 'id' | 'timestamp' | 'isDismissed'>[]) => {
        const newItems = items.map(item => ({
            ...item,
            id: generateUUID('notif'),
            timestamp: Date.now(),
            isDismissed: false
        } as AppNotification));
        
        await db.notifications.bulkAdd(newItems);
        setNotifications(prev => [...newItems, ...prev]);
        
        if (newItems.length > 0) {
            showNotification(newItems[0].title, newItems[0].severity as any);
        }
    };

    const dismissNotification = async (id: string) => {
        await db.notifications.update(id, { isDismissed: true });
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isDismissed: true } : n));
    };

    const clearAllNotifications = async () => {
        const ids = notifications.map(n => n.id);
        await db.notifications.where('id').anyOf(ids).modify({ isDismissed: true });
        setNotifications(prev => prev.map(n => ({ ...n, isDismissed: true })));
    };

    const showNotification = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, message, type, duration: 4000 }]);
    };

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const confirm = (options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfirmState({ isOpen: true, options, resolve });
        });
    };

    const handleConfirmClose = (result: boolean) => {
        if (confirmState) {
            confirmState.resolve(result);
            setConfirmState(null);
        }
    };

    return (
        <NotificationContext.Provider value={{
            notifications, addNotifications, dismissNotification, clearAllNotifications,
            toasts, showNotification, removeToast,
            confirm
        }}>
            {children}
            {confirmState && (
                <div className="fixed inset-0 z-alert flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-scaleIn border border-slate-200 dark:border-slate-800">
                        <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">{confirmState.options.title}</h3>
                        <p className="text-sm text-slate-500 mb-6">{confirmState.options.message}</p>
                        <div className="flex gap-3">
                            <button onClick={() => handleConfirmClose(false)} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs">{confirmState.options.cancelLabel || 'Hủy'}</button>
                            <button onClick={() => handleConfirmClose(true)} className={`flex-1 py-3 rounded-xl text-white font-bold text-xs ${confirmState.options.type === 'danger' ? 'bg-red-600' : 'bg-blue-600'}`}>{confirmState.options.confirmLabel || 'Đồng ý'}</button>
                        </div>
                    </div>
                </div>
            )}
        </NotificationContext.Provider>
    );
};

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (context === undefined) {
        throw new Error('useNotification must be used within a NotificationProvider');
    }
    return context;
};
