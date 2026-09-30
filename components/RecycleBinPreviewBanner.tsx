import React from 'react';
import { Tile } from '../types';
import { countSpaceContents, formatLifecycleDate } from '../utils/spaceLifecycle';

export interface RecycleBinPreviewBannerProps {
  tile: Tile;
  onRestore: () => void;
  onDeleteForever: () => void;
  onBack: () => void;
}

/**
 * Read-only banner shown when a soft-deleted space is opened from the Recycle Bin.
 * Admins may open any recycled space; regular users only their own.
 */
export const RecycleBinPreviewBanner: React.FC<RecycleBinPreviewBannerProps> = ({
  tile,
  onRestore,
  onDeleteForever,
  onBack,
}) => {
  const { tabs, sections, links } = countSpaceContents(tile);
  const deletedLabel = formatLifecycleDate(tile.deletedAt);

  return (
    <div className="mb-6 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="text-2xl shrink-0" aria-hidden>🗑️</span>
          <div className="min-w-0">
            <p className="font-semibold text-amber-900 dark:text-amber-100">In Recycle Bin — read-only preview</p>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {deletedLabel ? `Deleted ${deletedLabel} · ` : ''}
              {tabs} tab(s) · {sections} section(s) · {links} link(s)
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              The contents below are shown for reference only. Restore the space to edit it, or delete it permanently.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRestore}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white transition-colors"
          >
            Restore
          </button>
          <button
            type="button"
            onClick={onDeleteForever}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-red-300 dark:border-red-800 bg-white dark:bg-slate-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete forever
          </button>
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Back to Recycle Bin
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecycleBinPreviewBanner;
