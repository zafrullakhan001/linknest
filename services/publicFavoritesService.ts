/**
 * Public Favorites Service
 * Manages favorites stored in browser localStorage for public (non-authenticated) users.
 * These favorites are completely separate from internal favorites stored in the database.
 */

const STORAGE_KEY = 'linknest_public_favorites';
const LINK_STORAGE_KEY = 'linknest_public_link_favorites';
const LINK_DETAILS_STORAGE_KEY = 'linknest_public_link_favorite_details';
const ACTIVE_TAB_KEY = 'linknest_public_active_tab';

export interface PublicFavoriteLinkDetail {
  id: string;
  label: string;
  url: string;
  icon?: string;
  textColor?: string;
  visibility?: string;
  notes?: string;
  tooltip?: string;
  browser?: string;
  richTextContent?: string;
  health?: {
    status: 'unknown' | 'healthy' | 'broken' | 'timeout' | 'checking' | 'restricted' | 'accessible' | 'redirected';
    httpCode?: number | null;
    error?: string | null;
    checkedAt?: number | null;
  };
  tile: {
    id: string;
    title: string;
    emoji: string;
    themeColor: string;
  };
}

// ============ LOCALSTORAGE AVAILABILITY CHECK ============

/**
 * Check if localStorage is available and working in the current browser
 * This handles cases where:
 * - localStorage is blocked (e.g., Safari private mode, some mobile browsers)
 * - localStorage quota is exceeded
 * - localStorage is disabled by user/browser settings
 */
const isLocalStorageAvailable = (): boolean => {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    // localStorage is not available (blocked, quota exceeded, or disabled)
    return false;
  }
};

/**
 * Check if localStorage is available and log a warning if not
 * This helps users understand why favorites might not work
 */
export const checkLocalStorageAvailability = (): boolean => {
  const available = isLocalStorageAvailable();
  if (!available) {
    console.warn(
      '[PublicFavoritesService] localStorage is not available. ' +
      'Public favorites feature will not work. This may happen if: ' +
      '1. You are in private/incognito mode (some browsers clear localStorage), ' +
      '2. localStorage is disabled in browser settings, ' +
      '3. Storage quota is exceeded, or ' +
      '4. Your browser does not support localStorage.'
    );
  }
  return available;
};

// ============ TILE FAVORITES ============

/**
 * Get all public favorite tile IDs from localStorage
 * Returns empty array if localStorage is not available
 */
export const getPublicFavorites = (): string[] => {
  if (!isLocalStorageAvailable()) {
    return [];
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const favorites = JSON.parse(stored);
    return Array.isArray(favorites) ? favorites : [];
  } catch (error) {
    console.error('Failed to get public favorites:', error);
    return [];
  }
};

/**
 * Check if a tile is in public favorites
 */
export const isPublicFavorite = (tileId: string): boolean => {
  const favorites = getPublicFavorites();
  return favorites.includes(tileId);
};

/**
 * Add a tile to public favorites
 * Returns true if successful, false if localStorage is not available
 */
export const addPublicFavorite = (tileId: string): boolean => {
  if (!isLocalStorageAvailable()) {
    checkLocalStorageAvailability(); // Log warning
    return false;
  }
  
  try {
    const favorites = getPublicFavorites();
    if (!favorites.includes(tileId)) {
      favorites.push(tileId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
      return true;
    }
    return true; // Already in favorites
  } catch (error) {
    console.error('Failed to add public favorite:', error);
    return false;
  }
};

/**
 * Remove a tile from public favorites
 * Returns true if successful, false if localStorage is not available
 */
export const removePublicFavorite = (tileId: string): boolean => {
  if (!isLocalStorageAvailable()) {
    return false;
  }
  
  try {
    const favorites = getPublicFavorites();
    const filtered = favorites.filter(id => id !== tileId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Failed to remove public favorite:', error);
    return false;
  }
};

/**
 * Toggle a tile's public favorite status
 */
export const togglePublicFavorite = (tileId: string): boolean => {
  const isFavorite = isPublicFavorite(tileId);
  if (isFavorite) {
    removePublicFavorite(tileId);
    return false;
  } else {
    addPublicFavorite(tileId);
    return true;
  }
};

/**
 * Clear all public favorites
 */
export const clearPublicFavorites = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear public favorites:', error);
  }
};

/**
 * Get the active tab preference for public users
 */
export const getPublicActiveTab = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_TAB_KEY);
  } catch (error) {
    console.error('Failed to get public active tab:', error);
    return null;
  }
};

