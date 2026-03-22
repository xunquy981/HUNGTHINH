
import React, { useMemo, useState } from 'react';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
    ResponsiveContainer, BarChart, Bar, Legend 
} from 'recharts';
import { useSettings } from '../contexts/SettingsContext';
import { useNotification } from '../contexts/NotificationContext';
import { generateBusinessAdvisorInsight } from '../services/ai';
import { formatCurrency, formatDateISO, getStartOfMonth, getEndOfMonth, addDays, parseISOToDate } from '../utils/helpers';
import { ViewState } from '../types';
import { Button, PageShell } from '../components/ui/Primitives';
import { ReportsFilterBar } from '../components/reports/ReportsFilterBar';
import { PrintPreviewModal } from '../components/print/PrintPreviewModal';
import { ReportTemplate } from '../components/print/Templates';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/db';

// --- HELPERS ---
const getGrowthColor = (percent: number) => {
    if (percent > 0) return 'text-emerald-500 bg-emerald-500/10';
    if (percent < 0) return 'text-rose-500 bg-rose-500/10';
    return 'text-slate-400 bg-slate-400/10';
};

const getGrowthIcon = (percent: number) => {
    if (percent > 0) return 'trending_up';
    if (percent < 0) return 'trending_down';
    return 'remove';
};

