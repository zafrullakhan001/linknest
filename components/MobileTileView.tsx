import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Tile } from '../types';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useAccessRestrictionGate } from '../contexts/AccessRestrictionContext';
import { COLOR_STYLES } from '../types';
import { TileAnimationSelector, useTileAnimation, getTileAnimationClass, getTileDecorationClass, TileAnimation, TileDecoration } from './TileAnimationSelector';
import { getPublicFavorites, checkLocalStorageAvailability, togglePublicFavorite, isPublicFavorite, getPublicLinkFavorites, getPublicLinkFavoriteDetails, syncPublicLinkFavoriteDetails } from '../services/publicFavoritesService';
import {
  PublicFavoritesSubTab,
  getPublicFavoritesSubTab,
  setPublicFavoritesSubTab,
  countPublicBookmarkLinks,
  collectCopyableFavoriteBookmarkLinks,
  copyFavoritesToPublicBookmarkFolders
} from '../services/publicBookmarksService';
import { PublicBookmarksPanel } from './PublicBookmarksPanel';
import { getFavoriteLinks, resolveFavoriteLinks, FavoriteLink } from '../services/storageService';
import { getDisplayUrl, viewerLinkDisplay, viewerLinkUrl } from '../utils/urlDisplay';
import { tryHandleSshLinkClick } from '../utils/sshLink';
import { tryHandleVncLinkClick } from '../utils/vncLink';
import { isLinkInMaintenance } from '../utils/linkMaintenance';
import { LinkMaintenanceBadge } from './LinkMaintenanceBadge';
import { LinkHoverTooltip } from './LinkHoverTooltip';
import { LinkMaintenanceDialog } from './LinkMaintenanceDialog';
import { QRCodeDialog } from './QRCodeDialog';
import { UpdatesDialog } from './UpdatesDialog';
import { ThemeModeMenu } from './ThemeModeMenu';
import { SearchResultFilterControl, SearchWordModeControl, FuzzySearchControl, SearchIncludeUrlsControl, RefineSearchInput, SearchStatsBar, MatchScoreBadge, getSearchWords, tileMatchesSearch, scoreTileSearch, combineSearchScores, type SearchResultFilter, type SearchMatchingLink, type SearchWordMode, type SearchStatsSummary, type SearchMatchScore } from './SearchResultFilterControl';

function stripHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, '');
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || html.replace(/<[^>]*>/g, '') || '';
}

/** Walk tabs and legacy sections to find links on a tile */
function forEachTileLink(tile: Tile, cb: (link: any) => void) {
  tile.tabs?.forEach((tab) => {
    tab.sections?.forEach((section) => {
      section.links?.forEach((link) => cb(link));
    });
  });
  tile.sections?.forEach((section) => {
    section.links?.forEach((link) => cb(link));
  });
}

function buildGuestFavoriteLinksFromTiles(allTiles: Tile[], favoriteLinkIds: string[]): FavoriteLink[] {
  const guestFavoriteLinks: FavoriteLink[] = [];
  const seen = new Set<string>();
  allTiles.forEach((tile) => {
    forEachTileLink(tile, (link) => {
      if (!favoriteLinkIds.includes(link.id) || seen.has(link.id)) return;
      seen.add(link.id);
      guestFavoriteLinks.push({
        id: link.id,
        label: link.label,
        url: link.url,
        icon: link.icon,
        textColor: link.textColor,
        visibility: link.visibility,
        notes: link.notes,
        tooltip: link.tooltip,
        notesEnabled: link.notesEnabled,
        browser: link.browser,
        richTextContent: link.richTextContent,
        richTextEnabled: link.richTextEnabled,
        maintenanceEnabled: link.maintenanceEnabled,
        maintenanceMessage: link.maintenanceMessage,
        maintenanceVideoUrl: link.maintenanceVideoUrl,
        isFavorite: true,
        health: link.health,
        tile: {
          id: tile.id,
          title: tile.title,
          emoji: tile.emoji || '✨',
          themeColor: tile.themeColor || 'blue'
        }
      });
    });
  });
  return guestFavoriteLinks;
}

