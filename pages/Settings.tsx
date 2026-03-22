
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppSettings, DocTypeConfig, ViewState } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNotification } from '../contexts/NotificationContext';
import { exportBackup, parseBackupFile, restoreBackup } from '../services/backup';
import { seedDatabase } from '../services/seedData';
import { Button } from '../components/ui/Primitives';
import { FormInput, NumericInput, FormField, FormTextarea } from '../components/ui/Form';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { TemplateEditor } from '../components/print/TemplateEditor';
import AuditLogs from './AuditLogs';
import SystemLogs from './SystemLogs';
import { db } from '../services/db';
import { APP_VERSION, APP_NAME } from '../constants/versions';

type SettingSection = 'general' | 'finance' | 'system' | 'data' | 'ai' | 'print' | 'audit' | 'logs';

const ToggleSwitch = ({ checked, onChange, label, description }: { checked: boolean, onChange: (val: boolean) => void, label: string, description?: string }) => (
    <div className="flex items-center justify-between py-4 px-1 group cursor-pointer" onClick={() => onChange(!checked)}>
        <div className="flex-1 pr-4">
            <label className="text-sm font-bold text-slate-900 dark:text-white cursor-pointer group-hover:text-blue-600 transition-colors">{label}</label>
            {description && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug font-medium">{description}</p>}
        </div>
        <div className={`relative w-12 h-7 rounded-full transition-all duration-300 ${checked ? 'bg-blue-600 shadow-inner' : 'bg-slate-200 dark:bg-slate-700'}`}>
            <span className={`absolute top-1 left-1 bg-white rounded-full size-5 shadow-sm transition-all duration-300 ${checked ? 'translate-x-5' : 'translate-x-0'}`}></span>
        </div>
    </div>
);

const SectionHeader = ({ title, description, icon }: { title: string, description: string, icon: string }) => (
    <div className="mb-8 animate-fadeIn">
        <div className="flex items-center gap-4 mb-2">
            <div className="size-12 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <span className="material-symbols-outlined text-[28px]">{icon}</span>
            </div>
            <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{title}</h2>
            </div>
        </div>
        <p className="text-sm text-slate-500 font-medium pl-16 max-w-2xl">{description}</p>
    </div>
);

const Settings: React.FC = () => {
    const { resetSystem, currentUser, updateCurrentUser } = useAppContext();
    const { settings, setSettings } = useSettings();
    const { showNotification, confirm } = useNotification();
    const [activeSection, setActiveSection] = useState<SettingSection>('general');
    const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
    const [localUserName, setLocalUserName] = useState(currentUser.name);
    
    const [isDirty, setIsDirty] = useState(false);
    
    const [backupAnalysis, setBackupAnalysis] = useState<any>(null);
    const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<{type: string, config: DocTypeConfig} | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    // Check for API Key presence
    const hasApiKey = !!process.env.API_KEY;

    const handleInternalNavigate = (view: ViewState, params?: any) => {
        let path = '/';
        switch (view) {
            case 'DASHBOARD': path = '/'; break;
            case 'POS': path = '/pos'; break;
            case 'ORDERS': path = '/orders'; break;
            case 'QUOTES': path = '/quotes'; break;
            case 'DELIVERY_NOTES': path = '/deliveries'; break;
            case 'IMPORTS': path = '/imports'; break;
            case 'INVENTORY': path = '/inventory'; break;
            case 'PARTNERS': path = '/partners'; break;
            case 'DEBTS': path = '/debts'; break;
            case 'TRANSACTIONS': path = '/transactions'; break;
            case 'REPORTS': path = '/reports'; break;
            case 'SETTINGS': path = '/settings'; break;
            default: path = '/';
        }
        navigate(path, { state: params });
    };

    useEffect(() => {
        setIsDirty(
            JSON.stringify(settings) !== JSON.stringify(localSettings) || 
            currentUser.name !== localUserName
        );
    }, [localSettings, settings, localUserName, currentUser]);

    const handleSave = async () => {
        await setSettings(localSettings);
        if (currentUser.name !== localUserName) {
            await updateCurrentUser(localUserName);
        }
        setIsDirty(false);
        showNotification('Hệ thống đã cập nhật cấu hình mới', 'success');
    };

    const handleSeedData = async () => {
        const ok = await confirm({
            title: 'Khởi tạo dữ liệu mẫu?',
            message: 'Hệ thống sẽ xóa toàn bộ dữ liệu hiện tại và thay thế bằng bộ dữ liệu kiểm thử (Mock Data). Bạn có chắc chắn không?',
            type: 'warning',
            confirmLabel: 'Đồng ý Reset & Tạo'
        });

        if (ok) {
            try {
                await seedDatabase();
                showNotification('Đã khởi tạo dữ liệu mẫu thành công. Đang tải lại...', 'success');
                setTimeout(() => window.location.reload(), 1500);
            } catch (e) {
                showNotification('Lỗi khi tạo dữ liệu mẫu', 'error');
            }
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        try {
            const analysis = await parseBackupFile(file);
            setBackupAnalysis(analysis);
            if (!analysis.isValid) {
                const errorMsg = analysis.errors.join('\n');
                await confirm({ title: 'File Backup Không Hợp Lệ', message: errorMsg, type: 'danger', confirmLabel: 'Đã hiểu' });
                return;
            }
            setIsRestoreModalOpen(true);
        } catch (err: any) { showNotification(err.message, 'error'); }
    };

    const handleRunRestore = async (mode: 'replace' | 'merge') => {
        if (!backupAnalysis) return;
        try {
            await restoreBackup(backupAnalysis.correctedData, mode);
            showNotification('Khôi phục dữ liệu thành công. Đang tải lại ứng dụng...', 'success');
            setIsRestoreModalOpen(false);
            setTimeout(() => window.location.reload(), 1500);
        } catch (e) { showNotification('Lỗi nghiêm trọng khi khôi phục dữ liệu.', 'error'); }
    };

    const handleClearOldLogs = async () => {
        const ok = await confirm({ title: 'Dọn dẹp dữ liệu rác?', message: 'Hệ thống sẽ xóa các nhật ký lỗi, lịch sử truy vết cũ hơn 90 ngày và các thông báo đã đọc.', type: 'info', confirmLabel: 'Dọn dẹp ngay' });
        if (ok) {
            try {
                const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
                await (db as any).transaction('rw', [db.auditLogs, db.errorLogs, db.notifications, db.aiCache], async () => {
                    const oldAudit = await db.auditLogs.where('createdAt').below(ninetyDaysAgo).primaryKeys();
                    await db.auditLogs.bulkDelete(oldAudit as any);
                    const oldErrors = await db.errorLogs.where('timestamp').below(ninetyDaysAgo).primaryKeys();
                    await db.errorLogs.bulkDelete(oldErrors as any);
                    await db.notifications.filter(n => n.isDismissed).delete();
                    await db.aiCache.clear();
                });
                showNotification('Đã dọn dẹp hệ thống thành công!', 'success');
            } catch (e) { showNotification('Lỗi khi dọn dẹp dữ liệu.', 'error'); }
        }
    };

    const navItems: { id: SettingSection, label: string, icon: string }[] = [
        { id: 'general', label: 'Thông tin chung', icon: 'storefront' },
        { id: 'finance', label: 'Tài chính & Thuế', icon: 'account_balance' },
        { id: 'system', label: 'Hệ thống', icon: 'tune' },
        { id: 'print', label: 'Mẫu in ấn', icon: 'print' },
        { id: 'ai', label: 'Trí tuệ nhân tạo', icon: 'psychology' },
        { id: 'data', label: 'Dữ liệu & Backup', icon: 'database' },
        { id: 'audit', label: 'Nhật ký truy vết', icon: 'history_edu' },
        { id: 'logs', label: 'Chẩn đoán lỗi', icon: 'monitor_heart' },
    ];

    const isFullPageView = activeSection === 'audit' || activeSection === 'logs';

    return (
        <div className="flex h-full w-full bg-slate-50 dark:bg-slate-950 overflow-hidden animate-premium">
            
            {/* SIDEBAR NAVIGATION */}
            <div className="w-72 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-20 h-full">
                <div className="p-8 pb-4 shrink-0">
                    <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Cấu hình</h1>
                    <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">System Control Center</p>
                </div>
                <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar py-4">
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveSection(item.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[13px] font-bold transition-all duration-300 group ${
                                activeSection === item.id 
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-blue-500/10' 
                                : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <span className={`material-symbols-outlined text-[20px] transition-transform group-hover:scale-110 ${activeSection === item.id ? 'filled-icon' : ''}`}>{item.icon}</span>
                            {item.label}
                            {activeSection === item.id && <span className="ml-auto material-symbols-outlined text-[16px]">chevron_right</span>}
                        </button>
                    ))}
                </nav>
                <div className="p-6 shrink-0">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="size-8 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-[10px] shadow-lg shadow-emerald-500/30">V3</div>
                            <div>
                                <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase">{APP_NAME}</p>
                                <p className="text-[10px] text-slate-500">Phiên bản Pro {APP_VERSION}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 relative flex flex-col h-full min-w-0 bg-slate-50/50 dark:bg-slate-900/20">
                {isFullPageView ? (
                    activeSection === 'audit' ? <AuditLogs onNavigate={handleInternalNavigate} /> : <SystemLogs />
                ) : (
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-8 lg:p-12 pb-32">
                        <div className="max-w-5xl mx-auto">
                            
                            {/* GENERAL SETTINGS */}
                            {activeSection === 'general' && (
                                <>
                                    <SectionHeader title="Thông tin doanh nghiệp" description="Thông tin hiển thị trên các chứng từ, hóa đơn và báo cáo." icon="storefront" />
                                    <div className="grid grid-cols-12 gap-8 animate-fadeIn">
                                        <div className="col-span-12 lg:col-span-8 space-y-6">
                                            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                                                <FormField label="Tên hiển thị (Thương hiệu)">
                                                    <FormInput 
                                                        value={localSettings.general.name} 
                                                        onChange={e => setLocalSettings({...localSettings, general: {...localSettings.general, name: e.target.value.toUpperCase()}})} 
                                                        className="font-black text-lg h-14 uppercase" 
                                                        placeholder="TÊN DOANH NGHIỆP"
                                                        icon="store"
                                                    />
                                                </FormField>
                                                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                                                    <FormField label="Tên người quản trị (Hiển thị Dashboard)">
                                                        <FormInput 
                                                            value={localUserName} 
                                                            onChange={e => setLocalUserName(e.target.value)} 
                                                            className="h-12 font-bold" 
                                                            placeholder="VD: Sếp XunQuy"
                                                            icon="account_circle"
                                                        />
                                                    </FormField>
                                                </div>
                                                <div className="grid grid-cols-2 gap-6">
                                                    <FormField label="Hotline / SĐT"><FormInput value={localSettings.general.phone} onChange={e => setLocalSettings({...localSettings, general: {...localSettings.general, phone: e.target.value}})} icon="call" /></FormField>
                                                    <FormField label="Mã số thuế"><FormInput value={localSettings.general.taxId} onChange={e => setLocalSettings({...localSettings, general: {...localSettings.general, taxId: e.target.value}})} icon="badge" /></FormField>
                                                </div>
                                                <FormField label="Địa chỉ trụ sở">
                                                    <FormTextarea value={localSettings.general.address} onChange={e => setLocalSettings({...localSettings, general: {...localSettings.general, address: e.target.value}})} className="bg-slate-50 dark:bg-slate-800 min-h-[80px]" icon="location_on" />
                                                </FormField>
                                            </div>
                                        </div>
                                        <div className="col-span-12 lg:col-span-4">
                                            <div className="sticky top-6">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Xem trước (Preview)</p>
                                                <div className="bg-white shadow-xl p-6 rounded-3xl border border-slate-100 relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-[4rem]"></div>
                                                    <div className="relative z-10 flex flex-col items-center text-center">
                                                        <div className="size-20 bg-slate-50 rounded-2xl border border-slate-200 mb-4 flex items-center justify-center overflow-hidden">
                                                            {localSettings.general.logo ? <img src={localSettings.general.logo} className="w-full h-full object-contain" /> : <span className="material-symbols-outlined text-slate-300 text-3xl">store</span>}
                                                        </div>
                                                        <h3 className="font-black text-slate-900 uppercase leading-tight mb-1">{localSettings.general.name || 'Tên Doanh Nghiệp'}</h3>
                                                        <p className="text-[10px] text-slate-500 font-medium mb-4">{localSettings.general.address || 'Địa chỉ kinh doanh'}</p>
                                                        <div className="w-full h-px bg-slate-100 mb-4"></div>
                                                        <p className="text-xs font-bold text-blue-600">{localSettings.general.phone || '09xx xxx xxx'}</p>
                                                    </div>
                                                    <div className="mt-6">
                                                        <FormField label="Logo URL"><FormInput value={localSettings.general.logo} onChange={e => setLocalSettings({...localSettings, general: {...localSettings.general, logo: e.target.value}})} className="text-xs" placeholder="https://..." /></FormField>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeSection === 'finance' && (
                                <>
                                    <SectionHeader title="Tài chính & Ngân hàng" description="Quản lý thông tin thanh toán và các quy tắc làm tròn số." icon="account_balance" />
                                    <div className="space-y-8 animate-fadeIn">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                            <div className="bg-gradient-to-br from-slate-800 to-black p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden aspect-[1.58/1]">
                                                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                                                <div className="relative z-10 flex flex-col h-full justify-between">
                                                    <div className="flex justify-between items-start"><span className="material-symbols-outlined text-4xl opacity-80">contactless</span><p className="font-black text-lg uppercase tracking-widest opacity-60">Debit</p></div>
                                                    <div>
                                                        <p className="font-mono text-2xl tracking-widest shadow-black drop-shadow-md mb-2">{localSettings.general.bankAccount || '0000 0000 0000'}</p>
                                                        <div className="flex justify-between items-end"><div><p className="text-[9px] uppercase tracking-widest opacity-60 mb-0.5">Card Holder</p><p className="font-bold uppercase tracking-wider">{localSettings.general.bankOwner || 'YOUR NAME'}</p></div><p className="font-bold text-lg">{localSettings.general.bankName || 'BANK NAME'}</p></div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                                                <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2">Thông tin tài khoản</h3>
                                                <FormField label="Tên ngân hàng"><FormInput value={localSettings.general.bankName || ''} onChange={e => setLocalSettings({...localSettings, general: {...localSettings.general, bankName: e.target.value}})} placeholder="VD: Vietcombank" /></FormField>
                                                <FormField label="Số tài khoản"><FormInput value={localSettings.general.bankAccount || ''} onChange={e => setLocalSettings({...localSettings, general: {...localSettings.general, bankAccount: e.target.value}})} className="font-mono" /></FormField>
                                                <FormField label="Chủ tài khoản"><FormInput value={localSettings.general.bankOwner || ''} onChange={e => setLocalSettings({...localSettings, general: {...localSettings.general, bankOwner: e.target.value.toUpperCase()}})} className="uppercase" /></FormField>
                                            </div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm">
                                            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-6">Quy tắc tính toán</h3>
                                            <div className="grid grid-cols-2 gap-8">
                                                <div>
                                                    <label className="text-sm font-bold text-slate-900 dark:text-white block mb-3">Làm tròn tổng tiền đơn hàng</label>
                                                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl">
                                                        {['none', '500', '1000'].map((opt) => (
                                                            <button key={opt} onClick={() => setLocalSettings({...localSettings, finance: {...localSettings.finance, roundingRule: opt as any}})} className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${localSettings.finance.roundingRule === opt ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500'}`}>{opt === 'none' ? 'Chính xác' : opt}</button>
                                                        ))}
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 mt-2 pl-2">VD: 152,300đ {localSettings.finance.roundingRule === '1000' ? '→ 152,000đ' : localSettings.finance.roundingRule === '500' ? '→ 152,500đ' : ''}</p>
                                                </div>
                                                <FormField label="Thuế VAT Mặc định (%)"><div className="flex items-center gap-4"><NumericInput value={localSettings.finance.vat} onChange={v => setLocalSettings({...localSettings, finance: {...localSettings.finance, vat: v}})} className="h-12 text-2xl font-black text-center" /><span className="text-sm font-bold text-slate-500">Tự động áp dụng</span></div></FormField>
                                            </div>
                                            <div className="mt-8 border-t border-slate-100 dark:border-slate-700 pt-6">
                                                <h3 className="text-xs font-black uppercase text-rose-500 tracking-widest mb-4 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-lg">lock</span> Kế toán & Kiểm soát
                                                </h3>
                                                <div className="p-4 bg-rose-50 dark:bg-rose-900/10 rounded-2xl border border-rose-100 dark:border-rose-900/30">
                                                    <FormField label="Ngày khóa sổ kế toán (Không thể sửa đổi dữ liệu trước ngày này)">
                                                        <FormInput 
                                                            type="date" 
                                                            value={localSettings.finance.lockDate || ''} 
                                                            onChange={e => setLocalSettings({...localSettings, finance: {...localSettings.finance, lockDate: e.target.value}})} 
                                                            className="h-12 font-bold text-rose-600 bg-white" 
                                                        />
                                                    </FormField>
                                                    <p className="text-[10px] text-rose-600 mt-2 font-medium">Lưu ý: Sau khi lưu, toàn bộ giao dịch trước ngày này sẽ bị khóa chỉnh sửa/xóa.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeSection === 'system' && (
                                <>
                                    <SectionHeader title="Hệ thống & Quy tắc" description="Định dạng mã chứng từ và các quy tắc vận hành kho." icon="tune" />
                                    <div className="space-y-6 animate-fadeIn">
                                        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm">
                                            <div className="flex items-center gap-3 mb-6"><div className="size-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center"><span className="material-symbols-outlined">confirmation_number</span></div><div><h3 className="font-bold text-slate-900 dark:text-white">Mã tiền tố (Prefix)</h3><p className="text-xs text-slate-500">Định dạng mã cho các loại chứng từ</p></div></div>
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                                                {[ { label: 'Đơn bán', key: 'orderPrefix', color: 'blue' }, { label: 'Nhập kho', key: 'importPrefix', color: 'emerald' }, { label: 'Báo giá', key: 'quotePrefix', color: 'purple' }, { label: 'Trả hàng', key: 'returnPrefix', color: 'rose' } ].map((item) => (
                                                    <div key={item.key} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col h-full"><div className={`h-1.5 w-full bg-${item.color}-500`}></div><div className="p-4 flex-1 flex flex-col justify-center items-center"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{item.label}</p><div className={`relative w-full`}><input value={localSettings.system[item.key as keyof typeof localSettings.system] as string} onChange={e => setLocalSettings({...localSettings, system: {...localSettings.system, [item.key]: e.target.value.toUpperCase()}})} className={`w-full bg-${item.color}-50 dark:bg-${item.color}-900/10 border-2 border-transparent focus:border-${item.color}-500 rounded-xl text-center font-mono font-black text-2xl py-3 uppercase text-${item.color}-600 dark:text-${item.color}-400 outline-none transition-all`} /></div></div></div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-sm">
                                            <ToggleSwitch label="Chặn xuất kho âm" description="Không cho phép tạo đơn hàng hoặc xuất kho nếu số lượng tồn kho không đủ. Giúp tránh sai lệch số liệu." checked={localSettings.system.preventNegativeStock} onChange={v => setLocalSettings({...localSettings, system: {...localSettings.system, preventNegativeStock: v}})} />
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeSection === 'ai' && (
                                <>
                                    <SectionHeader title="Trí tuệ nhân tạo (Gemini)" description="Cấu hình trợ lý ảo hỗ trợ phân tích và dự báo." icon="psychology" />
                                    <div className="animate-fadeIn">
                                        <div className="p-1 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-[2.5rem] shadow-xl">
                                            <div className="bg-white dark:bg-slate-900 rounded-[2.3rem] p-8">
                                                <div className="flex items-center justify-between mb-6">
                                                    <div className="flex items-center gap-4"><div className="size-14 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-3xl">✨</div><div><h3 className="text-xl font-black text-slate-900 dark:text-white">AI Business Advisor</h3><p className="text-sm text-slate-500">Powered by Google Gemini 3.0 Pro</p></div></div>
                                                    <ToggleSwitch checked={localSettings.ai.enabled} onChange={v => setLocalSettings({...localSettings, ai: {...localSettings.ai, enabled: v}})} label="" />
                                                </div>
                                                {localSettings.ai.enabled && (
                                                    <div className="space-y-6 animate-fadeIn">
                                                        <div className={`p-4 rounded-2xl border flex gap-4 ${hasApiKey ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-800' : 'bg-rose-50 border-rose-100 dark:bg-rose-900/10 dark:border-rose-800'}`}>
                                                            <span className={`material-symbols-outlined mt-1 ${hasApiKey ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                {hasApiKey ? 'verified_user' : 'key_off'}
                                                            </span>
                                                            <div>
                                                                <h4 className="font-bold text-sm text-slate-900 dark:text-white">Trạng thái API Key</h4>
                                                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                                                                    {hasApiKey 
                                                                        ? "Khóa API đã được cấu hình thành công trong môi trường hệ thống. AI đã sẵn sàng hoạt động." 
                                                                        : "Hệ thống chưa phát hiện API Key trong biến môi trường. Vui lòng kiểm tra lại cấu hình Server."}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex gap-4"><span className="material-symbols-outlined text-indigo-600 mt-1">auto_awesome</span><div><h4 className="font-bold text-sm text-slate-900 dark:text-white">Thinking Mode (Kích hoạt)</h4><p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">Hệ thống sử dụng model <b>Gemini 3.0 Pro Preview</b> với khả năng suy luận sâu (32k tokens) để phân tích báo cáo tài chính và log hệ thống. (Khóa API được quản lý tập trung và bảo mật).</p></div></div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeSection === 'print' && (
                                <>
                                    <SectionHeader title="Mẫu in ấn" description="Tùy chỉnh giao diện hóa đơn và chứng từ." icon="print" />
                                    <div className="grid grid-cols-2 gap-6 animate-fadeIn">
                                        {(['order', 'quote', 'import', 'delivery'] as const).map(type => (
                                            <div key={type} className="group relative bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 p-8 hover:shadow-xl hover:border-blue-300 transition-all cursor-pointer overflow-hidden" onClick={() => setEditingTemplate({ type, config: localSettings.documents[type] })}>
                                                <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-4 group-hover:translate-x-0 duration-300"><div className="size-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg"><span className="material-symbols-outlined text-[20px]">edit</span></div></div>
                                                <div className="size-14 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-6 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors"><span className="material-symbols-outlined text-[32px]">{type === 'order' ? 'receipt_long' : type === 'quote' ? 'request_quote' : type === 'import' ? 'inventory' : 'local_shipping'}</span></div>
                                                <h3 className="font-black text-xl text-slate-900 dark:text-white uppercase tracking-tight">{type === 'order' ? 'Hóa đơn' : type === 'quote' ? 'Báo giá' : type === 'import' ? 'Phiếu nhập' : 'Phiếu giao'}</h3>
                                                <p className="text-xs text-slate-500 mt-2 font-medium">{localSettings.documents[type].title}</p>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {activeSection === 'data' && (
                                <>
                                    <SectionHeader title="Dữ liệu & Backup" description="Quản lý sao lưu, phục hồi và an toàn dữ liệu." icon="database" />
                                    <div className="space-y-8 animate-fadeIn">
                                        <div className="bg-blue-600 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden group cursor-pointer" onClick={exportBackup}>
                                            <div className="relative z-10 flex justify-between items-center">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined">cloud_download</span><span className="text-xs font-bold uppercase tracking-widest opacity-80">Backup System</span></div>
                                                    <h3 className="text-3xl font-black uppercase tracking-tight">Tải bản sao lưu</h3>
                                                    <p className="text-blue-100 text-sm mt-2 max-w-sm font-medium">Xuất toàn bộ dữ liệu ra file JSON an toàn.</p>
                                                </div>
                                                <div className="size-16 rounded-full bg-white text-blue-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><span className="material-symbols-outlined text-3xl">download</span></div>
                                            </div>
                                            <div className="absolute -bottom-20 -right-20 size-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="p-8 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm hover:border-orange-300 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                                <div className="size-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mb-4"><span className="material-symbols-outlined text-2xl">restore</span></div>
                                                <h3 className="font-bold text-lg mb-1">Khôi phục dữ liệu</h3>
                                                <p className="text-xs text-slate-500">Nhập file backup để phục hồi.</p>
                                                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileSelect} />
                                            </div>
                                            
                                            <div className="p-8 bg-indigo-50 dark:bg-indigo-900/10 rounded-[2.5rem] border border-indigo-100 dark:border-indigo-900/30 cursor-pointer hover:border-indigo-300 transition-colors" onClick={handleSeedData}>
                                                <div className="size-12 rounded-2xl bg-white text-indigo-600 flex items-center justify-center mb-4"><span className="material-symbols-outlined text-2xl">science</span></div>
                                                <h3 className="font-bold text-lg mb-1 text-indigo-700 dark:text-indigo-300">Khởi tạo dữ liệu mẫu</h3>
                                                <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70">Tạo data giả lập để test luồng UI.</p>
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="p-8 bg-amber-50 dark:bg-amber-900/10 rounded-[2.5rem] border border-amber-100 dark:border-amber-900/30 flex items-center justify-between">
                                                <div className="flex items-center gap-4"><div className="size-12 rounded-2xl bg-white text-amber-600 flex items-center justify-center shadow-sm"><span className="material-symbols-outlined text-2xl">cleaning_services</span></div><div><h3 className="font-black text-amber-700 dark:text-amber-400 uppercase text-sm tracking-widest">Dọn dẹp rác</h3><p className="text-xs text-amber-600/70 mt-1 font-medium">Xóa log cũ & cache hệ thống.</p></div></div>
                                                <Button variant="secondary" className="rounded-xl px-4 h-10 text-xs bg-white text-amber-700 border-none shadow-sm" onClick={handleClearOldLogs}>Dọn ngay</Button>
                                            </div>
                                            
                                            <div className="p-8 bg-rose-50 dark:bg-rose-900/10 rounded-[2.5rem] border border-rose-100 dark:border-rose-900/30 flex items-center justify-between">
                                                <div className="flex items-center gap-4"><div className="size-12 rounded-2xl bg-white text-rose-600 flex items-center justify-center shadow-sm"><span className="material-symbols-outlined text-2xl">delete_forever</span></div><div><h3 className="font-black text-rose-700 dark:text-rose-400 uppercase text-sm tracking-widest">Vùng nguy hiểm</h3><p className="text-xs text-rose-600/70 mt-1 font-medium">Xóa toàn bộ dữ liệu (Hard Reset).</p></div></div>
                                                <Button variant="danger" className="rounded-xl px-6 h-10 text-xs" onClick={() => setIsResetModalOpen(true)}>Reset</Button>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {!isFullPageView && (
                    <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${isDirty ? 'translate-y-0 opacity-100' : 'translate-y-32 opacity-0'}`}>
                        <div className="bg-slate-900/90 dark:bg-white/90 backdrop-blur-md text-white dark:text-slate-900 pl-6 pr-2 py-2 rounded-full shadow-2xl flex items-center gap-6 border border-white/10 dark:border-slate-200">
                            <span className="font-bold text-sm flex items-center gap-2"><span className="size-2 rounded-full bg-orange-500 animate-pulse"></span>Có thay đổi chưa lưu</span>
                            <div className="flex gap-2">
                                <button onClick={() => { setLocalSettings(settings); setLocalUserName(currentUser.name); setIsDirty(false); }} className="px-4 py-2.5 rounded-full hover:bg-white/10 dark:hover:bg-black/5 text-xs font-black uppercase tracking-widest transition-colors">Hủy</button>
                                <button onClick={handleSave} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-black uppercase tracking-widest shadow-lg transition-transform active:scale-95 flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">save</span> Lưu lại</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            <ConfirmModal isOpen={isRestoreModalOpen} title="Khôi phục dữ liệu?" message={`File backup v${backupAnalysis?.metadata.schemaVersion} chứa ${backupAnalysis?.summary.orders || 0} đơn hàng. Bạn muốn ghi đè hay gộp dữ liệu?`} confirmLabel="Ghi đè tất cả" cancelLabel="Chỉ thêm mới" onConfirm={() => handleRunRestore('replace')} onCancel={() => handleRunRestore('merge')} type="warning" />
            <ConfirmModal isOpen={isResetModalOpen} title="XÓA SẠCH DỮ LIỆU?" message="Toàn bộ dữ liệu sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác. Sếp chắc chắn chứ?" confirmLabel="Xác nhận Reset" onConfirm={resetSystem} onCancel={() => setIsResetModalOpen(false)} type="danger" />
            {editingTemplate && (<TemplateEditor isOpen={true} onClose={() => setEditingTemplate(null)} initialConfig={editingTemplate.config} onSave={(cfg) => { const updated = { ...localSettings, documents: { ...localSettings.documents, [editingTemplate.type]: cfg } }; setLocalSettings(updated); setEditingTemplate(null); }} settings={localSettings} type={editingTemplate.type as any} />)}
        </div>
    );
};

export default Settings;
