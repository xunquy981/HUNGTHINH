
import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: 'right' | 'top' | 'bottom';
  disabled?: boolean;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, side = 'right', disabled = false, className = 'w-full' }) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (disabled) return;
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Simple positioning logic for sidebar (right side)
      if (side === 'right') {
          setCoords({
            top: rect.top + rect.height / 2,
            left: rect.right + 10
          });
      } else if (side === 'top') {
          setCoords({
            top: rect.top - 10,
            left: rect.left + rect.width / 2
          });
      } else if (side === 'bottom') {
          setCoords({
            top: rect.bottom + 10,
            left: rect.left + rect.width / 2
          });
      }
      setVisible(true);
    }
  };

  return (
    <>
      <div 
        ref={triggerRef} 
        onMouseEnter={handleMouseEnter} 
        onMouseLeave={() => setVisible(false)}
        className={className}
      >
        {children}
      </div>
      {visible && createPortal(
        <div 
          className={`fixed z-toast px-2.5 py-1.5 text-[11px] font-bold text-white bg-slate-900 dark:bg-slate-700 rounded-lg shadow-lg pointer-events-none transform animate-[fadeIn_0.1s_ease-out] whitespace-nowrap border border-white/10 ${side === 'right' ? '-translate-y-1/2' : '-translate-x-1/2'}`}
          style={{ top: coords.top, left: coords.left }}
        >
          {content}
          {/* Arrow */}
          {side === 'right' && <div className="absolute top-1/2 -left-1 -translate-y-1/2 border-y-4 border-y-transparent border-r-4 border-r-slate-900 dark:border-r-slate-700"></div>}
          {side === 'top' && <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 border-x-4 border-x-transparent border-t-4 border-t-slate-900 dark:border-t-slate-700"></div>}
          {side === 'bottom' && <div className="absolute top-[-4px] left-1/2 -translate-x-1/2 border-x-4 border-x-transparent border-b-4 border-b-slate-900 dark:border-b-slate-700"></div>}
        </div>,
        document.body
      )}
    </>
  );
};