interface MobileTileViewProps {
  tiles: Tile[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  searchResultFilter?: SearchResultFilter;
  onSearchResultFilterChange?: (value: SearchResultFilter) => void;
  searchWordMode?: SearchWordMode;
  onSearchWordModeChange?: (value: SearchWordMode) => void;
  searchFuzzy?: boolean;
  onSearchFuzzyChange?: (enabled: boolean) => void;
  searchIncludeUrls?: boolean;
  onSearchIncludeUrlsChange?: (enabled: boolean) => void;
  refineSearchTerm?: string;
  onRefineSearchChange?: (value: string) => void;
  matchingSearchLinks?: SearchMatchingLink[];
  searchStats?: SearchStatsSummary | null;
  onTileClick: (tileId: string) => void;
  activeTab: string;
  groupedTiles: Record<string, Tile[]>;
  settings: any;
  darkMode: boolean;
  onHelpClick: () => void;
  onTabChange?: (tab: string) => void;
  isAuthenticated?: boolean;
  disabledTabs?: Set<string>;
  onLoginClick?: () => void;
  user?: { id: number; username: string; email: string; is_admin?: boolean } | null;
  onToggleFavorite?: (tileId: string) => void;
  onUpdateTiles?: (tiles: Tile[]) => void;
}

export const MobileTileView: React.FC<MobileTileViewProps> = ({
  tiles,
  searchTerm,
  onSearchChange,
  searchResultFilter = 'both',
  onSearchResultFilterChange,
  searchWordMode = 'and',
  onSearchWordModeChange,
  searchFuzzy = false,
  onSearchFuzzyChange,
  searchIncludeUrls = true,
  onSearchIncludeUrlsChange,
  refineSearchTerm = '',
  onRefineSearchChange,
  matchingSearchLinks = [],
  searchStats = null,
  onTileClick,
  activeTab,
  groupedTiles,
  settings,
  darkMode,
  onHelpClick,
  onTabChange,
  isAuthenticated = false,
  disabledTabs = new Set(),
  onLoginClick,
  user: userProp,
  onToggleFavorite,
  onUpdateTiles
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showAppQrDialog, setShowAppQrDialog] = useState(false);
  const [showUpdatesDialog, setShowUpdatesDialog] = useState(false);
  const { user: authUser, logout } = useAuth();
  const { assertCanOpen } = useAccessRestrictionGate();
  const { loading: settingsLoading } = useSettings();
  const user = userProp || authUser;

  // Public favorites state for non-authenticated users
  const [publicFavorites, setPublicFavorites] = useState<string[]>(() => {
    if (!isAuthenticated) {
      // Check localStorage availability on initial load
      const isAvailable = checkLocalStorageAvailability();
      if (isAvailable) {
        return getPublicFavorites();
      }
    }
    return [];
  });

  // Track localStorage availability
  const [localStorageAvailable, setLocalStorageAvailable] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof Storage !== 'undefined') {
      try {
        const test = '__localStorage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  });

  const [favoriteLinks, setFavoriteLinks] = useState<FavoriteLink[]>([]);
  const [isLoadingFavoriteLinks, setIsLoadingFavoriteLinks] = useState(false);
  const [linkMaintenanceDialog, setLinkMaintenanceDialog] = useState<{
    label: string;
    icon?: string;
    maintenanceMessage?: string;
    maintenanceVideoUrl?: string;
  } | null>(null);
  const isFavoritesTab = activeTab === 'favorites' || activeTab === 'public-favorites';
  const [publicFavoritesSubTab, setPublicFavoritesSubTabState] = useState<PublicFavoritesSubTab>(() =>
    typeof window !== 'undefined' ? getPublicFavoritesSubTab() : 'favorites'
  );
  const [publicBookmarkLinkCount, setPublicBookmarkLinkCount] = useState(() =>
    typeof window !== 'undefined' ? countPublicBookmarkLinks() : 0
  );
  const [bookmarksOpenCategoryId, setBookmarksOpenCategoryId] = useState<string | null>(null);
  const handleSetPublicFavoritesSubTab = useCallback((tab: PublicFavoritesSubTab) => {
    setPublicFavoritesSubTabState(tab);
    setPublicFavoritesSubTab(tab);
    setPublicBookmarkLinkCount(countPublicBookmarkLinks());
  }, []);
  const showGuestBookmarks =
    !isAuthenticated && activeTab === 'public-favorites' && publicFavoritesSubTab === 'bookmarks';
  const showGuestFavoritesContent =
    isAuthenticated || publicFavoritesSubTab === 'favorites' || activeTab !== 'public-favorites';

  const favoriteSpaceTilesInOrder = useMemo(() => {
    const byId = new Map(tiles.map((t) => [t.id, t]));
    return publicFavorites
      .map((id) => byId.get(id))
      .filter((t): t is Tile => !!t);
  }, [tiles, publicFavorites]);

  const canCopyFavoritesToBookmarks = useMemo(() => {
    const links = collectCopyableFavoriteBookmarkLinks(favoriteLinks, favoriteSpaceTilesInOrder);
    return links.some((link) => {
      const url = (link.url || '').trim();
      return url.startsWith('http://') || url.startsWith('https://');
    });
  }, [favoriteLinks, favoriteSpaceTilesInOrder]);

  const handleCopyFavoritesToBookmarks = useCallback(() => {
    const links = collectCopyableFavoriteBookmarkLinks(favoriteLinks, favoriteSpaceTilesInOrder);
    const hasHttp = links.some((link) => {
      const url = (link.url || '').trim();
      return url.startsWith('http://') || url.startsWith('https://');
    });
    if (!hasHttp) {
      alert('No http(s) links to copy into Your Bookmarks.');
      return;
    }
    const prompted = window.prompt('Name for the new Your Bookmarks folder', 'Favorites');
    if (prompted === null) return;
    const result = copyFavoritesToPublicBookmarkFolders(
      prompted,
      favoriteLinks,
      favoriteSpaceTilesInOrder
    );
    if (!result.success) {
      alert(result.message);
      return;
    }
    setPublicBookmarkLinkCount(countPublicBookmarkLinks());
    setBookmarksOpenCategoryId(result.categoryId || null);
    handleSetPublicFavoritesSubTab('bookmarks');
    alert(result.message);
  }, [favoriteLinks, favoriteSpaceTilesInOrder, handleSetPublicFavoritesSubTab]);

  // Load favorite links when Favorites tab is active
  useEffect(() => {
    if (!isFavoritesTab) {
      setFavoriteLinks([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      if (isAuthenticated) {
        setIsLoadingFavoriteLinks(true);
        try {
          const links = await getFavoriteLinks();
          if (!cancelled) setFavoriteLinks(links);
        } catch (error) {
          console.error('Failed to load favorite links (mobile):', error);
          if (!cancelled) setFavoriteLinks([]);
        } finally {
          if (!cancelled) setIsLoadingFavoriteLinks(false);
        }
        return;
      }

      const ids = getPublicLinkFavorites();
      if (ids.length === 0) {
        if (!cancelled) {
          setFavoriteLinks([]);
          setIsLoadingFavoriteLinks(false);
        }
        return;
      }

      const cached = getPublicLinkFavoriteDetails().map((detail) => ({
        ...detail,
        isFavorite: true as const
      }));
      const fromTiles = buildGuestFavoriteLinksFromTiles(tiles, ids);
      const immediate = cached.length > 0 ? cached : fromTiles;
      if (!cancelled && immediate.length > 0) {
        setFavoriteLinks(immediate);
      }

      setIsLoadingFavoriteLinks(true);
      try {
        const resolved = await resolveFavoriteLinks(ids);
        if (cancelled) return;
        if (resolved.length > 0) {
          syncPublicLinkFavoriteDetails(resolved);
          setFavoriteLinks(resolved);
        } else if (immediate.length === 0) {
          setFavoriteLinks([]);
        }
      } catch (error) {
        console.error('Failed to resolve guest favorite links (mobile):', error);
        if (!cancelled && immediate.length === 0) {
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
  }, [isFavoritesTab, isAuthenticated, tiles]);

  // Update public favorites when not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      // Check availability first
      const isAvailable = checkLocalStorageAvailability();
      setLocalStorageAvailable(isAvailable);

      if (isAvailable) {
        setPublicFavorites(getPublicFavorites());

        // Listen for changes to public favorites from other tabs
        const handleStorageChange = () => {
          setPublicFavorites(getPublicFavorites());
        };

        // Listen for storage events (cross-tab updates)
        window.addEventListener('storage', handleStorageChange);

        // Also check periodically for same-tab updates (when user favorites/unfavorites)
        const intervalId = setInterval(() => {
          if (!isAuthenticated) {
            const currentFavorites = getPublicFavorites();
            setPublicFavorites(prev => {
              // Only update if changed (avoid unnecessary re-renders)
              if (JSON.stringify(prev.sort()) !== JSON.stringify(currentFavorites.sort())) {
                return currentFavorites;
              }
              return prev;
            });
          }
        }, 500); // Check every 500ms for same-tab updates

        return () => {
          window.removeEventListener('storage', handleStorageChange);
          clearInterval(intervalId);
        };
      }
    }
  }, [isAuthenticated]);

  // Also sync public favorites when tiles change (like TileGrid does)
  useEffect(() => {
    if (!isAuthenticated && localStorageAvailable) {
      setPublicFavorites(getPublicFavorites());
    }
  }, [isAuthenticated, tiles.length, localStorageAvailable]);

  // Animation state - get initial values from hook and maintain local state
  const { animation: initialAnimation, decoration: initialDecoration } = useTileAnimation();
  const [currentAnimation, setCurrentAnimation] = useState<TileAnimation>(initialAnimation);
  const [currentDecoration, setCurrentDecoration] = useState<TileDecoration>(initialDecoration);

  // Favorite stars visibility toggle
  const [showFavoriteStars, setShowFavoriteStars] = useState<boolean>(false);

  // Sync with initial values when they load
  useEffect(() => {
    setCurrentAnimation(initialAnimation);
    setCurrentDecoration(initialDecoration);
  }, [initialAnimation, initialDecoration]);

  // Close menu when clicking outside
  useEffect(() => {
    if (isMenuOpen) {
      const handleClickOutside = () => {
        setIsMenuOpen(false);
      };
      // Delay to avoid immediate close on menu open click
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 100);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isMenuOpen]);

  // Esc closes the left navigation drawer
  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        setIsMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isMenuOpen]);

  // Force recalculation when tiles or activeTab changes significantly
  // This helps with refresh issues where groupedTiles might be stale
  useEffect(() => {
    const groupedTilesCount = Object.values(groupedTiles).flat().length;
    if (groupedTilesCount === 0 && tiles.length > 0 && activeTab) {
      // groupedTiles is empty but we have tiles - this might be a timing issue
      // The filteredTiles useMemo should handle this, but this effect ensures we're aware
      console.debug('[MobileTileView] Tiles loaded but groupedTiles is empty, will use fallback filtering', {
        activeTab,
        tilesCount: tiles.length
      });
    }
  }, [tiles.length, activeTab, groupedTiles]);

  const handleTabClick = (tab: string) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      // Fallback: dispatch event like TileGrid does
      window.dispatchEvent(new CustomEvent('switchTab', { detail: tab }));
    }
    setIsMenuOpen(false);
  };

