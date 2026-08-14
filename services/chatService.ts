// Chat service for managing chat messages and tile sharing
import { Tile } from '../types';
import { getTile } from './storageService';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface ChatMessage {
  id: number;
  user_id: number;
  username: string;
  message?: string;
  message_type: 'text' | 'json' | 'tile';
  tile_data?: any; // Full tile object when message_type is 'tile'
  recipient_user_id?: number | null; // null for public messages
  created_at: number;
  created_at_iso?: string; // ISO date string
}

export const getMessages = async (limit: number = 100, offset: number = 0, recipientId?: number | null): Promise<ChatMessage[]> => {
  try {
    let url = `${API_BASE}/chat?limit=${limit}&offset=${offset}`;
    if (recipientId !== null && recipientId !== undefined) {
      url += `&recipient_id=${recipientId}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to fetch messages' }));
      throw new Error(errorData.error || 'Failed to fetch messages');
    }

    return await response.json();
  } catch (e) {
    throw e;
  }
};

export const sendMessage = async (message: string, tileData?: any, recipientId?: number | null): Promise<ChatMessage> => {
  try {
    const body: any = {};
    
    if (tileData) {
      body.tile_data = tileData;
      body.message_type = 'tile';
    } else {
      body.message = message;
    }
    
    if (recipientId !== null && recipientId !== undefined) {
      body.recipient_user_id = recipientId;
    }
    
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to send message' }));
      throw new Error(errorData.error || 'Failed to send message');
    }

    return await response.json();
  } catch (e) {
    console.error("Failed to send chat message", e);
    throw e;
  }
};

export const deleteMessage = async (messageId: number): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/chat/${messageId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to delete message' }));
      throw new Error(errorData.error || 'Failed to delete message');
    }
  } catch (e) {
    console.error("Failed to delete chat message", e);
    throw e;
  }
};

export const sendTile = async (tile: any, recipientId?: number | null): Promise<ChatMessage> => {
  try {
    if (!tile?.id) {
      throw new Error('Cannot share this tile: missing space id.');
    }

    // Home-grid tiles are summary-only (empty tabs/links). Load the full nested space.
    const fullTile = await getTile(tile.id);
    if (!fullTile) {
      throw new Error('Failed to load full space data for sharing. Please try again.');
    }

    const {
      id: _id,
      userId: _userId,
      user_id: _user_id,
      canView: _canView,
      canEdit: _canEdit,
      canDelete: _canDelete,
      hasRoleAccess: _hasRoleAccess,
      canAddLinks: _canAddLinks,
      canAddSections: _canAddSections,
      canAddTabs: _canAddTabs,
      canEditLinks: _canEditLinks,
      canDeleteLinks: _canDeleteLinks,
      canDeleteSections: _canDeleteSections,
      canDeleteTabs: _canDeleteTabs,
      canChangeVisibility: _canChangeVisibility,
      canChangeBrowser: _canChangeBrowser,
      canCloneTile: _canCloneTile,
      canViewTileInfo: _canViewTileInfo,
      canEditTile: _canEditTile,
      searchLinks: _searchLinks,
      sharedWithMeInvitationId: _sharedInv,
      sharedWithMeSharer: _sharedSharer,
      isFavorite: _isFavorite,
      deletedAt: _deletedAt,
      archivedAt: _archivedAt,
      ...shareable
    } = fullTile as Tile & { user_id?: unknown };

    const cleanTile = {
      ...shareable,
      createdAt: fullTile.createdAt || Date.now(),
    };

    return await sendMessage('', cleanTile, recipientId);
  } catch (e) {
    console.error("Failed to send tile", e);
    throw e;
  }
};
