
import React from 'react';
import { AnomalyAlert } from '../../services/ai';
import { ViewState } from '../../types';

interface AnomalyWidgetProps {
    alerts: AnomalyAlert[];
    isScanning: boolean;
    lastScan: number;
    onNavigate: (view: ViewState, params?: any) => void;
}

export const AnomalyWidget: React.FC<AnomalyWidgetProps> = ({ alerts, isScanning, lastScan, onNavigate }) => {
    if (!isScanning && alerts.length === 0) return null;

    return (
        <div className="bg-slate-900 text-white rounded-[2rem] p-6 shadow-xl relative overflow-hidden animate-[fadeIn_0.5s_ease-out] w-full">
            <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex items-center gap-2">
                    <div className={`size-8 rounded-full flex items-center justify-center ${isScanning ? 'bg-indigo-500/20' : 'bg-red-500/20'}`}>
                        <span className={`material-symbols-outlined text-[18px] ${isScanning ? 'animate-spin text-indigo-400' : 'text-red-400'}`}>
                            {isScanning ? 'sync' : 'health_and_safety'}
                        </span>
                    </div>
                    <div>
                        <h3 className="font-bold text-sm">Giám sát rủi ro AI</h3>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                            {isScanning ? 'Đang quét hệ thống...' : `Cập nhật: ${new Date(lastScan).toLocaleTimeString()}`}
                        </p>
                    </div>
                </div>
            </div>

            <div className="space-y-3 relative z-10">
                {isScanning ? (
                    <div className="space-y-2">
                        <div className="h-2 bg-slate-700 rounded-full w-3/4 animate-pulse"></div>
                        <div className="h-2 bg-slate-700 rounded-full w-1/2 animate-pulse"></div>
                    </div>
                ) : (
                    <div className="max-h-[120px] overflow-y-auto custom-scrollbar pr-1 space-y-2">
                        {alerts.map((alert, idx) => (
                            <div key={idx} className="bg-white/5 border border-white/10 p-3 rounded-xl hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`size-2 rounded-full ${alert.severity === 'high' ? 'bg-red-500' : 'bg-amber-500'} animate-pulse`}></span>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">{alert.type}</span>
                                </div>
                                <p className="text-xs font-bold leading-tight mb-1">{alert.message}</p>
                                {alert.actionLabel && (
                                    <button 
                                        onClick={() => {
                                            if (alert.type === 'debt') onNavigate('DEBTS');
                                            else if (alert.type === 'margin') onNavigate('REPORTS');
                                            else if (alert.type === 'inventory') onNavigate('INVENTORY');
                                        }}
                                        className="text-[9px] text-blue-400 font-bold uppercase hover:underline flex items-center gap-1 mt-2"
                                    >
                                        {alert.actionLabel} <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/20 blur-[60px] rounded-full pointer-events-none -mr-10 -mt-10"></div>
        </div>
    );
};
