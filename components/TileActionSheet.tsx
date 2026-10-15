import React, { useEffect } from 'react';
import { Tile } from '../types';
import { haptics } from '../utils/haptics';

export interface TileActionSheetAction {
  id: string;
  label: string;
  /** Short helper line under the label. */
  hint?: string;
  icon: React.ReactNode;
  /** Renders in red (destructive). */
  danger?: boolean;
  onSelect: () => void;
}

interface TileActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tile: Tile | null;
  actions: TileActionSheetAction[];
}

/**
 * Bottom action sheet shown on long-press of a home-grid tile.
 *
 * Phones had no per-space menu at all — every action required opening the
 * space first. This mirrors the desktop hover toolbar (Open / new tab /
 * favorite / share / edit / info) in a thumb-reachable sheet.
 */
export const TileActionSheet: React.FC<TileActionSheetProps> = ({
  isOpen,
  onClose,
  tile,
  actions,
}) => {
  // Escape closes (desktop testing / attached keyboards).
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose]);

  // Freeze background scroll while the sheet is up.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen || !tile) return null;

  return (
    <div className="fixed inset-0 z-[10050] md:hidden" role="dialog" aria-modal="true" aria-label={`${tile.title} actions`}>
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close actions"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/50 backdrop-blur-[1px]"
      />

      <div
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white pb-[calc(0.75rem+var(--ln-safe-bottom,0px))] shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in slide-in-from-bottom duration-200"
        style={{ paddingLeft: 'var(--ln-safe-left, 0px)', paddingRight: 'var(--ln-safe-right, 0px)' }}
      >
        {/* Grab handle */}
        <div className="flex justify-center pt-2.5 pb-1.5" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>

        {/* Space header */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-2xl dark:bg-slate-800">
            {tile.emojiImage ? (
              <img src={tile.emojiImage} alt="" className="h-full w-full object-contain p-0.5" />
            ) : (
              tile.emoji || '✨'
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {tile.title || 'Untitled'}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {tile.group ? `${tile.group} · ` : ''}
              {tile.visibility === 'private' ? 'Private' : tile.visibility === 'authenticated' ? 'Signed-in' : 'Public'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="py-1.5">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                haptics.tap();
                onClose();
                action.onSelect();
              }}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors touch-manipulation active:bg-slate-100 dark:active:bg-slate-800 ${
                action.danger
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-700 dark:text-slate-200'
              }`}
              style={{ minHeight: '48px' }}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
                {action.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-tight">{action.label}</span>
                {action.hint ? (
                  <span className="mt-0.5 block text-[11px] leading-tight text-slate-400 dark:text-slate-500">
                    {action.hint}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>

        {/* Cancel */}
        <div className="px-3 pt-1.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-700 transition-colors active:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:active:bg-slate-700 touch-manipulation"
            style={{ minHeight: '48px' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default TileActionSheet;
