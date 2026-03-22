
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface SidebarContextType {
  isOpen: boolean;
  toggleSidebar: () => void;
  setIsOpen: (val: boolean) => void;
  expandedGroups: string[];
  toggleGroup: (label: string) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Trạng thái sidebar chính (Rộng/Hẹp)
  const [isOpen, setIsOpenState] = useState(() => {
    const saved = localStorage.getItem('erp_sidebar_main');
    return saved === null ? true : saved === 'true';
  });

  // Trạng thái các nhóm menu con (Mở/Gập)
  const [expandedGroups, setExpandedGroups] = useState<string[]>(() => {
    const saved = localStorage.getItem('erp_sidebar_groups');
    return saved ? JSON.parse(saved) : ['Kinh doanh', 'Kho vận', 'Tài chính', 'Hệ thống'];
  });

  const setIsOpen = useCallback((val: boolean) => {
    setIsOpenState(val);
    localStorage.setItem('erp_sidebar_main', String(val));
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsOpenState(prev => {
      const next = !prev;
      localStorage.setItem('erp_sidebar_main', String(next));
      return next;
    });
  }, []);

  const toggleGroup = useCallback((label: string) => {
    setExpandedGroups(prev => {
      const next = prev.includes(label) 
        ? prev.filter(g => g !== label) 
        : [...prev, label];
      localStorage.setItem('erp_sidebar_groups', JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{ isOpen, toggleSidebar, setIsOpen, expandedGroups, toggleGroup }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used within SidebarProvider');
  return context;
};
