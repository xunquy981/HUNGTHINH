import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../services/db';
import { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
    general: { name: 'Hưng Thịnh Bearing', taxId: '', phone: '', email: '', website: '', address: '', logo: '' },
    finance: { currency: 'VND', vat: 8, printInvoice: true, roundingRule: '500', defaultMarkupRate: 1.3 },
    system: { orderPrefix: 'DH', importPrefix: 'PN', quotePrefix: 'BG', returnPrefix: 'TH', minStockDefault: 5, debtDueDays: 30, autoLockDays: 7, preventNegativeStock: false },
    appearance: { theme: 'light', density: 'comfortable', primaryColor: 'indigo', fontSize: 14 },
    ai: { enabled: true, apiKey: '', analysisDepth: 'standard', personality: 'professional', autoCategorization: true },
    documents: {
        order: { title: 'HÓA ĐƠN BÁN HÀNG', footerNote: 'Cảm ơn quý khách!', signatures: ['Người lập', 'Khách hàng'], sections: [], columns: [], colorTheme: '#1e3a8a' },
        quote: { title: 'BÁO GIÁ', footerNote: 'Báo giá có giá trị 7 ngày.', signatures: ['Người lập'], sections: [], columns: [], colorTheme: '#1e3a8a' },
        import: { title: 'PHIẾU NHẬP KHO', footerNote: '', signatures: ['Thủ kho', 'Người giao'], sections: [], columns: [], colorTheme: '#1e3a8a' },
        delivery: { title: 'PHIẾU GIAO HÀNG', footerNote: 'Vui lòng kiểm tra kỹ hàng hóa.', signatures: ['Người giao', 'Người nhận'], sections: [], columns: [], colorTheme: '#1e3a8a' }
    }
};

interface SettingsContextType {
    settings: AppSettings;
    setSettings: (s: AppSettings) => Promise<void>;
    toggleTheme: () => void;
    isInitialized: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        const init = async () => {
            try {
                const storedSettings = await db.settings.get('app_settings');
                if (storedSettings && storedSettings.value) {
                    // Merge with DEFAULT_SETTINGS to ensure all properties exist
                    const mergedSettings = {
                        ...DEFAULT_SETTINGS,
                        ...storedSettings.value,
                        general: { ...DEFAULT_SETTINGS.general, ...(storedSettings.value.general || {}) },
                        finance: { ...DEFAULT_SETTINGS.finance, ...(storedSettings.value.finance || {}) },
                        system: { ...DEFAULT_SETTINGS.system, ...(storedSettings.value.system || {}) },
                        appearance: { ...DEFAULT_SETTINGS.appearance, ...(storedSettings.value.appearance || {}) },
                        ai: { ...DEFAULT_SETTINGS.ai, ...(storedSettings.value.ai || {}) },
                        documents: { ...DEFAULT_SETTINGS.documents, ...(storedSettings.value.documents || {}) }
                    };
                    setSettingsState(mergedSettings);
                } else {
                    await db.settings.put({ key: 'app_settings', value: DEFAULT_SETTINGS });
                }
                setIsInitialized(true);
            } catch (e) {
                console.error("Settings initialization failed", e);
                setIsInitialized(true);
            }
        };
        init();
    }, []);

    const setSettings = async (newSettings: AppSettings) => {
        setSettingsState(newSettings);
        await db.settings.put({ key: 'app_settings', value: newSettings });
    };

    const toggleTheme = () => {
        const newTheme = settings.appearance.theme === 'light' ? 'dark' : 'light';
        const newSettings = { ...settings, appearance: { ...settings.appearance, theme: newTheme } };
        setSettings(newSettings as AppSettings);
    };

    return (
        <SettingsContext.Provider value={{
            settings, setSettings, toggleTheme, isInitialized
        }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};
