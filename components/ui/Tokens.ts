
// Design Tokens for consistent UI - Modernized for "Easy on Eyes" ERP
export const TOKENS = {
  COLORS: {
    BRAND: {
      PRIMARY: '#0ea5e9', // Sky 500 - Matches new Tailwind config
      SUCCESS: '#10b981', // Emerald 500
      DANGER: '#f43f5e',  // Rose 500
      WARNING: '#f59e0b', // Amber 500
      INFO: '#3b82f6',    // Blue 500
      NAVY: '#0f172a',    // Slate 900 (Custom dark)
    },
    BG: {
      MAIN: 'bg-slate-50 dark:bg-slate-900', // Softer off-white
      SURFACE: 'bg-white dark:bg-slate-900',
      SUBTLE: 'bg-slate-100/70 dark:bg-slate-800/50',
    },
    BORDER: {
      LIGHT: 'border-slate-200/60 dark:border-slate-800',
      FOCUS: 'border-indigo-500 ring-indigo-500/20',
    }
  },
  SPACING: {
    PAGE: 'p-6 lg:p-10', // Slightly reduced for cleaner density
    CARD: 'p-6',
    SECTION: 'space-y-8',
  },
  TEXT: {
    DISPLAY: "text-3xl lg:text-4xl font-black tracking-tight text-slate-900 dark:text-white leading-none",
    HEADING: "text-lg font-bold tracking-tight text-slate-900 dark:text-white",
    SUBHEADING: "text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em]",
    BODY: "text-sm font-medium text-slate-600 dark:text-slate-400 leading-relaxed",
    MONO: "font-mono font-bold text-[12px] tracking-tight",
    CAPTION: "text-xs font-semibold text-slate-500",
  },
  RADIUS: {
    CARD: 'rounded-[2rem]', // Softer, modern corners
    BTN: 'rounded-xl',
    INPUT: 'rounded-xl',
  },
  CARD: {
    BASE: 'bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-[2rem] shadow-sm',
    HOVER: 'hover:shadow-premium hover:-translate-y-1 transition-all duration-300 ease-out',
  },
  BUTTON: {
    BASE: 'inline-flex items-center justify-center gap-2 font-bold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none tracking-wide',
    VARIANT: {
      PRIMARY: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25',
      SECONDARY: 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300',
      DANGER: 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400',
      GHOST: 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800',
      OUTLINE: 'bg-transparent border-2 border-slate-200 text-slate-500 hover:border-indigo-500 hover:text-indigo-600 dark:border-slate-700',
    },
    SIZE: {
      SM: 'h-9 px-4 text-[11px] rounded-lg',
      MD: 'h-11 px-6 text-[12px] rounded-xl',
      LG: 'h-14 px-10 text-[14px] rounded-2xl',
      ICON: 'size-10 rounded-xl',
    }
  },
  INPUT: {
    // Improved input base: Better border color, cleaner focus ring, consistent height
    BASE: 'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 font-bold text-slate-900 dark:text-white placeholder:text-slate-400/60 outline-none transition-all duration-200 ease-out',
    FOCUS: 'focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white dark:focus:bg-slate-900 hover:border-indigo-300 dark:hover:border-indigo-700',
    SIZE: {
      MD: 'h-12 text-sm', // Increased height slightly for better touch targets and modern feel
    }
  },
  TABLE: {
    HEADER: 'bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200/60 dark:border-slate-800',
    HEADER_CELL: 'px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400',
    ROW: 'hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0',
    CELL: 'px-6 py-4 text-sm font-medium text-slate-700 dark:text-slate-300',
  }
};
