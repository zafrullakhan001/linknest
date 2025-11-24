import { Tile } from '../types';

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
    sections: apiTile.sections || []
  };
};

export const getTiles = async (): Promise<Tile[]> => {
  try {
    const response = await fetch(`${API_BASE}/tiles`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch tiles');
    }

    const apiTiles = await response.json();
    return apiTiles.map(transformTile);
  } catch (e) {
    console.error("Failed to load tiles", e);
    return [];
  }
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