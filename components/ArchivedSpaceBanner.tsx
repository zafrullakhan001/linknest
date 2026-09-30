import React from 'react';
import { Tile } from '../types';
import { countSpaceContents, formatLifecycleDate } from '../utils/spaceLifecycle';

export interface ArchivedSpaceBannerProps {
  tile: Tile;
  onUnarchive: () => void;
  onBack: () => void;
}

/**
 * Banner shown when an archived space is opened (from the Archive tab or a direct link):
 * states that the space is archived, when and by whom, and offers to unarchive it.
 */
export const ArchivedSpaceBanner: React.FC<ArchivedSpaceBannerProps> = ({ tile, onUnarchive, onBack }) => {
  const { tabs, sections, links } = countSpaceContents(tile);
  const archivedLabel = formatLifecycleDate(tile.archivedAt);
  const archiverLabel = tile.archivedByName || (tile.archivedBy ? `user #${tile.archivedBy}` : '');

  return (
    <div className="mb-6 rounded-2xl border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 p-4 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="text-2xl shrink-0" aria-hidden>📦</span>
          <div className="min-w-0">
            <p className="font-semibold text-sky-900 dark:text-sky-100">This space is archived</p>
            <p className="text-sm text-sky-800 dark:text-sky-200">
              {archivedLabel ? `Archived ${archivedLabel}` : 'Archived'}
              {archiverLabel ? ` by ${archiverLabel}` : ''}
            </p>
            <p className="text-sm text-sky-800 dark:text-sky-200">
              {tabs} tab(s) · {sections} section(s) · {links} link(s)
            </p>
            <p className="text-xs text-sky-700 dark:text-sky-300 mt-1">
              Archived spaces stay out of the normal tabs. Unarchive it to make it live again.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onUnarchive}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white transition-colors"
          >
            Unarchive
          </button>
          <button
            type="button"
            onClick={onBack}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Back to Archive
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArchivedSpaceBanner;
