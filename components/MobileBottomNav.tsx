import React from 'react';
import { haptics } from '../utils/haptics';

export interface MobileBottomNavItem {
  id: string;
  label: string;
  /** Rendered icon element (20px svg). */
  icon: React.ReactNode;
  /** Optional count badge, e.g. pending invitations. */
  badge?: number;
  /** Tabs the visitor cannot open right now (role/setting gated). */
  disabled?: boolean;
}

interface MobileBottomNavProps {
  items: MobileBottomNavItem[];
  activeTab: string;
  onSelect: (tabId: string) => void;
  /** Opens the existing slide-in drawer for everything not in the bar. */
  onOpenMore: () => void;
  /** True while the "More" drawer is open, so the button reads as active. */
  moreActive?: boolean;
}

/**
 * Thumb-reachable primary navigation for phones.
 *
 * Before this, every tab sat 2+ taps deep inside the hamburger drawer (which
 * your screenshot shows). The bar keeps the four highest-traffic tabs one tap
 * away; Admin / QR / Updates / Archive / Recycle Bin stay in the drawer.
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  items,
  activeTab,
  onSelect,
  onOpenMore,
  moreActive = false,
}) => {
  const visible = items.filter((item) => !item.disabled);
  if (visible.length === 0) return null;

  return (
    <nav
      className="linknest-mobile-bottomnav fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 md:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-3xl items-stretch">
        {visible.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                haptics.tap();
                onSelect(item.id);
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 transition-colors touch-manipulation ${
                isActive
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800'
              }`}
              style={{ minHeight: '52px' }}
            >
              {isActive && (
                <span
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-500"
                  aria-hidden="true"
                />
              )}
              <span className="relative">
                {item.icon}
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-4 text-white">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            haptics.tap();
            onOpenMore();
          }}
          aria-current={moreActive ? 'page' : undefined}
          className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 transition-colors touch-manipulation ${
            moreActive
              ? 'text-brand-600 dark:text-brand-400'
              : 'text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800'
          }`}
          style={{ minHeight: '52px' }}
        >
          <span className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d="M3 5a2 2 0 012-2h1a2 2 0 012 2v1a2 2 0 01-2 2H5a2 2 0 01-2-2V5zM3 14a2 2 0 012-2h1a2 2 0 012 2v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1zM13 5a2 2 0 012-2h1a2 2 0 012 2v1a2 2 0 01-2 2h-1a2 2 0 01-2-2V5zM13 14a2 2 0 012-2h1a2 2 0 012 2v1a2 2 0 01-2 2h-1a2 2 0 01-2-2v-1z" />
            </svg>
          </span>
          <span className="text-[10px] font-medium leading-none">More</span>
        </button>
      </div>
    </nav>
  );
};

export default MobileBottomNav;
