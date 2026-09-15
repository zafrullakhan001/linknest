import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type AddLinkMenuVariant = 'icon' | 'text' | 'button';

interface AddLinkMenuProps {
  onAddLink?: () => void;
  onBulkAdd?: () => void;
  /** Optional: open delete-duplicates dialog for this section */
  onDeleteDuplicates?: () => void;
  disabled?: boolean;
  /** icon = section header +; text = hierarchy "+ Add Link"; button = edit-mode brand button */
  variant?: AddLinkMenuVariant;
  className?: string;
  title?: string;
}

/**
 * Compact menu: Add link | Bulk add links | Delete duplicate links.
 * Used on section headers (view), edit Add Link, and hierarchy tree.
 */
export const AddLinkMenu: React.FC<AddLinkMenuProps> = ({
  onAddLink,
  onBulkAdd,
  onDeleteDuplicates,
  disabled = false,
  variant = 'icon',
  className = '',
  title = 'Add link',
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const menuWidth = 200;
    const margin = 8;
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - margin) {
      left = Math.max(margin, rect.right - menuWidth);
    }
    setPos({ top: rect.bottom + 4, left });
  };

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => updatePosition();
    const onScroll = () => updatePosition();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerClass =
    variant === 'icon'
      ? `p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all ${className}`
      : variant === 'button'
        ? `bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg shadow-brand-500/30 hover:shadow-brand-500/40 flex items-center justify-center gap-2 ${className}`
        : `text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5 ${className}`;

  return (
    <div ref={wrapRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          setOpen((v) => !v);
        }}
        className={`${triggerClass} disabled:opacity-50`}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {variant === 'icon' && (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden>
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
        )}
        {variant === 'text' && <>+ Add Link</>}
        {variant === 'button' && (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Link
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 opacity-80" aria-hidden>
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[9999] min-w-[12.5rem] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-1 text-sm"
            style={{ top: pos.top, left: pos.left }}
          >
            {onAddLink && (
              <button
                type="button"
                role="menuitem"
                className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  onAddLink();
                }}
              >
                Add link
              </button>
            )}
            {onBulkAdd && (
              <button
                type="button"
                role="menuitem"
                className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  onBulkAdd();
                }}
              >
                Bulk add links
              </button>
            )}
            {onDeleteDuplicates && (
              <button
                type="button"
                role="menuitem"
                className="w-full text-left px-3 py-2 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  onDeleteDuplicates();
                }}
              >
                Delete duplicate links
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
