import React, { useEffect } from 'react';
import { haptics } from '../utils/haptics';

interface MobileWidgetHostProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Full-height sheet that hosts a widget panel on phones.
 *
 * The desktop floating wrappers (FloatingClock, FloatingCalculatorWidget, ...)
 * position themselves with absolute left/top and a drag handle — unusable on a
 * phone and they trap pointer events mid-scroll. This renders the *same* widget
 * component inside a scrollable bottom sheet instead.
 */
export const MobileWidgetHost: React.FC<MobileWidgetHostProps> = ({
  isOpen,
  title,
  onClose,
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previous;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10070] md:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close widget"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/50 backdrop-blur-[1px]"
      />

      <div
        className="absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        style={{ paddingLeft: 'var(--ln-safe-left, 0px)', paddingRight: 'var(--ln-safe-right, 0px)' }}
      >
        <div className="flex justify-center pt-2.5" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>

        <div className="flex items-center justify-between px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={() => {
              haptics.tap();
              onClose();
            }}
            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300 touch-manipulation"
            style={{ minHeight: '44px' }}
          >
            Done
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(0.75rem+var(--ln-safe-bottom,0px))] pt-1"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default MobileWidgetHost;
