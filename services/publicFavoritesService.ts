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
 * Export public favorites to a JSON file
 */
export const exportPublicFavorites = (): void => {
  try {
    const favorites = getPublicFavorites();
    const linkFavorites = getPublicLinkFavorites();
    const activeTab = getPublicActiveTab();

    const exportData = {
      version: '1.1',
      exportDate: new Date().toISOString(),
      favorites: favorites,
      linkFavorites: linkFavorites,
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
 * Import public favorites from a JSON file
 */
export const importPublicFavorites = async (file: File): Promise<{
  success: boolean;
  message: string;
  importedCount: number;
}> => {
  try {
    // Read file as text
    const fileText = await file.text();

    // Parse JSON
    let data;
    try {
      data = JSON.parse(fileText);
    } catch (e) {
      throw new Error('Invalid JSON file. Please ensure the file is a valid public favorites export.');
    }

    // Validate structure
    if (!data.favorites || !Array.isArray(data.favorites)) {
      throw new Error('Invalid export format. Missing or invalid "favorites" array.');
    }

    // Validate that all favorites are strings (tile IDs)
    const invalidIds = data.favorites.filter((id: any) => typeof id !== 'string');
    if (invalidIds.length > 0) {
      throw new Error('Invalid favorite IDs found. All favorites must be strings (tile IDs).');
    }

    // Import tile favorites (replace existing)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.favorites));

    let totalImported = data.favorites.length;

    // Import link favorites if present (version 1.1+)
    if (data.linkFavorites && Array.isArray(data.linkFavorites)) {
      const invalidLinkIds = data.linkFavorites.filter((id: any) => typeof id !== 'string');
      if (invalidLinkIds.length === 0) {
        localStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(data.linkFavorites));
        totalImported += data.linkFavorites.length;
      }
    }

    // Import active tab if present
    if (data.activeTab && typeof data.activeTab === 'string') {
      const validTabs = ['public', 'public-favorites'];
      if (validTabs.includes(data.activeTab)) {
        setPublicActiveTab(data.activeTab);
      }
    }

    return {
      success: true,
      message: `Successfully imported ${data.favorites.length} tile favorite(s)${data.linkFavorites ? ` and ${data.linkFavorites.length} link favorite(s)` : ''}.`,
      importedCount: totalImported
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

