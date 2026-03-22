
import React, { useEffect, useState, useMemo } from 'react';
import { ViewState } from '../types';
import { formatCurrency, getCurrentDate, addDays, formatDateISO, getStartOfMonth, getEndOfMonth } from '../utils/helpers';
import { getDashboardMetrics, DashboardData } from '../services/dashboardMetrics';
import { generateBusinessAdvisorInsight, detectBusinessAnomalies, AnomalyAlert } from '../services/ai';
import { PageShell, Button } from '../components/ui/Primitives';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend } from 'recharts';
import { useAppContext } from '../contexts/AppContext';
import { useSettings } from '../contexts/SettingsContext';
import { DateRangeFilter } from '../components/filters/DateRangeFilter';
import { DetailSkeleton } from '../components/ui/Skeleton';
import { AnomalyWidget } from '../components/dashboard/AnomalyWidget';
import { db } from '../services/db';

// --- SUB-COMPONENT: LIVE CLOCK (INLINE) ---
const InlineClock = () => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
            <span className="material-symbols-outlined text-[18px] text-indigo-500 animate-pulse">schedule</span>
            <span className="font-mono tracking-widest text-slate-700 dark:text-slate-300">
                {time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
        </div>
    );
};

// --- SUB-COMPONENT: METRIC CARD ---
const MetricCard: React.FC<{
  title: string;
  val: string | number;
  sub?: string;
  icon: string;
  color: string; 
  trend?: number; 
  onClick?: () => void;
}> = ({ title, val, sub, icon, color, onClick }) => (
  <div 
    onClick={onClick}
    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-6 relative overflow-hidden group cursor-pointer hover:shadow-xl transition-all duration-300 hover:-translate-y-1 h-full flex flex-col justify-between"
  >
    <div className="relative z-10">
      <div className="flex justify-between items-start mb-4">
        <div className={`size-12 rounded-2xl flex items-center justify-center shadow-inner ${color.includes('bg-') ? color.replace('text-', 'text-opacity-80 ') : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
           <span className={`material-symbols-outlined text-[24px] ${color.includes('text-white') ? 'text-white' : ''}`}>{icon}</span>
        </div>
      </div>
      <div>
        <h3 className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tighter leading-none mb-1">{val}</h3>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</p>
        {sub && <p className="text-[10px] font-bold text-slate-500 mt-2 opacity-80 truncate">{sub}</p>}
      </div>
    </div>
    {/* Decor */}
    <span className={`material-symbols-outlined absolute -bottom-6 -right-6 text-[120px] opacity-[0.03] group-hover:opacity-[0.06] group-hover:rotate-12 transition-all duration-700 pointer-events-none ${color.includes('text-') ? color.split(' ')[0] : ''}`}>
        {icon}
    </span>
  </div>
);

// --- MAIN PAGE ---
const Dashboard: React.FC<{ onNavigate: (view: ViewState, params?: any) => void }> = ({ onNavigate }) => {
  const { currentUser } = useAppContext();
  const { settings } = useSettings();
  
  const [dateRange, setDateRange] = useState({ 
      from: formatDateISO(addDays(new Date(), -29)), 
      to: getCurrentDate() 
  });

  const [metrics, setMetrics] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [insight, setInsight] = useState<string | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(false);

  // Anomaly State (Lifted from Widget)
  const [anomalyState, setAnomalyState] = useState<{ alerts: AnomalyAlert[], isScanning: boolean, lastScan: number }>({
      alerts: [], isScanning: false, lastScan: 0
  });

  // Load Dashboard Data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getDashboardMetrics(dateRange.from, dateRange.to); 
        setMetrics(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    if (dateRange.from && dateRange.to) load();
  }, [dateRange]);

  // Load Anomalies (Independent)
  useEffect(() => {
    const runScan = async () => {
        const now = Date.now();
        const stored = localStorage.getItem('anomaly_cache');
        if (stored) {
            const cache = JSON.parse(stored);
            if (now - cache.timestamp < 30 * 60 * 1000) {
                setAnomalyState({ alerts: cache.alerts, isScanning: false, lastScan: cache.timestamp });
                return;
            }
        }

        setAnomalyState(prev => ({ ...prev, isScanning: true }));
        try {
            // Fetch minimum necessary data
            const recentOrders = await db.orders.orderBy('createdAt').reverse().limit(20).toArray();
            const debts = await db.debtRecords.filter(d => d.remainingAmount > 0).toArray();
            const products = await db.products.filter(p => p.stock > 0).toArray();

            const results = await detectBusinessAnomalies(recentOrders, debts, products);
            
            localStorage.setItem('anomaly_cache', JSON.stringify({ timestamp: now, alerts: results }));
            setAnomalyState({ alerts: results, isScanning: false, lastScan: now });
        } catch (e) {
            console.error("Anomaly scan failed", e);
            setAnomalyState(prev => ({ ...prev, isScanning: false }));
        }
    };

    const t = setTimeout(runScan, 2000); // Small delay to prioritize main content
    return () => clearTimeout(t);
  }, []);

  const handleAnalyze = async () => {
      if (!metrics) return;
      setIsInsightLoading(true);
      try {
          const result = await generateBusinessAdvisorInsight({
              revenue: metrics.kpis.realRevenue,
              profit: metrics.kpis.grossProfit,
              margin: metrics.kpis.realRevenue > 0 ? (metrics.kpis.grossProfit / metrics.kpis.realRevenue) * 100 : 0,
              orderCount: metrics.kpis.orderCount,
              topProducts: metrics.topProducts.map((p) => p.name),
              ar: metrics.kpis.ar,
              ap: metrics.kpis.ap,
              lowStockCount: metrics.lowStockList.length,
              operatingExpenses: metrics.kpis.cashOut
          });
          setInsight(result.text);
      } catch (e) {
          console.error(e);
      } finally {
          setIsInsightLoading(false);
      }
  };

  const getGreeting = () => {
      const h = new Date().getHours();
      if (h < 12) return 'Chào buổi sáng';
      if (h < 18) return 'Chào buổi chiều';
      return 'Chào buổi tối';
  };

  const getFullDateString = () => {
      const date = new Date();
      return `Thứ ${date.getDay() === 0 ? 'Chủ Nhật' : 'Ba'}, ${date.getDate()} tháng ${date.getMonth() + 1}, ${date.getFullYear()}`
          .replace('Thứ 1', 'Thứ Hai')
          .replace('Thứ 2', 'Thứ Ba')
          .replace('Thứ 3', 'Thứ Tư')
          .replace('Thứ 4', 'Thứ Năm')
          .replace('Thứ 5', 'Thứ Sáu')
          .replace('Thứ 6', 'Thứ Bảy');
  };

  if (loading || !metrics) {
    return (
        <PageShell className="p-8 space-y-8">
            <div className="flex justify-between items-center">
                <div className="h-10 w-48 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse"></div>
                <div className="h-10 w-64 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse"></div>
            </div>
            <DetailSkeleton />
        </PageShell>
    );
  }

  const { kpis, todo, chartData } = metrics;

  return (
    <PageShell className="overflow-y-auto custom-scrollbar">
      <div className="p-6 lg:p-8 space-y-8 pb-20">
        
        {/* 1. HEADER */}
        <div className="flex flex-col lg:flex-row justify-between items-end gap-6 relative animate-[slideInRight_0.4s_ease-out] mb-2">
            <div className="relative z-10 flex flex-col items-start gap-1">
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] mb-2">
                    <span className="text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-800">
                        {settings.general.name || 'HƯNG THỊNH ERP'}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">|</span>
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        Hệ thống đồng bộ
                    </span>
                </div>
                
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                    <h1 className="text-2xl lg:text-3xl font-bold uppercase text-slate-500 dark:text-slate-400 tracking-tight leading-none">
                        {getGreeting()},
                    </h1>
                    <h1 className="text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none uppercase">
                        {currentUser?.name || 'ADMIN'}
                    </h1>
                </div>

                <div className="flex items-center gap-4 mt-3">
                    <div className="text-sm font-bold text-slate-400 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[20px]">calendar_month</span>
                        <span>{getFullDateString()}</span>
                    </div>
                    <div className="w-px h-4 bg-slate-300 dark:bg-slate-700"></div>
                    <InlineClock />
                </div>
            </div>

            <div className="z-10 flex flex-col items-end gap-4">
                <div className="bg-white dark:bg-slate-800 p-1 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <DateRangeFilter startDate={dateRange.from} endDate={dateRange.to} onChange={(from, to) => setDateRange({ from, to })} />
                </div>
            </div>
            
            <div className="absolute top-0 left-0 w-[600px] h-[400px] bg-gradient-to-br from-indigo-500/5 to-transparent rounded-full blur-3xl -translate-x-1/4 -translate-y-1/2 pointer-events-none -z-0"></div>
        </div>

        {/* 2. KPI GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-premium">
            <MetricCard 
                title="Doanh thu thực" 
                val={formatCurrency(kpis.realRevenue).replace(' VND', '')} 
                sub={`${kpis.orderCount} đơn hàng hoàn tất`} 
                icon="verified" 
                color="bg-indigo-600 text-white shadow-indigo-500/30"
                onClick={() => onNavigate('REPORTS')}
            />
            <MetricCard 
                title="Lợi nhuận gộp" 
                val={formatCurrency(kpis.grossProfit).replace(' VND', '')} 
                sub={`Margin: ${kpis.realRevenue > 0 ? ((kpis.grossProfit/kpis.realRevenue)*100).toFixed(1) : 0}%`} 
                icon="savings" 
                color="bg-emerald-500 text-white shadow-emerald-500/30"
                onClick={() => onNavigate('REPORTS')}
            />
            <MetricCard 
                title="Dòng tiền ròng" 
                val={formatCurrency(kpis.netCashFlow).replace(' VND', '')} 
                sub={`Thu: ${formatCurrency(kpis.cashIn)}`} 
                icon="account_balance" 
                color={kpis.netCashFlow >= 0 ? "bg-blue-500 text-white" : "bg-rose-500 text-white"}
                onClick={() => onNavigate('TRANSACTIONS')}
            />
            <MetricCard 
                title="Phải thu (AR)" 
                val={formatCurrency(kpis.ar).replace(' VND', '')} 
                sub={`${todo.overdueDebts} khoản quá hạn`} 
                icon="assignment_late" 
                color="bg-orange-500 text-white shadow-orange-500/30"
                onClick={() => onNavigate('DEBTS')}
            />
        </div>

        {/* 3. CHARTS SECTION + AI WIDGET */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 p-8 shadow-sm flex flex-col h-[420px]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                        <span className="material-symbols-outlined text-indigo-500">show_chart</span>
                        Xu hướng kinh doanh
                    </h3>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-indigo-500"></span><span className="text-[10px] font-bold text-slate-500 uppercase">Doanh thu</span></div>
                        <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-400"></span><span className="text-[10px] font-bold text-slate-500 uppercase">Lợi nhuận</span></div>
                    </div>
                </div>
                <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="currentColor" className="text-indigo-500" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="currentColor" className="text-indigo-500" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="currentColor" className="text-emerald-400" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="currentColor" className="text-emerald-400" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200" strokeOpacity={0.3} />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: 'currentColor'}} className="text-slate-400" dy={10} />
                            <YAxis hide />
                            <Tooltip 
                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: 'rgba(255, 255, 255, 0.95)', zIndex: 100 }}
                                formatter={(value: any) => formatCurrency(Number(value || 0)).replace(' VND','')}
                                labelStyle={{ fontWeight: 'bold', color: 'currentColor' }}
                                allowEscapeViewBox={{ x: true, y: true }}
                                wrapperStyle={{ zIndex: 1000 }}
                            />
                            <Area type="monotone" dataKey="revenue" name="Doanh thu" stroke="currentColor" className="text-indigo-500" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                            <Area type="monotone" dataKey="profit" name="Lợi nhuận" stroke="currentColor" className="text-emerald-400" strokeWidth={3} fillOpacity={1} fill="url(#colorProf)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="flex flex-col gap-6 h-[420px]">
                {/* NEW: Anomaly Widget (Only render if needed to fix layout gap) */}
                {(anomalyState.isScanning || anomalyState.alerts.length > 0) && (
                    <div className="flex-shrink-0 animate-[fadeIn_0.5s_ease-out]">
                        <AnomalyWidget 
                            alerts={anomalyState.alerts} 
                            isScanning={anomalyState.isScanning} 
                            lastScan={anomalyState.lastScan} 
                            onNavigate={onNavigate} 
                        />
                    </div>
                )}

                <div className="flex-1 bg-gradient-to-br from-slate-800 to-black text-white p-6 rounded-[2.5rem] shadow-xl relative overflow-hidden flex flex-col min-h-0">
                    <div className="flex items-center gap-3 mb-4 relative z-10">
                        <div className={`size-10 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md ${isInsightLoading ? 'animate-pulse' : ''}`}>
                            <span className="material-symbols-outlined text-[20px]">psychology</span>
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-indigo-200">Góc nhìn AI (Manual)</h3>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10 pr-2">
                        {insight ? (
                            <p className="text-xs font-medium leading-relaxed opacity-90 whitespace-pre-line">{insight}</p>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                                <p className="text-[10px] font-bold uppercase tracking-widest mb-2">Chưa phân tích dữ liệu</p>
                                <button onClick={handleAnalyze} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors">Kích hoạt Gemini</button>
                            </div>
                        )}
                    </div>
                    
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10"></div>
                </div>
            </div>
        </div>

        {/* 4. BOTTOM SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm h-[350px] flex flex-col">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6">Dòng tiền (Thu / Chi)</h3>
                <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200" strokeOpacity={0.5} />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: 'currentColor'}} className="text-slate-400" dy={10} />
                            <Tooltip 
                                cursor={{fill: 'transparent'}}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                formatter={(value: any) => formatCurrency(Number(value || 0)).replace(' VND','')}
                                allowEscapeViewBox={{ x: true, y: true }}
                            />
                            <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '20px' }} />
                            <Bar dataKey="cashIn" name="Tiền thu" fill="currentColor" className="text-emerald-500" radius={[4, 4, 0, 0]} barSize={20} />
                            <Bar dataKey="cashOut" name="Tiền chi" fill="currentColor" className="text-rose-500" radius={[4, 4, 0, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm h-[350px] flex flex-col">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center justify-between">
                    <span>Sản phẩm chủ lực</span>
                    <button onClick={() => onNavigate('REPORTS')} className="text-indigo-600 hover:text-indigo-700 text-[10px]">Xem báo cáo</button>
                </h3>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    <table className="w-full text-left text-sm">
                        <thead className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                            <tr>
                                <th className="pb-3 pl-2">Tên sản phẩm</th>
                                <th className="pb-3 text-center">SL</th>
                                <th className="pb-3 text-right">Doanh số</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {metrics.topProducts.map((p, idx) => (
                                <tr key={idx} className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="py-3 pl-2">
                                        <div className="font-bold text-slate-700 dark:text-slate-200 truncate max-w-[200px]">{p.name}</div>
                                    </td>
                                    <td className="py-3 text-center font-bold text-slate-500">{p.qty}</td>
                                    <td className="py-3 text-right font-black text-indigo-600">{formatCurrency(p.revenue).replace(' VND','')}</td>
                                </tr>
                            ))}
                            {metrics.topProducts.length === 0 && (
                                <tr><td colSpan={3} className="py-10 text-center text-slate-400 text-xs font-bold uppercase tracking-widest opacity-50">Chưa có dữ liệu</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      </div>
    </PageShell>
  );
};

export default Dashboard;
