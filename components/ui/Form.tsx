
import React, { useState, useEffect, useRef } from 'react';
import { TOKENS } from './Tokens';

interface FormFieldProps {
  label?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  hint?: string;
}

export const FormField: React.FC<FormFieldProps> = ({ label, error, required, children, className = '', hint }) => (
  <div className={`flex flex-col gap-2 ${className}`}>
    {label && (
      <label className={`text-[10px] font-black uppercase tracking-widest flex justify-between items-center ${error ? 'text-rose-500' : 'text-slate-500 dark:text-slate-400'}`}>
        <span>{label} {required && <span className="text-rose-500 ml-0.5">*</span>}</span>
        {hint && <span className="normal-case font-bold text-[9px] opacity-50 tracking-normal">{hint}</span>}
      </label>
    )}
    <div className="relative">
        {children}
    </div>
    {error && (
        <span className="text-[10px] font-bold text-rose-500 animate-[fadeIn_0.2s_ease-out] flex items-center gap-1.5 mt-1.5">
            <span className="material-symbols-outlined text-[14px]">error</span>
            {error}
        </span>
    )}
  </div>
);

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  icon?: string;
}

export const FormInput = React.forwardRef<HTMLInputElement, InputProps>(({ className = '', error, icon, ...props }, ref) => (
  <div className="relative group w-full">
    {icon && (
        <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 group-focus-within:text-indigo-600 transition-colors text-[20px] pointer-events-none">
            {icon}
        </span>
    )}
    <input 
        ref={ref}
        autoComplete="off"
        className={`
            ${TOKENS.INPUT.BASE} 
            ${TOKENS.INPUT.FOCUS} 
            ${TOKENS.INPUT.SIZE.MD} 
            ${icon ? 'pl-12' : 'px-5'} 
            ${error ? '!border-rose-500 !ring-rose-500/10' : ''} 
            ${props.disabled ? 'bg-slate-50 dark:bg-slate-900/50 cursor-not-allowed opacity-60' : ''}
            ${className}
        `} 
        {...props} 
    />
  </div>
));

export const NumericInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'onChange' | 'value'> & { 
    value: number; 
    onChange: (val: number) => void;
    suffix?: string;
    startAdornment?: React.ReactNode;
}>(({ value, onChange, className = '', error, suffix, startAdornment, ...props }, ref) => {
    const [displayValue, setDisplayValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    // Sync external value changes when not focused
    useEffect(() => {
        if (!isFocused) {
            setDisplayValue(value ? value.toLocaleString('vi-VN') : '');
        }
    }, [value, isFocused]);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        // Show raw number on focus for easier editing
        setDisplayValue(value === 0 ? '' : value.toString());
        setTimeout(() => e.target.select(), 0); // Auto-select text
        props.onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        // Format on blur
        setDisplayValue(value ? value.toLocaleString('vi-VN') : '');
        props.onBlur?.(e);
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        
        // Allow clearing the input
        if (raw === '') {
            setDisplayValue('');
            onChange(0);
            return;
        }

        // Validate: Only allow numbers, dots, and minus sign
        if (/^[0-9.-]*$/.test(raw)) {
            setDisplayValue(raw);
            
            // Clean logic: Remove dots (thousand separators if user typed them manually)
            const clean = raw.replace(/\./g, '');
            const num = parseFloat(clean);
            
            if (!isNaN(num)) {
                onChange(num);
            }
        }
    };

    return (
        <div className="relative group w-full">
            {startAdornment && (
                <div className="absolute left-0 top-0 bottom-0 flex items-center pl-3 pointer-events-none z-10">
                    {startAdornment}
                </div>
            )}
            <input 
                ref={ref}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={displayValue}
                onChange={handleTextChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                className={`
                    ${TOKENS.INPUT.BASE} ${TOKENS.INPUT.FOCUS} ${TOKENS.INPUT.SIZE.MD} px-5 
                    text-right font-black tracking-tight text-lg font-mono
                    ${error ? '!border-rose-500 !ring-rose-500/10' : ''}
                    ${suffix ? 'pr-14' : 'pr-5'}
                    ${startAdornment ? 'pl-10' : ''}
                    ${className}
                `}
                placeholder="0"
                {...props}
            />
            {suffix && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase pointer-events-none group-focus-within:text-indigo-600 transition-colors bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                    {suffix}
                </span>
            )}
        </div>
    );
});

export const FormSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }>(({ className = '', error, children, ...props }, ref) => (
  <div className="relative w-full group">
    {/* Custom Arrow Icon - Absolute Positioned */}
    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-colors z-10">
        <span className="material-symbols-outlined text-[20px]">expand_more</span>
    </div>
    
    <select 
      ref={ref}
      className={`
        appearance-none w-full
        ${TOKENS.INPUT.BASE} ${TOKENS.INPUT.FOCUS} ${TOKENS.INPUT.SIZE.MD} 
        pl-5 pr-10 cursor-pointer font-bold
        ${error ? '!border-rose-500 !ring-rose-500/10' : ''}
        ${className}
      `} 
      {...props}
    >
      {children}
    </select>
  </div>
));

export const FormTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean, icon?: string }>(({ className = '', error, icon, ...props }, ref) => (
  <div className="relative group w-full">
    {icon && (
        <span className="absolute left-4 top-5 material-symbols-outlined text-slate-400 group-focus-within:text-indigo-600 transition-colors text-[20px] pointer-events-none">
            {icon}
        </span>
    )}
    <textarea 
        ref={ref}
        className={`
            ${TOKENS.INPUT.BASE} ${TOKENS.INPUT.FOCUS} 
            ${icon ? 'pl-12 pr-5 py-4' : 'p-5'} 
            min-h-[120px] resize-none font-medium leading-relaxed
            ${error ? '!border-rose-500 !ring-rose-500/10' : ''} 
            ${className}
        `} 
        {...props} 
    />
  </div>
));
