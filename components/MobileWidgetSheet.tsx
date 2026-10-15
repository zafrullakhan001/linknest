import React, { useEffect } from 'react';
import { haptics } from '../utils/haptics';

export interface MobileWidgetSheetItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface MobileWidgetSheetProps {
  isOpen: boolean;
  onClose: () => void;
  items: MobileWidgetSheetItem[];
  activeId?: string | null;
  onSelect: (id: string) => void;
}

/**
 * Bottom sheet launcher for the phone-safe widget subset.
 *
 * Desktop shows widgets as draggable floating panels in the nav pill. Phones
 * had nothing (App.tsx gated every widget behind !isMobile); this sheet opens
 * the same widget components inside an 85vh rounded panel instead.
 */
export const MobileWidgetSheet: React.FC<MobileWidgetSheetProps> = ({
  isOpen,
  onClose,
  items,
  activeId = null,
  onSelect,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10060] md:hidden" role="dialog" aria-modal="true" aria-label="Widgets">
      <button
        type="button"
        aria-label="Close widgets"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/50 backdrop-blur-[1px]"
      />

      <div
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white pb-[calc(0.75rem+var(--ln-safe-bottom,0px))] shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        style={{ paddingLeft: 'var(--ln-safe-left, 0px)', paddingRight: 'var(--ln-safe-right, 0px)' }}
      >
        <div className="flex justify-center pt-2.5 pb-1.5" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>

        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Widgets</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 touch-manipulation"
            style={{ minHeight: '44px' }}
          >
            Done
          </button>
        </div>

        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No widgets are enabled for your account.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 p-3">
            {items.map((item) => {
              const active = activeId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    haptics.tap();
                    onSelect(item.id);
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-xl px-2 py-3.5 transition-colors touch-manipulation ${active
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-slate-600 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800'
                    }`}
                  style={{ minHeight: '76px' }}
                >
                  <span className="flex h-6 w-6 items-center justify-center" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="text-center text-[10px] font-medium leading-tight">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileWidgetSheet;
