const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface Role {
  id: number;
  name: string;
  description?: string;
  userCount?: number;
  tileCount?: number;
  linkCount?: number;
  createdAt: number;
  updatedAt: number;
  users?: Array<{
    id: number;
    username: string;
    email: string;
  }>;
}

export interface RoleTilePermission {
  tileId: string;
  tileTitle: string;
  canView: boolean;
  createdAt: number;
}

export interface RoleLinkPermission {
  linkId: string;
  linkLabel: string;
  url: string;
  canView: boolean;
  createdAt: number;
}

export interface UserRolesResponse {
  userId: number;
  username: string;
  email: string;
  roles: Array<{
    id: number;
    name: string;
    description?: string;
    assignedAt: number;
  }>;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
}

export interface AssignTilesRequest {
  tileIds: string[];
  canView?: boolean;
}

export interface AssignLinksRequest {
  linkIds: string[];
  canView?: boolean;
}

export interface AssignRolesToUserRequest {
  roleIds: number[];
}

export interface RoleTabPermission {
  tabId: string;
  canView: boolean;
  createdAt: number;
}

export interface AssignTabsRequest {
  tabIds: string[];
  canView?: boolean;
}

export const rolesService = {
  async getAllRoles(): Promise<Role[]> {
    const response = await fetch(`${API_BASE}/roles`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch roles');
    }

    return response.json();
  },

  async getRole(roleId: number): Promise<Role> {
    const response = await fetch(`${API_BASE}/roles/${roleId}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch role');
    }

    return response.json();
  },

  async getRoleTiles(roleId: number): Promise<RoleTilePermission[]> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/tiles`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch role tiles');
    }

    return response.json();
  },

  async getRoleLinks(roleId: number): Promise<RoleLinkPermission[]> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/links`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch role links');
    }

    return response.json();
  },

  async getRoleTabs(roleId: number): Promise<RoleTabPermission[]> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/tabs`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch role tabs');
    }

    return response.json();
  },

  async getUserRoles(userId: number): Promise<UserRolesResponse> {
    const response = await fetch(`${API_BASE}/roles/user/${userId}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch user roles');
    }

    return response.json();
  },

  async createRole(request: CreateRoleRequest): Promise<{ success: boolean; role: Role }> {
    const response = await fetch(`${API_BASE}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to create role');
    }

    return response.json();
  },

  async updateRole(roleId: number, request: UpdateRoleRequest): Promise<void> {
    const response = await fetch(`${API_BASE}/roles/${roleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update role');
    }
  },

  async deleteRole(roleId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/roles/${roleId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete role');
    }
  },

  async assignTilesToRole(roleId: number, request: AssignTilesRequest): Promise<void> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/assign-tiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to assign tiles to role');
    }
  },

  async assignLinksToRole(roleId: number, request: AssignLinksRequest): Promise<void> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/assign-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to assign links to role');
    }
  },

  async assignRolesToUser(userId: number, request: AssignRolesToUserRequest): Promise<void> {
    const response = await fetch(`${API_BASE}/roles/user/${userId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to assign roles to user');
    }
  },

  async assignTabsToRole(roleId: number, request: AssignTabsRequest): Promise<void> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/assign-tabs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to assign tabs to role');
    }
  },

  async getCurrentUserAllowedTabs(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/roles/current-user/tabs`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch allowed tabs');
    }

    return response.json();
  },

  async removeTileFromRole(roleId: number, tileId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/tile/${encodeURIComponent(tileId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to remove tile from role');
    }
  },

  async removeLinkFromRole(roleId: number, linkId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/link/${encodeURIComponent(linkId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to remove link from role');
    }
  },

  async removeRoleFromUser(userId: number, roleId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/roles/user/${userId}/role/${roleId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to remove role from user');
    }
  },
};
