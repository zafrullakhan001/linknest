import { resolveApiBase } from './apiHelpers';

const API_BASE = resolveApiBase();

export interface BroadcastMessage {
  id: number;
  threadId: number;
  message: string;
  fontFamily: string;
  fontSize: string;
  color: string;
  scrollSpeed: number;
  expiresAt: number | null;
  /** Thread (topic) start time — first revision */
  createdAt: number;
  /** Last change on this thread */
  updatedAt: number;
  /** Number of revisions in this thread (1 = only original) */
  revisionCount: number;
  /** Timestamp of the latest revision */
  latestRevisionAt: number;
}

export interface BroadcastRevision {
  id: number;
  threadId: number;
  message: string;
  fontFamily: string;
  fontSize: string;
  color: string;
  scrollSpeed: number;
  expiresAt: number | null;
  createdAt: number;
}

export interface BroadcastThreadHistory {
  threadId: number;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
  /** Newest revision first */
  revisions: BroadcastRevision[];
}

export interface BroadcastHistoryResponse {
  threads: BroadcastThreadHistory[];
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
    if (!data || !data.id) {
      return null;
    }
    return {
      ...data,
      threadId: data.threadId ?? 0,
      revisionCount: typeof data.revisionCount === 'number' ? data.revisionCount : 1,
      latestRevisionAt: typeof data.latestRevisionAt === 'number' ? data.latestRevisionAt : data.updatedAt ?? 0,
    } as BroadcastMessage;
  },

  async getBroadcastHistory(): Promise<BroadcastThreadHistory[]> {
    const response = await fetch(`${API_BASE}/broadcast/history`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `Failed to load broadcast history: ${response.statusText}`);
    }

    const data: BroadcastHistoryResponse = await response.json();
    return Array.isArray(data?.threads) ? data.threads : [];
  },

  async createBroadcast(broadcast: {
    message: string;
    fontFamily?: string;
    fontSize?: string;
    color?: string;
    scrollSpeed?: number;
    expiresAt?: number | null;
  }): Promise<{ success: boolean; id: number; threadId: number; message: string }> {
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
    threadId: number;
    id?: number;
    message?: string;
    fontFamily?: string;
    fontSize?: string;
    color?: string;
    scrollSpeed?: number;
    expiresAt?: number | null;
    isActive?: boolean;
  }): Promise<{ success: boolean; id?: number; threadId?: number; message: string }> {
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

  async deleteBroadcast(threadIdOrRevisionId: number): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/broadcast`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ threadId: threadIdOrRevisionId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `Failed to delete broadcast: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  },
};
