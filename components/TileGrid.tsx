import React, { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Tile, LinkSection, ThemeColor, THEME_COLORS, COLOR_STYLES, POPULAR_EMOJIS, TileVisibility, TileMessage, Link, CelebrationConfig } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { saveTileArrangement, saveCategoryArrangement, getCategoryArrangement, toggleFavorite, saveTile, createTile, getTiles, getTile, cloneCategory, toggleCategoryFavorite, getRecycleBin, restoreTile, purgeRecycleBin, permanentDeleteTile, permanentDeleteCategory, deleteTile, getArchive, archiveTile, unarchiveTile, purgeArchive, archiveCategory, unarchiveCategory, getFavoriteLinks, resolveFavoriteLinks, FavoriteLink, csvToJson, uploadTileHeaderImage, uploadTileEmojiImage } from '../services/storageService';
import {
  exportCategoryToFile,
  exportTileToFile,
  parseSpaceExportObject,
  normalizeImportedTiles
} from '../services/spaceTransferService';
import { authService, UserListItem } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import { userPreferencesService } from '../services/userPreferencesService';
import { getPublicFavorites, togglePublicFavorite, isPublicFavorite, getPublicActiveTab, setPublicActiveTab, exportPublicFavorites, importPublicFavorites, clearPublicFavorites, getPublicLinkFavorites, togglePublicLinkFavorite, clearPublicLinkFavorites, getPublicLinkFavoriteDetails, syncPublicLinkFavoriteDetails, upsertPublicLinkFavoriteDetail, removePublicLinkFavoriteDetail } from '../services/publicFavoritesService';
import { linkHealthService } from '../services/linkHealthService';
import { favoriteLinkHealthService, LinkHealthCheckResult } from '../services/favoriteLinkHealthService';
import { generateUuid } from '../services/idService';
import { TileAnimationSelector, useTileAnimation, getTileAnimationClass, getTileDecorationClass, TileAnimation, TileDecoration } from './TileAnimationSelector';
const MonitoringDashboard = lazy(() =>
  import('./MonitoringDashboard').then((m) => ({ default: m.MonitoringDashboard }))
);
const Monitorv2Dashboard = lazy(() =>
  import('./Monitorv2Dashboard').then((m) => ({ default: m.Monitorv2Dashboard }))
);
import { getDisabledTabsFromSettings } from '../services/tabVisibilityService';
import { rolesService } from '../services/rolesService';
import { FaTimes } from 'react-icons/fa';
import { LinkInfoDialog } from './LinkInfoDialog';
import { LinkNotesDialog } from './LinkNotesDialog';
import { useMobile } from '../hooks/useMobile';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { getDisplayUrl } from '../utils/urlDisplay';
import { tryHandleSshLinkClick, isSshLinkUrl } from '../utils/sshLink';
import { tryHandleVncLinkClick, isVncLinkUrl } from '../utils/vncLink';
import { MobileTileView } from './MobileTileView';
import { StagingOverview } from './StagingOverview';
import { StagingOfflineKit, StagingOfflineKitHandle } from './StagingOfflineKit';
import { YourAppsOverview } from './YourAppsOverview';
import { PrivateOverview } from './PrivateOverview';
import { ScheduledOverview } from './ScheduledOverview';
import { ExpiredOverview } from './ExpiredOverview';
import { ArchiveOverview } from './ArchiveOverview';
import { MonitoringOverview } from './MonitoringOverview';
import { RecycleBinOverview } from './RecycleBinOverview';
import { TileInfoDialog } from './TileInfoDialog';
import { FormSection, FormLabel, SpaceModalHeader, EditModalTabButton } from './SpaceFormChrome';
import { SearchTagsInput } from './SearchTagsInput';
import { TileFireworks } from './TileFireworks';
import { TileConfetti } from './TileConfetti';
import { TileSnowfall } from './TileSnowfall';
import { TileHeartsRising } from './TileHeartsRising';
import { TileHeartsFalling } from './TileHeartsFalling';
import { TileBubbles } from './TileBubbles';
import { TileButterflies } from './TileButterflies';
import { TileBirdsFlying } from './TileBirdsFlying';
import { TileRocketLaunch } from './TileRocketLaunch';
import { TileBurstFireworks } from './TileBurstFireworks';
import { TileSparkles } from './TileSparkles';
import { TilePetals } from './TilePetals';
import { TileShootingStars } from './TileShootingStars';
import { TileLeaves } from './TileLeaves';
import { TileFireflies } from './TileFireflies';
import { TileBalloons } from './TileBalloons';
import { TileStars } from './TileStars';
import { TileRainbow } from './TileRainbow';
import { SharedTileNotifications } from './SharedTileNotifications';
import { BlockedUsersSection } from './BlockedUsersSection';
import { ShareTileDialog } from './ShareTileDialog';
import { removeSharedTile, blockUser, getPendingInvitations, getBlockedUsers } from '../services/tileShareService';



interface TileGridProps {
  tiles: Tile[];
  onUpdateTiles: (tiles: Tile[], skipReload?: boolean, isFinal?: boolean) => void;
  onCreateTile?: (tile: Tile) => Promise<void>;
  onDeleteTile?: (tileId: string) => Promise<void>;
  onCloneTile?: (tileId: string) => Promise<void>;
  isAuthenticated?: boolean;
  onAuthRequired?: () => void;
  darkMode?: boolean;
  toggleTheme?: () => void;
  onHelpClick?: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

/** Strip HTML tags from a string and return plain text (for safe display of user content that may contain HTML) */
function stripHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, '');
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || html.replace(/<[^>]*>/g, '') || '';
}

/** Tile-sized preview for aligning the free-position header logo (matches SortableTile placement). */
const HeaderImageTilePreview: React.FC<{
  headerImage: string;
  align: 'left' | 'center' | 'right';
  fit: 'contain' | 'cover';
  opacity: number;
  offsetX: number;
  offsetY: number;
  zoom?: number;
  emoji?: string;
  emojiImage?: string;
  emojiImageOpacity?: number;
  emojiImageOffsetX?: number;
  emojiImageOffsetY?: number;
  emojiImageZoom?: number;
  showEmoji?: boolean;
  title?: string;
  description?: string;
  showTitle?: boolean;
  showDescription?: boolean;
  themeColor?: ThemeColor;
}> = ({
  headerImage,
  align,
  fit,
  opacity,
  offsetX,
  offsetY,
  zoom = 100,
  emoji = '📁',
  emojiImage,
  emojiImageOpacity = 100,
  emojiImageOffsetX = 0,
  emojiImageOffsetY = 0,
  emojiImageZoom = 100,
  showEmoji = true,
  title = 'Tile Preview',
  description = 'No description',
  showTitle = true,
  showDescription = true,
  themeColor = 'blue',
}) => {
  const styles = COLOR_STYLES[themeColor] || COLOR_STYLES.blue;
  const ox = Math.max(-300, Math.min(300, offsetX));
  const oy = Math.max(-300, Math.min(300, offsetY));
  const op = Math.max(0, Math.min(100, opacity)) / 100;
  const z = Math.max(50, Math.min(300, zoom)) / 100;
  const eox = Math.max(-50, Math.min(50, emojiImageOffsetX));
  const eoy = Math.max(-50, Math.min(50, emojiImageOffsetY));
  const eop = Math.max(0, Math.min(100, emojiImageOpacity)) / 100;
  const ez = Math.max(50, Math.min(300, emojiImageZoom)) / 100;

  return (
    <div className="w-full flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5 self-start">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Tile preview — use sliders to align
        </span>
      </div>
      <div
        className={`
          w-full max-w-[280px] min-h-[140px] rounded-xl border border-slate-200 dark:border-slate-700/50
          p-5 flex flex-col shadow-lg relative overflow-hidden bg-white dark:bg-slate-800
        `}
      >
        <img
          src={headerImage}
          alt=""
          className={`absolute top-3 right-3 z-0 max-w-[10rem] h-10 pointer-events-none select-none ${
            fit === 'cover' ? 'object-cover' : 'object-contain'
          } ${
            align === 'left' ? 'object-left' : align === 'center' ? 'object-center' : 'object-right'
          }`}
          style={{
            opacity: op,
            transform: `translate(${ox}px, ${oy}px) scale(${z})`,
          }}
          draggable={false}
        />
        <div className="relative z-[1] flex items-start gap-2 mb-3 min-w-0">
          {showEmoji ? (
            <div
              className={`w-10 h-10 rounded-lg ${styles.soft} flex items-center justify-center text-lg border ${styles.border} overflow-hidden shrink-0`}
            >
              {emojiImage ? (
                <img
                  src={emojiImage}
                  alt=""
                  className="w-full h-full object-contain p-0.5"
                  style={{
                    opacity: eop,
                    transform: `translate(${eox}px, ${eoy}px) scale(${ez})`,
                  }}
                  draggable={false}
                />
              ) : (
                emoji
              )}
            </div>
          ) : null}
          <div className="flex-1 min-h-[40px]" />
        </div>
        <div className="relative z-[1] flex-1">
          {showTitle ? (
            <h3 className={`font-bold text-sm leading-tight line-clamp-2 mb-1.5 ${styles.text}`}>
              {title.trim() || 'Tile Preview'}
            </h3>
          ) : null}
          {showDescription ? (
            <p className="text-slate-600 dark:text-slate-400 text-xs line-clamp-2 leading-snug">
              {description.trim() || 'No description'}
            </p>
          ) : null}
        </div>
        <div className="relative z-[1] pt-2.5 mt-auto border-t border-slate-100 dark:border-slate-700/50 flex items-center">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${styles.text}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
              <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
              <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01-.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
            </svg>
            <span>—</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Resolve API base dynamically
function resolveApiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) {
    return envBase;
  }

  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    if (path !== '/' && path.length > 1) {
      const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
      if (cleanPath && cleanPath !== '/') {
        return `${cleanPath}/api`;
      }
    }
  }

  return '/api';
}

/**
 * Tooltips for navigation tabs and inline filters.
 * Using the native `title` attribute keeps implementation simple and lightweight.
 */
const APP_TAB_TOOLTIPS: Record<string, string> = {
  staging:
    'Staging (Admin only): A sandbox workspace for preparing and testing spaces before they are published.\n\nUse this area to experiment with tile/category structure, import data, and validate your changes without affecting what normal users see. When you switch tabs, you are viewing the staging set rather than the live/public set.',
  public:
    'Public (Guest): Spaces that are visible to everyone, including users who are not signed in.\n\nThese spaces are intended for general audiences. If a space is public, you can browse it here and open its links/sections according to the public layout settings.',
  'your-apps':
    'Your Apps (Signed-in): A personalized view of spaces for your account.\n\nUse Authenticated for spaces that require sign-in (shared with all logged-in users), and Your Assigned Apps for spaces/links granted via roles or groups. Public spaces stay on the Public tab.',
  'public-favorites':
    'Favorites (Guest): A lightweight favorites view for users who are not signed in.\n\nThis typically includes favorite spaces and favorite links you saved locally in your browser. You can quickly return to what you bookmarked without requiring an account.',
  favorites:
    'Favorites (Signed-in): Your saved spaces and saved links.\n\nUse this tab to jump back to content you marked as a favorite. Favorites are tied to your authenticated user profile, so they remain available across sessions.',
  private:
    'Private (Signed-in): Spaces restricted to you via private visibility and sharing controls.\n\nThis area is organized into sub-tabs so you can manage your private spaces, invitations/sharing status, and blocked access. Private spaces are not meant for guests or the general public.',
  scheduled:
    'Scheduled (Signed-in): Spaces whose visibility is scheduled for a future time.\n\nThis tab shows spaces that are not yet active but will become visible when their scheduled “visible from” time is reached. Once the start time passes, spaces should naturally appear in the appropriate active area.',
  expired:
    'Expired (Signed-in): Spaces whose scheduled expiration time has passed.\n\nThis tab surfaces spaces that were previously visible but are now considered expired. Use it to review what has lapsed and to confirm content scheduling behavior.',
  archive:
    'Archive (Signed-in): Spaces moved to an archived state.\n\nArchived spaces are kept for reference or cleanup rather than normal browsing. They typically represent a deliberate “keep but don’t show in active views” workflow.',
  monitoring:
    'Monitoring (Signed-in): Link health monitoring dashboard.\n\nUse this to review the status of monitored links inside spaces, identify broken/slow destinations, and track health checks over time. This is meant for ongoing maintenance and reliability.',
  monitorv2:
    'Monitorv2 (Admin/Advanced Monitoring): An enhanced monitoring interface backed by PostgreSQL/TimescaleDB.\n\nThis view provides deeper analytics and performance-oriented monitoring than the standard dashboard. It is intended for installations configured with the advanced monitoring stack.',
  'recycle-bin':
    'Recycle Bin (Signed-in): Recently deleted spaces.\n\nWhen you delete a space, it is typically moved here instead of being permanently removed immediately. You can restore spaces from the bin, and (depending on permissions/settings) permanently purge items afterward.',
};

const YOUR_APPS_FILTER_TOOLTIPS: Record<string, string> = {
  authenticated:
    'Authenticated: Shows spaces that are visible specifically because you are signed in.\n\nIf a space requires authentication (but does not necessarily grant access via explicit role permissions), it will appear here. Public spaces stay on the Public tab.',
  assigned:
    'Your Assigned Apps: Shows spaces where access is granted based on explicit assignment (for example, via user/group permissions or role access rules).\n\nThis view helps you focus on spaces that were intentionally granted to you, rather than broadly visible to signed-in users.',
};

const PRIVATE_SUBTAB_TOOLTIPS: Record<string, string> = {
  spaces:
    'Spaces: Your private spaces in “Private”.\n\nUse this to browse and manage the private content you own and/or can access. This sub-tab is the main place to work with your private spaces list.',
  sharing:
    'Sharing: Invitation and sharing status for private spaces.\n\nThis sub-tab is for handling sharing workflows (for example, pending invitations you can accept/reject). It helps you manage access relationships without mixing them into the main private spaces list.',
  blocked:
    'Blocked: Users you have blocked (and access that was revoked).\n\nUse this to review blocked entries related to private sharing and remove/revoke blocks as needed. This is focused on access control hygiene.',
};

// Private tab owner filter dropdown (with search when many owners)
interface PrivateOwnerFilterOption {
  value: number | 'all';
  label: string;
}
const PrivateOwnerFilterDropdown: React.FC<{
  value: number | 'all';
  options: PrivateOwnerFilterOption[];
  onSelect: (v: number | 'all') => void;
  userCount: number;
}> = ({ value, options, onSelect, userCount }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const showSearch = userCount > 5;
  const filtered = useMemo(() => {
    if (!showSearch || !search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search, showSearch]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);
  const selectedLabel = options.find(o => o.value === value)?.label ?? 'All owners';
  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <span className="text-sm font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">Filter:</span>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600 min-w-[140px] justify-between"
        title="Filter by owner"
      >
        <span className="truncate">{selectedLabel}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {value !== 'all' && (
        <button
          type="button"
          onClick={() => onSelect('all')}
          className="px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          title="Clear filter"
        >
          Clear
        </button>
      )}
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-1 max-h-64 flex flex-col">
          {showSearch && (
            <div className="px-2 pb-2">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search owners..."
                className="w-full px-2 py-1.5 text-sm rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400"
                autoFocus
              />
            </div>
          )}
          <div className={`overflow-y-auto ${showSearch ? 'max-h-48' : ''}`}>
            {filtered.map(opt => (
              <button
                key={opt.value === 'all' ? 'all' : opt.value}
                type="button"
                onClick={() => { onSelect(opt.value); setOpen(false); setSearch(''); }}
                className={`w-full px-3 py-1.5 text-left text-sm ${opt.value === value ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
              >
                {opt.label}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
};

// Category Visibility Management Dialog
interface CategoryVisibilityDialogProps {
  categoryName: string;
  tiles: Tile[];
  users: Array<{ id: number; username: string }>;
  onClose: () => void;
  onSave: (changes: Record<string, { visibility: TileVisibility; allowedUsers: number[] }>) => Promise<void>;
}

const CategoryVisibilityDialog: React.FC<CategoryVisibilityDialogProps> = ({
  categoryName,
  tiles,
  users,
  onClose,
  onSave
}) => {
  useEscapeToClose(true, onClose);
  const [tileVisibility, setTileVisibility] = useState<Record<string, { visibility: TileVisibility; allowedUsers: number[] }>>(() => {
    const initial: Record<string, { visibility: TileVisibility; allowedUsers: number[] }> = {};
    tiles.forEach(tile => {
      initial[tile.id] = {
        visibility: tile.visibility || 'public',
        allowedUsers: tile.allowedUsers || []
      };
    });
    return initial;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [bulkPrivateSelectedUsers, setBulkPrivateSelectedUsers] = useState<number[]>(users.map(u => u.id));
  const [showBulkUserSelection, setShowBulkUserSelection] = useState(false);

  const publicTiles = tiles.filter(t => (tileVisibility[t.id]?.visibility || 'public') === 'public');
  const authenticatedTiles = tiles.filter(t => tileVisibility[t.id]?.visibility === 'authenticated');
  const privateTiles = tiles.filter(t => tileVisibility[t.id]?.visibility === 'private');

  const handleVisibilityChange = (tileId: string, visibility: TileVisibility) => {
    setTileVisibility(prev => ({
      ...prev,
      [tileId]: {
        visibility,
        allowedUsers: visibility === 'private' ? (prev[tileId]?.allowedUsers || []) : []
      }
    }));
  };

  const handleUserToggle = (tileId: string, userId: number) => {
    setTileVisibility(prev => {
      const currentUsers = prev[tileId]?.allowedUsers || [];
      const newUsers = currentUsers.includes(userId)
        ? currentUsers.filter(id => id !== userId)
        : [...currentUsers, userId];
      return {
        ...prev,
        [tileId]: {
          ...prev[tileId],
          visibility: prev[tileId]?.visibility || 'public',
          allowedUsers: newUsers
        }
      };
    });
  };

  const handleMakeAllPublic = () => {
    const updates: Record<string, { visibility: TileVisibility; allowedUsers: number[] }> = {};
    tiles.forEach(tile => {
      updates[tile.id] = { visibility: 'public', allowedUsers: [] };
    });
    setTileVisibility(updates);
  };

  const handleMakeAllProtected = () => {
    const updates: Record<string, { visibility: TileVisibility; allowedUsers: number[] }> = {};
    tiles.forEach(tile => {
      updates[tile.id] = { visibility: 'authenticated', allowedUsers: [] };
    });
    setTileVisibility(updates);
  };

  const handleMakeAllPrivate = () => {
    const updates: Record<string, { visibility: TileVisibility; allowedUsers: number[] }> = {};
    tiles.forEach(tile => {
      // Use selected users from bulk selection
      updates[tile.id] = { visibility: 'private', allowedUsers: bulkPrivateSelectedUsers };
    });
    setTileVisibility(updates);
    setShowBulkUserSelection(false);
  };

  const handleBulkUserToggle = (userId: number) => {
    setBulkPrivateSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(tileVisibility);
      onClose();
    } catch (error) {
      console.error('Failed to save visibility changes:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Manage Tile Visibility</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{categoryName}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Left Side - All Tiles */}
        <div className="w-1/3 border-r border-slate-200 dark:border-slate-700 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">All Tiles ({tiles.length})</h3>
            <button
              onClick={handleMakeAllPublic}
              className="px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
            >
              Make All Public
            </button>
          </div>
          <div className="space-y-2">
            {tiles.map(tile => {
              const currentVisibility = tileVisibility[tile.id]?.visibility || 'public';
              return (
                <div
                  key={tile.id}
                  className={`p-3 rounded-lg border transition-all ${currentVisibility === 'public' ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50' :
                    currentVisibility === 'authenticated' ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20' :
                      'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                    }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{tile.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{tile.title}</p>
                      <div className="mt-2 flex gap-1">
                        <button
                          onClick={() => handleVisibilityChange(tile.id, 'public')}
                          className={`px-2 py-1 text-xs rounded ${currentVisibility === 'public'
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                        >
                          Public
                        </button>
                        <button
                          onClick={() => handleVisibilityChange(tile.id, 'authenticated')}
                          className={`px-2 py-1 text-xs rounded ${currentVisibility === 'authenticated'
                            ? 'bg-blue-200 dark:bg-blue-700 text-blue-900 dark:text-blue-100'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                            }`}
                        >
                          Protected
                        </button>
                        <button
                          onClick={() => handleVisibilityChange(tile.id, 'private')}
                          className={`px-2 py-1 text-xs rounded ${currentVisibility === 'private'
                            ? 'bg-red-200 dark:bg-red-700 text-red-900 dark:text-red-100'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/30'
                            }`}
                        >
                          Private
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side - Private and Protected Sections */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Protected (Authenticated) Section */}
          <div className="flex-1 border-b border-slate-200 dark:border-slate-700 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                Protected (Authenticated) - {authenticatedTiles.length} tile(s)
              </h3>
              <button
                onClick={handleMakeAllProtected}
                className="px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
              >
                Make All Protected
              </button>
            </div>
            <div className="space-y-3">
              {authenticatedTiles.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">No protected tiles</p>
              ) : (
                authenticatedTiles.map(tile => (
                  <div key={tile.id} className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-lg">{tile.emoji}</span>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{tile.title}</p>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                      Visible to all authenticated users
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Private Section */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">
                  Private - {privateTiles.length} tile(s)
                </h3>
                <div className="relative">
                  <button
                    onClick={() => setShowBulkUserSelection(!showBulkUserSelection)}
                    className="px-2 py-1 text-xs font-medium text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                  >
                    Make All Private
                  </button>
                  {showBulkUserSelection && (
                    <div className="absolute right-0 top-full mt-1 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 min-w-[200px] max-h-64 overflow-y-auto">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Select Users:</p>
                      <div className="space-y-1 mb-3">
                        {users.map(user => (
                          <label key={user.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={bulkPrivateSelectedUsers.includes(user.id)}
                              onChange={() => handleBulkUserToggle(user.id)}
                              className="rounded border-slate-300 dark:border-slate-600 text-red-600 focus:ring-red-500"
                            />
                            <span>{user.username}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <button
                          onClick={handleMakeAllPrivate}
                          disabled={bulkPrivateSelectedUsers.length === 0}
                          className="flex-1 px-2 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
                        >
                          Apply
                        </button>
                        <button
                          onClick={() => setShowBulkUserSelection(false)}
                          className="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {privateTiles.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">No private tiles</p>
              ) : (
                privateTiles.map(tile => {
                  const allowedUsers = tileVisibility[tile.id]?.allowedUsers || [];
                  return (
                    <div key={tile.id} className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-lg">{tile.emoji}</span>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{tile.title}</p>
                      </div>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Allowed Users:</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {users.map(user => (
                          <label key={user.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-white dark:hover:bg-slate-800 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={allowedUsers.includes(user.id)}
                              onChange={() => handleUserToggle(tile.id, user.id)}
                              className="rounded border-slate-300 dark:border-slate-600 text-red-600 focus:ring-red-500"
                            />
                            <span>{user.username}</span>
                          </label>
                        ))}
                      </div>
                      {allowedUsers.length === 0 && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-2 italic">
                          ⚠️ No users selected - tile will not be visible to anyone
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/30"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

// Category Component (no longer sortable via drag)
interface CategoryProps {
  categoryName: string;
  tileCount: number;
  isAuthenticated: boolean;
  groupIndex: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  children: React.ReactNode;
  onDeleteCategory?: (categoryName: string) => void;
  onArchiveCategory?: (categoryName: string) => void;
  onSaveCategoryOrder?: () => void;
  onRenameCategory?: (oldName: string, newName: string) => void;
  onExportCategory?: (categoryName: string) => void;
  onImportCategory?: (categoryName: string) => void;
  onCloneCategory?: (categoryName: string) => void;
  onToggleCategoryFavorite?: (categoryName: string) => void;
  isCategoryFavorited?: boolean;
  onPermanentDeleteCategory?: (categoryName: string) => void;
  isRecycleBin?: boolean;
  isArchive?: boolean;
  onScheduleCategory?: (categoryName: string) => void;
  onUnarchiveCategory?: (categoryName: string) => void;
  onManageVisibility?: (categoryName: string) => void;
  onShowCategoryInfo?: (categoryName: string, tiles: Tile[]) => void;
  categoryTiles?: Tile[];
  animationClass?: string;
}

const Category: React.FC<CategoryProps> = ({
  categoryName,
  tileCount,
  isAuthenticated,
  groupIndex,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  children,
  onDeleteCategory,
  onArchiveCategory,
  onSaveCategoryOrder,
  onRenameCategory,
  onExportCategory,
  onImportCategory,
  onCloneCategory,
  onToggleCategoryFavorite,
  isCategoryFavorited = false,
  onPermanentDeleteCategory,
  isRecycleBin = false,
  isArchive = false,
  onScheduleCategory,
  onUnarchiveCategory,
  onManageVisibility,
  onShowCategoryInfo,
  categoryTiles = [],
  animationClass
}) => {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(categoryName);

  // Update editedName when categoryName changes (e.g., after rename)
  useEffect(() => {
    setEditedName(categoryName);
  }, [categoryName]);

  const handleSave = () => {
    const trimmedName = editedName.trim();
    if (trimmedName && trimmedName !== categoryName && onRenameCategory) {
      onRenameCategory(categoryName, trimmedName);
    }
    setIsEditing(false);
    setEditedName(categoryName);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedName(categoryName);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  const categoryAnimationDelay = groupIndex * 100;

  return (
    <div
      className={`linknest-category linknest-category-animated ${animationClass}`}
      style={{ animationDelay: `${categoryAnimationDelay}ms` }}
    >
      {/* Category Header with Arrow Buttons */}
      <div className="flex items-center gap-2 mb-3 group/category rounded-lg transition-colors">
        {isAuthenticated && (onMoveUp || onMoveDown) && (
          <div className="opacity-0 group-hover/category:opacity-100 transition-opacity flex items-center gap-0.5">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onMoveUp && canMoveUp) {
                  onMoveUp();
                }
              }}
              disabled={!canMoveUp}
              className={`p-1 rounded-md transition-all ${canMoveUp
                ? 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 cursor-pointer'
                : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
                }`}
              title="Move category up"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onMoveDown && canMoveDown) {
                  onMoveDown();
                }
              }}
              disabled={!canMoveDown}
              className={`p-1 rounded-md transition-all ${canMoveDown
                ? 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 cursor-pointer'
                : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
                }`}
              title="Move category down"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              autoFocus
              className="flex-1 px-2 py-1 text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide bg-white dark:bg-slate-800 border border-brand-500 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            />
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSave();
              }}
              className="p-1 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-all"
              title="Save"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCancel();
              }}
              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
              title="Cancel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        ) : (
          <>
            <h2 className="linknest-category-header text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{categoryName}</h2>
            {isAuthenticated && onRenameCategory && user?.is_admin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsEditing(true);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded transition-all"
                title="Edit category name"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                </svg>
              </button>
            )}
          </>
        )}
        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400">
          {tileCount}
        </span>
        {onShowCategoryInfo && categoryTiles.length > 0 && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onShowCategoryInfo(categoryName, categoryTiles);
            }}
            className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded transition-all ml-1"
            title="Show category information"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <div className="h-px bg-slate-200 dark:border-slate-700 flex-1"></div>

        {/* Save Order Button (only visible for authenticated users) */}
        {isAuthenticated && onSaveCategoryOrder && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSaveCategoryOrder();
            }}
            className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded-md transition-all ml-2 flex items-center gap-1"
            title="Save tile order"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-medium hidden sm:inline">Save Order</span>
          </button>
        )}

        {isAuthenticated && (
          <>
            {isRecycleBin && onPermanentDeleteCategory ? (
              // Show permanent delete button in recycle bin
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onPermanentDeleteCategory(categoryName);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-all ml-2"
                title="Permanently delete category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                </svg>
              </button>
            ) : onDeleteCategory ? (
              // Show regular delete button (moves to recycle bin)
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (confirm(`Are you sure you want to delete the category "${categoryName}"?${tileCount > 0 ? `\n\nThis will move ${tileCount} tile(s) to the recycle bin.` : ''}`)) {
                    onDeleteCategory(categoryName);
                  }
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-all ml-2"
                title="Delete category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                </svg>
              </button>
            ) : null}
            {isArchive && onUnarchiveCategory && (
              // Show restore category button in archive
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (confirm(`Are you sure you want to restore the category "${categoryName}"?${tileCount > 0 ? `\n\nThis will restore ${tileCount} tile(s) from the archive.` : ''}`)) {
                    onUnarchiveCategory(categoryName);
                  }
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-md transition-all ml-2"
                title="Restore category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-1.281z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            {onArchiveCategory && !isRecycleBin && !isArchive && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (confirm(`Are you sure you want to archive the category "${categoryName}"?${tileCount > 0 ? `\n\nThis will move ${tileCount} tile(s) to the archive.` : ''}`)) {
                    onArchiveCategory(categoryName);
                  }
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-md transition-all ml-2"
                title="Archive category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
                  <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.801a2 2 0 01-1.99-1.79L2 7.5zm5.22 1.22a.75.75 0 011.06 0L10 10.94l1.72-1.22a.75.75 0 111.06 1.06L11 12.06l1.72 1.22a.75.75 0 11-1.06 1.06L10 13.06l-1.72 1.22a.75.75 0 01-1.06-1.06L9 12.06l-1.72-1.22a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            {onExportCategory && user?.is_admin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onExportCategory(categoryName);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-md transition-all ml-1"
                title="Export this category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M3.75 2.75A.75.75 0 014.5 2h11a.75.75 0 01.75.75v6.5a.75.75 0 01-1.5 0V4.56l-4.72 4.72a.75.75 0 01-1.06 0L5.25 4.56v9.69h3.5a.75.75 0 010 1.5h-4.25a.75.75 0 01-.75-.75v-12z" />
                  <path d="M12.75 10.75a.75.75 0 00-1.5 0v3.44l-1.72-1.72a.75.75 0 10-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l3.25-3.25a.75.75 0 10-1.06-1.06l-1.72 1.72v-3.44z" />
                </svg>
              </button>
            )}
            {onImportCategory && user?.is_admin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onImportCategory(categoryName);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-md transition-all ml-1"
                title="Import tiles/spaces to this category"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M9.25 3.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  <path fillRule="evenodd" d="M2 9a7 7 0 0112.452-4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9zm14.25 0a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            {onCloneCategory && user?.is_admin && !isRecycleBin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCloneCategory(categoryName);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-md transition-all ml-1"
                title="Clone this category with all tiles/spaces"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                  <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                </svg>
              </button>
            )}
            {onScheduleCategory && user?.is_admin && !isRecycleBin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onScheduleCategory(categoryName);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-md transition-all ml-1"
                title="Schedule category availability"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            {onManageVisibility && user?.is_admin && !isRecycleBin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onManageVisibility(categoryName);
                }}
                className="opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-md transition-all ml-1"
                title="Manage tile visibility (private/authenticated)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            {onToggleCategoryFavorite && !isRecycleBin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleCategoryFavorite(categoryName);
                }}
                className={`opacity-0 group-hover/category:opacity-100 transition-opacity p-1.5 rounded-md transition-all ml-1 ${isCategoryFavorited
                  ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                  : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                  }`}
                title={isCategoryFavorited ? 'Remove all tiles from favorites' : 'Add all tiles to favorites'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill={isCategoryFavorited ? 'currentColor' : 'none'} stroke="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </>
        )}
      </div>

      {/* Category Content (tiles grid) */}
      {children}
    </div>
  );
};

// Sortable Tile Component
interface SortableTileProps {
  tile: Tile;
  isAuthenticated: boolean;
  onTileClick: (tileId: string) => void;
  onDeleteTile: (e: React.MouseEvent, tileId: string) => void;
  onEditTile?: (tile: Tile) => void;
  onCloneTile?: (e: React.MouseEvent, tileId: string) => void;
  onToggleFavorite?: (tileId: string) => void;
  onMoveToCategory?: (tileId: string, categoryName: string) => void;
  onMoveLeft?: (tileId: string) => void;
  onMoveRight?: (tileId: string) => void;
  onExportTile?: (tile: Tile) => void;
  onRestoreTile?: (e: React.MouseEvent, tileId: string) => void;
  onPermanentDeleteTile?: (e: React.MouseEvent, tileId: string) => void;
  onArchiveTile?: (e: React.MouseEvent, tileId: string) => void;
  onUnarchiveTile?: (e: React.MouseEvent, tileId: string) => void;
  onShowTileInfo?: (tile: Tile) => void;
  onShareTile?: (tile: Tile) => void;
  onRemoveSharedTile?: (tile: Tile) => void;
  onBlockSharer?: (tile: Tile) => void;
  isRecycleBin?: boolean;
  isArchive?: boolean;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  availableCategories: string[];
  groupIndex: number;
  tileIndex: number;
  animationClass?: string;
  ownerLookup?: Record<number, string>; // userId -> username for Private tab
}

const SortableTile: React.FC<SortableTileProps> = ({
  tile,
  isAuthenticated,
  onTileClick,
  onDeleteTile,
  onEditTile,
  onCloneTile,
  onToggleFavorite,
  onMoveToCategory,
  onMoveLeft,
  onMoveRight,
  onExportTile,
  onRestoreTile,
  onPermanentDeleteTile,
  onArchiveTile,
  onUnarchiveTile,
  onShowTileInfo,
  onShareTile,
  onRemoveSharedTile,
  onBlockSharer,
  isRecycleBin = false,
  isArchive = false,
  canMoveLeft = false,
  canMoveRight = false,
  availableCategories,
  groupIndex,
  tileIndex,
  animationClass = '',
  ownerLookup
}) => {
  const { user } = useAuth();
  const ownerUsername = (tile.userId != null && tile.userId !== user?.id)
    ? (tile.sharedWithMeSharer?.username ?? ownerLookup?.[tile.userId] ?? null)
    : null;
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  useEscapeToClose(showCategoryDialog, () => setShowCategoryDialog(false));
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [fireworksTrigger, setFireworksTrigger] = useState(0);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [snowfallTrigger, setSnowfallTrigger] = useState(0);
  const [heartsRisingTrigger, setHeartsRisingTrigger] = useState(0);
  const [heartsFallingTrigger, setHeartsFallingTrigger] = useState(0);
  const [bubblesTrigger, setBubblesTrigger] = useState(0);
  const [butterfliesTrigger, setButterfliesTrigger] = useState(0);
  const [birdsFlyingTrigger, setBirdsFlyingTrigger] = useState(0);
  const [rocketLaunchTrigger, setRocketLaunchTrigger] = useState(0);
  const [burstFireworksTrigger, setBurstFireworksTrigger] = useState(0);
  const [sparklesTrigger, setSparklesTrigger] = useState(0);
  const [petalsTrigger, setPetalsTrigger] = useState(0);
  const [shootingStarsTrigger, setShootingStarsTrigger] = useState(0);
  const [leavesTrigger, setLeavesTrigger] = useState(0);
  const [firefliesTrigger, setFirefliesTrigger] = useState(0);
  const [balloonsTrigger, setBalloonsTrigger] = useState(0);
  const [starsTrigger, setStarsTrigger] = useState(0);
  const [rainbowTrigger, setRainbowTrigger] = useState(0);
  const tileRef = useRef<HTMLDivElement>(null);
  // Below lg: header image is hidden → force title/description. At lg+: restore checkbox behavior (image only when those are unchecked).
  const [isCompactLayout, setIsCompactLayout] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : true
  );

  useEffect(() => {
    const update = () => {
      setIsCompactLayout(window.innerWidth < 1024); // Tailwind lg
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);


  // Helper function to strip formatting characters for plain text display (tooltips, etc.)
  const stripFormatting = (content: string): string => {
    // Remove bold markers: **text** or *text*
    let plainText = content.replace(/\*\*(.*?)\*\*/g, '$1');
    plainText = plainText.replace(/\*([^*]+)\*/g, '$1');
    // Remove italic markers: _text_
    plainText = plainText.replace(/_([^_]+)_/g, '$1');
    return plainText;
  };

  // Helper function to parse URLs and render clickable links with formatting
  const renderMessageContent = (content: string) => {
    // URL regex pattern
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    // Bold pattern: **text**
    const boldPattern = /(\*\*)(.*?)\1/g;
    // Italic pattern: _text_ (not already part of bold)
    const italicPattern = /(?<!\*)_([^_]+)_(?!\*)/g;

    let processedContent = content;

    // Process bold text first
    processedContent = processedContent.replace(boldPattern, '<strong>$2</strong>');

    // Process italic text (avoid conflicts with bold)
    processedContent = processedContent.replace(italicPattern, '<em>$1</em>');

    // Split by URLs to process them separately
    const parts = processedContent.split(urlPattern);

    return parts.map((part, index) => {
      if (urlPattern.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold hover:opacity-80 transition-opacity inherit"
            style={{ color: 'inherit' }}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return <span key={index} dangerouslySetInnerHTML={{ __html: part }} />;
    });
  };

  const styles = COLOR_STYLES[tile.themeColor] || COLOR_STYLES['blue'];
  const linkCount = tile.isHyperlink ? 0 : (typeof tile.linkCount === 'number' ? tile.linkCount : (() => {
    const uniqueLinks = new Set<string>();
    const processLink = (link: any) => {
      const key = `${(link.label || '').toLowerCase()}|${(link.url || '').toLowerCase()}`;
      uniqueLinks.add(key);
    };

    if (tile.tabs && tile.tabs.length > 0) {
      tile.tabs.forEach(tab => {
        tab.sections?.forEach(section => {
          section.links?.forEach(processLink);
        });
      });
    } else {
      tile.sections?.forEach(section => {
        section.links?.forEach(processLink);
      });
    }
    return uniqueLinks.size;
  })());

  const activeMessages = (tile.messages?.filter(m => m.isActive && (!m.startDate || new Date(m.startDate) <= new Date()) && (!m.endDate || new Date(m.endDate) >= new Date()) && (m.displayLocation === 'tile' || m.displayLocation === 'both' || !m.displayLocation)) || []).sort((a, b) => (a.priority || 0) - (b.priority || 0));

  // Helper function to get animation class based on animation type
  const getMessageAnimationClass = (animationType?: string) => {
    if (!animationType || animationType === 'rollover' || animationType === 'still') return '';
    return `message-animate-${animationType}`;
  };

  // Get animation duration in seconds based on animation type
  const getAnimationDuration = (animationType?: string): number => {
    if (animationType === 'still') return 0; // No animation duration for still
    const durations: Record<string, number> = {
      'flash': 1.5,
      'flip-horizontal': 2,
      'flip-vertical': 2,
      'bounce': 2,
      'pulse': 2,
      'shake': 1,
      'fade': 2,
      'slide': 3
    };
    return durations[animationType || ''] || 2;
  };

  // Cycle through messages sequentially for non-rollover animations
  useEffect(() => {
    if (activeMessages.length <= 1) {
      setCurrentMessageIndex(0);
      return;
    }

    // Check if any message uses non-rollover animation (including 'still')
    const hasNonRollover = activeMessages.some(msg => msg.animationType && msg.animationType !== 'rollover');
    if (!hasNonRollover) {
      // All messages are rollover - don't cycle
      setCurrentMessageIndex(0);
      return;
    }

    // Get current message
    const currentMsg = activeMessages[currentMessageIndex];
    if (!currentMsg || currentMessageIndex >= activeMessages.length) {
      setCurrentMessageIndex(0);
      return;
    }

    const animationType = currentMsg.animationType || 'rollover';

    // Calculate duration: animation duration + delay before next message
    const animationDuration = animationType === 'rollover' ? 0 : getAnimationDuration(animationType);
    const delayBefore = currentMsg.delayBefore || 0;
    // For 'still' messages with no delay, use a default display duration (3 seconds)
    const displayDuration = animationType === 'still' && delayBefore === 0 ? 3 : (animationDuration + delayBefore);
    const totalDuration = displayDuration * 1000; // Convert to milliseconds

    // Only set timer if we have a duration (non-rollover)
    if (animationType === 'rollover' && totalDuration <= 0) {
      // Skip rollover messages immediately
      setCurrentMessageIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % activeMessages.length;
        return nextIndex;
      });
      return;
    }

    const timer = setTimeout(() => {
      setCurrentMessageIndex((prevIndex) => (prevIndex + 1) % activeMessages.length);
    }, totalDuration);

    return () => clearTimeout(timer);
  }, [currentMessageIndex, activeMessages]);
  const activeMessagesCount = activeMessages.length;

  // Create a stable dependency for the effect based on active celebration messages
  const celebrationMessageKeys = activeMessages
    .filter(msg => msg.type === 'celebration')
    .map(msg => `${msg.id}-${msg.celebrationEffect}-${JSON.stringify(msg.celebrationConfig ?? {})}`)
    .join(',');

  // Trigger fireworks or confetti for celebration messages based on celebrationEffect setting
  useEffect(() => {
    const celebrationMessages = activeMessages.filter(msg => msg.type === 'celebration');

    if (celebrationMessages.length > 0) {
      let effectType = celebrationMessages[0].celebrationEffect || 'fireworks';
      if (effectType === 'hearts') effectType = 'hearts-rising';
      const cfg = celebrationMessages[0].celebrationConfig ?? {};
      const intervalMs = Math.max(2000, Math.min(15000, cfg.triggerIntervalMs ?? 5000));

      const resetAllTriggers = () => {
        setFireworksTrigger(0);
        setConfettiTrigger(0);
        setSnowfallTrigger(0);
        setHeartsRisingTrigger(0);
        setHeartsFallingTrigger(0);
        setBubblesTrigger(0);
        setButterfliesTrigger(0);
        setBirdsFlyingTrigger(0);
        setRocketLaunchTrigger(0);
        setBurstFireworksTrigger(0);
        setSparklesTrigger(0);
        setPetalsTrigger(0);
        setShootingStarsTrigger(0);
        setLeavesTrigger(0);
        setFirefliesTrigger(0);
        setBalloonsTrigger(0);
        setStarsTrigger(0);
        setRainbowTrigger(0);
      };

      if (effectType === 'none') {
        resetAllTriggers();
        return;
      }

      const triggerMap: Record<string, React.Dispatch<React.SetStateAction<number>>> = {
        'fireworks': setFireworksTrigger,
        'confetti': setConfettiTrigger,
        'snowfall': setSnowfallTrigger,
        'hearts-rising': setHeartsRisingTrigger,
        'hearts-falling': setHeartsFallingTrigger,
        'bubbles': setBubblesTrigger,
        'butterflies': setButterfliesTrigger,
        'birds-flying': setBirdsFlyingTrigger,
        'rocket-launch': setRocketLaunchTrigger,
        'burst-fireworks': setBurstFireworksTrigger,
        'sparkles': setSparklesTrigger,
        'petals': setPetalsTrigger,
        'shooting-stars': setShootingStarsTrigger,
        'leaves': setLeavesTrigger,
        'fireflies': setFirefliesTrigger,
        'balloons': setBalloonsTrigger,
        'stars': setStarsTrigger,
        'rainbow': setRainbowTrigger,
      };
      const setTrigger = triggerMap[effectType];
      if (setTrigger) {
        setTrigger(prev => prev + 1);
        const interval = setInterval(() => setTrigger(prev => prev + 1), intervalMs);
        return () => clearInterval(interval);
      }
    } else {
      setFireworksTrigger(0);
      setConfettiTrigger(0);
      setSnowfallTrigger(0);
      setHeartsRisingTrigger(0);
      setHeartsFallingTrigger(0);
      setBubblesTrigger(0);
      setButterfliesTrigger(0);
      setBirdsFlyingTrigger(0);
      setRocketLaunchTrigger(0);
      setBurstFireworksTrigger(0);
      setSparklesTrigger(0);
      setPetalsTrigger(0);
      setShootingStarsTrigger(0);
      setLeavesTrigger(0);
      setFirefliesTrigger(0);
      setBalloonsTrigger(0);
      setStarsTrigger(0);
      setRainbowTrigger(0);
    }
  }, [celebrationMessageKeys]);



  const currentCategory = tile.group || 'General';

  const animationDelay = (groupIndex * 80) + (tileIndex * 50);

  // Check if tile has local decoration (takes precedence over global)
  // Only count as local decoration if tile has actual visual customizations
  // Border radius alone should NOT trigger local decoration mode
  // Text color alone should NOT trigger local decoration mode
  const hasLocalDecoration = !!(
    tile.tileBackgroundColor ||
    (tile.tileGradientEnabled && tile.tileGradientColors && tile.tileGradientColors.length > 0)
  );

  // Build decoration styles (local decoration takes precedence)
  const decorationStyles: React.CSSProperties = {
    animationDelay: `${animationDelay}ms`,
  };

  // Apply local decoration if it exists, using CSS custom properties for !important override
  if (hasLocalDecoration) {
    // Background color or gradient (local takes precedence - use CSS variables)
    if (tile.tileGradientEnabled && tile.tileGradientColors && tile.tileGradientColors.length > 0) {
      // Build gradient with color positions
      const hasPositions = tile.tileGradientColorPositions && tile.tileGradientColorPositions.length === tile.tileGradientColors.length;
      const gradientStops = tile.tileGradientColors.map((color, i) => {
        if (hasPositions) {
          return `${color} ${tile.tileGradientColorPositions![i]}%`;
        }
        return color;
      }).join(', ');

      let gradientValue = '';
      const angle = typeof tile.tileGradientDirection === 'number' ? tile.tileGradientDirection : (typeof tile.tileGradientDirection === 'string' ? parseInt(tile.tileGradientDirection.replace('deg', '')) || 90 : 90);

      if (tile.tileGradientType === 'linear' || tile.tileGradientType === 'repeating-linear') {
        const prefix = tile.tileGradientType === 'repeating-linear' ? 'repeating-linear-gradient' : 'linear-gradient';
        gradientValue = `${prefix}(${angle}deg, ${gradientStops})`;
      } else if (tile.tileGradientType === 'radial' || tile.tileGradientType === 'repeating-radial') {
        const prefix = tile.tileGradientType === 'repeating-radial' ? 'repeating-radial-gradient' : 'radial-gradient';
        gradientValue = `${prefix}(circle, ${gradientStops})`;
      } else if (tile.tileGradientType === 'conic' || tile.tileGradientType === 'repeating-conic') {
        const prefix = tile.tileGradientType === 'repeating-conic' ? 'repeating-conic-gradient' : 'conic-gradient';
        gradientValue = `${prefix}(from ${angle}deg, ${gradientStops})`;
      }
      // Set as CSS custom property so it can override !important rules
      decorationStyles['--tile-local-background-image' as any] = gradientValue;
      decorationStyles.backgroundImage = gradientValue;
      decorationStyles.background = gradientValue;
      decorationStyles.backgroundColor = 'transparent';
    } else if (tile.tileBackgroundColor) {
      decorationStyles['--tile-local-background' as any] = tile.tileBackgroundColor;
      decorationStyles.backgroundColor = tile.tileBackgroundColor;
      decorationStyles.background = tile.tileBackgroundColor;
      decorationStyles.backgroundImage = 'none'; // Explicitly clear any background images
    } else {
      // If no background is set locally, don't set CSS variables (let global styles apply)
      // But we still mark it as having local decoration if other properties are set
    }

    // Text color (local takes precedence) - only apply if defined AND tile has other decorations
    // This prevents forcing text color on tiles without decorations
    // Also ignore #000000 (black) as it's effectively "no decoration"
    const effectiveTextColor = tile.tileTextColor &&
      tile.tileTextColor.toLowerCase() !== '#000000' &&
      tile.tileTextColor.toLowerCase() !== '000000'
      ? tile.tileTextColor
      : null;
    if (effectiveTextColor && hasLocalDecoration) {
      decorationStyles['--tile-local-text-color' as any] = effectiveTextColor;
      decorationStyles.color = effectiveTextColor;
    }
  }

  // Border radius - apply independently of local decoration
  // This allows border radius customization without triggering the local decoration CSS overrides
  if (tile.tileBorderRadius !== undefined && tile.tileBorderRadius !== null) {
    // Set CSS custom property so !important rules in CSS can use it
    decorationStyles['--tile-local-border-radius' as any] = `${tile.tileBorderRadius}px`;
    decorationStyles.borderRadius = `${tile.tileBorderRadius}px`;
  }

  // Split animation class - only apply decoration class if no local decoration
  // Extract just the animation class (remove decoration class if local decoration exists)
  let finalAnimationClass = animationClass || '';
  if (hasLocalDecoration && animationClass) {
    // Remove decoration classes from animationClass, keep only animation classes
    const decorationClasses = ['tile-decor-christmas', 'tile-decor-thanksgiving', 'tile-decor-veterans',
      'tile-decor-halloween', 'tile-decor-new-year', 'tile-decor-valentine', 'tile-decor-st-patrick',
      'tile-decor-easter', 'tile-decor-birthday', 'tile-decor-party', 'tile-decor-snow',
      'tile-decor-autumn', 'tile-decor-spring', 'tile-decor-summer'];

    const classParts = animationClass.split(' ').filter(cls => {
      // Keep animation classes, remove decoration classes
      return !decorationClasses.some(decClass => cls.includes(decClass));
    });
    finalAnimationClass = classParts.join(' ');
  }

  const tileAnimatedClass = finalAnimationClass ? 'linknest-tile-animated' : '';

  // Use default border class
  const borderClass = 'border border-slate-200 dark:border-slate-700/50 hover:border-brand-300 dark:hover:border-brand-500/50';

  return (
    <div
      ref={tileRef}
      style={decorationStyles}
      onClick={() => onTileClick(tile.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTileClick(tile.id);
        }
      }}
      className={`
        linknest-tile ${hasLocalDecoration ? 'has-local-decoration' : ''} ${tileAnimatedClass} ${finalAnimationClass} group relative overflow-hidden ${tile.tileBorderRadius === undefined ? 'rounded-xl' : ''} ${borderClass}
        transition-[transform,box-shadow,border-color] duration-200 ease-out
        flex flex-col h-full min-h-[140px] min-w-0 cursor-pointer
      `}
    >
      {/* Celebration effect animations */}
      {(() => {
        const celeb = activeMessages.filter(m => m.type === 'celebration')[0];
        const effectCfg = celeb?.celebrationEffect && celeb.celebrationEffect !== 'none' ? celeb.celebrationConfig : undefined;
        return (
          <>
            <TileFireworks trigger={fireworksTrigger} tileRef={tileRef} config={effectCfg} />
            <TileConfetti trigger={confettiTrigger} tileRef={tileRef} config={effectCfg} />
            <TileSnowfall trigger={snowfallTrigger} tileRef={tileRef} config={effectCfg} />
            <TileHeartsRising trigger={heartsRisingTrigger} tileRef={tileRef} config={effectCfg} />
            <TileHeartsFalling trigger={heartsFallingTrigger} tileRef={tileRef} config={effectCfg} />
            <TileBubbles trigger={bubblesTrigger} tileRef={tileRef} config={effectCfg} />
            <TileButterflies trigger={butterfliesTrigger} tileRef={tileRef} config={effectCfg} />
            <TileBirdsFlying trigger={birdsFlyingTrigger} tileRef={tileRef} config={effectCfg} />
            <TileRocketLaunch trigger={rocketLaunchTrigger} tileRef={tileRef} config={effectCfg} />
            <TileBurstFireworks trigger={burstFireworksTrigger} tileRef={tileRef} config={effectCfg} />
            <TileSparkles trigger={sparklesTrigger} tileRef={tileRef} config={effectCfg} />
            <TilePetals trigger={petalsTrigger} tileRef={tileRef} config={effectCfg} />
            <TileShootingStars trigger={shootingStarsTrigger} tileRef={tileRef} config={effectCfg} />
            <TileLeaves trigger={leavesTrigger} tileRef={tileRef} config={effectCfg} />
            <TileFireflies trigger={firefliesTrigger} tileRef={tileRef} config={effectCfg} />
            <TileBalloons trigger={balloonsTrigger} tileRef={tileRef} config={effectCfg} />
            <TileStars trigger={starsTrigger} tileRef={tileRef} config={effectCfg} />
            <TileRainbow trigger={rainbowTrigger} tileRef={tileRef} config={effectCfg} />
          </>
        );
      })()}

      {/* Header logo: desktop (lg+) only — hidden on small screens so title/description can take over */}
      {tile.headerImage ? (
        <img
          src={tile.headerImage}
          alt=""
          className={`absolute top-3 right-3 z-0 max-w-[10rem] h-10 pointer-events-none select-none hidden lg:block ${
            tile.headerImageFit === 'cover' ? 'object-cover' : 'object-contain'
          } ${
            tile.headerImageAlign === 'left'
              ? 'object-left'
              : tile.headerImageAlign === 'center'
                ? 'object-center'
                : 'object-right'
          }`}
          style={{
            opacity: Math.max(0, Math.min(100, tile.headerImageOpacity ?? 100)) / 100,
            transform: `translate(${Math.max(-300, Math.min(300, tile.headerImageOffsetX ?? 0))}px, ${Math.max(-300, Math.min(300, tile.headerImageOffsetY ?? 0))}px) scale(${Math.max(50, Math.min(300, tile.headerImageZoom ?? 100)) / 100})`
          }}
          draggable={false}
        />
      ) : null}

      {/* Compact Header — min-w-0 + flex-wrap on actions so controls stay visible in narrow tiles */}
      <div className="flex items-start gap-2 mb-3 min-w-0">
        {tile.showEmoji !== false ? (
          <div className="flex items-center gap-2 shrink-0">
            <div className={`
              w-10 h-10 rounded-lg ${styles.soft} flex items-center justify-center text-lg 
              border ${styles.border} transition-shadow duration-200 ease-out group-hover:shadow-md overflow-hidden
            `}>
              {tile.emojiImage ? (
                <img
                  src={tile.emojiImage}
                  alt=""
                  className="w-full h-full object-contain p-0.5 pointer-events-none select-none"
                  style={{
                    opacity: Math.max(0, Math.min(100, tile.emojiImageOpacity ?? 100)) / 100,
                    transform: `translate(${Math.max(-50, Math.min(50, tile.emojiImageOffsetX ?? 0))}px, ${Math.max(-50, Math.min(50, tile.emojiImageOffsetY ?? 0))}px) scale(${Math.max(50, Math.min(300, tile.emojiImageZoom ?? 100)) / 100})`
                  }}
                  draggable={false}
                />
              ) : (
                tile.emoji
              )}
            </div>
          </div>
        ) : null}
        <div className="relative flex-1 min-w-0 min-h-[40px]">
          <div className="relative z-10 opacity-0 group-hover:opacity-100 transition-opacity flex flex-wrap items-center gap-1 justify-end w-full min-w-0">
          {isAuthenticated && (
            <>
              {/* Category Selector */}
              {onMoveToCategory && (user?.is_admin || tile.visibility === 'private') && (
                <>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowCategoryDialog(true);
                    }}
                    className="p-1 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded transition-all"
                    title="Move to category"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M5.5 17a4.5 4.5 0 01-1.44-8.765 4.5 4.5 0 018.302-3.046 3.5 3.5 0 014.504 4.272A4 4 0 0115 17H5.5zm3.75-2a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zm0-2a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zM9 12a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0V12z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {/* Move to Category Dialog */}
                  {showCategoryDialog && createPortal(
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCategoryDialog(false)}>
                      <div
                        className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#333] w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#333] flex items-center justify-between bg-slate-50 dark:bg-[#252525]">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-500/10 text-brand-500">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M5.5 17a4.5 4.5 0 01-1.44-8.765 4.5 4.5 0 018.302-3.046 3.5 3.5 0 014.504 4.272A4 4 0 0115 17H5.5zm3.75-2a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zm0-2a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0v-.5zM9 12a.75.75 0 00-1.5 0v.5a.75.75 0 001.5 0V12z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div>
                              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Move to Category</h2>
                              <p className="text-sm text-slate-500 dark:text-slate-400">{tile.title || 'Untitled Tile'}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowCategoryDialog(false)}
                            className="p-2 hover:bg-slate-200 dark:hover:bg-[#333] rounded-xl transition-colors text-slate-500"
                          >
                            <FaTimes size={18} />
                          </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
                            Select Category
                          </h3>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {availableCategories.map((category) => (
                              <button
                                key={category}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (category !== currentCategory && onMoveToCategory) {
                                    onMoveToCategory(tile.id, category);
                                  }
                                  setShowCategoryDialog(false);
                                }}
                                className={`px-4 py-3 rounded-xl font-semibold text-sm transition-all ${category === currentCategory
                                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 ring-2 ring-blue-500'
                                  : 'bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#333] border border-slate-200 dark:border-[#333]'
                                  }`}
                              >
                                {category}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#252525] flex justify-end">
                          <button
                            onClick={() => setShowCategoryDialog(false)}
                            className="px-5 py-2 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors rounded-lg hover:bg-slate-200 dark:hover:bg-[#333] border border-slate-300 dark:border-[#444] font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>,
                    document.body
                  )}
                </>
              )}

              {/* Favorite Button - Hide in recycle bin */}
              {onToggleFavorite && !isRecycleBin && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleFavorite(tile.id);
                  }}
                  className={`p-1 rounded transition-all ${tile.isFavorite
                    ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                    : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                    }`}
                  title={tile.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill={tile.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </>
          )}
          {/* Favorite Button for Public Users - shown on card hover (parent opacity) */}
          {!isAuthenticated && onToggleFavorite && !isRecycleBin && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite(tile.id);
              }}
              className={`p-1 rounded transition-all ${isPublicFavorite(tile.id)
                ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                }`}
              title={isPublicFavorite(tile.id) ? 'Remove from favorites' : 'Add to favorites'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill={isPublicFavorite(tile.id) ? 'currentColor' : 'none'} stroke="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {/* Info Button - Show if user has canViewTileInfo permission (tile admins) or can view tile (non-admins) */}
          {onShowTileInfo && (tile.canViewTileInfo !== false && (tile.canViewTileInfo === true || tile.canView === true)) && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onShowTileInfo(tile);
              }}
              className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-all"
              title="Show tile information"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {/* Edit Button - Only show if user has explicit edit permission AND canEditTile permission */}
          {onEditTile && tile.canEdit === true && (tile.canEditTile === undefined || tile.canEditTile === true) && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEditTile(tile);
              }}
              className="p-1 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded transition-all"
              title="Edit"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
              </svg>
            </button>
          )}


          {/* Clone Button - Show if user is admin, or has edit + canCloneTile permission */}
          {onCloneTile && (user?.is_admin || (tile.canEdit && tile.canCloneTile === true)) && (
            <button
              onClick={(e) => onCloneTile(e, tile.id)}
              className="p-1 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-all"
              title="Clone"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
              </svg>
            </button>
          )}

          {/* Share Button - For tiles user owns (can edit) */}
          {onShareTile && tile.canEdit === true && !tile.sharedWithMeInvitationId && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShareTile(tile); }}
              className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-all"
              title="Share with user"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M13 4.5a2.5 2.5 0 11.602 4.765l-.875 2.035a.75.75 0 001.396.264l.875-2.034a2.501 2.501 0 10-.602-4.765zm-6 0a2.5 2.5 0 11.602 4.765l-.875 2.035a.75.75 0 101.396.264l.875-2.034a2.501 2.501 0 00-.602-4.765zM7 14a2.5 2.5 0 01-.875-4.765l.875-2.034a.75.75 0 001.396.264l-.875 2.035A2.5 2.5 0 017 14z" />
              </svg>
            </button>
          )}

          {/* Remove shared tile & Block sharer - For tiles shared with current user */}
          {tile.sharedWithMeInvitationId && (onRemoveSharedTile || onBlockSharer) && (
            <>
              {onRemoveSharedTile && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveSharedTile(tile); }}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-700/50 rounded transition-all"
                  title="Remove from my Private tab"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              )}
              {onBlockSharer && tile.sharedWithMeSharer && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBlockSharer(tile); }}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
                  title={`Block ${tile.sharedWithMeSharer.username} from sharing`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </>
          )}

          {/* Export Button - Only show if user is admin */}
          {onExportTile && user?.is_admin && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onExportTile(tile);
              }}
              className="p-1 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-all"
              title="Export this tile/space"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M3.75 2.75A.75.75 0 014.5 2h11a.75.75 0 01.75.75v6.5a.75.75 0 01-1.5 0V4.56l-4.72 4.72a.75.75 0 01-1.06 0L5.25 4.56v9.69h3.5a.75.75 0 010 1.5h-4.25a.75.75 0 01-.75-.75v-12z" />
                <path d="M12.75 10.75a.75.75 0 00-1.5 0v3.44l-1.72-1.72a.75.75 0 10-1.06 1.06l3.25 3.25a.75.75 0 001.06 0l3.25-3.25a.75.75 0 10-1.06-1.06l-1.72 1.72v-3.44z" />
              </svg>
            </button>
          )}


          {/* Delete/Restore Button */}
          {isRecycleBin && onRestoreTile ? (
            // Show restore and permanent delete buttons in recycle bin
            <>
              <button
                onClick={(e) => onRestoreTile(e, tile.id)}
                className="p-1 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-all"
                title="Restore"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-1.281z" clipRule="evenodd" />
                </svg>
              </button>
              {onPermanentDeleteTile && (
                <button
                  onClick={(e) => onPermanentDeleteTile(e, tile.id)}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
                  title="Permanently Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </>
          ) : isArchive ? (
            // Show restore, delete, and remove favorite buttons in archive
            <>
              {onUnarchiveTile && (
                <button
                  onClick={(e) => onUnarchiveTile(e, tile.id)}
                  className="p-1 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-all"
                  title="Restore"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-1.281z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
              {tile.canDelete === true && onDeleteTile && (
                <button
                  onClick={(e) => onDeleteTile(e, tile.id)}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
                  title="Delete (Move to Recycle Bin)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
              {onToggleFavorite && tile.isFavorite && (
                <button
                  onClick={() => onToggleFavorite(tile.id)}
                  className="p-1 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded transition-all"
                  title="Remove Favorite"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </>
          ) : tile.canDelete === true ? (
            // Show delete and archive buttons if user has explicit delete permission
            <>
              {onDeleteTile && (
                <button
                  onClick={(e) => onDeleteTile(e, tile.id)}
                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
                  title="Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
              {onArchiveTile && (
                <button
                  onClick={(e) => onArchiveTile(e, tile.id)}
                  className="p-1 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded transition-all"
                  title="Archive"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
                    <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.801a2 2 0 01-1.99-1.79L2 7.5zm5.22 1.22a.75.75 0 011.06 0L10 10.94l1.72-1.22a.75.75 0 111.06 1.06L11 12.06l1.72 1.22a.75.75 0 11-1.06 1.06L10 13.06l-1.72 1.22a.75.75 0 01-1.06-1.06L9 12.06l-1.72-1.22a.75.75 0 010-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </>
          ) : null}
          </div>
        </div>
      </div>

      {/* Compact Title and Description — on small screens, force text when header image is hidden; on large screens respect checkboxes */}
      <div className="relative z-[1] flex-1 mb-3">
        {(() => {
          const hasHeaderImage = Boolean(tile.headerImage?.trim());
          // Small: override hide checkboxes so text fills in for the missing image.
          // Large: respect showTitle / showDescription again (image-only when unchecked).
          const showTitle =
            tile.showTitle !== false || (hasHeaderImage && isCompactLayout);
          const showDescription =
            tile.showDescription !== false || (hasHeaderImage && isCompactLayout);

          return (
            <>
              {showTitle ? (
                <h3 className={`font-bold text-sm leading-tight line-clamp-2 mb-1.5 ${styles.text} group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors`}>
                  {tile.title}
                  {tile.published === false && (
                    <span className="ml-1.5 inline-block align-middle text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold tracking-wide uppercase">
                      Unpublished
                    </span>
                  )}
                </h3>
              ) : (
                tile.published === false ? (
                  <span className="inline-block mb-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold tracking-wide uppercase">
                    Unpublished
                  </span>
                ) : null
              )}
              {showDescription ? (
                <p className="text-slate-600 dark:text-slate-400 text-xs line-clamp-2 leading-snug">
                  {tile.description || 'No description'}
                </p>
              ) : null}
            </>
          );
        })()}
        {ownerUsername && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 truncate" title={`Owner: ${ownerUsername}`}>
            by {ownerUsername}
          </p>
        )}
      </div>

      {/* Compact Footer */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
        {!tile.isHyperlink && (
          <div className={`flex items-center gap-1.5 text-xs font-medium ${styles.text}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
              <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
              <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01-.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
            </svg>
            <span>{linkCount}</span>
          </div>
        )}
        {tile.isHyperlink && <div></div>}

        {/* Center Rolling Message */}
        {activeMessages.length > 0 && (
          <div
            className={`group/message absolute bottom-1 left-0 right-0 transition-all cursor-help ${!tile.isHyperlink ? 'pl-[60px]' : ''} ${!activeMessages[0].textColor ? (
              activeMessages[0].type === 'alert' ? 'text-amber-600 dark:text-amber-400' :
                activeMessages[0].type === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                  activeMessages[0].type === 'celebration' ? 'text-pink-600 dark:text-pink-400' :
                    'text-brand-600 dark:text-brand-400'
            ) : ''}`}
            style={activeMessages[0].textColor ? {
              // Only set color on parent if custom color is set, to override tile text color
              color: activeMessages[0].textColor
            } : undefined}
          >
            {/* Custom Instant Tooltip - Optimized for Small Tiles */}
            <div
              className="tooltip-force-black absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-yellow-400 text-[10px] rounded-lg shadow-xl opacity-0 translate-y-2 group-hover/message:opacity-100 group-hover/message:translate-y-0 transition-all duration-200 pointer-events-none z-[100] border border-yellow-500 w-max max-w-[180px] text-left"
            >
              {activeMessages.map((m, idx) => (
                <div key={m.id} className="last:mb-0 mb-1 leading-tight">
                  {activeMessages.length > 1 && <span className="opacity-50 mr-1">{idx + 1}.</span>}
                  {stripFormatting(m.content)}
                </div>
              ))}
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-yellow-400"></div>
            </div>

            {(() => {
              // Check if all messages use rollover animation
              const allRollover = activeMessages.length > 0 && activeMessages.every(msg => !msg.animationType || msg.animationType === 'rollover');

              if (allRollover) {
                // Rollover animation - stock ticker style: single copy, right-to-left, pause when fully gone
                return (
                  <div className="overflow-hidden">
                    <div className="animate-rolling-tile flex items-center gap-10 text-[10px] sm:text-xs font-semibold">
                      {activeMessages.map((msg, idx) => (
                        <div
                          key={`${msg.id}-${idx}`}
                          className="flex items-center gap-2 shrink-0"
                          style={{
                            ...(msg.textColor ? { '--message-text-color': msg.textColor, color: msg.textColor } : {}),
                            fontStyle: msg.fontStyle === 'italic' || msg.fontStyle === 'bold italic' ? 'italic' : undefined,
                            fontWeight: msg.fontStyle === 'bold' || msg.fontStyle === 'bold italic' ? 'bold' : undefined
                          } as React.CSSProperties}
                          data-message-color={msg.textColor || ''}
                        >
                          {renderMessageContent(msg.content)}
                          {msg.url && (
                            <a
                              href={msg.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 text-[9px] font-medium text-slate-800 dark:text-brand-400 bg-transparent hover:bg-slate-200/50 dark:hover:bg-brand-900/30 rounded transition-colors"
                              onClick={(e) => e.stopPropagation()}
                              title={msg.urlLabel || 'Click for more info'}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5">
                                <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                                <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                              </svg>
                              {msg.urlLabel || 'Info'}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } else {
                // Other animations - show one message at a time, cycle through them
                const currentMsg = activeMessages[currentMessageIndex] || activeMessages[0];

                if (!currentMsg) {
                  return null;
                }

                const currentAnimationType = currentMsg.animationType || 'rollover';
                const animationClass = getMessageAnimationClass(currentAnimationType);

                return (
                  <div className={`flex items-center gap-2 text-[10px] sm:text-xs font-semibold ${animationClass}`}>
                    <div
                      key={`${currentMsg.id}-current`}
                      className="flex items-center gap-1"
                      style={{
                        ...(currentMsg.textColor ? { '--message-text-color': currentMsg.textColor, color: currentMsg.textColor } : {}),
                        fontStyle: currentMsg.fontStyle === 'italic' || currentMsg.fontStyle === 'bold italic' ? 'italic' : undefined,
                        fontWeight: currentMsg.fontStyle === 'bold' || currentMsg.fontStyle === 'bold italic' ? 'bold' : undefined
                      } as React.CSSProperties}
                      data-message-color={currentMsg.textColor || ''}
                    >
                      {renderMessageContent(currentMsg.content)}
                      {currentMsg.url && (
                        <a
                          href={currentMsg.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 text-[9px] font-medium text-slate-800 dark:text-brand-400 bg-transparent hover:bg-slate-200/50 dark:hover:bg-brand-900/30 rounded transition-colors"
                          onClick={(e) => e.stopPropagation()}
                          title={currentMsg.urlLabel || 'Click for more info'}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5">
                            <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                            <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                          </svg>
                          {currentMsg.urlLabel || 'Info'}
                        </a>
                      )}
                    </div>
                  </div>
                );
              }
            })()}
          </div>
        )}

        {/* Reorder Buttons */}

        {/* Arrow Buttons for Reordering - Centered at bottom, only visible for authenticated users */}
        {isAuthenticated && (onMoveLeft || onMoveRight) ? (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 z-10">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onMoveLeft && canMoveLeft) {
                  onMoveLeft(tile.id);
                }
              }}
              disabled={!canMoveLeft}
              className={`p-1 rounded-md transition-all ${canMoveLeft
                ? 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 cursor-pointer'
                : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
                }`}
              title="Move left"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onMoveRight && canMoveRight) {
                  onMoveRight(tile.id);
                }
              }}
              disabled={!canMoveRight}
              className={`p-1 rounded-md transition-all ${canMoveRight
                ? 'text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-500/10 cursor-pointer'
                : 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
                }`}
              title="Move right"
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
};

type TabType = 'favorites' | 'public' | 'public-favorites' | 'your-apps' | 'staging' | 'private' | 'scheduled' | 'expired' | 'archive' | 'recycle-bin' | 'monitoring' | 'monitorv2';

export const TileGrid: React.FC<TileGridProps> = ({
  tiles,
  onUpdateTiles,
  onCreateTile,
  onDeleteTile,
  onCloneTile,
  isAuthenticated = false,
  onAuthRequired,
  darkMode = false,
  toggleTheme = () => { },
  onHelpClick = () => { }
}) => {
  const { settings } = useSettings();
  const { user } = useAuth();
  const isMobile = useMobile(768); // Use mobile view below 768px width

  // Store allowed tabs based on user's roles
  const [allowedTabsByRole, setAllowedTabsByRole] = useState<Set<string>>(new Set());
  const [allowedTabsLoading, setAllowedTabsLoading] = useState(false);

  const disabledAppTabs = useMemo(() => getDisabledTabsFromSettings(settings), [settings?.disabled_tabs]);

  // Check if user has roles - if yes, check role permissions; if no, use global settings only
  const isTabDisabledBySettings = useCallback((tab: TabType) => {
    // Staging tab: admin only (not controlled by global settings)
    if (tab === 'staging') return !isAuthenticated || !user?.is_admin;
    // First check global settings - if disabled globally, hide from everyone
    const disabledGlobally = (() => {
      if (tab === 'favorites' || tab === 'public-favorites') return disabledAppTabs.has('favorites');
      if (tab === 'public') return disabledAppTabs.has('public');
      if (tab === 'your-apps') return disabledAppTabs.has('your-apps');
      if (tab === 'private') return disabledAppTabs.has('private');
      if (tab === 'scheduled') return disabledAppTabs.has('scheduled');
      if (tab === 'expired') return disabledAppTabs.has('expired');
      if (tab === 'archive') return disabledAppTabs.has('archive');
      if (tab === 'recycle-bin') return disabledAppTabs.has('recycle-bin');
      if (tab === 'monitoring') return disabledAppTabs.has('monitoring');
      if (tab === 'monitorv2') {
        // If addon is explicitly disabled (setting exists and is '0'), hide the tab
        // If setting is undefined or missing, allow the tab (default to enabled)
        if (settings?.monitorv2_enabled === '0') return true;
        // If addon is enabled (or default), check tab visibility settings
        return disabledAppTabs.has('monitorv2');
      }
      return false;
    })();

    if (disabledGlobally) return true;

    // If user has roles, check role permissions
    if (isAuthenticated && user && allowedTabsByRole.size > 0) {
      // Convert TabType to the format stored in role_tab_permissions
      const tabIdMap: Record<TabType, string> = {
        'favorites': 'favorites',
        'public-favorites': 'favorites',
        'public': 'public',
        'your-apps': 'your-apps',
        'staging': 'staging',
        'private': 'private',
        'scheduled': 'scheduled',
        'expired': 'expired',
        'archive': 'archive',
        'recycle-bin': 'recycle-bin',
        'monitoring': 'monitoring',
        'monitorv2': 'monitorv2'
      };

      const tabId = tabIdMap[tab];
      // If tab not in allowedTabsByRole, hide it (role-based restriction)
      return !allowedTabsByRole.has(tabId);
    }

    // User has no roles or not authenticated - use global settings only
    return false;
  }, [disabledAppTabs, isAuthenticated, user, allowedTabsByRole, settings]);

  const getFallbackTab = useCallback((): TabType | null => {
    const candidates: TabType[] = isAuthenticated
      ? ([
        'public',
        'your-apps',
        'favorites',
        ...(user?.is_admin ? (['staging'] as TabType[]) : []),
        'private',
        'scheduled',
        'expired',
        'archive',
        'recycle-bin',
        ...(isAuthenticated ? (['monitoring'] as TabType[]) : [])
      ] as TabType[])
      : (['public', 'public-favorites'] as TabType[]);

    for (const c of candidates) {
      // Auth restrictions
      const restrictedTabs: TabType[] = ['private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring', 'monitorv2', 'staging'];
      if (!isAuthenticated && restrictedTabs.includes(c)) continue;
      if (c === 'staging' && !user?.is_admin) continue;
      if (isTabDisabledBySettings(c)) continue;
      return c;
    }
    return null;
  }, [isAuthenticated, user, isTabDisabledBySettings]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTile, setEditingTile] = useState<Tile | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [yourAppsFilter, setYourAppsFilter] = useState<'authenticated' | 'assigned'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('linknest_your_apps_filter');
      if (saved === 'authenticated' || saved === 'assigned') return saved;
      // Migrate former "all" preference to Authenticated
    }
    return 'authenticated';
  });
  const [privateOwnerFilter, setPrivateOwnerFilter] = useState<number | 'all'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('linknest_private_owner_filter');
      if (saved === 'all') return 'all';
      const n = parseInt(saved || '', 10);
      if (!Number.isNaN(n)) return n;
    }
    return 'all';
  });
  const [privateTabUsers, setPrivateTabUsers] = useState<UserListItem[]>([]);
  type PrivateSubTab = 'spaces' | 'sharing' | 'blocked';
  const [privateSubTab, setPrivateSubTab] = useState<PrivateSubTab>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('linknest_private_subtab');
      if (saved === 'spaces' || saved === 'sharing' || saved === 'blocked') return saved;
    }
    return 'spaces';
  });
  const [pendingInvitationsCount, setPendingInvitationsCount] = useState(0);
  const [blockedUsersCount, setBlockedUsersCount] = useState(0);
  const [linkInfoDialog, setLinkInfoDialog] = useState<{ link: Link } | null>(null);
  const [tileInfoDialog, setTileInfoDialog] = useState<{ tile?: Tile; categoryInfo?: { categoryName: string; tiles: Tile[] } } | null>(null);
  const [shareTileDialog, setShareTileDialog] = useState<Tile | null>(null);
  const [favNotesDialogState, setFavNotesDialogState] = useState<{ linkId: string; notes: string; linkLabel: string } | null>(null);
  const [stagingTiles, setStagingTiles] = useState<Tile[]>([]);
  const [stagingTilesLoading, setStagingTilesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    try {
      const saved = localStorage.getItem('linknest_active_tab');
      const validTabs = ['favorites', 'public', 'public-favorites', 'your-apps', 'staging', 'private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring', 'monitorv2'];

      if (saved && validTabs.includes(saved)) {
        // If not authenticated, force public-accessible tabs only
        // monitoring/staging tabs are admin only (checked in useEffect)
        const restrictedTabs = ['private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring', 'monitorv2', 'staging'];
        if (!isAuthenticated && restrictedTabs.includes(saved)) {
          return 'public';
        }
        if (saved === 'staging' && !user?.is_admin) return 'public';
        return saved as TabType;
      }
    } catch (e) {
      console.error('Failed to load active tab', e);
    }
    return 'public';
  });

  const requestTab = useCallback((tab: TabType) => {
    if (isTabDisabledBySettings(tab)) {
      const fallback = getFallbackTab();
      if (fallback) setActiveTab(fallback);
      return;
    }
    // Preserve existing auth rules (staging is admin-only, enforced by isTabDisabledBySettings)
    const restrictedTabs: TabType[] = ['private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring', 'monitorv2', 'staging'];
    if (!isAuthenticated && restrictedTabs.includes(tab)) {
      setActiveTab('public');
      return;
    }
    // When switching to Staging tab, load staging tiles immediately so they show without refresh
    if (tab === 'staging' && isAuthenticated && user?.is_admin) {
      setStagingTilesLoading(true);
      getTiles({ sourceTab: 'staging' })
        .then(t => {
          setStagingTiles(t);
          setStagingTilesLoading(false);
        })
        .catch(() => setStagingTilesLoading(false));
    }
    setActiveTab(tab);
  }, [getFallbackTab, isAuthenticated, isTabDisabledBySettings, user]);

  // If the current tab becomes disabled (or unauthorized), fall back to the first allowed tab
  useEffect(() => {
    const restrictedTabs: TabType[] = ['private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring', 'monitorv2'];
    const unauthorized = (!isAuthenticated && restrictedTabs.includes(activeTab));
    const disabled = isTabDisabledBySettings(activeTab);

    if (unauthorized || disabled) {
      const fallback = getFallbackTab();
      if (fallback && fallback !== activeTab) {
        setActiveTab(fallback);
      }
    }
  }, [activeTab, getFallbackTab, isAuthenticated, isTabDisabledBySettings, user]);

  // Persist active tab changes
  useEffect(() => {
    try {
      localStorage.setItem('linknest_active_tab', activeTab);
    } catch (e) {
      console.error('Failed to save active tab', e);
    }
  }, [activeTab]);

  // Listen for external tab switch events (e.g. from footer)
  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      const tab = e.detail as TabType;
      const validTabs: TabType[] = ['favorites', 'public', 'public-favorites', 'your-apps', 'staging', 'private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring', 'monitorv2'];

      if (tab && validTabs.includes(tab)) {
        if (isTabDisabledBySettings(tab)) {
          const fallback = getFallbackTab();
          if (fallback) setActiveTab(fallback);
          return;
        }
        // Handle guest vs auth favorites
        if (tab === 'favorites' && !isAuthenticated) {
          setActiveTab('public-favorites');
        } else if (tab === 'public-favorites' && isAuthenticated) {
          setActiveTab('favorites');
        } else {
          // Check restricted tabs (staging is admin-only)
          const restrictedTabs = ['private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring', 'monitorv2', 'staging'];
          if (!isAuthenticated && restrictedTabs.includes(tab)) {
            setActiveTab('public');
          } else if (tab === 'staging' && !user?.is_admin) {
            setActiveTab('public');
          } else {
            setActiveTab(tab);
          }
        }
        // Scroll to top when switching tabs
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    window.addEventListener('switchTab', handleSwitchTab);
    return () => window.removeEventListener('switchTab', handleSwitchTab);
  }, [getFallbackTab, isAuthenticated, isTabDisabledBySettings, user]);

  // Fetch allowed tabs based on user's roles when authenticated
  useEffect(() => {
    if (isAuthenticated && user && !user.is_admin) {
      // Only check role permissions for non-admin users
      // Admins can see all tabs (unless disabled globally)
      setAllowedTabsLoading(true);
      rolesService.getCurrentUserAllowedTabs()
        .then(tabs => {
          setAllowedTabsByRole(new Set(tabs));
        })
        .catch(() => {
          // If fetch fails, allow all tabs (fallback to global settings)
          setAllowedTabsByRole(new Set());
        })
        .finally(() => {
          setAllowedTabsLoading(false);
        });
    } else {
      // Not authenticated, admin, or no user - clear role-based restrictions
      setAllowedTabsByRole(new Set());
    }
  }, [isAuthenticated, user]);

  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [publicFavorites, setPublicFavorites] = useState<string[]>([]);
  const [recycleBinTiles, setRecycleBinTiles] = useState<Tile[]>([]);
  const [isLoadingRecycleBin, setIsLoadingRecycleBin] = useState(false);
  const [archiveTiles, setArchiveTiles] = useState<Tile[]>([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  const [favoriteLinks, setFavoriteLinks] = useState<FavoriteLink[]>([]);
  const [isLoadingFavoriteLinks, setIsLoadingFavoriteLinks] = useState(false);
  const [favLinksSort, setFavLinksSort] = useState<'default' | 'asc' | 'desc'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('favLinksSort');
      return (saved as 'default' | 'asc' | 'desc') || 'default';
    }
    return 'default';
  });

  useEffect(() => {
    if (isAuthenticated) {
      userPreferencesService.getPreference('favLinksSort').then(val => {
        if (val !== null && (val === 'default' || val === 'asc' || val === 'desc')) {
          setFavLinksSort(val as 'default' | 'asc' | 'desc');
        }
      });
    }
  }, [isAuthenticated]);

  const handleSetFavLinksSort = (sort: 'default' | 'asc' | 'desc') => {
    setFavLinksSort(sort);
    if (isAuthenticated) {
      userPreferencesService.updatePreference('favLinksSort', sort);
    } else {
      localStorage.setItem('favLinksSort', sort);
    }
  };
  const [linkHealthResults, setLinkHealthResults] = useState<Map<string, LinkHealthCheckResult>>(new Map());
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30); // Default 30s
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(false);
  const [refreshCountdown, setRefreshCountdown] = useState<number>(30);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stagingOfflineKitRef = useRef<StagingOfflineKitHandle>(null);

  // Import progress state
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    status: string;
    errors: string[];
  } | null>(null);

  // Export progress state
  const [exportProgress, setExportProgress] = useState<{
    current: number;
    total: number;
    status: string;
    errors: string[];
  } | null>(null);

  // Delete category progress state
  const [deleteCategoryProgress, setDeleteCategoryProgress] = useState<{
    current: number;
    total: number;
    status: string;
    categoryName: string;
  } | null>(null);

  // New Tile Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSearchTags, setNewSearchTags] = useState<string[]>([]);
  const [newGroup, setNewGroup] = useState('');
  const [newEmoji, setNewEmoji] = useState('📁');
  const [newShowEmoji, setNewShowEmoji] = useState(true);
  const [newShowTitle, setNewShowTitle] = useState(true);
  const [newShowDescription, setNewShowDescription] = useState(true);
  const [newEmojiImage, setNewEmojiImage] = useState<string>('');
  const [newEmojiImageOpacity, setNewEmojiImageOpacity] = useState(100);
  const [newEmojiImageOffsetX, setNewEmojiImageOffsetX] = useState(0);
  const [newEmojiImageOffsetY, setNewEmojiImageOffsetY] = useState(0);
  const [newEmojiImageZoom, setNewEmojiImageZoom] = useState(100);
  const [emojiImageUploading, setEmojiImageUploading] = useState(false);
  const [emojiRemoveBg, setEmojiRemoveBg] = useState(false);
  const [emojiBgMode, setEmojiBgMode] = useState<'auto' | 'custom'>('auto');
  const [emojiBgColor, setEmojiBgColor] = useState('#ffffff');
  const [newHeaderImage, setNewHeaderImage] = useState<string>('');
  const [newHeaderImageAlign, setNewHeaderImageAlign] = useState<'left' | 'center' | 'right'>('right');
  const [newHeaderImageOpacity, setNewHeaderImageOpacity] = useState(100);
  const [newHeaderImageOffsetX, setNewHeaderImageOffsetX] = useState(0);
  const [newHeaderImageOffsetY, setNewHeaderImageOffsetY] = useState(0);
  const [newHeaderImageZoom, setNewHeaderImageZoom] = useState(100);
  const [newHeaderImageFit, setNewHeaderImageFit] = useState<'contain' | 'cover'>('contain');
  const [headerRemoveBg, setHeaderRemoveBg] = useState(false);
  const [headerBgMode, setHeaderBgMode] = useState<'auto' | 'custom'>('auto');
  const [headerBgColor, setHeaderBgColor] = useState('#ffffff');
  const [headerImageUploading, setHeaderImageUploading] = useState(false);
  const [isUpdatingTile, setIsUpdatingTile] = useState(false);
  const [newColor, setNewColor] = useState<ThemeColor>('blue');
  const [newVisibility, setNewVisibility] = useState<TileVisibility>('public');
  const [visibleFrom, setVisibleFrom] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [newAllowedUsers, setNewAllowedUsers] = useState<number[]>([]);
  const [newAllowedGroups, setNewAllowedGroups] = useState<number[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserListItem[]>([]);
  const [availableGroups, setAvailableGroups] = useState<Array<{ id: number; name: string; description: string | null; memberCount: number }>>([]);
  const safeAvailableUsers = Array.isArray(availableUsers) ? availableUsers : [];
  const safeAvailableGroups = Array.isArray(availableGroups) ? availableGroups : [];
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [visibilitySearchTerm, setVisibilitySearchTerm] = useState('');
  const [visibilityActiveTab, setVisibilityActiveTab] = useState<'users' | 'groups'>('users');
  const [newCreateInStaging, setNewCreateInStaging] = useState(false);

  // Hyperlink state
  const [tileType, setTileType] = useState<'space' | 'hyperlink'>('space');
  const [hyperlinkUrl, setHyperlinkUrl] = useState('');
  const [openInNewTab, setOpenInNewTab] = useState(true);

  // Emoji Picker State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // View Mode State
  const [viewMode, setViewMode] = useState<'grid' | 'categories'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('viewMode');
      return (saved === 'grid' || saved === 'categories') ? saved : 'grid';
    }
    return 'grid';
  });

  // Persist viewMode to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('viewMode', viewMode);
    }
  }, [viewMode]);

  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

  // Edit Modal Tab State
  const [editModalActiveTab, setEditModalActiveTab] = useState<'general' | 'decoration' | 'messages'>('general');

  // Tile Decoration State
  const [tileBackgroundColor, setTileBackgroundColor] = useState<string>('');
  const [tileGradientEnabled, setTileGradientEnabled] = useState<boolean>(false);
  const [tileGradientColors, setTileGradientColors] = useState<string[]>(['#3b82f6', '#8b5cf6']);
  const [tileGradientColorPositions, setTileGradientColorPositions] = useState<number[]>([0, 100]);
  const [tileGradientDirection, setTileGradientDirection] = useState<number>(90); // Angle in degrees (0-360)
  const [tileGradientType, setTileGradientType] = useState<'linear' | 'radial' | 'conic' | 'repeating-linear' | 'repeating-radial' | 'repeating-conic'>('linear');
  const [tileBorderRadius, setTileBorderRadius] = useState<number>(12);
  const [tileTextColor, setTileTextColor] = useState<string>('');

  // Messages State
  const [messages, setMessages] = useState<TileMessage[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'warning' | 'celebration' | 'alert' | 'custom'>('info');
  const [messageStartDate, setMessageStartDate] = useState('');
  const [messageEndDate, setMessageEndDate] = useState('');
  const [messageIsActive, setMessageIsActive] = useState(true);
  const [messagePriority, setMessagePriority] = useState<number>(0);
  const [messageTextColor, setMessageTextColor] = useState<string>('');
  const [messageFontStyle, setMessageFontStyle] = useState<string>('normal');
  const [messageDisplayLocation, setMessageDisplayLocation] = useState<'tile' | 'detail' | 'both'>('both');
  const [messageAnimationType, setMessageAnimationType] = useState<'rollover' | 'still' | 'flash' | 'flip-horizontal' | 'flip-vertical' | 'bounce' | 'pulse' | 'shake' | 'fade' | 'slide'>('rollover');
  const [messageDelayBefore, setMessageDelayBefore] = useState<number>(0);
  const [messageCelebrationEffect, setMessageCelebrationEffect] = useState<TileMessage['celebrationEffect']>('fireworks');
  const [messageCelebrationConfig, setMessageCelebrationConfig] = useState<CelebrationConfig>(() => ({
    intensity: 100,
    particleCount: 18,
    particleSize: 100,
    speed: 100,
    triggerIntervalMs: 5000,
  }));
  const [messageUrl, setMessageUrl] = useState<string>('');
  const [messageUrlLabel, setMessageUrlLabel] = useState<string>('');
  const messageBoardImportInputRef = useRef<HTMLInputElement>(null);

  // Celebration Preview triggers in TileGrid for Edit Modal
  const [previewFireworksTrigger, setPreviewFireworksTrigger] = useState(0);
  const [previewConfettiTrigger, setPreviewConfettiTrigger] = useState(0);
  const [previewSnowfallTrigger, setPreviewSnowfallTrigger] = useState(0);
  const [previewHeartsRisingTrigger, setPreviewHeartsRisingTrigger] = useState(0);
  const [previewHeartsFallingTrigger, setPreviewHeartsFallingTrigger] = useState(0);
  const [previewBubblesTrigger, setPreviewBubblesTrigger] = useState(0);
  const [previewButterfliesTrigger, setPreviewButterfliesTrigger] = useState(0);
  const [previewBirdsFlyingTrigger, setPreviewBirdsFlyingTrigger] = useState(0);
  const [previewRocketLaunchTrigger, setPreviewRocketLaunchTrigger] = useState(0);
  const [previewBurstFireworksTrigger, setPreviewBurstFireworksTrigger] = useState(0);
  const [previewSparklesTrigger, setPreviewSparklesTrigger] = useState(0);
  const [previewPetalsTrigger, setPreviewPetalsTrigger] = useState(0);
  const [previewShootingStarsTrigger, setPreviewShootingStarsTrigger] = useState(0);
  const [previewLeavesTrigger, setPreviewLeavesTrigger] = useState(0);
  const [previewFirefliesTrigger, setPreviewFirefliesTrigger] = useState(0);
  const [previewBalloonsTrigger, setPreviewBalloonsTrigger] = useState(0);
  const [previewStarsTrigger, setPreviewStarsTrigger] = useState(0);
  const [previewRainbowTrigger, setPreviewRainbowTrigger] = useState(0);
  const previewTileRef = useRef<HTMLDivElement>(null);

  // Celebration Presets for "Smooth & Slow" effects
  const CELEBRATION_PRESETS: Record<string, CelebrationConfig> = {
    'fireworks': { intensity: 45, particleCount: 12, particleSize: 100, speed: 40, triggerIntervalMs: 6000 },
    'burst-fireworks': { intensity: 55, particleCount: 10, particleSize: 110, speed: 50, triggerIntervalMs: 5000 },
    'confetti': { intensity: 35, particleCount: 20, particleSize: 100, speed: 30, triggerIntervalMs: 8000 },
    'snowfall': { intensity: 25, particleCount: 40, particleSize: 80, speed: 20, triggerIntervalMs: 10000 },
    'hearts-rising': { intensity: 40, particleCount: 15, particleSize: 100, speed: 40, triggerIntervalMs: 7000 },
    'hearts-falling': { intensity: 40, particleCount: 15, particleSize: 100, speed: 40, triggerIntervalMs: 7000 },
    'bubbles': { intensity: 30, particleCount: 15, particleSize: 100, speed: 30, triggerIntervalMs: 8000 },
    'butterflies': { intensity: 40, particleCount: 8, particleSize: 100, speed: 35, triggerIntervalMs: 9000 },
    'birds-flying': { intensity: 45, particleCount: 6, particleSize: 100, speed: 40, triggerIntervalMs: 9000 },
    'rocket-launch': { intensity: 60, particleCount: 5, particleSize: 100, speed: 60, triggerIntervalMs: 12000 },
    'sparkles': { intensity: 50, particleCount: 25, particleSize: 90, speed: 45, triggerIntervalMs: 6000 },
    'petals': { intensity: 30, particleCount: 20, particleSize: 100, speed: 25, triggerIntervalMs: 9000 },
    'shooting-stars': { intensity: 55, particleCount: 4, particleSize: 120, speed: 65, triggerIntervalMs: 10000 },
    'leaves': { intensity: 35, particleCount: 15, particleSize: 100, speed: 30, triggerIntervalMs: 9000 },
    'fireflies': { intensity: 45, particleCount: 20, particleSize: 80, speed: 35, triggerIntervalMs: 7000 },
    'balloons': { intensity: 40, particleCount: 10, particleSize: 100, speed: 35, triggerIntervalMs: 12000 },
    'stars': { intensity: 40, particleCount: 30, particleSize: 90, speed: 30, triggerIntervalMs: 12000 },
    'rainbow': { intensity: 30, particleCount: 1, particleSize: 150, speed: 20, triggerIntervalMs: 15000 },
  };

  const applyCelebrationPreset = () => {
    const preset = CELEBRATION_PRESETS[messageCelebrationEffect || 'fireworks'];
    if (preset) {
      setMessageCelebrationConfig(preset);
    }
  };

  // Helper function to get message status
  const getMessageStatus = (msg: TileMessage): 'active' | 'upcoming' | 'expired' => {
    const now = new Date();
    const startDate = msg.startDate ? new Date(msg.startDate) : null;
    const endDate = msg.endDate ? new Date(msg.endDate) : null;

    if (!msg.isActive) return 'expired';
    if (endDate && now > endDate) return 'expired';
    if (startDate && now < startDate) return 'upcoming';
    return 'active';
  };

  // Helper function to format date for datetime-local input
  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Quick date preset handlers
  const setDatePreset = (preset: 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek' | 'thisMonth' | 'nextMonth', type: 'start' | 'end') => {
    const now = new Date();
    let targetDate = new Date();

    switch (preset) {
      case 'today':
        targetDate = new Date(now);
        targetDate.setHours(9, 0, 0, 0);
        break;
      case 'tomorrow':
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + 1);
        targetDate.setHours(9, 0, 0, 0);
        break;
      case 'thisWeek':
        targetDate = new Date(now);
        const dayOfWeek = targetDate.getDay();
        const daysUntilMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        targetDate.setDate(targetDate.getDate() - daysUntilMonday);
        targetDate.setHours(9, 0, 0, 0);
        break;
      case 'nextWeek':
        targetDate = new Date(now);
        const currentDayOfWeek = targetDate.getDay();
        const daysUntilNextMonday = currentDayOfWeek === 0 ? 1 : 8 - currentDayOfWeek;
        targetDate.setDate(targetDate.getDate() + daysUntilNextMonday);
        targetDate.setHours(9, 0, 0, 0);
        break;
      case 'thisMonth':
        targetDate = new Date(now.getFullYear(), now.getMonth(), 1, 9, 0, 0);
        break;
      case 'nextMonth':
        targetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0, 0);
        break;
    }

    if (type === 'start') {
      setMessageStartDate(formatDateForInput(targetDate));
    } else {
      // For end dates, set to end of day
      targetDate.setHours(23, 59, 0, 0);
      setMessageEndDate(formatDateForInput(targetDate));
    }
  };

  const validMessageTypes = ['info', 'warning', 'celebration', 'alert', 'custom'] as const;
  const validDisplayLocations = ['tile', 'detail', 'both'] as const;
  const validAnimationTypes = ['rollover', 'still', 'flash', 'flip-horizontal', 'flip-vertical', 'bounce', 'pulse', 'shake', 'fade', 'slide'] as const;
  const validCelebrationEffects = ['none', 'fireworks', 'confetti', 'snowfall', 'hearts-rising', 'hearts-falling', 'hearts', 'bubbles', 'butterflies', 'birds-flying', 'rocket-launch', 'burst-fireworks', 'sparkles', 'petals', 'shooting-stars', 'leaves', 'fireflies', 'balloons', 'stars', 'rainbow'] as const;

  const normalizeImportedMessageUrl = (raw: unknown): string | undefined => {
    if (typeof raw !== 'string') return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    // Already a safe absolute / relative / protocol URL
    if (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(trimmed)) {
      return trimmed;
    }
    if (/^www\./i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    // host.tld… without scheme
    if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    // Reject garbage like "123123" that is not a URL (avoids broken scroll/links on tiles)
    return undefined;
  };

  const normalizeImportedMessage = (raw: unknown, index: number): TileMessage | null => {
    if (!raw || typeof raw !== 'object') return null;
    const m = raw as Record<string, unknown>;
    const content = typeof m.content === 'string' ? m.content : '';
    if (!content.trim()) return null;
    // Reject objects that look like full tiles/spaces accidentally nested in a messages array
    if (
      ('tabs' in m || 'sections' in m || 'themeColor' in m || 'emoji' in m) &&
      !('type' in m && validMessageTypes.includes(m.type as any))
    ) {
      return null;
    }
    const type = validMessageTypes.includes(m.type as any) ? (m.type as typeof validMessageTypes[number]) : 'info';
    const displayLocation = validDisplayLocations.includes(m.displayLocation as any) ? (m.displayLocation as typeof validDisplayLocations[number]) : 'both';
    const animationType = validAnimationTypes.includes(m.animationType as any) ? (m.animationType as typeof validAnimationTypes[number]) : 'rollover';
    let celebrationEffect = validCelebrationEffects.includes(m.celebrationEffect as any) ? (m.celebrationEffect as string) : (type === 'celebration' ? 'fireworks' : 'none');
    if (celebrationEffect === 'hearts') celebrationEffect = 'hearts-rising';
    const now = new Date();
    const defaultEnd = new Date(now);
    defaultEnd.setFullYear(defaultEnd.getFullYear() + 1);
    let startDate = typeof m.startDate === 'string' && m.startDate.trim() ? m.startDate : now.toISOString();
    let endDate = typeof m.endDate === 'string' && m.endDate.trim() ? m.endDate : defaultEnd.toISOString();
    // Missing/invalid end dates previously defaulted to "now" and made imports expire immediately
    if (Number.isNaN(Date.parse(startDate))) startDate = now.toISOString();
    if (Number.isNaN(Date.parse(endDate))) endDate = defaultEnd.toISOString();
    if (new Date(endDate) < new Date(startDate)) {
      endDate = defaultEnd.toISOString();
    }
    const isActive = typeof m.isActive === 'boolean' ? m.isActive : true;
    const priority = typeof m.priority === 'number' && Number.isFinite(m.priority) ? m.priority : index;
    const textColor = typeof m.textColor === 'string' ? m.textColor : undefined;
    const fontStyle = typeof m.fontStyle === 'string' ? m.fontStyle : undefined;
    const delayBefore = typeof m.delayBefore === 'number' && Number.isFinite(m.delayBefore) ? m.delayBefore : 0;
    const url = normalizeImportedMessageUrl(m.url);
    const urlLabel = typeof m.urlLabel === 'string' ? m.urlLabel.trim() || undefined : undefined;
    let celebrationConfig: CelebrationConfig | undefined;
    if (m.celebrationConfig && typeof m.celebrationConfig === 'object' && m.celebrationConfig !== null) {
      const cc = m.celebrationConfig as Record<string, unknown>;
      celebrationConfig = {};
      if (typeof cc.intensity === 'number') celebrationConfig.intensity = Math.max(1, Math.min(100, cc.intensity));
      if (typeof cc.particleCount === 'number') celebrationConfig.particleCount = Math.max(5, Math.min(80, cc.particleCount));
      if (typeof cc.particleSize === 'number') celebrationConfig.particleSize = Math.max(50, Math.min(200, cc.particleSize));
      if (typeof cc.speed === 'number') celebrationConfig.speed = Math.max(20, Math.min(200, cc.speed));
      if (typeof cc.triggerIntervalMs === 'number') celebrationConfig.triggerIntervalMs = Math.max(2000, Math.min(15000, cc.triggerIntervalMs));
    }
    return {
      id: generateId(),
      content: content.trim(),
      type,
      startDate,
      endDate,
      isActive,
      priority,
      textColor: textColor || undefined,
      fontStyle: fontStyle || undefined,
      displayLocation,
      animationType,
      delayBefore,
      celebrationEffect: celebrationEffect as TileMessage['celebrationEffect'],
      celebrationConfig: Object.keys(celebrationConfig || {}).length ? celebrationConfig : undefined,
      url,
      urlLabel,
    };
  };

  const handleExportMessageBoard = useCallback(() => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      messages,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linknest-message-board-${editingTile?.id ?? 'export'}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, editingTile?.id]);

  const extractMessagesFromSpaceExport = (data: Record<string, unknown>): unknown[] | null => {
    const type = data.type;
    if (type !== 'tile' && type !== 'category' && type !== 'all_categories') {
      return null;
    }
    const collectFromTiles = (tiles: unknown[]): unknown[] => {
      const out: unknown[] = [];
      for (const t of tiles) {
        if (!t || typeof t !== 'object') continue;
        const tile = t as { id?: string; title?: string; messages?: unknown[] };
        // Prefer the tile being edited when the export contains several spaces
        if (editingTile && (tile.id === editingTile.id || tile.title === editingTile.title)) {
          return Array.isArray(tile.messages) ? tile.messages : [];
        }
        if (Array.isArray(tile.messages)) {
          out.push(...tile.messages);
        }
      }
      return out;
    };
    if (type === 'tile' && data.tile && typeof data.tile === 'object') {
      const tile = data.tile as { messages?: unknown[] };
      return Array.isArray(tile.messages) ? tile.messages : [];
    }
    if (Array.isArray(data.tiles)) {
      return collectFromTiles(data.tiles);
    }
    return null;
  };

  const handleImportMessageBoard = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const data = JSON.parse(text) as unknown;
        let rawList: unknown[] = [];
        let fromSpaceExport = false;

        if (Array.isArray(data)) {
          rawList = data;
        } else if (data && typeof data === 'object') {
          const obj = data as Record<string, unknown>;
          // Accidental Space export into Message Board import — extract messages instead of failing/corrupting
          const spaceMessages = extractMessagesFromSpaceExport(obj);
          if (spaceMessages !== null) {
            fromSpaceExport = true;
            if (spaceMessages.length === 0) {
              alert('This looks like a Space export, but it has no Message Board messages to import. Use Import Space for full spaces.');
              e.target.value = '';
              return;
            }
            if (!confirm(`This file looks like a Space export. Import ${spaceMessages.length} message(s) from it into this Message Board?`)) {
              e.target.value = '';
              return;
            }
            rawList = spaceMessages;
          } else if (Array.isArray(obj.messages)) {
            rawList = obj.messages;
          } else {
            alert('Invalid format. Expected a JSON array of messages or { "messages": [...] }.');
            e.target.value = '';
            return;
          }
        } else {
          alert('Invalid format. Expected a JSON array of messages or { "messages": [...] }.');
          e.target.value = '';
          return;
        }

        const normalized: TileMessage[] = [];
        rawList.forEach((item, i) => {
          const msg = normalizeImportedMessage(item, i);
          if (msg) normalized.push(msg);
        });
        setMessages(normalized);
        setEditingMessageId(null);
        const skipped = rawList.length - normalized.length;
        if (skipped > 0 || fromSpaceExport) {
          const parts = [`Imported ${normalized.length} message(s).`];
          if (skipped > 0) parts.push(`Skipped ${skipped} invalid or empty.`);
          if (fromSpaceExport) parts.push('Click Update Space to save them.');
          alert(parts.join(' '));
        }
      } catch (err) {
        console.error('Import failed:', err);
        alert('Failed to parse JSON. Please check the file format.');
      }
      e.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  }, [editingTile?.id, editingTile?.title]);

  const handleDownloadAIPrompt = useCallback(() => {
    const prompt = `# Linknest Message Board – AI Bulk Generator Prompt

Use this prompt with Claude, ChatGPT, or similar AI tools to generate scheduled messages in bulk. Copy everything below the line, paste into your AI chat, then save the AI's JSON output and import it via the Import button (upload icon) in the message board.

---

## Your request to the AI

Generate a JSON array of scheduled message board messages for Linknest. Each message has the following fields. Use only the allowed values. Omit optional fields if not needed.

**Required:** content (string). All other fields are optional.

**Fields and allowed values:**

| Field | Type | Allowed values | Default |
|-------|------|----------------|---------|
| content | string | any text; URLs allowed, **bold** and _italic_ supported | — |
| type | string | "info", "warning", "celebration", "alert", "custom" | "info" |
| startDate | string | ISO 8601 date-time (e.g. "2026-01-15T09:00:00.000Z") | now |
| endDate | string | ISO 8601 date-time | one year from now |
| isActive | boolean | true, false | true |
| priority | number | 0, 1, 2, ... (lower = higher priority) | 0 |
| textColor | string | hex e.g. "#3b82f6" | — |
| fontStyle | string | "normal", "italic", "bold", etc. | "normal" |
| displayLocation | string | "tile", "detail", "both" | "both" |
| animationType | string | "rollover", "still", "flash", "flip-horizontal", "flip-vertical", "bounce", "pulse", "shake", "fade", "slide" | "rollover" |
| delayBefore | number | seconds before showing (sequential messages) | 0 |
| celebrationEffect | string | "none", "fireworks", "burst-fireworks", "confetti", "snowfall", "hearts-rising", "hearts-falling", "bubbles", "butterflies", "birds-flying", "rocket-launch", "sparkles", "petals", "shooting-stars", "leaves", "fireflies", "balloons", "stars", "rainbow" | "fireworks" |
| celebrationConfig | object | optional; see below | — |
| url | string | URL link for more info (e.g. "https://example.com/details") | — |
| urlLabel | string | Custom text for the link (e.g. "Learn more", "View details") | "Info" |

**celebrationConfig** (optional, for celebrationEffect not "none"):
- intensity: 1–100 (default 100)
- particleCount: 5–80
- particleSize: 50–200 (percentage)
- speed: 20–200 (speed percentage, e.g. 50 for half speed, 200 for double)
- triggerIntervalMs: 2000–15000 (milliseconds between bursts)

**Output format:** Reply with ONLY a valid JSON array of message objects, no markdown code fences or extra text. Example:

[
  { "content": "🎉 Happy Birthday!", "type": "celebration", "startDate": "2026-02-14T00:00:00.000Z", "endDate": "2026-02-14T23:59:59.000Z", "celebrationEffect": "hearts-rising" },
  { "content": "**Maintenance** tonight 10–11pm.", "type": "warning", "priority": 1, "url": "https://status.example.com" }
]

You may also wrap the array in an object: { "messages": [ ... ] }.

---

## JSON template (copy and adapt)

[
  {
    "content": "Your message text. Use **bold** and _italic_. URLs become clickable.",
    "type": "info",
    "startDate": "2026-01-01T09:00:00.000Z",
    "endDate": "2026-12-31T23:59:59.000Z",
    "isActive": true,
    "priority": 0,
    "displayLocation": "both",
    "animationType": "rollover",
    "celebrationEffect": "none",
    "url": "https://example.com/more-info",
    "urlLabel": "Learn more"
  }
]

**Next steps:** Paste this prompt into Claude/ChatGPT, describe how many messages you need and any themes (e.g. holidays, reminders, celebrations). Save the AI's JSON output as a .json file, then use the Import button in the message board to load it.
`;
    const blob = new Blob([prompt], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'linknest-ai-prompt-message-board.md';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Helper function to parse URLs and render clickable links
  const renderMessageContent = (content: string) => {
    // URL regex pattern
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    // Bold pattern: **text** or *text*
    const boldPattern = /(\*\*)(.*?)\1/g;
    // Italic pattern: _text_ or *text* (not already bold)
    const italicPattern = /(?<!\*)_([^_]+)_(?!\*)/g;

    let processedContent = content;

    // Process bold text
    processedContent = processedContent.replace(boldPattern, '<strong>$2</strong>');

    // Process italic text (avoid conflicts with bold)
    processedContent = processedContent.replace(italicPattern, '<em>$1</em>');

    // Process URLs
    const parts = processedContent.split(urlPattern);

    return parts.map((part, index) => {
      if (urlPattern.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return <span key={index} dangerouslySetInnerHTML={{ __html: part }} />;
    });
  };

  // Tile Animation & Decoration State
  const { animation: initialAnimation, decoration: initialDecoration } = useTileAnimation();
  const [currentAnimation, setCurrentAnimation] = useState<TileAnimation>(initialAnimation);
  const [currentDecoration, setCurrentDecoration] = useState<TileDecoration>(initialDecoration);

  // Sync with initial values when they load
  useEffect(() => {
    setCurrentAnimation(initialAnimation);
    setCurrentDecoration(initialDecoration);
  }, [initialAnimation, initialDecoration]);


  // Modal drag and resize state
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [modalSize, setModalSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const modalPositionRef = useRef({ x: 0, y: 0 });
  const modalSizeRef = useRef({ width: 0, height: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  // Initialize modal size when create or edit modal opens
  useEffect(() => {
    const modalOpen = isModalOpen || isEditModalOpen;
    if (modalOpen) {
      // Use a timeout to ensure the modal is rendered before measuring
      const timer = setTimeout(() => {
        if (modalRef.current) {
          if (modalSize.width === 0 && modalSize.height === 0) {
            // Set default size if not set
            const defaultWidth = Math.min(600, window.innerWidth - 40);
            const defaultHeight = Math.min(700, window.innerHeight - 40);
            const newSize = { width: defaultWidth, height: defaultHeight };
            setModalSize(newSize);
            modalSizeRef.current = newSize;
            // Center the modal
            const centerX = (window.innerWidth - defaultWidth) / 2;
            const centerY = (window.innerHeight - defaultHeight) / 2;
            const newPos = { x: centerX, y: centerY };
            setModalPosition(newPos);
            modalPositionRef.current = newPos;
          }
        }
      }, 10);
      return () => clearTimeout(timer);
    } else {
      // Reset position and size when both modals are closed
      setModalPosition({ x: 0, y: 0 });
      setModalSize({ width: 0, height: 0 });
      modalPositionRef.current = { x: 0, y: 0 };
      modalSizeRef.current = { width: 0, height: 0 };
    }
  }, [isModalOpen, isEditModalOpen, modalSize.width, modalSize.height]);

  // Sync refs when state changes (when not dragging/resizing)
  useEffect(() => {
    if (!isDragging && !isResizing) {
      modalPositionRef.current = modalPosition;
      modalSizeRef.current = modalSize;
    }
  }, [modalPosition, modalSize, isDragging, isResizing]);

  // Drag handlers - optimized for smooth performance
  const handleDragStart = (e: React.MouseEvent) => {
    // Don't start dragging if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button') || target.closest('input') || target.closest('textarea')) {
      return;
    }
    e.stopPropagation();
    if (modalRef.current) {
      setIsDragging(true);
      // Calculate offset from mouse to current modal position
      // Use the current position from state/ref, not getBoundingClientRect
      const currentX = modalPositionRef.current.x || 0;
      const currentY = modalPositionRef.current.y || 0;

      dragStartRef.current = {
        x: e.clientX - currentX,
        y: e.clientY - currentY
      };
      modalSizeRef.current = { width: modalSize.width, height: modalSize.height };
    }
  };

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging || !modalRef.current) return;

    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;

    // Update ref immediately
    modalPositionRef.current = { x: newX, y: newY };

    // Update DOM directly for smooth performance
    modalRef.current.style.left = `${newX}px`;
    modalRef.current.style.top = `${newY}px`;
    modalRef.current.style.position = 'absolute';
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    // Update state with final position
    setModalPosition(modalPositionRef.current);
    setIsDragging(false);
  }, []);

  // Resize handlers - optimized for smooth performance
  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (modalRef.current) {
      setIsResizing(true);
      const rect = modalRef.current.getBoundingClientRect();
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: rect.width,
        height: rect.height
      };
      modalPositionRef.current = { x: modalPosition.x, y: modalPosition.y };
    }
  };

  const handleResize = useCallback((e: MouseEvent) => {
    if (!isResizing || !modalRef.current) return;

    const deltaX = e.clientX - resizeStartRef.current.x;
    const deltaY = e.clientY - resizeStartRef.current.y;

    const minWidth = 400;
    const minHeight = 300;
    const maxWidth = window.innerWidth - modalPositionRef.current.x;
    const maxHeight = window.innerHeight - modalPositionRef.current.y;

    const newWidth = Math.max(minWidth, Math.min(resizeStartRef.current.width + deltaX, maxWidth));
    const newHeight = Math.max(minHeight, Math.min(resizeStartRef.current.height + deltaY, maxHeight));

    // Update ref immediately
    modalSizeRef.current = { width: newWidth, height: newHeight };

    // Update DOM directly for smooth performance
    modalRef.current.style.width = `${newWidth}px`;
    modalRef.current.style.height = `${newHeight}px`;
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    // Update state with final size
    setModalSize(modalSizeRef.current);
    setIsResizing(false);
  }, []);

  // Global mouse event listeners for drag and resize
  useEffect(() => {
    if (isDragging || isResizing) {
      // Prevent text selection during drag/resize
      document.body.style.userSelect = 'none';
      document.body.style.cursor = isDragging ? 'move' : 'nwse-resize';

      document.addEventListener('mousemove', isDragging ? handleDrag : handleResize);
      document.addEventListener('mouseup', isDragging ? handleDragEnd : handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', isDragging ? handleDrag : handleResize);
        document.removeEventListener('mouseup', isDragging ? handleDragEnd : handleResizeEnd);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
    }
  }, [isDragging, isResizing, handleDrag, handleResize, handleDragEnd, handleResizeEnd]);

  // Category order state
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [categoryMetadata, setCategoryMetadata] = useState<Record<string, { visibleFrom?: string | null; expiresAt?: string | null }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [editingCategorySchedule, setEditingCategorySchedule] = useState<string | null>(null);
  const [categoryVisibleFrom, setCategoryVisibleFrom] = useState<string>('');
  const [categoryExpiresAt, setCategoryExpiresAt] = useState<string>('');
  const [editingCategoryVisibility, setEditingCategoryVisibility] = useState<string | null>(null);
  const [visibilityUsers, setVisibilityUsers] = useState<Array<{ id: number; username: string }>>([]);

  // Load global category arrangement on mount (works for all users)
  useEffect(() => {
    const loadCategoryOrder = async () => {
      try {
        const arrangement = await getCategoryArrangement();
        if (arrangement.length > 0) {
          // Read categories in saved order (already sorted by position from API)
          const ordered = arrangement.map(c => c.categoryName);
          setCategoryOrder(ordered);
          // Store category metadata (scheduling)
          const metadata: Record<string, { visibleFrom?: string | null; expiresAt?: string | null }> = {};
          arrangement.forEach(c => {
            if (c.visibleFrom || c.expiresAt) {
              metadata[c.categoryName] = {
                visibleFrom: c.visibleFrom || null,
                expiresAt: c.expiresAt || null
              };
            }
          });
          setCategoryMetadata(metadata);
        } else {
          // Reset to empty if no arrangement found
          setCategoryOrder([]);
          setCategoryMetadata({});
        }
      } catch {
        // On error, reset to empty to avoid stale data
        setCategoryOrder([]);
        setCategoryMetadata({});
      }
    };
    loadCategoryOrder();
  }, []); // Load once on mount, not dependent on authentication

  // Get unique existing groups for suggestions (preserve order from tiles)
  const existingGroups = useMemo(() => {
    const groups = new Set<string>();
    tiles.forEach(t => groups.add(t.group || 'General'));
    return Array.from(groups);
  }, [tiles]);

  // Get all available categories (preserve order from categoryOrder and tiles)
  const allCategories = useMemo(() => {
    const categoriesFromTiles = new Set<string>();
    tiles.forEach(t => categoriesFromTiles.add(t.group || 'General'));

    // Start with saved category order
    const result: string[] = [];
    const seen = new Set<string>();

    // Add categories from saved order first
    if (categoryOrder.length > 0) {
      categoryOrder.forEach(cat => {
        if (categoriesFromTiles.has(cat) && !seen.has(cat)) {
          result.push(cat);
          seen.add(cat);
        }
      });
    }

    // Add any remaining categories from tiles in their order of appearance
    tiles.forEach(t => {
      const cat = t.group || 'General';
      if (!seen.has(cat)) {
        result.push(cat);
        seen.add(cat);
      }
    });

    return result;
  }, [tiles, categoryOrder, isAuthenticated]);

  // Get categories that belong to the current user (user owns at least one tile in that category)
  const userOwnedCategories = useMemo(() => {
    if (!isAuthenticated || !user) {
      return allCategories; // For non-authenticated users, return all categories
    }

    // If user is admin, return all categories
    if (user.is_admin) {
      return allCategories;
    }

    // Filter to only categories where user owns at least one tile
    const userOwnedCategorySet = new Set<string>();
    tiles.forEach(t => {
      const tileUserId = t.userId ?? (t as { user_id?: number }).user_id;
      if (tileUserId === user.id) {
        userOwnedCategorySet.add(t.group || 'General');
      }
    });

    // Return categories in the same order as allCategories, but filtered
    return allCategories.filter(cat => userOwnedCategorySet.has(cat));
  }, [allCategories, tiles, isAuthenticated, user]);

  // Load recycle bin count on mount and when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      getRecycleBin()
        .then(tiles => {
          setRecycleBinTiles(tiles);
        })
        .catch(() => { });

      // Also load archive count on mount
      getArchive()
        .then(tiles => {
          setArchiveTiles(tiles);
        })
        .catch(() => { });
    }
  }, [isAuthenticated]);

  // Reload recycle bin when tab is active
  useEffect(() => {
    if (activeTab === 'recycle-bin' && isAuthenticated) {
      setIsLoadingRecycleBin(true);
      getRecycleBin()
        .then(tiles => {
          setRecycleBinTiles(tiles);
          setIsLoadingRecycleBin(false);
        })
        .catch(() => {
          setIsLoadingRecycleBin(false);
        });
    }
  }, [activeTab, isAuthenticated]);

  // Reload archive when tab is active
  useEffect(() => {
    if (activeTab === 'archive' && isAuthenticated) {
      setIsLoadingArchive(true);
      getArchive()
        .then(tiles => {
          setArchiveTiles(tiles);
          setIsLoadingArchive(false);
        })
        .catch(() => {
          setIsLoadingArchive(false);
        });
    }
  }, [activeTab, isAuthenticated]);

  // Load staging tiles when Staging tab is active (admin only)
  useEffect(() => {
    if (activeTab === 'staging' && isAuthenticated && user?.is_admin) {
      setStagingTilesLoading(true);
      getTiles({ sourceTab: 'staging' })
        .then(t => {
          setStagingTiles(t);
          setStagingTilesLoading(false);
        })
        .catch(() => {
          setStagingTilesLoading(false);
        });
    } else if (activeTab !== 'staging') {
      setStagingTiles([]);
    }
  }, [activeTab, isAuthenticated, user?.is_admin]);

  // Load favorite links when favorites tab is active
  useEffect(() => {
    if (activeTab !== 'favorites' && activeTab !== 'public-favorites') {
      return;
    }

    let cancelled = false;
    console.log('Fetching favorite links...');

    const load = async () => {
      if (isAuthenticated) {
        // For authenticated users, fetch from API
        setIsLoadingFavoriteLinks(true);
        try {
          const links = await getFavoriteLinks();
          if (!cancelled) {
            console.log('Favorite links fetched from API:', links);
            setFavoriteLinks(links);
          }
        } catch (error) {
          console.error('Failed to load favorite links:', error);
          if (!cancelled) setFavoriteLinks([]);
        } finally {
          if (!cancelled) setIsLoadingFavoriteLinks(false);
        }
        return;
      }

      // Guest users: IDs live in localStorage. Home-grid tiles are summary-only
      // (no nested links), so resolve details via API + local snapshots.
      const favoriteLinkIds = getPublicLinkFavorites();
      console.log('Favorite link IDs from localStorage:', favoriteLinkIds);

      if (favoriteLinkIds.length === 0) {
        if (!cancelled) {
          setFavoriteLinks([]);
          setIsLoadingFavoriteLinks(false);
        }
        return;
      }

      // Show cached snapshots immediately while resolving
      const cached = getPublicLinkFavoriteDetails().map((detail) => ({
        ...detail,
        isFavorite: true as const
      }));
      if (!cancelled && cached.length > 0) {
        setFavoriteLinks(cached);
      }

      setIsLoadingFavoriteLinks(true);
      try {
        const resolved = await resolveFavoriteLinks(favoriteLinkIds);
        if (cancelled) return;

        if (resolved.length > 0) {
          syncPublicLinkFavoriteDetails(resolved);
          setFavoriteLinks(resolved);
          console.log('Guest favorite links resolved from API:', resolved);
        } else if (cached.length === 0) {
          setFavoriteLinks([]);
        }
      } catch (error) {
        console.error('Failed to resolve guest favorite links:', error);
        if (!cancelled && cached.length === 0) {
          setFavoriteLinks([]);
        }
      } finally {
        if (!cancelled) setIsLoadingFavoriteLinks(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, isAuthenticated, tiles]);

  // Check health of favorite links when favorites tab is active with 5s delay and cancellation
  useEffect(() => {
    // Only check health for favorites and public-favorites tabs
    const isFavoritesTab = activeTab === 'favorites' || activeTab === 'public-favorites';

    if (!isFavoritesTab) {
      // Cancel any ongoing checks when switching away from favorites tab
      favoriteLinkHealthService.cancelCheck();
      setIsCheckingHealth(false);
      return;
    }

    // Don't check if no favorite links
    if (favoriteLinks.length === 0) {
      return;
    }

    let checkTimeoutId: NodeJS.Timeout | null = null;

    // Start health checking
    const checkHealth = async () => {
      setIsCheckingHealth(true);

      const linksToCheck = favoriteLinks
        .filter(link => typeof link.url === 'string' && !isSshLinkUrl(link.url) && !isVncLinkUrl(link.url))
        .map(link => ({
          id: link.id,
          url: link.url
        }));

      if (linksToCheck.length === 0) {
        setIsCheckingHealth(false);
        return;
      }

      try {
        const results = await favoriteLinkHealthService.checkMultipleLinks(
          linksToCheck,
          (linkId, result) => {
            // Update results progressively as each link is checked (skip ssh:// / vnc://)
            if (result.skipped || !result.health) return;
            setLinkHealthResults(prev => {
              const newMap = new Map(prev);
              newMap.set(linkId, result);
              return newMap;
            });
          }
        );

        // Final update with all results
        setLinkHealthResults(results);
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Error checking link health:', error);
        }
      } finally {
        setIsCheckingHealth(false);
      }
    };

    // Add 5 second delay for health check calculation
    // If the user stays on the tab post 5 seconds, calculate status; if not, cancel it
    checkTimeoutId = setTimeout(() => {
      checkHealth();
    }, 5000);

    // Cleanup: cancel checks and clear timeout when component unmounts or dependencies change
    return () => {
      if (checkTimeoutId) {
        clearTimeout(checkTimeoutId);
      }
      favoriteLinkHealthService.cancelCheck();
      setIsCheckingHealth(false);
    };
  }, [activeTab, favoriteLinks]);

  const handleForceRefresh = useCallback(async () => {
    if (favoriteLinks.length === 0 || isCheckingHealth) return;

    setIsCheckingHealth(true);
    const linksToCheck = favoriteLinks
      .filter(link => typeof link.url === 'string' && !isSshLinkUrl(link.url) && !isVncLinkUrl(link.url))
      .map(link => ({
        id: link.id,
        url: link.url
      }));

    if (linksToCheck.length === 0) {
      setIsCheckingHealth(false);
      return;
    }

    try {
      await favoriteLinkHealthService.checkMultipleLinks(
        linksToCheck,
        (linkId, result) => {
          if (result.skipped || !result.health) return;
          setLinkHealthResults(prev => {
            const newMap = new Map(prev);
            newMap.set(linkId, result);
            return newMap;
          });
        }
      );
      setRefreshCountdown(autoRefreshInterval);
    } catch (error) {
      console.error('Error in force refresh:', error);
    } finally {
      setIsCheckingHealth(false);
    }
  }, [favoriteLinks, isCheckingHealth, autoRefreshInterval]);

  // Handle auto-refresh of link health with countdown
  useEffect(() => {
    if (!isAutoRefreshEnabled || (activeTab !== 'favorites' && activeTab !== 'public-favorites') || favoriteLinks.length === 0) {
      setRefreshCountdown(autoRefreshInterval);
      return;
    }

    const intervalId = setInterval(() => {
      setRefreshCountdown(prev => {
        if (prev <= 1) {
          if (!isCheckingHealth) {
            handleForceRefresh();
          }
          return autoRefreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [isAutoRefreshEnabled, autoRefreshInterval, activeTab, favoriteLinks, isCheckingHealth, handleForceRefresh]);

  useEffect(() => {
    setRefreshCountdown(autoRefreshInterval);
  }, [autoRefreshInterval]);

  // Reset preferencesLoaded when authentication state changes
  // This ensures preferences are reloaded when user logs in or out
  useEffect(() => {
    setPreferencesLoaded(false);
  }, [isAuthenticated]);

  // Load saved active tab and Your Apps filter preference for authenticated users
  useEffect(() => {
    if (isAuthenticated && !preferencesLoaded) {
      // Try to load from localStorage first (for immediate restoration after login)
      const localStorageTab = localStorage.getItem('linknest_user_active_tab');

      userPreferencesService.getPreferences()
        .then(prefs => {
          const savedTab = prefs.activeTab || null;
          const tabToRestore = (typeof savedTab === 'string' ? savedTab : null) || localStorageTab;

          if (tabToRestore && typeof tabToRestore === 'string') {
            const validTabs: TabType[] = ['public', 'favorites', 'private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring', 'your-apps', 'monitorv2'];
            if (validTabs.includes(tabToRestore as TabType)) {
              setActiveTab(tabToRestore as TabType);
            }
          }

          // Restore Your Apps filter preference (migrate former "all" → Authenticated)
          const savedFilter = prefs.yourAppsFilter;
          if (savedFilter === 'authenticated' || savedFilter === 'assigned') {
            setYourAppsFilter(savedFilter);
          } else if (savedFilter === 'all') {
            setYourAppsFilter('authenticated');
          }

          // Restore Private tab owner filter preference
          const savedPrivateOwner = prefs.privateOwnerFilter;
          if (savedPrivateOwner != null && savedPrivateOwner !== '') {
            if (String(savedPrivateOwner) === 'all') {
              setPrivateOwnerFilter('all');
            } else {
              const n = typeof savedPrivateOwner === 'number' ? savedPrivateOwner : parseInt(String(savedPrivateOwner), 10);
              if (!Number.isNaN(n)) setPrivateOwnerFilter(n);
            }
          }

          setPreferencesLoaded(true);
        })
        .catch(error => {
          // If preferences can't be loaded, try localStorage as fallback
          console.debug('Could not load preferences:', error);

          if (localStorageTab) {
            const validTabs: TabType[] = ['public', 'favorites', 'private', 'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring', 'your-apps', 'monitorv2'];
            if (validTabs.includes(localStorageTab as TabType)) {
              setActiveTab(localStorageTab as TabType);
            }
          }

          setPreferencesLoaded(true); // Mark as loaded even on error to prevent retries
        });
    } else if (!isAuthenticated) {
      // For public users, load active tab from localStorage
      const savedTab = getPublicActiveTab();
      if (savedTab) {
        const validTabs: TabType[] = ['public', 'public-favorites'];
        if (validTabs.includes(savedTab as TabType)) {
          setActiveTab(savedTab as TabType);
        }
      }
      // Load public favorites
      setPublicFavorites(getPublicFavorites());
      setPreferencesLoaded(true);
    }
  }, [isAuthenticated, preferencesLoaded]);

  // Sync public favorites when they change (for public users)
  useEffect(() => {
    if (!isAuthenticated) {
      setPublicFavorites(getPublicFavorites());
    }
  }, [isAuthenticated, tiles]);

  // Save active tab preference when it changes (for authenticated users)
  useEffect(() => {
    if (isAuthenticated && activeTab && preferencesLoaded) {
      // Only save if preferences have been loaded (to avoid saving default 'public' on initial load)
      // Debounce the save to avoid too many API calls
      const timeoutId = setTimeout(() => {
        // Save to user preferences (server-side)
        userPreferencesService.updatePreference('activeTab', activeTab)
          .catch(() => { });

        // Also save to localStorage for immediate restoration after login
        localStorage.setItem('linknest_user_active_tab', activeTab);
      }, 300); // Wait 300ms after tab change before saving

      return () => clearTimeout(timeoutId);
    } else if (!isAuthenticated && activeTab && preferencesLoaded) {
      // For public users, save active tab to localStorage
      const validTabs: TabType[] = ['public', 'public-favorites'];
      if (validTabs.includes(activeTab)) {
        setPublicActiveTab(activeTab);
      }
    }
  }, [activeTab, isAuthenticated, preferencesLoaded]);

  // Save Your Apps filter preference when it changes (for authenticated users)
  useEffect(() => {
    if (isAuthenticated && preferencesLoaded) {
      const timeoutId = setTimeout(() => {
        userPreferencesService.updatePreference('yourAppsFilter', yourAppsFilter)
          .catch(() => { });
        localStorage.setItem('linknest_your_apps_filter', yourAppsFilter);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [yourAppsFilter, isAuthenticated, preferencesLoaded]);

  // Load user list when on Private tab (for owner filter labels)
  useEffect(() => {
    if (activeTab === 'private' && isAuthenticated) {
      authService.getUsers()
        .then(setPrivateTabUsers)
        .catch(() => setPrivateTabUsers([]));
    } else {
      setPrivateTabUsers([]);
    }
  }, [activeTab, isAuthenticated]);

  // Save Private tab owner filter when it changes (localStorage + server for authenticated users)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('linknest_private_owner_filter', privateOwnerFilter === 'all' ? 'all' : String(privateOwnerFilter));
    }
    if (isAuthenticated && preferencesLoaded) {
      const timeoutId = setTimeout(() => {
        userPreferencesService.updatePreference(
          'privateOwnerFilter',
          privateOwnerFilter === 'all' ? 'all' : privateOwnerFilter
        ).catch(() => { });
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [privateOwnerFilter, isAuthenticated, preferencesLoaded]);

  // Persist private sub-tab (Spaces/Sharing/Blocked)
  useEffect(() => {
    if (typeof window !== 'undefined' && activeTab === 'private') {
      localStorage.setItem('linknest_private_subtab', privateSubTab);
    }
  }, [privateSubTab, activeTab]);

  // Load pending invitations count when on Private tab (for Sharing sub-tab badge)
  const loadPendingInvitationsCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const list = await getPendingInvitations();
      setPendingInvitationsCount(list.length);
    } catch {
      setPendingInvitationsCount(0);
    }
  }, [isAuthenticated]);

  // Load blocked users count when on Private tab (for Blocked sub-tab badge)
  const loadBlockedUsersCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const list = await getBlockedUsers();
      setBlockedUsersCount(list.length);
    } catch {
      setBlockedUsersCount(0);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (activeTab === 'private' && isAuthenticated) {
      const loadCounts = () => {
        loadPendingInvitationsCount();
        loadBlockedUsersCount();
      };
      loadCounts();
      const interval = setInterval(loadCounts, 10000);
      return () => clearInterval(interval);
    } else {
      setPendingInvitationsCount(0);
      setBlockedUsersCount(0);
    }
  }, [activeTab, isAuthenticated, loadPendingInvitationsCount, loadBlockedUsersCount]);

  // Calculate counts for tabs
  const favoriteTilesCount = useMemo(() => {
    return tiles.filter(t => t.isFavorite === true).length;
  }, [tiles]);

  const publicFavoritesCount = useMemo(() => {
    if (isAuthenticated) return 0;
    return tiles.filter(t => isPublicFavorite(t.id)).length;
  }, [tiles, isAuthenticated, publicFavorites]);

  const privateTilesCount = useMemo(() => {
    if (!isAuthenticated || !user) return 0;
    return tiles.filter(t => {
      if (t.visibility === 'private') {
        // Only show if user is in allowedUsers list
        return t.allowedUsers && t.allowedUsers.includes(user.id);
      }
      return false;
    }).length;
  }, [tiles, isAuthenticated, user]);

  // Distinct owners for Private tab filter dropdown (tiles shared with current user)
  const privateOwnerOptions = useMemo(() => {
    if (activeTab !== 'private' || !user) return [];
    const privateTiles = tiles.filter(t =>
      t.visibility === 'private' && t.allowedUsers?.includes(user.id)
    );
    const ownerIds = ([...new Set(
      privateTiles
        .map(t => {
          const val = t.userId ?? (t as any).user_id;
          if (val === '' || val === null || val === undefined) return NaN;
          return Number(val);
        })
        .filter((id): id is number => !Number.isNaN(id))
    )] as number[]).sort((a, b) => a - b);
    return [
      { value: 'all' as const, label: 'All owners' },
      ...ownerIds.map(id => ({
        value: id as number,
        label: privateTabUsers.find(u => u.id === id)?.username ?? `User #${id}`
      }))
    ];
  }, [activeTab, user, tiles, privateTabUsers]);

  const scheduledTilesCount = useMemo(() => {
    const now = new Date();
    return tiles.filter(t => {
      if (t.visibleFrom) {
        const visibleFrom = new Date(t.visibleFrom);
        return now < visibleFrom;
      }
      return false;
    }).length;
  }, [tiles]);

  const expiredTilesCount = useMemo(() => {
    const now = new Date();
    return tiles.filter(t => {
      if (t.expiresAt) {
        const expiresAt = new Date(t.expiresAt);
        return now > expiresAt;
      }
      return false;
    }).length;
  }, [tiles]);

  // Filter and Group Tiles - Global search across all content
  const baseGroupedTiles = useMemo(() => {
    // First, filter tiles based on active tab
    let filteredTiles = tiles;

    if (activeTab === 'recycle-bin') {
      // Show recycle bin tiles
      filteredTiles = recycleBinTiles;
    } else if (activeTab === 'archive') {
      // Show archived tiles
      filteredTiles = archiveTiles;
    } else if (activeTab === 'favorites') {
      // Show only favorited tiles (internal favorites for authenticated users)
      filteredTiles = tiles.filter(t => t.isFavorite === true);
    } else if (activeTab === 'public-favorites') {
      // Show only public favorites (localStorage-based for non-authenticated users)
      // Use publicFavorites state array for immediate updates
      filteredTiles = tiles.filter(t => publicFavorites.includes(t.id));
    } else if (activeTab === 'public') {
      // Show only public tiles (same as current public access)
      filteredTiles = tiles.filter(t => t.visibility === 'public');
    } else if (activeTab === 'staging') {
      // Staging tab: admin-only; show staging tiles (loaded separately)
      filteredTiles = stagingTilesLoading ? [] : stagingTiles;
    } else if (activeTab === 'your-apps') {
      // Show tiles/links accessible via user roles - only show specific assigned links
      // ALSO show 'authenticated' tiles (visible to all logged in users) without filtering their links
      if (isAuthenticated && user) {
        // First, find all tiles that have links with role access OR are authenticated (protected)
        // Include tile-level role access so staging-area tiles assigned in "Assign Tiles & Links to Role" show in Your Apps
        filteredTiles = tiles.filter(t => {
          if (t.visibility === 'authenticated') return true;
          if (t.hasRoleAccess) return true;

          // Check if any link within the tile has role access
          const hasLinkWithRoleAccess = t.tabs?.some(tab =>
            tab.sections?.some(section =>
              section.links?.some(link => link.hasRoleAccess)
            )
          ) || t.tabs?.some(tab =>
            tab.links?.some(link => link.hasRoleAccess)
          );
          return hasLinkWithRoleAccess;
        });

        // Filter links within tiles to ONLY show those with role access (even if tile has role access)
        // BUT preserve full content for 'authenticated' tiles
        filteredTiles = filteredTiles.map(tile => {
          // If tile is authenticated type, show all content (don't filter links by role)
          if (tile.visibility === 'authenticated') return tile;

          // Always filter to only show links with role access, regardless of tile access
          const filteredTabs = tile.tabs?.map(tab => {
            const filteredSections = tab.sections?.map(section => ({
              ...section,
              links: section.links?.filter(link => link.hasRoleAccess) || []
            })).filter(section =>
              (section.links && section.links.length > 0) ||
              (section.richTextContent?.length ?? 0) > 0
            );
            const filteredTabLinks = tab.links?.filter(link => link.hasRoleAccess) || [];
            return {
              ...tab,
              sections: filteredSections && filteredSections.length > 0 ? filteredSections : undefined,
              links: filteredTabLinks.length > 0 ? filteredTabLinks : undefined
            };
          }).filter(tab =>
            (tab.sections && tab.sections.length > 0) ||
            (tab.links && tab.links.length > 0)
          );
          return {
            ...tile,
            tabs: filteredTabs && filteredTabs.length > 0 ? filteredTabs : []
          };
        }).filter(tile =>
          // Keep authenticated tiles and role-assigned tiles even in summary mode
          // (home grid loads without nested tabs/links; detail loads on open).
          tile.visibility === 'authenticated' ||
          !!tile.hasRoleAccess ||
          (tile.tabs && tile.tabs.length > 0 && tile.tabs.some(tab =>
            (tab.sections && tab.sections.length > 0) ||
            (tab.links && tab.links.length > 0)
          ))
        );

        // Apply sub-filter for 'Your Apps' tab
        if (yourAppsFilter === 'assigned') {
          // Explicit role/group assignment (tile-level or link-level), including authenticated spaces
          filteredTiles = filteredTiles.filter(t =>
            !!t.hasRoleAccess ||
            !!t.tabs?.some(tab =>
              tab.sections?.some(section => section.links?.some(link => link.hasRoleAccess)) ||
              tab.links?.some(link => link.hasRoleAccess)
            )
          );
        } else {
          // Default: Authenticated — spaces that require sign-in for all logged-in users
          filteredTiles = filteredTiles.filter(t => t.visibility === 'authenticated');
        }
      } else {
        filteredTiles = []; // No role-based content for unauthenticated users
      }
    } else if (activeTab === 'private') {
      // Show only authenticated and private tiles that belong to the user
      if (isAuthenticated && user) {
        filteredTiles = tiles.filter(t => {
          if (t.visibility === 'private') {
            // Only show if user is in allowedUsers list
            return t.allowedUsers && t.allowedUsers.includes(user.id);
          }
          return false;
        });
        // Filter by owner when "Filter by owner" is set (so users can see which tile belongs to which owner)
        if (privateOwnerFilter !== 'all') {
          filteredTiles = filteredTiles.filter(t => {
            const ownerId = t.userId ?? (t as { user_id?: number }).user_id;
            return ownerId === privateOwnerFilter;
          });
        }
      } else {
        filteredTiles = []; // No private tiles for unauthenticated users
      }
    } else if (activeTab === 'scheduled') {
      // Show only tiles/spaces that are scheduled for future (visibleFrom is in the future)
      const now = new Date();
      filteredTiles = tiles.filter(t => {
        if (t.visibleFrom) {
          const visibleFrom = new Date(t.visibleFrom);
          return now < visibleFrom;
        }
        return false;
      });
    } else if (activeTab === 'expired') {
      // Show only tiles/spaces that have expired (expiresAt is in the past)
      const now = new Date();
      filteredTiles = tiles.filter(t => {
        if (t.expiresAt) {
          const expiresAt = new Date(t.expiresAt);
          return now > expiresAt;
        }
        return false;
      });
    }

    // For all tabs except 'scheduled', 'expired', 'your-apps', and 'staging', filter out scheduled and expired tiles
    // Scheduled tiles should only appear in the scheduled tab
    // Expired tiles should only appear in the expired tab
    // 'your-apps' shows role-based content which may include scheduled/expired items
    // 'staging' shows all staging tiles (admin manages visibility/schedule there)
    if (activeTab !== 'scheduled' && activeTab !== 'expired' && activeTab !== 'your-apps' && activeTab !== 'staging' && activeTab !== 'recycle-bin' && activeTab !== 'archive') {
      const now = new Date();
      filteredTiles = filteredTiles.filter(t => {
        // Hide tiles that are scheduled for the future
        if (t.visibleFrom) {
          const visibleFrom = new Date(t.visibleFrom);
          if (now < visibleFrom) {
            return false; // Hide scheduled tiles from non-scheduled views
          }
        }
        // Hide tiles that have expired
        if (t.expiresAt) {
          const expiresAt = new Date(t.expiresAt);
          if (now > expiresAt) {
            return false; // Hide expired tiles from non-expired views
          }
        }
        return true;
      });
    }

    if (!searchTerm.trim()) {
      // No search term - return filtered tiles grouped normally
      // IMPORTANT: Preserve the order of tiles as they come from the API
      // The API already returns tiles in the correct order based on arrangement
      const groups: Record<string, Tile[]> = {};

      // Debug: Log tile order from API
      if (filteredTiles.length > 0) {
        console.log('Tiles from API (first 5):', filteredTiles.slice(0, 5).map(t => ({ id: t.id, group: t.group || 'General', title: t.title })));
      }

      filteredTiles.forEach(tile => {
        const groupName = tile.group || 'General';
        if (!groups[groupName]) {
          groups[groupName] = [];
        }
        // Push tiles in the order they appear (preserving API order)
        groups[groupName].push(tile);
      });

      // Debug: Log grouped tiles order
      Object.keys(groups).forEach(cat => {
        if (groups[cat].length > 0) {
          console.log(`Category "${cat}" tiles order:`, groups[cat].map(t => ({ id: t.id, title: t.title })));
        }
      });

      // Apply global category order if available (works for all users)
      if (categoryOrder.length > 0) {
        const finalGroups: Record<string, Tile[]> = {};
        const seenCategories = new Set<string>();

        // Add categories in saved order first (respecting scheduling and active tab)
        categoryOrder.forEach(category => {
          if (groups[category]) {
            const metadata = categoryMetadata[category];
            const now = new Date();
            let shouldShow = true;

            if (activeTab === 'scheduled') {
              // Show categories scheduled for future OR categories with scheduled tiles
              let categoryScheduled = false;
              if (metadata?.visibleFrom) {
                const visibleFrom = new Date(metadata.visibleFrom);
                categoryScheduled = now < visibleFrom;
              }
              // Also check if any tile in this category is scheduled
              const hasScheduledTiles = groups[category].some(tile => {
                if (tile.visibleFrom) {
                  const tileVisibleFrom = new Date(tile.visibleFrom);
                  return now < tileVisibleFrom;
                }
                return false;
              });
              shouldShow = categoryScheduled || hasScheduledTiles;
            } else if (activeTab === 'expired') {
              // Show expired categories OR categories with expired tiles
              let categoryExpired = false;
              if (metadata?.expiresAt) {
                const expiresAt = new Date(metadata.expiresAt);
                categoryExpired = now > expiresAt;
              }
              // Also check if any tile in this category is expired
              const hasExpiredTiles = groups[category].some(tile => {
                if (tile.expiresAt) {
                  const tileExpiresAt = new Date(tile.expiresAt);
                  return now > tileExpiresAt;
                }
                return false;
              });
              shouldShow = categoryExpired || hasExpiredTiles;
            } else {
              // For other tabs, hide scheduled/expired categories
              if (metadata?.visibleFrom) {
                const visibleFrom = new Date(metadata.visibleFrom);
                if (now < visibleFrom) {
                  shouldShow = false;
                }
              }

              if (metadata?.expiresAt && shouldShow) {
                const expiresAt = new Date(metadata.expiresAt);
                if (now > expiresAt) {
                  shouldShow = false;
                }
              }
            }

            if (shouldShow) {
              finalGroups[category] = groups[category];
              seenCategories.add(category);
            }
          }
        });

        // Add any remaining categories in their order of appearance from tiles (respecting scheduling and active tab)
        Object.keys(groups).forEach(category => {
          if (!seenCategories.has(category)) {
            const metadata = categoryMetadata[category];
            const now = new Date();
            let shouldShow = true;

            if (activeTab === 'scheduled') {
              // Show categories scheduled for future OR categories with scheduled tiles
              let categoryScheduled = false;
              if (metadata?.visibleFrom) {
                const visibleFrom = new Date(metadata.visibleFrom);
                categoryScheduled = now < visibleFrom;
              }
              // Also check if any tile in this category is scheduled
              const hasScheduledTiles = groups[category].some(tile => {
                if (tile.visibleFrom) {
                  const tileVisibleFrom = new Date(tile.visibleFrom);
                  return now < tileVisibleFrom;
                }
                return false;
              });
              shouldShow = categoryScheduled || hasScheduledTiles;
            } else if (activeTab === 'expired') {
              // Show expired categories OR categories with expired tiles
              let categoryExpired = false;
              if (metadata?.expiresAt) {
                const expiresAt = new Date(metadata.expiresAt);
                categoryExpired = now > expiresAt;
              }
              // Also check if any tile in this category is expired
              const hasExpiredTiles = groups[category].some(tile => {
                if (tile.expiresAt) {
                  const tileExpiresAt = new Date(tile.expiresAt);
                  return now > tileExpiresAt;
                }
                return false;
              });
              shouldShow = categoryExpired || hasExpiredTiles;
            } else {
              // For other tabs, hide scheduled/expired categories
              if (metadata?.visibleFrom) {
                const visibleFrom = new Date(metadata.visibleFrom);
                if (now < visibleFrom) {
                  shouldShow = false;
                }
              }

              if (metadata?.expiresAt && shouldShow) {
                const expiresAt = new Date(metadata.expiresAt);
                if (now > expiresAt) {
                  shouldShow = false;
                }
              }
            }

            if (shouldShow) {
              finalGroups[category] = groups[category];
            }
          }
        });

        return finalGroups;
      }

      return groups;
    }

    const searchLower = searchTerm.toLowerCase();

    // Global search: check title, description, tab titles, section titles, link labels, link URLs, notes, and tooltips
    const filtered = filteredTiles.filter(t => {
      // Check tile-level properties (but NOT the group/category name to avoid irrelevant results when searching)
      if (
        t.title.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower) ||
        (t.searchTags ?? []).some(tag => tag.toLowerCase().includes(searchLower))
      ) {
        return true;
      }

      // Check tabs, sections and links within the tile
      const allSections = [
        ...(t.sections || []),
        ...(t.tabs?.flatMap(tab => {
          // Also match tab title
          if (tab.title.toLowerCase().includes(searchLower)) return tab.sections; // If tab matches, we should probably return true for the tile
          return tab.sections;
        }) || [])
      ];

      // A better way to check tabs/sections/links comprehensively

      // 1. Check Tabs
      if (t.tabs && t.tabs.length > 0) {
        for (const tab of t.tabs) {
          if (tab.title.toLowerCase().includes(searchLower)) return true;

          if (tab.sections && tab.sections.length > 0) {
            for (const section of tab.sections) {
              if (section.title.toLowerCase().includes(searchLower)) return true;

              if (section.links && section.links.length > 0) {
                for (const link of section.links) {
                  if (
                    link.label.toLowerCase().includes(searchLower)
                  ) {
                    return true;
                  }
                }
              }

              if (section.richTextContent && section.richTextContent.length > 0) {
                for (const rt of section.richTextContent) {
                  if (rt.content.toLowerCase().includes(searchLower)) {
                    return true;
                  }
                }
              }
            }
          }
        }
      }

      // 2. Check Sections (backward compatibility)
      if (t.sections && t.sections.length > 0) {
        for (const section of t.sections) {
          if (section.title.toLowerCase().includes(searchLower)) return true;

          if (section.links && section.links.length > 0) {
            for (const link of section.links) {
              if (
                link.label.toLowerCase().includes(searchLower)
              ) {
                return true;
              }
            }
          }

          if (section.richTextContent && section.richTextContent.length > 0) {
            for (const rt of section.richTextContent) {
              if (rt.content.toLowerCase().includes(searchLower)) {
                return true;
              }
            }
          }
        }
      }

      return false;
    });

    const groups: Record<string, Tile[]> = {};

    filtered.forEach(tile => {
      const groupName = tile.group || 'General';
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(tile);
    });

    // Apply category scheduling filtering for scheduled/expired tabs
    if (activeTab === 'scheduled' || activeTab === 'expired') {
      const filteredGroups: Record<string, Tile[]> = {};
      const now = new Date();

      Object.keys(groups).forEach(category => {
        const metadata = categoryMetadata[category];
        let shouldShow = false;

        if (activeTab === 'scheduled') {
          // Show categories scheduled for future OR categories with scheduled tiles
          let categoryScheduled = false;
          if (metadata?.visibleFrom) {
            const visibleFrom = new Date(metadata.visibleFrom);
            categoryScheduled = now < visibleFrom;
          }
          // Also check if any tile in this category is scheduled
          const hasScheduledTiles = groups[category].some(tile => {
            if (tile.visibleFrom) {
              const tileVisibleFrom = new Date(tile.visibleFrom);
              return now < tileVisibleFrom;
            }
            return false;
          });
          shouldShow = categoryScheduled || hasScheduledTiles;
        } else if (activeTab === 'expired') {
          // Show expired categories OR categories with expired tiles
          let categoryExpired = false;
          if (metadata?.expiresAt) {
            const expiresAt = new Date(metadata.expiresAt);
            categoryExpired = now > expiresAt;
          }
          // Also check if any tile in this category is expired
          const hasExpiredTiles = groups[category].some(tile => {
            if (tile.expiresAt) {
              const tileExpiresAt = new Date(tile.expiresAt);
              return now > tileExpiresAt;
            }
            return false;
          });
          shouldShow = categoryExpired || hasExpiredTiles;
        }

        if (shouldShow) {
          filteredGroups[category] = groups[category];
        }
      });

      return filteredGroups;
    }

    return groups;
  }, [tiles, searchTerm, categoryOrder, categoryMetadata, activeTab, isAuthenticated, user, recycleBinTiles, archiveTiles, publicFavorites, yourAppsFilter, privateOwnerFilter, stagingTiles, stagingTilesLoading]);

  // Apply selected category filter to the grouped tiles
  const groupedTiles = useMemo(() => {
    if (selectedCategoryFilter && baseGroupedTiles[selectedCategoryFilter]) {
      return { [selectedCategoryFilter]: baseGroupedTiles[selectedCategoryFilter] };
    }
    return baseGroupedTiles;
  }, [baseGroupedTiles, selectedCategoryFilter]);

  // Helper function to format browser name for display
  const formatBrowserName = (browserId: string | null | undefined): string => {
    if (!browserId || browserId === 'default') return '';
    return browserId
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .replace('Wsl', '(WSL)')
      .trim();
  };

  // Helper function to normalize browser ID
  const normalizeBrowserId = (browserId: string): string => {
    if (!browserId) return browserId;
    const normalized = browserId.toLowerCase().trim();
    const shortAliases: Record<string, string> = {
      'edge': 'edge-stable-local',
      'chrome': 'chrome-stable-local'
    };
    if (shortAliases[normalized]) {
      return shortAliases[normalized];
    }
    return browserId;
  };

  // Function to open link in a specific browser
  const openLinkInBrowser = (url: string, browserId: string) => {
    if (typeof window !== 'undefined' && (window as any).BrowserLauncher) {
      const BrowserLauncher = (window as any).BrowserLauncher;
      if (settings.browser_extension_id) {
        BrowserLauncher.setExtensionId(settings.browser_extension_id);
      }
      const normalizedBrowserId = normalizeBrowserId(browserId);
      BrowserLauncher.open(url, normalizedBrowserId, { fallback: true }, (response: any) => {
        if (response && response.success !== false) {
          // Success
        } else {
          console.warn('BrowserLauncher failed, falling back to default behavior');
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // State for favorite links section position (true = above tiles, false = below tiles)
  const [favoriteLinksAbove, setFavoriteLinksAbove] = useState<boolean>(() => {
    // Initialize from localStorage for public users
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('favoriteLinksAbove');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  // Load preference for authenticated user
  useEffect(() => {
    if (isAuthenticated) {
      userPreferencesService.getPreference('favoriteLinksAbove').then(val => {
        if (val !== null) {
          // Handle both string "true"/"false" and boolean values
          setFavoriteLinksAbove(String(val) === 'true');
        }
      });
    }
  }, [isAuthenticated]);

  const handleSetFavoriteLinksAbove = (above: boolean) => {
    setFavoriteLinksAbove(above);
    if (isAuthenticated) {
      userPreferencesService.updatePreference('favoriteLinksAbove', above);
    } else {
      localStorage.setItem('favoriteLinksAbove', String(above));
    }
  };

  const handleCreateTile = async () => {
    if (!newTitle.trim()) return;

    if (tileType === 'hyperlink' && !hyperlinkUrl.trim()) return;

    if (!isAuthenticated && onAuthRequired) {
      onAuthRequired();
      return;
    }

    // Ensure current user (owner) is always included in allowed users for private tiles
    let finalAllowedUsers = newAllowedUsers;
    if (newVisibility === 'private' && user) {
      if (!finalAllowedUsers.includes(user.id)) {
        finalAllowedUsers = [...finalAllowedUsers, user.id];
      }
    }

    const newTile: Tile = {
      id: generateUuid(),
      title: newTitle,
      description: newDesc,
      searchTags: newSearchTags.length > 0 ? newSearchTags : [],
      emoji: newEmoji,
      showEmoji: newShowEmoji,
      showTitle: newShowTitle,
      showDescription: newShowDescription,
      emojiImage: newEmojiImage.trim() || null,
      emojiImageOpacity: newEmojiImage.trim() ? newEmojiImageOpacity : null,
      emojiImageOffsetX: newEmojiImage.trim() ? newEmojiImageOffsetX : null,
      emojiImageOffsetY: newEmojiImage.trim() ? newEmojiImageOffsetY : null,
      emojiImageZoom: newEmojiImage.trim() ? newEmojiImageZoom : null,
      headerImage: newHeaderImage.trim() || null,
      headerImageAlign: newHeaderImage.trim() ? newHeaderImageAlign : null,
      headerImageOpacity: newHeaderImage.trim() ? newHeaderImageOpacity : null,
      headerImageOffsetX: newHeaderImage.trim() ? newHeaderImageOffsetX : null,
      headerImageOffsetY: newHeaderImage.trim() ? newHeaderImageOffsetY : null,
      headerImageZoom: newHeaderImage.trim() ? newHeaderImageZoom : null,
      headerImageFit: newHeaderImage.trim() ? newHeaderImageFit : null,
      themeColor: newColor,
      group: tileType === 'space' ? (newGroup.trim() || 'General') : (newGroup.trim() || 'General'),
      sections: tileType === 'space' ? [
        {
          id: generateId(),
          title: 'General',
          links: []
        }
      ] : [],
      tabs: [],
      createdAt: Date.now(),
      visibility: newVisibility,
      allowedUsers: (newVisibility === 'private') ? finalAllowedUsers : undefined,
      allowedGroups: (newVisibility === 'private') ? newAllowedGroups : undefined,
      isHyperlink: tileType === 'hyperlink',
      hyperlinkUrl: tileType === 'hyperlink' ? hyperlinkUrl.trim() : undefined,
      openInNewTab: tileType === 'hyperlink' ? openInNewTab : undefined,
      visibleFrom: visibleFrom.trim() ? new Date(visibleFrom).toISOString() : undefined,
      expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : undefined,
      sourceTab: (activeTab === 'staging' || newCreateInStaging) ? 'staging' : 'public',
      messages: messages,
      // Tile decoration properties - preserve false/0 values, only use undefined for empty
      // When all values are empty/default, they'll be undefined and tile will use global style manager
      tileBackgroundColor: tileBackgroundColor.trim() ? tileBackgroundColor.trim() : undefined,
      tileGradientEnabled: tileGradientEnabled !== undefined ? tileGradientEnabled : undefined,
      tileGradientColors: tileGradientEnabled && tileGradientColors && tileGradientColors.length > 0 ? tileGradientColors : undefined,
      tileGradientColorPositions: tileGradientEnabled && tileGradientColors && tileGradientColorPositions && tileGradientColorPositions.length === tileGradientColors.length ? tileGradientColorPositions : undefined,
      tileGradientDirection: tileGradientEnabled && tileGradientDirection !== undefined ? tileGradientDirection : undefined,
      tileGradientType: tileGradientEnabled && tileGradientType ? tileGradientType : undefined,
      tileBorderRadius: tileBorderRadius !== undefined && tileBorderRadius !== null ? tileBorderRadius : undefined,
      tileTextColor: tileTextColor.trim() ? tileTextColor.trim() : undefined
    };

    if (onCreateTile) {
      try {
        await onCreateTile(newTile);
        resetForm();
        setIsModalOpen(false);
        if (activeTab === 'staging') {
          getTiles({ sourceTab: 'staging' }).then(setStagingTiles).catch(() => { });
        }
      } catch (error) {
        console.error('Failed to create tile:', error);
        alert('Failed to create tile. Please try again.');
      }
    } else {
      onUpdateTiles([...tiles, newTile]);
      resetForm();
      setIsModalOpen(false);
    }
  };


  const resetForm = () => {
    setNewTitle('');
    setNewDesc('');
    setNewSearchTags([]);
    setNewGroup('');
    setNewEmoji('📁');
    setNewShowEmoji(true);
    setNewShowTitle(true);
    setNewShowDescription(true);
    setNewEmojiImage('');
    setNewEmojiImageOpacity(100);
    setNewEmojiImageOffsetX(0);
    setNewEmojiImageOffsetY(0);
    setNewEmojiImageZoom(100);
    setEmojiImageUploading(false);
    setEmojiRemoveBg(false);
    setEmojiBgMode('auto');
    setEmojiBgColor('#ffffff');
    setNewHeaderImage('');
    setNewHeaderImageAlign('right');
    setNewHeaderImageOpacity(100);
    setNewHeaderImageOffsetX(0);
    setNewHeaderImageOffsetY(0);
    setNewHeaderImageZoom(100);
    setNewHeaderImageFit('contain');
    setHeaderRemoveBg(false);
    setHeaderBgMode('auto');
    setHeaderBgColor('#ffffff');
    setHeaderImageUploading(false);
    setNewColor('blue');
    setShowEmojiPicker(false);
    setNewVisibility('public');
    setNewCreateInStaging(activeTab === 'staging');
    setNewAllowedUsers([]);
    setNewAllowedGroups([]);
    setVisibilitySearchTerm('');
    setVisibilityActiveTab('users');
    setShowUserSelector(false);
    setTileType('space');
    setHyperlinkUrl('');
    setOpenInNewTab(true);
    setVisibleFrom('');
    setExpiresAt('');
    setEditModalActiveTab('general');
    // Reset decoration properties
    setTileBackgroundColor('');
    setTileGradientEnabled(false);
    setTileGradientColors(['#3b82f6', '#8b5cf6']);
    setTileGradientColorPositions([0, 100]);
    setTileGradientDirection(90);
    setTileGradientType('linear');
    setTileBorderRadius(12);
    setTileTextColor('');
    // Reset messages
    setMessages([]);
    setEditingMessageId(null);
    setMessageContent('');
    setMessageType('info');
    setMessageStartDate('');
    setMessageEndDate('');
    setMessageIsActive(true);
    setMessagePriority(0);
  };

  // When create modal opens, sync "Create in Staging" to current tab (Staging tab = staging)
  useEffect(() => {
    if (isModalOpen) {
      setNewCreateInStaging(activeTab === 'staging');
    }
  }, [isModalOpen, activeTab]);

  // Fetch users and groups when modal opens and visibility is private
  useEffect(() => {
    const shouldFetchUsers = (isModalOpen || isEditModalOpen) && isAuthenticated && newVisibility === 'private' && safeAvailableUsers.length === 0 && !isLoadingUsers;
    if (shouldFetchUsers) {
      setIsLoadingUsers(true);
      authService.getUsers()
        .then(users => {
          setAvailableUsers(Array.isArray(users) ? users : []);
          setIsLoadingUsers(false);
        })
        .catch(err => {
          console.error('Failed to fetch users:', err);
          setAvailableUsers([]);
          setIsLoadingUsers(false);
        });
    }

    const shouldFetchGroups = (isModalOpen || isEditModalOpen) && isAuthenticated && newVisibility === 'private' && safeAvailableGroups.length === 0 && !isLoadingGroups;
    if (shouldFetchGroups) {
      setIsLoadingGroups(true);
      fetch(`${resolveApiBase()}/user-groups`, {
        method: 'GET',
        credentials: 'include',
      })
        .then(response => response.json().then(data => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
          setAvailableGroups(ok && Array.isArray(data) ? data : []);
          setIsLoadingGroups(false);
        })
        .catch(err => {
          console.error('Failed to fetch groups:', err);
          setAvailableGroups([]);
          setIsLoadingGroups(false);
        });
    }
  }, [isModalOpen, isEditModalOpen, isAuthenticated, newVisibility]);

  // Handle ESC key for create tile modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
        resetForm();
      }
    };

    if (isModalOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isModalOpen]);

  // Handle ESC key for edit tile modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isEditModalOpen) {
        setIsEditModalOpen(false);
        setEditingTile(null);
        resetForm();
      }
    };

    if (isEditModalOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isEditModalOpen]);

  // ESC key closes the category schedule dialog
  useEscapeToClose(!!editingCategorySchedule, () => {
    setEditingCategorySchedule(null);
    setCategoryVisibleFrom('');
    setCategoryExpiresAt('');
  });

  const handleDeleteTile = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    const isFromArchive = activeTab === 'archive';
    const confirmMessage = isFromArchive
      ? "Are you sure you want to delete this space from archive? It will be moved to the recycle bin."
      : "Are you sure you want to delete this space? It will be moved to the recycle bin.";

    if (confirm(confirmMessage)) {
      if (onDeleteTile) {
        try {
          await onDeleteTile(id);
          // Reload tiles to reflect the deletion (staging vs main list)
          if (activeTab === 'staging') {
            const updatedStaging = await getTiles({ sourceTab: 'staging' });
            setStagingTiles(updatedStaging);
          } else {
            const updatedTiles = await getTiles();
            onUpdateTiles(updatedTiles);
          }

          // Always reload recycle bin to update the counter (tile was moved to recycle bin)
          const updatedRecycleBin = await getRecycleBin();
          setRecycleBinTiles(updatedRecycleBin);

          // If deleting from archive, also reload archive
          if (isFromArchive) {
            const updatedArchive = await getArchive();
            setArchiveTiles(updatedArchive);
          }
        } catch (error) {
          console.error('Failed to delete tile:', error);
          const msg = error instanceof Error ? error.message : 'Failed to delete space. Please try again.';
          alert(msg);
        }
      } else {
        if (activeTab === 'staging') {
          setStagingTiles(prev => prev.filter(t => t.id !== id));
        } else {
          onUpdateTiles(tiles.filter(t => t.id !== id));
        }
        // Still refresh recycle bin even if using local state
        try {
          const updatedRecycleBin = await getRecycleBin();
          setRecycleBinTiles(updatedRecycleBin);
        } catch (error) {
          console.error('Failed to refresh recycle bin:', error);
        }
      }
    }
  };

  const handleArchiveTile = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    if (confirm("Are you sure you want to archive this space? It will be moved to the archive.")) {
      try {
        await archiveTile(id);
        // Reload tiles to reflect the archive
        const updatedTiles = await getTiles();
        onUpdateTiles(updatedTiles);
        // Always reload archive to update the count
        const updatedArchive = await getArchive();
        setArchiveTiles(updatedArchive);
      } catch (error) {
        console.error('Failed to archive tile:', error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        alert(`Failed to archive space: ${errorMsg}`);
      }
    }
  };

  const handleUnarchiveTile = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    try {
      await unarchiveTile(id);
      // Reload tiles and archive
      const updatedTiles = await getTiles();
      onUpdateTiles(updatedTiles);
      const updatedArchive = await getArchive();
      setArchiveTiles(updatedArchive);
    } catch (error) {
      console.error('Failed to unarchive tile:', error);
      alert('Failed to restore space. Please try again.');
    }
  };

  const handleRestoreTile = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    try {
      await restoreTile(id);
      // Reload recycle bin and main tiles
      const updatedRecycleBin = await getRecycleBin();
      setRecycleBinTiles(updatedRecycleBin);
      const updatedTiles = await getTiles();
      onUpdateTiles(updatedTiles);
    } catch (error) {
      console.error('Failed to restore tile:', error);
      alert('Failed to restore space. Please try again.');
    }
  };

  const handlePermanentDeleteTile = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    if (!confirm("Are you sure you want to permanently delete this space? This action cannot be undone.")) {
      return;
    }

    try {
      await permanentDeleteTile(id);
      // Reload recycle bin and main tiles
      const updatedRecycleBin = await getRecycleBin();
      setRecycleBinTiles(updatedRecycleBin);
      const updatedTiles = await getTiles();
      onUpdateTiles(updatedTiles);
    } catch (error) {
      console.error('Failed to permanently delete tile:', error);
      alert('Failed to permanently delete space. Please try again.');
    }
  };

  const handlePermanentDeleteCategory = async (categoryName: string) => {
    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    const categoryTiles = recycleBinTiles.filter(tile => (tile.group || 'General') === categoryName);

    if (categoryTiles.length === 0) {
      alert('No tiles found in this category in recycle bin.');
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete the category "${categoryName}"? This will permanently delete ${categoryTiles.length} space(s). This action cannot be undone.`)) {
      return;
    }

    try {
      const result = await permanentDeleteCategory(categoryName);
      // Reload recycle bin
      const updatedRecycleBin = await getRecycleBin();
      setRecycleBinTiles(updatedRecycleBin);
      alert(`Successfully permanently deleted ${result.purgedCount} space(s) from category "${categoryName}".`);
    } catch (error) {
      console.error('Failed to permanently delete category:', error);
      alert('Failed to permanently delete category. Please try again.');
    }
  };

  const handlePurgeRecycleBin = async () => {
    if (!isAuthenticated) {
      alert('You must be logged in to purge the recycle bin.');
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete all ${recycleBinTiles.length} space(s) from your recycle bin? This action cannot be undone.`)) {
      return;
    }

    try {
      const result = await purgeRecycleBin();
      setRecycleBinTiles([]);
      alert(`Successfully purged ${result.purgedCount} space(s) from your recycle bin.`);
    } catch (error) {
      console.error('Failed to purge recycle bin:', error);
      alert('Failed to purge recycle bin. Please try again.');
    }
  };

  const handlePurgeArchive = async () => {
    if (!isAuthenticated || !user?.is_admin) {
      alert('Only administrators can purge the archive.');
      return;
    }

    if (!confirm(`Are you sure you want to move all ${archiveTiles.length} space(s) from the archive to the recycle bin? They can be permanently deleted from the recycle bin later.`)) {
      return;
    }

    try {
      const result = await purgeArchive();
      // Reload archive and recycle bin to reflect the changes
      const updatedArchive = await getArchive();
      setArchiveTiles(updatedArchive);
      const updatedRecycleBin = await getRecycleBin();
      setRecycleBinTiles(updatedRecycleBin);
      alert(`Successfully moved ${result.purgedCount} space(s) from archive to recycle bin.`);
    } catch (error) {
      console.error('Failed to purge archive:', error);
      alert('Failed to purge archive. Please try again.');
    }
  };

  const handleCloneTile = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    if (onCloneTile) {
      try {
        await onCloneTile(id);
        if (activeTab === 'staging') {
          getTiles({ sourceTab: 'staging' }).then(setStagingTiles).catch(() => { });
        }
      } catch (error) {
        console.error('Failed to clone tile:', error);
        alert('Failed to clone space. Please try again.');
      }
    }
  };

  const handleOpenShareDialog = (tile: Tile) => {
    setShareTileDialog(tile);
  };

  const handleRemoveSharedTile = async (tile: Tile) => {
    if (!tile.sharedWithMeInvitationId) return;
    if (!confirm('Remove this shared tile from your Private tab? You can accept it again if the owner shares it with you later.')) return;
    try {
      await removeSharedTile(tile.sharedWithMeInvitationId);
      const updated = await getTiles();
      onUpdateTiles(updated, false);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to remove');
    }
  };

  const handleBlockSharer = async (tile: Tile) => {
    const sharer = tile.sharedWithMeSharer;
    if (!sharer) return;
    if (!confirm(`Block ${sharer.username} from sharing tiles with you? They will not be able to send you new share invitations.`)) return;
    try {
      await blockUser(sharer.userId);
      await removeSharedTile(tile.sharedWithMeInvitationId!);
      const updated = await getTiles();
      onUpdateTiles(updated, false);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to block user');
    }
  };

  const handleTileClick = (tileId: string) => {
    const sourceList = activeTab === 'staging' ? stagingTiles : tiles;
    const tile = sourceList.find(t => t.id === tileId);
    if (tile?.isHyperlink && tile.hyperlinkUrl) {
      if (tile.openInNewTab) {
        window.open(tile.hyperlinkUrl, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = tile.hyperlinkUrl;
      }
    } else {
      // Include the active tab in the URL hash so TileDetail knows the source context
      window.location.hash = `#/tile/${tileId}?from=${activeTab}`;
    }
  };

  const handleOpenEditModal = (tile: Tile) => {
    setEditingTile(tile);
    setNewTitle(tile.title);
    setNewDesc(tile.description);
    setNewSearchTags(Array.isArray(tile.searchTags) ? [...tile.searchTags] : []);
    setNewGroup(tile.group || '');
    setNewEmoji(tile.emoji);
    setNewShowEmoji(tile.showEmoji !== false);
    setNewShowTitle(tile.showTitle !== false);
    setNewShowDescription(tile.showDescription !== false);
    setNewEmojiImage(tile.emojiImage || '');
    setNewEmojiImageOpacity(
      typeof tile.emojiImageOpacity === 'number' ? Math.max(0, Math.min(100, tile.emojiImageOpacity)) : 100
    );
    setNewEmojiImageOffsetX(
      typeof tile.emojiImageOffsetX === 'number' ? Math.max(-50, Math.min(50, tile.emojiImageOffsetX)) : 0
    );
    setNewEmojiImageOffsetY(
      typeof tile.emojiImageOffsetY === 'number' ? Math.max(-50, Math.min(50, tile.emojiImageOffsetY)) : 0
    );
    setNewEmojiImageZoom(
      typeof tile.emojiImageZoom === 'number' ? Math.max(50, Math.min(300, tile.emojiImageZoom)) : 100
    );
    setEmojiRemoveBg(false);
    setEmojiBgMode('auto');
    setEmojiBgColor('#ffffff');
    setNewHeaderImage(tile.headerImage || '');
    setNewHeaderImageAlign(
      tile.headerImageAlign === 'left' || tile.headerImageAlign === 'center' || tile.headerImageAlign === 'right'
        ? tile.headerImageAlign
        : 'right'
    );
    setNewHeaderImageOpacity(
      typeof tile.headerImageOpacity === 'number' ? Math.max(0, Math.min(100, tile.headerImageOpacity)) : 100
    );
    setNewHeaderImageOffsetX(
      typeof tile.headerImageOffsetX === 'number' ? Math.max(-300, Math.min(300, tile.headerImageOffsetX)) : 0
    );
    setNewHeaderImageOffsetY(
      typeof tile.headerImageOffsetY === 'number' ? Math.max(-300, Math.min(300, tile.headerImageOffsetY)) : 0
    );
    setNewHeaderImageZoom(
      typeof tile.headerImageZoom === 'number' ? Math.max(50, Math.min(300, tile.headerImageZoom)) : 100
    );
    setNewHeaderImageFit(tile.headerImageFit === 'cover' ? 'cover' : 'contain');
    setHeaderRemoveBg(false);
    setHeaderBgMode('auto');
    setHeaderBgColor('#ffffff');
    setNewColor(tile.themeColor);
    setTileType(tile.isHyperlink ? 'hyperlink' : 'space');
    setHyperlinkUrl(tile.hyperlinkUrl || '');
    setOpenInNewTab(tile.openInNewTab !== undefined ? tile.openInNewTab : true);
    // For hyperlinks: if user is not admin, set visibility to private (they can only select private)
    if (tile.isHyperlink && user && !user.is_admin && isAuthenticated) {
      setNewVisibility('private');
    } else {
      setNewVisibility(tile.visibility || 'public');
    }

    // Always include owner in allowed users list
    const allowedUsers = tile.allowedUsers || [];
    const allowedGroups = tile.allowedGroups || [];
    if (tile.userId) {
      const ownerIdNum = typeof tile.userId === 'string' ? parseInt(tile.userId, 10) : tile.userId;
      if (!allowedUsers.includes(ownerIdNum)) {
        setNewAllowedUsers([...allowedUsers, ownerIdNum]);
      } else {
        setNewAllowedUsers(allowedUsers);
      }
    } else {
      setNewAllowedUsers(allowedUsers);
    }
    setNewAllowedGroups(allowedGroups);
    // Convert ISO date strings to datetime-local format (YYYY-MM-DDTHH:mm)
    setVisibleFrom(tile.visibleFrom ? new Date(tile.visibleFrom).toISOString().slice(0, 16) : '');
    setExpiresAt(tile.expiresAt ? new Date(tile.expiresAt).toISOString().slice(0, 16) : '');
    // Load decoration properties (use explicit checks to preserve false/0 values)
    setTileBackgroundColor(tile.tileBackgroundColor ?? '');
    setTileGradientEnabled(tile.tileGradientEnabled ?? false);
    const loadedColors = tile.tileGradientColors && tile.tileGradientColors.length > 0 ? tile.tileGradientColors : ['#3b82f6', '#8b5cf6'];
    setTileGradientColors(loadedColors);
    // Load color positions or generate defaults (evenly spaced)
    if (tile.tileGradientColorPositions && tile.tileGradientColorPositions.length === loadedColors.length) {
      setTileGradientColorPositions(tile.tileGradientColorPositions);
    } else {
      // Generate evenly spaced positions
      const positions = loadedColors.map((_, i) => loadedColors.length > 1 ? (i / (loadedColors.length - 1)) * 100 : 0);
      setTileGradientColorPositions(positions);
    }
    // Convert direction to angle if it's a string, otherwise use the number
    if (typeof tile.tileGradientDirection === 'string') {
      const dirMap: { [key: string]: number } = {
        'to right': 90,
        'to left': 270,
        'to bottom': 180,
        'to top': 0,
        'to bottom right': 135,
        'to bottom left': 225,
        'to top right': 45,
        'to top left': 315
      };
      const angle = dirMap[tile.tileGradientDirection] ?? (parseInt(tile.tileGradientDirection.replace('deg', '')) || 90);
      setTileGradientDirection(angle);
    } else {
      setTileGradientDirection(tile.tileGradientDirection ?? 90);
    }
    setTileGradientType((tile.tileGradientType ?? 'linear') as 'linear' | 'radial' | 'conic' | 'repeating-linear' | 'repeating-radial' | 'repeating-conic');
    setTileBorderRadius(tile.tileBorderRadius ?? 12);
    setTileTextColor(tile.tileTextColor ?? '');
    setMessages(Array.isArray(tile.messages) ? tile.messages : []);
    setEditModalActiveTab('general');
    setIsEditModalOpen(true);

    // Summary tiles may omit messages on older API caches — load them for Message Board
    if (!Array.isArray(tile.messages) && isAuthenticated) {
      getTile(tile.id)
        .then((full) => {
          if (!full || !Array.isArray(full.messages)) return;
          setMessages(full.messages);
          setEditingTile((prev) =>
            prev && prev.id === tile.id ? { ...prev, messages: full.messages } : prev
          );
        })
        .catch(() => { /* keep empty board */ });
    }

    // Load users if needed for private visibility
    if (tile.visibility === 'private' && isAuthenticated && safeAvailableUsers.length === 0 && !isLoadingUsers) {
      setIsLoadingUsers(true);
      authService.getUsers()
        .then(users => {
          setAvailableUsers(Array.isArray(users) ? users : []);
          setIsLoadingUsers(false);
        })
        .catch(err => {
          console.error('Failed to fetch users:', err);
          setAvailableUsers([]);
          setIsLoadingUsers(false);
        });
    }
  };

  // Helper function to check if a tile has any decorations
  const hasAnyDecorations = useCallback((tile: Tile): boolean => {
    return !!(
      tile.tileBackgroundColor ||
      (tile.tileGradientEnabled && tile.tileGradientColors && tile.tileGradientColors.length > 0) ||
      (tile.tileBorderRadius !== undefined && tile.tileBorderRadius !== null) ||
      (tile.tileTextColor &&
        tile.tileTextColor.toLowerCase() !== '#000000' &&
        tile.tileTextColor.toLowerCase() !== '000000')
    );
  }, []);

  // Helper function to reset tile decorations (same as "Reset All" button)
  const resetTileDecorations = useCallback((tile: Tile): Tile => {
    return {
      ...tile,
      tileBackgroundColor: undefined,
      tileGradientEnabled: undefined,
      tileGradientColors: undefined,
      tileGradientColorPositions: undefined,
      tileGradientDirection: undefined,
      tileGradientType: undefined,
      tileBorderRadius: undefined,
      tileTextColor: undefined
    };
  }, []);

  // Preview Celebration triggering logic
  useEffect(() => {
    if (!isEditModalOpen || (editModalActiveTab !== 'messages' && editModalActiveTab !== 'decoration') || (editModalActiveTab === 'messages' && messageType !== 'celebration')) {
      return;
    }

    let effectType = messageCelebrationEffect || 'fireworks';
    if (effectType === 'none') {
      // Clear all triggers
      setPreviewFireworksTrigger(0);
      setPreviewConfettiTrigger(0);
      setPreviewSnowfallTrigger(0);
      setPreviewHeartsRisingTrigger(0);
      setPreviewHeartsFallingTrigger(0);
      setPreviewBubblesTrigger(0);
      setPreviewButterfliesTrigger(0);
      setPreviewBirdsFlyingTrigger(0);
      setPreviewRocketLaunchTrigger(0);
      setPreviewBurstFireworksTrigger(0);
      setPreviewSparklesTrigger(0);
      setPreviewPetalsTrigger(0);
      setPreviewShootingStarsTrigger(0);
      setPreviewLeavesTrigger(0);
      setPreviewFirefliesTrigger(0);
      setPreviewBalloonsTrigger(0);
      setPreviewStarsTrigger(0);
      setPreviewRainbowTrigger(0);
      return;
    }
    if (effectType === 'hearts') effectType = 'hearts-rising';

    const intervalMs = Math.max(2000, Math.min(15000, messageCelebrationConfig.triggerIntervalMs ?? 5000));

    const triggerMap: Record<string, React.Dispatch<React.SetStateAction<number>>> = {
      'fireworks': setPreviewFireworksTrigger,
      'confetti': setPreviewConfettiTrigger,
      'snowfall': setPreviewSnowfallTrigger,
      'hearts-rising': setPreviewHeartsRisingTrigger,
      'hearts-falling': setPreviewHeartsFallingTrigger,
      'bubbles': setPreviewBubblesTrigger,
      'butterflies': setPreviewButterfliesTrigger,
      'birds-flying': setPreviewBirdsFlyingTrigger,
      'rocket-launch': setPreviewRocketLaunchTrigger,
      'burst-fireworks': setPreviewBurstFireworksTrigger,
      'sparkles': setPreviewSparklesTrigger,
      'petals': setPreviewPetalsTrigger,
      'shooting-stars': setPreviewShootingStarsTrigger,
      'leaves': setPreviewLeavesTrigger,
      'fireflies': setPreviewFirefliesTrigger,
      'balloons': setPreviewBalloonsTrigger,
      'stars': setPreviewStarsTrigger,
      'rainbow': setPreviewRainbowTrigger,
    };

    const setTrigger = triggerMap[effectType];
    if (setTrigger) {
      // Small timeout to allow everything to settle before first trigger
      const initialTimer = setTimeout(() => setTrigger(prev => prev + 1), 300);
      const interval = setInterval(() => setTrigger(prev => prev + 1), intervalMs);
      return () => {
        clearTimeout(initialTimer);
        clearInterval(interval);
      };
    }
  }, [isEditModalOpen, editModalActiveTab, messageType, messageCelebrationEffect, messageCelebrationConfig.triggerIntervalMs]);

  const persistEditingTile = async ({ closeModal }: { closeModal: boolean }) => {
    if (!editingTile || !newTitle.trim() || isUpdatingTile) return;

    if (tileType === 'hyperlink' && !hyperlinkUrl.trim()) return;

    if (newVisibility === 'private' && newAllowedUsers.length === 0) return;

    if (!isAuthenticated && onAuthRequired) {
      onAuthRequired();
      return;
    }

    setIsUpdatingTile(true);

    // Ensure owner is always included in allowed users for private tiles
    let finalAllowedUsers = newAllowedUsers;
    if (newVisibility === 'private' && editingTile.userId) {
      const ownerIdNum = typeof editingTile.userId === 'string' ? parseInt(editingTile.userId, 10) : editingTile.userId;
      if (!finalAllowedUsers.includes(ownerIdNum)) {
        finalAllowedUsers = [...finalAllowedUsers, ownerIdNum];
      }
    }

    // Check if visibility is changing
    const visibilityChanged = editingTile.visibility !== newVisibility;

    // Check if tile has any decorations from form state
    const hasDecorationsFromForm = !!(
      tileBackgroundColor.trim() ||
      (tileGradientEnabled && tileGradientColors && tileGradientColors.length > 0) ||
      (tileBorderRadius !== undefined && tileBorderRadius !== null) ||
      (tileTextColor.trim() &&
        tileTextColor.trim().toLowerCase() !== '#000000' &&
        tileTextColor.trim().toLowerCase() !== '000000')
    );

    // Check if original tile had decorations
    const hasDecorationsFromTile = hasAnyDecorations(editingTile);

    // If visibility changed and tile has no decorations (neither in form nor original), automatically reset decorations
    let decorationProps: Partial<Tile> = {};
    if (visibilityChanged && !hasDecorationsFromForm && !hasDecorationsFromTile) {
      // No decorations at all - reset all (use global style manager)
      decorationProps = {
        tileBackgroundColor: undefined,
        tileGradientEnabled: undefined,
        tileGradientColors: undefined,
        tileGradientColorPositions: undefined,
        tileGradientDirection: undefined,
        tileGradientType: undefined,
        tileBorderRadius: undefined,
        tileTextColor: undefined
      };
    } else {
      // Has decorations or visibility didn't change - use form values
      decorationProps = {
        tileBackgroundColor: tileBackgroundColor.trim() ? tileBackgroundColor.trim() : undefined,
        tileGradientEnabled: tileGradientEnabled !== undefined ? tileGradientEnabled : undefined,
        tileGradientColors: tileGradientEnabled && tileGradientColors && tileGradientColors.length > 0 ? tileGradientColors : undefined,
        tileGradientColorPositions: tileGradientEnabled && tileGradientColors && tileGradientColorPositions && tileGradientColorPositions.length === tileGradientColors.length ? tileGradientColorPositions : undefined,
        tileGradientDirection: tileGradientEnabled && tileGradientDirection !== undefined ? tileGradientDirection : undefined,
        tileGradientType: tileGradientEnabled && tileGradientType ? tileGradientType : undefined,
        tileBorderRadius: tileBorderRadius !== undefined && tileBorderRadius !== null ? tileBorderRadius : undefined,
        // Don't save #000000 (black) as it's effectively "no decoration" - treat it as undefined
        tileTextColor: tileTextColor.trim() && tileTextColor.trim().toLowerCase() !== '#000000' && tileTextColor.trim().toLowerCase() !== '000000' ? tileTextColor.trim() : undefined
      };
    }

    const updatedTile: Tile = {
      ...editingTile,
      title: newTitle,
      description: newDesc,
      searchTags: newSearchTags,
      emoji: newEmoji,
      showEmoji: newShowEmoji,
      showTitle: newShowTitle,
      showDescription: newShowDescription,
      emojiImage: newEmojiImage.trim() || null,
      emojiImageOpacity: newEmojiImage.trim() ? newEmojiImageOpacity : null,
      emojiImageOffsetX: newEmojiImage.trim() ? newEmojiImageOffsetX : null,
      emojiImageOffsetY: newEmojiImage.trim() ? newEmojiImageOffsetY : null,
      emojiImageZoom: newEmojiImage.trim() ? newEmojiImageZoom : null,
      headerImage: newHeaderImage.trim() || null,
      headerImageAlign: newHeaderImage.trim() ? newHeaderImageAlign : null,
      headerImageOpacity: newHeaderImage.trim() ? newHeaderImageOpacity : null,
      headerImageOffsetX: newHeaderImage.trim() ? newHeaderImageOffsetX : null,
      headerImageOffsetY: newHeaderImage.trim() ? newHeaderImageOffsetY : null,
      headerImageZoom: newHeaderImage.trim() ? newHeaderImageZoom : null,
      headerImageFit: newHeaderImage.trim() ? newHeaderImageFit : null,
      themeColor: newColor,
      group: newGroup.trim() || 'General',
      visibility: newVisibility,
      allowedUsers: (newVisibility === 'private') ? finalAllowedUsers : undefined,
      allowedGroups: (newVisibility === 'private') ? newAllowedGroups : undefined,
      isHyperlink: tileType === 'hyperlink',
      hyperlinkUrl: tileType === 'hyperlink' ? hyperlinkUrl.trim() : undefined,
      openInNewTab: tileType === 'hyperlink' ? openInNewTab : undefined,
      visibleFrom: visibleFrom.trim() ? new Date(visibleFrom).toISOString() : undefined,
      expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : undefined,
      messages: messages,
      ...decorationProps
    };

    try {
      const sourceTiles = activeTab === 'staging' ? stagingTiles : tiles;
      const updatedTiles = sourceTiles.map(t => t.id === updatedTile.id ? updatedTile : t);

      // Save first so a subsequent list reload cannot wipe headerImage with stale data
      if (isAuthenticated) {
        await saveTile(updatedTile);
      }

      // Staging uses local state; public list goes through App (skipReload avoids stale overwrite)
      if (activeTab === 'staging') {
        setStagingTiles(updatedTiles);
      } else {
        onUpdateTiles(updatedTiles, true);
      }

      if (closeModal) {
        resetForm();
        setIsEditModalOpen(false);
        setEditingTile(null);
      } else {
        // Keep modal open so the live grid tile can be compared while editing continues
        setEditingTile(updatedTile);
      }
    } catch (error) {
      console.error('Failed to update tile:', error);
      alert('Failed to update tile. Please try again.');
    } finally {
      setIsUpdatingTile(false);
    }
  };

  const handleUpdateTile = async () => {
    await persistEditingTile({ closeModal: true });
  };

  const handleApplyTile = async () => {
    await persistEditingTile({ closeModal: false });
  };

  const isEditFormInvalid =
    !newTitle.trim() ||
    (tileType === 'hyperlink' && !hyperlinkUrl.trim()) ||
    (newVisibility === 'private' && newAllowedUsers.length === 0);

  const isPrivateScopeSave = activeTab === 'private' && !!user;
  const buildArrangementAndScope = useCallback(
    (sourceTiles: Tile[]): { arrangement: Array<{ tileId: string; position: number; groupName: string }>; scope?: 'global' | 'private' } => {
      const owned = (t: Tile) => {
        const uid = t.userId ?? (t as { user_id?: number }).user_id;
        return uid != null && user && uid === user.id;
      };
      if (isPrivateScopeSave && user) {
        const filtered = sourceTiles.filter(owned);
        const grouped: Record<string, Tile[]> = {};
        filtered.forEach((t) => {
          const g = t.group || 'General';
          if (!grouped[g]) grouped[g] = [];
          grouped[g].push(t);
        });
        const orderedCats: string[] = [];
        const seen = new Set<string>();
        if (categoryOrder.length > 0) {
          categoryOrder.forEach((c) => {
            if (grouped[c] && !seen.has(c)) {
              orderedCats.push(c);
              seen.add(c);
            }
          });
        }
        Object.keys(grouped).forEach((c) => {
          if (!seen.has(c)) orderedCats.push(c);
        });
        const arrangement: Array<{ tileId: string; position: number; groupName: string }> = [];
        orderedCats.forEach((cat) => {
          (grouped[cat] || []).forEach((t) =>
            arrangement.push({ tileId: t.id, position: arrangement.length, groupName: cat })
          );
        });
        return { arrangement, scope: 'private' };
      }
      return {
        arrangement: sourceTiles.map((t, i) => ({
          tileId: t.id,
          position: i,
          groupName: t.group || 'General',
        })),
        scope: undefined,
      };
    },
    [isPrivateScopeSave, user, categoryOrder]
  );

  const handleMoveTileToCategory = useCallback(async (tileId: string, categoryName: string) => {
    if (!isAuthenticated) return;

    const sourceTiles = activeTab === 'staging' ? stagingTiles : tiles;
    try {
      const updatedTiles = sourceTiles.map(tile =>
        tile.id === tileId
          ? { ...tile, group: categoryName }
          : tile
      );

      // Update local state (staging vs main)
      if (activeTab === 'staging') {
        setStagingTiles(updatedTiles);
      } else {
        onUpdateTiles(updatedTiles);
      }

      // Save arrangement to backend - preserve order within each category
      try {
        // Group tiles by category and assign positions within each category
        const grouped: Record<string, Tile[]> = {};
        updatedTiles.forEach(tile => {
          const group = tile.group || 'General';
          if (!grouped[group]) {
            grouped[group] = [];
          }
          grouped[group].push(tile);
        });

        const orderedCategories: string[] = [];
        const seenCats = new Set<string>();
        if (categoryOrder.length > 0) {
          categoryOrder.forEach((c) => {
            if (grouped[c] && !seenCats.has(c)) {
              orderedCategories.push(c);
              seenCats.add(c);
            }
          });
        }
        Object.keys(grouped).forEach((c) => {
          if (!seenCats.has(c)) orderedCategories.push(c);
        });
        const flat: Tile[] = [];
        orderedCategories.forEach((cat) => flat.push(...(grouped[cat] || [])));
        const { arrangement, scope } = buildArrangementAndScope(flat);
        await saveTileArrangement(arrangement, scope);
      } catch (error) {
        console.error('Failed to save tile arrangement:', error);
        // Revert on error
        const errorMsg = error instanceof Error ? error.message : 'Failed to save tile arrangement. Please try again.';
        alert(errorMsg);
        if (activeTab === 'staging') {
          setStagingTiles(stagingTiles);
        } else {
          onUpdateTiles(tiles);
        }
      }
    } catch (error) {
      console.error('Failed to move tile to category:', error);
      alert('Failed to move tile. Please try again.');
    }
  }, [tiles, stagingTiles, activeTab, isAuthenticated, onUpdateTiles, categoryOrder, buildArrangementAndScope]);

  const handleMoveCategory = useCallback(async (categoryName: string, direction: 'up' | 'down') => {
    if (!isAuthenticated) return;

    const sourceTiles = activeTab === 'staging' ? stagingTiles : tiles;
    // Get all current categories from tiles (preserve order)
    const allCategoriesFromTiles: string[] = [];
    const seenCats = new Set<string>();
    sourceTiles.forEach(t => {
      const cat = t.group || 'General';
      if (!seenCats.has(cat)) {
        allCategoriesFromTiles.push(cat);
        seenCats.add(cat);
      }
    });

    // Build current order: use categoryOrder if available, otherwise use order from tiles
    let currentCategories: string[];
    if (categoryOrder.length > 0) {
      // Start with saved order, filter to only include existing categories
      currentCategories = categoryOrder.filter(cat => allCategoriesFromTiles.includes(cat));
      // Add any new categories not in the saved order (in their order of appearance)
      allCategoriesFromTiles.forEach(cat => {
        if (!currentCategories.includes(cat)) {
          currentCategories.push(cat);
        }
      });
    } else {
      // No saved order, use order from tiles
      currentCategories = [...allCategoriesFromTiles];
    }

    const currentIndex = currentCategories.indexOf(categoryName);

    if (currentIndex === -1) {
      console.error('Category not found in order:', categoryName);
      return;
    }

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= currentCategories.length) {
      return; // Already at top or bottom
    }

    // Create new order by swapping
    const newCategoryOrder = [...currentCategories];
    [newCategoryOrder[currentIndex], newCategoryOrder[newIndex]] = [newCategoryOrder[newIndex], newCategoryOrder[currentIndex]];

    // Update state immediately for instant feedback
    setCategoryOrder(newCategoryOrder);

    // Save category arrangement to database (global for all users)
    try {
      const arrangement = newCategoryOrder.map((category, index) => ({
        categoryName: category,
        position: index,
        visibleFrom: categoryMetadata[category]?.visibleFrom || null,
        expiresAt: categoryMetadata[category]?.expiresAt || null
      }));
      await saveCategoryArrangement(arrangement);
      // Success - order is now saved globally and will be visible to all users
    } catch (error) {
      console.error('Failed to save category arrangement:', error);
      // Revert state on error
      setCategoryOrder(categoryOrder);
      const errorMsg = error instanceof Error ? error.message : 'Failed to save category order. Please try again.';
      alert(errorMsg);
    }
  }, [tiles, stagingTiles, activeTab, isAuthenticated, categoryOrder, categoryMetadata]);

  const handleExportCategory = useCallback(
    async (categoryName: string) => {
      if (!user?.is_admin) {
        alert('Only administrators can export categories.');
        return;
      }

      try {
        // Initialize progress
        setExportProgress({
          current: 0,
          total: 0,
          status: 'Preparing export...',
          errors: []
        });

        // Get category tiles from the appropriate source (staging vs main)
        const sourceTiles = activeTab === 'staging' ? stagingTiles : tiles;
        const categoryTiles = sourceTiles.filter(
          (t) => (t.group || 'General') === categoryName
        );

        if (categoryTiles.length === 0) {
          setExportProgress(null);
          alert(`No spaces found in category "${categoryName}".`);
          return;
        }

        // Update progress with total count
        setExportProgress({
          current: 0,
          total: categoryTiles.length,
          status: `Exporting ${categoryTiles.length} tiles from "${categoryName}"...`,
          errors: []
        });

        // Small delay to show progress animation
        await new Promise(resolve => setTimeout(resolve, 100));

        // Prepare export payload (keep in sync with spaceTransferService v1.2)
        const payload = {
          version: '1.2' as const,
          type: 'category' as const,
          exportedAt: Date.now(),
          categoryName,
          tiles: categoryTiles
        };

        // Update progress - processing
        setExportProgress({
          current: categoryTiles.length / 2,
          total: categoryTiles.length,
          status: `Processing ${categoryTiles.length} tiles...`,
          errors: []
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        // Trigger download
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `linknest-category-${categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'space'}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        // Final status
        setExportProgress({
          current: categoryTiles.length,
          total: categoryTiles.length,
          status: `✅ Successfully exported ${categoryTiles.length} tiles from category "${categoryName}"!`,
          errors: []
        });

        // Clear progress after delay
        setTimeout(() => {
          setExportProgress(null);
        }, 3000);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        setExportProgress({
          current: 0,
          total: 0,
          status: `❌ Failed to export: ${errorMsg}`,
          errors: []
        });
        console.error('Export error:', error);

        // Clear progress after delay
        setTimeout(() => {
          setExportProgress(null);
        }, 5000);
      }
    },
    [tiles, stagingTiles, activeTab, user]
  );

  const handleExportTile = useCallback(
    (tile: Tile) => {
      if (!user?.is_admin) {
        alert('Only administrators can export tiles.');
        return;
      }
      exportTileToFile(tile);
    },
    [user]
  );

  const handleExportStats = useCallback(() => {
    if (favoriteLinks.length === 0) {
      alert('No favorite links to export');
      return;
    }

    // Prepare CSV data with both local and server latency
    const headers = ['Label', 'URL', 'Status', 'HTTP Code', 'Local Latency (ms)', 'Server Latency (ms)', 'Total Latency (ms)', 'Parent Space', 'Last Checked'];
    const rows: string[][] = [];

    favoriteLinks.forEach(link => {
      if (isSshLinkUrl(link.url) || isVncLinkUrl(link.url)) return;
      const healthResult = linkHealthResults.get(link.id);
      const status = healthResult?.health?.status || 'unknown';
      const httpCode = healthResult?.health?.httpCode || '';
      const localLatency = healthResult?.latency || 0;
      const serverLatency = healthResult?.serverLatency || 0;
      const totalLatency = localLatency; // Local latency already includes server processing time
      const lastChecked = healthResult?.health?.checkedAt
        ? new Date(healthResult.health.checkedAt).toLocaleString()
        : 'Never';

      rows.push([
        link.label,
        link.url,
        status,
        httpCode.toString(),
        localLatency.toString(),
        serverLatency.toString(),
        totalLatency.toString(),
        link.tile.title,
        lastChecked
      ]);
    });

    // Convert to CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `favorite-links-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [favoriteLinks, linkHealthResults]);

  const handleImportCategory = useCallback(
    async (categoryName: string) => {
      if (!isAuthenticated) {
        if (onAuthRequired) onAuthRequired();
        return;
      }
      if (!user?.is_admin) {
        alert('Only administrators can import categories.');
        return;
      }

      // Create a file input element
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
          // Initialize progress
          setImportProgress({
            current: 0,
            total: 0,
            status: 'Parsing file...',
            errors: []
          });

          const text = await file.text();
          const data = JSON.parse(text);

          // Validate and parse the import file
          const parsed = parseSpaceExportObject(data);

          // Normalize imported tiles and assign to the target category
          const normalizedTiles = normalizeImportedTiles(parsed);

          // Update group to target category; when in staging, put tiles in staging
          const tilesToImport = normalizedTiles.map(tile => ({
            ...tile,
            group: categoryName,
            ...(activeTab === 'staging' ? { sourceTab: 'staging' as const } : {})
          }));

          if (tilesToImport.length === 0) {
            setImportProgress(null);
            alert('No tiles/spaces found to import.');
            return;
          }

          // Update progress with total count
          setImportProgress({
            current: 0,
            total: tilesToImport.length,
            status: `Importing ${tilesToImport.length} tiles to "${categoryName}"...`,
            errors: []
          });

          // Import tiles one by one using createTile API
          let successCount = 0;
          let errorCount = 0;
          const errors: string[] = [];

          for (let i = 0; i < tilesToImport.length; i++) {
            const tile = tilesToImport[i];
            try {
              await createTile(tile);
              successCount++;

              // Update progress
              setImportProgress({
                current: i + 1,
                total: tilesToImport.length,
                status: `Imported ${i + 1} of ${tilesToImport.length} tiles...`,
                errors: [...errors]
              });
            } catch (error) {
              errorCount++;
              const errorMsg = error instanceof Error ? error.message : 'Unknown error';
              errors.push(`Failed to import "${tile.title}": ${errorMsg}`);
              console.error('Failed to import tile:', tile.title, error);

              // Update progress with error
              setImportProgress({
                current: i + 1,
                total: tilesToImport.length,
                status: `Imported ${i + 1} of ${tilesToImport.length} tiles... (${errorCount} errors)`,
                errors: [...errors]
              });
            }
          }

          // Final status
          if (errorCount === 0) {
            setImportProgress({
              current: tilesToImport.length,
              total: tilesToImport.length,
              status: `✅ Successfully imported ${successCount} tiles into category "${categoryName}"!`,
              errors: []
            });

            // Clear progress after delay
            setTimeout(() => {
              setImportProgress(null);
            }, 3000);
          } else {
            setImportProgress({
              current: tilesToImport.length,
              total: tilesToImport.length,
              status: `⚠️ Imported ${successCount} tiles, ${errorCount} failed.`,
              errors: errors
            });
          }

          // Refresh tiles from server (staging vs main)
          try {
            if (activeTab === 'staging') {
              const updatedStaging = await getTiles({ sourceTab: 'staging' });
              setStagingTiles(updatedStaging);
            } else {
              const updatedTiles = await getTiles();
              onUpdateTiles(updatedTiles);
            }
          } catch (error) {
            console.error('Failed to refresh tiles:', error);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          setImportProgress({
            current: 0,
            total: 0,
            status: `❌ Failed to import tiles: ${errorMsg}`,
            errors: []
          });
          console.error('Import error:', error);

          // Clear progress after delay
          setTimeout(() => {
            setImportProgress(null);
          }, 5000);
        }
      };
      input.click();
    },
    [isAuthenticated, onAuthRequired, onUpdateTiles, user, activeTab]
  );

  const API_BASE = resolveApiBase();

  const handleDownloadStagingTemplate = useCallback(async () => {
    if (!user?.is_admin) return;
    try {
      const res = await fetch(`${API_BASE}/tiles/staging-template`, { credentials: 'include' });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detail = typeof errBody.error === 'string' ? errBody.error : `HTTP ${res.status}`;
        throw new Error(
          detail === 'Template file not found'
            ? 'Template file not found on the server. Redeploy including staging-ai-import-template.csv at the app root.'
            : detail
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'linknest-staging-import-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Failed to download template.');
    }
  }, [user, API_BASE]);

  const handleDownloadStagingPrompt = useCallback(async () => {
    if (!user?.is_admin) return;
    try {
      const res = await fetch(`${API_BASE}/tiles/staging-prompt`, { credentials: 'include' });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detail = typeof errBody.error === 'string' ? errBody.error : `HTTP ${res.status}`;
        throw new Error(
          detail === 'Prompt guide file not found' || detail.toLowerCase().includes('not found')
            ? 'AI prompt guide not found on the server. Redeploy including staging-ai-prompt-guide.md at the app root.'
            : detail
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'linknest-staging-ai-prompt-guide.md';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Failed to download AI prompt guide.');
    }
  }, [user, API_BASE]);

  const focusStagingOfflineKit = useCallback(() => {
    stagingOfflineKitRef.current?.reveal();
  }, []);

  const handleDownloadBothStagingTemplates = useCallback(async () => {
    await handleDownloadStagingTemplate();
    await handleDownloadStagingPrompt();
  }, [handleDownloadStagingTemplate, handleDownloadStagingPrompt]);

  const handleStagingCsvToJson = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.is_admin) return;
    try {
      const data = await csvToJson(file) as Record<string, unknown>;
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'linknest-ai-import.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to convert CSV to JSON: ${msg}`);
    }
    e.target.value = '';
  }, [user]);

  const handleStagingImportJson = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.is_admin) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const parsed = parseSpaceExportObject(data);
      const normalizedTiles = normalizeImportedTiles(parsed);
      const tilesToImport = normalizedTiles.map(tile => ({ ...tile, sourceTab: 'staging' as const }));
      if (tilesToImport.length === 0) {
        alert('No tiles found in JSON.');
        e.target.value = '';
        return;
      }
      setImportProgress({ current: 0, total: tilesToImport.length, status: `Importing ${tilesToImport.length} tiles to Staging...`, errors: [] });
      let successCount = 0;
      const errors: string[] = [];
      for (let i = 0; i < tilesToImport.length; i++) {
        try {
          await createTile(tilesToImport[i]);
          successCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`"${tilesToImport[i].title}": ${msg}`);
        }
        setImportProgress({ current: i + 1, total: tilesToImport.length, status: `Imported ${i + 1} of ${tilesToImport.length}...`, errors: [...errors] });
      }
      setImportProgress({ current: tilesToImport.length, total: tilesToImport.length, status: `Imported ${successCount} tiles to Staging.`, errors });
      const updatedStaging = await getTiles({ sourceTab: 'staging' });
      setStagingTiles(updatedStaging);
      setTimeout(() => setImportProgress(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Import failed: ${msg}`);
    }
    e.target.value = '';
  }, [user]);

  const handleCloneCategory = useCallback(
    async (categoryName: string) => {
      if (!isAuthenticated) {
        if (onAuthRequired) onAuthRequired();
        return;
      }
      if (!user?.is_admin) {
        alert('Only administrators can clone categories.');
        return;
      }

      // Confirm with user
      if (!confirm(`Are you sure you want to clone the category "${categoryName}"?\n\nThis will create a copy of all tiles/spaces in this category.`)) {
        return;
      }

      try {
        const result = await cloneCategory(categoryName, activeTab === 'staging' ? { sourceTab: 'staging' } : undefined);

        // Refresh tiles from server
        try {
          if (activeTab === 'staging') {
            const updatedStaging = await getTiles({ sourceTab: 'staging' });
            setStagingTiles(updatedStaging);
          } else {
            const updatedTiles = await getTiles();
            onUpdateTiles(updatedTiles);
          }
        } catch (error) {
          console.error('Failed to refresh tiles:', error);
        }

        // Show success message
        if (result.errors.length === 0) {
          alert(`Successfully cloned category "${categoryName}" to "${result.newCategoryName}".\n\nCloned ${result.clonedCount} tile(s).`);
        } else {
          alert(
            `Category cloned with some errors.\n\n` +
            `Cloned ${result.clonedCount} tile(s) successfully.\n` +
            `Errors:\n${result.errors.join('\n')}`
          );
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        alert(`Failed to clone category: ${errorMsg}`);
        console.error('Clone category error:', error);
      }
    },
    [isAuthenticated, onAuthRequired, onUpdateTiles, user, activeTab]
  );

  const handleRenameCategory = useCallback(async (oldName: string, newName: string) => {
    if (!isAuthenticated) return;
    if (!newName.trim() || newName.trim() === oldName) return;

    const trimmedNewName = newName.trim();
    const sourceTiles = activeTab === 'staging' ? stagingTiles : tiles;

    try {
      // Update all tiles with the old category name to the new name
      const updatedTiles = sourceTiles.map(tile => {
        if ((tile.group || 'General') === oldName) {
          return { ...tile, group: trimmedNewName };
        }
        return tile;
      });

      // Update local state (staging vs main)
      if (activeTab === 'staging') {
        setStagingTiles(updatedTiles);
      } else {
        onUpdateTiles(updatedTiles);
      }

      // Update category order
      const newCategoryOrder = categoryOrder.map(cat =>
        cat === oldName ? trimmedNewName : cat
      );
      setCategoryOrder(newCategoryOrder);

      // Save updated arrangements
      try {
        // Save tile arrangement with updated category names
        const { arrangement, scope } = buildArrangementAndScope(updatedTiles);
        await saveTileArrangement(arrangement, scope);

        // Save category arrangement with renamed category
        if (newCategoryOrder.length > 0) {
          const categoryArrangement = newCategoryOrder.map((category, index) => ({
            categoryName: category,
            position: index,
            visibleFrom: categoryMetadata[category]?.visibleFrom || null,
            expiresAt: categoryMetadata[category]?.expiresAt || null
          }));
          await saveCategoryArrangement(categoryArrangement);
        }
      } catch (error) {
        console.error('Failed to save arrangements:', error);
        // Revert on error
        if (activeTab === 'staging') {
          setStagingTiles(stagingTiles);
        } else {
          onUpdateTiles(tiles);
        }
        setCategoryOrder(categoryOrder);
        alert('Failed to save category rename. Please try again.');
      }
    } catch (error) {
      console.error('Failed to rename category:', error);
      alert('Failed to rename category. Please try again.');
    }
  }, [tiles, stagingTiles, activeTab, isAuthenticated, onUpdateTiles, categoryOrder, categoryMetadata, buildArrangementAndScope]);

  const handleArchiveCategory = useCallback(async (categoryName: string) => {
    if (!isAuthenticated) return;

    const sourceTiles = activeTab === 'staging' ? stagingTiles : tiles;
    const categoryTiles = sourceTiles.filter(tile => (tile.group || 'General') === categoryName);

    if (categoryTiles.length === 0) {
      alert('Category is empty. Nothing to archive.');
      return;
    }

    try {
      // Archive all tiles in this category (scoped to staging when in staging tab)
      const result = await archiveCategory(categoryName, activeTab === 'staging' ? { sourceTab: 'staging' } : undefined);

      // Reload tiles and archive (staging vs main)
      if (activeTab === 'staging') {
        const updatedStaging = await getTiles({ sourceTab: 'staging' });
        setStagingTiles(updatedStaging);
      } else {
        const updatedTiles = await getTiles();
        onUpdateTiles(updatedTiles);
      }
      const updatedArchive = await getArchive();
      setArchiveTiles(updatedArchive);

      alert(`Successfully archived ${result.archivedCount} space(s) from category "${categoryName}".`);
    } catch (error) {
      console.error('Failed to archive category:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to archive category: ${errorMsg}`);
    }
  }, [tiles, stagingTiles, activeTab, isAuthenticated, onUpdateTiles]);

  const handleUnarchiveCategory = useCallback(async (categoryName: string) => {
    if (!isAuthenticated) return;

    try {
      // Unarchive all tiles in this category
      const result = await unarchiveCategory(categoryName);

      // Reload tiles and archive
      const updatedTiles = await getTiles();
      onUpdateTiles(updatedTiles);
      const updatedArchive = await getArchive();
      setArchiveTiles(updatedArchive);

      alert(`Successfully restored ${result.unarchivedCount} space(s) from category "${categoryName}".`);
    } catch (error) {
      console.error('Failed to unarchive category:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to restore category: ${errorMsg}`);
    }
  }, [isAuthenticated, onUpdateTiles]);

  const handleDeleteCategory = useCallback(async (categoryName: string) => {
    if (!isAuthenticated) return;

    // Get tiles from the appropriate source based on active tab
    let categoryTiles: Tile[];
    if (activeTab === 'archive') {
      // In archive view, get tiles from archiveTiles
      categoryTiles = archiveTiles.filter(tile => (tile.group || 'General') === categoryName);
    } else if (activeTab === 'staging') {
      // In staging view, get tiles from stagingTiles
      categoryTiles = stagingTiles.filter(tile => (tile.group || 'General') === categoryName);
    } else {
      // In normal view, get tiles from tiles
      categoryTiles = tiles.filter(tile => (tile.group || 'General') === categoryName);
    }

    if (categoryTiles.length === 0) {
      // No tiles in category, just remove the category
      const newCategoryOrder = categoryOrder.filter(cat => cat !== categoryName);
      setCategoryOrder(newCategoryOrder);
      if (newCategoryOrder.length > 0) {
        const categoryArrangement = newCategoryOrder.map((category, index) => ({
          categoryName: category,
          position: index
        }));
        await saveCategoryArrangement(categoryArrangement);
      } else {
        await saveCategoryArrangement([]);
      }
      return;
    }

    const isFromArchive = activeTab === 'archive';
    const confirmMessage = isFromArchive
      ? `Are you sure you want to delete the category "${categoryName}" from archive? This will move ${categoryTiles.length} tile(s) to the recycle bin.`
      : `Are you sure you want to delete the category "${categoryName}"? This will move ${categoryTiles.length} tile(s) to the recycle bin.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      // Initialize progress
      setDeleteCategoryProgress({
        current: 0,
        total: categoryTiles.length,
        status: 'Deleting tiles...',
        categoryName: categoryName
      });

      // Soft delete all tiles in this category (move to recycle bin) with progress tracking
      for (let i = 0; i < categoryTiles.length; i++) {
        await deleteTile(categoryTiles[i].id);
        setDeleteCategoryProgress(prev => prev ? {
          ...prev,
          current: i + 1,
          status: `Deleting tile ${i + 1} of ${categoryTiles.length}...`
        } : null);
      }

      // Update progress - removing category
      setDeleteCategoryProgress(prev => prev ? {
        ...prev,
        status: 'Removing category...'
      } : null);

      // Remove category from category order
      const newCategoryOrder = categoryOrder.filter(cat => cat !== categoryName);
      setCategoryOrder(newCategoryOrder);

      // Save category arrangement
      if (newCategoryOrder.length > 0) {
        const categoryArrangement = newCategoryOrder.map((category, index) => ({
          categoryName: category,
          position: index,
          visibleFrom: categoryMetadata[category]?.visibleFrom || null,
          expiresAt: categoryMetadata[category]?.expiresAt || null
        }));
        await saveCategoryArrangement(categoryArrangement);
      } else {
        await saveCategoryArrangement([]);
      }

      // Remove category metadata
      const newMetadata = { ...categoryMetadata };
      delete newMetadata[categoryName];
      setCategoryMetadata(newMetadata);

      // Update progress - reloading data
      setDeleteCategoryProgress(prev => prev ? {
        ...prev,
        status: 'Reloading data...'
      } : null);

      // Reload tiles, recycle bin, and archive (staging vs main)
      if (activeTab === 'staging') {
        const updatedStaging = await getTiles({ sourceTab: 'staging' });
        setStagingTiles(updatedStaging);
      } else {
        const updatedTiles = await getTiles();
        onUpdateTiles(updatedTiles);
      }

      // Always reload recycle bin to update the counter (tiles were moved to recycle bin)
      const updatedRecycleBin = await getRecycleBin();
      setRecycleBinTiles(updatedRecycleBin);

      // If deleting from archive, also reload archive
      if (activeTab === 'archive') {
        const updatedArchive = await getArchive();
        setArchiveTiles(updatedArchive);
      }

      // Clear progress after a short delay
      setTimeout(() => {
        setDeleteCategoryProgress(null);
      }, 500);
    } catch (error) {
      console.error('Failed to delete category:', error);
      setDeleteCategoryProgress(null);
      alert('Failed to delete category. Please try again.');
    }
  }, [tiles, archiveTiles, stagingTiles, isAuthenticated, onUpdateTiles, categoryOrder, categoryMetadata, activeTab]);

  const handleOpenCategorySchedule = useCallback((categoryName: string) => {
    const metadata = categoryMetadata[categoryName];
    setCategoryVisibleFrom(metadata?.visibleFrom ? new Date(metadata.visibleFrom).toISOString().slice(0, 16) : '');
    setCategoryExpiresAt(metadata?.expiresAt ? new Date(metadata.expiresAt).toISOString().slice(0, 16) : '');
    setEditingCategorySchedule(categoryName);
  }, [categoryMetadata]);

  const handleOpenManageVisibility = useCallback(async (categoryName: string) => {
    try {
      // Load users list
      const users = await authService.getUsers();
      setVisibilityUsers(users.map(u => ({ id: u.id, username: u.username })));
      setEditingCategoryVisibility(categoryName);
    } catch (error) {
      console.error('Failed to load users:', error);
      alert('Failed to load users. Please try again.');
    }
  }, []);

  const handleSaveVisibilityChanges = useCallback(async (visibilityChanges: Record<string, { visibility: TileVisibility; allowedUsers: number[] }>) => {
    if (!editingCategoryVisibility || !isAuthenticated) return;

    try {
      // Update each tile's visibility
      const updatePromises = Object.entries(visibilityChanges).map(async ([tileId, settings]) => {
        const tile = tiles.find(t => t.id === tileId);
        if (!tile) return;

        let updatedTile: Tile;

        // If tile has no decorations, automatically reset it to use global style manager styles
        if (!hasAnyDecorations(tile)) {
          // Reset all decorations (same as clicking "Reset All")
          updatedTile = resetTileDecorations(tile);
          updatedTile.visibility = settings.visibility;
          updatedTile.allowedUsers = settings.visibility === 'private' ? settings.allowedUsers : undefined;
        } else {
          // Tile has decorations - preserve them
          const decorationProps: Partial<Tile> = {};
          if (tile.tileBackgroundColor) decorationProps.tileBackgroundColor = tile.tileBackgroundColor;
          if (tile.tileGradientEnabled !== undefined && tile.tileGradientEnabled !== null) decorationProps.tileGradientEnabled = tile.tileGradientEnabled;
          if (tile.tileGradientColors && tile.tileGradientColors.length > 0) decorationProps.tileGradientColors = tile.tileGradientColors;
          if (tile.tileGradientColorPositions && tile.tileGradientColorPositions.length > 0) decorationProps.tileGradientColorPositions = tile.tileGradientColorPositions;
          if (tile.tileGradientDirection !== undefined && tile.tileGradientDirection !== null) decorationProps.tileGradientDirection = tile.tileGradientDirection;
          if (tile.tileGradientType) decorationProps.tileGradientType = tile.tileGradientType;
          if (tile.tileBorderRadius !== undefined && tile.tileBorderRadius !== null) decorationProps.tileBorderRadius = tile.tileBorderRadius;
          // Don't preserve #000000 (black) as it's effectively "no decoration" - tiles should use global style manager colors
          if (tile.tileTextColor && tile.tileTextColor.toLowerCase() !== '#000000' && tile.tileTextColor.toLowerCase() !== '000000') {
            decorationProps.tileTextColor = tile.tileTextColor;
          }

          updatedTile = {
            ...tile,
            visibility: settings.visibility,
            allowedUsers: settings.visibility === 'private' ? settings.allowedUsers : undefined,
            // Only include decoration properties if they have values
            ...decorationProps
          };
        }

        return saveTile(updatedTile);
      });

      await Promise.all(updatePromises.filter(p => p !== undefined));

      // Reload tiles
      const updatedTiles = await getTiles();
      onUpdateTiles(updatedTiles);

      setEditingCategoryVisibility(null);
    } catch (error) {
      console.error('Failed to save visibility changes:', error);
      alert('Failed to save visibility changes. Please try again.');
    }
  }, [editingCategoryVisibility, tiles, isAuthenticated, onUpdateTiles]);

  const handleSaveCategorySchedule = useCallback(async () => {
    if (!editingCategorySchedule || !isAuthenticated) return;

    try {
      const newMetadata = {
        ...categoryMetadata,
        [editingCategorySchedule]: {
          visibleFrom: categoryVisibleFrom.trim() || null,
          expiresAt: categoryExpiresAt.trim() || null
        }
      };

      // Remove entry if both dates are empty
      if (!categoryVisibleFrom.trim() && !categoryExpiresAt.trim()) {
        delete newMetadata[editingCategorySchedule];
      }

      setCategoryMetadata(newMetadata);

      // Save category arrangement with updated metadata
      const allCategories = [...categoryOrder];
      const arrangement = allCategories.map((category, index) => ({
        categoryName: category,
        position: index,
        visibleFrom: newMetadata[category]?.visibleFrom || null,
        expiresAt: newMetadata[category]?.expiresAt || null
      }));

      await saveCategoryArrangement(arrangement);
      setEditingCategorySchedule(null);
      setCategoryVisibleFrom('');
      setCategoryExpiresAt('');
    } catch (error) {
      console.error('Failed to save category schedule:', error);
      alert('Failed to save category schedule. Please try again.');
    }
  }, [editingCategorySchedule, categoryVisibleFrom, categoryExpiresAt, categoryMetadata, categoryOrder, isAuthenticated]);

  const handleMoveTile = useCallback(async (tileId: string, direction: 'left' | 'right') => {
    // Only authenticated users can move tiles
    if (!isAuthenticated) return;

    const sourceTiles = activeTab === 'staging' ? stagingTiles : tiles;
    const currentIndex = sourceTiles.findIndex(t => t.id === tileId);
    if (currentIndex === -1) return;

    const currentTile = sourceTiles[currentIndex];
    const currentGroup = currentTile.group || 'General';

    // Find all tiles in this group to determine the target
    const groupTiles = sourceTiles.filter(t => (t.group || 'General') === currentGroup);
    const indexInGroup = groupTiles.findIndex(t => t.id === tileId);

    if (indexInGroup === -1) return;

    // Calculate target index within the group
    const targetIndexInGroup = direction === 'left' ? indexInGroup - 1 : indexInGroup + 1;

    // Boundary checks within the group
    if (targetIndexInGroup < 0 || targetIndexInGroup >= groupTiles.length) {
      return;
    }

    // Find the target tile in the main array
    const targetTile = groupTiles[targetIndexInGroup];
    const targetIndex = sourceTiles.findIndex(t => t.id === targetTile.id);

    if (targetIndex === -1) return;

    // Swap the two tiles in the flat array
    const reorderedTiles = [...sourceTiles];
    [reorderedTiles[currentIndex], reorderedTiles[targetIndex]] = [
      reorderedTiles[targetIndex],
      reorderedTiles[currentIndex],
    ];

    // Update local state immediately for visual feedback (staging vs main)
    if (activeTab === 'staging') {
      setStagingTiles(reorderedTiles);
    } else {
      onUpdateTiles(reorderedTiles);
    }

    // Auto-save is kept for convenience, but manual save button provides reassurance
    try {
      const { arrangement, scope } = buildArrangementAndScope(reorderedTiles);
      await saveTileArrangement(arrangement, scope);
    } catch (error) {
      console.error('Failed to save tile arrangement:', error);
      // Don't alert on auto-save failure to avoid annoying popups,
      // let the user use the manual save button if needed.
    }
  }, [tiles, stagingTiles, activeTab, isAuthenticated, onUpdateTiles, buildArrangementAndScope]);

  const handleManualSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      let sourceTiles: Tile[];
      if (isPrivateScopeSave && Object.keys(groupedTiles).length > 0) {
        const flat: Tile[] = [];
        const ordered = categoryOrder.length > 0
          ? categoryOrder.filter((c) => groupedTiles[c]).concat(Object.keys(groupedTiles).filter((c) => !categoryOrder.includes(c)))
          : Object.keys(groupedTiles);
        ordered.forEach((cat) => flat.push(...(groupedTiles[cat] || [])));
        sourceTiles = flat;
      } else if (activeTab === 'staging') {
        sourceTiles = stagingTiles;
      } else {
        sourceTiles = tiles;
      }
      const { arrangement, scope } = buildArrangementAndScope(sourceTiles);
      await saveTileArrangement(arrangement, scope);
      alert('Tile order saved successfully!');
    } catch (error) {
      console.error('Failed to save tile arrangement:', error);
      alert('Failed to save tile order: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  }, [tiles, stagingTiles, activeTab, isSaving, isPrivateScopeSave, groupedTiles, categoryOrder, buildArrangementAndScope]);

  const handleShowTileInfo = useCallback((tile: Tile) => {
    setTileInfoDialog({ tile });
  }, []);

  const handleShowCategoryInfo = useCallback(async (categoryName: string, categoryTiles: Tile[]) => {
    // Determine category owner from oldest tile (first created in category)
    let categoryOwner: { userId: number | null; userUuid?: string | null; username: string | null; email: string | null; isAdmin: boolean } | undefined;

    if (categoryTiles.length > 0) {
      // Find oldest tile (first created)
      const oldestTile = categoryTiles.reduce((oldest, current) =>
        (!oldest || current.createdAt < oldest.createdAt) ? current : oldest
      );

      if (oldestTile.userId) {
        try {
          // Fetch owner info
          const API_BASE = import.meta.env.VITE_API_BASE || '/api';
          const response = await fetch(`${API_BASE}/auth/user/${oldestTile.userId}`, {
            credentials: 'include'
          });

          if (response.ok) {
            const userInfo = await response.json();
            categoryOwner = {
              userId: userInfo.userId,
              userUuid: userInfo.userUuid || null,
              username: userInfo.username,
              email: userInfo.email,
              isAdmin: userInfo.isAdmin || false
            };
          }
        } catch (err) {
          console.error('Failed to fetch category owner info:', err);
          // Fallback: just use userId
          categoryOwner = {
            userId: oldestTile.userId,
            userUuid: null,
            username: null,
            email: null,
            isAdmin: false
          };
        }
      }
    }

    setTileInfoDialog({
      categoryInfo: {
        categoryName,
        tileCount: categoryTiles.length,
        tiles: categoryTiles.map(t => ({
          id: t.id,
          title: t.title,
          userId: t.userId,
          createdAt: t.createdAt,
          canView: t.canView ?? false,
          canEdit: t.canEdit ?? false,
          canDelete: t.canDelete ?? false
        })),
        owner: categoryOwner
      }
    });
  }, []);

  const handleCloseTileInfoDialog = useCallback(() => {
    setTileInfoDialog(null);
  }, []);

  const handleToggleFavorite = useCallback(async (tileId: string) => {
    if (!isAuthenticated) {
      // For public users, toggle public favorites in localStorage
      togglePublicFavorite(tileId);
      // Update public favorites state to trigger re-render
      setPublicFavorites(getPublicFavorites());
      return;
    }

    try {
      const result = await toggleFavorite(tileId);
      // Update the tile's favorite status in local state
      const updatedTiles = tiles.map(tile =>
        tile.id === tileId
          ? { ...tile, isFavorite: result.isFavorite }
          : tile
      );
      onUpdateTiles(updatedTiles);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
      alert('Failed to update favorite. Please try again.');
    }
  }, [tiles, isAuthenticated, onUpdateTiles, onAuthRequired]);

  const handleExportPublicFavorites = useCallback(() => {
    try {
      exportPublicFavorites();
    } catch (error) {
      console.error('Failed to export public favorites:', error);
      alert('Failed to export favorites. Please try again.');
    }
  }, []);

  const handleImportPublicFavorites = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await importPublicFavorites(file);
      if (result.success) {
        // Update public favorites state immediately
        const updatedFavorites = getPublicFavorites();
        setPublicFavorites(updatedFavorites);

        // Ensure we're on the favorites tab to see the imported tiles
        if (activeTab !== 'public-favorites') {
          setActiveTab('public-favorites');
        }

        // Force a re-render by updating tiles (this ensures the filtered view updates)
        // The tiles themselves don't change, but this triggers the useMemo to recalculate
        onUpdateTiles([...tiles]);

        alert(result.message);
      } else {
        alert(`Import failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Failed to import public favorites:', error);
      alert('Failed to import favorites. Please ensure the file is a valid export.');
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [activeTab, tiles, onUpdateTiles]);

  const handleClearAllPublicFavorites = useCallback(() => {
    const tileCount = publicFavorites.length;
    const linkCount = favoriteLinks.length;
    const totalCount = tileCount + linkCount;

    if (totalCount === 0) {
      alert('No favorites to remove.');
      return;
    }

    const confirmMessage = `Are you sure you want to remove all ${totalCount} favorite(s)? This action will remove both favorite spaces and favorite links. This cannot be undone.`;
    if (window.confirm(confirmMessage)) {
      try {
        clearPublicFavorites();
        clearPublicLinkFavorites();
        // Update states immediately
        setPublicFavorites([]);
        setFavoriteLinks([]);
        alert(`Successfully removed all ${totalCount} favorite(s).`);
      } catch (error) {
        console.error('Failed to clear public favorites:', error);
        alert('Failed to clear favorites. Please try again.');
      }
    }
  }, [publicFavorites, favoriteLinks]);

  // Helper function to check if all tiles in a category are favorited
  const isCategoryFavorited = useCallback((categoryName: string): boolean => {
    const categoryTiles = tiles.filter(tile => (tile.group || 'General') === categoryName);
    if (categoryTiles.length === 0) return false;
    return categoryTiles.every(tile => tile.isFavorite === true);
  }, [tiles]);

  const handleToggleCategoryFavorite = useCallback(async (categoryName: string) => {
    if (!isAuthenticated) {
      if (onAuthRequired) onAuthRequired();
      return;
    }

    try {
      const result = await toggleCategoryFavorite(categoryName);

      // Update all tiles in the category with their new favorite status
      const updatedTiles = tiles.map(tile => {
        if ((tile.group || 'General') === categoryName) {
          return { ...tile, isFavorite: result.isFavorite };
        }
        return tile;
      });
      onUpdateTiles(updatedTiles);
    } catch (error) {
      console.error('Failed to toggle category favorite:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to update category favorites: ${errorMsg}`);
    }
  }, [tiles, isAuthenticated, onUpdateTiles, onAuthRequired]);

  // Render mobile view if on mobile device
  if (isMobile && activeTab !== 'monitoring') {
    return (
      <MobileTileView
        tiles={tiles}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onTileClick={handleTileClick}
        activeTab={activeTab}
        groupedTiles={groupedTiles}
        settings={settings}
        darkMode={darkMode}
        toggleTheme={toggleTheme}
        onHelpClick={onHelpClick}
        onTabChange={requestTab}
        isAuthenticated={isAuthenticated}
        disabledTabs={disabledAppTabs}
        onLoginClick={onAuthRequired}
        user={user}
        onToggleFavorite={handleToggleFavorite}
        onUpdateTiles={onUpdateTiles}
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Enhanced Hero Header Section */}
      <div className="linknest-hero-section relative overflow-hidden bg-gradient-to-br from-brand-50 via-violet-50 to-blue-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 border border-brand-200/50 dark:border-slate-700/50">
        {/* Animated background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="linknest-hero-orb-1 absolute -top-40 -right-40 w-80 h-80 rounded-full blur-3xl animate-pulse-slow"></div>
          <div className="linknest-hero-orb-2 absolute -bottom-40 -left-40 w-80 h-80 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
          <div className="linknest-hero-orb-3 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
        </div>
        <div className="linknest-hero-brand-overlay" aria-hidden="true" />

        {/* Content: stacked on small screens; title | controls side-by-side on large screens */}
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6">
          <div className="flex items-center gap-4 min-w-0 lg:flex-1">
            {settings.hero_icon ? (
              <div className="linknest-hero-icon w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-lg text-2xl flex-shrink-0">
                {settings.hero_icon}
              </div>
            ) : null}
            <div className="min-w-0">
              <h1 className="linknest-spaces-title text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white">
                {settings.spaces_title || 'My Spaces'}
              </h1>
              {settings.spaces_subtitle ? (
                <p className="linknest-spaces-subtitle mt-2 text-sm sm:text-base text-slate-600 dark:text-slate-300">
                  {settings.spaces_subtitle}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto lg:flex-shrink-0">
            {/* Enhanced Search Bar */}
            <div className="relative flex-1 sm:max-w-md lg:w-72 lg:flex-none min-w-0">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search spaces..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-white/50 dark:border-slate-700/50 rounded-xl pl-12 pr-10 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/10"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              )}
            </div>

            <div className="flex gap-2 justify-end flex-nowrap">
              {/* View Mode Toggle */}
              <div className="flex bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-white/50 dark:border-slate-700/50 rounded-xl p-1 shadow-sm gap-1 flex-shrink-0">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-all ${viewMode === 'grid'
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  title="Grid View"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
                    <path d="M3 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM3 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM4.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
                    <path d="M17 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM17 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM18.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setSelectedCategoryFilter(null);
                    setViewMode('categories');
                  }}
                  className={`p-2 rounded-lg transition-all ${viewMode === 'categories'
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  title="Categories View"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M2 3.75A.75.75 0 012.75 3h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 3.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.166a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Page background - admin only */}
              {user?.is_admin && (
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('openPageBackgroundDialog'))}
                  className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-white/50 dark:border-slate-700/50 shadow-sm"
                  title="Page background"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909.47.47a.75.75 0 11-1.06 1.06L2.53 8.091a.75.75 0 00-1.06 0l-2.97 2.97zM2.5 6.5v-.75a.75.75 0 01.75-.75h3a.75.75 0 01.75.75v.75h4.5v-.75a.75.75 0 01.75-.75h3a.75.75 0 01.75.75v.75h.75a.75.75 0 010 1.5h-15a.75.75 0 010-1.5h.75z" clipRule="evenodd" />
                  </svg>
                </button>
              )}

              {/* Tile Animation Selector - Available for all users */}
              <TileAnimationSelector
                onAnimationChange={(animation) => setCurrentAnimation(animation)}
                onDecorationChange={(decoration) => setCurrentDecoration(decoration)}
              />

              {isAuthenticated && (
                <button
                  onClick={() => {
                    setIsModalOpen(true);
                    if (user && !user.is_admin) {
                      setNewVisibility('private');
                      setNewAllowedUsers([user.id]);
                      setShowUserSelector(true);
                    }
                  }}
                  className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-brand-500/30 hover:shadow-xl hover:shadow-brand-500/40 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  New Space
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs — horizontal swipe/scroll, text labels stay (no wrap, no icon-only) */}
      <div
        className="flex items-center gap-1 sm:gap-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto overflow-y-hidden flex-nowrap overscroll-x-contain touch-pan-x [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5"
        role="tablist"
        aria-label="Space views"
      >
        {isAuthenticated && user?.is_admin && (
          <button
            onClick={() => requestTab('staging')}
            data-active={activeTab === 'staging'}
            title={APP_TAB_TOOLTIPS.staging}
            className={`linknest-spaces-tab px-4 py-2 whitespace-nowrap flex-shrink-0 ${activeTab === 'staging' ? 'active' : ''}`}
          >
            Staging
            {stagingTiles.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                {stagingTiles.length}
              </span>
            )}
          </button>
        )}
        {!disabledAppTabs.has('public') && (
          <button
            onClick={() => requestTab('public')}
            data-active={activeTab === 'public'}
            title={APP_TAB_TOOLTIPS.public}
            className={`linknest-spaces-tab px-4 py-2 whitespace-nowrap flex-shrink-0 ${activeTab === 'public' ? 'active' : ''}`}
          >
            Public
          </button>
        )}
        {isAuthenticated && !disabledAppTabs.has('your-apps') && (
          <button
            onClick={() => requestTab('your-apps')}
            data-active={activeTab === 'your-apps'}
            title={APP_TAB_TOOLTIPS['your-apps']}
            className={`linknest-spaces-tab px-4 py-2 whitespace-nowrap flex-shrink-0 ${activeTab === 'your-apps' ? 'active' : ''}`}
          >
            Your Apps
            {(() => {
              const roleBasedTiles = tiles.filter(t => t.visibility === 'authenticated' || t.hasRoleAccess ||
                t.tabs?.some(tab =>
                  tab.sections?.some(section => section.links?.some(link => link.hasRoleAccess)) ||
                  tab.links?.some(link => link.hasRoleAccess)
                )
              );
              return roleBasedTiles.length > 0 ? (
                <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                  {roleBasedTiles.length}
                </span>
              ) : null;
            })()}
          </button>
        )}
        {!isAuthenticated && !disabledAppTabs.has('favorites') && (
          <button
            onClick={() => requestTab('public-favorites')}
            data-active={activeTab === 'public-favorites'}
            title={APP_TAB_TOOLTIPS['public-favorites']}
            className={`linknest-spaces-tab px-4 py-2 whitespace-nowrap flex-shrink-0 ${activeTab === 'public-favorites' ? 'active' : ''}`}
          >
            Favorites
            {(publicFavoritesCount + favoriteLinks.length) > 0 && (
              <span className="ml-2 inline-flex items-center gap-1.5">
                {publicFavoritesCount > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                    {publicFavoritesCount} {publicFavoritesCount === 1 ? 'Space' : 'Spaces'}
                  </span>
                )}
                {favoriteLinks.length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                    {favoriteLinks.length} {favoriteLinks.length === 1 ? 'Link' : 'Links'}
                  </span>
                )}
              </span>
            )}
          </button>
        )}
        {/* Export/Import buttons for public favorites - only show when favorites tab is active */}
        {!isAuthenticated && !disabledAppTabs.has('favorites') && activeTab === 'public-favorites' && (
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-300 dark:border-slate-600 flex-shrink-0">
            <button
              onClick={handleExportPublicFavorites}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded transition-all"
              title="Export favorites to file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 2.955a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 001.09 1.03l2.955-2.955V13.25z" />
                <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
              </svg>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-all"
              title="Import favorites from file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.295a.75.75 0 00-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 2.955V2.75z" />
                <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportPublicFavorites}
              className="hidden"
            />
            <button
              onClick={handleClearAllPublicFavorites}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all"
              title="Remove all favorites"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
        {isAuthenticated && (
          <>
            {!disabledAppTabs.has('favorites') && (
              <button
                onClick={() => requestTab('favorites')}
                data-active={activeTab === 'favorites'}
                title={APP_TAB_TOOLTIPS.favorites}
                className={`linknest-spaces-tab px-4 py-2 whitespace-nowrap flex-shrink-0 ${activeTab === 'favorites' ? 'active' : ''}`}
              >
                Favorites
                {(favoriteTilesCount + favoriteLinks.length) > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1.5">
                    {favoriteTilesCount > 0 && (
                      <span className="px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                        {favoriteTilesCount} {favoriteTilesCount === 1 ? 'Space' : 'Spaces'}
                      </span>
                    )}
                    {favoriteLinks.length > 0 && (
                      <span className="px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full">
                        {favoriteLinks.length} {favoriteLinks.length === 1 ? 'Link' : 'Links'}
                      </span>
                    )}
                  </span>
                )}
              </button>
            )}
            {!disabledAppTabs.has('private') && (
              <button
                onClick={() => requestTab('private')}
                data-active={activeTab === 'private'}
                title={APP_TAB_TOOLTIPS.private}
                className={`linknest-spaces-tab px-4 py-2 whitespace-nowrap flex-shrink-0 ${activeTab === 'private' ? 'active' : ''}`}
              >
                Private
                {privateTilesCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                    {privateTilesCount}
                  </span>
                )}
              </button>
            )}
            {!disabledAppTabs.has('scheduled') && (
              <button
                onClick={() => requestTab('scheduled')}
                data-active={activeTab === 'scheduled'}
                title={APP_TAB_TOOLTIPS.scheduled}
                className={`linknest-spaces-tab px-4 py-2 whitespace-nowrap flex-shrink-0 ${activeTab === 'scheduled' ? 'active' : ''}`}
              >
                Scheduled
                {scheduledTilesCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                    {scheduledTilesCount}
                  </span>
                )}
              </button>
            )}
            {!disabledAppTabs.has('expired') && (
              <button
                onClick={() => requestTab('expired')}
                data-active={activeTab === 'expired'}
                title={APP_TAB_TOOLTIPS.expired}
                className={`linknest-spaces-tab px-4 py-2 whitespace-nowrap flex-shrink-0 ${activeTab === 'expired' ? 'active' : ''}`}
              >
                Expired
                {expiredTilesCount > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                    {expiredTilesCount}
                  </span>
                )}
              </button>
            )}
            {!disabledAppTabs.has('archive') && (
              <button
                onClick={() => requestTab('archive')}
                data-active={activeTab === 'archive'}
                title={APP_TAB_TOOLTIPS.archive}
                className={`linknest-spaces-tab px-4 py-2 whitespace-nowrap flex-shrink-0 ${activeTab === 'archive' ? 'active' : ''}`}
              >
                Archive
                {isAuthenticated && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                    {archiveTiles.length}
                  </span>
                )}
              </button>
            )}
            {isAuthenticated && !disabledAppTabs.has('monitoring') && (
              <button
                onClick={() => requestTab('monitoring')}
                title={APP_TAB_TOOLTIPS.monitoring}
                className={`linknest-spaces-tab px-4 py-2 whitespace-nowrap flex-shrink-0 ${activeTab === 'monitoring' ? 'active' : ''}`}
              >
                Monitoring
              </button>
            )}
            {isAuthenticated && !isTabDisabledBySettings('monitorv2') && (
              <button
                onClick={() => requestTab('monitorv2')}
                className={`linknest-spaces-tab px-4 py-2 whitespace-nowrap flex-shrink-0 ${activeTab === 'monitorv2' ? 'active' : ''}`}
                title={APP_TAB_TOOLTIPS.monitorv2}
              >
                Monitorv2
              </button>
            )}
            {!disabledAppTabs.has('recycle-bin') && (
              <button
                onClick={() => requestTab('recycle-bin')}
                data-active={activeTab === 'recycle-bin'}
                title={APP_TAB_TOOLTIPS['recycle-bin']}
                className={`linknest-spaces-tab px-4 py-2 whitespace-nowrap flex-shrink-0 ${activeTab === 'recycle-bin' ? 'active' : ''}`}
              >
                Recycle Bin
                {isAuthenticated && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
                    {recycleBinTiles.length}
                  </span>
                )}
              </button>
            )}
          </>
        )}
      </div>

      {/* Staging overview + AI Offline Kit (admin) */}
      {activeTab === 'staging' && isAuthenticated && user?.is_admin && (
        <>
          <StagingOverview
            spaceCount={stagingTiles.length}
            onDownloadTemplates={handleDownloadBothStagingTemplates}
            onFocusOfflineKit={focusStagingOfflineKit}
          />
          <StagingOfflineKit
            ref={stagingOfflineKitRef}
            onDownloadTemplate={handleDownloadStagingTemplate}
            onDownloadPrompt={handleDownloadStagingPrompt}
            onCsvFileChange={handleStagingCsvToJson}
            onJsonFileChange={handleStagingImportJson}
          />
        </>
      )}

      {/* Your Apps overview + filter actions */}
      {activeTab === 'your-apps' && isAuthenticated && (
        <>
          <YourAppsOverview
            spaceCount={Object.values(groupedTiles).reduce((acc: number, group: Tile[]) => acc + group.length, 0)}
            onSelectFilter={setYourAppsFilter}
          />
          <div className="flex items-center gap-2 py-3 px-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
            <button
              onClick={() => setYourAppsFilter('authenticated')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${yourAppsFilter === 'authenticated'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              title={YOUR_APPS_FILTER_TOOLTIPS.authenticated}
            >
              <span className="text-xs">🔒</span>
              Authenticated
            </button>
            <button
              onClick={() => setYourAppsFilter('assigned')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${yourAppsFilter === 'assigned'
                ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              title={YOUR_APPS_FILTER_TOOLTIPS.assigned}
            >
              <span className="text-xs">👤</span>
              Your Assigned Apps
            </button>
          </div>
        </>
      )}

      {/* Private overview + sub-tabs: Spaces | Sharing | Blocked + Filter (when Spaces) */}
      {activeTab === 'private' && isAuthenticated && (
        <>
          <PrivateOverview
            spaceCount={
              privateSubTab === 'spaces'
                ? Object.values(groupedTiles).reduce((acc: number, group: Tile[]) => acc + group.length, 0)
                : 0
            }
            pendingInvitationsCount={pendingInvitationsCount}
            onSelectSubTab={setPrivateSubTab}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPrivateSubTab('spaces')}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${privateSubTab === 'spaces'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm border border-slate-200 dark:border-slate-600'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                  }`}
                title={PRIVATE_SUBTAB_TOOLTIPS.spaces}
              >
                Spaces
              </button>
              <button
                onClick={() => setPrivateSubTab('sharing')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${privateSubTab === 'sharing'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm border border-slate-200 dark:border-slate-600'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                  }`}
                title={PRIVATE_SUBTAB_TOOLTIPS.sharing}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden>
                  <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                  <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
                </svg>
                Sharing
                {pendingInvitationsCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                    {pendingInvitationsCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setPrivateSubTab('blocked')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${privateSubTab === 'blocked'
                  ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm border border-slate-200 dark:border-slate-600'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                  }`}
                title={PRIVATE_SUBTAB_TOOLTIPS.blocked}
              >
                Blocked
                {blockedUsersCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200">
                    {blockedUsersCount}
                  </span>
                )}
              </button>
            </div>
            {/* Filter by owner - inline in same bar when Spaces sub-tab */}
            {privateSubTab === 'spaces' && (
              <PrivateOwnerFilterDropdown
                value={privateOwnerFilter}
                options={privateOwnerOptions}
                onSelect={(v) => setPrivateOwnerFilter(v)}
                userCount={privateOwnerOptions.length}
              />
            )}
          </div>
        </>
      )}

      {/* Private tab - Sharing sub-tab: pending invitations */}
      {activeTab === 'private' && isAuthenticated && privateSubTab === 'sharing' && (
        <SharedTileNotifications
          onAccept={() => { getTiles().then(t => onUpdateTiles(t, false)); loadPendingInvitationsCount(); }}
          onReject={() => { loadPendingInvitationsCount(); }}
        />
      )}

      {/* Private tab - Blocked sub-tab: users you blocked */}
      {activeTab === 'private' && isAuthenticated && privateSubTab === 'blocked' && (
        <BlockedUsersSection onUnblock={() => { getTiles().then(t => onUpdateTiles(t, false)); loadBlockedUsersCount(); }} />
      )}

      {/* Scheduled overview */}
      {activeTab === 'scheduled' && isAuthenticated && (
        <ScheduledOverview
          spaceCount={Object.values(groupedTiles).reduce((acc: number, group: Tile[]) => acc + group.length, 0)}
        />
      )}

      {/* Expired overview */}
      {activeTab === 'expired' && isAuthenticated && (
        <ExpiredOverview
          spaceCount={Object.values(groupedTiles).reduce((acc: number, group: Tile[]) => acc + group.length, 0)}
        />
      )}

      {/* Archive overview + actions */}
      {activeTab === 'archive' && isAuthenticated && (
        <>
          <ArchiveOverview spaceCount={archiveTiles.length} />
          <div className="flex items-center justify-between py-3 px-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {isLoadingArchive ? (
                'Loading archive...'
              ) : archiveTiles.length === 0 ? (
                'Archive is empty'
              ) : (
                `${archiveTiles.length} space(s) in archive`
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setIsLoadingArchive(true);
                  try {
                    const updatedTiles = await getArchive();
                    setArchiveTiles(updatedTiles);
                  } catch (error) {
                    console.error('Failed to refresh archive:', error);
                  } finally {
                    setIsLoadingArchive(false);
                  }
                }}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-1.5"
                title="Refresh archive"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-1.281z" clipRule="evenodd" />
                </svg>
                Refresh
              </button>
              {archiveTiles.length > 0 && user?.is_admin && (
                <button
                  onClick={handlePurgeArchive}
                  className="px-4 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="Move all archived spaces to recycle bin"
                >
                  Delete All
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Recycle Bin overview + actions */}
      {activeTab === 'recycle-bin' && isAuthenticated && (
        <>
          <RecycleBinOverview spaceCount={recycleBinTiles.length} />
          <div className="flex items-center justify-between py-3 px-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {isLoadingRecycleBin ? (
                'Loading recycle bin...'
              ) : recycleBinTiles.length === 0 ? (
                'Recycle bin is empty'
              ) : (
                `${recycleBinTiles.length} space(s) in recycle bin`
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setIsLoadingRecycleBin(true);
                  try {
                    const updatedTiles = await getRecycleBin();
                    setRecycleBinTiles(updatedTiles);
                  } catch (error) {
                    console.error('Failed to refresh recycle bin:', error);
                  } finally {
                    setIsLoadingRecycleBin(false);
                  }
                }}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-1.5"
                title="Refresh recycle bin"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-1.281z" clipRule="evenodd" />
                </svg>
                Refresh
              </button>
              {recycleBinTiles.length > 0 && (
                <button
                  onClick={handlePurgeRecycleBin}
                  className="px-4 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                >
                  Purge All
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Compact Stats Bar - hide when on Private sub-tabs Sharing/Blocked */}
      {tiles.length > 0 && !(activeTab === 'private' && privateSubTab !== 'spaces') && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <span>{Object.keys(groupedTiles).length} {Object.keys(groupedTiles).length === 1 ? 'Category' : 'Categories'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500"></div>
            <span>{Object.values(groupedTiles).reduce((acc: number, group: Tile[]) => acc + group.length, 0)} {Object.values(groupedTiles).reduce((acc: number, group: Tile[]) => acc + group.length, 0) === 1 ? 'Space' : 'Spaces'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500"></div>
            <span>{Object.values(groupedTiles).flat().reduce((acc: number, t: Tile) => {
              if (t.isHyperlink) return acc;
              const uniqueLinks = new Set<string>();
              const processLink = (link: any) => {
                const key = `${(link.label || '').toLowerCase()}|${(link.url || '').toLowerCase()}`;
                uniqueLinks.add(key);
              };

              if (t.tabs && t.tabs.length > 0) {
                t.tabs.forEach(tab => {
                  tab.sections?.forEach(section => {
                    section.links?.forEach(processLink);
                  });
                });
              } else {
                t.sections?.forEach(section => {
                  section.links?.forEach(processLink);
                });
              }
              return acc + uniqueLinks.size;
            }, 0)} Links</span>
          </div>
        </div>
      )}

      {/* Show All Categories Button - appears when a category filter is active */}
      {selectedCategoryFilter && viewMode === 'grid' && !(activeTab === 'private' && privateSubTab !== 'spaces') && (
        <div className="mb-4">
          <button
            onClick={() => setSelectedCategoryFilter(null)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z" clipRule="evenodd" />
            </svg>
            Show All Categories
            <span className="px-2 py-0.5 text-xs bg-slate-200 dark:bg-slate-700 rounded-full">
              Filtering: {selectedCategoryFilter}
            </span>
          </button>
        </div>
      )}


      {/* Favorite Links Section - Component */}
      {(() => {
        const favoriteLinksSection = (activeTab === 'favorites' || activeTab === 'public-favorites') && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-500">
                  <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                </svg>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Favorite Links</h2>
                <span className="text-sm text-slate-500 dark:text-slate-400">({favoriteLinks.length})</span>
              </div>
            </div>

            {/* Sub-row for Sort, Position, and Monitoring Controls */}
            <div className="flex items-center gap-4 mb-4">
              {/* Sort Controls */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Sort:</span>
                <button
                  onClick={() => handleSetFavLinksSort(favLinksSort === 'default' ? 'asc' : favLinksSort === 'asc' ? 'desc' : 'default')}
                  className={`p-1.5 rounded-lg transition-all ${favLinksSort !== 'default'
                    ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  title={favLinksSort === 'asc' ? "Sorted ascending (Click for descending)" : favLinksSort === 'desc' ? "Sorted descending (Click to reset)" : "Sort ascending"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform ${favLinksSort === 'desc' ? 'rotate-180' : ''}`}>
                    <path fillRule="evenodd" d="M2.24 6.8a.75.75 0 001.06-.04l1.95-2.1v8.59a.75.75 0 001.5 0V4.66l1.95 2.1a.75.75 0 101.1-1.02l-3.25-3.5a.75.75 0 00-1.1 0L2.2 5.74a.75.75 0 00.04 1.06zm8 4a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5zm0-4a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5zm0 8a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Reorder Controls */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Position:</span>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                  <button
                    onClick={() => handleSetFavoriteLinksAbove(true)}
                    className={`px-2 py-1 text-xs rounded transition-all ${favoriteLinksAbove
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
                    onClick={() => handleSetFavoriteLinksAbove(false)}
                    className={`px-2 py-1 text-xs rounded transition-all ${!favoriteLinksAbove
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

              {/* Monitoring Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportStats}
                  className="flex items-center justify-center w-8 h-8 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-all shadow-sm hover:shadow-md"
                  title="Export stats to CSV"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
                    <path fillRule="evenodd" d="M3 4.5A1.5 1.5 0 014.5 3h11A1.5 1.5 0 0117 4.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 15.5v-11zM4.5 4.5v11h11v-11h-11z" clipRule="evenodd" />
                    <path fillRule="evenodd" d="M10 13a.75.75 0 01-.75-.75V7.56l-1.72 1.72a.75.75 0 01-1.06-1.06l3-3a.75.75 0 011.06 0l3 3a.75.75 0 11-1.06 1.06l-1.72-1.72v4.69A.75.75 0 0110 13z" clipRule="evenodd" />
                  </svg>
                </button>

                <button
                  onClick={handleForceRefresh}
                  disabled={isCheckingHealth}
                  className={`flex items-center justify-center w-8 h-8 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-all shadow-sm hover:shadow-md disabled:opacity-50 ${isCheckingHealth ? 'animate-spin' : ''}`}
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
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="transparent" strokeDasharray={2 * Math.PI * 10} strokeDashoffset={isAutoRefreshEnabled ? (2 * Math.PI * 10) * (1 - refreshCountdown / autoRefreshInterval) : (2 * Math.PI * 10)} className={`${isAutoRefreshEnabled ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'} transition-all duration-1000 ease-linear`} strokeLinecap="round" />
                    </svg>
                    <button onClick={() => setIsAutoRefreshEnabled(!isAutoRefreshEnabled)} className="absolute inset-0 flex items-center justify-center" title={isAutoRefreshEnabled ? "Disable auto-refresh" : "Enable auto-refresh"}>
                      <div className={`w-1.5 h-1.5 rounded-full ${isAutoRefreshEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                    </button>
                  </div>
                  <select value={autoRefreshInterval} onChange={(e) => setAutoRefreshInterval(Number(e.target.value))} disabled={!isAutoRefreshEnabled} className="bg-transparent text-[10px] font-medium text-slate-600 dark:text-slate-400 border-none focus:ring-0 cursor-pointer disabled:opacity-50 pr-2 pl-0">
                    <option value={10}>10s</option>
                    <option value={30}>30s</option>
                    <option value={60}>1m</option>
                    <option value={180}>3m</option>
                    <option value={300}>5m</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[...favoriteLinks]
                .sort((a, b) => {
                  if (favLinksSort === 'asc') {
                    return a.label.localeCompare(b.label);
                  }
                  if (favLinksSort === 'desc') {
                    return b.label.localeCompare(a.label);
                  }
                  return 0;
                })
                .map((link, linkIndex) => {
                  // Resolve effective browser (Link specific > Tile default > System default)
                  const parentTile = tiles.find(t => t.id === link.tile.id);
                  const browserToUse = (link.browser && link.browser !== 'default')
                    ? link.browser
                    : (parentTile?.browser && parentTile.browser !== 'default' ? parentTile.browser : null);

                  const animationClass = getTileAnimationClass(currentAnimation);
                  const decorationClass = getTileDecorationClass(currentDecoration);
                  const fullAnimationClass = `${animationClass} ${decorationClass}`.trim();
                  const animationDelay = (linkIndex * 50);
                  const tileAnimatedClass = animationClass ? 'linknest-tile-animated' : '';

                  // Get health check result for this link (ssh:// / vnc:// are never probed)
                  const skipHealth = isSshLinkUrl(link.url) || isVncLinkUrl(link.url);
                  const healthResult = skipHealth ? undefined : linkHealthResults.get(link.id);
                  const healthStatus = healthResult?.health?.status || 'unknown';
                  const latency = healthResult?.latency;
                  const httpCode = healthResult?.health?.httpCode;

                  return (
                    <div
                      key={link.id}
                      className={`group relative flex items-center gap-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-amber-300 dark:hover:border-amber-500/50 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer ${fullAnimationClass} ${tileAnimatedClass} overflow-hidden`}
                      style={{ animationDelay: `${animationDelay}ms` }}
                      onClick={(e) => {
                        if (tryHandleSshLinkClick(link.url, e)) return;
                        if (tryHandleVncLinkClick(link.url, e)) return;

                        // If Ctrl/Cmd key is held, always open in default browser (override configured browser)
                        if (e.ctrlKey || e.metaKey) {
                          e.preventDefault();
                          e.stopPropagation();
                          if (link.richTextContent) {
                            setLinkInfoDialog({ link: link as Link });
                            return;
                          }
                          const newWindow = window.open(link.url, '_blank', 'noopener,noreferrer');
                          if (newWindow) newWindow.focus();
                          return;
                        }

                        // If link has rich text content (Information Content), show dialog instead of opening URL
                        if (link.richTextContent) {
                          e.preventDefault();
                          e.stopPropagation();
                          setLinkInfoDialog({ link: link as Link });
                          return;
                        }

                        if (settings.browser_specific_links_enabled === '1' && browserToUse) {
                          e.preventDefault();
                          e.stopPropagation();
                          openLinkInBrowser(link.url, browserToUse);
                          return;
                        }

                        // Default behavior
                        window.open(link.url, '_blank');
                      }}
                    >
                      {/* Shark Fin Health Indicator - Top Left Corner */}
                      {healthResult && (
                        <div
                          className="absolute -top-[1px] -left-[1px] w-4 h-4 z-20 pointer-events-none overflow-hidden"
                          title={`Health Status: ${healthStatus.toUpperCase()}${httpCode ? ` (HTTP ${httpCode})` : ''}\n\n${healthResult.serverLatency ? `Server Check Time: ${favoriteLinkHealthService.formatLatency(healthResult.serverLatency)}\n(Time taken by server to check URL via cURL)` : ''}${latency ? `\n\nClient Roundtrip Time: ${favoriteLinkHealthService.formatLatency(latency)}\n(Total time from browser to server and back)` : ''}\n\nDifference = Network overhead + API processing`}
                        >
                          <div
                            className="absolute -top-2 -left-2 w-5 h-5 rotate-45"
                            style={{
                              backgroundColor: (healthStatus === 'healthy' || healthStatus === 'accessible' || healthStatus === 'restricted') ? '#10b981' :
                                healthStatus === 'broken' ? '#ef4444' :
                                  (healthStatus === 'timeout' || healthStatus === 'redirected' || healthStatus === 'unknown' || healthStatus === 'checking') ? '#f59e0b' : '#f59e0b'
                            }}
                          />
                        </div>
                      )}

                      {/* Link Icon */}
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center shrink-0 text-lg border border-slate-200 dark:border-slate-700">
                        {link.icon || '🔗'}
                      </div>

                      {/* Link Info */}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                          {stripHtml(link.label)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }} title={link.url}>
                          {getDisplayUrl(link.url)}
                        </div>
                        {/* Browser Indicator */}
                        {settings.browser_specific_links_enabled === '1' && browserToUse && (
                          <div className="text-[10px] text-blue-500 dark:text-blue-400 transition-colors mt-0.5" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            ({formatBrowserName(browserToUse)} browser)
                          </div>
                        )}
                        {/* Parent Tile Info */}
                        <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
                          <span className="text-xs shrink-0">{link.tile.emoji}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1">
                            {stripHtml(link.tile.title)}
                          </span>
                        </div>
                      </div>

                      {/* Latency and Status Code - Bottom Right Corner */}
                      {healthResult && (healthResult.serverLatency || latency || httpCode) && (
                        <div
                          className="absolute bottom-1 right-1 text-[10px] text-slate-400 dark:text-slate-500 opacity-60 font-mono cursor-help"
                          title={`Health Check Results:\n${healthResult.serverLatency ? `Server Check: ${favoriteLinkHealthService.formatLatency(healthResult.serverLatency)} (Time for server to check URL)` : ''}${httpCode ? `\nServer Response Code: ${httpCode}` : ''}${latency ? `\n\nClient Roundtrip: ${favoriteLinkHealthService.formatLatency(latency)} (Total time from browser)` : ''}${httpCode ? `\nClient Response Code: ${httpCode}` : ''}\n\nStatus: ${healthStatus.toUpperCase()}`}
                        >
                          {/* Server latency (code) */}
                          {healthResult.serverLatency !== undefined ? (
                            <span>
                              {favoriteLinkHealthService.formatLatency(healthResult.serverLatency)}
                              {httpCode && `(${httpCode})`}
                            </span>
                          ) : null}
                          {/* Separator */}
                          {healthResult.serverLatency !== undefined && latency && <span className="mx-1">|</span>}
                          {/* Client latency (code) */}
                          {latency && (
                            <span>
                              {favoriteLinkHealthService.formatLatency(latency)}
                              {httpCode && `(${httpCode})`}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Action bar: View notes (Information) + Unfavorite */}
                      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50 z-20">
                        {link.notes && link.notes.trim() && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFavNotesDialogState({ linkId: link.id, notes: link.notes || '', linkLabel: link.label || '' });
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
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (isAuthenticated) {
                              const { toggleLinkFavorite } = await import('../services/storageService');
                              await toggleLinkFavorite(link.id);
                              const links = await getFavoriteLinks();
                              setFavoriteLinks(links);
                            } else {
                              togglePublicLinkFavorite(link.id);
                              removePublicLinkFavoriteDetail(link.id);
                              const favIds = getPublicLinkFavorites();
                              if (favIds.length === 0) {
                                setFavoriteLinks([]);
                              } else {
                                const cached = getPublicLinkFavoriteDetails().map((detail) => ({
                                  ...detail,
                                  isFavorite: true as const
                                }));
                                setFavoriteLinks(cached);
                                resolveFavoriteLinks(favIds).then((resolved) => {
                                  if (resolved.length > 0) {
                                    syncPublicLinkFavoriteDetails(resolved);
                                    setFavoriteLinks(resolved);
                                  }
                                }).catch(() => { /* keep cached */ });
                              }
                            }
                          }}
                          className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                          title="Remove from favorites"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        );

        // Render favorite links above if favoriteLinksAbove is true
        return favoriteLinksAbove ? favoriteLinksSection : null;
      })()}

      {activeTab === 'monitoring' && (
        <>
          <MonitoringOverview hasMonitorv2={!isTabDisabledBySettings('monitorv2')} />
          <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Loading monitoring…</div>}>
            <MonitoringDashboard />
          </Suspense>
        </>
      )}
      {activeTab === 'monitorv2' && (
        <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Loading monitoring…</div>}>
          <Monitorv2Dashboard />
        </Suspense>
      )}

      {/* Categories View */}
      {viewMode === 'categories' && activeTab !== 'monitoring' && activeTab !== 'monitorv2' && !(activeTab === 'private' && privateSubTab !== 'spaces') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20 mt-6">
          {Object.keys(groupedTiles).map((groupName) => {
            const groupTiles = groupedTiles[groupName];
            const activeTabNameMap: Record<string, string> = {
              'your-apps': 'Your Apps',
              'public': 'Public',
              'staging': 'Staging',
              'favorites': 'Favorites',
              'private': 'Private',
              'scheduled': 'Scheduled',
              'expired': 'Expired',
              'archive': 'Archive',
              'recycle-bin': 'Recycle Bin',
              'monitoring': 'Monitoring',
              'public-favorites': 'Favorites'
            };

            const tabSuffix = activeTabNameMap[activeTab] || activeTab.charAt(0).toUpperCase() + activeTab.slice(1);

            return (
              <div key={groupName} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-40 relative overflow-hidden group cursor-pointer" onClick={() => {
                // Set the category filter and switch to grid view to show only this category
                setSelectedCategoryFilter(groupName);
                setViewMode('grid');
              }}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-50 dark:bg-brand-900/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 group-hover:bg-brand-100 dark:group-hover:bg-brand-900/20 transition-colors"></div>

                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                        <path d="M2 3.75A.75.75 0 012.75 3h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 3.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.166a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zm0 4.167a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white truncate flex-1" title={groupName}>{groupName}</h3>
                    {isAuthenticated && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleShowCategoryInfo(groupName, groupTiles);
                        }}
                        className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-all opacity-0 group-hover:opacity-100"
                        title="Show category information"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 pl-1">{groupTiles.length} {groupTiles.length === 1 ? 'Space' : 'Spaces'}</p>
                </div>

                <div className="relative z-10 flex justify-end mt-auto">
                  <span className="text-xs font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-700/50 px-2.5 py-1.5 rounded-md border border-slate-100 dark:border-slate-700">
                    {tabSuffix}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tiles Grid - Full Width with More Columns */}
      <div className={activeTab === 'monitoring' || activeTab === 'monitorv2' || viewMode === 'categories' || (activeTab === 'private' && privateSubTab !== 'spaces') ? 'hidden' : ''}>
        {Object.keys(groupedTiles).map((groupName, groupIndex) => {
          const groupTiles = groupedTiles[groupName];
          // Use the actual display order (which respects categoryOrder)
          const categoryKeys = Object.keys(groupedTiles);
          const canMoveUp = groupIndex > 0;
          const canMoveDown = groupIndex < categoryKeys.length - 1;

          return (
            <Category
              key={groupName}
              categoryName={groupName}
              tileCount={groupTiles.length}
              isAuthenticated={isAuthenticated}
              groupIndex={groupIndex}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              onMoveUp={() => handleMoveCategory(groupName, 'up')}
              onMoveDown={() => handleMoveCategory(groupName, 'down')}
              onDeleteCategory={activeTab !== 'recycle-bin' && (activeTab !== 'your-apps' || user?.is_admin) ? handleDeleteCategory : undefined}
              onArchiveCategory={activeTab !== 'recycle-bin' && activeTab !== 'archive' && (activeTab !== 'your-apps' || user?.is_admin) ? handleArchiveCategory : undefined}
              onUnarchiveCategory={activeTab === 'archive' ? handleUnarchiveCategory : undefined}
              onPermanentDeleteCategory={activeTab === 'recycle-bin' ? handlePermanentDeleteCategory : undefined}
              isRecycleBin={activeTab === 'recycle-bin'}
              isArchive={activeTab === 'archive'}
              onSaveCategoryOrder={handleManualSave}
              onRenameCategory={handleRenameCategory}
              onExportCategory={handleExportCategory}
              onImportCategory={handleImportCategory}
              onCloneCategory={handleCloneCategory}
              onToggleCategoryFavorite={(activeTab !== 'your-apps' || user?.is_admin) ? handleToggleCategoryFavorite : undefined}
              isCategoryFavorited={isCategoryFavorited(groupName)}
              onScheduleCategory={handleOpenCategorySchedule}
              onManageVisibility={handleOpenManageVisibility}
              onShowCategoryInfo={handleShowCategoryInfo}
              categoryTiles={groupTiles}
              animationClass={`${getTileAnimationClass(currentAnimation)} ${getTileDecorationClass(currentDecoration)}`.trim()}
            >
              {/* Grid with wider tiles */}
              {groupTiles.length > 0 ? (
                <div className="linknest-tile-grid">
                  {groupTiles.map((tile, tileIndex) => {
                    const canMoveLeft = tileIndex > 0;
                    const canMoveRight = tileIndex < groupTiles.length - 1;

                    return (
                      <SortableTile
                        key={tile.id}
                        tile={tile}
                        isAuthenticated={isAuthenticated}
                        onTileClick={handleTileClick}
                        onDeleteTile={handleDeleteTile}
                        onCloneTile={handleCloneTile}
                        onEditTile={handleOpenEditModal}
                        onToggleFavorite={handleToggleFavorite}
                        onMoveToCategory={handleMoveTileToCategory}
                        onMoveLeft={() => handleMoveTile(tile.id, 'left')}
                        onMoveRight={() => handleMoveTile(tile.id, 'right')}
                        onExportTile={handleExportTile}
                        onRestoreTile={activeTab === 'recycle-bin' ? handleRestoreTile : undefined}
                        onPermanentDeleteTile={activeTab === 'recycle-bin' ? handlePermanentDeleteTile : undefined}
                        onArchiveTile={activeTab !== 'archive' && activeTab !== 'recycle-bin' ? handleArchiveTile : undefined}
                        onUnarchiveTile={activeTab === 'archive' ? handleUnarchiveTile : undefined}
                        isRecycleBin={activeTab === 'recycle-bin'}
                        isArchive={activeTab === 'archive'}
                        canMoveLeft={canMoveLeft}
                        canMoveRight={canMoveRight}
                        availableCategories={isAuthenticated && !user?.is_admin && activeTab === 'private'
                          ? allCategories.filter(cat => tiles.some(t => (t.group || 'General') === cat && (t.visibility === 'authenticated' || (t.visibility === 'private' && t.allowedUsers?.includes(user?.id || 0)))))
                          : allCategories
                        }
                        onShowTileInfo={handleShowTileInfo}
                        onShareTile={handleOpenShareDialog}
                        onRemoveSharedTile={handleRemoveSharedTile}
                        onBlockSharer={handleBlockSharer}
                        groupIndex={groupIndex}
                        tileIndex={tileIndex}
                        animationClass={`${getTileAnimationClass(currentAnimation)} ${getTileDecorationClass(currentDecoration)}`.trim()}
                        ownerLookup={activeTab === 'private' && isAuthenticated ? Object.fromEntries(privateTabUsers.map(u => [u.id, u.username])) : undefined}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-sm italic">
                  No tiles in this category. Use the menu to move tiles here.
                </div>
              )}
            </Category>
          );
        })}

        {/* Compact Empty State */}
        {tiles.length === 0 && isAuthenticated && (
          <div
            onClick={() => setIsModalOpen(true)}
            className="group flex flex-col items-center justify-center h-48 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-400 dark:hover:border-brand-500 transition-all cursor-pointer hover:bg-gradient-to-br hover:from-brand-50/50 hover:to-transparent dark:hover:from-brand-500/5 dark:hover:to-transparent"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-500/20 dark:to-brand-600/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <span className="text-2xl">✨</span>
            </div>
            <p className="font-semibold text-sm mb-1">Create your first space</p>
            <p className="text-xs">Click here to get started</p>
          </div>
        )}

        {/* Compact No Results State */}
        {tiles.length > 0 && Object.keys(groupedTiles).length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-slate-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1">No spaces found</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Try adjusting your search terms</p>
            <button
              onClick={() => setSearchTerm('')}
              className="text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 text-sm font-medium underline"
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      {/* Matching Links Section - Shown when searching */}
      {
        activeTab !== 'monitoring' && activeTab !== 'monitorv2' && searchTerm.trim() && (() => {
          const searchLower = searchTerm.toLowerCase();
          type MatchingLink = {
            id: string;
            label: string;
            url: string;
            icon?: string;
            browser?: string | null;
            health?: any;
            richTextContent?: string;
            tile: {
              id: string;
              title: string;
              emoji: string;
              themeColor: string;
              browser?: string | null;
            };
          };

          // Collect all links that match the search term across both tabs and sections
          // Use a Map to ensure unique links based on label and URL
          const uniqueLinksMap = new Map<string, MatchingLink>();

          Object.values(groupedTiles).forEach((groupTiles: Tile[]) => {
            groupTiles.forEach(tile => {
              // Helper to process a list of sections
              const processSections = (sections: LinkSection[]) => {
                sections.forEach(section => {
                  section.links?.forEach(link => {
                    const uniqueKey = `${link.label.toLowerCase()}|${link.url.toLowerCase()}`;

                    // Only process/add if we haven't seen this specific link yet
                    if (
                      !uniqueLinksMap.has(uniqueKey) &&
                      (link.label.toLowerCase().includes(searchLower))
                    ) {
                      uniqueLinksMap.set(uniqueKey, {
                        id: link.id,
                        label: link.label,
                        url: link.url,
                        icon: link.icon,
                        browser: link.browser,
                        health: link.health,
                        richTextContent: link.richTextContent,
                        tile: {
                          id: tile.id,
                          title: tile.title,
                          emoji: tile.emoji || '✨',
                          themeColor: tile.themeColor || 'blue',
                          browser: tile.browser
                        }
                      });
                    }
                  });
                });
              };

              // Process deprecated sections
              if (tile.sections) {
                processSections(tile.sections);
              }
              // Process sections within tabs
              if (tile.tabs) {
                tile.tabs.forEach(tab => {
                  if (tab.sections) {
                    processSections(tab.sections);
                  }
                });
              }
            });
          });

          // Convert back to array
          const matchingLinks = Array.from(uniqueLinksMap.values());
          if (matchingLinks.length === 0) return null;

          return (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-500">
                  <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                  <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01-.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                </svg>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Matching Links</h2>
                <span className="text-sm text-slate-500 dark:text-slate-400">({matchingLinks.length})</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {matchingLinks.map((link, linkIndex) => {
                  // Resolve effective browser (Link specific > Tile default > System default)
                  const browserToUse = (link.browser && link.browser !== 'default')
                    ? link.browser
                    : (link.tile.browser && link.tile.browser !== 'default' ? link.tile.browser : null);

                  const animationClass = getTileAnimationClass(currentAnimation);
                  const decorationClass = getTileDecorationClass(currentDecoration);
                  const fullAnimationClass = `${animationClass} ${decorationClass}`.trim();
                  const animationDelay = (linkIndex * 50);
                  const tileAnimatedClass = animationClass ? 'linknest-tile-animated' : '';

                  return (
                    <div
                      key={link.id}
                      className={`group relative flex items-center gap-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-brand-300 dark:hover:border-brand-500/50 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer ${fullAnimationClass} ${tileAnimatedClass}`}
                      style={{ animationDelay: `${animationDelay}ms` }}
                      onClick={(e) => {
                        if (tryHandleSshLinkClick(link.url, e)) return;
                        if (tryHandleVncLinkClick(link.url, e)) return;

                        // If Ctrl/Cmd key is held, always open in default browser (override configured browser)
                        if (e.ctrlKey || e.metaKey) {
                          e.preventDefault();
                          e.stopPropagation();
                          // If rich text content exists, still show dialog on Ctrl/Cmd
                          if (link.richTextContent) {
                            setLinkInfoDialog({ link: link as Link });
                            return;
                          }
                          const newWindow = window.open(link.url, '_blank', 'noopener,noreferrer');
                          if (newWindow) newWindow.focus();
                          return;
                        }

                        // If link has rich text content, show dialog instead of opening URL
                        if (link.richTextContent) {
                          e.preventDefault();
                          e.stopPropagation();
                          setLinkInfoDialog({ link: link as Link });
                          return;
                        }

                        if (settings.browser_specific_links_enabled === '1' && browserToUse) {
                          e.preventDefault();
                          e.stopPropagation();
                          openLinkInBrowser(link.url, browserToUse);
                          return;
                        }

                        // Default behavior
                        window.open(link.url, '_blank');
                      }}
                    >
                      {/* Health Status Indicator (HTTP(S) only — skip ssh:// / vnc://) */}
                      {link.health && !isSshLinkUrl(link.url) && !isVncLinkUrl(link.url) && (
                        <div className="shrink-0">
                          <div
                            className={`w-2 h-2 rounded-full ${linkHealthService.getHealthColor(link.health.status)}`}
                            title={`${linkHealthService.getHealthLabel(link.health.status)}${link.health.error ? `: ${link.health.error}` : ''}`}
                          />
                        </div>
                      )}

                      {/* Link Icon */}
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center shrink-0 text-lg border border-slate-200 dark:border-slate-700">
                        {link.icon || '🔗'}
                      </div>

                      {/* Link Info */}
                      <div className="flex-1 min-w-0 overflow-hidden pr-10">
                        <div className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {stripHtml(link.label)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }} title={link.url}>
                          {getDisplayUrl(link.url)}
                        </div>
                        {/* Browser Indicator */}
                        {settings.browser_specific_links_enabled === '1' && browserToUse && (
                          <div className="text-[10px] text-blue-500 dark:text-blue-400 transition-colors mt-0.5" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                            ({formatBrowserName(browserToUse)} browser)
                          </div>
                        )}
                        {/* Parent Tile Info */}
                        <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
                          <span className="text-xs shrink-0">{link.tile.emoji}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{stripHtml(link.tile.title)}</span>
                        </div>
                      </div>

                      {/* Favorite Button */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (isAuthenticated) {
                            const { toggleLinkFavorite } = await import('../services/storageService');
                            await toggleLinkFavorite(link.id);
                            // Reload favorite links
                            const links = await getFavoriteLinks();
                            setFavoriteLinks(links);
                          } else {
                            const nowFavorite = togglePublicLinkFavorite(link.id);
                            if (nowFavorite) {
                              upsertPublicLinkFavoriteDetail({
                                id: link.id,
                                label: link.label,
                                url: link.url,
                                icon: link.icon,
                                textColor: undefined,
                                visibility: undefined,
                                notes: undefined,
                                tooltip: undefined,
                                browser: link.browser,
                                richTextContent: link.richTextContent,
                                health: link.health,
                                tile: {
                                  id: link.tile.id,
                                  title: link.tile.title,
                                  emoji: link.tile.emoji || '✨',
                                  themeColor: link.tile.themeColor || 'blue'
                                }
                              });
                            } else {
                              removePublicLinkFavoriteDetail(link.id);
                            }
                            const favIds = getPublicLinkFavorites();
                            if (favIds.length === 0) {
                              setFavoriteLinks([]);
                            } else {
                              const cached = getPublicLinkFavoriteDetails().map((detail) => ({
                                ...detail,
                                isFavorite: true as const
                              }));
                              setFavoriteLinks(cached);
                              resolveFavoriteLinks(favIds).then((resolved) => {
                                if (resolved.length > 0) {
                                  syncPublicLinkFavoriteDetails(resolved);
                                  setFavoriteLinks(resolved);
                                }
                              }).catch(() => { /* keep cached */ });
                            }
                          }
                        }}
                        className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all z-10 ${(isAuthenticated ? favoriteLinks.some(fl => fl.id === link.id) : getPublicLinkFavorites().includes(link.id))
                          ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                          : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                          }`}
                        title={(isAuthenticated ? favoriteLinks.some(fl => fl.id === link.id) : getPublicLinkFavorites().includes(link.id)) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill={(isAuthenticated ? favoriteLinks.some(fl => fl.id === link.id) : getPublicLinkFavorites().includes(link.id)) ? 'currentColor' : 'none'} stroke="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()
      }

      {/* Favorite Links Section - Shown below tiles if favoriteLinksAbove is false */}
      {
        (() => {
          const favoriteLinksSection = (activeTab === 'favorites' || activeTab === 'public-favorites') && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-500">
                    <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                  </svg>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Favorite Links</h2>
                  <span className="text-sm text-slate-500 dark:text-slate-400">({favoriteLinks.length})</span>
                </div>
              </div>

              {/* Sub-row for Sort, Position, and Monitoring Controls */}
              <div className="flex items-center gap-4 mb-4">
                {/* Sort Controls */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Sort:</span>
                  <button
                    onClick={() => handleSetFavLinksSort(favLinksSort === 'default' ? 'asc' : favLinksSort === 'asc' ? 'desc' : 'default')}
                    className={`p-1.5 rounded-lg transition-all ${favLinksSort !== 'default'
                      ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                      }`}
                    title={favLinksSort === 'asc' ? "Sorted ascending (Click for descending)" : favLinksSort === 'desc' ? "Sorted descending (Click to reset)" : "Sort ascending"}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform ${favLinksSort === 'desc' ? 'rotate-180' : ''}`}>
                      <path fillRule="evenodd" d="M2.24 6.8a.75.75 0 001.06-.04l1.95-2.1v8.59a.75.75 0 001.5 0V4.66l1.95 2.1a.75.75 0 101.1-1.02l-3.25-3.5a.75.75 0 00-1.1 0L2.2 5.74a.75.75 0 00.04 1.06zm8 4a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5zm0-4a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5zm0 8a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                {/* Reorder Controls */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Position:</span>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                    <button
                      onClick={() => handleSetFavoriteLinksAbove(true)}
                      className={`px-2 py-1 text-xs rounded transition-all ${favoriteLinksAbove
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
                      onClick={() => handleSetFavoriteLinksAbove(false)}
                      className={`px-2 py-1 text-xs rounded transition-all ${!favoriteLinksAbove
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

                {/* Monitoring Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportStats}
                    className="flex items-center justify-center w-8 h-8 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-all shadow-sm hover:shadow-md"
                    title="Export stats to CSV"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
                      <path fillRule="evenodd" d="M3 4.5A1.5 1.5 0 014.5 3h11A1.5 1.5 0 0117 4.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 15.5v-11zM4.5 4.5v11h11v-11h-11z" clipRule="evenodd" />
                      <path fillRule="evenodd" d="M10 13a.75.75 0 01-.75-.75V7.56l-1.72 1.72a.75.75 0 01-1.06-1.06l3-3a.75.75 0 011.06 0l3 3a.75.75 0 11-1.06 1.06l-1.72-1.72v4.69A.75.75 0 0110 13z" clipRule="evenodd" />
                    </svg>
                  </button>

                  <button
                    onClick={handleForceRefresh}
                    disabled={isCheckingHealth}
                    className={`flex items-center justify-center w-8 h-8 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-all shadow-sm hover:shadow-md disabled:opacity-50 ${isCheckingHealth ? 'animate-spin' : ''}`}
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
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="transparent" strokeDasharray={2 * Math.PI * 10} strokeDashoffset={isAutoRefreshEnabled ? (2 * Math.PI * 10) * (1 - refreshCountdown / autoRefreshInterval) : (2 * Math.PI * 10)} className={`${isAutoRefreshEnabled ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'} transition-all duration-1000 ease-linear`} strokeLinecap="round" />
                      </svg>
                      <button onClick={() => setIsAutoRefreshEnabled(!isAutoRefreshEnabled)} className="absolute inset-0 flex items-center justify-center" title={isAutoRefreshEnabled ? "Disable auto-refresh" : "Enable auto-refresh"}>
                        <div className={`w-1.5 h-1.5 rounded-full ${isAutoRefreshEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                      </button>
                    </div>
                    <select value={autoRefreshInterval} onChange={(e) => setAutoRefreshInterval(Number(e.target.value))} disabled={!isAutoRefreshEnabled} className="bg-transparent text-[10px] font-medium text-slate-600 dark:text-slate-400 border-none focus:ring-0 cursor-pointer disabled:opacity-50 pr-2 pl-0">
                      <option value={10}>10s</option>
                      <option value={30}>30s</option>
                      <option value={60}>1m</option>
                      <option value={180}>3m</option>
                      <option value={300}>5m</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {[...favoriteLinks]
                  .sort((a, b) => {
                    if (favLinksSort === 'asc') {
                      return a.label.localeCompare(b.label);
                    }
                    if (favLinksSort === 'desc') {
                      return b.label.localeCompare(a.label);
                    }
                    return 0;
                  })
                  .map((link, linkIndex) => {
                    // Resolve effective browser (Link specific > Tile default > System default)
                    const parentTile = tiles.find(t => t.id === link.tile.id);
                    const browserToUse = (link.browser && link.browser !== 'default')
                      ? link.browser
                      : (parentTile?.browser && parentTile.browser !== 'default' ? parentTile.browser : null);

                    const animationClass = getTileAnimationClass(currentAnimation);
                    const decorationClass = getTileDecorationClass(currentDecoration);
                    const fullAnimationClass = `${animationClass} ${decorationClass}`.trim();
                    const animationDelay = (linkIndex * 50);
                    const tileAnimatedClass = animationClass ? 'linknest-tile-animated' : '';

                    // Get health check result for this link (ssh:// / vnc:// are never probed)
                    const skipHealth = isSshLinkUrl(link.url) || isVncLinkUrl(link.url);
                    const healthResult = skipHealth ? undefined : linkHealthResults.get(link.id);
                    const healthStatus = healthResult?.health?.status || 'unknown';
                    const latency = healthResult?.latency;
                    const httpCode = healthResult?.health?.httpCode;

                    return (
                      <div
                        key={link.id}
                        className={`group relative flex items-center gap-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-amber-300 dark:hover:border-amber-500/50 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer ${fullAnimationClass} ${tileAnimatedClass} overflow-hidden`}
                        style={{ animationDelay: `${animationDelay}ms` }}
                        onClick={(e) => {
                          if (tryHandleSshLinkClick(link.url, e)) return;
                          if (tryHandleVncLinkClick(link.url, e)) return;

                          // If Ctrl/Cmd key is held, always open in default browser (override configured browser)
                          if (e.ctrlKey || e.metaKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            if (link.richTextContent) {
                              setLinkInfoDialog({ link: link as Link });
                              return;
                            }
                            const newWindow = window.open(link.url, '_blank', 'noopener,noreferrer');
                            if (newWindow) newWindow.focus();
                            return;
                          }

                          // If link has rich text content (Information Content), show dialog instead of opening URL
                          if (link.richTextContent) {
                            e.preventDefault();
                            e.stopPropagation();
                            setLinkInfoDialog({ link: link as Link });
                            return;
                          }

                          if (settings.browser_specific_links_enabled === '1' && browserToUse) {
                            e.preventDefault();
                            e.stopPropagation();
                            openLinkInBrowser(link.url, browserToUse);
                            return;
                          }

                          // Default behavior
                          window.open(link.url, '_blank');
                        }}
                      >
                        {/* Shark Fin Health Indicator - Top Left Corner */}
                        {healthResult && (
                          <div
                            className="absolute -top-[1px] -left-[1px] w-4 h-4 z-20 pointer-events-none overflow-hidden"
                            title={`Health Status: ${healthStatus.toUpperCase()}${httpCode ? ` (HTTP ${httpCode})` : ''}\n\n${healthResult.serverLatency ? `Server Check Time: ${favoriteLinkHealthService.formatLatency(healthResult.serverLatency)}\n(Time taken by server to check URL via cURL)` : ''}${latency ? `\n\nClient Roundtrip Time: ${favoriteLinkHealthService.formatLatency(latency)}\n(Total time from browser to server and back)` : ''}\n\nDifference = Network overhead + API processing`}
                          >
                            <div
                              className="absolute -top-2 -left-2 w-5 h-5 rotate-45"
                              style={{
                                backgroundColor: (healthStatus === 'healthy' || healthStatus === 'accessible' || healthStatus === 'restricted') ? '#10b981' :
                                  healthStatus === 'broken' ? '#ef4444' :
                                    (healthStatus === 'timeout' || healthStatus === 'redirected' || healthStatus === 'unknown' || healthStatus === 'checking') ? '#f59e0b' : '#f59e0b'
                              }}
                            />
                          </div>
                        )}

                        {/* Link Icon */}
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center shrink-0 text-lg border border-slate-200 dark:border-slate-700">
                          {link.icon || '🔗'}
                        </div>

                        {/* Link Info */}
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            {stripHtml(link.label)}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }} title={link.url}>
                            {getDisplayUrl(link.url)}
                          </div>
                          {/* Browser Indicator */}
                          {settings.browser_specific_links_enabled === '1' && browserToUse && (
                            <div className="text-[10px] text-blue-500 dark:text-blue-400 transition-colors mt-0.5" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                              ({formatBrowserName(browserToUse)} browser)
                            </div>
                          )}
                          {/* Parent Tile Info */}
                          <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
                            <span className="text-xs shrink-0">{link.tile.emoji}</span>
                            <span className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{stripHtml(link.tile.title)}</span>
                          </div>
                        </div>

                        {/* Latency and Status Code - Bottom Right Corner */}
                        {healthResult && (healthResult.serverLatency || latency || httpCode) && (
                          <div
                            className="absolute bottom-1 right-1 text-[10px] text-slate-400 dark:text-slate-500 opacity-60 font-mono cursor-help"
                            title={`Health Check Results:\n${healthResult.serverLatency ? `Server Check: ${favoriteLinkHealthService.formatLatency(healthResult.serverLatency)} (Time for server to check URL)` : ''}${httpCode ? `\nServer Response Code: ${httpCode}` : ''}${latency ? `\n\nClient Roundtrip: ${favoriteLinkHealthService.formatLatency(latency)} (Total time from browser)` : ''}${httpCode ? `\nClient Response Code: ${httpCode}` : ''}\n\nStatus: ${healthStatus.toUpperCase()}`}
                          >
                            {/* Server latency (code) */}
                            {healthResult.serverLatency !== undefined ? (
                              <span>
                                {favoriteLinkHealthService.formatLatency(healthResult.serverLatency)}
                                {httpCode && `(${httpCode})`}
                              </span>
                            ) : null}
                            {/* Separator */}
                            {healthResult.serverLatency !== undefined && latency && <span className="mx-1">|</span>}
                            {/* Client latency (code) */}
                            {latency && (
                              <span>
                                {favoriteLinkHealthService.formatLatency(latency)}
                                {httpCode && `(${httpCode})`}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Action bar: View notes (Information) + Unfavorite */}
                        <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm p-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50 z-20">
                          {link.notes && link.notes.trim() && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFavNotesDialogState({ linkId: link.id, notes: link.notes || '', linkLabel: link.label || '' });
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
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (isAuthenticated) {
                                const { toggleLinkFavorite } = await import('../services/storageService');
                                await toggleLinkFavorite(link.id);
                                const links = await getFavoriteLinks();
                                setFavoriteLinks(links);
                              } else {
                                togglePublicLinkFavorite(link.id);
                                removePublicLinkFavoriteDetail(link.id);
                                const favIds = getPublicLinkFavorites();
                                if (favIds.length === 0) {
                                  setFavoriteLinks([]);
                                } else {
                                  const cached = getPublicLinkFavoriteDetails().map((detail) => ({
                                    ...detail,
                                    isFavorite: true as const
                                  }));
                                  setFavoriteLinks(cached);
                                  resolveFavoriteLinks(favIds).then((resolved) => {
                                    if (resolved.length > 0) {
                                      syncPublicLinkFavoriteDetails(resolved);
                                      setFavoriteLinks(resolved);
                                    }
                                  }).catch(() => { /* keep cached */ });
                                }
                              }
                            }}
                            className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                            title="Remove from favorites"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                              <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          );

          // Render favorite links below if favoriteLinksAbove is false
          return !favoriteLinksAbove ? favoriteLinksSection : null;
        })()
      }

      {/* Compact Add Tile Modal */}
      {
        isModalOpen && createPortal(
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
            <div className="absolute inset-0 bg-transparent" style={{ zIndex: 99998 }} onClick={() => setIsModalOpen(false)}></div>
            <div
              ref={modalRef}
              className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl p-6 relative shadow-2xl animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col ${isDragging ? 'cursor-move' : ''} ${isDragging || isResizing ? 'will-change-transform' : ''}`}
              style={{
                zIndex: 99999,
                width: modalSize.width > 0 ? `${modalSize.width}px` : '600px',
                maxWidth: '90vw',
                minWidth: '400px',
                height: modalSize.height > 0 ? `${modalSize.height}px` : '700px',
                maxHeight: '90vh',
                minHeight: '300px',
                left: modalPosition.x > 0 ? `${modalPosition.x}px` : 'auto',
                top: modalPosition.y > 0 ? `${modalPosition.y}px` : 'auto',
                position: modalPosition.x > 0 || modalPosition.y > 0 ? 'absolute' : 'relative',
                transition: isDragging || isResizing ? 'none' : undefined
              }}
            >
              <SpaceModalHeader
                emoji={tileType === 'hyperlink' ? '🔗' : '✨'}
                eyebrow={tileType === 'hyperlink' ? 'New Hyperlink' : 'New Space'}
                title={tileType === 'hyperlink' ? 'Create Hyperlink' : 'Create New Space'}
                subtitle={tileType === 'hyperlink' ? 'Add a direct link tile to your board' : 'Organize your links into a beautiful space'}
                onClose={() => setIsModalOpen(false)}
                onMouseDown={handleDragStart}
              />

              <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                <div className="space-y-4 pr-2">
                  <FormSection emoji="📋" title="Basics" accent="sky">
                  {/* Title */}
                  <div>
                    <FormLabel emoji="🏷️">Title</FormLabel>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g., Design Resources"
                      className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 placeholder-slate-400 transition-all"
                    />
                  </div>

                  {/* Type Selection */}
                  <div>
                    <FormLabel emoji="🧩">Type</FormLabel>
                    <div className="space-y-2">
                      <label className={`flex items-center gap-2.5 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${tileType === 'space' ? 'border-sky-300 bg-sky-50/80 dark:border-sky-700 dark:bg-sky-950/30' : 'border-slate-200 dark:border-slate-700 hover:bg-white/70 dark:hover:bg-slate-800/50'}`}>
                        <input
                          type="radio"
                          name="tileType"
                          value="space"
                          checked={tileType === 'space'}
                          onChange={(e) => {
                            setTileType(e.target.value as 'space' | 'hyperlink');
                            if (e.target.value === 'space') {
                              setNewEmoji('📁'); // Reset to folder for space
                            }
                          }}
                          className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300"><span aria-hidden="true">📁</span> Space — create a space with links and sections</span>
                      </label>
                      <label className={`flex items-center gap-2.5 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${tileType === 'hyperlink' ? 'border-indigo-300 bg-indigo-50/80 dark:border-indigo-700 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700 hover:bg-white/70 dark:hover:bg-slate-800/50'}`}>
                        <input
                          type="radio"
                          name="tileType"
                          value="hyperlink"
                          checked={tileType === 'hyperlink'}
                          onChange={(e) => {
                            setTileType(e.target.value as 'space' | 'hyperlink');
                            if (e.target.value === 'hyperlink') {
                              setNewEmoji('🔗'); // Set default link emoji
                              // Set default visibility: private for authenticated non-admin users, public for admins
                              if (user && !user.is_admin && isAuthenticated) {
                                setNewVisibility('private');
                              } else if (!user || user.is_admin) {
                                setNewVisibility('public');
                              }
                            } else {
                              setNewEmoji('📁'); // Reset to folder for space
                            }
                          }}
                          className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300"><span aria-hidden="true">🔗</span> Hyperlink — direct link to a URL</span>
                      </label>
                    </div>
                  </div>
                  </FormSection>

                  {/* Hyperlink URL - Only shown when type is hyperlink */}
                  {tileType === 'hyperlink' && (
                    <FormSection emoji="🔗" title="Hyperlink Details" accent="indigo">
                    <>
                      <div>
                        <FormLabel emoji="🌐">URL</FormLabel>
                        <input
                          type="url"
                          value={hyperlinkUrl}
                          onChange={(e) => setHyperlinkUrl(e.target.value)}
                          placeholder="https://example.com"
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Open Link</label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="openInNewTab"
                              value="new"
                              checked={openInNewTab === true}
                              onChange={() => setOpenInNewTab(true)}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Open in new tab</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="openInNewTab"
                              value="same"
                              checked={openInNewTab === false}
                              onChange={() => setOpenInNewTab(false)}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Open in same tab</span>
                          </label>
                        </div>
                      </div>

                      {/* Category - Also shown for hyperlinks */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Category</label>
                        <input
                          type="text"
                          value={newGroup}
                          onChange={(e) => setNewGroup(e.target.value)}
                          placeholder="Select or create a category (e.g., Work, Personal)"
                          list="category-suggestions-hyperlink"
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                        />
                        <datalist id="category-suggestions-hyperlink">
                          {userOwnedCategories.map(cat => <option key={cat} value={cat} />)}
                        </datalist>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select an existing category or type a new name to create one</p>
                      </div>

                    {/* Visibility Settings - For hyperlinks */}
                      <div>
                        <FormLabel emoji="👁️">Visibility</FormLabel>
                        <div className="space-y-2">
                          {/* Public - Only for admins */}
                          {user && user.is_admin && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="visibility-hyperlink"
                                value="public"
                                checked={newVisibility === 'public'}
                                onChange={(e) => {
                                  setNewVisibility(e.target.value as TileVisibility);
                                  setShowUserSelector(false);
                                }}
                                className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                              />
                              <span className="text-sm text-slate-700 dark:text-slate-300">Public - Available for everyone (guests and logged in users)</span>
                            </label>
                          )}
                          {/* Authenticated - Only for admins */}
                          {user && user.is_admin && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="visibility-hyperlink"
                                value="authenticated"
                                checked={newVisibility === 'authenticated'}
                                onChange={(e) => {
                                  setNewVisibility(e.target.value as TileVisibility);
                                  setShowUserSelector(false);
                                }}
                                className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                              />
                              <span className="text-sm text-slate-700 dark:text-slate-300">Authenticated - Available for logged in users only</span>
                            </label>
                          )}
                          {/* Private - For admins and authenticated users */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="visibility-hyperlink"
                              value="private"
                              checked={newVisibility === 'private'}
                              onChange={(e) => {
                                setNewVisibility(e.target.value as TileVisibility);
                                setShowUserSelector(true);
                              }}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Private - Available for specific users only</span>
                          </label>
                        </div>

                        {/* User and Group Selector for Private Visibility */}
                        {newVisibility === 'private' && isAuthenticated && (
                          <div className="mt-3 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            {/* Tabs */}
                            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                              <button
                                type="button"
                                onClick={() => setVisibilityActiveTab('users')}
                                className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${visibilityActiveTab === 'users'
                                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                  }`}
                              >
                                USERS ({newAllowedUsers.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setVisibilityActiveTab('groups')}
                                className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${visibilityActiveTab === 'groups'
                                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                  }`}
                              >
                                GROUPS ({newAllowedGroups.length})
                              </button>
                            </div>

                            {/* Search Input */}
                            <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={visibilitySearchTerm}
                                  onChange={(e) => setVisibilitySearchTerm(e.target.value)}
                                  placeholder={`Search ${visibilityActiveTab}...`}
                                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pl-9 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                {visibilitySearchTerm && (
                                  <button
                                    type="button"
                                    onClick={() => setVisibilitySearchTerm('')}
                                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Content */}
                            <div className="max-h-64 overflow-y-auto p-2 bg-white dark:bg-slate-800">
                              {visibilityActiveTab === 'users' && (
                                isLoadingUsers ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading users...</div>
                                ) : safeAvailableUsers.length === 0 ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users available</div>
                                ) : (
                                  <div className="space-y-1">
                                    {safeAvailableUsers
                                      .filter(u => {
                                        const searchLower = visibilitySearchTerm.toLowerCase();
                                        return u.username.toLowerCase().includes(searchLower) ||
                                          u.email?.toLowerCase().includes(searchLower);
                                      })
                                      .map(u => {
                                        const isCurrentUserOwner = user && u.id === user.id;
                                        return (
                                          <label
                                            key={u.id}
                                            className={`flex items-center gap-2 p-2 rounded ${isCurrentUserOwner
                                              ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 cursor-not-allowed'
                                              : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50'
                                              }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={newAllowedUsers.includes(u.id) || isCurrentUserOwner}
                                              disabled={isCurrentUserOwner}
                                              onChange={(e) => {
                                                if (isCurrentUserOwner) return;
                                                if (e.target.checked) {
                                                  setNewAllowedUsers([...newAllowedUsers, u.id]);
                                                } else {
                                                  setNewAllowedUsers(newAllowedUsers.filter(id => id !== u.id));
                                                }
                                              }}
                                              className={`w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded ${isCurrentUserOwner ? 'opacity-50 cursor-not-allowed' : ''
                                                }`}
                                            />
                                            <span className={`text-sm flex-1 ${isCurrentUserOwner
                                              ? 'text-amber-800 dark:text-amber-200 font-medium'
                                              : 'text-slate-700 dark:text-slate-300'
                                              }`}>
                                              {u.username}
                                            </span>
                                            {isCurrentUserOwner && (
                                              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-semibold uppercase">
                                                Owner (You)
                                              </span>
                                            )}
                                            {u.auth_source && u.auth_source !== 'local' && (
                                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
                                                {u.auth_source.toUpperCase()}
                                              </span>
                                            )}
                                          </label>
                                        );
                                      })}
                                    {safeAvailableUsers.filter(u => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return u.username.toLowerCase().includes(searchLower) ||
                                        u.email?.toLowerCase().includes(searchLower);
                                    }).length === 0 && (
                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users found</div>
                                      )}
                                  </div>
                                )
                              )}

                              {visibilityActiveTab === 'groups' && (
                                isLoadingGroups ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading groups...</div>
                                ) : safeAvailableGroups.length === 0 ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups available</div>
                                ) : (
                                  <div className="space-y-1">
                                    {safeAvailableGroups
                                      .filter(g => {
                                        const searchLower = visibilitySearchTerm.toLowerCase();
                                        return g.name.toLowerCase().includes(searchLower) ||
                                          (g.description || '').toLowerCase().includes(searchLower);
                                      })
                                      .map(g => (
                                        <label
                                          key={g.id}
                                          className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={newAllowedGroups.includes(g.id)}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setNewAllowedGroups([...newAllowedGroups, g.id]);
                                              } else {
                                                setNewAllowedGroups(newAllowedGroups.filter(id => id !== g.id));
                                              }
                                            }}
                                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded"
                                          />
                                          <div className="flex-1">
                                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{g.name}</div>
                                            {g.description && (
                                              <div className="text-xs text-slate-500 dark:text-slate-400">{g.description}</div>
                                            )}
                                          </div>
                                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                            {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                                          </span>
                                        </label>
                                      ))}
                                    {safeAvailableGroups.filter(g => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return g.name.toLowerCase().includes(searchLower) ||
                                        (g.description || '').toLowerCase().includes(searchLower);
                                    }).length === 0 && (
                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups found</div>
                                      )}
                                  </div>
                                )
                              )}
                            </div>

                            {newVisibility === 'private' && newAllowedUsers.length === 0 && newAllowedGroups.length === 0 && (
                              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-700">
                                Please select at least one user or group for private hyperlinks
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                    </FormSection>
                  )}

                  {/* Description - shown for space and hyperlink */}
                  <FormSection emoji="📝" title="Details" accent="teal">
                    <div>
                      <FormLabel emoji="💬">Description</FormLabel>
                      <textarea
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="Short description..."
                        rows={2}
                        className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 resize-none placeholder-slate-400 transition-all"
                      />
                    </div>
                    <div>
                      <FormLabel emoji="🏷️">Search Tags</FormLabel>
                      <SearchTagsInput
                        tags={newSearchTags}
                        onChange={setNewSearchTags}
                        className="w-full min-h-[42px] bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-teal-500/50 focus-within:border-teal-500 transition-all"
                      />
                    </div>
                  </FormSection>

                  {/* Look & Feel - shown for space and hyperlink */}
                  <FormSection emoji="🎨" title="Look & Feel" accent="violet">
                    <div className="flex gap-3">
                      <div className="w-24 relative">
                        <FormLabel emoji="✨">Icon</FormLabel>
                        <button
                          type="button"
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          className="w-full h-12 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:ring-2 focus:ring-brand-500/50 overflow-hidden"
                        >
                          {newEmojiImage ? (
                            <img
                              src={newEmojiImage}
                              alt=""
                              className="w-8 h-8 object-contain"
                              style={{
                                opacity: Math.max(0, Math.min(100, newEmojiImageOpacity)) / 100,
                                transform: `translate(${Math.max(-50, Math.min(50, newEmojiImageOffsetX))}px, ${Math.max(-50, Math.min(50, newEmojiImageOffsetY))}px) scale(${Math.max(50, Math.min(300, newEmojiImageZoom)) / 100})`
                              }}
                            />
                          ) : (
                            newEmoji || (tileType === 'hyperlink' ? '🔗' : '✨')
                          )}
                        </button>

                        {/* Emoji Picker Popover */}
                        {showEmojiPicker && (
                          <>
                            <div className="fixed inset-0 z-[10001]" onClick={() => setShowEmojiPicker(false)}></div>
                            <div className="absolute top-full left-0 mt-2 w-64 h-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[10002] flex flex-col overflow-hidden">
                              <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                <input
                                  type="text"
                                  value={newEmoji}
                                  onChange={(e) => setNewEmoji(e.target.value)}
                                  placeholder="Type emoji..."
                                  className="w-full text-sm px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-slate-900 dark:text-white"
                                  autoFocus
                                />
                              </div>
                              <div className="flex-1 overflow-y-auto p-2 grid grid-cols-8 gap-1">
                                {POPULAR_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() => { setNewEmoji(emoji); setNewEmojiImage(''); setNewEmojiImageOpacity(100); setNewEmojiImageOffsetX(0); setNewEmojiImageOffsetY(0); setNewEmojiImageZoom(100); setShowEmojiPicker(false); }}
                                    className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                        <div className="mt-1.5 flex flex-col gap-1">
                          <label className={`inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border cursor-pointer transition-colors ${emojiImageUploading ? 'opacity-60 pointer-events-none' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'} text-slate-700 dark:text-slate-200`}>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,.jpg,.jpeg,.png,.gif,.webp,.bmp"
                              className="hidden"
                              disabled={emojiImageUploading}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (!file) return;
                                setEmojiImageUploading(true);
                                try {
                                  const url = await uploadTileEmojiImage(file, {
                                    removeBackground: emojiRemoveBg,
                                    bgColor: emojiRemoveBg && emojiBgMode === 'custom' ? emojiBgColor : undefined
                                  });
                                  setNewEmojiImage(url);
                                  setNewEmojiImageOpacity(100);
                                  setNewEmojiImageOffsetX(0);
                                  setNewEmojiImageOffsetY(0);
                                  setNewEmojiImageZoom(100);
                                } catch (err) {
                                  alert(err instanceof Error ? err.message : 'Failed to upload emoji image');
                                } finally {
                                  setEmojiImageUploading(false);
                                }
                              }}
                            />
                            {emojiImageUploading ? '…' : (newEmojiImage ? 'Replace' : 'Image')}
                          </label>
                          {newEmojiImage ? (
                            <button
                              type="button"
                              onClick={() => {
                                setNewEmojiImage('');
                                setNewEmojiImageOpacity(100);
                                setNewEmojiImageOffsetX(0);
                                setNewEmojiImageOffsetY(0);
                                setNewEmojiImageZoom(100);
                              }}
                              className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline"
                            >
                              Remove image
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex-1">
                        <FormLabel emoji="🎨">Theme</FormLabel>
                        <div className="grid grid-cols-9 gap-1.5">
                          {THEME_COLORS.map(c => (
                            <button
                              key={c}
                              onClick={() => setNewColor(c)}
                              className={`
                          w-8 h-8 rounded-lg border-2 transition-all relative overflow-hidden
                          ${newColor === c ? 'border-brand-500 scale-110 shadow-md shadow-brand-500/30' : 'border-slate-200 dark:border-slate-700 hover:scale-105'} 
                        `}
                              title={c}
                            >
                              <div className={`absolute inset-0 ${COLOR_STYLES[c].base} rounded-md`}></div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {newEmojiImage ? (
                      <div className="space-y-2 mb-1">
                        <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                          <span className="w-20 shrink-0">Opacity</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={newEmojiImageOpacity}
                            onChange={(e) => setNewEmojiImageOpacity(Number(e.target.value))}
                            className="flex-1 accent-brand-500"
                          />
                          <span className="w-10 text-right tabular-nums">{newEmojiImageOpacity}%</span>
                        </label>
                        <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                          <span className="w-20 shrink-0">Zoom</span>
                          <input
                            type="range"
                            min={50}
                            max={300}
                            value={newEmojiImageZoom}
                            onChange={(e) => setNewEmojiImageZoom(Number(e.target.value))}
                            className="flex-1 accent-brand-500"
                          />
                          <span className="w-12 text-right tabular-nums">{newEmojiImageZoom}%</span>
                          <button
                            type="button"
                            onClick={() => setNewEmojiImageZoom(100)}
                            className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            Reset
                          </button>
                        </label>
                        <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                          <span className="w-20 shrink-0">Position X</span>
                          <input
                            type="range"
                            min={-50}
                            max={50}
                            value={newEmojiImageOffsetX}
                            onChange={(e) => setNewEmojiImageOffsetX(Number(e.target.value))}
                            className="flex-1 accent-brand-500"
                          />
                          <span className="w-12 text-right tabular-nums">{newEmojiImageOffsetX}px</span>
                          <button
                            type="button"
                            onClick={() => setNewEmojiImageOffsetX(0)}
                            className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            Reset
                          </button>
                        </label>
                        <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                          <span className="w-20 shrink-0">Position Y</span>
                          <input
                            type="range"
                            min={-50}
                            max={50}
                            value={newEmojiImageOffsetY}
                            onChange={(e) => setNewEmojiImageOffsetY(Number(e.target.value))}
                            className="flex-1 accent-brand-500"
                          />
                          <span className="w-12 text-right tabular-nums">{newEmojiImageOffsetY}px</span>
                          <button
                            type="button"
                            onClick={() => setNewEmojiImageOffsetY(0)}
                            className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            Reset
                          </button>
                        </label>
                        <button
                          type="button"
                          onClick={() => { setNewEmojiImageOffsetX(0); setNewEmojiImageOffsetY(0); setNewEmojiImageZoom(100); setNewEmojiImageOpacity(100); }}
                          className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          Reset position
                        </button>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={newShowEmoji}
                          onChange={(e) => setNewShowEmoji(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">✨ Show emoji on card</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={newShowTitle}
                          onChange={(e) => setNewShowTitle(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">🏷️ Show title on card</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={newShowDescription}
                          onChange={(e) => setNewShowDescription(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">💬 Show description on card</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={emojiRemoveBg}
                            onChange={(e) => setEmojiRemoveBg(e.target.checked)}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          Remove emoji image background
                        </label>
                        {emojiRemoveBg ? (
                          <>
                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                              <input type="radio" name="emojiBgModeCreate" checked={emojiBgMode === 'auto'} onChange={() => setEmojiBgMode('auto')} />
                              Auto (corners)
                            </label>
                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                              <input type="radio" name="emojiBgModeCreate" checked={emojiBgMode === 'custom'} onChange={() => setEmojiBgMode('custom')} />
                              Pick color
                            </label>
                            {emojiBgMode === 'custom' ? (
                              <input
                                type="color"
                                value={emojiBgColor}
                                onChange={(e) => setEmojiBgColor(e.target.value)}
                                className="w-7 h-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                                title="Background color to remove"
                              />
                            ) : null}
                          </>
                        ) : null}
                        {newEmojiImage && emojiRemoveBg ? (
                          <button
                            type="button"
                            disabled={emojiImageUploading}
                            onClick={async () => {
                              setEmojiImageUploading(true);
                              try {
                                const url = await uploadTileEmojiImage(null, {
                                  sourceUrl: newEmojiImage,
                                  removeBackground: true,
                                  bgColor: emojiBgMode === 'custom' ? emojiBgColor : undefined
                                });
                                setNewEmojiImage(url);
                              } catch (err) {
                                alert(err instanceof Error ? err.message : 'Failed to remove background');
                              } finally {
                                setEmojiImageUploading(false);
                              }
                            }}
                            className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Apply to current image
                          </button>
                        ) : null}
                      </div>
                    </div>

                  {/* Header image */}
                    <div>
                      <FormLabel emoji="🖼️">Header image</FormLabel>
                      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                        Place freely on the tile card. Use the tile-sized preview below to align X/Y. Other formats convert to PNG automatically.
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border cursor-pointer transition-colors ${headerImageUploading ? 'opacity-60 pointer-events-none' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'} text-slate-700 dark:text-slate-200`}>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,.jpg,.jpeg,.png,.gif,.webp,.bmp"
                            className="hidden"
                            disabled={headerImageUploading}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (!file) return;
                              setHeaderImageUploading(true);
                              try {
                                const url = await uploadTileHeaderImage(file, {
                                  removeBackground: headerRemoveBg,
                                  bgColor: headerRemoveBg && headerBgMode === 'custom' ? headerBgColor : undefined
                                });
                                setNewHeaderImage(url);
                              } catch (err) {
                                console.error(err);
                                alert(err instanceof Error ? err.message : 'Failed to upload header image');
                              } finally {
                                setHeaderImageUploading(false);
                              }
                            }}
                          />
                          {headerImageUploading ? 'Uploading…' : (newHeaderImage ? 'Replace image' : 'Upload image')}
                        </label>
                        {newHeaderImage ? (
                          <button
                            type="button"
                            onClick={() => setNewHeaderImage('')}
                            className="text-sm text-red-600 dark:text-red-400 hover:underline"
                          >
                            Clear
                          </button>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-600 dark:text-slate-400 mr-1">Align</span>
                          {(['left', 'center', 'right'] as const).map((align) => (
                            <button
                              key={align}
                              type="button"
                              onClick={() => setNewHeaderImageAlign(align)}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${newHeaderImageAlign === align ? 'bg-brand-500 text-white border-brand-500' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}
                            >
                              {align.charAt(0).toUpperCase() + align.slice(1)}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-600 dark:text-slate-400 mr-1">Fit</span>
                          <button
                            type="button"
                            onClick={() => setNewHeaderImageFit('contain')}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${newHeaderImageFit === 'contain' ? 'bg-brand-500 text-white border-brand-500' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}
                            title="Scale image to fit inside the region (no crop)"
                          >
                            Center fit
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewHeaderImageFit('cover')}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${newHeaderImageFit === 'cover' ? 'bg-brand-500 text-white border-brand-500' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}
                            title="Scale image to fill the region completely (may crop)"
                          >
                            Fill region
                          </button>
                        </div>
                      </div>
                      {newHeaderImage ? (
                        <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner">
                          <HeaderImageTilePreview
                            headerImage={newHeaderImage}
                            align={newHeaderImageAlign}
                            fit={newHeaderImageFit}
                            opacity={newHeaderImageOpacity}
                            offsetX={newHeaderImageOffsetX}
                            offsetY={newHeaderImageOffsetY}
                            zoom={newHeaderImageZoom}
                            emoji={newEmoji}
                            emojiImage={newEmojiImage || undefined}
                            emojiImageOpacity={newEmojiImageOpacity}
                            emojiImageOffsetX={newEmojiImageOffsetX}
                            emojiImageOffsetY={newEmojiImageOffsetY}
                            emojiImageZoom={newEmojiImageZoom}
                            showEmoji={newShowEmoji}
                            title={newTitle}
                            description={newDesc}
                            showTitle={newShowTitle}
                            showDescription={newShowDescription}
                            themeColor={newColor}
                          />
                        </div>
                      ) : null}
                      {newHeaderImage ? (
                        <div className="space-y-2 mb-3">
                          <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                            <span className="w-20 shrink-0">Opacity</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={newHeaderImageOpacity}
                              onChange={(e) => setNewHeaderImageOpacity(Number(e.target.value))}
                              className="flex-1 accent-brand-500"
                            />
                            <span className="w-10 text-right tabular-nums">{newHeaderImageOpacity}%</span>
                          </label>
                          <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                            <span className="w-20 shrink-0">Zoom</span>
                            <input
                              type="range"
                              min={50}
                              max={300}
                              value={newHeaderImageZoom}
                              onChange={(e) => setNewHeaderImageZoom(Number(e.target.value))}
                              className="flex-1 accent-brand-500"
                            />
                            <span className="w-12 text-right tabular-nums">{newHeaderImageZoom}%</span>
                            <button
                              type="button"
                              onClick={() => setNewHeaderImageZoom(100)}
                              className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                            >
                              Reset
                            </button>
                          </label>
                          <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                            <span className="w-20 shrink-0">Position X</span>
                            <input
                              type="range"
                              min={-300}
                              max={300}
                              value={newHeaderImageOffsetX}
                              onChange={(e) => setNewHeaderImageOffsetX(Number(e.target.value))}
                              className="flex-1 accent-brand-500"
                            />
                            <span className="w-12 text-right tabular-nums">{newHeaderImageOffsetX}px</span>
                            <button
                              type="button"
                              onClick={() => setNewHeaderImageOffsetX(0)}
                              className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                            >
                              Reset
                            </button>
                          </label>
                          <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                            <span className="w-20 shrink-0">Position Y</span>
                            <input
                              type="range"
                              min={-300}
                              max={300}
                              value={newHeaderImageOffsetY}
                              onChange={(e) => setNewHeaderImageOffsetY(Number(e.target.value))}
                              className="flex-1 accent-brand-500"
                            />
                            <span className="w-12 text-right tabular-nums">{newHeaderImageOffsetY}px</span>
                            <button
                              type="button"
                              onClick={() => setNewHeaderImageOffsetY(0)}
                              className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                            >
                              Reset
                            </button>
                          </label>
                          <button
                            type="button"
                            onClick={() => { setNewHeaderImageOffsetX(0); setNewHeaderImageOffsetY(0); setNewHeaderImageZoom(100); }}
                            className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            Reset position
                          </button>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={headerRemoveBg}
                            onChange={(e) => setHeaderRemoveBg(e.target.checked)}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          Remove background
                        </label>
                        {headerRemoveBg ? (
                          <>
                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                              <input type="radio" name="headerBgModeCreate" checked={headerBgMode === 'auto'} onChange={() => setHeaderBgMode('auto')} />
                              Auto (corners)
                            </label>
                              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                              <input type="radio" name="headerBgModeCreate" checked={headerBgMode === 'custom'} onChange={() => setHeaderBgMode('custom')} />
                              Pick color
                            </label>
                            {headerBgMode === 'custom' ? (
                              <input
                                type="color"
                                value={headerBgColor}
                                onChange={(e) => setHeaderBgColor(e.target.value)}
                                className="w-7 h-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                                title="Background color to remove"
                              />
                            ) : null}
                          </>
                        ) : null}
                        {newHeaderImage && headerRemoveBg ? (
                          <button
                            type="button"
                            disabled={headerImageUploading}
                            onClick={async () => {
                              setHeaderImageUploading(true);
                              try {
                                const url = await uploadTileHeaderImage(null, {
                                  sourceUrl: newHeaderImage,
                                  removeBackground: true,
                                  bgColor: headerBgMode === 'custom' ? headerBgColor : undefined
                                });
                                setNewHeaderImage(url);
                              } catch (err) {
                                console.error(err);
                                alert(err instanceof Error ? err.message : 'Failed to remove background');
                              } finally {
                                setHeaderImageUploading(false);
                              }
                            }}
                            className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Apply to current image
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </FormSection>

                  {/* Category & Visibility - Only shown when type is space */}
                  {tileType === 'space' && (
                    <FormSection emoji="🗂️" title="Organization & Access" accent="amber">
                    <div>
                      <FormLabel emoji="📂">Category</FormLabel>
                      <input
                        type="text"
                        value={newGroup}
                        onChange={(e) => setNewGroup(e.target.value)}
                        placeholder="Select or create a category (e.g., Work, Personal)"
                        list="category-suggestions-space"
                        className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 placeholder-slate-400 transition-all"
                      />
                      <datalist id="category-suggestions-space">
                        {userOwnedCategories.map(cat => <option key={cat} value={cat} />)}
                      </datalist>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select an existing category or type a new name to create one</p>
                    </div>

                    <div>
                      <FormLabel emoji="👁️">Visibility</FormLabel>
                      <div className="space-y-2">
                        <label className={`flex items-center gap-2 cursor-pointer ${user && !user.is_admin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <input
                            type="radio"
                            name="visibility"
                            value="public"
                            checked={newVisibility === 'public'}
                            disabled={!!(user && !user.is_admin)}
                            onChange={(e) => {
                              setNewVisibility(e.target.value as TileVisibility);
                              setShowUserSelector(false);
                            }}
                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">🌎 Public — available for everyone</span>
                        </label>
                        <label className={`flex items-center gap-2 cursor-pointer ${user && !user.is_admin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <input
                            type="radio"
                            name="visibility"
                            value="authenticated"
                            checked={newVisibility === 'authenticated'}
                            disabled={!!(user && !user.is_admin)}
                            onChange={(e) => {
                              setNewVisibility(e.target.value as TileVisibility);
                              setShowUserSelector(false);
                            }}
                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">🔐 Authenticated — logged-in users only</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="visibility"
                            value="private"
                            checked={newVisibility === 'private'}
                            onChange={(e) => {
                              setNewVisibility(e.target.value as TileVisibility);
                              setShowUserSelector(true);
                            }}
                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">🔒 Private — specific users only</span>
                        </label>
                        {user?.is_admin && (
                          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Location (admin)</label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={newCreateInStaging}
                                onChange={(e) => setNewCreateInStaging(e.target.checked)}
                                className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded border-slate-300 dark:border-slate-600"
                              />
                              <span className="text-sm text-slate-700 dark:text-slate-300">Staging - Create in staging area (admin only)</span>
                            </label>
                          </div>
                        )}
                      </div>

                      {/* User and Group Selector for Private Visibility */}
                      {newVisibility === 'private' && isAuthenticated && (
                        <div className="mt-3 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                          {/* Tabs */}
                          <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                            <button
                              type="button"
                              onClick={() => setVisibilityActiveTab('users')}
                              className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${visibilityActiveTab === 'users'
                                ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                            >
                              USERS ({newAllowedUsers.length})
                            </button>
                            <button
                              type="button"
                              onClick={() => setVisibilityActiveTab('groups')}
                              className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${visibilityActiveTab === 'groups'
                                ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                }`}
                            >
                              GROUPS ({newAllowedGroups.length})
                            </button>
                          </div>

                          {/* Search Input */}
                          <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                            <div className="relative">
                              <input
                                type="text"
                                value={visibilitySearchTerm}
                                onChange={(e) => setVisibilitySearchTerm(e.target.value)}
                                placeholder={`Search ${visibilityActiveTab}...`}
                                className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pl-9 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                              />
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                              {visibilitySearchTerm && (
                                <button
                                  type="button"
                                  onClick={() => setVisibilitySearchTerm('')}
                                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Content */}
                          <div className="max-h-64 overflow-y-auto p-2 bg-white dark:bg-slate-800">
                            {visibilityActiveTab === 'users' && (
                              isLoadingUsers ? (
                                <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading users...</div>
                              ) : safeAvailableUsers.length === 0 ? (
                                <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users available</div>
                              ) : (
                                <div className="space-y-1">
                                  {safeAvailableUsers
                                    .filter(u => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return u.username.toLowerCase().includes(searchLower) ||
                                        u.email?.toLowerCase().includes(searchLower);
                                    })
                                    .map(u => {
                                      const isCurrentUserOwner = user && u.id === user.id;
                                      return (
                                        <label
                                          key={u.id}
                                          className={`flex items-center gap-2 p-2 rounded ${isCurrentUserOwner
                                            ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 cursor-not-allowed'
                                            : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50'
                                            }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={newAllowedUsers.includes(u.id) || isCurrentUserOwner}
                                            disabled={isCurrentUserOwner}
                                            onChange={(e) => {
                                              if (isCurrentUserOwner) return;
                                              if (e.target.checked) {
                                                setNewAllowedUsers([...newAllowedUsers, u.id]);
                                              } else {
                                                setNewAllowedUsers(newAllowedUsers.filter(id => id !== u.id));
                                              }
                                            }}
                                            className={`w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded ${isCurrentUserOwner ? 'opacity-50 cursor-not-allowed' : ''
                                              }`}
                                          />
                                          <span className={`text-sm flex-1 ${isCurrentUserOwner
                                            ? 'text-amber-800 dark:text-amber-200 font-medium'
                                            : 'text-slate-700 dark:text-slate-300'
                                            }`}>
                                            {u.username}
                                          </span>
                                          {isCurrentUserOwner && (
                                            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-semibold uppercase">
                                              Owner (You)
                                            </span>
                                          )}
                                          {u.auth_source && u.auth_source !== 'local' && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
                                              {u.auth_source.toUpperCase()}
                                            </span>
                                          )}
                                        </label>
                                      );
                                    })}
                                  {safeAvailableUsers.filter(u => {
                                    const searchLower = visibilitySearchTerm.toLowerCase();
                                    return u.username.toLowerCase().includes(searchLower) ||
                                      u.email?.toLowerCase().includes(searchLower);
                                  }).length === 0 && (
                                      <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users found</div>
                                    )}
                                </div>
                              )
                            )}

                            {visibilityActiveTab === 'groups' && (
                              isLoadingGroups ? (
                                <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading groups...</div>
                              ) : safeAvailableGroups.length === 0 ? (
                                <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups available</div>
                              ) : (
                                <div className="space-y-1">
                                  {safeAvailableGroups
                                    .filter(g => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return g.name.toLowerCase().includes(searchLower) ||
                                        (g.description || '').toLowerCase().includes(searchLower);
                                    })
                                    .map(g => (
                                      <label
                                        key={g.id}
                                        className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={newAllowedGroups.includes(g.id)}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setNewAllowedGroups([...newAllowedGroups, g.id]);
                                            } else {
                                              setNewAllowedGroups(newAllowedGroups.filter(id => id !== g.id));
                                            }
                                          }}
                                          className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded"
                                        />
                                        <div className="flex-1">
                                          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{g.name}</div>
                                          {g.description && (
                                            <div className="text-xs text-slate-500 dark:text-slate-400">{g.description}</div>
                                          )}
                                        </div>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                          {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                                        </span>
                                      </label>
                                    ))}
                                  {safeAvailableGroups.filter(g => {
                                    const searchLower = visibilitySearchTerm.toLowerCase();
                                    return g.name.toLowerCase().includes(searchLower) ||
                                      (g.description || '').toLowerCase().includes(searchLower);
                                  }).length === 0 && (
                                      <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups found</div>
                                    )}
                                </div>
                              )
                            )}
                          </div>

                          {newVisibility === 'private' && newAllowedUsers.length === 0 && newAllowedGroups.length === 0 && (
                            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-700">
                              Please select at least one user or group for private spaces
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    </FormSection>
                  )}

                  {/* Scheduling - Only shown when type is space */}
                  {tileType === 'space' && (
                    <FormSection emoji="🗓️" title="Scheduling" accent="emerald">
                    <div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <FormLabel emoji="🌱">Available From</FormLabel>
                          <input
                            type="datetime-local"
                            value={visibleFrom}
                            onChange={(e) => setVisibleFrom(e.target.value)}
                            className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                          />
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for immediate availability</p>
                        </div>
                        <div>
                          <FormLabel emoji="⏰">Expires At</FormLabel>
                          <input
                            type="datetime-local"
                            value={expiresAt}
                            onChange={(e) => setExpiresAt(e.target.value)}
                            min={visibleFrom || undefined}
                            className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                          />
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for no expiry</p>
                        </div>
                      </div>
                    </div>
                    </FormSection>
                  )}

                  {/* Actions */}
                  <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateTile}
                      disabled={
                        !newTitle.trim() ||
                        (newVisibility === 'private' && newAllowedUsers.length === 0) ||
                        (tileType === 'hyperlink' && !hyperlinkUrl.trim())
                      }
                      className="bg-gradient-to-r from-sky-600 to-indigo-500 hover:from-sky-500 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-md shadow-sky-500/20 hover:shadow-lg hover:shadow-sky-500/30 hover:scale-105 active:scale-95"
                    >
                      {tileType === 'hyperlink' ? '🔗 Create Hyperlink' : '✨ Create Space'}
                    </button>
                  </div>
                </div>
              </div>
              {/* Resize Handle */}
              <div
                onMouseDown={handleResizeStart}
                className={`absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end ${isResizing ? 'bg-brand-500/20' : 'hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
                style={{ zIndex: 100000 }}
              >
                <div className="w-4 h-4 relative">
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-r-2 border-b-2 border-slate-400 dark:border-slate-500 rounded-br-lg"></div>
                  <div className="absolute bottom-1 right-1 w-2 h-2 border-r border-b border-slate-400 dark:border-slate-500 rounded-br"></div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* Edit Tile Modal */}
      {
        isEditModalOpen && editingTile && createPortal(
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
            <div className="absolute inset-0 bg-transparent" style={{ zIndex: 99998 }} onClick={() => {
              setIsEditModalOpen(false);
              setEditingTile(null);
              resetForm();
            }}></div>
            <div
              ref={modalRef}
              className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl p-6 relative shadow-2xl animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col ${isDragging ? 'cursor-move' : ''} ${isDragging || isResizing ? 'will-change-transform' : ''}`}
              style={{
                zIndex: 99999,
                width: modalSize.width > 0 ? `${modalSize.width}px` : '600px',
                maxWidth: '90vw',
                minWidth: '400px',
                height: modalSize.height > 0 ? `${modalSize.height}px` : '700px',
                maxHeight: '90vh',
                minHeight: '300px',
                left: modalPosition.x > 0 ? `${modalPosition.x}px` : 'auto',
                top: modalPosition.y > 0 ? `${modalPosition.y}px` : 'auto',
                position: modalPosition.x > 0 || modalPosition.y > 0 ? 'absolute' : 'relative',
                transition: isDragging || isResizing ? 'none' : undefined
              }}
            >
              <SpaceModalHeader
                emoji={tileType === 'hyperlink' ? '🔗' : '✏️'}
                eyebrow={tileType === 'hyperlink' ? 'Edit Hyperlink' : 'Edit Space'}
                title={editingTile.title || (tileType === 'hyperlink' ? 'Edit Hyperlink' : 'Edit Space')}
                subtitle={tileType === 'hyperlink' ? 'Update your hyperlink settings' : 'Update your space settings'}
                onClose={() => setIsEditModalOpen(false)}
                onMouseDown={handleDragStart}
              />

              <div className="flex-1 overflow-y-auto pr-2 -mr-2 min-h-0">
              {/* Shared Live Preview for All Tabs */}
              <div className="mb-6 p-4 bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-sky-950/30 dark:to-indigo-950/20 rounded-2xl border border-sky-100 dark:border-sky-900/40 shadow-inner overflow-hidden relative ring-1 ring-sky-200/40 dark:ring-sky-800/30">
                <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800 shadow-sm z-10">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-tighter">🔮 Live Preview</span>
                </div>

                <div className="flex justify-center items-center py-6 relative overflow-hidden">
                  <div
                    ref={previewTileRef}
                    className="w-full max-w-[280px] min-h-[140px] rounded-xl border border-slate-200 dark:border-slate-700/50 p-5 flex flex-col transition-all duration-300 shadow-lg relative overflow-hidden bg-white dark:bg-slate-800"
                    style={{
                      background: tileGradientEnabled && tileGradientColors && tileGradientColors.length > 0
                        ? (() => {
                          const hasPositions = tileGradientColorPositions && tileGradientColorPositions.length === tileGradientColors.length;
                          const gradientStops = tileGradientColors.map((color, i) => {
                            if (hasPositions) {
                              return `${color} ${tileGradientColorPositions[i]}%`;
                            }
                            return color;
                          }).join(', ');

                          if (tileGradientType === 'linear' || tileGradientType === 'repeating-linear') {
                            const prefix = tileGradientType === 'repeating-linear' ? 'repeating-linear-gradient' : 'linear-gradient';
                            return `${prefix}(${tileGradientDirection}deg, ${gradientStops})`;
                          } else if (tileGradientType === 'radial' || tileGradientType === 'repeating-radial') {
                            const prefix = tileGradientType === 'repeating-radial' ? 'repeating-radial-gradient' : 'radial-gradient';
                            return `${prefix}(circle, ${gradientStops})`;
                          } else if (tileGradientType === 'conic' || tileGradientType === 'repeating-conic') {
                            const prefix = tileGradientType === 'repeating-conic' ? 'repeating-conic-gradient' : 'conic-gradient';
                            return `${prefix}(from ${tileGradientDirection}deg, ${gradientStops})`;
                          }
                          return `linear-gradient(${tileGradientDirection}deg, ${gradientStops})`;
                        })()
                        : tileBackgroundColor || undefined,
                      borderRadius: `${tileBorderRadius}px`,
                      color: tileTextColor || undefined
                    }}
                  >
                    {/* Celebration effects for preview */}
                    <TileFireworks trigger={previewFireworksTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileConfetti trigger={previewConfettiTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileSnowfall trigger={previewSnowfallTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileHeartsRising trigger={previewHeartsRisingTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileHeartsFalling trigger={previewHeartsFallingTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileBubbles trigger={previewBubblesTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileButterflies trigger={previewButterfliesTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileBirdsFlying trigger={previewBirdsFlyingTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileRocketLaunch trigger={previewRocketLaunchTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileBurstFireworks trigger={previewBurstFireworksTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileSparkles trigger={previewSparklesTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TilePetals trigger={previewPetalsTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileShootingStars trigger={previewShootingStarsTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileLeaves trigger={previewLeavesTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileFireflies trigger={previewFirefliesTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileBalloons trigger={previewBalloonsTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileStars trigger={previewStarsTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />
                    <TileRainbow trigger={previewRainbowTrigger} tileRef={previewTileRef} config={messageCelebrationConfig} />

                    {newHeaderImage ? (
                      <img
                        src={newHeaderImage}
                        alt=""
                        className={`absolute top-3 right-3 z-0 max-w-[10rem] h-10 pointer-events-none select-none ${
                          newHeaderImageFit === 'cover' ? 'object-cover' : 'object-contain'
                        } ${
                          newHeaderImageAlign === 'left'
                            ? 'object-left'
                            : newHeaderImageAlign === 'center'
                              ? 'object-center'
                              : 'object-right'
                        }`}
                        style={{
                          opacity: newHeaderImageOpacity / 100,
                          transform: `translate(${newHeaderImageOffsetX}px, ${newHeaderImageOffsetY}px) scale(${Math.max(50, Math.min(300, newHeaderImageZoom)) / 100})`
                        }}
                        draggable={false}
                      />
                    ) : null}

                    <div className="relative z-[1] flex-1">
                      {newShowEmoji ? (
                        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center text-lg mb-3 border border-slate-200 dark:border-slate-600 overflow-hidden">
                          {newEmojiImage ? (
                            <img src={newEmojiImage} alt="" className="w-full h-full object-contain p-0.5" style={{
                              opacity: Math.max(0, Math.min(100, newEmojiImageOpacity)) / 100,
                              transform: `translate(${Math.max(-50, Math.min(50, newEmojiImageOffsetX))}px, ${Math.max(-50, Math.min(50, newEmojiImageOffsetY))}px) scale(${Math.max(50, Math.min(300, newEmojiImageZoom)) / 100})`
                            }} draggable={false} />
                          ) : (
                            newEmoji || '📁'
                          )}
                        </div>
                      ) : (
                        <div className="mb-3 min-h-[40px]" />
                      )}
                      {newShowTitle ? (
                        <h3 className="font-bold text-sm leading-tight line-clamp-2 mb-1">
                          {newTitle || 'Tile Preview'}
                        </h3>
                      ) : null}
                      {newShowDescription ? (
                        <p className="opacity-70 text-[10px] line-clamp-2 leading-snug">
                          {newDesc || 'No description'}
                        </p>
                      ) : null}
                    </div>

                    {/* Message Preview */}
                    {(messageContent || (messageType === 'celebration' && messageCelebrationEffect !== 'none')) && (
                      <div className="relative z-[1] mt-3 pt-2 border-t border-slate-200 dark:border-slate-700/50 flex items-center justify-center gap-2">
                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${messageType === 'info' ? 'bg-blue-100/50 text-blue-600' :
                          messageType === 'warning' ? 'bg-amber-100/50 text-amber-600' :
                            messageType === 'celebration' ? 'bg-pink-100/50 text-pink-600' :
                              messageType === 'alert' ? 'bg-red-100/50 text-red-600' :
                                'bg-slate-100/50 text-slate-600'
                          }`}>
                          {messageType.toUpperCase()}
                        </div>
                        <div className="text-[10px] font-semibold truncate flex-1" style={messageTextColor ? { color: messageTextColor } : {}}>
                          {messageContent || (messageType === 'celebration' ? `Effect: ${messageCelebrationEffect}` : '')}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="flex gap-1.5 mb-5 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
                <EditModalTabButton
                  active={editModalActiveTab === 'general'}
                  emoji="📋"
                  label="General"
                  onClick={() => setEditModalActiveTab('general')}
                />
                <EditModalTabButton
                  active={editModalActiveTab === 'decoration'}
                  emoji="🎨"
                  label="Decorations"
                  onClick={() => setEditModalActiveTab('decoration')}
                />
                {tileType === 'space' && (
                  <EditModalTabButton
                    active={editModalActiveTab === 'messages'}
                    emoji="💬"
                    label="Message Board"
                    onClick={() => setEditModalActiveTab('messages')}
                  />
                )}
              </div>

              <div className="space-y-4">
                {editModalActiveTab === 'messages' ? (
                  <div className="space-y-5">
                    {/* Header Section */}
                    <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 text-base" aria-hidden="true">💬</span>
                        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">Scheduled Messages</h3>
                        {messages.length > 0 && (
                          <span className="px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full">
                            {messages.length}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleExportMessageBoard}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors border border-slate-200 dark:border-slate-600"
                          title="Export all messages as JSON"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                          </svg>
                        </button>
                        <input
                          ref={messageBoardImportInputRef}
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={handleImportMessageBoard}
                        />
                        <button
                          type="button"
                          onClick={() => messageBoardImportInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors border border-slate-200 dark:border-slate-600"
                          title="Import messages from JSON file"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
                            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadAIPrompt}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors border border-slate-200 dark:border-slate-600"
                          title="Download AI prompt + JSON template for bulk generation (Claude, ChatGPT)"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.683a1 1 0 01-.633-.633L6.95 5.684zM13.949 13.684a1 1 0 00-1.898 0l-.184.551a1 1 0 01-.632.633l-.551.183a1 1 0 000 1.898l.551.183a1 1 0 01.633.633l.183.551a1 1 0 001.898 0l.184-.551a1 1 0 01.632-.633l.551-.183a1 1 0 000-1.898l-.551-.184a1 1 0 01-.633-.632l-.183-.551z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            setEditingMessageId('new');
                            setMessageContent('');
                            setMessageType('info');
                            setMessageStartDate('');
                            setMessageEndDate('');
                            setMessageIsActive(true);
                            setMessagePriority(0);
                            setMessageTextColor('');
                            setMessageFontStyle('normal');
                            setMessageDisplayLocation('both');
                            setMessageAnimationType('rollover');
                            setMessageDelayBefore(0);
                            setMessageCelebrationEffect('fireworks');
                            setMessageCelebrationConfig({ intensity: 100, particleCount: 18, particleSize: 100, triggerIntervalMs: 5000 });
                            setMessageUrl('');
                            setMessageUrlLabel('');
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors shadow-sm hover:shadow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                          </svg>
                          Add Message
                        </button>
                      </div>
                    </div>

                    {/* Message Editor */}
                    {editingMessageId && (
                      <div className="p-5 border-2 border-brand-200 dark:border-brand-800 rounded-xl bg-gradient-to-br from-brand-50/50 to-slate-50 dark:from-brand-900/20 dark:to-slate-900/50 shadow-sm">
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              Message Content
                            </label>
                            <textarea
                              value={messageContent}
                              onChange={(e) => setMessageContent(e.target.value)}
                              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all resize-none"
                              rows={4}
                              placeholder="Enter your message... URLs will be clickable. Use **bold** for bold text and _italic_ for italic text."
                            />
                            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                              💡 Formatting: URLs are automatically clickable. Use <strong>**text**</strong> for <strong>bold</strong> and <em>_text_</em> for <em>italic</em>.
                            </p>
                          </div>

                          {/* Message URL Link */}
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              Link URL <span className="text-slate-400 font-normal">(optional)</span>
                            </label>
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                  <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                                  <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                                </svg>
                                <input
                                  type="url"
                                  value={messageUrl}
                                  onChange={(e) => setMessageUrl(e.target.value)}
                                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                                  placeholder="https://example.com/more-info"
                                />
                              </div>
                              {messageUrl && (
                                <a
                                  href={messageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 px-3 py-2.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/30 rounded-lg transition-colors"
                                  title="Test link"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
                                    <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
                                  </svg>
                                  Test
                                </a>
                              )}
                            </div>
                            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                              Add a URL where users can get more information about this message.
                            </p>
                          </div>

                          {/* Link label - custom text for the link (when URL is set) */}
                          {messageUrl && (
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                                Link display text <span className="text-slate-400 font-normal">(optional)</span>
                              </label>
                              <input
                                type="text"
                                value={messageUrlLabel}
                                onChange={(e) => setMessageUrlLabel(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                                placeholder="e.g. Learn more, View details, Read announcement"
                              />
                              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                                Custom text shown for the link. Leave empty to use &quot;Info&quot;.
                              </p>
                            </div>
                          )}

                          <div>
                            {/* Message Presets - Enhanced with Categories */}
                            <div className="mt-3 space-y-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Quick Presets:</span>
                              </div>

                              {/* Celebrations Category */}
                              <div>
                                <span className="text-xs text-slate-600 dark:text-slate-400 mb-1.5 block">Celebrations</span>
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    onClick={() => { setMessageContent("🎉 Happy Birthday!"); setMessageType('celebration'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    🎉 Birthday
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("🎊 Congratulations!"); setMessageType('celebration'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    🎊 Congratulations
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("🎈 Happy Anniversary!"); setMessageType('celebration'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    🎈 Anniversary
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("🎁 Special Event Today!"); setMessageType('celebration'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    🎁 Special Event
                                  </button>
                                </div>
                              </div>

                              {/* Alerts & Warnings Category */}
                              <div>
                                <span className="text-xs text-slate-600 dark:text-slate-400 mb-1.5 block">Alerts & Warnings</span>
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    onClick={() => { setMessageContent("⚠️ Maintenance scheduled. System will be unavailable."); setMessageType('warning'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    ⚠️ Maintenance
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("🚨 System Alert: Action Required"); setMessageType('alert'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    🚨 System Alert
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("⏰ Deadline Reminder: Please complete your tasks"); setMessageType('warning'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    ⏰ Deadline
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("🔒 Security Update Required"); setMessageType('alert'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    🔒 Security Alert
                                  </button>
                                </div>
                              </div>

                              {/* Informational Category */}
                              <div>
                                <span className="text-xs text-slate-600 dark:text-slate-400 mb-1.5 block">Information</span>
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    onClick={() => { setMessageContent("ℹ️ Important Update: Please review the changes"); setMessageType('info'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    ℹ️ Update
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("📢 Announcement: New features available"); setMessageType('info'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    📢 Announcement
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("💡 Tip: Did you know? Check out our new shortcuts"); setMessageType('info'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    💡 Tip
                                  </button>
                                  <button
                                    onClick={() => { setMessageContent("✅ Task Completed Successfully"); setMessageType('info'); }}
                                    className="text-xs px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-slate-700 dark:text-slate-300"
                                  >
                                    ✅ Completed
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Message Type</label>
                              <select
                                value={messageType}
                                onChange={(e) => setMessageType(e.target.value as any)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              >
                                <option value="info">ℹ️ Info</option>
                                <option value="warning">⚠️ Warning</option>
                                <option value="celebration">🎉 Celebration</option>
                                <option value="alert">🚨 Alert</option>
                                <option value="custom">🎨 Custom</option>
                              </select>
                            </div>
                            <div className="flex items-end">
                              <label className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors">
                                <input
                                  type="checkbox"
                                  checked={messageIsActive}
                                  onChange={(e) => setMessageIsActive(e.target.checked)}
                                  className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded border-slate-300 dark:border-slate-600"
                                />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Active</span>
                              </label>
                            </div>
                          </div>

                          {/* Celebration Effect Selector - Only show for celebration messages */}
                          {messageType === 'celebration' && (
                            <div className="mb-4">
                              <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                                  🎆 Celebration Effect
                                </label>
                                <button
                                  type="button"
                                  onClick={applyCelebrationPreset}
                                  className="text-[10px] px-2 py-1 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800 rounded hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-all flex items-center gap-1.5 font-bold"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-1.281z" clipRule="evenodd" />
                                  </svg>
                                  APPLY "SMOOTH & SLOW" PRESET
                                </button>
                              </div>
                              <select
                                value={messageCelebrationEffect}
                                onChange={(e) => setMessageCelebrationEffect(e.target.value as TileMessage['celebrationEffect'])}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              >
                                <option value="fireworks">🎆 Fireworks</option>
                                <option value="burst-fireworks">💥 Burst Fireworks</option>
                                <option value="confetti">🎊 Confetti (Falling)</option>
                                <option value="snowfall">❄️ Snowfall</option>
                                <option value="hearts-rising">❤️ Hearts (Rising)</option>
                                <option value="hearts-falling">❤️ Hearts (Falling)</option>
                                <option value="bubbles">🫧 Bubbles (Rising)</option>
                                <option value="butterflies">🦋 Butterflies</option>
                                <option value="birds-flying">🐦 Birds Flying</option>
                                <option value="rocket-launch">🚀 Rocket Launch</option>
                                <option value="sparkles">✨ Sparkles</option>
                                <option value="petals">🌸 Flower Petals</option>
                                <option value="shooting-stars">🌠 Shooting Stars</option>
                                <option value="leaves">🍂 Autumn Leaves</option>
                                <option value="fireflies">✨ Fireflies</option>
                                <option value="balloons">🎈 Balloons</option>
                                <option value="stars">⭐ Twinkling Stars</option>
                                <option value="rainbow">🌈 Rainbow</option>
                                <option value="none">❌ None</option>
                              </select>
                              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                                Choose a subtle background animation for celebration messages
                              </p>
                            </div>
                          )}

                          {/* Animation controls - only for celebration messages with an effect */}
                          {messageType === 'celebration' && messageCelebrationEffect !== 'none' && (
                            <div className="mb-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
                              <span className="block text-sm font-semibold text-slate-700 dark:text-slate-300">⚙️ Animation controls</span>
                              <div className="space-y-3">
                                <div>
                                  <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                                    <span>Intensity</span>
                                    <span>{messageCelebrationConfig.intensity ?? 100}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={1}
                                    max={100}
                                    value={messageCelebrationConfig.intensity ?? 100}
                                    onChange={(e) => setMessageCelebrationConfig(c => ({ ...c, intensity: parseInt(e.target.value, 10) }))}
                                    className="w-full h-2 rounded-lg appearance-none bg-slate-200 dark:bg-slate-700 accent-brand-500"
                                  />
                                </div>
                                <div>
                                  <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                                    <span>Particle count</span>
                                    <span>{messageCelebrationConfig.particleCount ?? 18}</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={5}
                                    max={80}
                                    value={messageCelebrationConfig.particleCount ?? 18}
                                    onChange={(e) => setMessageCelebrationConfig(c => ({ ...c, particleCount: parseInt(e.target.value, 10) }))}
                                    className="w-full h-2 rounded-lg appearance-none bg-slate-200 dark:bg-slate-700 accent-brand-500"
                                  />
                                </div>
                                <div>
                                  <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                                    <span>Particle size</span>
                                    <span>{messageCelebrationConfig.particleSize ?? 100}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={50}
                                    max={200}
                                    value={messageCelebrationConfig.particleSize ?? 100}
                                    onChange={(e) => setMessageCelebrationConfig(c => ({ ...c, particleSize: parseInt(e.target.value, 10) }))}
                                    className="w-full h-2 rounded-lg appearance-none bg-slate-200 dark:bg-slate-700 accent-brand-500"
                                  />
                                </div>
                                <div>
                                  <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                                    <span>Animation speed</span>
                                    <span>{messageCelebrationConfig.speed ?? 100}%</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={20}
                                    max={200}
                                    value={messageCelebrationConfig.speed ?? 100}
                                    onChange={(e) => setMessageCelebrationConfig(c => ({ ...c, speed: parseInt(e.target.value, 10) }))}
                                    className="w-full h-2 rounded-lg appearance-none bg-slate-200 dark:bg-slate-700 accent-brand-500"
                                  />
                                </div>
                                <div>
                                  <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                                    <span>Burst interval</span>
                                    <span>{Math.max(2, Math.min(15, Math.round((messageCelebrationConfig.triggerIntervalMs ?? 5000) / 1000)))}s</span>
                                  </div>
                                  <input
                                    type="range"
                                    min={2}
                                    max={15}
                                    value={Math.max(2, Math.min(15, Math.round((messageCelebrationConfig.triggerIntervalMs ?? 5000) / 1000)))}
                                    onChange={(e) => setMessageCelebrationConfig(c => ({ ...c, triggerIntervalMs: parseInt(e.target.value, 10) * 1000 }))}
                                    className="w-full h-2 rounded-lg appearance-none bg-slate-200 dark:bg-slate-700 accent-brand-500"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Start Date & Time</label>
                              <input
                                type="datetime-local"
                                value={messageStartDate}
                                onChange={(e) => setMessageStartDate(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              />
                              <div className="mt-2 flex gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('today', 'start')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  Today
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('tomorrow', 'start')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  Tomorrow
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('thisWeek', 'start')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  This Week
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('nextWeek', 'start')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  Next Week
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">End Date & Time</label>
                              <input
                                type="datetime-local"
                                value={messageEndDate}
                                onChange={(e) => setMessageEndDate(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              />
                              <div className="mt-2 flex gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('today', 'end')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  Today
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('tomorrow', 'end')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  Tomorrow
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('thisWeek', 'end')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  This Week
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDatePreset('nextWeek', 'end')}
                                  className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                >
                                  Next Week
                                </button>
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Text Color</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={messageTextColor || '#000000'}
                                onChange={(e) => setMessageTextColor(e.target.value)}
                                className="w-16 h-10 shrink-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
                              />
                              <input
                                type="text"
                                value={messageTextColor}
                                onChange={(e) => setMessageTextColor(e.target.value)}
                                placeholder="#000000"
                                className="min-w-[7rem] flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              />
                              <button
                                type="button"
                                onClick={() => setMessageTextColor('')}
                                className="shrink-0 px-3 py-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                title="Reset to default"
                              >
                                Reset
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Font Style</label>
                              <select
                                value={messageFontStyle}
                                onChange={(e) => setMessageFontStyle(e.target.value)}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              >
                                <option value="normal">Normal</option>
                                <option value="italic">Italic</option>
                                <option value="bold">Bold</option>
                                <option value="bold italic">Bold Italic</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Display Location</label>
                              <select
                                value={messageDisplayLocation}
                                onChange={(e) => setMessageDisplayLocation(e.target.value as 'tile' | 'detail' | 'both')}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              >
                                <option value="both">Both (Tile & Detail Page)</option>
                                <option value="tile">Tile Only</option>
                                <option value="detail">Detail Page Only</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Animation Type</label>
                            <select
                              value={messageAnimationType}
                              onChange={(e) => setMessageAnimationType(e.target.value as any)}
                              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                            >
                              <option value="rollover">Rollover (Marquee)</option>
                              <option value="still">Still (No Animation)</option>
                              <option value="flash">Flash</option>
                              <option value="flip-horizontal">Flip Horizontal</option>
                              <option value="flip-vertical">Flip Vertical</option>
                              <option value="bounce">Bounce</option>
                              <option value="pulse">Pulse</option>
                              <option value="shake">Shake</option>
                              <option value="fade">Fade</option>
                              <option value="slide">Slide</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              Delay Before Display <span className="text-xs text-slate-500 dark:text-slate-400">(seconds, for sequential messages)</span>
                            </label>
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                value={messageDelayBefore}
                                onChange={(e) => setMessageDelayBefore(parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.5"
                                className="w-24 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              />
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Delay before this message appears (useful when multiple messages are active)
                              </span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              Display Priority <span className="text-xs text-slate-500 dark:text-slate-400">(Lower number = higher priority)</span>
                            </label>
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                value={messagePriority}
                                onChange={(e) => setMessagePriority(parseInt(e.target.value) || 0)}
                                min="0"
                                className="w-24 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                              />
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                Messages with lower priority numbers display first when multiple are active
                              </span>
                            </div>
                          </div>

                          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                            <button
                              onClick={() => setEditingMessageId(null)}
                              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                const newMessage: TileMessage = {
                                  id: editingMessageId === 'new' ? Math.random().toString(36).substr(2, 9) : editingMessageId!,
                                  content: messageContent,
                                  type: messageType,
                                  startDate: messageStartDate,
                                  endDate: messageEndDate,
                                  isActive: messageIsActive,
                                  priority: messagePriority,
                                  textColor: messageTextColor || undefined,
                                  fontStyle: messageFontStyle || undefined,
                                  displayLocation: messageDisplayLocation,
                                  animationType: messageAnimationType,
                                  delayBefore: messageDelayBefore || 0,
                                  celebrationEffect: messageCelebrationEffect,
                                  celebrationConfig: messageCelebrationEffect !== 'none' ? messageCelebrationConfig : undefined,
                                  url: normalizeImportedMessageUrl(messageUrl) || undefined,
                                  urlLabel: messageUrlLabel.trim() || undefined,
                                };

                                if (editingMessageId === 'new') {
                                  setMessages([...messages, newMessage]);
                                } else {
                                  setMessages(messages.map(m => m.id === editingMessageId ? newMessage : m));
                                }
                                setEditingMessageId(null);
                              }}
                              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors shadow-sm hover:shadow"
                            >
                              {editingMessageId === 'new' ? 'Add Message' : 'Update Message'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Message List */}
                    <div className="space-y-3">
                      {messages.length === 0 ? (
                        <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/30">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3">
                            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                          </svg>
                          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">No messages scheduled</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">Click "Add Message" to create your first scheduled message</p>
                        </div>
                      ) : (
                        [...messages].sort((a, b) => (a.priority || 0) - (b.priority || 0)).map(msg => {
                          const status = getMessageStatus(msg);
                          return (
                            <div key={msg.id} className="group p-4 border border-slate-200 dark:border-slate-700 rounded-xl flex justify-between items-start bg-white dark:bg-slate-800 hover:shadow-md transition-all hover:border-brand-300 dark:hover:border-brand-700">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${msg.type === 'info' ? 'bg-blue-500' :
                                    msg.type === 'warning' ? 'bg-amber-500' :
                                      msg.type === 'celebration' ? 'bg-purple-500' :
                                        msg.type === 'alert' ? 'bg-red-500' : 'bg-slate-500'
                                    }`}></span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    {msg.type === 'info' ? 'ℹ️ Info' :
                                      msg.type === 'warning' ? '⚠️ Warning' :
                                        msg.type === 'celebration' ? '🎉 Celebration' :
                                          msg.type === 'alert' ? '🚨 Alert' : '🎨 Custom'}
                                  </span>
                                  {/* Status Indicator */}
                                  {status === 'active' && (
                                    <span className="px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-full">
                                      Active Now
                                    </span>
                                  )}
                                  {status === 'upcoming' && (
                                    <span className="px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-full">
                                      Upcoming
                                    </span>
                                  )}
                                  {status === 'expired' && (
                                    <span className="px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-full">
                                      Expired
                                    </span>
                                  )}
                                  {/* Priority Badge */}
                                  <span className="px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-full">
                                    Priority: {msg.priority || 0}
                                  </span>
                                </div>
                                <div className="text-sm text-slate-800 dark:text-slate-200 mb-2 leading-relaxed break-words">
                                  {renderMessageContent(msg.content)}
                                </div>
                                {/* Message URL Link */}
                                {msg.url && (
                                  <a
                                    href={msg.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/30 rounded-md transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                      <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                                      <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                                    </svg>
                                    {msg.urlLabel || 'More Info'}
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                      <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
                                      <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
                                    </svg>
                                  </a>
                                )}
                                <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                                  {msg.startDate && (
                                    <div className="flex items-center gap-1">
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                        <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c0-.69.56-1.25 1.25-1.25h10c.69 0 1.25.56 1.25 1.25v6.5c0 .69-.56 1.25-1.25 1.25H6c-.69 0-1.25-.56-1.25-1.25v-6.5z" clipRule="evenodd" />
                                      </svg>
                                      <span>From: {new Date(msg.startDate).toLocaleString()}</span>
                                    </div>
                                  )}
                                  {msg.endDate && (
                                    <div className="flex items-center gap-1">
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                        <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c0-.69.56-1.25 1.25-1.25h10c.69 0 1.25.56 1.25 1.25v6.5c0 .69-.56 1.25-1.25 1.25H6c-.69 0-1.25-.56-1.25-1.25v-6.5z" clipRule="evenodd" />
                                      </svg>
                                      <span>To: {new Date(msg.endDate).toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1.5 ml-4">
                                {/* Priority Controls */}
                                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      const newPriority = Math.max(0, (msg.priority || 0) - 1);
                                      setMessages(messages.map(m => m.id === msg.id ? { ...m, priority: newPriority } : m));
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded transition-colors"
                                    title="Increase priority (decrease number)"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                      <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => {
                                      const newPriority = (msg.priority || 0) + 1;
                                      setMessages(messages.map(m => m.id === msg.id ? { ...m, priority: newPriority } : m));
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded transition-colors"
                                    title="Decrease priority (increase number)"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                </div>
                                {/* Action Buttons */}
                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      setEditingMessageId(msg.id);
                                      setMessageContent(msg.content);
                                      setMessageType(msg.type);
                                      setMessageStartDate(msg.startDate);
                                      setMessageEndDate(msg.endDate);
                                      setMessageIsActive(msg.isActive);
                                      setMessagePriority(msg.priority || 0);
                                      setMessageTextColor(msg.textColor || '');
                                      setMessageFontStyle(msg.fontStyle || 'normal');
                                      setMessageDisplayLocation(msg.displayLocation || 'both');
                                      setMessageAnimationType(msg.animationType || 'rollover');
                                      setMessageDelayBefore(msg.delayBefore || 0);
                                      const validEffects = ['none', 'fireworks', 'confetti', 'snowfall', 'hearts-rising', 'hearts-falling', 'bubbles', 'butterflies', 'birds-flying', 'rocket-launch', 'burst-fireworks', 'sparkles', 'petals', 'shooting-stars', 'leaves', 'fireflies', 'balloons', 'stars', 'rainbow'] as const;
                                      const eff = msg.celebrationEffect || 'fireworks';
                                      const resolved = eff === 'hearts' ? 'hearts-rising' : (validEffects.includes(eff as any) ? eff : 'fireworks');
                                      setMessageCelebrationEffect(resolved);
                                      const cc = msg.celebrationConfig ?? {};
                                      setMessageCelebrationConfig({
                                        intensity: Math.max(1, Math.min(100, cc.intensity ?? 100)),
                                        particleCount: Math.max(5, Math.min(80, cc.particleCount ?? 18)),
                                        particleSize: Math.max(50, Math.min(200, cc.particleSize ?? 100)),
                                        speed: Math.max(20, Math.min(200, cc.speed ?? 100)),
                                        triggerIntervalMs: Math.max(2000, Math.min(15000, cc.triggerIntervalMs ?? 5000)),
                                      });
                                      setMessageUrl(msg.url || '');
                                      setMessageUrlLabel(msg.urlLabel || '');
                                    }}
                                    className="p-2 text-slate-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
                                    title="Edit message"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                                      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => {
                                      const duplicatedMessage: TileMessage = {
                                        ...msg,
                                        id: Math.random().toString(36).substr(2, 9),
                                        content: msg.content + ' (Copy)'
                                      };
                                      setMessages([...messages, duplicatedMessage]);
                                    }}
                                    className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                                    title="Duplicate message"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                                      <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => setMessages(messages.filter(m => m.id !== msg.id))}
                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    title="Delete message"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : editModalActiveTab === 'general' ? (
                  <>
                    <FormSection emoji="📋" title="Basics" accent="sky">
                    {/* Title */}
                    <div>
                      <FormLabel emoji="🏷️">Title</FormLabel>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="e.g., Design Resources"
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                      />
                    </div>

                    {/* URL - Only for hyperlinks */}
                    {tileType === 'hyperlink' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">URL</label>
                        <input
                          type="url"
                          value={hyperlinkUrl}
                          onChange={(e) => setHyperlinkUrl(e.target.value)}
                          placeholder="https://example.com"
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                        />
                      </div>
                    )}

                    {/* Description */}
                    <div>
                      <FormLabel emoji="💬">Description</FormLabel>
                      <textarea
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="Short description..."
                        rows={2}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 resize-none placeholder-slate-400 transition-all"
                      />
                    </div>

                    {/* Search tags — alternate keywords for "Search spaces…" */}
                    <div>
                      <FormLabel emoji="🏷️">Search Tags</FormLabel>
                      <SearchTagsInput tags={newSearchTags} onChange={setNewSearchTags} />
                    </div>

                    {/* Open Link - Only for hyperlinks */}
                    {tileType === 'hyperlink' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Open Link</label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="editOpenInNewTab"
                              value="new"
                              checked={openInNewTab === true}
                              onChange={() => setOpenInNewTab(true)}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Open in new tab</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="editOpenInNewTab"
                              value="same"
                              checked={openInNewTab === false}
                              onChange={() => setOpenInNewTab(false)}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Open in same tab</span>
                          </label>
                        </div>
                      </div>
                    )}

                                        </FormSection>

                    <FormSection emoji="👁️" title="Access & Sharing" accent="amber">
                    {/* Visibility Settings - For hyperlinks */}
                    {tileType === 'hyperlink' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Visibility</label>
                        <div className="space-y-2">
                          {/* Public - Only for admins */}
                          {user && user.is_admin && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="editVisibility-hyperlink"
                                value="public"
                                checked={newVisibility === 'public'}
                                onChange={(e) => {
                                  setNewVisibility(e.target.value as TileVisibility);
                                  setShowUserSelector(false);
                                }}
                                className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                              />
                              <span className="text-sm text-slate-700 dark:text-slate-300">Public - Available for everyone (guests and logged in users)</span>
                            </label>
                          )}
                          {/* Authenticated - Only for admins */}
                          {user && user.is_admin && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="editVisibility-hyperlink"
                                value="authenticated"
                                checked={newVisibility === 'authenticated'}
                                onChange={(e) => {
                                  setNewVisibility(e.target.value as TileVisibility);
                                  setShowUserSelector(false);
                                }}
                                className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                              />
                              <span className="text-sm text-slate-700 dark:text-slate-300">Authenticated - Available for logged in users only</span>
                            </label>
                          )}
                          {/* Private - For admins and authenticated users */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="editVisibility-hyperlink"
                              value="private"
                              checked={newVisibility === 'private'}
                              onChange={(e) => {
                                setNewVisibility(e.target.value as TileVisibility);
                                setShowUserSelector(true);
                              }}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Private - Available for specific users only</span>
                          </label>
                        </div>

                        {/* User and Group Selector for Private Visibility */}
                        {newVisibility === 'private' && isAuthenticated && (
                          <div className="mt-3 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            {/* Tabs */}
                            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                              <button
                                type="button"
                                onClick={() => setVisibilityActiveTab('users')}
                                className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${visibilityActiveTab === 'users'
                                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                  }`}
                              >
                                USERS ({newAllowedUsers.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setVisibilityActiveTab('groups')}
                                className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${visibilityActiveTab === 'groups'
                                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                  }`}
                              >
                                GROUPS ({newAllowedGroups.length})
                              </button>
                            </div>

                            {/* Search Input */}
                            <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={visibilitySearchTerm}
                                  onChange={(e) => setVisibilitySearchTerm(e.target.value)}
                                  placeholder={`Search ${visibilityActiveTab}...`}
                                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pl-9 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                {visibilitySearchTerm && (
                                  <button
                                    type="button"
                                    onClick={() => setVisibilitySearchTerm('')}
                                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Content */}
                            <div className="max-h-64 overflow-y-auto p-2 bg-white dark:bg-slate-800">
                              {visibilityActiveTab === 'users' && (
                                isLoadingUsers ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading users...</div>
                                ) : safeAvailableUsers.length === 0 ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users available</div>
                                ) : (
                                  <div className="space-y-1">
                                    {safeAvailableUsers
                                      .filter(u => {
                                        const searchLower = visibilitySearchTerm.toLowerCase();
                                        return u.username.toLowerCase().includes(searchLower) ||
                                          u.email?.toLowerCase().includes(searchLower);
                                      })
                                      .map(u => {
                                        const isOwner = editingTile && editingTile.userId && u.id === (typeof editingTile.userId === 'string' ? parseInt(editingTile.userId, 10) : editingTile.userId);
                                        return (
                                          <label
                                            key={u.id}
                                            className={`flex items-center gap-2 p-2 rounded ${isOwner
                                              ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 cursor-not-allowed'
                                              : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50'
                                              }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={newAllowedUsers.includes(u.id) || isOwner}
                                              disabled={isOwner}
                                              onChange={(e) => {
                                                if (isOwner) return;
                                                if (e.target.checked) {
                                                  setNewAllowedUsers([...newAllowedUsers, u.id]);
                                                } else {
                                                  setNewAllowedUsers(newAllowedUsers.filter(id => id !== u.id));
                                                }
                                              }}
                                              className={`w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded ${isOwner ? 'opacity-50 cursor-not-allowed' : ''
                                                }`}
                                            />
                                            <span className={`text-sm flex-1 ${isOwner
                                              ? 'text-amber-800 dark:text-amber-200 font-medium'
                                              : 'text-slate-700 dark:text-slate-300'
                                              }`}>
                                              {u.username}
                                            </span>
                                            {isOwner && (
                                              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-semibold uppercase">
                                                Owner
                                              </span>
                                            )}
                                            {u.auth_source && u.auth_source !== 'local' && (
                                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
                                                {u.auth_source.toUpperCase()}
                                              </span>
                                            )}
                                          </label>
                                        );
                                      })}
                                    {safeAvailableUsers.filter(u => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return u.username.toLowerCase().includes(searchLower) ||
                                        u.email?.toLowerCase().includes(searchLower);
                                    }).length === 0 && (
                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users found</div>
                                      )}
                                  </div>
                                )
                              )}

                              {visibilityActiveTab === 'groups' && (
                                isLoadingGroups ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading groups...</div>
                                ) : safeAvailableGroups.length === 0 ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups available</div>
                                ) : (
                                  <div className="space-y-1">
                                    {safeAvailableGroups
                                      .filter(g => {
                                        const searchLower = visibilitySearchTerm.toLowerCase();
                                        return g.name.toLowerCase().includes(searchLower) ||
                                          (g.description || '').toLowerCase().includes(searchLower);
                                      })
                                      .map(g => (
                                        <label
                                          key={g.id}
                                          className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={newAllowedGroups.includes(g.id)}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setNewAllowedGroups([...newAllowedGroups, g.id]);
                                              } else {
                                                setNewAllowedGroups(newAllowedGroups.filter(id => id !== g.id));
                                              }
                                            }}
                                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded"
                                          />
                                          <div className="flex-1">
                                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{g.name}</div>
                                            {g.description && (
                                              <div className="text-xs text-slate-500 dark:text-slate-400">{g.description}</div>
                                            )}
                                          </div>
                                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                            {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                                          </span>
                                        </label>
                                      ))}
                                    {safeAvailableGroups.filter(g => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return g.name.toLowerCase().includes(searchLower) ||
                                        (g.description || '').toLowerCase().includes(searchLower);
                                    }).length === 0 && (
                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups found</div>
                                      )}
                                  </div>
                                )
                              )}
                            </div>

                            {newVisibility === 'private' && newAllowedUsers.length === 0 && newAllowedGroups.length === 0 && (
                              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-700">
                                Please select at least one user or group for private hyperlinks
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Visibility Settings - Only for regular spaces */}
                    {tileType === 'space' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Visibility</label>
                        <div className="space-y-2">
                          <label className={`flex items-center gap-2 cursor-pointer ${user && !user.is_admin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <input
                              type="radio"
                              name="editVisibility"
                              value="public"
                              checked={newVisibility === 'public'}
                              disabled={!!(user && !user.is_admin)}
                              onChange={(e) => {
                                setNewVisibility(e.target.value as TileVisibility);
                                setShowUserSelector(false);
                              }}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Public - Available for everyone (guests and logged in users)</span>
                          </label>
                          <label className={`flex items-center gap-2 cursor-pointer ${user && !user.is_admin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <input
                              type="radio"
                              name="editVisibility"
                              value="authenticated"
                              checked={newVisibility === 'authenticated'}
                              disabled={!!(user && !user.is_admin)}
                              onChange={(e) => {
                                setNewVisibility(e.target.value as TileVisibility);
                                setShowUserSelector(false);
                              }}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Authenticated - Available for logged in users only</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="editVisibility"
                              value="private"
                              checked={newVisibility === 'private'}
                              onChange={(e) => {
                                setNewVisibility(e.target.value as TileVisibility);
                                setShowUserSelector(true);
                              }}
                              className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                            />
                            <span className="text-sm text-slate-700 dark:text-slate-300">Private - Available for specific users only</span>
                          </label>
                        </div>

                        {/* User and Group Selector for Private Visibility */}
                        {newVisibility === 'private' && isAuthenticated && (
                          <div className="mt-3 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            {/* Tabs */}
                            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                              <button
                                type="button"
                                onClick={() => setVisibilityActiveTab('users')}
                                className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${visibilityActiveTab === 'users'
                                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                  }`}
                              >
                                USERS ({newAllowedUsers.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setVisibilityActiveTab('groups')}
                                className={`flex-1 px-4 py-2 text-xs font-semibold transition-colors ${visibilityActiveTab === 'groups'
                                  ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                                  }`}
                              >
                                GROUPS ({newAllowedGroups.length})
                              </button>
                            </div>

                            {/* Search Input */}
                            <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                              <div className="relative">
                                <input
                                  type="text"
                                  value={visibilitySearchTerm}
                                  onChange={(e) => setVisibilitySearchTerm(e.target.value)}
                                  placeholder={`Search ${visibilityActiveTab}...`}
                                  className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 pl-9 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                {visibilitySearchTerm && (
                                  <button
                                    type="button"
                                    onClick={() => setVisibilitySearchTerm('')}
                                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Content */}
                            <div className="max-h-64 overflow-y-auto p-2 bg-white dark:bg-slate-800">
                              {visibilityActiveTab === 'users' && (
                                isLoadingUsers ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading users...</div>
                                ) : safeAvailableUsers.length === 0 ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users available</div>
                                ) : (
                                  <div className="space-y-1">
                                    {safeAvailableUsers
                                      .filter(u => {
                                        const searchLower = visibilitySearchTerm.toLowerCase();
                                        return u.username.toLowerCase().includes(searchLower) ||
                                          u.email?.toLowerCase().includes(searchLower);
                                      })
                                      .map(u => {
                                        const isOwner = editingTile && editingTile.userId && u.id === (typeof editingTile.userId === 'string' ? parseInt(editingTile.userId, 10) : editingTile.userId);
                                        return (
                                          <label
                                            key={u.id}
                                            className={`flex items-center gap-2 p-2 rounded ${isOwner
                                              ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 cursor-not-allowed'
                                              : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50'
                                              }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={newAllowedUsers.includes(u.id) || isOwner}
                                              disabled={isOwner}
                                              onChange={(e) => {
                                                if (isOwner) return;
                                                if (e.target.checked) {
                                                  setNewAllowedUsers([...newAllowedUsers, u.id]);
                                                } else {
                                                  setNewAllowedUsers(newAllowedUsers.filter(id => id !== u.id));
                                                }
                                              }}
                                              className={`w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded ${isOwner ? 'opacity-50 cursor-not-allowed' : ''
                                                }`}
                                            />
                                            <span className={`text-sm flex-1 ${isOwner
                                              ? 'text-amber-800 dark:text-amber-200 font-medium'
                                              : 'text-slate-700 dark:text-slate-300'
                                              }`}>
                                              {u.username}
                                            </span>
                                            {isOwner && (
                                              <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-semibold uppercase">
                                                Owner
                                              </span>
                                            )}
                                            {u.auth_source && u.auth_source !== 'local' && (
                                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
                                                {u.auth_source.toUpperCase()}
                                              </span>
                                            )}
                                          </label>
                                        );
                                      })}
                                    {safeAvailableUsers.filter(u => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return u.username.toLowerCase().includes(searchLower) ||
                                        u.email?.toLowerCase().includes(searchLower);
                                    }).length === 0 && (
                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No users found</div>
                                      )}
                                  </div>
                                )
                              )}

                              {visibilityActiveTab === 'groups' && (
                                isLoadingGroups ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">Loading groups...</div>
                                ) : safeAvailableGroups.length === 0 ? (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups available</div>
                                ) : (
                                  <div className="space-y-1">
                                    {safeAvailableGroups
                                      .filter(g => {
                                        const searchLower = visibilitySearchTerm.toLowerCase();
                                        return g.name.toLowerCase().includes(searchLower) ||
                                          (g.description || '').toLowerCase().includes(searchLower);
                                      })
                                      .map(g => (
                                        <label
                                          key={g.id}
                                          className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={newAllowedGroups.includes(g.id)}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setNewAllowedGroups([...newAllowedGroups, g.id]);
                                              } else {
                                                setNewAllowedGroups(newAllowedGroups.filter(id => id !== g.id));
                                              }
                                            }}
                                            className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded"
                                          />
                                          <div className="flex-1">
                                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{g.name}</div>
                                            {g.description && (
                                              <div className="text-xs text-slate-500 dark:text-slate-400">{g.description}</div>
                                            )}
                                          </div>
                                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                            {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
                                          </span>
                                        </label>
                                      ))}
                                    {safeAvailableGroups.filter(g => {
                                      const searchLower = visibilitySearchTerm.toLowerCase();
                                      return g.name.toLowerCase().includes(searchLower) ||
                                        (g.description || '').toLowerCase().includes(searchLower);
                                    }).length === 0 && (
                                        <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No groups found</div>
                                      )}
                                  </div>
                                )
                              )}
                            </div>

                            {newVisibility === 'private' && newAllowedUsers.length === 0 && newAllowedGroups.length === 0 && (
                              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-700">
                                Please select at least one user or group for private spaces
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    </FormSection>

                    <FormSection emoji="🎨" title="Look & Feel" accent="violet">
                    {/* Emoji & Theme */}
                    <div className="flex gap-3">
                      <div className="w-24 relative">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Icon</label>
                        <button
                          type="button"
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          className="w-full h-12 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:ring-2 focus:ring-brand-500/50 overflow-hidden"
                        >
                          {newEmojiImage ? (
                            <img
                              src={newEmojiImage}
                              alt=""
                              className="w-8 h-8 object-contain"
                              style={{
                                opacity: Math.max(0, Math.min(100, newEmojiImageOpacity)) / 100,
                                transform: `translate(${Math.max(-50, Math.min(50, newEmojiImageOffsetX))}px, ${Math.max(-50, Math.min(50, newEmojiImageOffsetY))}px) scale(${Math.max(50, Math.min(300, newEmojiImageZoom)) / 100})`
                              }}
                            />
                          ) : (
                            newEmoji || (tileType === 'hyperlink' ? '🔗' : '📁')
                          )}
                        </button>

                        {/* Emoji Picker Popover */}
                        {showEmojiPicker && (
                          <>
                            <div className="fixed inset-0 z-[10001]" onClick={() => setShowEmojiPicker(false)}></div>
                            <div className="absolute top-full left-0 mt-2 w-64 h-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[10002] flex flex-col overflow-hidden">
                              <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                <input
                                  type="text"
                                  value={newEmoji}
                                  onChange={(e) => setNewEmoji(e.target.value)}
                                  placeholder="Type emoji..."
                                  className="w-full text-sm px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/50 text-slate-900 dark:text-white"
                                  autoFocus
                                />
                              </div>
                              <div className="flex-1 overflow-y-auto p-2 grid grid-cols-8 gap-1">
                                {POPULAR_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() => { setNewEmoji(emoji); setNewEmojiImage(''); setNewEmojiImageOpacity(100); setNewEmojiImageOffsetX(0); setNewEmojiImageOffsetY(0); setNewEmojiImageZoom(100); setShowEmojiPicker(false); }}
                                    className="w-8 h-8 flex items-center justify-center text-lg hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                        <div className="mt-1.5 flex flex-col gap-1">
                          <label className={`inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border cursor-pointer transition-colors ${emojiImageUploading ? 'opacity-60 pointer-events-none' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'} text-slate-700 dark:text-slate-200`}>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,.jpg,.jpeg,.png,.gif,.webp,.bmp"
                              className="hidden"
                              disabled={emojiImageUploading}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (!file) return;
                                setEmojiImageUploading(true);
                                try {
                                  const url = await uploadTileEmojiImage(file, {
                                    removeBackground: emojiRemoveBg,
                                    bgColor: emojiRemoveBg && emojiBgMode === 'custom' ? emojiBgColor : undefined
                                  });
                                  setNewEmojiImage(url);
                                  setNewEmojiImageOpacity(100);
                                  setNewEmojiImageOffsetX(0);
                                  setNewEmojiImageOffsetY(0);
                                  setNewEmojiImageZoom(100);
                                } catch (err) {
                                  alert(err instanceof Error ? err.message : 'Failed to upload emoji image');
                                } finally {
                                  setEmojiImageUploading(false);
                                }
                              }}
                            />
                            {emojiImageUploading ? '…' : (newEmojiImage ? 'Replace' : 'Image')}
                          </label>
                          {newEmojiImage ? (
                            <button
                              type="button"
                              onClick={() => {
                                setNewEmojiImage('');
                                setNewEmojiImageOpacity(100);
                                setNewEmojiImageOffsetX(0);
                                setNewEmojiImageOffsetY(0);
                                setNewEmojiImageZoom(100);
                              }}
                              className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline"
                            >
                              Remove image
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Theme</label>
                        <div className="grid grid-cols-9 gap-1.5">
                          {THEME_COLORS.map(c => (
                            <button
                              key={c}
                              onClick={() => setNewColor(c)}
                              className={`
                          w-8 h-8 rounded-lg border-2 transition-all relative overflow-hidden
                          ${newColor === c ? 'border-brand-500 scale-110 shadow-md shadow-brand-500/30' : 'border-slate-200 dark:border-slate-700 hover:scale-105'} 
                        `}
                              title={c}
                            >
                              <div className={`absolute inset-0 ${COLOR_STYLES[c].base} rounded-md`}></div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {newEmojiImage ? (
                      <div className="space-y-2 mb-1">
                        <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                          <span className="w-20 shrink-0">Opacity</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={newEmojiImageOpacity}
                            onChange={(e) => setNewEmojiImageOpacity(Number(e.target.value))}
                            className="flex-1 accent-brand-500"
                          />
                          <span className="w-10 text-right tabular-nums">{newEmojiImageOpacity}%</span>
                        </label>
                        <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                          <span className="w-20 shrink-0">Zoom</span>
                          <input
                            type="range"
                            min={50}
                            max={300}
                            value={newEmojiImageZoom}
                            onChange={(e) => setNewEmojiImageZoom(Number(e.target.value))}
                            className="flex-1 accent-brand-500"
                          />
                          <span className="w-12 text-right tabular-nums">{newEmojiImageZoom}%</span>
                          <button
                            type="button"
                            onClick={() => setNewEmojiImageZoom(100)}
                            className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            Reset
                          </button>
                        </label>
                        <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                          <span className="w-20 shrink-0">Position X</span>
                          <input
                            type="range"
                            min={-50}
                            max={50}
                            value={newEmojiImageOffsetX}
                            onChange={(e) => setNewEmojiImageOffsetX(Number(e.target.value))}
                            className="flex-1 accent-brand-500"
                          />
                          <span className="w-12 text-right tabular-nums">{newEmojiImageOffsetX}px</span>
                          <button
                            type="button"
                            onClick={() => setNewEmojiImageOffsetX(0)}
                            className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            Reset
                          </button>
                        </label>
                        <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                          <span className="w-20 shrink-0">Position Y</span>
                          <input
                            type="range"
                            min={-50}
                            max={50}
                            value={newEmojiImageOffsetY}
                            onChange={(e) => setNewEmojiImageOffsetY(Number(e.target.value))}
                            className="flex-1 accent-brand-500"
                          />
                          <span className="w-12 text-right tabular-nums">{newEmojiImageOffsetY}px</span>
                          <button
                            type="button"
                            onClick={() => setNewEmojiImageOffsetY(0)}
                            className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            Reset
                          </button>
                        </label>
                        <button
                          type="button"
                          onClick={() => { setNewEmojiImageOffsetX(0); setNewEmojiImageOffsetY(0); setNewEmojiImageZoom(100); setNewEmojiImageOpacity(100); }}
                          className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                        >
                          Reset position
                        </button>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={newShowEmoji}
                          onChange={(e) => setNewShowEmoji(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Show emoji on card</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={newShowTitle}
                          onChange={(e) => setNewShowTitle(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Show title on card</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={newShowDescription}
                          onChange={(e) => setNewShowDescription(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Show description on card</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={emojiRemoveBg}
                            onChange={(e) => setEmojiRemoveBg(e.target.checked)}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          Remove emoji image background
                        </label>
                        {emojiRemoveBg ? (
                          <>
                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                              <input type="radio" name="emojiBgModeEdit" checked={emojiBgMode === 'auto'} onChange={() => setEmojiBgMode('auto')} />
                              Auto (corners)
                            </label>
                            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                              <input type="radio" name="emojiBgModeEdit" checked={emojiBgMode === 'custom'} onChange={() => setEmojiBgMode('custom')} />
                              Pick color
                            </label>
                            {emojiBgMode === 'custom' ? (
                              <input
                                type="color"
                                value={emojiBgColor}
                                onChange={(e) => setEmojiBgColor(e.target.value)}
                                className="w-7 h-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                                title="Background color to remove"
                              />
                            ) : null}
                          </>
                        ) : null}
                        {newEmojiImage && emojiRemoveBg ? (
                          <button
                            type="button"
                            disabled={emojiImageUploading}
                            onClick={async () => {
                              setEmojiImageUploading(true);
                              try {
                                const url = await uploadTileEmojiImage(null, {
                                  sourceUrl: newEmojiImage,
                                  removeBackground: true,
                                  bgColor: emojiBgMode === 'custom' ? emojiBgColor : undefined
                                });
                                setNewEmojiImage(url);
                              } catch (err) {
                                alert(err instanceof Error ? err.message : 'Failed to remove background');
                              } finally {
                                setEmojiImageUploading(false);
                              }
                            }}
                            className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Apply to current image
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Header image */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Header image</label>
                      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                        Place freely on the tile card. Use the tile-sized preview below to align X/Y. Other formats convert to PNG automatically.
                      </p>
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border cursor-pointer transition-colors ${headerImageUploading ? 'opacity-60 pointer-events-none' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'} text-slate-700 dark:text-slate-200`}>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,.jpg,.jpeg,.png,.gif,.webp,.bmp"
                              className="hidden"
                              disabled={headerImageUploading}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (!file) return;
                                setHeaderImageUploading(true);
                                try {
                                  const url = await uploadTileHeaderImage(file, {
                                    removeBackground: headerRemoveBg,
                                    bgColor: headerRemoveBg && headerBgMode === 'custom' ? headerBgColor : undefined
                                  });
                                  setNewHeaderImage(url);
                                } catch (err) {
                                  console.error(err);
                                  alert(err instanceof Error ? err.message : 'Failed to upload header image');
                                } finally {
                                  setHeaderImageUploading(false);
                                }
                              }}
                            />
                            {headerImageUploading ? 'Uploading…' : (newHeaderImage ? 'Replace image' : 'Upload image')}
                          </label>
                          {newHeaderImage ? (
                            <button
                              type="button"
                              onClick={() => setNewHeaderImage('')}
                              className="text-sm text-red-600 dark:text-red-400 hover:underline"
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-600 dark:text-slate-400 mr-1">Align</span>
                            {(['left', 'center', 'right'] as const).map((align) => (
                              <button
                                key={align}
                                type="button"
                                onClick={() => setNewHeaderImageAlign(align)}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${newHeaderImageAlign === align ? 'bg-brand-500 text-white border-brand-500' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}
                              >
                                {align.charAt(0).toUpperCase() + align.slice(1)}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-600 dark:text-slate-400 mr-1">Fit</span>
                            <button
                              type="button"
                              onClick={() => setNewHeaderImageFit('contain')}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${newHeaderImageFit === 'contain' ? 'bg-brand-500 text-white border-brand-500' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}
                              title="Scale image to fit inside the region (no crop)"
                            >
                              Center fit
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewHeaderImageFit('cover')}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${newHeaderImageFit === 'cover' ? 'bg-brand-500 text-white border-brand-500' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'}`}
                              title="Scale image to fill the region completely (may crop)"
                            >
                              Fill region
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={handleApplyTile}
                            disabled={isEditFormInvalid || isUpdatingTile}
                            title="Save changes and refresh the live tile without closing this dialog"
                            className="ml-auto px-3 py-1 rounded-md text-xs font-semibold border border-brand-500 bg-brand-500 text-white hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isUpdatingTile ? 'Applying…' : 'Apply'}
                          </button>
                        </div>
                        {newHeaderImage ? (
                          <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner">
                            <HeaderImageTilePreview
                              headerImage={newHeaderImage}
                              align={newHeaderImageAlign}
                              fit={newHeaderImageFit}
                              opacity={newHeaderImageOpacity}
                              offsetX={newHeaderImageOffsetX}
                              offsetY={newHeaderImageOffsetY}
                              zoom={newHeaderImageZoom}
                              emoji={newEmoji}
                              emojiImage={newEmojiImage || undefined}
                              emojiImageOpacity={newEmojiImageOpacity}
                              emojiImageOffsetX={newEmojiImageOffsetX}
                              emojiImageOffsetY={newEmojiImageOffsetY}
                              emojiImageZoom={newEmojiImageZoom}
                              showEmoji={newShowEmoji}
                              title={newTitle}
                              description={newDesc}
                              showTitle={newShowTitle}
                              showDescription={newShowDescription}
                              themeColor={newColor}
                            />
                          </div>
                        ) : null}
                        {newHeaderImage ? (
                          <div className="space-y-2 mb-3">
                            <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                              <span className="w-20 shrink-0">Opacity</span>
                              <input
                                type="range"
                                min={0}
                                max={100}
                                value={newHeaderImageOpacity}
                                onChange={(e) => setNewHeaderImageOpacity(Number(e.target.value))}
                                className="flex-1 accent-brand-500"
                              />
                              <span className="w-10 text-right tabular-nums">{newHeaderImageOpacity}%</span>
                            </label>
                            <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                              <span className="w-20 shrink-0">Zoom</span>
                              <input
                                type="range"
                                min={50}
                                max={300}
                                value={newHeaderImageZoom}
                                onChange={(e) => setNewHeaderImageZoom(Number(e.target.value))}
                                className="flex-1 accent-brand-500"
                              />
                              <span className="w-12 text-right tabular-nums">{newHeaderImageZoom}%</span>
                              <button
                                type="button"
                                onClick={() => setNewHeaderImageZoom(100)}
                                className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                              >
                                Reset
                              </button>
                            </label>
                            <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                              <span className="w-20 shrink-0">Position X</span>
                              <input
                                type="range"
                                min={-300}
                                max={300}
                                value={newHeaderImageOffsetX}
                                onChange={(e) => setNewHeaderImageOffsetX(Number(e.target.value))}
                                className="flex-1 accent-brand-500"
                              />
                              <span className="w-12 text-right tabular-nums">{newHeaderImageOffsetX}px</span>
                              <button
                                type="button"
                                onClick={() => setNewHeaderImageOffsetX(0)}
                                className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                              >
                                Reset
                              </button>
                            </label>
                            <label className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                              <span className="w-20 shrink-0">Position Y</span>
                              <input
                                type="range"
                                min={-300}
                                max={300}
                                value={newHeaderImageOffsetY}
                                onChange={(e) => setNewHeaderImageOffsetY(Number(e.target.value))}
                                className="flex-1 accent-brand-500"
                              />
                              <span className="w-12 text-right tabular-nums">{newHeaderImageOffsetY}px</span>
                              <button
                                type="button"
                                onClick={() => setNewHeaderImageOffsetY(0)}
                                className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                              >
                                Reset
                              </button>
                            </label>
                            <button
                              type="button"
                              onClick={() => { setNewHeaderImageOffsetX(0); setNewHeaderImageOffsetY(0); setNewHeaderImageZoom(100); }}
                              className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                            >
                              Reset position
                            </button>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={headerRemoveBg}
                              onChange={(e) => setHeaderRemoveBg(e.target.checked)}
                              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                            Remove background
                          </label>
                          {headerRemoveBg ? (
                            <>
                              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                                <input type="radio" name="headerBgModeEdit" checked={headerBgMode === 'auto'} onChange={() => setHeaderBgMode('auto')} />
                                Auto (corners)
                              </label>
                              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                                <input type="radio" name="headerBgModeEdit" checked={headerBgMode === 'custom'} onChange={() => setHeaderBgMode('custom')} />
                                Pick color
                              </label>
                              {headerBgMode === 'custom' ? (
                                <input
                                  type="color"
                                  value={headerBgColor}
                                  onChange={(e) => setHeaderBgColor(e.target.value)}
                                  className="w-7 h-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                                  title="Background color to remove"
                                />
                              ) : null}
                            </>
                          ) : null}
                          {newHeaderImage && headerRemoveBg ? (
                            <button
                              type="button"
                              disabled={headerImageUploading}
                              onClick={async () => {
                                setHeaderImageUploading(true);
                                try {
                                  const url = await uploadTileHeaderImage(null, {
                                    sourceUrl: newHeaderImage,
                                    removeBackground: true,
                                    bgColor: headerBgMode === 'custom' ? headerBgColor : undefined
                                  });
                                  setNewHeaderImage(url);
                                } catch (err) {
                                  console.error(err);
                                  alert(err instanceof Error ? err.message : 'Failed to remove background');
                                } finally {
                                  setHeaderImageUploading(false);
                                }
                              }}
                              className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              Apply to current image
                            </button>
                          ) : null}
                        </div>
                      </div>

                    </FormSection>

                    <FormSection emoji="🗂️" title="Organization" accent="indigo">
                    {/* Category */}
                    <div>
                      <FormLabel emoji="📂">Category</FormLabel>
                      <input
                        type="text"
                        value={newGroup}
                        onChange={(e) => setNewGroup(e.target.value)}
                        placeholder="Select or create a category (e.g., Work, Personal)"
                        list="category-suggestions-edit"
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                      />
                      <datalist id="category-suggestions-edit">
                        {userOwnedCategories.map(cat => <option key={cat} value={cat} />)}
                      </datalist>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select an existing category or type a new name to create one</p>
                    </div>

                    </FormSection>

                    {tileType === 'space' && (
                    <FormSection emoji="🗓️" title="Scheduling" accent="emerald">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <FormLabel emoji="🌱">Available From</FormLabel>
                          <input
                            type="datetime-local"
                            value={visibleFrom}
                            onChange={(e) => setVisibleFrom(e.target.value)}
                            className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                          />
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for immediate availability</p>
                        </div>
                        <div>
                          <FormLabel emoji="⏰">Expires At</FormLabel>
                          <input
                            type="datetime-local"
                            value={expiresAt}
                            onChange={(e) => setExpiresAt(e.target.value)}
                            min={visibleFrom || undefined}
                            className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                          />
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for no expiry</p>
                        </div>
                      </div>
                    </FormSection>
                    )}

                  </>
                ) : (
                  <>
                    {/* Reset All Decoration */}
                    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mb-0.5">Reset Tile Decoration</p>
                          <p className="text-xs text-amber-700 dark:text-amber-300">Clear all decoration settings to use global style manager styles</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (confirm('Clear all tile decoration settings? This will reset the tile to use global style manager styles.')) {
                              if (!editingTile) return;

                              // Clear all decoration state
                              setTileBackgroundColor('');
                              setTileGradientEnabled(false);
                              setTileGradientColors(['#3b82f6', '#8b5cf6']);
                              setTileGradientColorPositions([0, 100]);
                              setTileGradientDirection(90);
                              setTileGradientType('linear');
                              setTileBorderRadius(12);
                              setTileTextColor('');

                              // Create updated tile with all decoration properties set to undefined
                              const updatedTile: Tile = {
                                ...editingTile,
                                tileBackgroundColor: undefined,
                                tileGradientEnabled: undefined,
                                tileGradientColors: undefined,
                                tileGradientColorPositions: undefined,
                                tileGradientDirection: undefined,
                                tileGradientType: undefined,
                                tileBorderRadius: undefined,
                                tileTextColor: undefined
                              };

                              try {
                                // Update local state (staging vs public)
                                const sourceTiles = activeTab === 'staging' ? stagingTiles : tiles;
                                const updatedTiles = sourceTiles.map(t => t.id === updatedTile.id ? updatedTile : t);
                                if (activeTab === 'staging') {
                                  setStagingTiles(updatedTiles);
                                } else {
                                  onUpdateTiles(updatedTiles);
                                }

                                // Save to backend if authenticated
                                if (isAuthenticated) {
                                  await saveTile(updatedTile);
                                }

                                // Update editing tile to reflect changes
                                setEditingTile(updatedTile);
                              } catch (error) {
                                console.error('Failed to reset tile decoration:', error);
                                alert('Failed to reset tile decoration. Please try again.');
                              }
                            }
                          }}
                          className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 rounded-lg transition-colors shadow-sm hover:shadow-md"
                        >
                          Reset All
                        </button>
                      </div>
                    </div>

                    {/* Background Color */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Background Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={tileBackgroundColor || '#ffffff'}
                          onChange={(e) => setTileBackgroundColor(e.target.value)}
                          className="w-16 h-10 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={tileBackgroundColor}
                          onChange={(e) => setTileBackgroundColor(e.target.value)}
                          placeholder="#ffffff"
                          className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                        />
                        {tileBackgroundColor && (
                          <button
                            onClick={() => setTileBackgroundColor('')}
                            className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty to use default theme color</p>
                    </div>

                    {/* Gradient Settings */}
                    <div>
                      <label className="flex items-center gap-2 mb-1.5">
                        <input
                          type="checkbox"
                          checked={tileGradientEnabled}
                          onChange={(e) => setTileGradientEnabled(e.target.checked)}
                          className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2 rounded"
                        />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Enable Gradient Background</span>
                      </label>

                      {tileGradientEnabled && (
                        <div className="space-y-3 mt-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                          {/* Gradient Type */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Gradient Type</label>
                            <div className="grid grid-cols-3 gap-2">
                              {(['linear', 'radial', 'conic', 'repeating-linear', 'repeating-radial', 'repeating-conic'] as const).map((type) => (
                                <button
                                  key={type}
                                  onClick={() => setTileGradientType(type)}
                                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${tileGradientType === type
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                                    }`}
                                >
                                  {type.includes('repeating-')
                                    ? type.replace('repeating-', 'R-').charAt(0).toUpperCase() + type.replace('repeating-', 'R-').slice(1)
                                    : type.charAt(0).toUpperCase() + type.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Gradient Direction - Slider */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                              Gradient Direction/Angle: {tileGradientDirection}°
                            </label>
                            <div className="flex gap-2 items-center">
                              <input
                                type="range"
                                min="0"
                                max="360"
                                value={tileGradientDirection}
                                onChange={(e) => setTileGradientDirection(parseInt(e.target.value))}
                                className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-600"
                              />
                              <input
                                type="number"
                                min="0"
                                max="360"
                                value={tileGradientDirection}
                                onChange={(e) => setTileGradientDirection(parseInt(e.target.value) || 0)}
                                className="w-20 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                              />
                              <span className="text-xs text-slate-500 dark:text-slate-400">deg</span>
                            </div>
                            <div className="mt-2 flex gap-1 justify-between text-xs text-slate-500 dark:text-slate-400">
                              <span>0° (Top)</span>
                              <span>90° (Right)</span>
                              <span>180° (Bottom)</span>
                              <span>270° (Left)</span>
                              <span>360°</span>
                            </div>
                          </div>

                          {/* Gradient Colors with Position Controls */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Gradient Colors</label>
                            <div className="space-y-2">
                              {tileGradientColors.map((color, index) => (
                                <div key={index} className="space-y-2 p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                  <div className="flex gap-2 items-center">
                                    <input
                                      type="color"
                                      value={color}
                                      onChange={(e) => {
                                        const newColors = [...tileGradientColors];
                                        newColors[index] = e.target.value;
                                        setTileGradientColors(newColors);
                                      }}
                                      className="w-12 h-10 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                                    />
                                    <input
                                      type="text"
                                      value={color}
                                      onChange={(e) => {
                                        const newColors = [...tileGradientColors];
                                        newColors[index] = e.target.value;
                                        setTileGradientColors(newColors);
                                      }}
                                      placeholder="#000000"
                                      className="flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400"
                                    />
                                    {tileGradientColors.length > 2 && (
                                      <button
                                        onClick={() => {
                                          const newColors = tileGradientColors.filter((_, i) => i !== index);
                                          const newPositions = tileGradientColorPositions.filter((_, i) => i !== index);
                                          setTileGradientColors(newColors);
                                          setTileGradientColorPositions(newPositions);
                                        }}
                                        className="px-3 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                      >
                                        Remove
                                      </button>
                                    )}
                                  </div>
                                  {/* Color Position Control */}
                                  <div className="flex gap-2 items-center">
                                    <label className="text-xs text-slate-600 dark:text-slate-400 w-16">Position:</label>
                                    <input
                                      type="range"
                                      min="0"
                                      max="100"
                                      value={tileGradientColorPositions[index] ?? (index / (tileGradientColors.length - 1)) * 100}
                                      onChange={(e) => {
                                        const newPositions = [...tileGradientColorPositions];
                                        newPositions[index] = parseInt(e.target.value);
                                        setTileGradientColorPositions(newPositions);
                                      }}
                                      className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-600"
                                    />
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={tileGradientColorPositions[index] ?? (index / (tileGradientColors.length - 1)) * 100}
                                      onChange={(e) => {
                                        const newPositions = [...tileGradientColorPositions];
                                        newPositions[index] = parseInt(e.target.value) || 0;
                                        setTileGradientColorPositions(newPositions);
                                      }}
                                      className="w-16 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                                    />
                                    <span className="text-xs text-slate-500 dark:text-slate-400 w-6">%</span>
                                  </div>
                                </div>
                              ))}
                              {tileGradientColors.length < 5 && (
                                <button
                                  onClick={() => {
                                    setTileGradientColors([...tileGradientColors, '#000000']);
                                    // Add position for new color (evenly spaced)
                                    const newPosition = (tileGradientColors.length / (tileGradientColors.length + 1)) * 100;
                                    setTileGradientColorPositions([...tileGradientColorPositions, newPosition]);
                                  }}
                                  className="w-full px-3 py-2 text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 hover:bg-brand-100 dark:hover:bg-brand-500/20 rounded-lg transition-colors border border-brand-200 dark:border-brand-500/30"
                                >
                                  + Add Color
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Gradient Preview */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Preview</label>
                            <div
                              className="w-full h-20 rounded-lg border border-slate-200 dark:border-slate-700"
                              style={{
                                background: (() => {
                                  const hasPositions = tileGradientColorPositions && tileGradientColorPositions.length === tileGradientColors.length;
                                  const gradientStops = tileGradientColors.map((color, i) => {
                                    if (hasPositions) {
                                      return `${color} ${tileGradientColorPositions[i]}%`;
                                    }
                                    return color;
                                  }).join(', ');

                                  if (tileGradientType === 'linear' || tileGradientType === 'repeating-linear') {
                                    const prefix = tileGradientType === 'repeating-linear' ? 'repeating-linear-gradient' : 'linear-gradient';
                                    return `${prefix}(${tileGradientDirection}deg, ${gradientStops})`;
                                  } else if (tileGradientType === 'radial' || tileGradientType === 'repeating-radial') {
                                    const prefix = tileGradientType === 'repeating-radial' ? 'repeating-radial-gradient' : 'radial-gradient';
                                    return `${prefix}(circle, ${gradientStops})`;
                                  } else if (tileGradientType === 'conic' || tileGradientType === 'repeating-conic') {
                                    const prefix = tileGradientType === 'repeating-conic' ? 'repeating-conic-gradient' : 'conic-gradient';
                                    return `${prefix}(from ${tileGradientDirection}deg, ${gradientStops})`;
                                  }
                                  return `linear-gradient(${tileGradientDirection}deg, ${gradientStops})`;
                                })()
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Style Presets */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Style Presets</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          // Metallic Presets
                          { name: 'Gold', colors: ['#FFD700', '#FFA500', '#FF8C00'], direction: 135, textColor: '#fff' },
                          { name: 'Silver', colors: ['#C0C0C0', '#A8A8A8', '#808080'], direction: 135, textColor: '#000' },
                          { name: 'Bronze', colors: ['#CD7F32', '#A0522D', '#8B4513'], direction: 135, textColor: '#fff' },
                          { name: 'Chrome', colors: ['#E8E8E8', '#C0C0C0', '#A0A0A0'], direction: 135, textColor: '#000' },
                          { name: 'Copper', colors: ['#B87333', '#8B4513', '#654321'], direction: 135, textColor: '#fff' },
                          { name: 'Platinum', colors: ['#E5E4E2', '#D3D3D3', '#C0C0C0'], direction: 135, textColor: '#000' },
                          { name: 'Rose Gold', colors: ['#E8B4B8', '#D4A5A9', '#C8969A'], direction: 135, textColor: '#fff' },
                          { name: 'Titanium', colors: ['#878681', '#6B6B6B', '#4F4F4F'], direction: 135, textColor: '#fff' },
                          // Colorful Presets
                          { name: 'Ocean Blue', colors: ['#0077BE', '#00A8E8', '#005F8C'], direction: 135, textColor: '#fff' },
                          { name: 'Sunset', colors: ['#FF6B6B', '#FF8E53', '#FFA07A'], direction: 90, textColor: '#fff' },
                          { name: 'Forest', colors: ['#2D5016', '#3D6B2A', '#4A7C3A'], direction: 180, textColor: '#fff' },
                          { name: 'Purple Dream', colors: ['#6C5CE7', '#A29BFE', '#FD79A8'], direction: 135, textColor: '#fff' },
                          { name: 'Orange Fire', colors: ['#FF5722', '#FF6D00', '#FF8F00'], direction: 90, textColor: '#fff' },
                          { name: 'Mint Fresh', colors: ['#00E676', '#1DE9B6', '#00BFA5'], direction: 135, textColor: '#000' },
                          { name: 'Cherry Blossom', colors: ['#FFB3BA', '#FFDFBA', '#FFFFBA'], direction: 90, textColor: '#333' },
                          { name: 'Midnight', colors: ['#2C3E50', '#34495E', '#1A252F'], direction: 135, textColor: '#fff' },
                          { name: 'Lavender', colors: ['#E1BEE7', '#CE93D8', '#BA68C8'], direction: 180, textColor: '#fff' },
                          { name: 'Emerald', colors: ['#00C853', '#00E676', '#00B248'], direction: 135, textColor: '#fff' },
                          { name: 'Coral Reef', colors: ['#FF6F61', '#FF8E80', '#FFAB91'], direction: 90, textColor: '#fff' },
                          { name: 'Sky Blue', colors: ['#42A5F5', '#64B5F6', '#90CAF9'], direction: 180, textColor: '#fff' },
                          { name: 'Raspberry', colors: ['#D81B60', '#E91E63', '#F06292'], direction: 135, textColor: '#fff' },
                          { name: 'Teal Wave', colors: ['#00897B', '#00ACC1', '#26A69A'], direction: 90, textColor: '#fff' },
                          { name: 'Amber Glow', colors: ['#FFC107', '#FFD54F', '#FFECB3'], direction: 135, textColor: '#000' },
                          { name: 'Deep Purple', colors: ['#673AB7', '#7E57C2', '#9575CD'], direction: 135, textColor: '#fff' },
                          { name: 'Turquoise', colors: ['#009688', '#00BCD4', '#4DD0E1'], direction: 90, textColor: '#fff' },
                          { name: 'Peachy', colors: ['#FF9800', '#FFB74D', '#FFCC80'], direction: 180, textColor: '#fff' },
                          { name: 'Navy', colors: ['#1565C0', '#1976D2', '#1E88E5'], direction: 135, textColor: '#fff' },
                          { name: 'Rose Pink', colors: ['#E91E63', '#F06292', '#F48FB1'], direction: 90, textColor: '#fff' }
                        ].map((preset) => (
                          <button
                            key={preset.name}
                            onClick={() => {
                              setTileGradientEnabled(true);
                              setTileGradientType('linear');
                              setTileGradientDirection(preset.direction);
                              setTileGradientColors(preset.colors);
                              // Set evenly spaced positions for presets
                              const positions = preset.colors.map((_, i) => preset.colors.length > 1 ? (i / (preset.colors.length - 1)) * 100 : 0);
                              setTileGradientColorPositions(positions);
                              setTileTextColor(preset.textColor);
                            }}
                            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-400 transition-all relative overflow-hidden"
                            style={{
                              background: `linear-gradient(${preset.direction}deg, ${preset.colors.join(', ')})`,
                              color: preset.textColor
                            }}
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Text Color */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Text Color</label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="color"
                          value={tileTextColor || '#000000'}
                          onChange={(e) => setTileTextColor(e.target.value)}
                          className="w-16 h-10 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={tileTextColor}
                          onChange={(e) => setTileTextColor(e.target.value)}
                          placeholder="#000000"
                          className="min-w-[7rem] flex-1 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 placeholder-slate-400 transition-all"
                        />
                        {tileTextColor && (
                          <button
                            onClick={() => setTileTextColor('')}
                            className="shrink-0 px-3 py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty to use default text color</p>
                    </div>

                    {/* Border Radius */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Border Radius (px)</label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="range"
                          min="0"
                          max="50"
                          value={tileBorderRadius}
                          onChange={(e) => setTileBorderRadius(parseInt(e.target.value))}
                          className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-600"
                        />
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={tileBorderRadius}
                          onChange={(e) => setTileBorderRadius(parseInt(e.target.value) || 0)}
                          className="w-20 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                        />
                      </div>
                    </div>

                  </>
                )}

                {/* Actions */}
                <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setEditingTile(null);
                      resetForm();
                    }}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateTile}
                    disabled={isEditFormInvalid || isUpdatingTile}
                    className="bg-gradient-to-r from-sky-600 to-indigo-500 hover:from-sky-500 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-md shadow-sky-500/20 hover:shadow-lg hover:shadow-sky-500/30 hover:scale-105 active:scale-95"
                  >
                    {isUpdatingTile
                      ? 'Saving…'
                      : tileType === 'hyperlink'
                        ? '🔗 Update Hyperlink'
                        : '✨ Update Space'}
                  </button>
                </div>
              </div>
              </div>
              {/* Resize Handle */}
              <div
                onMouseDown={handleResizeStart}
                className={`absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end ${isResizing ? 'bg-brand-500/20' : 'hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
                style={{ zIndex: 100000 }}
              >
                <div className="w-4 h-4 relative">
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-r-2 border-b-2 border-slate-400 dark:border-slate-500 rounded-br-lg"></div>
                  <div className="absolute bottom-1 right-1 w-2 h-2 border-r border-b border-slate-400 dark:border-slate-500 rounded-br"></div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* Category Scheduling Modal */}
      {
        editingCategorySchedule && createPortal(
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
            <div className="absolute inset-0 bg-transparent" style={{ zIndex: 99998 }} onClick={() => {
              setEditingCategorySchedule(null);
              setCategoryVisibleFrom('');
              setCategoryExpiresAt('');
            }}></div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-md p-6 relative shadow-2xl animate-in fade-in zoom-in duration-200" style={{ zIndex: 99999 }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Schedule Category</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{editingCategorySchedule}</p>
                </div>
                <button
                  onClick={() => {
                    setEditingCategorySchedule(null);
                    setCategoryVisibleFrom('');
                    setCategoryExpiresAt('');
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Scheduling</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Available From (optional)</label>
                      <input
                        type="datetime-local"
                        value={categoryVisibleFrom}
                        onChange={(e) => setCategoryVisibleFrom(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                      />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for immediate availability</p>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Expires At (optional)</label>
                      <input
                        type="datetime-local"
                        value={categoryExpiresAt}
                        onChange={(e) => setCategoryExpiresAt(e.target.value)}
                        min={categoryVisibleFrom || undefined}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
                      />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for no expiry</p>
                    </div>
                  </div>
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => {
                      setEditingCategorySchedule(null);
                      setCategoryVisibleFrom('');
                      setCategoryExpiresAt('');
                    }}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCategorySchedule}
                    className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/30 hover:scale-105 active:scale-95"
                  >
                    Save Schedule
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
      }

      {/* Category Visibility Management Modal */}
      {editingCategoryVisibility && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <CategoryVisibilityDialog
            categoryName={editingCategoryVisibility}
            tiles={tiles.filter(t => (t.group || 'General') === editingCategoryVisibility)}
            users={visibilityUsers}
            onClose={() => setEditingCategoryVisibility(null)}
            onSave={handleSaveVisibilityChanges}
          />
        </div>,
        document.body
      )}

      {/* Import Progress Modal */}
      {importProgress && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Importing Tiles
                </h3>
                <button
                  onClick={() => setImportProgress(null)}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={importProgress.total > 0 && importProgress.current < importProgress.total}
                >
                  ✕
                </button>
              </div>

              {/* Progress Display */}
              <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                <div className="mb-2">
                  <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300 mb-1">
                    <span>{importProgress.status}</span>
                    {importProgress.total > 0 && (
                      <span>{importProgress.current} / {importProgress.total}</span>
                    )}
                  </div>
                  {importProgress.total > 0 && (
                    <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                      <div
                        className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>

                {importProgress.errors.length > 0 && (
                  <div className="mt-3 max-h-32 overflow-y-auto">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                      Errors ({importProgress.errors.length}):
                    </p>
                    <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                      {importProgress.errors.slice(0, 5).map((error, idx) => (
                        <li key={idx}>• {error}</li>
                      ))}
                      {importProgress.errors.length > 5 && (
                        <li>... and {importProgress.errors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {importProgress.current >= importProgress.total && importProgress.total > 0 && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setImportProgress(null)}
                    className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Export Progress Modal */}
      {exportProgress && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Exporting Tiles
                </h3>
                <button
                  onClick={() => setExportProgress(null)}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={exportProgress.total > 0 && exportProgress.current < exportProgress.total}
                >
                  ✕
                </button>
              </div>

              {/* Progress Display */}
              <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                <div className="mb-2">
                  <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300 mb-1">
                    <span>{exportProgress.status}</span>
                    {exportProgress.total > 0 && (
                      <span>{exportProgress.current} / {exportProgress.total}</span>
                    )}
                  </div>
                  {exportProgress.total > 0 && (
                    <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                      <div
                        className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>

                {exportProgress.errors.length > 0 && (
                  <div className="mt-3 max-h-32 overflow-y-auto">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                      Errors ({exportProgress.errors.length}):
                    </p>
                    <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                      {exportProgress.errors.slice(0, 5).map((error, idx) => (
                        <li key={idx}>• {error}</li>
                      ))}
                      {exportProgress.errors.length > 5 && (
                        <li>... and {exportProgress.errors.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {exportProgress.current >= exportProgress.total && exportProgress.total > 0 && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setExportProgress(null)}
                    className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Category Progress Modal */}
      {deleteCategoryProgress && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Deleting Category
                </h3>
                <button
                  onClick={() => setDeleteCategoryProgress(null)}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={deleteCategoryProgress.total > 0 && deleteCategoryProgress.current < deleteCategoryProgress.total}
                >
                  ✕
                </button>
              </div>

              {/* Progress Display */}
              <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                <div className="mb-2">
                  <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300 mb-1">
                    <span>{deleteCategoryProgress.status}</span>
                    {deleteCategoryProgress.total > 0 && (
                      <span>{deleteCategoryProgress.current} / {deleteCategoryProgress.total}</span>
                    )}
                  </div>
                  {deleteCategoryProgress.total > 0 && (
                    <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                      <div
                        className="bg-red-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(deleteCategoryProgress.current / deleteCategoryProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Category: <span className="font-medium">{deleteCategoryProgress.categoryName}</span>
                </div>
              </div>

              {deleteCategoryProgress.current >= deleteCategoryProgress.total && deleteCategoryProgress.total > 0 && (
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteCategoryProgress(null)}
                    className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Link Info Dialog */}
      {linkInfoDialog && (
        <LinkInfoDialog
          isOpen={!!linkInfoDialog}
          onClose={() => setLinkInfoDialog(null)}
          linkLabel={linkInfoDialog.link.label}
          linkIcon={linkInfoDialog.link.icon}
          richTextContent={linkInfoDialog.link.richTextContent || ''}
          linkUrl={linkInfoDialog.link.url}
          browser={linkInfoDialog.link.browser}
        />
      )}

      {/* Favorite Link Notes Dialog */}
      <LinkNotesDialog
        isOpen={!!favNotesDialogState}
        onClose={() => setFavNotesDialogState(null)}
        linkLabel={favNotesDialogState?.linkLabel || ''}
        notes={favNotesDialogState?.notes || ''}
      />

      {/* Tile/Category Info Dialog */}
      {shareTileDialog && (
        <ShareTileDialog
          tile={shareTileDialog}
          onClose={() => setShareTileDialog(null)}
          onShared={() => { getTiles().then(t => onUpdateTiles(t, false)); }}
        />
      )}
      {tileInfoDialog && (
        <TileInfoDialog
          isOpen={!!tileInfoDialog}
          onClose={handleCloseTileInfoDialog}
          tile={tileInfoDialog.tile}
          categoryInfo={tileInfoDialog.categoryInfo}
        />
      )}
    </div >
  );
};

