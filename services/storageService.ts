import { Tile } from '../types';

// API_BASE uses relative URLs (starting with /) which are protocol-agnostic
// This ensures the app works with both HTTP and HTTPS automatically
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// Transform API response to Tile format
const transformTile = (apiTile: any): Tile => {
  return {
    id: apiTile.id,
    userId: apiTile.userId !== undefined && apiTile.userId !== null ? Number(apiTile.userId) : undefined,
    title: apiTile.title,
    description: apiTile.description || '',
    htmlContent: apiTile.htmlContent || '',
    emoji: apiTile.emoji || '📁',
    themeColor: (apiTile.themeColor || 'blue') as any,
    group: apiTile.group || 'General',
    createdAt: apiTile.createdAt || Date.now(),
    tabs: apiTile.tabs || undefined, // Include tabs if present (with richTextContent)
    sections: apiTile.sections || [], // Keep for backward compatibility (with richTextContent)
    visibility: apiTile.visibility || 'public',
    allowedUsers: apiTile.allowedUsers || undefined,
    isFavorite: apiTile.isFavorite || false,
    isHyperlink: apiTile.isHyperlink || false,
    hyperlinkUrl: apiTile.hyperlinkUrl || undefined,
    openInNewTab: apiTile.openInNewTab !== undefined ? apiTile.openInNewTab : undefined,
    canView: apiTile.canView !== undefined ? apiTile.canView : true, // Default to true if not set
    canEdit: apiTile.canEdit !== undefined ? apiTile.canEdit : false, // Default to false if not set
    canDelete: apiTile.canDelete !== undefined ? apiTile.canDelete : false, // Default to false if not set
    deletedAt: apiTile.deletedAt || undefined, // Include deletedAt if present (for recycle bin)
    archivedAt: apiTile.archivedAt || undefined, // Include archivedAt if present (for archive)
    visibleFrom: apiTile.visibleFrom || undefined,
    expiresAt: apiTile.expiresAt || undefined,
    browser: apiTile.browser || undefined, // Include browser if present
    // Tile decoration properties - preserve all values including false/0, only use undefined for null/missing
    tileBackgroundColor: apiTile.tileBackgroundColor !== undefined && apiTile.tileBackgroundColor !== null && apiTile.tileBackgroundColor !== '' ? apiTile.tileBackgroundColor : undefined,
    tileGradientEnabled: apiTile.tileGradientEnabled !== undefined && apiTile.tileGradientEnabled !== null ? Boolean(apiTile.tileGradientEnabled) : undefined,
    tileGradientColors: apiTile.tileGradientColors !== undefined && apiTile.tileGradientColors !== null && Array.isArray(apiTile.tileGradientColors) && apiTile.tileGradientColors.length > 0 ? apiTile.tileGradientColors : undefined,
    tileGradientColorPositions: apiTile.tileGradientColorPositions !== undefined && apiTile.tileGradientColorPositions !== null && Array.isArray(apiTile.tileGradientColorPositions) && apiTile.tileGradientColorPositions.length > 0 ? apiTile.tileGradientColorPositions : undefined,
    tileGradientDirection: apiTile.tileGradientDirection !== undefined && apiTile.tileGradientDirection !== null ? (typeof apiTile.tileGradientDirection === 'number' ? apiTile.tileGradientDirection : Number(apiTile.tileGradientDirection) || 90) : undefined,
    tileGradientType: apiTile.tileGradientType !== undefined && apiTile.tileGradientType !== null && apiTile.tileGradientType !== '' ? apiTile.tileGradientType : undefined,
    tileBorderRadius: apiTile.tileBorderRadius !== undefined && apiTile.tileBorderRadius !== null ? Number(apiTile.tileBorderRadius) : undefined,
    tileTextColor: apiTile.tileTextColor !== undefined && apiTile.tileTextColor !== null && apiTile.tileTextColor !== '' ? apiTile.tileTextColor : undefined,
    messages: apiTile.messages || undefined // Include scheduled messages
  };
};

export const getTiles = async (): Promise<Tile[]> => {
  const response = await fetch(`${API_BASE}/tiles`, {
    method: 'GET',
    credentials: 'include'
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Failed to fetch tiles' }));
    const error = new Error(errorData.error || 'Failed to fetch tiles') as any;
    error.response = { status: response.status };
    throw error;
  }

  const apiTiles = await response.json();
  return apiTiles.map(transformTile);
};

export const saveTiles = async (tiles: Tile[], isFinal: boolean = false): Promise<void> => {
  // For bulk operations, we'll update/create tiles individually
  // This is a simplified version - in production, you might want batch operations
  try {
    for (const tile of tiles) {
      await saveTile(tile, isFinal);
    }
  } catch (e) {
    console.error("Failed to save tiles", e);
    throw e;
  }
};

export const saveTile = async (tile: Tile, isFinal: boolean = false): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tile.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...tile, is_final: isFinal })
    });

    if (!response.ok) {
      throw new Error('Failed to save tile');
    }
  } catch (e) {
    console.error("Failed to save tile", e);
    throw e;
  }
};

