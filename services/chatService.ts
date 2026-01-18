// Chat service for managing chat messages and tile sharing
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
    console.error("Failed to fetch chat messages", e);
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
    // Clean tile data before sending - remove any user-specific or temporary fields
    const cleanTile = {
      ...tile,
      // Remove fields that shouldn't be shared
      id: undefined, // Will be regenerated on import
      createdAt: tile.createdAt || Date.now(),
      user_id: undefined,
      // Keep all other tile properties
    };
    
    return await sendMessage('', cleanTile, recipientId);
  } catch (e) {
    console.error("Failed to send tile", e);
    throw e;
  }
};