  // Handle favorite toggle with state update
  const handleFavoriteToggle = useCallback((tileId: string) => {
    if (onToggleFavorite) {
      onToggleFavorite(tileId);
    } else if (!isAuthenticated) {
      // Fallback: handle public favorites directly
      togglePublicFavorite(tileId);
      // Update public favorites state immediately
      const updatedFavorites = getPublicFavorites();
      setPublicFavorites(updatedFavorites);
    }
  }, [onToggleFavorite, isAuthenticated]);
  // Filter tiles based on search term
  // Use a more robust approach that always uses fresh tiles data
  const filteredTiles = useMemo(() => {
    // Get current public favorites for guest users (always fresh from localStorage)
    const currentPublicFavorites = !isAuthenticated ? getPublicFavorites() : [];

    // Check if we're on the favorites tab - handle both 'favorites' and 'public-favorites'
    const isFavoritesTab = activeTab === 'favorites' || activeTab === 'public-favorites';
    const isPublicFavoritesTab = activeTab === 'public-favorites' && !isAuthenticated;
    const isAuthFavoritesTab = activeTab === 'favorites' && isAuthenticated;

    let allTiles: Tile[] = [];
    let usedRecalculation = false;

    // For public-favorites tab with guest users, ALWAYS recalculate from tiles
    // This is critical because groupedTiles might be stale or from a different tab
    // and localStorage favorites can change without groupedTiles updating
    if (isPublicFavoritesTab) {
      // Always recalculate for public-favorites tab to use latest localStorage data
      usedRecalculation = true;

      if (currentPublicFavorites.length > 0) {
        // Filter to only show public tiles that are in favorites
        const publicTiles = tiles.filter(t => t.visibility === 'public');
        allTiles = publicTiles.filter(t => currentPublicFavorites.includes(t.id));
      } else {
        // If no public favorites yet, show empty (not all public tiles)
        allTiles = [];
      }

      // Always log for debugging (can be removed later)
      console.log('[MobileTileView] Public favorites processing:', {
        activeTab,
        isAuthenticated,
        publicFavoritesCount: currentPublicFavorites.length,
        publicFavorites: currentPublicFavorites,
        totalTiles: tiles.length,
        publicTilesCount: tiles.filter(t => t.visibility === 'public').length,
        filteredTilesCount: allTiles.length,
        filteredTileIds: allTiles.map(t => t.id)
      });

      // Filter out scheduled and expired tiles
      const now = new Date();
      allTiles = allTiles.filter(t => {
        if (t.visibleFrom) {
          const visibleFrom = new Date(t.visibleFrom);
          if (now < visibleFrom) return false;
        }
        if (t.expiresAt) {
          const expiresAt = new Date(t.expiresAt);
          if (now > expiresAt) return false;
        }
        return true;
      });

      const order = new Map<string, number>(currentPublicFavorites.map((id, i) => [id, i]));
      allTiles = [...allTiles].sort((a, b) => {
        const ai = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bi = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });
    } else if (isAuthFavoritesTab) {
      // For authenticated users on favorites tab, use isFavorite flag
      usedRecalculation = true;
      allTiles = tiles.filter(t => t.isFavorite === true);

      // Filter out scheduled and expired tiles
      const now = new Date();
      allTiles = allTiles.filter(t => {
        if (t.visibleFrom) {
          const visibleFrom = new Date(t.visibleFrom);
          if (now < visibleFrom) return false;
        }
        if (t.expiresAt) {
          const expiresAt = new Date(t.expiresAt);
          if (now > expiresAt) return false;
        }
        return true;
      });
    } else {
      // For other tabs, try to use groupedTiles first (preferred, already filtered and grouped)
      allTiles = Object.values(groupedTiles).flat() as Tile[];

      // If groupedTiles is empty or inconsistent with tiles prop, recalculate from tiles
      // This handles race conditions on refresh where groupedTiles might be stale
      const groupedTilesCount = allTiles.length;
      const tilesPropCount = tiles.length;

      const needsRecalculation = groupedTilesCount === 0 && tilesPropCount > 0;

      // Recalculate if groupedTiles appears stale or empty
      if (needsRecalculation && tilesPropCount > 0) {
        usedRecalculation = true;
        // Fallback: manually filter tiles based on activeTab (same logic as TileGrid)
        if (activeTab === 'public') {
          allTiles = tiles.filter(t => t.visibility === 'public');
        } else if (activeTab === 'private' && isAuthenticated && user) {
          allTiles = tiles.filter(t => {
            if (t.visibility === 'authenticated') return true;
            if (t.visibility === 'private') {
              return t.allowedUsers && t.allowedUsers.includes(user.id);
            }
            return false;
          });
        } else {
          // For other tabs (your-apps, scheduled, expired, archive, recycle-bin)
          // Use groupedTiles if available, otherwise show all tiles
          allTiles = tiles;
        }

        // Filter out scheduled and expired tiles (same as TileGrid)
        if (activeTab !== 'scheduled' && activeTab !== 'expired') {
          const now = new Date();
          allTiles = allTiles.filter(t => {
            if (t.visibleFrom) {
              const visibleFrom = new Date(t.visibleFrom);
              if (now < visibleFrom) return false;
            }
            if (t.expiresAt) {
              const expiresAt = new Date(t.expiresAt);
              if (now > expiresAt) return false;
            }
            return true;
          });
        }
      }
    }

    // Additional debug logging for favorites tabs - always log to help diagnose
    if (isFavoritesTab || activeTab === 'favorites' || activeTab === 'public-favorites') {
      console.log('[MobileTileView] Favorites tab summary:', {
        activeTab,
        isAuthenticated,
        isPublicFavoritesTab,
        isAuthFavoritesTab,
        isFavoritesTab,
        tilesPropCount: tiles.length,
        allTilesCount: allTiles.length,
        usedRecalculation,
        publicFavorites: !isAuthenticated ? currentPublicFavorites : 'N/A (authenticated)',
        groupedTilesCount: Object.values(groupedTiles).flat().length
      });
    }

    // Debug: Log tile count only if there's a potential issue
    if (allTiles.length === 0 && tiles.length > 0 && activeTab !== 'public-favorites') {
      const groupedTilesCount = Object.values(groupedTiles).flat().length;
      console.log('[MobileTileView] No tiles found after filtering:', {
        activeTab,
        groupedTilesKeys: Object.keys(groupedTiles),
        groupedTilesCount,
        tilesPropCount: tiles.length,
        isAuthenticated,
        hasUser: !!user
      });
    }

    // If no search term, return all tiles from the active tab
    if (!searchTerm.trim()) {
      return allTiles;
    }

    const searchWords = getSearchWords(searchTerm);
    const refineWords = getSearchWords(refineSearchTerm);
    return allTiles.filter((tile) => {
      if (!tileMatchesSearch(tile, searchWords, searchWordMode, searchFuzzy, searchIncludeUrls)) return false;
      if (refineWords.length === 0) return true;
      return tileMatchesSearch(tile, refineWords, searchWordMode, searchFuzzy, searchIncludeUrls);
    });
    // Dependencies: tiles array reference changes when data loads, groupedTiles updates accordingly
    // We check both to handle cases where groupedTiles is stale on refresh
    // Include publicFavorites for public-favorites tab
  }, [searchTerm, searchWordMode, searchFuzzy, searchIncludeUrls, refineSearchTerm, groupedTiles, activeTab, tiles, isAuthenticated, user, publicFavorites]);