export const createTile = async (tile: Tile): Promise<Tile> => {
  try {
    const response = await fetch(`${API_BASE}/tiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(tile)
    });

    if (!response.ok) {
      let errorMessage = 'Failed to create tile';
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
        if (errorData.details) {
          errorMessage += `: ${errorData.details}`;
        }
      } catch {
        // If response is not JSON, use status text
        errorMessage = `Failed to create tile (${response.status} ${response.statusText})`;
      }
      const error = new Error(errorMessage) as any;
      error.response = { status: response.status };
      throw error;
    }

    const data = await response.json();
    // Fetch the created tile to get full data
    const tiles = await getTiles();
    const created = tiles.find(t => t.id === data.id || t.id === tile.id);
    return created || tile;
  } catch (e) {
    console.error("Failed to create tile", e);
    throw e;
  }
};

export const deleteTile = async (tileId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to delete tile');
    }
  } catch (e) {
    console.error("Failed to delete tile", e);
    throw e;
  }
};

export const initializeTiles = (): Tile[] => {
  // This is now just for fallback/default tiles
  // In practice, tiles come from the API
  return [];
};

export const saveTileArrangement = async (
  arrangement: Array<{ tileId: string; position: number; groupName?: string }>,
  scope?: 'global' | 'private'
): Promise<void> => {
  try {
    const body: { arrangement: typeof arrangement; scope?: 'global' | 'private' } = { arrangement };
    if (scope) body.scope = scope;
    const response = await fetch(`${API_BASE}/arrangements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMsg = errorData.details || errorData.error || 'Failed to save tile arrangement';
      console.error("Failed to save tile arrangement:", errorData);
      throw new Error(errorMsg);
    }
  } catch (e) {
    console.error("Failed to save tile arrangement", e);
    throw e;
  }
};

export const getTileArrangement = async (): Promise<Array<{ tileId: string; position: number; groupName?: string }>> => {
  try {
    const response = await fetch(`${API_BASE}/arrangements`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch tile arrangement');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to load tile arrangement", e);
    return [];
  }
};

export const saveCategoryArrangement = async (categories: Array<{ categoryName: string; position: number; visibleFrom?: string | null; expiresAt?: string | null }>): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/arrangements/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ categories })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMsg = errorData.details || errorData.error || 'Failed to save category arrangement';
      console.error("Failed to save category arrangement:", errorData);
      throw new Error(errorMsg);
    }
  } catch (e) {
    console.error("Failed to save category arrangement", e);
    throw e;
  }
};

export const getCategoryArrangement = async (): Promise<Array<{ categoryName: string; position: number; visibleFrom?: string | null; expiresAt?: string | null }>> => {
  try {
    const response = await fetch(`${API_BASE}/arrangements/categories`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch category arrangement');
    }

    return await response.json();
  } catch (e) {
    return [];
  }
};

export const bulkImportTiles = async (file: File): Promise<{
  success: boolean;
  created: number;
  errors: number;
  createdTiles: Array<{ id: string; title: string }>;
  errorMessages: string[];
}> => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/tiles/bulk-import`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || 'Failed to bulk import tiles');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to bulk import tiles", e);
    throw e;
  }
};

export const toggleFavorite = async (tileId: string): Promise<{ isFavorite: boolean }> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/favorite`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to toggle favorite');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to toggle favorite", e);
    throw e;
  }
};

export const getFavorites = async (): Promise<{ favoriteTileIds: string[]; favoriteLinkIds: string[] }> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/favorites`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch favorites');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to fetch favorites", e);
    return { favoriteTileIds: [], favoriteLinkIds: [] };
  }
};

export const toggleLinkFavorite = async (linkId: string): Promise<{ isFavorite: boolean }> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/link/${linkId}/favorite`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to toggle link favorite' }));
      throw new Error(errorData.error || 'Failed to toggle link favorite');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to toggle link favorite", e);
    throw e;
  }
};

export interface FavoriteLink {
  id: string;
  label: string;
  url: string;
  icon?: string;
  textColor?: string;
  visibility?: string;
  notes?: string;
  tooltip?: string;
  browser?: string;
  isFavorite: boolean;
  health?: {
    status: 'unknown' | 'healthy' | 'broken' | 'timeout' | 'checking' | 'restricted' | 'accessible';
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

export const getFavoriteLinks = async (): Promise<FavoriteLink[]> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/favorites/links`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('API Error Response:', errorData);
      throw new Error('Failed to fetch favorite links');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to fetch favorite links", e);
    return [];
  }
};

export const cloneTile = async (tileId: string): Promise<Tile> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/clone`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to clone tile' }));
      throw new Error(errorData.error || 'Failed to clone tile');
    }

