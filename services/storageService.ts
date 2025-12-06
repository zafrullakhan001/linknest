import { Tile } from '../types';

// API_BASE uses relative URLs (starting with /) which are protocol-agnostic
// This ensures the app works with both HTTP and HTTPS automatically
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// Transform API response to Tile format
const transformTile = (apiTile: any): Tile => {
  return {
    id: apiTile.id,
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
    browser: apiTile.browser || undefined // Include browser if present
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

export const saveTiles = async (tiles: Tile[]): Promise<void> => {
  // For bulk operations, we'll update/create tiles individually
  // This is a simplified version - in production, you might want batch operations
  try {
    for (const tile of tiles) {
      await saveTile(tile);
    }
  } catch (e) {
    console.error("Failed to save tiles", e);
    throw e;
  }
};

export const saveTile = async (tile: Tile): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/tiles/${tile.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(tile)
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
      throw new Error('Failed to create tile');
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

export const saveTileArrangement = async (arrangement: Array<{ tileId: string; position: number; groupName?: string }>): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/arrangements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ arrangement })
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
    console.error("Failed to load category arrangement", e);
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
    console.error("Failed to get recycle bin", e);
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
      console.error("Failed to get archive:", errorData);
      throw new Error(errorMsg);
    }

    const apiTiles = await response.json();
    return apiTiles.map(transformTile);
  } catch (e) {
    console.error("Failed to get archive", e);
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