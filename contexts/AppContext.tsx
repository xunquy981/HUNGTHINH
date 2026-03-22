
import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../services/db';
import { ReconcileIssue } from '../types';
import { useSettings } from './SettingsContext';
import { useNotification } from './NotificationContext';

interface AppContextType {
    currentUser: { id: string, name: string };
    updateCurrentUser: (name: string) => Promise<void>;
    
    resetSystem: () => Promise<void>;
    generateDebugBundle: () => Promise<string>;
    reconcileData: () => Promise<ReconcileIssue[]>;
    fixDataIssues: (issues: ReconcileIssue[]) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState({ id: 'admin', name: 'Admin User' });
    const { settings } = useSettings();
    const { showNotification } = useNotification();

    useEffect(() => {
        const init = async () => {
            try {
                const user = localStorage.getItem('erp_user');
                if (user) setCurrentUser(JSON.parse(user));
            } catch (e) {
                console.error("Initialization failed", e);
            }
        };
        init();
    }, []);

    const updateCurrentUser = async (name: string) => {
        const newUser = { ...currentUser, name };
        setCurrentUser(newUser);
        localStorage.setItem('erp_user', JSON.stringify(newUser));
    };

    const resetSystem = async () => {
        await (db as any).delete();
        await (db as any).open();
        window.location.reload();
    };

    const generateDebugBundle = async () => {
        const logs = await db.errorLogs.toArray();
        return JSON.stringify(logs, null, 2);
    };
    
    const reconcileData = async (): Promise<ReconcileIssue[]> => {
        const issues: ReconcileIssue[] = [];
        
        const partners = await db.partners.toArray();
        for (const p of partners) {
            const debts = await db.debtRecords.where('partnerId').equals(p.id).filter(d => d.remainingAmount > 0 && d.status !== 'Void').toArray();
            const calculatedDebt = debts.reduce((sum, d) => sum + d.remainingAmount, 0);
            
            if (Math.abs((p.debt || 0) - calculatedDebt) > 1000) {
                issues.push({
                    type: 'Data',
                    severity: 'High',
                    message: `Lệch công nợ đối tác ${p.name}: Hồ sơ (${p.debt}) != Tổng phiếu nợ (${calculatedDebt})`,
                    entityId: p.id,
                    entityType: 'Partner',
                    suggestedFix: 'Cập nhật lại tổng nợ trong hồ sơ',
                    autoFixable: true,
                    action: 'update_debt',
                    payload: { newDebt: calculatedDebt }
                });
            }
        }

        const products = await db.products.toArray();
        for (const p of products) {
            if (p.stock < 0) {
                issues.push({
                    type: 'Data',
                    severity: 'Medium',
                    message: `Sản phẩm ${p.name} đang âm kho (${p.stock})`,
                    entityId: p.id,
                    entityType: 'Product',
                    suggestedFix: 'Kiểm kê kho',
                    autoFixable: false
                });
            }
            if ((p.stockReserved || 0) < 0) {
                 issues.push({
                    type: 'Data',
                    severity: 'Low',
                    message: `Sản phẩm ${p.name} có số lượng giữ hàng âm (${p.stockReserved})`,
                    entityId: p.id,
                    entityType: 'Product',
                    suggestedFix: 'Reset về 0',
                    autoFixable: true,
                    action: 'fix_reserved'
                });
            }
        }

        return issues;
    };

    const fixDataIssues = async (issues: ReconcileIssue[]) => {
        await (db as any).transaction('rw', [db.partners, db.products], async () => {
            for (const issue of issues) {
                if (issue.action === 'update_debt' && issue.entityId) {
                    await db.partners.update(issue.entityId, { debt: issue.payload.newDebt });
                }
                if (issue.action === 'fix_reserved' && issue.entityId) {
                    await db.products.update(issue.entityId, { stockReserved: 0 });
                }
            }
        });
    };

    return (
        <AppContext.Provider value={{
            currentUser, updateCurrentUser,
            resetSystem, generateDebugBundle, reconcileData, fixDataIssues
        }}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};
