/**
 * Public Favorites Service
 * Manages favorites stored in browser localStorage for public (non-authenticated) users.
 * These favorites are completely separate from internal favorites stored in the database.
 */

const STORAGE_KEY = 'linknest_public_favorites';
const ACTIVE_TAB_KEY = 'linknest_public_active_tab';

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
    const activeTab = getPublicActiveTab();
    
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      favorites: favorites,
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
    
    // Import favorites (replace existing)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.favorites));
    
    // Import active tab if present
    if (data.activeTab && typeof data.activeTab === 'string') {
      const validTabs = ['public', 'public-favorites'];
      if (validTabs.includes(data.activeTab)) {
        setPublicActiveTab(data.activeTab);
      }
    }
    
    return {
      success: true,
      message: `Successfully imported ${data.favorites.length} favorite(s).`,
      importedCount: data.favorites.length
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

