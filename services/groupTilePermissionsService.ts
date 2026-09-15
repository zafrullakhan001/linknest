// Resolve API base dynamically
function resolveApiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) {
    return envBase;
  }

  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    if (path !== '/' && path.length > 1) {
      const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
      if (cleanPath && cleanPath !== '/') {
        return `${cleanPath}/api`;
      }
    }
  }

  return '/api';
}

const API_BASE = resolveApiBase();

export interface GroupTilePermission {
  groupId: number;
  groupName: string;
  tileId: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAddLinks?: boolean;
  canAddSections?: boolean;
  canAddTabs?: boolean;
  canEditLinks?: boolean;
  canDeleteLinks?: boolean;
  canDeleteSections?: boolean;
  canDeleteTabs?: boolean;
  canChangeVisibility?: boolean;
  canChangeBrowser?: boolean;
  canCloneTile?: boolean;
  canViewTileInfo?: boolean;
  canEditTile?: boolean;
  createdAt: number;
  updatedAt: number;
  tileTitle?: string;
}

export interface TileGroupPermissionsResponse {
  tileId: string;
  tileTitle?: string;
  groupPermissions: GroupTilePermission[];
}

export interface GroupTilePermissionsResponse {
  groupId: number;
  permissions: Array<{
    tileId: string;
    tileTitle: string;
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canAddLinks?: boolean;
    canAddSections?: boolean;
    canAddTabs?: boolean;
    canEditLinks?: boolean;
    canDeleteLinks?: boolean;
    canDeleteSections?: boolean;
    canDeleteTabs?: boolean;
    canChangeVisibility?: boolean;
    canChangeBrowser?: boolean;
    canCloneTile?: boolean;
    canViewTileInfo?: boolean;
    canEditTile?: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
}

export interface SetGroupTilePermissionRequest {
  groupId: number;
  tileId: string;
  canView?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canAddLinks?: boolean;
  canAddSections?: boolean;
  canAddTabs?: boolean;
  canEditLinks?: boolean;
  canDeleteLinks?: boolean;
  canDeleteSections?: boolean;
  canDeleteTabs?: boolean;
  canChangeVisibility?: boolean;
  canChangeBrowser?: boolean;
  canCloneTile?: boolean;
  canViewTileInfo?: boolean;
  canEditTile?: boolean;
}

export interface BatchGroupTilePermissionsResponse {
  tileId: string;
  tileTitle: string;
  groupPermissions: Array<{
    groupId: number;
    groupName: string;
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canAddLinks?: boolean;
    canAddSections?: boolean;
    canAddTabs?: boolean;
    canEditLinks?: boolean;
    canDeleteLinks?: boolean;
    canDeleteSections?: boolean;
    canDeleteTabs?: boolean;
    canChangeVisibility?: boolean;
    canChangeBrowser?: boolean;
    canCloneTile?: boolean;
    canViewTileInfo?: boolean;
    canEditTile?: boolean;
    createdAt: number;
    updatedAt: number;
  }>;
}

export const groupTilePermissionsService = {
  async getAllPermissions(): Promise<GroupTilePermission[]> {
    const response = await fetch(`${API_BASE}/group-tile-permissions`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch group tile permissions');
    }

    return response.json();
  },

  async getBatchPermissions(): Promise<BatchGroupTilePermissionsResponse[]> {
    const response = await fetch(`${API_BASE}/group-tile-permissions/batch`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch batch group tile permissions');
    }

    return response.json();
  },

  async getTileGroupPermissions(tileId: string): Promise<TileGroupPermissionsResponse> {
    const response = await fetch(`${API_BASE}/group-tile-permissions/tile/${tileId}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch tile group permissions');
    }

    return response.json();
  },

  async getGroupTilePermissions(groupId: number): Promise<GroupTilePermissionsResponse> {
    const response = await fetch(`${API_BASE}/group-tile-permissions/group/${groupId}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch group tile permissions');
    }

    return response.json();
  },

  async setPermission(request: SetGroupTilePermissionRequest): Promise<void> {
    const response = await fetch(`${API_BASE}/group-tile-permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to set group tile permission');
    }
  },

  async updatePermission(
    groupId: number,
    tileId: string,
    canView: boolean,
    canEdit: boolean,
    canDelete: boolean,
    granularPermissions?: {
      canAddLinks?: boolean;
      canAddSections?: boolean;
      canAddTabs?: boolean;
      canEditLinks?: boolean;
      canDeleteLinks?: boolean;
      canDeleteSections?: boolean;
      canDeleteTabs?: boolean;
      canChangeVisibility?: boolean;
      canChangeBrowser?: boolean;
      canCloneTile?: boolean;
      canViewTileInfo?: boolean;
      canEditTile?: boolean;
    }
  ): Promise<void> {
    const permissionId = `${groupId}_${tileId}`;
    const response = await fetch(`${API_BASE}/group-tile-permissions/${permissionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        canView,
        canEdit,
        canDelete,
        ...granularPermissions
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update group tile permission');
    }
  },

  async deletePermission(groupId: number, tileId: string): Promise<void> {
    const permissionId = `${groupId}_${tileId}`;
    const response = await fetch(`${API_BASE}/group-tile-permissions/${permissionId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete group tile permission');
    }
  },
};
