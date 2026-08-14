import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COLOR_STYLES, ThemeColor } from '../types';
import { getDisplayUrl } from '../utils/urlDisplay';
import {
  PublicBookmarksData,
  PublicBookmarkCategory,
  PublicBookmarkLink,
  getPublicBookmarks,
  countPublicBookmarkLinks,
  importPublicBookmarksFromHtml,
  downloadPublicBookmarksHtml,
  regeneratePublicBookmarksByDomain,
  movePublicBookmarkCategory,
  movePublicBookmarkLink,
  removePublicBookmarkLink,
  removePublicBookmarkCategory,
  renamePublicBookmarkCategory,
  clearPublicBookmarks
} from '../services/publicBookmarksService';
import {
  useTileAnimation,
  getTileAnimationClass,
  getTileDecorationClass
} from './TileAnimationSelector';

interface PublicBookmarksPanelProps {
  compact?: boolean;
  onChange?: () => void;
}

const isThemeColor = (value: string | undefined): value is ThemeColor =>
  !!value && Object.prototype.hasOwnProperty.call(COLOR_STYLES, value);

const resolveTheme = (value: string | undefined) =>
  COLOR_STYLES[isThemeColor(value) ? value : 'sky'];

export const PublicBookmarksPanel: React.FC<PublicBookmarksPanelProps> = ({
  compact = false,
  onChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { animation, decoration } = useTileAnimation();
  const animationClass = getTileAnimationClass(animation);
  const decorationClass = getTileDecorationClass(decoration);
  const fullAnimationClass = `${animationClass} ${decorationClass}`.trim();
  const tileAnimatedClass = animationClass ? 'linknest-tile-animated' : '';

  const [data, setData] = useState<PublicBookmarksData>(() => getPublicBookmarks());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [openSpaceId, setOpenSpaceId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setData(getPublicBookmarks());
    onChange?.();
  }, [onChange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const linkCount = countPublicBookmarkLinks(data);
  const isSearching = searchQuery.trim().length > 0;
  const q = searchQuery.trim().toLowerCase();

  const openSpace = useMemo(
    () => (openSpaceId ? data.categories.find((c) => c.id === openSpaceId) || null : null),
    [data.categories, openSpaceId]
  );

  // Keep detail view in sync if the open space disappears
  useEffect(() => {
    if (openSpaceId && !data.categories.some((c) => c.id === openSpaceId)) {
      setOpenSpaceId(null);
    }
  }, [data.categories, openSpaceId]);

  const filteredSpaces = useMemo(() => {
    if (!q) return data.categories;
    return data.categories.filter((cat) => {
      if (cat.title.toLowerCase().includes(q)) return true;
      return cat.links.some(
        (link) =>
          link.title.toLowerCase().includes(q) ||
          link.url.toLowerCase().includes(q) ||
          getDisplayUrl(link.url).toLowerCase().includes(q)
      );
    });
  }, [data.categories, q]);

  const openSpaceLinks = useMemo(() => {
    if (!openSpace) return [] as PublicBookmarkLink[];
    if (!q) return openSpace.links;
    return openSpace.links.filter(
      (link) =>
        link.title.toLowerCase().includes(q) ||
        link.url.toLowerCase().includes(q) ||
        getDisplayUrl(link.url).toLowerCase().includes(q) ||
        openSpace.title.toLowerCase().includes(q)
    );
  }, [openSpace, q]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const existing = countPublicBookmarkLinks();
    if (existing > 0) {
      const ok = window.confirm(
        `Replace your ${existing} saved bookmark link(s) with this HTML file?\n\nThis only affects Your Bookmarks in this browser.`
      );
      if (!ok) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    setBusy(true);
    setMessage(null);
    try {
      const result = await importPublicBookmarksFromHtml(file);
      setOpenSpaceId(null);
      refresh();
      setMessage(result.message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRegenerate = () => {
    if (linkCount === 0) return;
    const ok = window.confirm(
      'Re-group all bookmarks by website domain? Your custom space order and renames will be reset.'
    );
    if (!ok) return;
    setOpenSpaceId(null);
    setData(regeneratePublicBookmarksByDomain());
    onChange?.();
    setMessage('Bookmarks re-grouped into domain spaces.');
  };

  const handleClear = () => {
    if (linkCount === 0) return;
    const ok = window.confirm(
      `Clear all ${linkCount} bookmark link(s) from this browser? This cannot be undone.`
    );
    if (!ok) return;
    clearPublicBookmarks();
    setOpenSpaceId(null);
    refresh();
    setMessage('Your Bookmarks were cleared.');
  };

  const handleExport = () => {
    if (linkCount === 0) return;
    const result = downloadPublicBookmarksHtml(data);
    setMessage(result.message);
  };

  const handleDeleteSpace = (cat: PublicBookmarkCategory) => {
    const n = cat.links.length;
    const ok = window.confirm(
      `Delete space “${cat.title}” and its ${n} link${n === 1 ? '' : 's'}?\n\nThis only removes it from Your Bookmarks in this browser.`
    );
    if (!ok) return;
    const next = removePublicBookmarkCategory(cat.id);
    setData(next);
    onChange?.();
    if (openSpaceId === cat.id) {
      setOpenSpaceId(null);
    }
    setMessage(`Deleted space “${cat.title}”.`);
  };

  const handleMoveSpace = (categoryId: string, direction: 'up' | 'down') => {
    setData(movePublicBookmarkCategory(categoryId, direction));
    onChange?.();
  };

  const handleMoveLink = (
    categoryId: string,
    linkId: string,
    direction: 'left' | 'right'
  ) => {
    setData(movePublicBookmarkLink(categoryId, linkId, direction));
    onChange?.();
  };

  const handleRemoveLink = (categoryId: string, linkId: string) => {
    const next = removePublicBookmarkLink(categoryId, linkId);
    setData(next);
    onChange?.();
    if (!next.categories.some((c) => c.id === categoryId)) {
      setOpenSpaceId(null);
    }
  };

  const startRename = (cat: PublicBookmarkCategory) => {
    setEditingCategoryId(cat.id);
    setEditTitle(cat.title);
  };

  const commitRename = () => {
    if (!editingCategoryId) return;
    setData(renamePublicBookmarkCategory(editingCategoryId, editTitle));
    onChange?.();
    setEditingCategoryId(null);
    setEditTitle('');
  };

  const openUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const renderSearch = () =>
    linkCount > 0 ? (
      <div className="relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        >
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
        </svg>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            openSpace
              ? 'Search links in this space…'
              : 'Search spaces or links by title / URL…'
          }
          className="w-full pl-9 pr-9 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400"
          aria-label="Search bookmarks"
        />
        {isSearching && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title="Clear search"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>
    ) : null;

  const renderLinkCard = (
    cat: PublicBookmarkCategory,
    link: PublicBookmarkLink,
    linkIndex: number,
    total: number,
    displayIndex: number
  ) => {
    const canMoveLeft = !isSearching && linkIndex > 0;
    const canMoveRight = !isSearching && linkIndex < total - 1;
    const animationDelay = displayIndex * 50;
    return (
      <div
        key={link.id}
        className={`group relative flex items-center gap-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-amber-300 dark:hover:border-amber-500/50 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer ${fullAnimationClass} ${tileAnimatedClass} overflow-hidden`}
        style={{ animationDelay: `${animationDelay}ms` }}
        onClick={() => openUrl(link.url)}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center shrink-0 text-lg border border-slate-200 dark:border-slate-700">
          🔗
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div
            className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors"
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
          >
            {link.title}
          </div>
          <div
            className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5"
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
            title={link.url}
          >
            {getDisplayUrl(link.url)}
          </div>
          <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
            <span className="text-xs shrink-0">{cat.emoji || '🌐'}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1">{cat.title}</span>
          </div>
        </div>

        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50 z-20">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleMoveLink(cat.id, link.id, 'left');
            }}
            disabled={!canMoveLeft}
            className={`p-1 rounded-md ${!canMoveLeft
              ? 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
              : 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10'
              }`}
            title="Move left"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleMoveLink(cat.id, link.id, 'right');
            }}
            disabled={!canMoveRight}
            className={`p-1 rounded-md ${!canMoveRight
              ? 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
              : 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10'
              }`}
            title="Move right"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRemoveLink(cat.id, link.id);
            }}
            className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            title="Remove bookmark"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6 mb-8'}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {openSpace ? (
            <button
              type="button"
              onClick={() => {
                setOpenSpaceId(null);
                setSearchQuery('');
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors shrink-0"
              title="Back to bookmark spaces"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
              </svg>
            </button>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-sky-500 shrink-0">
              <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zM6 6.75A.75.75 0 016.75 6h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 016 6.75zM6.75 9a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zM6 12.75a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
            </svg>
          )}
          {openSpace ? (
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <span className="text-xl shrink-0">{openSpace.emoji || '🌐'}</span>
              {editingCategoryId === openSpace.id ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    commitRename();
                  }}
                >
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={commitRename}
                    className="px-2 py-1 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => startRename(openSpace)}
                  className="text-xl font-bold text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400 truncate"
                  title="Rename space"
                >
                  {openSpace.title}
                </button>
              )}
              <span className="text-sm text-slate-500 dark:text-slate-400">
                ({openSpace.links.length} link{openSpace.links.length === 1 ? '' : 's'})
              </span>
              <button
                type="button"
                onClick={() => handleDeleteSpace(openSpace)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                title="Delete this space"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Your Bookmarks</h2>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                ({data.categories.length} space{data.categories.length === 1 ? '' : 's'}, {linkCount} link{linkCount === 1 ? '' : 's'})
              </span>
            </>
          )}
        </div>

        {!openSpace && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm,text/html"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              type="button"
              onClick={handleImportClick}
              disabled={busy}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50"
            >
              {busy ? 'Importing…' : 'Import Chrome HTML'}
            </button>
            {linkCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={busy}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  title="Download Chrome HTML to import back into your browser"
                >
                  Export HTML
                </button>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={busy}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  title="Re-group by website domain"
                >
                  Regenerate by domain
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={busy}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {!openSpace && (
        <p className="text-xs text-slate-500 dark:text-slate-500">
          Domains become spaces (tiles). Use Export HTML to download a Chrome-compatible file you can import back into your browser later. Saved only in this browser.
        </p>
      )}

      {message && !openSpace && (
        <div className="text-sm px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          {message}
        </div>
      )}

      {renderSearch()}

      {linkCount === 0 ? (
        <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <p className="text-base font-medium text-slate-700 dark:text-slate-300 mb-2">
            No bookmarks yet
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-md mx-auto">
            In Chrome: Bookmarks → Bookmark manager → ⋮ → Export bookmarks. Then import that HTML file here.
          </p>
          <button
            type="button"
            onClick={handleImportClick}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50"
          >
            Import Chrome HTML
          </button>
        </div>
      ) : openSpace ? (
        <div className="space-y-4">
          {isSearching && openSpaceLinks.length === 0 ? (
            <div className="text-center py-10 px-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                No links match “{searchQuery.trim()}” in this space
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-sm text-sky-600 dark:text-sky-400 hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            <>
              {isSearching && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Showing {openSpaceLinks.length} of {openSpace.links.length} link{openSpace.links.length === 1 ? '' : 's'}
                </p>
              )}
              <div className={`grid gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
                {openSpaceLinks.map((link, displayIndex) => {
                  const fullIndex = openSpace.links.findIndex((l) => l.id === link.id);
                  return renderLinkCard(openSpace, link, fullIndex, openSpace.links.length, displayIndex);
                })}
              </div>
            </>
          )}
        </div>
      ) : isSearching && filteredSpaces.length === 0 ? (
        <div className="text-center py-10 px-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            No spaces match “{searchQuery.trim()}”
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-sm text-sky-600 dark:text-sky-400 hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {isSearching && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing {filteredSpaces.length} of {data.categories.length} space{data.categories.length === 1 ? '' : 's'}
            </p>
          )}
          <div className={compact ? 'grid grid-cols-3 gap-4' : 'linknest-tile-grid'}>
            {filteredSpaces.map((cat, displayIndex) => {
              const fullIndex = data.categories.findIndex((c) => c.id === cat.id);
              const canMoveLeft = !isSearching && fullIndex > 0;
              const canMoveRight = !isSearching && fullIndex >= 0 && fullIndex < data.categories.length - 1;
              const styles = resolveTheme(cat.themeColor);
              const spaceLinkCount = cat.links.length;
              const animationDelay = displayIndex * 50;
              return (
                <div
                  key={cat.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setOpenSpaceId(cat.id);
                    setSearchQuery('');
                    setMessage(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setOpenSpaceId(cat.id);
                      setSearchQuery('');
                      setMessage(null);
                    }
                  }}
                  title={`Open ${cat.title}`}
                  style={{ animationDelay: `${animationDelay}ms` }}
                  className={`
                    linknest-tile ${tileAnimatedClass} ${fullAnimationClass} group relative overflow-hidden rounded-xl
                    border border-slate-200 dark:border-slate-700/50 hover:border-brand-300 dark:hover:border-brand-500/50
                    transition-[transform,box-shadow,border-color] duration-200 ease-out
                    flex flex-col h-full min-h-[140px] min-w-0 cursor-pointer
                  `}
                >
                  <div className="flex items-start gap-2 mb-3 min-w-0">
                    <div className="flex items-center gap-2 shrink-0">
                      <div
                        className={`
                          w-10 h-10 rounded-lg ${styles.soft} flex items-center justify-center text-lg
                          border ${styles.border} transition-shadow duration-200 ease-out group-hover:shadow-md overflow-hidden
                        `}
                      >
                        {cat.emoji || '🌐'}
                      </div>
                    </div>
                    <div className="relative flex-1 min-w-0 min-h-[40px]">
                      <div className="relative z-10 opacity-0 group-hover:opacity-100 transition-opacity flex flex-wrap items-center gap-1 justify-end w-full min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteSpace(cat);
                          }}
                          className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                          title="Delete this space"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="relative z-[1] flex-1 mb-3">
                    <h3
                      className={`font-bold text-sm leading-tight line-clamp-2 mb-1.5 ${styles.text} group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors`}
                    >
                      {cat.title}
                    </h3>
                    <p className="text-slate-600 dark:text-slate-400 text-xs line-clamp-2 leading-snug">
                      {spaceLinkCount} link{spaceLinkCount === 1 ? '' : 's'} from {cat.title}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
                    <div className={`flex items-center gap-1.5 text-xs font-medium ${styles.text}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                        <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                        <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                      </svg>
                      <span>{spaceLinkCount}</span>
                    </div>

                    {!isSearching ? (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 z-10">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleMoveSpace(cat.id, 'up');
                          }}
                          disabled={!canMoveLeft}
                          className={`p-1 rounded-md transition-all ${canMoveLeft
                            ? 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 cursor-pointer'
                            : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
                            }`}
                          title="Move space left"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleMoveSpace(cat.id, 'down');
                          }}
                          disabled={!canMoveRight}
                          className={`p-1 rounded-md transition-all ${canMoveRight
                            ? 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 cursor-pointer'
                            : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
                            }`}
                          title="Move space right"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="text-slate-300 dark:text-slate-600 group-hover:text-brand-500 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
