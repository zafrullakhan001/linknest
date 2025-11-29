const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface TilePermission {
  userId: number;
  tileId: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: number;
  updatedAt: number;
  username?: string;
  email?: string;
  tileTitle?: string;
}

export interface TilePermissionsResponse {
  tileId: string;
  tileTitle: string;
  permissions: Array<{
    userId: number;
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    createdAt: number;
    updatedAt: number;
    username: string;
    email: string;
  }>;
}

export interface UserPermissionsResponse {
  userId: number;
  username: string;
  email: string;
  permissions: Array<{
    tileId: string;
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    createdAt: number;
    updatedAt: number;
    tileTitle: string;
  }>;
}

export interface SetPermissionRequest {
  userId: number;
  tileId: string;
  canView?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export const accessService = {
  async getAllPermissions(): Promise<TilePermission[]> {
    const response = await fetch(`${API_BASE}/access`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch permissions');
    }

    return response.json();
  },

  async getTilePermissions(tileId: string): Promise<TilePermissionsResponse> {
    const response = await fetch(`${API_BASE}/access/tile/${tileId}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch tile permissions');
    }

    return response.json();
  },

  async getUserPermissions(userId: number): Promise<UserPermissionsResponse> {
    const response = await fetch(`${API_BASE}/access/user/${userId}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch user permissions');
    }

    return response.json();
  },

  async setPermission(request: SetPermissionRequest): Promise<void> {
    const response = await fetch(`${API_BASE}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to set permission');
    }
  },

  async updatePermission(
    userId: number,
    tileId: string,
    canView: boolean,
    canEdit: boolean,
    canDelete: boolean
  ): Promise<void> {
    const permissionId = `${userId}_${tileId}`;
    const response = await fetch(`${API_BASE}/access/${permissionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ canView, canEdit, canDelete }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update permission');
    }
  },

  async deletePermission(userId: number, tileId: string): Promise<void> {
    const permissionId = `${userId}_${tileId}`;
    const response = await fetch(`${API_BASE}/access/${permissionId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete permission');
    }
  },
};