  const tileSearchMatches = useMemo(() => {
    const matches: Record<string, SearchMatchScore> = {};
    if (!searchTerm.trim()) return matches;
    const searchWords = getSearchWords(searchTerm);
    const refineWords = getSearchWords(refineSearchTerm);
    filteredTiles.forEach((tile) => {
      const primary = scoreTileSearch(tile, searchWords, searchWordMode, searchFuzzy, searchIncludeUrls);
      const refine = refineWords.length
        ? scoreTileSearch(tile, refineWords, searchWordMode, searchFuzzy, searchIncludeUrls)
        : undefined;
      matches[tile.id] = combineSearchScores(primary, refine);
    });
    return matches;
  }, [filteredTiles, searchTerm, refineSearchTerm, searchWordMode, searchFuzzy, searchIncludeUrls]);

  const getTileStyles = (tile: Tile) => {
    const styles = COLOR_STYLES[tile.themeColor] || COLOR_STYLES['blue'];

    const decorationStyles: React.CSSProperties = {};

    if (tile.tileGradientEnabled && tile.tileGradientColors && tile.tileGradientColors.length > 0) {
      const gradientStops = tile.tileGradientColors.map((color, i) => {
        const position = tile.tileGradientColorPositions?.[i] ?? (i * 100) / (tile.tileGradientColors.length - 1 || 1);
        return `${color} ${position}%`;
      }).join(', ');

      const angle = typeof tile.tileGradientDirection === 'number'
        ? tile.tileGradientDirection
        : parseInt(String(tile.tileGradientDirection || '90').replace('deg', '')) || 90;

      decorationStyles.background = `linear-gradient(${angle}deg, ${gradientStops})`;
    } else if (tile.tileBackgroundColor) {
      decorationStyles.backgroundColor = tile.tileBackgroundColor;
    } else {
      decorationStyles.backgroundColor = styles.base;
    }

    if (tile.tileBorderRadius !== undefined && tile.tileBorderRadius >= 0) {
      decorationStyles.borderRadius = `${tile.tileBorderRadius}px`;
    } else {
      decorationStyles.borderRadius = '16px';
    }

    // Only apply text color if tile has other decorations (background or gradient)
    // This prevents forcing text color on tiles without decorations
    const hasOtherDecorations = !!(tile.tileBackgroundColor || (tile.tileGradientEnabled && tile.tileGradientColors && tile.tileGradientColors.length > 0));
    if (tile.tileTextColor && hasOtherDecorations) {
      decorationStyles.color = tile.tileTextColor;
    }

    return decorationStyles;
  };

