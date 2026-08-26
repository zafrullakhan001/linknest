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
  recipient_username?: string | null; // set when recipient_user_id is a direct message
  created_at: number;
  created_at_iso?: string; // ISO date string
}

export const PUBLIC_CHAT_CONVERSATION = 'public';

const conversationLastSeenKey = (userId: number, conversationId: string | number): string =>
  `linknest_last_seen_conv_${userId}_${conversationId}`;

const legacyLastSeenKey = (userId: number): string => `linknest_last_seen_message_${userId}`;

export const getMessageRecipientId = (message: Pick<ChatMessage, 'recipient_user_id'>): number | null => {
  const raw = message.recipient_user_id as unknown;
  if (raw === null || raw === undefined || raw === '') return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
};

/** Public thread, or the other person's user id for a 1-to-1. */
export const getChatConversationId = (
  message: Pick<ChatMessage, 'user_id' | 'recipient_user_id'>,
  currentUserId: number
): string | number => {
  const destId = getMessageRecipientId(message);
  if (destId === null) return PUBLIC_CHAT_CONVERSATION;
  const senderId = Number(message.user_id);
  if (senderId === Number(currentUserId)) return destId;
  return senderId;
};

export const getConversationLastSeen = (userId: number, conversationId: string | number): number => {
  try {
    const raw = localStorage.getItem(conversationLastSeenKey(userId, conversationId));
    if (raw != null && raw !== '') {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    const legacy = parseInt(localStorage.getItem(legacyLastSeenKey(userId)) || '0', 10);
    return Number.isFinite(legacy) ? legacy : 0;
  } catch {
    return 0;
  }
};

export const setConversationLastSeen = (
  userId: number,
  conversationId: string | number,
  messageId: number
): void => {
  if (!Number.isFinite(messageId) || messageId <= 0) return;
  try {
    const current = getConversationLastSeen(userId, conversationId);
    if (messageId <= current) return;
    localStorage.setItem(conversationLastSeenKey(userId, conversationId), String(messageId));
  } catch {
    // ignore quota / private mode
  }
};

export const isChatMessageUnread = (
  message: ChatMessage,
  currentUserId: number,
  lastSeenOverride?: Record<string, number>
): boolean => {
  if (Number(message.user_id) === Number(currentUserId)) return false;
  const convId = getChatConversationId(message, currentUserId);
  const lastSeen =
    lastSeenOverride?.[String(convId)] ?? getConversationLastSeen(currentUserId, convId);
  return message.id > lastSeen;
};

export const getMessages = async (
  limit: number = 100,
  offset: number = 0,
  recipientId?: number | null,
  options?: { scope?: 'inbox' | 'direct' }
): Promise<ChatMessage[]> => {
  try {
    let url = `${API_BASE}/chat?limit=${limit}&offset=${offset}`;
    if (options?.scope === 'inbox' || options?.scope === 'direct') {
      url += `&scope=${options.scope}`;
    } else if (recipientId !== null && recipientId !== undefined) {
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

export const clearConversation = async (recipientId: number): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE}/chat/conversation/${recipientId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to clear conversation' }));
      throw new Error(errorData.error || 'Failed to clear conversation');
    }
  } catch (e) {
    console.error("Failed to clear chat conversation", e);
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