/**
 * Save the active tab preference for public users
 */
export const setPublicActiveTab = (tab: string): void => {
  try {
    localStorage.setItem(ACTIVE_TAB_KEY, tab);
  } catch (error) {
    console.error('Failed to save public active tab:', error);
  }
};

/**
 * Coerce mixed ID lists from older exports into unique non-empty strings.
 * Skips bad entries instead of failing the whole import.
 */
const normalizeIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    let id: string | null = null;
    if (typeof entry === 'string') {
      id = entry.trim();
    } else if (typeof entry === 'number' && Number.isFinite(entry)) {
      id = String(entry);
    } else if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const candidate = obj.id ?? obj.tileId ?? obj.linkId;
      if (typeof candidate === 'string') id = candidate.trim();
      else if (typeof candidate === 'number' && Number.isFinite(candidate)) id = String(candidate);
    }

    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
};

/**
 * Normalize cached link-detail snapshots from older exports.
 * Missing fields get safe defaults so Favorites can still render.
 */
const normalizeLinkFavoriteDetails = (
  value: unknown,
  linkIds: string[]
): Record<string, PublicFavoriteLinkDetail> => {
  const map: Record<string, PublicFavoriteLinkDetail> = {};
  if (!value || typeof value !== 'object') return map;

  const source = Array.isArray(value)
    ? Object.fromEntries(
        value
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => {
            const id = typeof item.id === 'string' ? item.id : '';
            return [id, item];
          })
          .filter(([id]) => !!id)
      )
    : (value as Record<string, unknown>);

  const preferredIds = linkIds.length > 0 ? linkIds : Object.keys(source);

  for (const id of preferredIds) {
    const raw = source[id];
    if (!raw || typeof raw !== 'object') continue;
    const detail = raw as Record<string, unknown>;
    const tileRaw =
      detail.tile && typeof detail.tile === 'object'
        ? (detail.tile as Record<string, unknown>)
        : {};

    const label =
      (typeof detail.label === 'string' && detail.label) ||
      (typeof detail.title === 'string' && detail.title) ||
      (typeof detail.name === 'string' && detail.name) ||
      'Favorite Link';
    const url =
      (typeof detail.url === 'string' && detail.url) ||
      (typeof detail.href === 'string' && detail.href) ||
      '';

    map[id] = {
      id,
      label,
      url,
      icon: typeof detail.icon === 'string' ? detail.icon : undefined,
      textColor: typeof detail.textColor === 'string' ? detail.textColor : undefined,
      visibility: typeof detail.visibility === 'string' ? detail.visibility : undefined,
      notes: typeof detail.notes === 'string' ? detail.notes : undefined,
      tooltip: typeof detail.tooltip === 'string' ? detail.tooltip : undefined,
      browser: typeof detail.browser === 'string' ? detail.browser : undefined,
      richTextContent: typeof detail.richTextContent === 'string' ? detail.richTextContent : undefined,
      health:
        detail.health && typeof detail.health === 'object'
          ? (detail.health as PublicFavoriteLinkDetail['health'])
          : undefined,
      tile: {
        id: typeof tileRaw.id === 'string' ? tileRaw.id : '',
        title: typeof tileRaw.title === 'string' ? tileRaw.title : 'Space',
        emoji: typeof tileRaw.emoji === 'string' ? tileRaw.emoji : '🔗',
        themeColor: typeof tileRaw.themeColor === 'string' ? tileRaw.themeColor : 'blue'
      }
    };
  }

  return map;
};

/**
 * Export public favorites to a JSON file
 */
