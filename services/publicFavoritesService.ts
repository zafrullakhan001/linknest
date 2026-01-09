/**
 * Public Favorites Service
 * Manages favorites stored in browser localStorage for public (non-authenticated) users.
 * These favorites are completely separate from internal favorites stored in the database.
 */

const STORAGE_KEY = 'linknest_public_favorites';
const LINK_STORAGE_KEY = 'linknest_public_link_favorites';
const ACTIVE_TAB_KEY = 'linknest_public_active_tab';

// ============ TILE FAVORITES ============

/**
 * Get all public favorite tile IDs from localStorage
 */
export const getPublicFavorites = (): string[] => {
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
 */
export const addPublicFavorite = (tileId: string): void => {
  try {
    const favorites = getPublicFavorites();
    if (!favorites.includes(tileId)) {
      favorites.push(tileId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    }
  } catch (error) {
    console.error('Failed to add public favorite:', error);
  }
};

/**
 * Remove a tile from public favorites
 */
export const removePublicFavorite = (tileId: string): void => {
  try {
    const favorites = getPublicFavorites();
    const filtered = favorites.filter(id => id !== tileId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove public favorite:', error);
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
    return false;
  } else {
    addPublicLinkFavorite(linkId);
    return true;
  }
};

/**
 * Clear all public link favorites
 */
export const clearPublicLinkFavorites = (): void => {
  try {
    localStorage.removeItem(LINK_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear public link favorites:', error);
  }
};

