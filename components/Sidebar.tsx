
import React, { useMemo } from 'react';
import { ViewState } from '../types';
import { useSidebar } from '../contexts/SidebarContext';
import { useNotification } from '../contexts/NotificationContext';
import { Tooltip } from './ui/Tooltip';
import { TOKENS } from './ui/Tokens';
import { APP_VERSION, APP_NAME } from '../constants/versions';

const Sidebar: React.FC<{ currentView: ViewState; onNavigate: (view: ViewState) => void }> = ({ currentView, onNavigate }) => {
  const { isOpen, toggleSidebar } = useSidebar();
  const { notifications } = useNotification();

  const groups = useMemo(() => [
    {
      label: 'Kinh doanh',
      items: [
        { id: 'DASHBOARD', label: 'Bàn Làm Việc', icon: 'grid_view' },
        { id: 'POS', label: 'Bán Hàng (POS)', icon: 'point_of_sale' },
        { id: 'ORDERS', label: 'Đơn Hàng', icon: 'receipt_long' },
        { id: 'QUOTES', label: 'Báo Giá', icon: 'request_quote' },
        { id: 'REPORTS', label: 'Báo Cáo', icon: 'analytics' },
      ]
    },
    {
      label: 'Kho vận',
      items: [
        { id: 'INVENTORY', label: 'Kho Hàng', icon: 'inventory_2' },
        { id: 'IMPORTS', label: 'Nhập Hàng', icon: 'move_to_inbox' },
        { id: 'DELIVERY_NOTES', label: 'Vận Chuyển', icon: 'local_shipping' },
      ]
    },
    {
      label: 'Tài chính',
      items: [
        { id: 'PARTNERS', label: 'Đối Tác', icon: 'groups' },
        { id: 'DEBTS', label: 'Công Nợ', icon: 'account_balance_wallet' },
        { id: 'TRANSACTIONS', label: 'Sổ Quỹ', icon: 'payments' },
      ]
    },
    {
      label: 'Hệ thống',
      items: [
        { id: 'SETTINGS', label: 'Cấu Hình', icon: 'settings' },
      ]
    }
  ], []);

  return (
    <aside 
      className={`
        h-screen z-sidebar relative
        transition-all duration-500 ease-premium 
        ${isOpen ? 'w-72' : 'w-[88px]'}
      `}
    >
      {/* FLOATING TOGGLE BUTTON (OVERLAY) - Placed outside overflow container */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-4 top-6 z-50 size-8 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-blue-500 dark:hover:white transition-all duration-300 hover:scale-110 cursor-pointer hidden md:flex"
        title={isOpen ? "Thu gọn menu" : "Mở rộng menu"}
      >
         <span className={`material-symbols-outlined text-[18px] transition-transform duration-500 ${!isOpen ? 'rotate-180' : ''}`}>
            chevron_left
         </span>
      </button>

      {/* CONTENT CONTAINER - Handles background & clipping */}
      <div className={`
        h-full w-full flex flex-col overflow-hidden
        bg-gradient-to-b from-blue-400 to-blue-500 dark:from-slate-950 dark:to-slate-950 
        text-white dark:text-slate-400 
        border-r border-white/10 dark:border-slate-900 
        shadow-[4px_0_24px_rgba(59,130,246,0.4)] dark:shadow-none
      `}>
        {/* HEADER SECTION */}
        <div className="h-[80px] flex items-center px-6 shrink-0 overflow-hidden relative z-20 bg-white/10 dark:bg-slate-900/50 backdrop-blur-md shadow-sm border-b border-white/10 dark:border-slate-800">
          <div className="flex items-center gap-4 cursor-pointer group w-full" onClick={() => onNavigate('DASHBOARD')}>
            {/* Logo Box */}
            <div className="size-11 rounded-2xl bg-white dark:bg-indigo-600 text-blue-500 dark:text-white flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.3)] dark:shadow-indigo-500/30 group-hover:scale-110 transition-transform duration-300 border-2 border-white/50 dark:border-transparent shrink-0">
              <span className="material-symbols-outlined text-[28px] filled-icon">rocket_launch</span>
            </div>
            
            <div className={`transition-all duration-500 ${isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none absolute left-20'}`}>
              <h1 className="font-black text-white text-[13px] leading-none drop-shadow-lg tracking-wide uppercase whitespace-nowrap">
                HƯNG THỊNH BEARING
              </h1>
              <div className="mt-1.5 flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 border border-white/30"></span>
                  </span>
                  <span className="text-[9px] font-black text-white/80 dark:text-indigo-300 uppercase tracking-[0.2em] drop-shadow-md whitespace-nowrap bg-white/10 px-2 py-0.5 rounded-lg border border-white/10">
                    ERP PRO 2.0
                  </span>
              </div>
            </div>
          </div>
        </div>

        {/* NAVIGATION LIST */}
        <nav className="flex-1 overflow-y-auto custom-scrollbar px-4 space-y-8 pt-6 pb-10">
          {groups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              {isOpen ? (
                <span className="px-4 text-[10px] font-black text-white/60 dark:text-slate-600 uppercase tracking-[0.25em] drop-shadow-sm dark:drop-shadow-none block whitespace-nowrap">{group.label}</span>
              ) : (
                <div className="h-px bg-white/10 dark:bg-slate-900 mx-4"></div>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = currentView === item.id;
                  const activeAlerts = notifications.filter(n => !n.isDismissed && n.link?.view === item.id);
                  const hasDanger = activeAlerts.some(n => n.severity === 'danger');
                  const hasWarning = activeAlerts.some(n => n.severity === 'warning');
                  
                  return (
                    <Tooltip key={item.id} content={item.label} disabled={isOpen} side="right">
                      <button
                        onClick={() => onNavigate(item.id as ViewState)}
                        className={`w-full flex items-center h-12 px-4 rounded-xl transition-all duration-300 ease-premium relative group/item border-2
                          ${isActive 
                            ? 'bg-white border-indigo-100 text-blue-500 shadow-xl scale-[1.05] dark:bg-indigo-600 dark:border-indigo-400 dark:text-white dark:shadow-indigo-500/30' 
                            : 'border-transparent text-white/80 hover:bg-white/10 hover:text-white hover:border-white/20 hover:shadow-lg hover:scale-[1.02] hover:translate-x-1 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white dark:hover:border-slate-700 dark:hover:shadow-indigo-500/10'
                          }
                        `}
                      >
                        <div className="relative shrink-0">
                          <span className={`material-symbols-outlined text-[22px] transition-transform duration-300 ${isActive ? 'filled-icon scale-110' : 'group-hover/item:scale-110 group-hover/item:rotate-3'}`}>{item.icon}</span>
                          {(hasDanger || hasWarning) && (
                              <span className={`absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-blue-500 dark:border-slate-900 ${hasDanger ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'}`}></span>
                          )}
                        </div>
                        
                        <span className={`ml-4 text-[13px] font-bold whitespace-nowrap transition-all duration-500 ${isOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none absolute left-12'}`}>
                          {item.label}
                        </span>
                        
                        {isActive && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-500 dark:bg-white rounded-l-full"></div>}
                        
                        {(hasDanger || hasWarning) && isOpen && (
                            <div className={`absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${hasDanger ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'bg-amber-400 text-black shadow-lg shadow-amber-400/30'}`}>
                                {activeAlerts.length > 9 ? '9+' : activeAlerts.length}
                            </div>
                        )}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;