export const exportPublicFavorites = (): void => {
  try {
    const favorites = getPublicFavorites();
    const linkFavorites = getPublicLinkFavorites();
    const linkFavoriteDetails = getPublicLinkFavoriteDetailsMap();
    const activeTab = getPublicActiveTab();

    const exportData = {
      version: '1.2',
      exportDate: new Date().toISOString(),
      favorites,
      linkFavorites,
      linkFavoriteDetails,
      activeTab: activeTab || 'public'
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linknest-public-favorites-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export public favorites:', error);
    throw error;
  }
};

/**
 * Import public favorites from a JSON file.
 * Tolerant of older app versions and incomplete JSON: missing fields are skipped
 * or defaulted, and invalid entries are filtered out instead of failing import.
 */
export const importPublicFavorites = async (file: File): Promise<{
  success: boolean;
  message: string;
  importedCount: number;
}> => {
  try {
    if (!isLocalStorageAvailable()) {
      checkLocalStorageAvailability();
      throw new Error('localStorage is not available. Cannot import favorites in this browser.');
    }

    const fileText = await file.text();

    let data: unknown;
    try {
      data = JSON.parse(fileText);
    } catch {
      throw new Error('Invalid JSON file. Please ensure the file is a valid public favorites export.');
    }

    // Support legacy shapes:
    // - { favorites, linkFavorites, ... } (current)
    // - [ "tile-id", ... ] (very old / raw ID list)
    // - { tileFavorites / tiles / spaces } alternate keys
    let favoritesRaw: unknown = [];
    let linkFavoritesRaw: unknown = undefined;
    let linkDetailsRaw: unknown = undefined;
    let activeTabRaw: unknown = undefined;

    if (Array.isArray(data)) {
      favoritesRaw = data;
    } else if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      favoritesRaw =
        obj.favorites ??
        obj.tileFavorites ??
        obj.tiles ??
        obj.spaces ??
        obj.favoriteTiles ??
        [];
      linkFavoritesRaw =
        obj.linkFavorites ??
        obj.favoriteLinks ??
        obj.links ??
        obj.linkIds;
      linkDetailsRaw =
        obj.linkFavoriteDetails ??
        obj.linkDetails ??
        obj.favoriteLinkDetails ??
        obj.linkFavoriteSnapshots;
      activeTabRaw = obj.activeTab;
    } else {
      throw new Error('Invalid export format. Expected a JSON object or array of favorite IDs.');
    }

    const hasFavoritesField = Array.isArray(data)
      ? true
      : !!(data && typeof data === 'object' && (
          'favorites' in (data as object) ||
          'tileFavorites' in (data as object) ||
          'tiles' in (data as object) ||
          'spaces' in (data as object) ||
          'favoriteTiles' in (data as object)
        ));

    const favorites = normalizeIdList(favoritesRaw);
    const linkFavorites = linkFavoritesRaw === undefined
      ? null
      : normalizeIdList(linkFavoritesRaw);

    // Nothing usable at all
    if (
      (!hasFavoritesField || favorites.length === 0) &&
      (linkFavorites === null || linkFavorites.length === 0) &&
      !linkDetailsRaw
    ) {
      throw new Error('No favorites found in this file. Nothing to import.');
    }

    // Only replace fields that exist in the file (missing keys keep current localStorage)
    if (hasFavoritesField) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    }

    let importedLinks = 0;
    if (linkFavorites !== null) {
      localStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(linkFavorites));
      importedLinks = linkFavorites.length;
    }

    // Import link detail snapshots when present (v1.2+); still helpful for older partial payloads
    const detailLinkIds = linkFavorites ?? getPublicLinkFavorites();
    if (linkDetailsRaw) {
      const detailsMap = normalizeLinkFavoriteDetails(linkDetailsRaw, detailLinkIds);
      // Also pull IDs from details when linkFavorites was missing
      if (linkFavorites === null && Object.keys(detailsMap).length > 0) {
        const inferredIds = Object.keys(detailsMap);
        localStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(inferredIds));
        importedLinks = inferredIds.length;
      }
      localStorage.setItem(LINK_DETAILS_STORAGE_KEY, JSON.stringify(detailsMap));
    } else if (linkFavorites !== null) {
      // Drop stale snapshots that no longer match imported IDs
      const existing = getPublicLinkFavoriteDetailsMap();
      const kept: Record<string, PublicFavoriteLinkDetail> = {};
      for (const id of linkFavorites) {
        if (existing[id]) kept[id] = existing[id];
      }
      localStorage.setItem(LINK_DETAILS_STORAGE_KEY, JSON.stringify(kept));
    }

    if (typeof activeTabRaw === 'string') {
      const validTabs = ['public', 'public-favorites'];
      if (validTabs.includes(activeTabRaw)) {
        setPublicActiveTab(activeTabRaw);
      }
    }

    const parts: string[] = [];
    if (hasFavoritesField) {
      parts.push(`${favorites.length} space favorite(s)`);
    }
    if (linkFavorites !== null || importedLinks > 0) {
      parts.push(`${importedLinks} link favorite(s)`);
    }
    if (parts.length === 0) {
      parts.push('link details');
    }

    return {
      success: true,
      message: `Successfully imported ${parts.join(' and ')}.`,
      importedCount: (hasFavoritesField ? favorites.length : 0) + importedLinks
    };
  } catch (error) {
    console.error('Failed to import public favorites:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to import public favorites';
    return {
      success: false,
      message: errorMessage,
      importedCount: 0
    };
  }
};

