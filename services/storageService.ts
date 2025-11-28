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
    tabs: apiTile.tabs || undefined, // Include tabs if present
    sections: apiTile.sections || [], // Keep for backward compatibility
    visibility: apiTile.visibility || 'public',
    allowedUsers: apiTile.allowedUsers || undefined,
    isFavorite: apiTile.isFavorite || false,
    isHyperlink: apiTile.isHyperlink || false,
    hyperlinkUrl: apiTile.hyperlinkUrl || undefined,
    openInNewTab: apiTile.openInNewTab !== undefined ? apiTile.openInNewTab : undefined
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

export const saveCategoryArrangement = async (categories: Array<{ categoryName: string; position: number }>): Promise<void> => {
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

export const getCategoryArrangement = async (): Promise<Array<{ categoryName: string; position: number }>> => {
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
      throw new Error('Failed to clone tile');
    }

    const data = await response.json();
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