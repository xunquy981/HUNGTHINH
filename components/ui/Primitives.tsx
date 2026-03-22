
import React from 'react';
import { TOKENS } from './Tokens';

// --- PAGE LAYOUT ---

export const PageShell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex flex-col h-full w-full relative overflow-hidden bg-slate-50 dark:bg-brand-navy mx-auto max-w-[2560px] animate-premium ${className}`}>
    {children}
  </div>
);

export const PageHeader: React.FC<{ 
  title: string; 
  subtitle?: string; 
  actions?: React.ReactNode; 
  className?: string 
}> = ({ title, subtitle, actions, className = '' }) => (
  <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 px-8 py-6 shrink-0 bg-white dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 relative z-10 ${className}`}>
    <div>
      <h1 className={`${TOKENS.TEXT.HEADING} animate-[slideInLeft_0.4s_ease-out]`}>{title}</h1>
      {subtitle && <p className={TOKENS.TEXT.CAPTION + " mt-1.5 opacity-60"}>{subtitle}</p>}
    </div>
    {actions && <div className="flex items-center gap-3 animate-[slideInRight_0.4s_ease-out]">{actions}</div>}
  </div>
);

// --- CONTAINERS ---

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ 
  children, className = '', noPadding = false, ...props 
}) => (
  <div className={`${TOKENS.CARD.BASE} ${TOKENS.CARD.HOVER} hover:-translate-y-1.5 active:scale-[0.99] transition-all duration-300 ${className}`} {...props}>
    <div className={noPadding ? '' : 'p-6'}>{children}</div>
  </div>
);

// --- INTERACTIVE ---

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  icon?: string;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ 
  children, variant = 'primary', size = 'md', icon, loading, className = '', ...props 
}, ref) => {
  const variantClass = variant === 'primary' ? TOKENS.BUTTON.VARIANT.PRIMARY :
                       variant === 'secondary' ? TOKENS.BUTTON.VARIANT.SECONDARY :
                       variant === 'danger' ? TOKENS.BUTTON.VARIANT.DANGER :
                       variant === 'ghost' ? TOKENS.BUTTON.VARIANT.GHOST :
                       TOKENS.BUTTON.VARIANT.OUTLINE;
                       
  const sizeClass = size === 'sm' ? TOKENS.BUTTON.SIZE.SM :
                    size === 'lg' ? TOKENS.BUTTON.SIZE.LG :
                    size === 'icon' ? TOKENS.BUTTON.SIZE.ICON :
                    TOKENS.BUTTON.SIZE.MD;

  return (
    <button 
        ref={ref} 
        className={`${TOKENS.BUTTON.BASE} ${variantClass} ${sizeClass} hover:shadow-lg active:scale-95 transition-all duration-200 ${className}`} 
        disabled={loading || props.disabled} 
        {...props}
    >
      {loading ? (
        <span className="material-symbols-outlined animate-spin text-[1.3em]">progress_activity</span>
      ) : icon ? (
        <span className="material-symbols-outlined text-[1.3em]">{icon}</span>
      ) : null}
      {children}
    </button>
  );
});

// --- FEEDBACK & STATUS ---

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ 
  children, variant = 'info', size = 'sm', className = '', ...props 
}) => {
  const variants = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
    warning: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
    danger: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50',
    info: 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/50',
    neutral: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  };

  const sizes = {
    sm: 'px-2.5 py-1 text-[9px]',
    md: 'px-3.5 py-1.5 text-[10px]',
  };

  return (
    <span 
      className={`inline-flex items-center font-black uppercase tracking-widest border rounded-xl transition-all duration-300 ${variants[variant]} ${sizes[size]} ${className}`} 
      {...props}
    >
      {children}
    </span>
  );
};

export const SearchInput = React.forwardRef<HTMLInputElement, { 
  value: string; 
  onChange: (val: string) => void; 
  placeholder?: string;
  className?: string;
}>(({ value, onChange, placeholder = "Tìm kiếm nhanh...", className = '' }, ref) => (
  <div className={`relative group w-full ${className}`}>
    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 material-symbols-outlined text-[20px] transition-colors group-focus-within:text-brand-primary">
      search
    </span>
    <input 
      ref={ref}
      value={value} 
      onChange={e => onChange(e.target.value)} 
      className={`${TOKENS.INPUT.BASE} ${TOKENS.INPUT.FOCUS} ${TOKENS.INPUT.SIZE.MD} pl-12 pr-10 focus:shadow-glow transition-all`}
      placeholder={placeholder} 
    />
    {value && (
        <button onClick={() => onChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 size-8 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-all flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
    )}
  </div>
));
