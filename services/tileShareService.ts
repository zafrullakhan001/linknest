/**
 * Tile Share Service - Share tiles with users, accept/reject invitations,
 * remove shared tiles, block/unblock sharers.
 */
import { resolveApiBase } from './apiHelpers';

function getApiBase(): string {
  return resolveApiBase();
}

export interface TileShareInvitation {
  id: number;
  tileId: string;
  sharerUserId: number;
  sharerUsername: string;
  receiverUserId: number;
  status: 'pending' | 'accepted' | 'rejected' | 'removed';
  createdAt: number;
  tile?: TilePreview;
}

export interface TilePreview {
  id: string;
  userId?: number;
  ownerUsername?: string;
  title: string;
  description: string;
  emoji: string;
  themeColor: string;
  group?: string;
  visibility?: string;
  tabs: Array<{
    id: string;
    title: string;
    position: number;
    sections: Array<{
      id: string;
      title: string;
      position: number;
      links: Array<{ id: string; label: string; url: string; icon?: string }>;
    }>;
  }>;
  tileBackgroundColor?: string;
  tileGradientEnabled?: boolean;
  tileGradientColors?: string[];
  tileGradientDirection?: string;
  tileBorderRadius?: number;
  tileTextColor?: string;
}

export interface BlockedUser {
  userId: number;
  username: string;
  blockedAt: number;
}

/** One share record for a tile (when current user is the sharer). */
export interface TileShareRecord {
  id: number;
  tileId: string;
  receiverUserId: number;
  receiverUsername: string;
  status: 'pending' | 'accepted';
  createdAt: number;
}

export const getPendingInvitations = async (): Promise<TileShareInvitation[]> => {
  const res = await fetch(`${getApiBase()}/tile-shares`, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch invitations' }));
    throw new Error(err.error || 'Failed to fetch invitations');
  }
  const data = await res.json();
  return data.invitations || [];
};

export const getBlockedUsers = async (): Promise<BlockedUser[]> => {
  const res = await fetch(`${getApiBase()}/tile-shares/blocked`, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch blocked users' }));
    throw new Error(err.error || 'Failed to fetch blocked users');
  }
  const data = await res.json();
  return data.blocked || [];
};

export const getTileShares = async (tileId: string): Promise<TileShareRecord[]> => {
  const res = await fetch(`${getApiBase()}/tile-shares/by-tile?tile_id=${encodeURIComponent(tileId)}`, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch shares' }));
    throw new Error(err.error || 'Failed to fetch shares');
  }
  const data = await res.json();
  return data.shares || [];
};

export const revokeShare = async (invitationId: number): Promise<void> => {
  const res = await fetch(`${getApiBase()}/tile-shares/${invitationId}/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to revoke share');
};

export const shareTile = async (tileId: string, receiverUserId: number): Promise<{ invitationId: number }> => {
  const res = await fetch(`${getApiBase()}/tile-shares/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ tile_id: tileId, receiver_user_id: receiverUserId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to share tile');
  return { invitationId: data.invitation_id };
};

export const acceptInvitation = async (invitationId: number): Promise<void> => {
  const res = await fetch(`${getApiBase()}/tile-shares/${invitationId}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to accept invitation');
};

export const rejectInvitation = async (invitationId: number): Promise<void> => {
  const res = await fetch(`${getApiBase()}/tile-shares/${invitationId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to reject invitation');
};

export const removeSharedTile = async (invitationId: number): Promise<void> => {
  const res = await fetch(`${getApiBase()}/tile-shares/${invitationId}/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to remove shared tile');
};

export const blockUser = async (userId: number): Promise<void> => {
  const res = await fetch(`${getApiBase()}/tile-shares/block`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ user_id: userId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to block user');
};

export const unblockUser = async (userId: number): Promise<void> => {
  const res = await fetch(`${getApiBase()}/tile-shares/unblock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ user_id: userId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to unblock user');
};