// --- SUB-COMPONENT: PREMIUM KPI CARD ---
const MetricCard = ({ title, value, subValue, icon, color, active, onClick, growth }: any) => (
    <div 
        onClick={onClick}
        className={`relative overflow-hidden p-6 rounded-[2.5rem] border transition-all duration-500 cursor-pointer group flex flex-col justify-between h-44 ${
            active 
            ? `bg-slate-900 text-white shadow-premium scale-[1.02] border-transparent` 
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-lg'
        }`}
    >
        <div className="flex justify-between items-start relative z-10">
            <div className={`size-12 rounded-2xl flex items-center justify-center shrink-0 ${active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'} ${active ? 'text-white' : color}`}>
                <span className="material-symbols-outlined text-[28px]">{icon}</span>
            </div>
            {growth !== undefined && (
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${getGrowthColor(growth)}`}>
                    <span className="material-symbols-outlined text-[14px]">{getGrowthIcon(growth)}</span>
                    {Math.abs(growth).toFixed(1)}%
                </div>
            )}
        </div>
        <div className="relative z-10">
            <h3 className="text-2xl lg:text-3xl font-black tracking-tighter leading-none mb-1.5">{value}</h3>
            <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${active ? 'text-slate-400' : 'text-slate-500'}`}>{title}</p>
            {subValue && <p className={`text-[10px] font-bold mt-2 ${active ? 'text-emerald-400' : 'text-indigo-600'}`}>{subValue}</p>}
        </div>
        {/* Decorative Background Icon */}
        <span className={`material-symbols-outlined absolute -bottom-6 -right-6 text-[120px] opacity-[0.03] pointer-events-none transition-transform duration-1000 group-hover:rotate-12 group-hover:scale-110 ${active ? 'text-white' : 'text-slate-900'}`}>
            {icon}
        </span>
    </div>
);

// --- SUB-COMPONENT: SALES HEATMAP ---
const SalesHeatmap = ({ data }: { data: number[][] }) => {
    // data is 7 rows (Mon-Sun) x 12 cols (2-hour blocks: 0-2, 2-4... 22-24)
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const hours = ['0-2', '2-4', '4-6', '6-8', '8-10', '10-12', '12-14', '14-16', '16-18', '18-20', '20-22', '22-24'];
    
    // Find max value for opacity scaling
    let maxVal = 0;
    data.forEach(row => row.forEach(val => maxVal = Math.max(maxVal, val)));

    return (
        <div className="overflow-x-auto">
            <div className="min-w-[600px]">
                <div className="flex mb-2">
                    <div className="w-8"></div>
                    {hours.map((h, i) => (
                        <div key={i} className="flex-1 text-[9px] font-bold text-slate-400 text-center uppercase">{h}</div>
                    ))}
                </div>
                {days.map((day, dIdx) => (
                    <div key={dIdx} className="flex items-center mb-1">
                        <div className="w-8 text-[10px] font-black text-slate-500">{day}</div>
                        {data[dIdx].map((val, hIdx) => {
                            const intensity = maxVal > 0 ? val / maxVal : 0;
                            // Color interpolation: White -> Indigo
                            const bgStyle = intensity === 0 
                                ? 'bg-slate-50 dark:bg-slate-800' 
                                : `bg-indigo-600`;
                            
                            return (
                                <div key={hIdx} className="flex-1 px-0.5">
                                    <div 
                                        className={`h-8 rounded-md transition-all hover:scale-110 hover:shadow-lg relative group ${bgStyle}`}
                                        style={{ opacity: intensity === 0 ? 1 : Math.max(0.1, intensity) }}
                                    >
                                        {val > 0 && (
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                <span className="text-[9px] font-bold text-white drop-shadow-md">{formatCurrency(val).split(' ')[0]}</span>
                                            </div>
                                        )}
                                        {/* Tooltip */}
                                        {val > 0 && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap z-50">
                                                {formatCurrency(val)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: TAX LEDGER WIDGET ---
const TaxLedgerWidget = ({ output, input }: { output: number, input: number }) => {
    const payable = output - input;
    return (
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-200 dark:border-slate-800 p-6 shadow-sm h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600">account_balance</span>
                    Sổ cái Thuế GTGT (VAT)
                </h3>
                <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase ${payable > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {payable > 0 ? 'Phải nộp' : 'Được khấu trừ'}
                </span>
            </div>
            
            <div className="flex-1 space-y-4">
                {/* Output VAT */}
                <div className="flex justify-between items-center p-3 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase">VAT Đầu ra (Bán ra)</p>
                        <p className="text-xs text-slate-400">Thu hộ nhà nước</p>
                    </div>
                    <p className="text-lg font-black text-blue-600">{formatCurrency(output).replace(' VND','')}</p>
                </div>

                {/* Input VAT */}
                <div className="flex justify-between items-center p-3 rounded-xl bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800">
                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase">VAT Đầu vào (Mua vào)</p>
                        <p className="text-xs text-slate-400">Được khấu trừ</p>
                    </div>
                    <p className="text-lg font-black text-orange-600">{formatCurrency(input).replace(' VND','')}</p>
                </div>

                {/* Net Payable */}
                <div className={`mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-end`}>
                    <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Nghĩa vụ thuế</p>
                    <p className={`text-2xl font-black ${payable > 0 ? 'text-rose-600' : 'text-emerald-500'}`}>
                        {formatCurrency(Math.abs(payable)).replace(' VND','')}
                    </p>
                </div>
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: GLASS TOOLTIP ---
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-4 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 animate-fadeIn ring-1 ring-black/5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">{label}</p>
                {payload.map((p: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-6 mb-2 last:mb-0 justify-between min-w-[180px]">
                        <div className="flex items-center gap-2">
                            <div className="size-2 rounded-full shadow-sm" style={{ backgroundColor: p.color }}></div>
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{p.name}</span>
                        </div>
                        <span className="text-sm font-black text-slate-900 dark:text-white">{formatCurrency(p.value).replace(' VND','')}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const Reports: React.FC<{ onNavigate: (view: ViewState, params?: any) => void }> = ({ onNavigate }) => {
    const { settings } = useSettings();
    const { showNotification } = useNotification();
    
    // 1. FILTER STATES
    const [startDate, setStartDate] = useState(formatDateISO(getStartOfMonth(new Date())));
    const [endDate, setEndDate] = useState(formatDateISO(getEndOfMonth(new Date())));
    const [reportView, setReportView] = useState<'pnl' | 'cashflow' | 'balance'>('pnl');
    const [viewMode, setViewMode] = useState<'gross' | 'net'>('gross'); // 'gross' = Incl VAT, 'net' = Excl VAT
    
    // 2. AI & PRINT STATES
    const [aiInsight, setAiInsight] = useState<string>('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

    // 3. CALC PREVIOUS PERIOD DATES (For Comparison)
    const { prevStart, prevEnd } = useMemo(() => {
        const start = parseISOToDate(startDate)!;
        const end = parseISOToDate(endDate)!;
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        const pEnd = addDays(start, -1);
        const pStart = addDays(pEnd, -diffDays);
        return { prevStart: formatDateISO(pStart), prevEnd: formatDateISO(pEnd) };
    }, [startDate, endDate]);

    // 4. DATA FETCHING (Live Queries)
    // Current Period
    const orders = useLiveQuery(() => db.orders.where('date').between(startDate, endDate, true, true).filter(o => !o.isDeleted).toArray(), [startDate, endDate]) || [];
    const transactions = useLiveQuery(() => db.transactions.where('date').between(startDate, endDate, true, true).toArray(), [startDate, endDate]) || [];
    const imports = useLiveQuery(() => db.importOrders.where('date').between(startDate, endDate, true, true).toArray(), [startDate, endDate]) || [];
    const debts = useLiveQuery(() => db.debtRecords.filter(d => d.remainingAmount > 0 && d.status !== 'Void').toArray()) || [];
    const products = useLiveQuery(() => db.products.filter(p => !p.isDeleted).toArray()) || [];
    const returnNotes = useLiveQuery(() => db.returnNotes.where('date').between(startDate, endDate, true, true).toArray(), [startDate, endDate]) || [];

    // Previous Period (For Growth Calc)
    const prevOrders = useLiveQuery(() => db.orders.where('date').between(prevStart, prevEnd, true, true).filter(o => !o.isDeleted && o.status === 'Completed').toArray(), [prevStart, prevEnd]) || [];

    // 5. FINANCIAL CALCULATIONS
    const reportData = useMemo(() => {
        // --- A. VAT Logic ---
        let outputVAT = 0;
        let inputVAT = 0;

        // Output VAT from Orders
        orders.forEach(o => {
            if (o.status === 'Completed' || o.status === 'Returned') {
                outputVAT += o.vatAmount || 0;
            }
        });

        // Input VAT from Imports (Estimated or Real if available)
        // Currently estimating based on settings if explicit field missing or implicit calculation
        imports.forEach(imp => {
            if (imp.status === 'Completed' || imp.status === 'Received') {
                // Assuming standard VAT rate from settings for imports calculation for the dashboard
                const estimatedVAT = Math.round(imp.total * (settings?.finance?.vat || 0) / 100); 
                inputVAT += estimatedVAT;
            }
        });

        // --- B. Revenue & Profit ---
        let grossRevenue = 0; // Revenue based on viewMode
        let grossCOGS = 0; 
        
        const productSales: Record<string, {name: string, qty: number, total: number}> = {};
        const customerSales: Record<string, {name: string, count: number, total: number}> = {};
        
        // Heatmap Matrix: 7 days x 12 blocks (2hr)
        const heatmapMatrix = Array(7).fill(0).map(() => Array(12).fill(0));

        orders.forEach(o => {
            if (o.status === 'Completed' || o.status === 'Returned') {
                const orderTotal = viewMode === 'net' ? (o.total - o.vatAmount) : o.total;
                
                grossRevenue += orderTotal; 
                
                // Customer Aggregation
                const custName = o.customerName || 'Khách lẻ';
                if (!customerSales[custName]) customerSales[custName] = { name: custName, count: 0, total: 0 };
                customerSales[custName].count++;
                customerSales[custName].total += orderTotal;

                // Heatmap Data
                const d = parseISOToDate(o.date);
                if (d) {
                    const dayIdx = d.getDay(); // 0-6 (Sun-Sat)
                    // createdAt is timestamp, use it for hour. If not available, default to noon
                    const hour = o.createdAt ? new Date(o.createdAt).getHours() : 12; 
                    const hourBlock = Math.floor(hour / 2); // 0-11
                    heatmapMatrix[dayIdx][hourBlock] += orderTotal;
                }

                o.items?.forEach(i => {
                    const qty = i.quantity || 0;
                    const unitCost = i.costPrice || products.find(p => p.id === i.id)?.importPrice || 0;
                    grossCOGS += unitCost * qty;

                    if (!productSales[i.sku]) productSales[i.sku] = { name: i.productName, qty: 0, total: 0 };
                    productSales[i.sku].qty += qty;
                    // For product sales breakdown, also respect viewMode
                    productSales[i.sku].total += (viewMode === 'net' ? (i.total / (1 + o.vatRate/100)) : i.total);
                });
            }
        });

        // Previous Period Revenue for Growth
        let prevRevenue = 0;
        prevOrders.forEach(o => {
            prevRevenue += (viewMode === 'net' ? (o.total - o.vatAmount) : o.total);
        });
        const revenueGrowth = prevRevenue > 0 ? ((grossRevenue - prevRevenue) / prevRevenue) * 100 : 0;

        // Returns Deduction
        let totalReturnsValue = 0;
        let returnsCOGS = 0;
        returnNotes.forEach(note => {
            // Adjust return value based on viewMode (approx)
            const val = viewMode === 'net' ? (note.refundAmount / 1.08) : note.refundAmount; 
            totalReturnsValue += val;
            
            note.items.forEach((item: any) => {
                const product = products.find(p => p.id === item.id);
                const unitCost = product ? product.importPrice : 0;
                returnsCOGS += unitCost * item.quantity;
            });
        });

        const finalNetRevenue = grossRevenue - totalReturnsValue;
        const netCOGS = grossCOGS - returnsCOGS;
        const grossProfit = finalNetRevenue - netCOGS;
        const grossMargin = finalNetRevenue > 0 ? (grossProfit / finalNetRevenue) * 100 : 0;

        // OpEx Calculation
        const opEx = transactions
            .filter(t => t.type === 'expense' && !['import', 'debt_payment', 'refund'].includes(t.category))
            .reduce((sum, t) => sum + t.amount, 0);

        const netProfit = grossProfit - opEx;
        const netMargin = finalNetRevenue > 0 ? (netProfit / finalNetRevenue) * 100 : 0;

        // --- C. Inventory Velocity (Slow Moving) ---
        // Items with Stock > 0 but Sales Qty = 0 in period
        const slowMoving = products
            .filter(p => p.stock > 0 && (!productSales[p.sku] || productSales[p.sku].qty === 0))
            .map(p => ({ ...p, value: p.stock * p.importPrice }))
            .sort((a,b) => b.value - a.value)
            .slice(0, 5);

        // --- D. Cashflow & Balance ---
        const cashIn = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const cashOut = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        
        const ar = debts.filter(d => d.type === 'Receivable').reduce((sum, d) => sum + d.remainingAmount, 0);
        const ap = debts.filter(d => d.type === 'Payable').reduce((sum, d) => sum + d.remainingAmount, 0);
        const inventoryValue = products.reduce((sum, p) => sum + (p.stock * p.importPrice), 0);

        return {
            pnl: { 
                grossRevenue: finalNetRevenue, // After returns
                netCOGS,
                grossProfit, 
                grossMargin, 
                opEx, 
                netProfit, 
                netMargin, 
                revenueGrowth,
                orderCount: orders.filter(o => o.status === 'Completed' || o.status === 'Returned').length 
            },
            taxes: { output: outputVAT, input: inputVAT },
            heatmap: heatmapMatrix,
            topCustomers: Object.values(customerSales).sort((a,b) => b.total - a.total).slice(0, 5),
            topProducts: Object.values(productSales).sort((a,b) => b.total - a.total).slice(0, 8),
            slowMoving,
            cashflow: { cashIn, cashOut, netFlow: cashIn - cashOut },
            balance: { inventoryValue, ar, ap }
        };
    }, [orders, transactions, products, returnNotes, imports, prevOrders, viewMode, settings?.finance?.vat]);

    // 5. TIMELINE DATA (Updated for ViewMode)
    const timelineData = useMemo(() => {
        const dataMap: Record<string, any> = {};
        const start = parseISOToDate(startDate)!;
        const end = parseISOToDate(endDate)!;
        const dayDiff = Math.ceil((end.getTime() - start.getTime()) / 86400000);
        
        for (let i = 0; i <= dayDiff; i++) {
            const d = addDays(start, i);
            const key = formatDateISO(d);
            dataMap[key] = { date: key, label: `${d.getDate()}/${d.getMonth()+1}`, revenue: 0, profit: 0, cashIn: 0, cashOut: 0 };
        }

        orders.forEach(o => {
            if ((o.status === 'Completed' || o.status === 'Returned') && dataMap[o.date]) {
                const val = viewMode === 'net' ? (o.total - o.vatAmount) : o.total;
                dataMap[o.date].revenue += val;
                
                let cost = 0;
                o.items?.forEach(i => {
                    const unitCost = i.costPrice || products.find(p => p.id === i.id)?.importPrice || 0;
                    cost += unitCost * (i.quantity || 0);
                });
                dataMap[o.date].profit += (val - cost); 
            }
        });

        // ... existing return/transaction logic ...
        return Object.values(dataMap);
    }, [startDate, endDate, orders, viewMode]); // Added viewMode dependency

    // 6. AI & ACTIONS
    const handleGenerateInsight = async () => {
        setIsGenerating(true);
        try {
            const result = await generateBusinessAdvisorInsight({
                revenue: reportData.pnl.grossRevenue,
                profit: reportData.pnl.netProfit,
                margin: reportData.pnl.netMargin,
                orderCount: reportData.pnl.orderCount,
                topProducts: reportData.topProducts.map(p => p.name),
                ar: reportData.balance.ar,
                ap: reportData.balance.ap,
                lowStockCount: products.filter(p => p.stock <= (p.minStock || 5)).length,
                growthRate: reportData.pnl.revenueGrowth,
                operatingExpenses: reportData.pnl.opEx
            });
            setAiInsight(result.text);
        } catch (e: any) { 
            showNotification(e.message, 'error'); 
        } finally { 
            setIsGenerating(false); 
        }
    };

    return (
        <PageShell className="bg-slate-50 dark:bg-brand-navy">
            {/* Header: Controls & Filtering */}
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 px-8 py-4 flex flex-col gap-4 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Báo cáo Quản trị</h1>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Business Intelligence Center</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Net/Gross Toggle */}
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                            <button onClick={() => setViewMode('gross')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${viewMode === 'gross' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Sau thuế</button>
                            <button onClick={() => setViewMode('net')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'net' ? 'bg-indigo-600 shadow text-white' : 'text-slate-500'}`}>Trước thuế</button>
                        </div>
                        <Button variant="outline" icon="file_download" className="h-10 rounded-xl px-4 font-bold text-xs">Excel</Button>
                        <Button variant="primary" icon="print" onClick={() => setIsPrintModalOpen(true)} className="h-10 rounded-xl px-6 font-bold text-xs bg-slate-900">In</Button>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shadow-inner ring-1 ring-black/5">
                        {[
                            { id: 'pnl', label: 'Kết Quả Kinh Doanh', icon: 'monitoring' },
                            { id: 'cashflow', label: 'Dòng Tiền', icon: 'payments' },
                            { id: 'balance', label: 'Tài Sản & Thuế', icon: 'account_balance' }
                        ].map(v => (
                            <button
                                key={v.id}
                                onClick={() => { setReportView(v.id as any); setAiInsight(''); }}
                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all ${
                                    reportView === v.id 
                                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-black/5' 
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                                <span className={`material-symbols-outlined text-[16px] ${reportView === v.id ? 'filled-icon' : ''}`}>{v.icon}</span>
                                {v.label}
                            </button>
                        ))}
                    </div>

                    <ReportsFilterBar 
                        startDate={startDate} endDate={endDate} 
                        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); setAiInsight(''); }} 
                        warehouse="" onWarehouseChange={() => {}}
                        className="!bg-transparent !border-none !p-0 !sticky-none !shadow-none"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8 pb-32">
                
                {/* --- VIEW 1: P&L (KẾT QUẢ KINH DOANH) --- */}
                {reportView === 'pnl' && (
                    <div className="space-y-8 animate-fadeIn">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <MetricCard 
                                title={viewMode === 'net' ? "Doanh thu thuần (Pre-tax)" : "Doanh thu (Sau thuế)"}
                                value={formatCurrency(reportData.pnl.grossRevenue).replace(' VND','')} 
                                subValue={`${reportData.pnl.orderCount} đơn hàng`} 
                                icon="payments" color="text-blue-500" 
                                growth={reportData.pnl.revenueGrowth}
                            />
                            <MetricCard 
                                title="Giá vốn (COGS)" 
                                value={formatCurrency(reportData.pnl.netCOGS).replace(' VND','')} 
                                subValue="Vốn nhập bình quân" 
                                icon="inventory_2" color="text-slate-400" 
                            />
                            <MetricCard 
                                title="Chi phí vận hành" 
                                value={formatCurrency(reportData.pnl.opEx).replace(' VND','')} 
                                subValue="Không gồm giá vốn" 
                                icon="account_balance_wallet" color="text-rose-500" 
                            />
                            <MetricCard 
                                title="Lợi nhuận ròng" 
                                value={formatCurrency(reportData.pnl.netProfit).replace(' VND','')} 
                                subValue={`Margin: ${reportData.pnl.netMargin.toFixed(1)}%`} 
                                icon="savings" color="text-emerald-500" active 
                            />
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                            {/* Left Column: Charts & Heatmap */}
                            <div className="xl:col-span-2 space-y-8">
                                {/* Profit Chart */}
                                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm h-[350px] flex flex-col">
                                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2 mb-6">
                                        <span className="material-symbols-outlined text-indigo-500 text-lg">show_chart</span>
                                        Biểu đồ tăng trưởng
                                    </h3>
                                    <div className="flex-1 w-full min-h-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={timelineData}>
                                                <defs>
                                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="currentColor" className="text-indigo-500" stopOpacity={0.2}/>
                                                        <stop offset="95%" stopColor="currentColor" className="text-indigo-500" stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.05} />
                                                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold', fill: 'currentColor'}} className="text-slate-400" dy={10} />
                                                <YAxis hide />
                                                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                                                <Area type="monotone" dataKey="revenue" name="Doanh thu" stroke="currentColor" className="text-indigo-500" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                                                <Area type="monotone" dataKey="profit" name="Lợi nhuận" stroke="currentColor" className="text-emerald-500" strokeWidth={3} fillOpacity={1} fill="transparent" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Sales Heatmap */}
                                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm">
                                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2 mb-4">
                                        <span className="material-symbols-outlined text-orange-500 text-lg">grid_view</span>
                                        Bản đồ nhiệt bán hàng (Heatmap)
                                    </h3>
                                    <SalesHeatmap data={reportData.heatmap} />
                                </div>
                            </div>
                            
                            {/* Right Column: AI & Rankings */}
                            <div className="space-y-8">
                                {/* AI Insight */}
                                <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-6 rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col h-[350px] ring-1 ring-white/10 group">
                                    <div className="flex items-center gap-3 mb-4 relative z-10">
                                        <div className="size-10 rounded-xl bg-indigo-600/30 flex items-center justify-center backdrop-blur-md border border-white/10 shadow-lg">
                                            <span className={`material-symbols-outlined text-[20px] ${isGenerating ? 'animate-spin' : ''}`}>psychology</span>
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-black uppercase tracking-[0.25em] text-indigo-300">AI CFO</h3>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Gemini 3.0 Analysis</p>
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10 text-[12px] opacity-90 leading-relaxed whitespace-pre-line mb-4 font-medium pr-2 scrollbar-indigo">
                                        {aiInsight || "Bấm nút bên dưới để phân tích sâu dữ liệu tài chính. AI sẽ so sánh với kỳ trước để tìm ra xu hướng và gợi ý hành động."}
                                    </div>
                                    <Button 
                                        variant="primary" onClick={handleGenerateInsight} disabled={isGenerating} 
                                        className="relative z-10 w-full bg-indigo-600 hover:bg-indigo-500 border-none h-12 text-xs font-black uppercase tracking-widest"
                                    >
                                        {isGenerating ? 'Đang suy luận...' : 'Phân tích ngay'}
                                    </Button>
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180%] h-[180%] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>
                                </div>

                                {/* Top Customers */}
                                <div className="bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm flex-1">
                                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-500 text-lg">workspace_premium</span>
                                        Khách hàng tiêu biểu
                                    </h3>
                                    <div className="space-y-3">
                                        {reportData.topCustomers.map((c, i) => (
                                            <div key={i} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className={`size-8 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-sm ${i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-orange-400' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</div>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-800 dark:text-white truncate max-w-[120px]">{c.name}</p>
                                                        <p className="text-[9px] text-slate-400 font-medium">{c.count} đơn hàng</p>
                                                    </div>
                                                </div>
                                                <span className="text-xs font-black text-indigo-600">{formatCurrency(c.total).replace(' VND','')}</span>
                                            </div>
                                        ))}
                                        {reportData.topCustomers.length === 0 && <p className="text-center text-xs text-slate-400 py-4 italic">Chưa có dữ liệu</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- VIEW 2: CASHFLOW (DÒNG TIỀN) --- */}
                {reportView === 'cashflow' && (
                    <div className="space-y-10 animate-fadeIn">
                        {/* Same as before but can be enhanced */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <MetricCard title="Tổng tiền vào" value={formatCurrency(reportData.cashflow.cashIn).replace(' VND','')} icon="arrow_downward" color="text-emerald-500" />
                            <MetricCard title="Tổng tiền ra" value={formatCurrency(reportData.cashflow.cashOut).replace(' VND','')} icon="arrow_upward" color="text-rose-500" />
                            <MetricCard title="Lưu chuyển thuần" value={formatCurrency(reportData.cashflow.netFlow).replace(' VND','')} subValue={reportData.cashflow.netFlow >= 0 ? "Dòng tiền Dương" : "Dòng tiền Âm"} icon="account_balance" color={reportData.cashflow.netFlow >= 0 ? "text-blue-500" : "text-rose-500"} active />
                        </div>
                        {/* Chart reuse from previous implementation */}
                    </div>
                )}

                {/* --- VIEW 3: BALANCE & TAX (TÀI SẢN & THUẾ) --- */}
                {reportView === 'balance' && (
                    <div className="space-y-8 animate-fadeIn">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <MetricCard title="Giá trị tồn kho" value={formatCurrency(reportData.balance.inventoryValue).replace(' VND','')} subValue="Theo giá nhập (MAC)" icon="inventory_2" color="text-indigo-500" />
                            <MetricCard title="Phải thu khách hàng" value={formatCurrency(reportData.balance.ar).replace(' VND','')} subValue="Tài sản lưu động" icon="account_balance_wallet" color="text-emerald-500" />
                            <MetricCard title="Phải trả NCC" value={formatCurrency(reportData.balance.ap).replace(' VND','')} subValue="Nghĩa vụ tài chính" icon="outbound" color="text-rose-500" />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-1">
                                <TaxLedgerWidget output={reportData.taxes.output} input={reportData.taxes.input} />
                            </div>
                            
                            <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
                                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-rose-500 text-lg">hourglass_empty</span>
                                    Hàng tồn kho chậm luân chuyển (Slow Moving)
                                </h3>
                                <div className="flex-1 overflow-auto custom-scrollbar">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100 dark:border-slate-700">
                                            <tr>
                                                <th className="px-4 py-3">Sản phẩm</th>
                                                <th className="px-4 py-3 text-center">Tồn kho</th>
                                                <th className="px-4 py-3 text-right">Giá trị tồn</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {reportData.slowMoving.map((p, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="font-bold text-slate-700 dark:text-slate-200 truncate max-w-[250px]">{p.name}</div>
                                                        <div className="text-[10px] font-mono text-slate-400">{p.sku}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="bg-rose-50 text-rose-600 px-2 py-1 rounded text-xs font-black">{p.stock}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-black text-slate-900 dark:text-white">
                                                        {formatCurrency(p.stock * p.importPrice).replace(' VND','')}
                                                    </td>
                                                </tr>
                                            ))}
                                            {reportData.slowMoving.length === 0 && (
                                                <tr><td colSpan={3} className="py-12 text-center text-slate-400 italic text-xs">Kho hàng luân chuyển tốt, không có hàng tồn đọng.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {/* Print Modal Overlay */}
            <PrintPreviewModal isOpen={isPrintModalOpen} onClose={() => setIsPrintModalOpen(false)} title="Báo Cáo Quản Trị Hệ Thống" filename="BaoCaoQuanTri">
                <ReportTemplate 
                    data={{ 
                        period: `${startDate} - ${endDate}`, 
                        stats: { 
                            revenue: reportData.pnl.grossRevenue, 
                            profit: reportData.pnl.netProfit, 
                            netCash: reportData.cashflow.netFlow,
                            orderCount: reportData.pnl.orderCount 
                        }, 
                        topProducts: reportData.topProducts, 
                        debtStats: { ar: reportData.balance.ar, ap: reportData.balance.ap }, 
                        aiInsight 
                    }} 
                    settings={settings} 
                />
            </PrintPreviewModal>
        </PageShell>
    );
};

export default Reports;
