
import React, { useState } from 'react';
import { useApp as useAppContext } from '../../hooks/useApp';
import { ViewState } from '../../types';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Primitives';
import { formatRelativeTime } from '../../utils/helpers';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../services/db';
import { generateNotificationSummary } from '../../services/ai';

interface NotificationsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (view: ViewState, params?: any) => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({ isOpen, onClose, onNavigate }) => {
    const { notifications, dismissNotification, clearAllNotifications, showNotification } = useAppContext();
    const [filter, setFilter] = useState<'all' | 'danger' | 'warning' | 'info'>('all');
    const [aiSummary, setAiSummary] = useState<string>('');
    const [isThinking, setIsThinking] = useState(false);

    const filteredNotifications = notifications.filter(n => {
        if (filter === 'all') return true;
        return n.severity === filter;
    });

    const unreadCount = notifications.filter(n => !n.isDismissed).length;

    const handleAiBriefing = async () => {
        if (notifications.length === 0) {
            setAiSummary("Hiện tại không có thông báo nào để phân tích.");
            return;
        }
        setIsThinking(true);
        try {
            const summary = await generateNotificationSummary(notifications.filter(n => !n.isDismissed).slice(0, 15));
            setAiSummary(summary);
        } catch (e) {
            showNotification("Không thể tổng hợp thông tin.", "error");
        } finally {
            setIsThinking(false);
        }
    };

    const getEmptyMessage = () => {
        if (notifications.length === 0) return 'HỆ THỐNG SẠCH SẼ - KHÔNG CÓ TIN MỚI';
        switch(filter) {
            case 'danger': return 'TUYỆT VỜI! KHÔNG CÓ VẤN ĐỀ NGUY CẤP';
            case 'warning': return 'KHÔNG CÓ CẢNH BÁO NÀO';
            case 'info': return 'KHÔNG CÓ TIN VẬN HÀNH';
            default: return 'DANH SÁCH TRỐNG';
        }
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="Trung tâm điều hành"
            subtitle={`${unreadCount} tin chưa đọc`}
            width="md"
            footer={
                <div className="flex justify-between items-center w-full px-2">
                    <button 
                        onClick={clearAllNotifications}
                        className="text-xs font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
                        Xóa tất cả
                    </button>
                    <Button 
                        variant="primary" 
                        size="md" 
                        onClick={onClose} 
                        className="bg-blue-600 px-10 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20"
                    >
                        Đóng
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                {/* AI Briefing Card */}
                {notifications.length > 0 && !aiSummary && (
                    <div className="p-4 bg-gradient-to-r from-indigo-600 to-purple-700 rounded-2xl shadow-lg text-white flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/20">
                                <span className={`material-symbols-outlined text-[20px] ${isThinking ? 'animate-spin' : ''}`}>
                                    {isThinking ? 'sync' : 'auto_awesome'}
                                </span>
                            </div>
                            <div>
                                <h4 className="text-sm font-bold">Tổng hợp thông minh</h4>
                                <p className="text-[10px] opacity-80">Dùng AI để tóm tắt các vấn đề cần xử lý</p>
                            </div>
                        </div>
                        <button 
                            onClick={handleAiBriefing}
                            disabled={isThinking}
                            className="px-4 py-2 bg-white text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-indigo-50 transition-all disabled:opacity-70"
                        >
                            {isThinking ? 'Đang suy nghĩ...' : 'Phân tích ngay'}
                        </button>
                    </div>
                )}

                {aiSummary && (
                    <div className="p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 relative animate-fadeIn">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400">psychology</span>
                            <h4 className="text-xs font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-widest">Báo cáo tóm tắt từ AI</h4>
                        </div>
                        <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line font-medium">
                            {aiSummary}
                        </div>
                        <button 
                            onClick={() => setAiSummary('')}
                            className="absolute top-3 right-3 text-slate-400 hover:text-indigo-600"
                        >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                    </div>
                )}

                {/* Filter Tabs */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 sticky top-0 bg-white dark:bg-slate-900 z-10 py-2">
                    {[
                        { id: 'all', label: 'TẤT CẢ' },
                        { id: 'danger', label: 'NGUY CẤP' },
                        { id: 'warning', label: 'CẢNH BÁO' },
                        { id: 'info', label: 'VẬN HÀNH' }
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id as any)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${
                                filter === f.id 
                                ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white text-white dark:text-slate-900 shadow-md' 
                                : 'bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Notifications List */}
                <div className="space-y-3 pb-4">
                    {filteredNotifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 animate-fadeIn opacity-50">
                            <span className="material-symbols-outlined text-[64px] text-slate-300 dark:text-slate-700 mb-4">
                                check_circle
                            </span>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center">
                                {getEmptyMessage()}
                            </p>
                        </div>
                    ) : (
                        filteredNotifications.map(n => (
                            <div 
                                key={n.id} 
                                onClick={() => { 
                                    if(n.link) onNavigate(n.link.view, n.link.params); 
                                    dismissNotification(n.id);
                                    if(!n.link) onClose();
                                }}
                                className={`p-4 rounded-2xl border transition-all flex gap-4 cursor-pointer relative group ${
                                    n.isDismissed 
                                    ? 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 opacity-60' 
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm hover:border-blue-400 hover:shadow-md'
                                }`}
                            >
                                <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm border ${
                                    n.severity === 'danger' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                                    n.severity === 'warning' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                                    'bg-blue-50 text-blue-600 border-blue-100'
                                }`}>
                                    <span className={`material-symbols-outlined text-[24px] ${!n.isDismissed ? 'filled-icon' : ''}`}>
                                        {n.severity === 'danger' ? 'error' : n.severity === 'warning' ? 'warning' : 'info'}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0 py-0.5">
                                    <div className="flex justify-between items-start">
                                        <h4 className={`text-sm font-bold leading-tight truncate pr-6 ${n.isDismissed ? 'text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                                            {n.title}
                                        </h4>
                                        {!n.isDismissed && <span className="size-2 rounded-full bg-blue-500 shrink-0 mt-1"></span>}
                                    </div>
                                    <p className={`text-xs mt-1.5 line-clamp-2 leading-relaxed ${n.isDismissed ? 'text-slate-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                        {n.message}
                                    </p>
                                    <div className="flex items-center justify-between mt-3">
                                        <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{formatRelativeTime(n.timestamp)}</span>
                                        {n.link && (
                                            <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-md group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                                Xử lý <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                                
                                <button 
                                    onClick={(e) => { e.stopPropagation(); dismissNotification(n.id); }}
                                    className="absolute top-2 right-2 p-1.5 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all opacity-0 group-hover:opacity-100"
                                    title="Đánh dấu đã đọc"
                                >
                                    <span className="material-symbols-outlined text-[16px]">check</span>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </Drawer>
    );
};
