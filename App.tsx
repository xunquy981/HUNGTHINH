
import React, { useCallback } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Orders from './pages/Orders';
import Quotes from './pages/Quotes';
import DeliveryNotes from './pages/DeliveryNotes';
import Imports from './pages/Imports';
import Inventory from './pages/Inventory';
import Partners from './pages/Partners';
import Debts from './pages/Debts';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import AuditLogs from './pages/AuditLogs';
import SystemLogs from './pages/SystemLogs';
import Settings from './pages/Settings';
import { ViewState } from './types';
import { useSettings } from './contexts/SettingsContext';
import { ToastCenter } from './components/ui/Toast';

// Wrapper to ensure functional components receive navigation state correctly
// Defined OUTSIDE App to prevent re-creation on every render
const PageWrapper = ({ Component, onNavigate }: { Component: React.ComponentType<any>, onNavigate: any }) => {
    const location = useLocation();
    const params = location.state || {};
    // Adding key={location.pathname} ensures that when the route changes, the inner component 
    // is completely remounted, avoiding any state/hook reconciliation issues between different pages.
    return <Component key={location.pathname} onNavigate={onNavigate} initialParams={params} />;
};

const App: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings, toggleTheme, isInitialized } = useSettings();

  // FIX: Hooks must be called before any early return
  const handleNavigate = useCallback((view: ViewState, params?: any) => {
    let path = '/';
    switch (view) {
      case 'DASHBOARD': path = '/'; break;
      case 'POS': path = '/pos'; break;
      case 'ORDERS': path = '/orders'; break;
      case 'QUOTES': path = '/quotes'; break;
      case 'DELIVERY_NOTES': path = '/deliveries'; break;
      case 'IMPORTS': path = '/imports'; break;
      case 'INVENTORY': path = '/inventory'; break;
      case 'INVENTORY_HISTORY': path = '/inventory'; break; 
      case 'PARTNERS': path = '/partners'; break;
      case 'DEBTS': path = '/debts'; break;
      case 'TRANSACTIONS': path = '/transactions'; break;
      case 'REPORTS': path = '/reports'; break;
      case 'SETTINGS': path = '/settings'; break;
      case 'AUDIT_LOGS': path = '/audit'; break;
      case 'SYSTEM_LOGS': path = '/logs'; break;
      default: path = '/';
    }
    navigate(path, { state: params });
  }, [navigate]);

  const getCurrentView = (): ViewState => {
    const path = location.pathname;
    if (path === '/' || path === '/dashboard') return 'DASHBOARD';
    if (path.startsWith('/pos')) return 'POS';
    if (path.startsWith('/orders')) return 'ORDERS';
    if (path.startsWith('/quotes')) return 'QUOTES';
    if (path.startsWith('/deliveries')) return 'DELIVERY_NOTES';
    if (path.startsWith('/imports')) return 'IMPORTS';
    if (path.startsWith('/inventory')) return 'INVENTORY';
    if (path.startsWith('/partners')) return 'PARTNERS';
    if (path.startsWith('/debts')) return 'DEBTS';
    if (path.startsWith('/transactions')) return 'TRANSACTIONS';
    if (path.startsWith('/reports')) return 'REPORTS';
    if (path.startsWith('/audit')) return 'AUDIT_LOGS';
    if (path.startsWith('/logs')) return 'SYSTEM_LOGS';
    if (path.startsWith('/settings')) return 'SETTINGS';
    return 'DASHBOARD';
  };

  const isDark = settings?.appearance?.theme === 'dark';

  if (!isInitialized) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="size-20 rounded-3xl bg-indigo-600 flex items-center justify-center shadow-glow animate-bounce mb-8">
           <span className="material-symbols-outlined text-white text-[40px] filled-icon">rocket_launch</span>
        </div>
        <div className="text-center">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Hưng Thịnh ERP</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-3 animate-pulse">Khởi tạo hệ thống dữ liệu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen w-full overflow-hidden transition-colors duration-700 ${isDark ? 'dark bg-brand-navy' : 'bg-slate-50'}`}>
      <Sidebar 
        currentView={getCurrentView()} 
        onNavigate={handleNavigate} 
      />
      <div className="flex-1 flex flex-col min-w-0 relative">
        <Topbar 
            isDarkMode={isDark} 
            toggleTheme={toggleTheme} 
            onNavigate={handleNavigate} 
            currentView={getCurrentView()}
        />
        <main 
            className="flex-1 overflow-hidden relative bg-white/40 dark:bg-slate-900/20 backdrop-blur-sm"
        >
          <Routes>
            <Route path="/" element={<Dashboard onNavigate={handleNavigate} />} />
            <Route path="/dashboard" element={<Dashboard onNavigate={handleNavigate} />} />
            
            <Route path="/pos" element={<POS onNavigate={handleNavigate} />} />
            
            {/* Consistent use of PageWrapper to prevent unmounting on prop changes */}
            <Route path="/orders" element={<PageWrapper Component={Orders} onNavigate={handleNavigate} />} />
            <Route path="/quotes" element={<PageWrapper Component={Quotes} onNavigate={handleNavigate} />} />
            <Route path="/deliveries" element={<PageWrapper Component={DeliveryNotes} onNavigate={handleNavigate} />} />
            <Route path="/imports" element={<PageWrapper Component={Imports} onNavigate={handleNavigate} />} />
            <Route path="/inventory" element={<PageWrapper Component={Inventory} onNavigate={handleNavigate} />} />
            <Route path="/partners" element={<PageWrapper Component={Partners} onNavigate={handleNavigate} />} />
            <Route path="/debts" element={<PageWrapper Component={Debts} onNavigate={handleNavigate} />} />
            <Route path="/transactions" element={<Transactions onNavigate={handleNavigate} />} />
            <Route path="/reports" element={<Reports onNavigate={handleNavigate} />} />
            <Route path="/audit" element={<AuditLogs onNavigate={handleNavigate} />} />
            <Route path="/logs" element={<SystemLogs />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <ToastCenter />
      </div>
    </div>
  );
};

export default App;
