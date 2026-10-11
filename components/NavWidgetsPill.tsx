import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { NavWidgetItem } from './navWidgetItems';

/**
 * Desktop nav "widgets pill".
 *
 * Renders the widget toggle icons inside a rounded pill. When the nav is tight
 * (`collapse`), only the first `headCount` icons stay inline and the remaining
 * ones move into an overflow ("…") menu, so the centered brand is never covered.
 * Every widget therefore stays reachable at any window width.
 */

const BUTTON_BASE = 'p-2 rounded-full transition-all linknest-nav-icon';
const BUTTON_ACTIVE = 'bg-white dark:bg-slate-700 text-brand-500 shadow-sm';
const BUTTON_IDLE =
  'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400';

interface NavWidgetsPillProps {
  items: NavWidgetItem[];
  /** Move the tail icons into the overflow menu. */
  collapse: boolean;
  /** Icons kept inline while collapsed. */
  headCount: number;
  /** Ref to the pill container (measured by the nav layout hook). */
  pillRef?: React.Ref<HTMLDivElement>;
  /** Ref to one icon button, used to predict the expanded pill width. */
  iconProbeRef?: React.Ref<HTMLButtonElement>;
}

export const NavWidgetsPill: React.FC<NavWidgetsPillProps> = ({
  items,
  collapse,
  headCount,
  pillRef,
  iconProbeRef,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const visibleItems = collapse ? items.slice(0, headCount) : items;
  const overflowItems = collapse ? items.slice(headCount) : [];
  const overflowActive = overflowItems.some((item) => item.active);

  // Close the overflow menu whenever the pill re-expands.
  useEffect(() => {
    if (!collapse) setMenuOpen(false);
  }, [collapse]);

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
  };

  useLayoutEffect(() => {
    if (menuOpen) updateMenuPosition();
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const onReflow = () => updateMenuPosition();
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  if (items.length === 0) return null;

  return (
    <div
      ref={pillRef}
      className="flex items-center gap-0.5 bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-full p-1 shadow-sm backdrop-blur-sm"
    >
      {visibleItems.map((item, index) => (
        <button
          key={item.id}
          type="button"
          ref={index === 0 ? iconProbeRef : undefined}
          onClick={item.onToggle}
          className={`${BUTTON_BASE} ${item.active ? BUTTON_ACTIVE : BUTTON_IDLE}`}
          title={item.title}
          aria-label={item.title}
          aria-pressed={item.active}
        >
          {item.icon}
        </button>
      ))}
      {overflowItems.length > 0 && (
        <button
          type="button"
          ref={triggerRef}
          onClick={() => setMenuOpen((open) => !open)}
          className={`${BUTTON_BASE} relative ${menuOpen || overflowActive ? BUTTON_ACTIVE : BUTTON_IDLE}`}
          title={`More widgets (${overflowItems.length})`}
          aria-label={`More widgets (${overflowItems.length})`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4 sm:w-5 sm:h-5"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="2"></circle>
            <circle cx="12" cy="12" r="2"></circle>
            <circle cx="19" cy="12" r="2"></circle>
          </svg>
          {overflowActive && !menuOpen && (
            <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-brand-500 ring-2 ring-white dark:ring-slate-900" />
          )}
        </button>
      )}

      {menuOpen &&
        overflowItems.length > 0 &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="More widgets"
            className="fixed z-[9999] min-w-[13rem] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-1"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            {overflowItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  item.onToggle();
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                title={item.title}
              >
                <span
                  className={item.active ? 'text-brand-500' : 'text-slate-500 dark:text-slate-400'}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.active && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-500">
                    On
                  </span>
                )}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};