  const logoSize = Math.min(28, Math.max(16, (parseInt(settings.logo_size || '32', 10) || 32) * 0.75));
  const drawerLogoSize = Math.min(48, Math.max(28, parseInt(settings.header_logo_size || '40', 10) || 40));
  const navMinHeight = Math.max(52, logoSize + 16, settings.app_subheading ? 56 : 52);
  const appShareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}${window.location.search}#/`
    : '#/';
  const appShareLabel = settings.app_name || 'LinkNest';

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-900 pb-6">
      {/* Mobile header: row 1 = menu + brand; row 2 = compact actions (avoids title overlap) */}
      <nav className="linknest-nav sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="w-full px-2 pt-1.5 pb-1 flex flex-col gap-0.5">
          {/* Row 1: hamburger + brand (spacer mirrors menu width for true center) */}
          <div className="flex items-center gap-1 min-w-0" style={{ minHeight: navMinHeight - 4 }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className="linknest-nav-icon p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-all flex-shrink-0"
              title="Menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                {isMenuOpen ? (
                  <path d="M18 6L6 18M6 6l12 12" />
                ) : (
                  <path d="M3 12h18M3 6h18M3 18h18" />
                )}
              </svg>
            </button>

            <div
              onClick={() => { window.location.hash = '#/'; }}
              className="flex-1 flex items-center justify-center gap-1.5 cursor-pointer min-w-0"
            >
              {settingsLoading && !settings.app_name ? (
                <div className="h-7 min-w-[5rem]" aria-hidden="true" />
              ) : (
                <>
                  {settings.logo_type === 'image' && settings.logo_image ? (
                    <img
                      src={settings.logo_image}
                      alt={settings.app_name}
                      className="rounded-md object-contain flex-shrink-0"
                      style={{ height: logoSize, width: logoSize }}
                    />
                  ) : settings.logo_type !== 'image' && settings.logo_icon ? (
                    <div
                      className="rounded-md bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow flex-shrink-0"
                      style={{ height: logoSize, width: logoSize, fontSize: Math.max(11, logoSize * 0.55) }}
                    >
                      {settings.logo_icon}
                    </div>
                  ) : null}
                  <div className="flex flex-col min-w-0 items-center text-center">
                    <span className="linknest-page-title linknest-brand-app-name text-base font-bold leading-tight truncate max-w-full">
                      {settings.app_name || ''}
                    </span>
                    {settings.app_subheading ? (
                      <span className="linknest-brand-subheading text-[10px] text-slate-500 dark:text-slate-400 leading-tight truncate max-w-full">
                        {settings.app_subheading}
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            {/* Mirrors hamburger width so brand stays optically centered */}
            <div className="w-8 flex-shrink-0" aria-hidden="true" />
          </div>

          {/* Row 2: compact action controls */}
          <div className="flex items-center justify-center gap-0.5 pb-0.5">
            <button
              onClick={() => setShowFavoriteStars(!showFavoriteStars)}
              className={`linknest-nav-icon p-1.5 rounded-full transition-all ${showFavoriteStars
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              title={showFavoriteStars ? "Hide favorite stars" : "Show favorite stars"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill={showFavoriteStars ? "currentColor" : "none"} stroke="currentColor" strokeWidth={showFavoriteStars ? 0 : 2} className="w-4 h-4">
                <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
              </svg>
            </button>
            <ThemeModeMenu darkMode={darkMode} compact />
            <button
              onClick={onHelpClick}
              className="linknest-nav-icon p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-all"
              title="Help & About"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <path d="M12 17h.01"></path>
              </svg>
            </button>
            <TileAnimationSelector
              onAnimationChange={(animation) => setCurrentAnimation(animation)}
              onDecorationChange={(decoration) => setCurrentDecoration(decoration)}
              compact={true}
            />
          </div>
        </div>
      </nav>

      {/* Hamburger Menu Sidebar */}
      {isMenuOpen && (
        <>
          {/* Overlay - Fade animation */}
          <div
            className="fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 opacity-100"
            onClick={() => setIsMenuOpen(false)}
          />
          {/* Menu - Smooth slide animation */}
          <div
            className="fixed left-0 top-0 bottom-0 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-40 shadow-2xl transform transition-transform duration-300 ease-out translate-x-0"
            style={{
              boxShadow: '4px 0 24px rgba(0, 0, 0, 0.15)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col h-full">
              {/* Menu Header — company logo at top of drawer */}
              <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {settings.header_logo_image ? (
                    <img
                      src={settings.header_logo_image}
                      alt=""
                      className="linknest-header-logo object-contain flex-shrink-0"
                      style={{ height: drawerLogoSize, maxWidth: Math.min(160, drawerLogoSize * 3.5) }}
                    />
                  ) : (
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">Navigation</h2>
                  )}
                </div>
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
                  aria-label="Close menu"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              </div>
              {settings.header_logo_image ? (
                <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Navigation</p>
                </div>
              ) : null}

              {/* User Info & Logout - moved to top */}
              {user && (
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex flex-col gap-2">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white text-center flex items-center justify-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-600 dark:text-slate-400">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                      {user.username}
                    </div>
                    <hr className="border-slate-200 dark:border-slate-700 my-1" />
                    <button
                      onClick={async () => {
                        try {
                          await logout();
                          window.location.hash = '#/';
                          setIsMenuOpen(false);
                        } catch (error) {
                          console.error('Logout failed:', error);
                        }
                      }}
                      className="w-full px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-600 rounded-lg transition-colors shadow-sm"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}

              {/* Sign In Button - At top of menu if not authenticated */}
              {!isAuthenticated && onLoginClick && settings?.signin_button_enabled !== '0' && (
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => {
                      if (onLoginClick) {
                        onLoginClick();
                      }
                      setIsMenuOpen(false);
                    }}
                    className="w-full px-4 py-2.5 text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors shadow-md hover:shadow-lg"
                  >
                    Sign In
                  </button>
                </div>
              )}

              {/* Menu Items */}
              <div className="flex-1 overflow-y-auto py-4">
                <div className="space-y-1 px-2">
                  {/* Public Tab */}
                  {!disabledTabs.has('public') && (
                    <button
                      onClick={() => handleTabClick('public')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${activeTab === 'public'
                        ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                        <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                      </svg>
                      <span>Public</span>
                    </button>
                  )}

                  {/* Favorites Tab */}
                  {!disabledTabs.has('favorites') && (
                    <button
                      onClick={() => handleTabClick(isAuthenticated ? 'favorites' : 'public-favorites')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${activeTab === 'favorites' || activeTab === 'public-favorites'
                        ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                      </svg>
                      <span>Favorites</span>
                    </button>
                  )}

                  {/* Private Tab - Only for authenticated users */}
                  {isAuthenticated && !disabledTabs.has('private') && (
                    <button
                      onClick={() => handleTabClick('private')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${activeTab === 'private'
                        ? 'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                      </svg>
                      <span>Private</span>
                    </button>
                  )}

                  {/* Your Apps Tab - Only for authenticated users */}
                  {isAuthenticated && !disabledTabs.has('your-apps') && (
                    <button
                      onClick={() => handleTabClick('your-apps')}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${activeTab === 'your-apps'
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                        <path fillRule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clipRule="evenodd" />
                      </svg>
                      <span>Your Apps</span>
                    </button>
                  )}

                  {/* Share app URL via QR — available to everyone including public/guests */}
                  <div className="my-2 border-t border-slate-200 dark:border-slate-700"></div>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      setShowAppQrDialog(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 touch-manipulation"
                    style={{ minHeight: '44px' }}
                    title="Show QR code to share this app"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v1h1V5H5zM3 12a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm2 1v1h1v-1H5zM12 3a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zm1 2v1h1V5h-1z" clipRule="evenodd" />
                      <path d="M11 12h1v1h-1v-1zM13 12h1v1h-1v-1zM15 12h1v1h-1v-1zM11 14h1v1h-1v-1zM13 14h1v1h-1v-1zM15 14h1v1h-1v-1zM11 16h1v1h-1v-1zM13 16h1v1h-1v-1zM15 16h1v1h-1v-1z" />
                    </svg>
                    <div className="flex flex-col items-start min-w-0">
                      <span className="font-medium">QR Code</span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">Share app URL</span>
                    </div>
                  </button>

                  {/* Admin Panel - Only for admin users */}
                  {user?.is_admin && !disabledTabs.has('admin') && (
                    <>
                      <div className="my-2 border-t border-slate-200 dark:border-slate-700"></div>
                      <button
                        onClick={() => {
                          window.location.hash = '#/admin';
                          setIsMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 touch-manipulation"
                        style={{ minHeight: '44px' }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-600 dark:text-brand-400">
                          <path fillRule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium">Admin Panel</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowUpdatesDialog(true);
                          setIsMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 touch-manipulation"
                        style={{ minHeight: '44px' }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-600 dark:text-amber-400">
                          <path fillRule="evenodd" d="M10 2a6 6 0 00-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 00.515 1.076 32.91 32.91 0 003.256.508 3.994 3.994 0 006.972 0 32.903 32.903 0 003.256-.508.75.75 0 00.515-1.076A11.448 11.448 0 0116 8a6 6 0 00-6-6zM8.05 14.943a33.54 33.54 0 003.9.001 2.5 2.5 0 01-3.9 0z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium">App Updates</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

            </div>
          </div>
        </>
      )}

      {/* Search Bar - Modern styling with glassmorphism */}
      <div className="sticky top-[73px] z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-slate-200/50 dark:border-slate-700/50 px-4 py-3 shadow-sm">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search spaces..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl pl-10 pr-10 py-3.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all shadow-sm hover:shadow-md"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-9 h-9 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors active:scale-95"
              title="Clear search"
              aria-label="Clear search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 pointer-events-none" aria-hidden>
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          )}
        </div>
        {searchTerm.trim() && onSearchResultFilterChange && (
          <div className="mt-2 flex justify-end gap-1.5 flex-wrap">
            <SearchResultFilterControl
              value={searchResultFilter}
              onChange={onSearchResultFilterChange}
            />
            {(getSearchWords(searchTerm).length > 1 || getSearchWords(refineSearchTerm).length > 1) && onSearchWordModeChange && (
              <SearchWordModeControl
                value={searchWordMode}
                onChange={onSearchWordModeChange}
              />
            )}
            {onSearchFuzzyChange && (
              <FuzzySearchControl
                enabled={searchFuzzy}
                onChange={onSearchFuzzyChange}
              />
            )}
            {onSearchIncludeUrlsChange && (
              <SearchIncludeUrlsControl
                enabled={searchIncludeUrls}
                onChange={onSearchIncludeUrlsChange}
              />
            )}
            {onRefineSearchChange && (
              <RefineSearchInput
                value={refineSearchTerm}
                onChange={onRefineSearchChange}
                className="w-full"
              />
            )}
          </div>
        )}
      </div>

      {/* Tiles Grid - 3 columns like mobile apps */}
      <div className="px-4 py-6">
        {searchTerm.trim() && searchStats && (
          <div className="mb-4">
            <SearchStatsBar stats={searchStats} />
          </div>
        )}
        {/* Show localStorage warning for guest users on favorites tab */}
        {!isAuthenticated && activeTab === 'public-favorites' && !localStorageAvailable && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                  Browser Storage Not Available
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Favorites feature requires browser storage. This may happen if you're in private/incognito mode, storage is disabled, or your browser doesn't support localStorage. Please sign in to save favorites.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Guest Favorites | Your Bookmarks switch */}
        {!isAuthenticated && activeTab === 'public-favorites' && localStorageAvailable && (
          <div className="mb-4 flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => handleSetPublicFavoritesSubTab('favorites')}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${publicFavoritesSubTab === 'favorites'
                ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
                }`}
            >
              Favorites
            </button>
            <button
              type="button"
              onClick={() => handleSetPublicFavoritesSubTab('bookmarks')}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${publicFavoritesSubTab === 'bookmarks'
                ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
                }`}
            >
              Bookmarks
              {publicBookmarkLinkCount > 0 ? ` (${publicBookmarkLinkCount})` : ''}
            </button>
          </div>
        )}

        {!isAuthenticated && activeTab === 'public-favorites' && localStorageAvailable && publicFavoritesSubTab === 'favorites' && (
          <button
            type="button"
            onClick={handleCopyFavoritesToBookmarks}
            disabled={!canCopyFavoritesToBookmarks}
            className="mb-4 w-full px-3 py-2 text-sm font-medium rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 disabled:opacity-40 disabled:pointer-events-none"
            title="Copy favorites to Your Bookmarks as a named folder (spaces become subfolders)"
          >
            Copy favorites to Your Bookmarks
          </button>
        )}

        {showGuestBookmarks && (
          <PublicBookmarksPanel
            compact
            initialOpenCategoryId={bookmarksOpenCategoryId}
            onChange={() => setPublicBookmarkLinkCount(countPublicBookmarkLinks())}
          />
        )}

        {/* Favorite Links — mobile cards (Favorites tab only) */}
        {isFavoritesTab && showGuestFavoritesContent && (isLoadingFavoriteLinks || favoriteLinks.length > 0) && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-500">
                <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
              </svg>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Favorite Links</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                ({isLoadingFavoriteLinks ? '…' : favoriteLinks.length})
              </span>
            </div>

            {isLoadingFavoriteLinks ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-[72px] rounded-xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {favoriteLinks.map((link) => {
                  const host = viewerLinkDisplay(link, link.tile?.showShortUrls);
                  return (
                    <LinkHoverTooltip key={link.id} link={link} fallbackTitle={host}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (tryHandleSshLinkClick(link.url || '')) return;
                        if (tryHandleVncLinkClick(link.url || '')) return;
                        const allowed = await assertCanOpen('link', link.id);
                        if (!allowed) return;
                        if (isLinkInMaintenance(link)) {
                          setLinkMaintenanceDialog({
                            label: link.label,
                            icon: link.icon,
                            maintenanceMessage: link.maintenanceMessage,
                            maintenanceVideoUrl: link.maintenanceVideoUrl,
                          });
                          return;
                        }
                        window.open(link.url, '_blank', 'noopener,noreferrer');
                      }}
                      className="group relative flex items-center gap-3 p-3.5 w-full text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl active:scale-[0.99] transition-all shadow-sm"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center shrink-0 text-lg border border-slate-200 dark:border-slate-700">
                        {link.icon || '🔗'}
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2">
                          {stripHtml(link.label)}
                        </div>
                        <LinkMaintenanceBadge link={link} className="mt-1" />
                        <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5 w-fit max-w-full" title={link.url} data-ln-tooltip-anchor="">
                          {host}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
                          <span className="text-xs shrink-0">{link.tile.emoji}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1">
                            {stripHtml(link.tile.title)}
                          </span>
                        </div>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0">
                        <path fillRule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clipRule="evenodd" />
                      </svg>
                    </button>
                    </LinkHoverTooltip>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {searchTerm.trim() && searchResultFilter !== 'tiles' && matchingSearchLinks.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-500">
                <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01-.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
              </svg>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Matching Links</h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">({matchingSearchLinks.length})</span>
            </div>
            <div className="space-y-2">
              {matchingSearchLinks.map((link) => {
                let host = viewerLinkDisplay(link, link.tile?.showShortUrls);
                if (!link.tile?.showShortUrls) {
                  try {
                    host = new URL(link.url).hostname.replace(/^www\./, '');
                  } catch {
                    host = getDisplayUrl(link.url);
                  }
                }
                return (
                  <LinkHoverTooltip key={link.id} link={link} fallbackTitle={stripHtml(link.label)}>
                  <button
                    type="button"
                    onClick={async () => {
                      if (tryHandleSshLinkClick(link.url || '')) return;
                      if (tryHandleVncLinkClick(link.url || '')) return;
                      const allowed = await assertCanOpen('link', link.id);
                      if (!allowed) return;
                      if (isLinkInMaintenance(link)) {
                        setLinkMaintenanceDialog({
                          label: link.label,
                          icon: link.icon,
                          maintenanceMessage: link.maintenanceMessage,
                          maintenanceVideoUrl: link.maintenanceVideoUrl,
                        });
                        return;
                      }
                      window.open(link.url, '_blank', 'noopener,noreferrer');
                    }}
                    className="group relative flex items-center gap-3 p-3.5 w-full text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl active:scale-[0.99] transition-all shadow-sm"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center shrink-0 text-lg border border-slate-200 dark:border-slate-700">
                      {link.icon || '🔗'}
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="font-semibold text-sm text-slate-900 dark:text-white line-clamp-2">
                        {stripHtml(link.label)}
                      </div>
                      <LinkMaintenanceBadge link={link} className="mt-1" />
                      <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5 w-fit max-w-full" title={viewerLinkUrl(link, link.tile?.showShortUrls)} data-ln-tooltip-anchor="">
                        {host}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
                        <span className="text-xs shrink-0">{link.tile.emoji}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1">
                          {stripHtml(link.tile.title)}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <MatchScoreBadge match={link.match} />
                      </div>
                    </div>
                  </button>
                  </LinkHoverTooltip>
                );
              })}
            </div>
          </div>
        )}

        {isFavoritesTab && showGuestFavoritesContent && filteredTiles.length > 0 && searchResultFilter !== 'links' && (
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Favorite Spaces</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">({filteredTiles.length})</span>
          </div>
        )}

        {!showGuestBookmarks && filteredTiles.length > 0 && !(searchTerm.trim() && searchResultFilter === 'links') ? (
          <div className="grid grid-cols-3 gap-6">
            {filteredTiles.map((tile, index) => {
              const tileStyles = getTileStyles(tile);
              const animationClass = getTileAnimationClass(currentAnimation);
              const decorationClass = getTileDecorationClass(currentDecoration);
              const fullAnimationClass = `${animationClass} ${decorationClass}`.trim();
              const tileAnimatedClass = animationClass ? 'linknest-tile-animated' : '';

              // Check if tile is favorited (for authenticated users, use isFavorite; for guests, check public favorites)
              const isTileFavorited = isAuthenticated
                ? tile.isFavorite === true
                : isPublicFavorite(tile.id);

              return (
                <div
                  key={tile.id}
                  className={`flex flex-col items-center relative group mobile-tile ${fullAnimationClass} ${tileAnimatedClass}`}
                  style={{
                    animationDelay: fullAnimationClass ? `${index * 0.05}s` : undefined
                  }}
                >
                  {/* Tile Icon - Square like mobile app icon with modern styling */}
                  <div
                    onClick={() => onTileClick(tile.id)}
                    className="relative w-20 h-20 rounded-2xl shadow-lg hover:shadow-xl flex items-center justify-center text-3xl mb-2 transition-all duration-200 active:scale-90 group-hover:scale-105 cursor-pointer overflow-visible"
                    style={tileStyles}
                  >
                    {/* Ripple effect background */}
                    <div className="absolute inset-0 opacity-0 group-active:opacity-20 bg-white transition-opacity duration-200 rounded-2xl" />
                    {/* Tile icon — custom image when set, otherwise emoji */}
                    {tile.showEmoji !== false ? (
                      tile.emojiImage ? (
                        <img
                          src={tile.emojiImage}
                          alt=""
                          className="relative z-10 w-full h-full object-contain p-1.5 pointer-events-none select-none rounded-2xl"
                          style={{
                            opacity: Math.max(0, Math.min(100, tile.emojiImageOpacity ?? 100)) / 100,
                            transform: `translate(${Math.max(-50, Math.min(50, tile.emojiImageOffsetX ?? 0))}px, ${Math.max(-50, Math.min(50, tile.emojiImageOffsetY ?? 0))}px) scale(${Math.max(50, Math.min(300, tile.emojiImageZoom ?? 100)) / 100})`
                          }}
                          draggable={false}
                        />
                      ) : (
                        <span className="relative z-10">{tile.emoji || '📄'}</span>
                      )
                    ) : null}
                    {/* Subtle shine effect on hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-10 bg-gradient-to-br from-white/30 to-transparent transition-opacity duration-200 rounded-2xl pointer-events-none" />

                    {/* Favorite Button - Floating above tile in top right corner */}
                    {showFavoriteStars && (onToggleFavorite || !isAuthenticated) && localStorageAvailable && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleFavoriteToggle(tile.id);
                        }}
                        className={`absolute transition-all z-20 active:scale-90 pointer-events-auto hover:scale-110 ${isTileFavorited
                          ? 'text-amber-500 hover:text-amber-600'
                          : 'text-white/80 hover:text-amber-400'
                          }`}
                        style={{
                          top: '-6px',
                          right: '-6px',
                          width: '20px',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0',
                          background: isTileFavorited
                            ? 'rgba(251, 191, 36, 0.2)'
                            : 'rgba(0, 0, 0, 0.3)',
                          border: 'none',
                          borderRadius: '50%',
                          margin: '0',
                          outline: 'none',
                          boxSizing: 'border-box',
                          backdropFilter: 'blur(4px)',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}
                        title={isTileFavorited ? 'Remove from favorites' : 'Add to favorites'}
                        aria-label={isTileFavorited ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill={isTileFavorited ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          strokeWidth={isTileFavorited ? 0 : 2}
                          className="w-3 h-3"
                          style={{
                            width: '12px',
                            height: '12px',
                            display: 'block',
                            flexShrink: 0
                          }}
                          pointerEvents="none"
                        >
                          <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Tile Name - Force readable text color for mobile */}
                  <div className="text-center w-full">
                    <p
                      className="text-xs font-medium line-clamp-2 px-1 transition-colors duration-200 group-hover:text-brand-600 dark:group-hover:text-brand-400 cursor-pointer"
                      onClick={() => onTileClick(tile.id)}
                      style={{
                        color: darkMode ? '#f1f5f9' : '#1e293b' // Force readable text: light in dark mode, dark in light mode
                      }}
                    >
                      {tile.title || 'Untitled'}
                    </p>
                    {searchTerm.trim() && tileSearchMatches[tile.id]?.matched && (
                      <div className="mt-1 px-0.5">
                        <MatchScoreBadge match={tileSearchMatches[tile.id]} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : !showGuestBookmarks && favoriteLinks.length === 0 && !isLoadingFavoriteLinks && !(searchTerm.trim() && searchResultFilter !== 'tiles' && matchingSearchLinks.length > 0) ? (
          <div className="text-center py-16 animate-fadeIn">
            {!isAuthenticated && activeTab === 'public-favorites' ? (
              <>
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30 flex items-center justify-center shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-10 h-10 text-amber-500 dark:text-amber-400">
                    <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 005.29-4.546 4.02 4.02 0 011.582 1.3 4.027 4.027 0 001.524 1.008 4.5 4.5 0 005.884 4.548 4.02 4.02 0 011.582-1.3 4.027 4.027 0 001.524-1.008A4.5 4.5 0 0018 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 01-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 01-.69.001l-.002-.001z" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No favorites yet</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-xs mx-auto">
                  {localStorageAvailable
                    ? "Tap the star icon on any tile to add it to your favorites"
                    : "Browser storage is not available. Sign in to save favorites, or check your browser settings."}
                </p>
                {!localStorageAvailable && onLoginClick && settings?.signin_button_enabled !== '0' && (
                  <button
                    onClick={() => {
                      if (onLoginClick) onLoginClick();
                    }}
                    className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-medium transition-all active:scale-95 shadow-md hover:shadow-lg"
                  >
                    Sign In to Save Favorites
                  </button>
                )}
              </>
            ) : isFavoritesTab ? (
              <>
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30 flex items-center justify-center shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-10 h-10 text-amber-500 dark:text-amber-400">
                    <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 005.29-4.546 4.02 4.02 0 011.582 1.3 4.027 4.027 0 001.524 1.008 4.5 4.5 0 005.884 4.548 4.02 4.02 0 011.582-1.3 4.027 4.027 0 001.524-1.008A4.5 4.5 0 0018 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 01-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 01-.69.001l-.002-.001z" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No favorites yet</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-xs mx-auto">
                  Favorite spaces and links will show up here
                </p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-slate-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {searchTerm.trim() && searchResultFilter === 'links' ? 'No matching links' : 'No spaces found'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Try adjusting your search terms</p>
                {searchTerm && (
                  <button
                    onClick={() => onSearchChange('')}
                    className="px-6 py-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/50 rounded-xl text-sm font-medium transition-all active:scale-95"
                  >
                    Clear search
                  </button>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>

      <LinkMaintenanceDialog
        isOpen={!!linkMaintenanceDialog}
        onClose={() => setLinkMaintenanceDialog(null)}
        linkLabel={linkMaintenanceDialog?.label || ''}
        linkIcon={linkMaintenanceDialog?.icon}
        maintenanceMessage={linkMaintenanceDialog?.maintenanceMessage}
        maintenanceVideoUrl={linkMaintenanceDialog?.maintenanceVideoUrl}
      />
      <QRCodeDialog
        isOpen={showAppQrDialog}
        onClose={() => setShowAppQrDialog(false)}
        url={appShareUrl}
        label={appShareLabel}
      />
      <UpdatesDialog
        isOpen={showUpdatesDialog}
        onClose={() => setShowUpdatesDialog(false)}
      />
    </div>
  );
};