    const data = await response.json();
    if (!data.success || !data.id) {
      throw new Error(data.error || 'Failed to clone tile');
    }

    // Fetch the cloned tile to get full data
    const tiles = await getTiles();
    const cloned = tiles.find(t => t.id === data.id);
    if (!cloned) {
      throw new Error('Cloned tile not found');
    }
    return cloned;
  } catch (e) {
    console.error("Failed to clone tile", e);
    throw e;
  }
};

export const cloneCategory = async (categoryName: string): Promise<{
  success: boolean;
  newCategoryName: string;
  clonedTiles: Array<{ id: string; title: string }>;
  clonedCount: number;
  errors: string[];
}> => {
  try {
    const encodedCategoryName = encodeURIComponent(categoryName);
    const response = await fetch(`${API_BASE}/tiles/category/${encodedCategoryName}/clone`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to clone category' }));
      throw new Error(errorData.error || 'Failed to clone category');
    }

    const data = await response.json();
    return data;
  } catch (e) {
    console.error("Failed to clone category", e);
    throw e;
  }
};

export const toggleCategoryFavorite = async (categoryName: string): Promise<{
  success: boolean;
  isFavorite: boolean;
  action: string;
  tilesAffected: number;
}> => {
  try {
    const encodedCategoryName = encodeURIComponent(categoryName);
    const response = await fetch(`${API_BASE}/tiles/category/${encodedCategoryName}/favorite`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to toggle category favorite' }));
      throw new Error(errorData.error || 'Failed to toggle category favorite');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to toggle category favorite", e);
    throw e;
  }
};

export const archiveCategory = async (categoryName: string): Promise<{
  success: boolean;
  archivedCount: number;
  categoryName: string;
}> => {
  try {
    const encodedCategoryName = encodeURIComponent(categoryName);
    const response = await fetch(`${API_BASE}/tiles/category/${encodedCategoryName}/archive`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to archive category' }));
      throw new Error(errorData.error || 'Failed to archive category');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to archive category", e);
    throw e;
  }
};

export const unarchiveCategory = async (categoryName: string): Promise<{
  success: boolean;
  unarchivedCount: number;
  categoryName: string;
}> => {
  try {
    const encodedCategoryName = encodeURIComponent(categoryName);
    const response = await fetch(`${API_BASE}/tiles/category/${encodedCategoryName}/unarchive`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to unarchive category' }));
      throw new Error(errorData.error || 'Failed to unarchive category');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to unarchive category", e);
    throw e;
  }
};

export const getRecycleBin = async (): Promise<Tile[]> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/recycle-bin`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch recycle bin');
    }

    const apiTiles = await response.json();
    return apiTiles.map(transformTile);
  } catch (e) {
    throw e;
  }
};

export const restoreTile = async (tileId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/restore`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to restore tile');
    }
  } catch (e) {
    console.error("Failed to restore tile", e);
    throw e;
  }
};

export const getArchive = async (): Promise<Tile[]> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/archive`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMsg = errorData.details || errorData.error || 'Failed to fetch archive';
      throw new Error(errorMsg);
    }

    const apiTiles = await response.json();
    return apiTiles.map(transformTile);
  } catch (e) {
    throw e;
  }
};

export const archiveTile = async (tileId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/archive`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMsg = errorData.details || errorData.error || 'Failed to archive tile';
      console.error("Failed to archive tile:", errorData);
      throw new Error(errorMsg);
    }
  } catch (e) {
    console.error("Failed to archive tile", e);
    throw e;
  }
};

export const unarchiveTile = async (tileId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/unarchive`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to unarchive tile');
    }
  } catch (e) {
    console.error("Failed to unarchive tile", e);
    throw e;
  }
};

export const purgeRecycleBin = async (): Promise<{ success: boolean; purgedCount: number }> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/purge-recycle-bin`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to purge recycle bin');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to purge recycle bin", e);
    throw e;
  }
};

export const permanentDeleteTile = async (tileId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/permanent`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to permanently delete tile');
    }
  } catch (e) {
    console.error("Failed to permanently delete tile", e);
    throw e;
  }
};

export const permanentDeleteCategory = async (categoryName: string): Promise<{ success: boolean; purgedCount: number; categoryName: string }> => {
  try {
    const encodedCategoryName = encodeURIComponent(categoryName);
    const response = await fetch(`${API_BASE}/tiles/category/${encodedCategoryName}/permanent`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to permanently delete category');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to permanently delete category", e);
    throw e;
  }
};

export const createTempVersion = async (tileId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tileId}/create-temp-version`, {
      method: 'POST',
      credentials: 'include'
    });

    if (!response.ok) {
      console.warn('Failed to create temp version');
    }
  } catch (e) {
    console.error("Failed to create temp version", e);
  }
};

export const purgeArchive = async (): Promise<{ success: boolean; purgedCount: number }> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/purge-archive`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to purge archive');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to purge archive", e);
    throw e;
  }
};