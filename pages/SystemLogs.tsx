
import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../services/db';
import { useDexieTable } from '../hooks/useDexieTable';
import { ErrorLog, ReconcileIssue } from '../types';
import { PageShell, Button } from '../components/ui/Primitives';
import { DataTable, ColumnDef } from '../components/ui/DataTable';
import Pagination from '../components/Pagination';
import { useAppContext } from '../contexts/AppContext';
import { useNotification } from '../contexts/NotificationContext';
import { downloadTextFile, parseISOToDate, formatRelativeTime, formatCurrency } from '../utils/helpers';
import { Drawer, DrawerSection } from '../components/ui/Drawer';
import { DateRangeFilter } from '../components/filters/DateRangeFilter';
import { useLiveQuery } from 'dexie-react-hooks';
import { analyzeErrorLogs } from '../services/ai';

// --- SUB-COMPONENT: HEALTH GAUGE ---
const HealthGauge = ({ score, status }: { score: number, status: string }) => {
    // Determine color based on score
    const colorClass = score > 80 ? 'text-emerald-500' : score > 50 ? 'text-amber-500' : 'text-rose-500';
    const strokeDashoffset = 2 * Math.PI * 40 * (1 - score / 100);

    return (
        <div className="relative size-48 mx-auto flex items-center justify-center group cursor-default">
            {/* Background Circle */}
            <svg className="size-full -rotate-90 transform transition-transform duration-700 group-hover:scale-105" viewBox="0 0 100 100">
                <circle className="text-slate-100 dark:text-slate-800 stroke-current" strokeWidth="6" cx="50" cy="50" r="40" fill="transparent"></circle>
                <circle 
                    className={`${colorClass} progress-ring__circle stroke-current transition-all duration-1000 ease-out drop-shadow-lg`} 
                    strokeWidth="6" 
                    strokeLinecap="round" 
                    cx="50" 
                    cy="50" 
                    r="40" 
                    fill="transparent" 
                    strokeDasharray={`${2 * Math.PI * 40}`} 
                    strokeDashoffset={strokeDashoffset}
                ></circle>
            </svg>
            
            {/* Inner Content */}
            <div className="absolute flex flex-col items-center justify-center inset-0 rounded-full bg-gradient-to-b from-transparent to-slate-50/50 dark:to-slate-900/50 backdrop-blur-[2px]">
                <span className={`text-4xl font-black ${colorClass} tracking-tighter`}>{score}%</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{status}</span>
                <div className={`mt-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center gap-1`}>
                    <span className={`size-1.5 rounded-full ${colorClass} animate-pulse`}></span> Live
                </div>
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: RESOURCE BAR ---
const ResourceBar = ({ label, used, total, percent, icon, color }: any) => (
    <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-center mb-2 relative z-10">
            <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-[18px] ${color}`}>{icon}</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">{label}</span>
            </div>
            <span className="text-xs font-black text-slate-900 dark:text-white">{used} <span className="text-slate-400 font-medium">/ {total}</span></span>
        </div>
        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative z-10">
            <div className={`h-full rounded-full transition-all duration-1000 ${percent > 80 ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: `${percent}%` }}></div>
        </div>
        {/* Abstract BG */}
        <span className={`material-symbols-outlined absolute -bottom-3 -right-3 text-[60px] opacity-[0.03] rotate-12 ${color}`}>{icon}</span>
    </div>
);

const SystemLogs: React.FC = () => {
    const { generateDebugBundle, reconcileData, fixDataIssues } = useAppContext();
    const { showNotification } = useNotification();
    const [activeTab, setActiveTab] = useState<'errors' | 'ai_analysis'>('errors');
    
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [dateRange, setDateRange] = useState({ from: '', to: '' });
    
    const [isChecking, setIsChecking] = useState(false);
    const [isFixing, setIsFixing] = useState(false);
    const [healthIssues, setHealthIssues] = useState<ReconcileIssue[] | null>(null);
    const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
    const [aiAnalysis, setAiAnalysis] = useState<string>('');
    const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);

    const [storageInfo, setStorageInfo] = useState({ used: '0', quota: '0', percent: 0, usedRaw: 0 });

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
        return () => clearTimeout(t);
    }, [searchTerm]);

    const updateStorageInfo = async () => {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const usedMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(1);
            const quotaMB = ((estimate.quota || 0) / (1024 * 1024)).toFixed(0);
            const percent = Math.round(((estimate.usage || 0) / (estimate.quota || 1)) * 100);
            setStorageInfo({ used: `${usedMB} MB`, quota: `${quotaMB} MB`, percent, usedRaw: estimate.usage || 0 });
        }
    };

    useEffect(() => { updateStorageInfo(); }, []);

    const filterFn = useMemo(() => (log: ErrorLog) => {
        if (debouncedSearch) {
            const lower = debouncedSearch.toLowerCase();
            if (!log.message.toLowerCase().includes(lower)) return false;
        }
        if (dateRange.from || dateRange.to) {
            const logDate = new Date(log.timestamp);
            if (dateRange.from && logDate < parseISOToDate(dateRange.from)!) return false;
            if (dateRange.to) {
                const toDate = parseISOToDate(dateRange.to)!;
                toDate.setHours(23, 59, 59);
                if (logDate > toDate) return false;
            }
        }
        return true;
    }, [debouncedSearch, dateRange]);

    const { data: errorLogs, totalItems, currentPage, setCurrentPage, isLoading } = useDexieTable<ErrorLog & { id: number }>({
        table: db.errorLogs as any, itemsPerPage: 15, filterFn, defaultSort: 'timestamp'
    });

    const runAiAnalysis = async () => {
        if (isAiAnalyzing) return;
        setIsAiAnalyzing(true);
        setActiveTab('ai_analysis');
        try {
            const recentErrors = await db.errorLogs.reverse().limit(30).toArray();
            if (recentErrors.length === 0) {
                setAiAnalysis("Hệ thống rất khỏe mạnh! Không tìm thấy lỗi nào gần đây để phân tích.");
            } else {
                const result = await analyzeErrorLogs(recentErrors as any);
                setAiAnalysis(result);
            }
        } catch (e: any) {
            showNotification(e.message, 'error');
            setAiAnalysis("Lỗi khi kết nối với AI Server.");
        } finally {
            setIsAiAnalyzing(false);
        }
    };

    const runDiagnostics = async () => {
        setIsChecking(true);
        try {
            const issues = await reconcileData();
            // Filter out "All Good" message to just show real issues in the list
            const realIssues = issues.filter(i => i.severity !== 'Low' || i.type !== 'Data' || i.message.includes('tham chiếu'));
            setHealthIssues(realIssues.length > 0 ? realIssues : null);
            
            if (realIssues.length === 0) {
                showNotification('Hệ thống vận hành ổn định', 'success');
            } else {
                showNotification(`Phát hiện ${realIssues.length} vấn đề dữ liệu`, 'warning');
            }
        } finally {
            setIsChecking(false);
        }
    };

    const handleAutoFix = async () => {
        if (!healthIssues) return;
        const fixable = healthIssues.filter(i => i.autoFixable);
        if (fixable.length === 0) return;

        setIsFixing(true);
        try {
            await fixDataIssues(fixable);
            showNotification(`Đã sửa tự động ${fixable.length} lỗi`, 'success');
            await runDiagnostics(); // Re-check
        } catch (e) {
            showNotification('Lỗi khi sửa dữ liệu', 'error');
        } finally {
            setIsFixing(false);
        }
    };

    const healthScore = useMemo(() => {
        let score = 100;
        // Penalize for errors
        if (totalItems > 0) score -= 5;
        if (totalItems > 20) score -= 15;
        // Penalize for storage
        if (storageInfo.percent > 80) score -= 10;
        // Penalize for detected data issues
        if (healthIssues && healthIssues.length > 0) score -= (healthIssues.length * 5);
        return Math.max(0, score);
    }, [totalItems, storageInfo, healthIssues]);

    const columns: ColumnDef<ErrorLog & { id: number }>[] = [
        { 
            header: 'Thời điểm', accessorKey: 'timestamp', width: 'w-40', 
            cell: (l) => (
                <div className="flex flex-col">
                    <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 font-bold">{formatRelativeTime(l.timestamp)}</span>
                    <span className="text-[9px] text-slate-400">{new Date(l.timestamp).toLocaleTimeString()}</span>
                </div>
            )
        },
        { 
            header: 'Mức độ', accessorKey: 'severity', width: 'w-24', align: 'center', 
            cell: (l) => (
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border flex items-center justify-center gap-1 ${l.severity === 'error' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                    {l.severity === 'error' && <span className="material-symbols-outlined text-[10px]">error</span>}
                    {l.severity}
                </span>
            ) 
        },
        { 
            header: 'Nội dung lỗi', accessorKey: 'message', 
            cell: (l) => (
                <div className="group cursor-pointer" onClick={() => setSelectedError(l)}>
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 line-clamp-1 group-hover:text-blue-600 transition-colors">{l.message}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-md">{l.componentStack?.slice(0, 50)}...</p>
                </div>
            ) 
        },
        { 
            header: 'Vị trí', accessorKey: 'route', width: 'w-32', 
            cell: (l) => <span className="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">{l.route || '/'}</span> 
        },
    ];

    const handleExportBundle = async () => {
        try {
            const bundle = await generateDebugBundle();
            downloadTextFile(`erp-debug-${Date.now()}.json`, bundle, 'application/json');
            showNotification('Đã xuất gói chẩn đoán', 'success');
        } catch (e) { showNotification('Lỗi xuất file', 'error'); }
    };

    const autoFixableCount = healthIssues?.filter(i => i.autoFixable).length || 0;

    return (
        <PageShell className="bg-slate-50 dark:bg-slate-900 overflow-hidden">
            <div className="flex h-full gap-0">
                {/* LEFT PANEL: VITALS & CONTROL */}
                <div className="w-[340px] bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col p-6 overflow-y-auto custom-scrollbar shrink-0 z-20">
                    <div className="mb-10 text-center relative">
                        <HealthGauge score={healthScore} status={healthScore > 90 ? 'Tuyệt vời' : healthScore > 70 ? 'Ổn định' : 'Cần chú ý'} />
                        <div className="mt-6">
                            <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Trạm Kiểm Soát</h2>
                            <p className="text-xs text-slate-500 font-medium">Phiên bản hệ thống v3.8.0</p>
                        </div>
                    </div>

                    <div className="space-y-4 mb-8">
                        <ResourceBar label="Local Storage" used={storageInfo.used} total={storageInfo.quota} percent={storageInfo.percent} icon="database" color="text-blue-500" />
                        <ResourceBar label="Nhật ký lỗi" used={`${totalItems} Logs`} total="Giới hạn 1000" percent={Math.min((totalItems/1000)*100, 100)} icon="bug_report" color="text-rose-500" />
                    </div>

                    <div className="space-y-3">
                        <button onClick={runDiagnostics} disabled={isChecking} className="w-full py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl text-xs font-black uppercase tracking-widest hover:border-blue-500 hover:text-blue-600 transition-all flex items-center justify-center gap-2 shadow-sm group">
                            <span className={`material-symbols-outlined text-[20px] ${isChecking ? 'animate-spin text-blue-600' : 'text-slate-400 group-hover:text-blue-600'}`}>monitor_heart</span>
                            {isChecking ? 'Đang chẩn đoán...' : 'Quét toàn hệ thống'}
                        </button>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={async () => { await db.aiCache.clear(); showNotification('Đã xóa bộ nhớ đệm', 'info'); }} className="py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-1">
                                <span className="material-symbols-outlined text-[18px]">cleaning_services</span> Xóa Cache
                            </button>
                            <button onClick={handleExportBundle} className="py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex flex-col items-center justify-center gap-1">
                                <span className="material-symbols-outlined text-[18px]">archive</span> Xuất Log
                            </button>
                        </div>
                    </div>

                    {healthIssues && healthIssues.length > 0 && (
                        <div className="mt-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl animate-fadeIn">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-[10px] font-black text-rose-600 uppercase flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">warning</span> {healthIssues.length} vấn đề
                                </h4>
                                {autoFixableCount > 0 && (
                                    <button 
                                        onClick={handleAutoFix} 
                                        disabled={isFixing}
                                        className="px-2 py-1 bg-rose-600 text-white text-[9px] font-bold rounded-lg hover:bg-rose-700 transition-colors shadow-sm disabled:opacity-50"
                                    >
                                        {isFixing ? 'Đang sửa...' : `Sửa lỗi (${autoFixableCount})`}
                                    </button>
                                )}
                            </div>
                            <ul className="space-y-2 overflow-y-auto max-h-[200px] custom-scrollbar pr-1">
                                {healthIssues.map((issue, idx) => (
                                    <li key={idx} className="text-[10px] font-medium text-rose-800 leading-tight flex flex-col gap-0.5 bg-white/50 p-2 rounded-lg border border-rose-100">
                                        <div className="flex gap-1.5 font-bold">
                                            <span className="text-rose-400">•</span> {issue.message}
                                        </div>
                                        {issue.suggestedFix && (
                                            <span className="text-emerald-600 text-[9px] pl-2.5">
                                                Gợi ý: {issue.suggestedFix} {issue.autoFixable && '(Auto)'}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* RIGHT PANEL: MAIN WORKSPACE */}
                <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900/50">
                    <div className="h-16 px-8 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-10">
                        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                            <button onClick={() => setActiveTab('errors')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'errors' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Nhật ký lỗi</button>
                            <button onClick={() => setActiveTab('ai_analysis')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${activeTab === 'ai_analysis' ? 'bg-white dark:bg-slate-700 text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                <span className="material-symbols-outlined text-[14px]">psychology</span> Phân tích AI
                            </button>
                        </div>
                        {activeTab === 'errors' && <DateRangeFilter startDate={dateRange.from} endDate={dateRange.to} onChange={(f,t) => setDateRange({from:f, to:t})} />}
                    </div>

                    <div className="flex-1 overflow-hidden relative">
                        {activeTab === 'errors' && (
                            <div className="h-full flex flex-col animate-fadeIn">
                                <div className="flex-1 overflow-hidden px-8 pt-6 pb-2">
                                    <DataTable 
                                        data={errorLogs} 
                                        columns={columns} 
                                        isLoading={isLoading} 
                                        emptyIcon="verified_user" 
                                        emptyMessage="Hệ thống vận hành ổn định. Không có lỗi ghi nhận." 
                                        rowClassName={() => 'h-16 group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors'}
                                    />
                                </div>
                                <div className="px-8 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900"><Pagination currentPage={currentPage} totalItems={totalItems} pageSize={15} onPageChange={setCurrentPage} /></div>
                            </div>
                        )}

                        {activeTab === 'ai_analysis' && (
                            <div className="h-full flex flex-col p-8 animate-fadeIn">
                                {!aiAnalysis && !isAiAnalyzing ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-80">
                                        <div className="size-28 rounded-[2.5rem] bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-2xl shadow-purple-500/30 mb-8 animate-premium">
                                            <span className="material-symbols-outlined text-[64px]">auto_awesome</span>
                                        </div>
                                        <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-3">Trung tâm trí tuệ nhân tạo</h3>
                                        <p className="text-sm text-slate-500 max-w-lg mb-8 leading-relaxed">
                                            Sử dụng <b>Gemini 3 Pro (Thinking Mode)</b> với 32k tokens để phân tích sâu chuỗi lỗi, tìm nguyên nhân gốc rễ (Root Cause) và đề xuất giải pháp kỹ thuật tối ưu.
                                        </p>
                                        <Button variant="primary" onClick={runAiAnalysis} className="bg-purple-600 hover:bg-purple-700 shadow-xl shadow-purple-600/30 px-10 h-14 rounded-2xl text-xs font-black uppercase tracking-widest scale-100 hover:scale-105 transition-transform">
                                            Bắt đầu phân tích
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="bg-slate-900 text-slate-300 p-8 rounded-[2.5rem] shadow-2xl h-full flex flex-col border border-slate-800 relative font-mono text-sm leading-relaxed overflow-hidden">
                                        {/* Header of Terminal */}
                                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800">
                                            <div className="flex gap-2">
                                                <div className="size-3 rounded-full bg-red-500"></div>
                                                <div className="size-3 rounded-full bg-amber-500"></div>
                                                <div className="size-3 rounded-full bg-emerald-500"></div>
                                            </div>
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Gemini 3.0 Pro Analysis</span>
                                        </div>

                                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
                                            {isAiAnalyzing ? (
                                                <div className="flex flex-col items-center justify-center h-full gap-6">
                                                    <div className="flex gap-2">
                                                        <span className="size-3 bg-purple-500 rounded-full animate-bounce"></span>
                                                        <span className="size-3 bg-purple-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                                                        <span className="size-3 bg-purple-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                                                    </div>
                                                    <p className="text-purple-400 font-bold uppercase tracking-widest animate-pulse text-xs">Đang suy luận dữ liệu...</p>
                                                </div>
                                            ) : (
                                                <div className="whitespace-pre-line text-emerald-400">
                                                    {aiAnalysis}
                                                </div>
                                            )}
                                        </div>

                                        {!isAiAnalyzing && (
                                            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
                                                <Button variant="secondary" size="sm" onClick={() => setAiAnalysis('')} className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">Phân tích lại</Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Drawer
                isOpen={!!selectedError}
                onClose={() => setSelectedError(null)}
                title="Chi tiết lỗi kỹ thuật"
                width="lg"
                footer={<Button variant="primary" className="w-full h-12 rounded-2xl bg-slate-900 text-white" onClick={() => setSelectedError(null)}>Đóng cửa sổ</Button>}
            >
                {selectedError && (
                    <div className="space-y-8 animate-fadeIn">
                        <div className="p-6 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 rounded-[2rem]">
                            <h4 className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px]">error</span>
                                Error Message
                            </h4>
                            <p className="text-sm font-bold text-rose-900 dark:text-rose-200 leading-relaxed font-mono">{selectedError.message}</p>
                        </div>

                        <DrawerSection title="Stack Trace">
                            <div className="bg-slate-900 text-slate-400 p-6 rounded-[2rem] text-[11px] font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto border border-slate-800 shadow-inner max-h-[400px] custom-scrollbar">
                                <span className="text-blue-400">at</span> {selectedError.stack || 'Không có stack trace.'}
                            </div>
                        </DrawerSection>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-5 bg-slate-50 dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700">
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Route / Path</p>
                                <p className="text-xs font-bold text-blue-600 font-mono bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded inline-block">{selectedError.route}</p>
                            </div>
                            <div className="p-5 bg-slate-50 dark:bg-slate-800 rounded-[2rem] border border-slate-200 dark:border-slate-700">
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">User Agent</p>
                                <p className="text-[10px] text-slate-600 dark:text-slate-300 line-clamp-2">{selectedError.userAgent}</p>
                            </div>
                        </div>
                    </div>
                )}
            </Drawer>
        </PageShell>
    );
};

export default SystemLogs;
