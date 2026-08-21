import React from 'react';

export type FormAccent = 'sky' | 'amber' | 'teal' | 'emerald' | 'violet' | 'indigo' | 'rose';

const ACCENTS: Record<FormAccent, { bar: string; iconBg: string; card: string; ring: string }> = {
  sky: {
    bar: 'bg-sky-500',
    iconBg: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    card: 'bg-gradient-to-br from-sky-50 to-slate-50 dark:from-sky-950/30 dark:to-slate-900/50 border-sky-100 dark:border-sky-900/40',
    ring: 'ring-sky-200/50 dark:ring-sky-800/30',
  },
  amber: {
    bar: 'bg-amber-500',
    iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    card: 'bg-gradient-to-br from-amber-50 to-slate-50 dark:from-amber-950/30 dark:to-slate-900/50 border-amber-100 dark:border-amber-900/40',
    ring: 'ring-amber-200/50 dark:ring-amber-800/30',
  },
  teal: {
    bar: 'bg-teal-500',
    iconBg: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    card: 'bg-gradient-to-br from-teal-50 to-slate-50 dark:from-teal-950/30 dark:to-slate-900/50 border-teal-100 dark:border-teal-900/40',
    ring: 'ring-teal-200/50 dark:ring-teal-800/30',
  },
  emerald: {
    bar: 'bg-emerald-500',
    iconBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    card: 'bg-gradient-to-br from-emerald-50 to-slate-50 dark:from-emerald-950/30 dark:to-slate-900/50 border-emerald-100 dark:border-emerald-900/40',
    ring: 'ring-emerald-200/50 dark:ring-emerald-800/30',
  },
  violet: {
    bar: 'bg-violet-500',
    iconBg: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    card: 'bg-gradient-to-br from-violet-50 to-slate-50 dark:from-violet-950/30 dark:to-slate-900/50 border-violet-100 dark:border-violet-900/40',
    ring: 'ring-violet-200/50 dark:ring-violet-800/30',
  },
  indigo: {
    bar: 'bg-indigo-500',
    iconBg: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    card: 'bg-gradient-to-br from-indigo-50 to-slate-50 dark:from-indigo-950/30 dark:to-slate-900/50 border-indigo-100 dark:border-indigo-900/40',
    ring: 'ring-indigo-200/50 dark:ring-indigo-800/30',
  },
  rose: {
    bar: 'bg-rose-500',
    iconBg: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    card: 'bg-gradient-to-br from-rose-50 to-slate-50 dark:from-rose-950/30 dark:to-slate-900/50 border-rose-100 dark:border-rose-900/40',
    ring: 'ring-rose-200/50 dark:ring-rose-800/30',
  },
};

export const FormSection: React.FC<{
  emoji: string;
  title: string;
  accent?: FormAccent;
  children: React.ReactNode;
  className?: string;
}> = ({ emoji, title, accent = 'sky', children, className = '' }) => {
  const styles = ACCENTS[accent];
  return (
    <section className={className}>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2.5 flex items-center gap-2">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm ${styles.iconBg}`} aria-hidden="true">
          {emoji}
        </span>
        <span className={`w-1 h-4 rounded-full ${styles.bar}`} />
        {title}
      </h3>
      <div className={`rounded-xl border p-3.5 space-y-3.5 ring-1 ${styles.card} ${styles.ring}`}>
        {children}
      </div>
    </section>
  );
};

export const FormLabel: React.FC<{
  emoji?: string;
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}> = ({ emoji, children, htmlFor, className = '' }) => (
  <label
    htmlFor={htmlFor}
    className={`block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5 ${className}`}
  >
    {emoji && <span className="text-sm leading-none" aria-hidden="true">{emoji}</span>}
    {children}
  </label>
);

export const SpaceModalHeader: React.FC<{
  emoji: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}> = ({ emoji, eyebrow, title, subtitle, onClose, onMouseDown }) => (
  <div
    className="-mx-6 -mt-6 mb-5 px-5 sm:px-6 py-4 flex items-start justify-between gap-3 cursor-move select-none shrink-0 border-b border-sky-100 dark:border-slate-700 bg-gradient-to-r from-sky-50 via-white to-indigo-50 dark:from-slate-800 dark:via-slate-800 dark:to-indigo-950/40 rounded-t-2xl"
    onMouseDown={onMouseDown}
  >
    <div className="flex items-start gap-3 min-w-0">
      <div
        className="h-11 w-11 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/20 flex items-center justify-center text-xl shrink-0"
        aria-hidden="true"
      >
        {emoji}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-sky-700/80 dark:text-sky-300/80">
          {eyebrow}
        </p>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate" title={title}>
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
    </div>
    <button
      type="button"
      onClick={onClose}
      className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer relative shrink-0"
      style={{ zIndex: 100000 }}
      aria-label="Close"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
      </svg>
    </button>
  </div>
);

export const EditModalTabButton: React.FC<{
  active: boolean;
  emoji: string;
  label: React.ReactNode;
  onClick: () => void;
}> = ({ active, emoji, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-colors border-b-2 rounded-t-lg ${
      active
        ? 'text-sky-700 dark:text-sky-300 border-sky-500 bg-sky-50/80 dark:bg-sky-950/30'
        : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
    }`}
  >
    <span aria-hidden="true">{emoji}</span>
    {label}
  </button>
);
