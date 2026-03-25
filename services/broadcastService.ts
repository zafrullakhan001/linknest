import { resolveApiBase } from './apiHelpers';

const API_BASE = resolveApiBase();

export interface BroadcastMessage {
  id: number;
  message: string;
  fontFamily: string;
  fontSize: string;
  color: string;
  scrollSpeed: number;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface BroadcastHistoryItem extends BroadcastMessage {
  isActive: boolean;
}

export const broadcastService = {
  async getBroadcast(): Promise<BroadcastMessage | null> {
    const response = await fetch(`${API_BASE}/broadcast`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data && data.id ? data : null;
  },

  async getBroadcastHistory(): Promise<BroadcastHistoryItem[]> {
    const response = await fetch(`${API_BASE}/broadcast/history`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `Failed to load broadcast history: ${response.statusText}`);
    }

    const data = await response.json();
    const items = data?.items;
    return Array.isArray(items) ? items : [];
  },

  async createBroadcast(broadcast: {
    message: string;
    fontFamily?: string;
    fontSize?: string;
    color?: string;
    scrollSpeed?: number;
    expiresAt?: number | null;
  }): Promise<{ id: number; message: string }> {
    const response = await fetch(`${API_BASE}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        message: broadcast.message,
        fontFamily: broadcast.fontFamily || 'Arial, sans-serif',
        fontSize: broadcast.fontSize || '16px',
        color: broadcast.color || '#ff0000',
        scrollSpeed: broadcast.scrollSpeed || 30,
        expiresAt: broadcast.expiresAt || null,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `Failed to create broadcast: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  },

  async updateBroadcast(broadcast: {
    id: number;
    message?: string;
    fontFamily?: string;
    fontSize?: string;
    color?: string;
    scrollSpeed?: number;
    expiresAt?: number | null;
    isActive?: boolean;
  }): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/broadcast`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(broadcast),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `Failed to update broadcast: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  },

  async deleteBroadcast(id: number): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/broadcast`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `Failed to delete broadcast: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  },
};