// ============ LINK FAVORITES ============

/**
 * Get all public favorite link IDs from localStorage
 */
export const getPublicLinkFavorites = (): string[] => {
  try {
    const stored = localStorage.getItem(LINK_STORAGE_KEY);
    if (!stored) return [];
    const favorites = JSON.parse(stored);
    return Array.isArray(favorites) ? favorites : [];
  } catch (error) {
    console.error('Failed to get public link favorites:', error);
    return [];
  }
};

/**
 * Check if a link is in public favorites
 */
export const isPublicLinkFavorite = (linkId: string): boolean => {
  const favorites = getPublicLinkFavorites();
  return favorites.includes(linkId);
};

/**
 * Add a link to public favorites
 */
export const addPublicLinkFavorite = (linkId: string): void => {
  try {
    const favorites = getPublicLinkFavorites();
    if (!favorites.includes(linkId)) {
      favorites.push(linkId);
      localStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(favorites));
    }
  } catch (error) {
    console.error('Failed to add public link favorite:', error);
  }
};

/**
 * Remove a link from public favorites
 */
export const removePublicLinkFavorite = (linkId: string): void => {
  try {
    const favorites = getPublicLinkFavorites();
    const filtered = favorites.filter(id => id !== linkId);
    localStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove public link favorite:', error);
  }
};

/**
 * Toggle a link's public favorite status
 */
export const togglePublicLinkFavorite = (linkId: string): boolean => {
  const isFavorite = isPublicLinkFavorite(linkId);
  if (isFavorite) {
    removePublicLinkFavorite(linkId);
    removePublicLinkFavoriteDetail(linkId);
    return false;
  } else {
    addPublicLinkFavorite(linkId);
    return true;
  }
};

/**
 * Get cached public favorite link details (snapshots saved when favoriting).
 */
export const getPublicLinkFavoriteDetailsMap = (): Record<string, PublicFavoriteLinkDetail> => {
  try {
    const stored = localStorage.getItem(LINK_DETAILS_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error('Failed to get public link favorite details:', error);
    return {};
  }
};

/**
 * Ordered list of cached public favorite link details for current IDs.
 */
export const getPublicLinkFavoriteDetails = (): PublicFavoriteLinkDetail[] => {
  const ids = getPublicLinkFavorites();
  const map = getPublicLinkFavoriteDetailsMap();
  return ids.map((id) => map[id]).filter(Boolean) as PublicFavoriteLinkDetail[];
};

/**
 * Store/update a snapshot for a public favorite link so the Favorites tab
 * can render even when home-grid tiles are loaded in summary mode.
 */
export const upsertPublicLinkFavoriteDetail = (detail: PublicFavoriteLinkDetail): void => {
  if (!detail?.id) return;
  try {
    const map = getPublicLinkFavoriteDetailsMap();
    map[detail.id] = detail;
    localStorage.setItem(LINK_DETAILS_STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.error('Failed to save public link favorite detail:', error);
  }
};

export const removePublicLinkFavoriteDetail = (linkId: string): void => {
  try {
    const map = getPublicLinkFavoriteDetailsMap();
    if (map[linkId]) {
      delete map[linkId];
      localStorage.setItem(LINK_DETAILS_STORAGE_KEY, JSON.stringify(map));
    }
  } catch (error) {
    console.error('Failed to remove public link favorite detail:', error);
  }
};

/**
 * Replace cached details with a freshly resolved list (keeps only current IDs).
 */
export const syncPublicLinkFavoriteDetails = (details: PublicFavoriteLinkDetail[]): void => {
  try {
    const ids = new Set(getPublicLinkFavorites());
    const map: Record<string, PublicFavoriteLinkDetail> = {};
    details.forEach((detail) => {
      if (detail?.id && ids.has(detail.id)) {
        map[detail.id] = detail;
      }
    });
    localStorage.setItem(LINK_DETAILS_STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.error('Failed to sync public link favorite details:', error);
  }
};

/**
 * Clear all public link favorites
 */
export const clearPublicLinkFavorites = (): void => {
  try {
    localStorage.removeItem(LINK_STORAGE_KEY);
    localStorage.removeItem(LINK_DETAILS_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear public link favorites:', error);
  }
};

