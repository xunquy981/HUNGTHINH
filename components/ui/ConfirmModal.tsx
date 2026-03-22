
import React, { useEffect, useRef } from 'react';
import { Button } from './Primitives';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  isOpen, title, message, confirmLabel = 'Xác nhận', cancelLabel = 'Hủy', 
  onConfirm, onCancel, type = 'info' 
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
        setTimeout(() => cancelBtnRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const themes = {
    danger: {
      icon: 'report',
      iconClass: 'text-red-600 bg-red-100 dark:bg-red-900/30',
      btnClass: 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/30',
      border: 'border-red-100 dark:border-red-900/30'
    },
    warning: {
      icon: 'warning',
      iconClass: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
      btnClass: 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/30',
      border: 'border-orange-100 dark:border-orange-900/30'
    },
    info: {
      icon: 'info',
      iconClass: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
      btnClass: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/30',
      border: 'border-blue-100 dark:border-blue-900/30'
    }
  };

  const theme = themes[type];

  return (
    <div className="fixed inset-0 z-alert flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
      <div className={`bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden transform animate-[scaleIn_0.2s_ease-out] border ${theme.border}`}>
        <div className="p-8 text-center">
            <div className={`size-16 rounded-full mx-auto mb-6 flex items-center justify-center ${theme.iconClass}`}>
                <span className="material-symbols-outlined text-[32px]">{theme.icon}</span>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">{title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{message}</p>
        </div>
        <div className="px-8 py-6 bg-slate-50 dark:bg-slate-800/50 flex gap-4 border-t border-slate-100 dark:border-slate-800">
          <Button ref={cancelBtnRef} variant="secondary" className="flex-1 rounded-2xl h-12" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant="primary" className={`flex-1 rounded-2xl h-12 ${theme.btnClass}`} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
};
