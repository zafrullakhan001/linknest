import React, { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Link, Tile } from '../types';
import type { FavoriteLink } from '../services/storageService';
import type { LinkHealthCheckResult } from '../services/favoriteLinkHealthService';
import { favoriteLinkHealthService } from '../services/favoriteLinkHealthService';
import { viewerLinkDisplay, viewerLinkUrl } from '../utils/urlDisplay';
import { isSshLinkUrl, tryHandleSshLinkClick } from '../utils/sshLink';
import { isVncLinkUrl, tryHandleVncLinkClick } from '../utils/vncLink';
import { getTileAnimationClass, getTileDecorationClass, type TileAnimation, type TileDecoration } from './TileAnimationSelector';
import { useAccessRestrictionGate } from '../contexts/AccessRestrictionContext';
import { isLinkInMaintenance } from '../utils/linkMaintenance';
import { shouldOpenInfoDialog, shouldShowLinkNotes } from '../utils/linkFeatureToggles';
import { LinkMaintenanceBadge } from './LinkMaintenanceBadge';
import { LinkHoverTooltip } from './LinkHoverTooltip';
import { useSettings } from '../contexts/SettingsContext';
import { isUrlExcludedFromLinkCheck, parseExceptionsSetting } from '../services/linkCheckExceptionsService';

const stripHtml = (value: string): string =>
  String(value || '').replace(/<[^>]*>/g, '').trim();

const FAV_LINKS_COMPACT_KEY = 'linknest_favorite_links_compact';

const readFavLinksCompactPref = (): boolean => {
  try {
    const raw = localStorage.getItem(FAV_LINKS_COMPACT_KEY);
    if (raw === '0') return false;
    if (raw === '1') return true;
  } catch {
    // ignore
  }
  return false;
};

const writeFavLinksCompactPref = (value: boolean): void => {
  try {
    localStorage.setItem(FAV_LINKS_COMPACT_KEY, value ? '1' : '0');
  } catch {
    // ignore
  }
};

type FavLinksSort = 'default' | 'asc' | 'desc';

export interface FavoriteLinksSectionProps {
  favoriteLinks: FavoriteLink[];
  favLinksSort: FavLinksSort;
  onSetFavLinksSort: (sort: FavLinksSort) => void;
  favoriteLinksAbove: boolean;
  onSetFavoriteLinksAbove: (above: boolean) => void;
  tiles: Tile[];
  isAuthenticated: boolean;
  browserSpecificLinksEnabled: boolean;
  formatBrowserName: (browserId: string | null | undefined) => string;
  openLinkInBrowser: (url: string, browserId: string) => void;
  linkHealthResults: Map<string, LinkHealthCheckResult>;
  currentAnimation: TileAnimation;
  currentDecoration: TileDecoration;
  isCheckingHealth: boolean;
  isAutoRefreshEnabled: boolean;
  autoRefreshInterval: number;
  refreshCountdown: number;
  onToggleAutoRefresh: () => void;
  onSetAutoRefreshInterval: (seconds: number) => void;
  onForceRefresh: () => void;
  onExportStats: () => void;
  onReorder: (orderedLinks: FavoriteLink[]) => void | Promise<void>;
  onUnfavorite: (linkId: string) => void | Promise<void>;
  onOpenNotes: (link: FavoriteLink) => void;
  onOpenLinkInfo: (link: Link) => void;
  onOpenMaintenance: (link: Link) => void;
}

