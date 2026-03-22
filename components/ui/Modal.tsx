
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Primitives';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  closeOnOverlay?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, onClose, title, subtitle, children, footer, size = 'md', closeOnOverlay = true 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      // Small delay to ensure render before animation starts (for transitions)
      requestAnimationFrame(() => setAnimateIn(true));
    } else {
      setAnimateIn(false);
      // Wait for animation to finish before unmounting
      const timer = setTimeout(() => setIsMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') onClose();
    };
    
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isMounted) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
    full: 'max-w-[95vw] h-[92vh]'
  };

  const overlayClass = animateIn ? 'animate-fadeIn' : 'animate-fadeOut';
  const contentClass = animateIn ? 'animate-modal-enter' : 'animate-modal-exit';

  return createPortal(
    <div 
        className={`fixed inset-0 z-modal flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm ${overlayClass}`}
        onClick={(e) => { 
          if(e.target === e.currentTarget && closeOnOverlay) onClose(); 
        }}
    >
      <div 
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full flex flex-col overflow-hidden ring-1 ring-white/10 transform transition-all max-h-[95vh] ${contentClass} ${sizeClasses[size]}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-8 py-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-start bg-white dark:bg-slate-900 shrink-0">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none uppercase">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-bold uppercase tracking-widest">{subtitle}</p>}
          </div>
          <button 
            onClick={onClose} 
            className="size-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-slate-50/30 dark:bg-slate-900/30">
          {children}
        </div>

        {footer && (
          <div className="px-8 py-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end gap-4 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
