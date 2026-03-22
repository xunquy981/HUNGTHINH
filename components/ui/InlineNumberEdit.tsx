
import React, { useState, useEffect, useRef, memo } from 'react';

interface InlineNumberEditProps {
  value: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => React.ReactNode;
  className?: string;
  inputClassName?: string;
  align?: 'left' | 'center' | 'right';
  disabled?: boolean;
  autoFocus?: boolean;
}

export const InlineNumberEdit: React.FC<InlineNumberEditProps> = memo(({
  value,
  onChange,
  onBlur,
  min = 0,
  max,
  step = 1,
  format,
  className = '',
  inputClassName = '',
  align = 'left',
  disabled = false,
  autoFocus = false
}) => {
  const safeValue = typeof value === 'number' && !isNaN(value) ? value : 0;
  
  const [isEditing, setIsEditing] = useState(autoFocus);
  const [inputValue, setInputValue] = useState(safeValue.toString());
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync state when entering edit mode
  useEffect(() => {
    if (isEditing) {
        setInputValue(safeValue === 0 ? '' : safeValue.toString());
        // Focus and select
        requestAnimationFrame(() => {
            if (inputRef.current) {
                inputRef.current.focus();
                inputRef.current.select();
            }
        });
    }
  }, [isEditing, safeValue]);

  const commit = () => {
    let finalValue = safeValue;
    const raw = inputValue.trim();

    if (raw === '' || raw === '-' || raw === '.') {
       finalValue = min !== undefined ? min : 0;
    } else {
        const num = parseFloat(raw);
        if (!isNaN(num)) {
            finalValue = num;
            if (min !== undefined && finalValue < min) finalValue = min;
            if (max !== undefined && finalValue > max) finalValue = max;
        }
    }

    if (finalValue !== safeValue) {
        onChange(finalValue);
    }
    
    setIsEditing(false);
    if (onBlur) onBlur();
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value;
      if (/^-?\d*(\.\d*)?$/.test(val)) {
          if (val.length > 1 && val.startsWith('0') && val[1] !== '.') {
              val = val.substring(1);
          } else if (val.length > 2 && val.startsWith('-0') && val[2] !== '.') {
              val = '-' + val.substring(2);
          }
          setInputValue(val);
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
      setInputValue(safeValue.toString());
      if (onBlur) onBlur();
    }
  };

  if (disabled) {
      return (
        <div 
            className={`text-${align} ${className} opacity-60 cursor-not-allowed font-bold`}
            ref={containerRef} // Keep ref stable even when disabled if possible
        >
            {format ? format(safeValue) : safeValue.toLocaleString('vi-VN')}
        </div>
      );
  }

  return (
    <div 
        ref={containerRef}
        className={`relative ${isEditing ? 'w-full min-w-[60px]' : 'cursor-text group inline-flex items-center hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg px-2 py-1 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 transition-all duration-200 min-h-[28px] min-w-[40px]'} justify-${align === 'right' ? 'end' : align === 'center' ? 'center' : 'start'} ${className}`}
        onClick={(e) => { 
            if (!isEditing) {
                e.stopPropagation(); 
                setIsEditing(true); 
            }
        }}
        title={!isEditing ? "Click để sửa" : ""}
    >
      {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={handleTextChange}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            className={`
                w-full bg-white dark:bg-slate-800 border-2 border-indigo-500 rounded-lg 
                px-2 py-1 text-sm font-black outline-none 
                ring-4 ring-indigo-500/10 shadow-lg text-${align} animate-[scaleIn_0.1s_ease-out]
                ${inputClassName}
            `}
          />
      ) : (
          <>
            <span className="truncate select-none">{format ? format(safeValue) : safeValue.toLocaleString('vi-VN')}</span>
            <span className="material-symbols-outlined text-[12px] text-indigo-500 opacity-0 group-hover:opacity-100 ml-1 transition-opacity">edit</span>
          </>
      )}
    </div>
  );
});
