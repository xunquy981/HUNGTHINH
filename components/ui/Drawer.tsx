
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Primitives';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg' | 'xl' | '2xl';
  hideBackdrop?: boolean;
}

export const DrawerSection: React.FC<{ 
  title: string; 
  children: React.ReactNode; 
  action?: React.ReactNode; 
  className?: string 
}> = ({ title, children, action, className = '' }) => (
  <div className={`space-y-3 ${className}`}>
    <div className="flex justify-between items-center">
      <h3 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">{title}</h3>
      {action && <div>{action}</div>}
    </div>
    {children}
  </div>
);

export const Drawer: React.FC<DrawerProps> = ({ 
  isOpen, onClose, title, subtitle, children, footer, width = 'xl', hideBackdrop = false 
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      // Small delay to ensure render before animation starts
      requestAnimationFrame(() => setAnimateIn(true));
    } else {
      setAnimateIn(false);
      // Wait for animation to finish before unmounting (matches slideOutRight duration)
      const timer = setTimeout(() => setIsMounted(false), 250); 
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') onClose();
    };
    
    if (isOpen) {
        // Khóa scroll khi mở
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
    } else {
        document.body.style.overflow = '';
    }

    return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isMounted) return null;

  const widthClasses = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl'
  };

  const backdropClass = animateIn ? 'opacity-100' : 'opacity-0';
  const panelAnimation = animateIn ? 'animate-slideInRight' : 'animate-slideOutRight';

  return createPortal(
    <div className="fixed inset-0 z-drawer flex justify-end outline-none" role="dialog" aria-modal="true">
      {/* BACKDROP */}
      <div 
        className={`absolute inset-0 transition-opacity duration-300 ${backdropClass} ${
            hideBackdrop 
            ? 'bg-transparent pointer-events-none' 
            : 'bg-slate-900/30 backdrop-blur-[2px] pointer-events-auto'
        }`} 
        onClick={onClose}
        aria-hidden="true"
      />

      {/* DRAWER PANEL */}
      <div 
        ref={drawerRef}
        className={`h-full w-full ${widthClasses[width]} bg-white dark:bg-slate-900 shadow-[-15px_0_30px_rgba(0,0,0,0.15)] flex flex-col ${panelAnimation} border-l border-slate-200 dark:border-slate-800 outline-none relative z-50`} 
        onClick={e => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start bg-white dark:bg-slate-900 sticky top-0 z-20 shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight truncate uppercase tracking-tight">{title}</h2>
            {subtitle && <div className="mt-1 text-[11px] font-bold text-slate-400 uppercase tracking-widest">{subtitle}</div>}
          </div>
          <button 
            onClick={onClose} 
            className="rounded-full size-9 flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-white dark:bg-slate-950">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 flex gap-3 sticky bottom-0 z-20 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
