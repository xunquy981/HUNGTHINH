
import React, { useState, useEffect, useRef } from 'react';
import { ViewState, SearchResult } from '../types';
import { useApp as useAppContext } from '../hooks/useApp';
import { CommandPalette } from './CommandPalette'; 
import AIChat from './AIChat';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import { VoiceCommandButton } from './VoiceCommandButton';
import { useSidebar } from '../contexts/SidebarContext';
import { TOKENS } from './ui/Tokens';

interface TopbarProps {
  isDarkMode: boolean;
  toggleTheme: () => void;
  onNavigate: (view: ViewState, params?: any) => void;
  currentView: ViewState;
}

const Topbar: React.FC<TopbarProps> = ({ isDarkMode, toggleTheme, onNavigate, currentView }) => {
  const { setIsOpen: setSidebarOpen } = useSidebar();
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  
  const { results, isSearching } = useGlobalSearch(searchQuery);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setIsPaletteOpen(true); }
      if (e.key === 'Escape') setIsDropdownOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) setIsDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getPageTitle = () => {
      switch(currentView) {
          case 'DASHBOARD': return { title: 'Bàn làm việc', icon: 'grid_view', color: 'from-blue-600 to-indigo-600' };
          case 'POS': return { title: 'BÁN HÀNG', icon: 'point_of_sale', color: 'from-emerald-500 to-teal-600' };
          case 'ORDERS': return { title: 'Đơn hàng', icon: 'receipt_long', color: 'from-blue-500 to-blue-700' };
          case 'QUOTES': return { title: 'Báo giá', icon: 'request_quote', color: 'from-violet-500 to-purple-600' };
          case 'DELIVERY_NOTES': return { title: 'Vận chuyển', icon: 'local_shipping', color: 'from-cyan-500 to-blue-600' };
          case 'INVENTORY': return { title: 'Kho hàng', icon: 'inventory_2', color: 'from-orange-500 to-rose-600' };
          case 'PARTNERS': return { title: 'Đối tác', icon: 'groups', color: 'from-indigo-500 to-purple-600' };
          case 'DEBTS': return { title: 'Công nợ', icon: 'account_balance_wallet', color: 'from-rose-500 to-red-700' };
          case 'TRANSACTIONS': return { title: 'Sổ quỹ', icon: 'payments', color: 'from-teal-500 to-emerald-600' };
          case 'IMPORTS': return { title: 'Nhập hàng', icon: 'move_to_inbox', color: 'from-amber-500 to-orange-600' };
          case 'REPORTS': return { title: 'Báo cáo', icon: 'analytics', color: 'from-violet-500 to-fuchsia-600' };
          case 'SETTINGS': return { title: 'Cấu hình', icon: 'settings', color: 'from-slate-500 to-slate-700' };
          default: return { title: 'Hệ thống', icon: 'dashboard', color: 'from-blue-600 to-indigo-600' };
      }
  };
  const pageInfo = getPageTitle();

  const handleResultClick = (result: SearchResult) => {
      onNavigate(result.view, { highlightId: (result as any).highlightId || result.id, code: (result as any).code });
      setIsDropdownOpen(false);
      setSearchQuery('');
  };

  return (
    <header className="h-[80px] shrink-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-2xl border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 sticky top-0 z-topbar shadow-sm">
      
      <div className="flex items-center gap-6 shrink-0">
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="size-11 flex items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden transition-all active:scale-90 border border-slate-200 dark:border-slate-700"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          
          <div className="hidden md:flex items-center gap-4" key={currentView}>
              <div className={`size-11 rounded-2xl bg-gradient-to-br ${pageInfo.color} text-white flex items-center justify-center shadow-lg shadow-blue-500/20 animate-premium`}>
                <span className="material-symbols-outlined text-[24px] filled-icon">{pageInfo.icon}</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] leading-none opacity-60">
                        Hưng Thịnh ERP
                    </span>
                    {/* Online Indicator Badge */}
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${isOnline ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>
                        <div className={`size-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                        <span className="text-[8px] font-black uppercase tracking-tighter">{isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                </div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">
                    {pageInfo.title}
                </h2>
              </div>
          </div>
      </div>

      <div className="flex-1 max-w-3xl mx-12 relative hidden sm:block" ref={searchContainerRef}>
        <div className="relative group">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 material-symbols-outlined text-[20px] group-focus-within:text-brand-primary transition-colors">search</span>
            <input 
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }}
                className="w-full pl-12 pr-20 py-3.5 rounded-2xl bg-slate-100/50 dark:bg-slate-800/50 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-brand-primary/30 focus:ring-8 focus:ring-brand-primary/5 outline-none transition-all font-bold text-sm text-slate-900 dark:text-white placeholder:text-slate-400 shadow-inner-soft"
                placeholder="Tra cứu thông minh (⌘K)..."
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-1.5 pointer-events-none">
                <kbd className="h-5 px-1.5 flex items-center justify-center rounded border border-slate-300 dark:border-slate-600 font-mono text-[9px] font-black text-slate-400 bg-white dark:bg-slate-800 shadow-sm">⌘</kbd>
                <kbd className="h-5 px-1.5 flex items-center justify-center rounded border border-slate-300 dark:border-slate-600 font-mono text-[9px] font-black text-slate-400 bg-white dark:bg-slate-800 shadow-sm">K</kbd>
            </div>
        </div>

        {isDropdownOpen && searchQuery.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-3 bg-white dark:bg-slate-900 rounded-3xl shadow-premium-dark border border-slate-200 dark:border-slate-800 overflow-hidden z-[100] animate-premium max-h-[60vh] overflow-y-auto custom-scrollbar ring-1 ring-black/5">
                {isSearching ? (
                    <div className="p-12 text-center flex flex-col items-center gap-4">
                        <span className="material-symbols-outlined animate-spin text-brand-primary text-[32px]">progress_activity</span>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Đang truy xuất dữ liệu...</p>
                    </div>
                ) : results.length > 0 ? (
                    <div className="py-4">
                        <div className="px-6 py-2 mb-2"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60">Kết quả tốt nhất ({results.length})</span></div>
                        {results.map((result) => (
                            <button 
                                key={result.id} 
                                onClick={() => handleResultClick(result)} 
                                className="w-full text-left px-6 py-4 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 flex items-center gap-4 border-l-4 border-transparent hover:border-brand-primary transition-all group"
                            >
                                <div className="size-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-brand-primary group-hover:text-white transition-all shadow-inner">
                                    <span className="material-symbols-outlined text-[22px]">{result.icon}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[14px] font-black text-slate-900 dark:text-white truncate group-hover:translate-x-1 transition-transform">{result.title}</p>
                                    <p className="text-[10px] text-slate-500 truncate uppercase font-bold tracking-tight mt-1">{result.subtitle}</p>
                                </div>
                                <span className="material-symbols-outlined text-slate-300 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">arrow_forward</span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="p-20 text-center flex flex-col items-center">
                        <span className="material-symbols-outlined text-slate-200 dark:text-slate-700 text-[64px] mb-4">search_off</span>
                        <p className="text-slate-400 text-[11px] font-black uppercase tracking-[0.2em]">Không tìm thấy đối tượng nào</p>
                    </div>
                )}
            </div>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
            <VoiceCommandButton onNavigate={onNavigate} onSearchTrigger={(q) => { setSearchQuery(q); setIsDropdownOpen(true); }} />
            <AIChat currentView={currentView} />
            
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-2"></div>
            
            <button 
                onClick={toggleTheme}
                className="size-11 rounded-2xl flex items-center justify-center text-slate-500 hover:text-brand-primary dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all group active:scale-90 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 shadow-sm"
                title="Đổi giao diện"
            >
                <span className={`material-symbols-outlined text-[22px] transition-transform duration-700 group-hover:rotate-180 ${isDarkMode ? 'filled-icon' : ''}`}>
                    {isDarkMode ? 'light_mode' : 'dark_mode'}
                </span>
            </button>
        </div>
      </div>

      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} onNavigate={onNavigate} />
    </header>
  );
};

export default Topbar;