const SortableFavoriteLinkCard: React.FC<{
  link: FavoriteLink;
  canDrag: boolean;
  storageIndex: number;
  totalCount: number;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  tiles: Tile[];
  browserSpecificLinksEnabled: boolean;
  formatBrowserName: (browserId: string | null | undefined) => string;
  openLinkInBrowser: (url: string, browserId: string) => void;
  healthResult?: LinkHealthCheckResult;
  animationClass: string;
  decorationClass: string;
  animationDelay: number;
  onUnfavorite: () => void;
  onOpenNotes: () => void;
  onOpenLinkInfo: () => void;
  onOpenMaintenance: () => void;
  showArrowReorder: boolean;
  compact?: boolean;
}> = ({
  link,
  canDrag,
  storageIndex: _storageIndex,
  totalCount: _totalCount,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
  tiles,
  browserSpecificLinksEnabled,
  formatBrowserName,
  openLinkInBrowser,
  healthResult,
  animationClass,
  decorationClass,
  animationDelay,
  onUnfavorite,
  onOpenNotes,
  onOpenLinkInfo,
  onOpenMaintenance,
  showArrowReorder,
  compact = false,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id, disabled: !canDrag });
  const { assertCanOpen } = useAccessRestrictionGate();
  const { settings } = useSettings();
  const linkCheckExceptions = useMemo(
    () => parseExceptionsSetting(settings.link_check_exceptions),
    [settings.link_check_exceptions]
  );

  const parentTile = tiles.find((t) => t.id === link.tile.id);
  const browserToUse =
    link.browser && link.browser !== 'default'
      ? link.browser
      : parentTile?.browser && parentTile.browser !== 'default'
        ? parentTile.browser
        : null;

  const fullAnimationClass = `${animationClass} ${decorationClass}`.trim();
  const tileAnimatedClass = animationClass ? 'linknest-tile-animated' : '';
  const skipHealth = isSshLinkUrl(link.url) || isVncLinkUrl(link.url) || isUrlExcludedFromLinkCheck(link.url, linkCheckExceptions);
  const healthStatus = skipHealth ? 'unknown' : healthResult?.health?.status || 'unknown';
  const latency = healthResult?.latency;
  const httpCode = healthResult?.health?.httpCode;

  const style: React.CSSProperties = {
    animationDelay: `${animationDelay}ms`,
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };

  const title = stripHtml(link.label);

  const openLink = async (e: React.MouseEvent) => {
    if (tryHandleSshLinkClick(link.url, e)) return;
    if (tryHandleVncLinkClick(link.url, e)) return;
    const allowed = await assertCanOpen('link', link.id);
    if (!allowed) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (isLinkInMaintenance(link)) {
      e.preventDefault();
      e.stopPropagation();
      onOpenMaintenance();
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      if (shouldOpenInfoDialog(link)) {
        onOpenLinkInfo();
        return;
      }
      const newWindow = window.open(link.url, '_blank', 'noopener,noreferrer');
      if (newWindow) newWindow.focus();
      return;
    }

    if (shouldOpenInfoDialog(link)) {
      e.preventDefault();
      e.stopPropagation();
      onOpenLinkInfo();
      return;
    }

    if (browserSpecificLinksEnabled && browserToUse) {
      e.preventDefault();
      e.stopPropagation();
      openLinkInBrowser(link.url, browserToUse);
      return;
    }

    window.open(link.url, '_blank');
  };

  if (compact) {
    return (
      <LinkHoverTooltip link={link} fallbackTitle={viewerLinkUrl(link, link.tile?.showShortUrls)}>
      <div
        ref={setNodeRef}
        style={style}
        className={`group relative flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-amber-300 dark:hover:border-amber-500/50 transition-colors shadow-sm cursor-pointer ${fullAnimationClass} ${tileAnimatedClass} overflow-hidden ${
          isDragging ? 'ring-2 ring-amber-400 shadow-md' : ''
        }`}
        onClick={openLink}
      >
        {healthResult && !skipHealth && (
          <div
            className="absolute -top-[1px] -left-[1px] w-3.5 h-3.5 z-20 pointer-events-none overflow-hidden"
            title={`Health Status: ${healthStatus.toUpperCase()}${httpCode ? ` (HTTP ${httpCode})` : ''}`}
          >
            <div
              className="absolute -top-2 -left-2 w-4 h-4 rotate-45"
              style={{
                backgroundColor:
                  healthStatus === 'healthy' ||
                  healthStatus === 'accessible' ||
                  healthStatus === 'restricted'
                    ? '#10b981'
                    : healthStatus === 'broken'
                      ? '#ef4444'
                      : '#f59e0b',
              }}
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="text-[13px] leading-tight font-semibold text-slate-900 dark:text-white truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
              {title}
            </div>
            <LinkMaintenanceBadge link={link} compact />
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {shouldShowLinkNotes(link) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenNotes();
              }}
              className="p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              title="View notes"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void onUnfavorite();
            }}
            className="p-1 rounded-md text-amber-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Remove from favorites"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
            </svg>
          </button>
          {canDrag && (
            <button
              type="button"
              className={`inline-flex items-center justify-center p-1 rounded-md cursor-grab active:cursor-grabbing ${
                isDragging
                  ? 'bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-slate-100'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              }`}
              title="Drag to reorder"
              aria-label="Drag to reorder"
              onClick={(e) => e.stopPropagation()}
              {...attributes}
              {...listeners}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
                <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zM7 10a1 1 0 11-2 0 1 1 0 012 0zM7 16a1 1 0 11-2 0 1 1 0 012 0zM15 4a1 1 0 11-2 0 1 1 0 012 0zM15 10a1 1 0 11-2 0 1 1 0 012 0zM15 16a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
            </button>
          )}
        </div>
      </div>
      </LinkHoverTooltip>
    );
  }

  return (
    <LinkHoverTooltip link={link} fallbackTitle={viewerLinkUrl(link, link.tile?.showShortUrls)}>
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex items-center gap-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-amber-300 dark:hover:border-amber-500/50 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer ${fullAnimationClass} ${tileAnimatedClass} overflow-hidden ${
        isDragging ? 'ring-2 ring-amber-400 shadow-lg' : ''
      }`}
      onClick={openLink}
    >
      {healthResult && (
        <div
          className="absolute -top-[1px] -left-[1px] w-4 h-4 z-20 pointer-events-none overflow-hidden"
          title={`Health Status: ${healthStatus.toUpperCase()}${httpCode ? ` (HTTP ${httpCode})` : ''}`}
        >
          <div
            className="absolute -top-2 -left-2 w-5 h-5 rotate-45"
            style={{
              backgroundColor:
                healthStatus === 'healthy' || healthStatus === 'accessible' || healthStatus === 'restricted'
                  ? '#10b981'
                  : healthStatus === 'broken'
                    ? '#ef4444'
                    : '#f59e0b',
            }}
          />
        </div>
      )}

      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center shrink-0 text-lg border border-slate-200 dark:border-slate-700">
        {link.icon || '🔗'}
      </div>

      <div className="flex-1 min-w-0 overflow-hidden pr-1 pb-5">
        <div
          className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors"
          style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
        >
          {title}
        </div>
        <LinkMaintenanceBadge link={link} className="mt-1" />
        <div
          className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5 w-fit max-w-full"
          style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
          title={viewerLinkUrl(link, link.tile?.showShortUrls)}
          data-ln-tooltip-anchor=""
        >
          {viewerLinkDisplay(link, link.tile?.showShortUrls)}
        </div>
        {browserSpecificLinksEnabled && browserToUse && (
          <div
            className="text-[10px] text-blue-500 dark:text-blue-400 transition-colors mt-0.5"
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
          >
            ({formatBrowserName(browserToUse)} browser)
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
          <span className="text-xs shrink-0">{link.tile.emoji}</span>
          <span
            className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1"
            style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
          >
            {stripHtml(link.tile.title)}
          </span>
        </div>
      </div>

      {healthResult && (healthResult.serverLatency || latency || httpCode) && (
        <div
          className="absolute bottom-1.5 left-3 text-[10px] text-slate-400 dark:text-slate-500 opacity-70 font-mono cursor-help z-10"
          title={`Status: ${healthStatus.toUpperCase()}`}
        >
          {healthResult.serverLatency !== undefined ? (
            <span>
              {favoriteLinkHealthService.formatLatency(healthResult.serverLatency)}
              {httpCode && `(${httpCode})`}
            </span>
          ) : null}
          {healthResult.serverLatency !== undefined && latency && <span className="mx-1">|</span>}
          {latency && (
            <span>
              {favoriteLinkHealthService.formatLatency(latency)}
              {httpCode && `(${httpCode})`}
            </span>
          )}
        </div>
      )}

      {canDrag && (
        <button
          type="button"
          className={`absolute bottom-1.5 right-1.5 z-20 inline-flex items-center justify-center p-1.5 rounded-md cursor-grab active:cursor-grabbing transition-opacity ${
            isDragging
              ? 'opacity-100 bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-slate-100'
              : 'opacity-0 group-hover:opacity-100 bg-slate-200 text-slate-500 hover:bg-slate-300 hover:text-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-slate-100'
          }`}
          title="Drag to reorder"
          aria-label="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden>
            <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zM7 10a1 1 0 11-2 0 1 1 0 012 0zM7 16a1 1 0 11-2 0 1 1 0 012 0zM15 4a1 1 0 11-2 0 1 1 0 012 0zM15 10a1 1 0 11-2 0 1 1 0 012 0zM15 16a1 1 0 11-2 0 1 1 0 012 0z" />
          </svg>
        </button>
      )}

      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50 z-20">
        {showArrowReorder && (
          <>
            <button
              type="button"
              disabled={!canMoveLeft}
              onClick={(e) => {
                e.stopPropagation();
                if (canMoveLeft) onMoveLeft();
              }}
              className={`p-1 rounded-md transition-all ${
                canMoveLeft
                  ? 'text-slate-400 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                  : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
              }`}
              title="Move left"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              type="button"
              disabled={!canMoveRight}
              onClick={(e) => {
                e.stopPropagation();
                if (canMoveRight) onMoveRight();
              }}
              className={`p-1 rounded-md transition-all ${
                canMoveRight
                  ? 'text-slate-400 hover:text-brand-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                  : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
              }`}
              title="Move right"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          </>
        )}
        {shouldShowLinkNotes(link) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenNotes();
            }}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
            title="View notes"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onUnfavorite();
          }}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-amber-500 hover:text-amber-600 transition-all"
          title="Remove from favorites"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
    </LinkHoverTooltip>
  );
};

export const FavoriteLinksSection: React.FC<FavoriteLinksSectionProps> = ({
  favoriteLinks,
  favLinksSort,
  onSetFavLinksSort,
  favoriteLinksAbove,
  onSetFavoriteLinksAbove,
  tiles,
  isAuthenticated: _isAuthenticated,
  browserSpecificLinksEnabled,
  formatBrowserName,
  openLinkInBrowser,
  linkHealthResults,
  currentAnimation,
  currentDecoration,
  isCheckingHealth,
  isAutoRefreshEnabled,
  autoRefreshInterval,
  refreshCountdown,
  onToggleAutoRefresh,
  onSetAutoRefreshInterval,
  onForceRefresh,
  onExportStats,
  onReorder,
  onUnfavorite,
  onOpenNotes,
  onOpenLinkInfo,
  onOpenMaintenance,
}) => {
  const [savingOrder, setSavingOrder] = useState(false);
  const [linksCompact, setLinksCompact] = useState(() => readFavLinksCompactPref());
  const { settings } = useSettings();
  const linkCheckExceptions = useMemo(
    () => parseExceptionsSetting(settings.link_check_exceptions),
    [settings.link_check_exceptions]
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const setLinksCompactPref = (value: boolean) => {
    setLinksCompact(value);
    writeFavLinksCompactPref(value);
  };

  const displayLinks = useMemo(() => {
    const list = [...favoriteLinks];
    if (favLinksSort === 'asc') {
      return list.sort((a, b) => a.label.localeCompare(b.label));
    }
    if (favLinksSort === 'desc') {
      return list.sort((a, b) => b.label.localeCompare(a.label));
    }
    return list;
  }, [favoriteLinks, favLinksSort]);

  const canDrag = favLinksSort === 'default' && !savingOrder && favoriteLinks.length > 1;

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Manual order only — switch off A–Z sort when user starts dragging
    if (favLinksSort !== 'default') {
      onSetFavLinksSort('default');
    }

    const oldIndex = favoriteLinks.findIndex((l) => l.id === active.id);
    const newIndex = favoriteLinks.findIndex((l) => l.id === over.id);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const next = arrayMove(favoriteLinks, oldIndex, newIndex);
    setSavingOrder(true);
    try {
      await onReorder(next);
    } finally {
      setSavingOrder(false);
    }
  };

  const handleMove = async (linkId: string, direction: 'left' | 'right') => {
    if (favLinksSort !== 'default') {
      onSetFavLinksSort('default');
    }
    const index = favoriteLinks.findIndex((l) => l.id === linkId);
    if (index < 0) return;
    const target = direction === 'left' ? index - 1 : index + 1;
    if (target < 0 || target >= favoriteLinks.length) return;
    const next = arrayMove(favoriteLinks, index, target);
    setSavingOrder(true);
    try {
      await onReorder(next);
    } finally {
      setSavingOrder(false);
    }
  };

  const animationClass = getTileAnimationClass(currentAnimation);
  const decorationClass = getTileDecorationClass(currentDecoration);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-500">
            <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
          </svg>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Favorite Links</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">({favoriteLinks.length})</span>
          {canDrag && (
            <span className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">
              {linksCompact
                ? 'Hover a link for star / drag handle'
                : 'Hover a link and drag the bottom-right handle to reorder'}
            </span>
          )}
          {favLinksSort !== 'default' && (
            <span className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400 hidden sm:inline">
              A–Z sort on — switch to default to drag
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Sort:</span>
          <button
            type="button"
            onClick={() =>
              onSetFavLinksSort(
                favLinksSort === 'default' ? 'asc' : favLinksSort === 'asc' ? 'desc' : 'default'
              )
            }
            className={`p-1.5 rounded-lg transition-all ${
              favLinksSort !== 'default'
                ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
            title={
              favLinksSort === 'asc'
                ? 'Sorted ascending (Click for descending)'
                : favLinksSort === 'desc'
                  ? 'Sorted descending (Click to reset)'
                  : 'Sort ascending'
            }
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-4 h-4 transition-transform ${favLinksSort === 'desc' ? 'rotate-180' : ''}`}
            >
              <path fillRule="evenodd" d="M2.24 6.8a.75.75 0 001.06-.04l1.95-2.1v8.59a.75.75 0 001.5 0V4.66l1.95 2.1a.75.75 0 101.1-1.02l-3.25-3.5a.75.75 0 00-1.1 0L2.2 5.74a.75.75 0 00.04 1.06zm8 4a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5zm0-4a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5zm0 8a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">View:</span>
          <button
            type="button"
            onClick={() => setLinksCompactPref(!linksCompact)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
              linksCompact
                ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
            title={linksCompact ? 'Switch to card view' : 'Switch to compact title-only view'}
          >
            {linksCompact ? 'Compact' : 'Cards'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Position:</span>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            <button
              type="button"
              onClick={() => onSetFavoriteLinksAbove(true)}
              className={`px-2 py-1 text-xs rounded transition-all ${
                favoriteLinksAbove
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="Show links above tiles"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onSetFavoriteLinksAbove(false)}
              className={`px-2 py-1 text-xs rounded transition-all ${
                !favoriteLinksAbove
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
              title="Show links below tiles"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExportStats}
            className="flex items-center justify-center w-8 h-8 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-all shadow-sm hover:shadow-md"
            title="Export stats to CSV"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
              <path fillRule="evenodd" d="M3 4.5A1.5 1.5 0 014.5 3h11A1.5 1.5 0 0117 4.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 15.5v-11zM4.5 4.5v11h11v-11h-11z" clipRule="evenodd" />
              <path fillRule="evenodd" d="M10 13a.75.75 0 01-.75-.75V7.56l-1.72 1.72a.75.75 0 01-1.06-1.06l3-3a.75.75 0 011.06 0l3 3a.75.75 0 11-1.06 1.06l-1.72-1.72v4.69A.75.75 0 0110 13z" clipRule="evenodd" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onForceRefresh}
            disabled={isCheckingHealth}
            className={`flex items-center justify-center w-8 h-8 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-all shadow-sm hover:shadow-md disabled:opacity-50 ${
              isCheckingHealth ? 'animate-spin' : ''
            }`}
            title="Force refresh now"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-blue-500">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>

          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1 shadow-sm">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <svg className="w-6 h-6 rotate-[-90deg]">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-slate-100 dark:text-slate-700" />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 10}
                  strokeDashoffset={
                    isAutoRefreshEnabled
                      ? 2 * Math.PI * 10 * (1 - refreshCountdown / autoRefreshInterval)
                      : 2 * Math.PI * 10
                  }
                  className={`${
                    isAutoRefreshEnabled ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'
                  } transition-all duration-1000 ease-linear`}
                  strokeLinecap="round"
                />
              </svg>
              <button
                type="button"
                onClick={onToggleAutoRefresh}
                className="absolute inset-0 flex items-center justify-center"
                title={isAutoRefreshEnabled ? 'Disable auto-refresh' : 'Enable auto-refresh'}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    isAutoRefreshEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                />
              </button>
            </div>
            <select
              value={autoRefreshInterval}
              onChange={(e) => onSetAutoRefreshInterval(Number(e.target.value))}
              disabled={!isAutoRefreshEnabled}
              className="bg-transparent text-[10px] font-medium text-slate-600 dark:text-slate-400 border-none focus:ring-0 cursor-pointer disabled:opacity-50 pr-2 pl-0"
            >
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>1m</option>
              <option value={180}>3m</option>
              <option value={300}>5m</option>
            </select>
          </div>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
        <SortableContext items={displayLinks.map((l) => l.id)} strategy={rectSortingStrategy}>
          <div
            className={
              linksCompact
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5'
                : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'
            }
          >
            {displayLinks.map((link, linkIndex) => {
              const storageIndex = favoriteLinks.findIndex((item) => item.id === link.id);
              return (
                <SortableFavoriteLinkCard
                  key={link.id}
                  link={link}
                  canDrag={canDrag}
                  storageIndex={storageIndex}
                  totalCount={favoriteLinks.length}
                  canMoveLeft={storageIndex > 0}
                  canMoveRight={storageIndex >= 0 && storageIndex < favoriteLinks.length - 1}
                  onMoveLeft={() => void handleMove(link.id, 'left')}
                  onMoveRight={() => void handleMove(link.id, 'right')}
                  tiles={tiles}
                  browserSpecificLinksEnabled={browserSpecificLinksEnabled}
                  formatBrowserName={formatBrowserName}
                  openLinkInBrowser={openLinkInBrowser}
                  healthResult={
                    isSshLinkUrl(link.url) || isVncLinkUrl(link.url) || isUrlExcludedFromLinkCheck(link.url, linkCheckExceptions)
                      ? undefined
                      : linkHealthResults.get(link.id)
                  }
                  animationClass={animationClass}
                  decorationClass={decorationClass}
                  animationDelay={linkIndex * 50}
                  onUnfavorite={() => onUnfavorite(link.id)}
                  onOpenNotes={() => onOpenNotes(link)}
                  onOpenLinkInfo={() => onOpenLinkInfo(link as unknown as Link)}
                  onOpenMaintenance={() => onOpenMaintenance(link as unknown as Link)}
                  showArrowReorder={!linksCompact && canDrag}
                  compact={linksCompact}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};
