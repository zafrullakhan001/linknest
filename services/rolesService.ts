const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface Role {
  id: number;
  name: string;
  description?: string;
  isGuest?: boolean;
  userCount?: number;
  groupCount?: number;
  tileCount?: number;
  linkCount?: number;
  widgetCount?: number;
  linkActionCount?: number;
  createdAt: number;
  updatedAt: number;
  users?: Array<{
    id: number;
    username: string;
    email: string;
  }>;
}

export interface RoleGroupAssignment {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
  assignedAt: number;
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

export interface BatchUserRolesResponse {
  userId: number;
  roles: Array<{
    id: number;
    name: string;
    description?: string;
  }>;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  isGuest?: boolean;
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  isGuest?: boolean;
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

export interface BulkAssignRolesRequest {
  userIds: number[];
  roleIds: number[];
  mode?: 'add' | 'replace'; // 'add' adds roles to existing, 'replace' replaces all roles
}

export interface BulkRemoveRolesRequest {
  userIds: number[];
  roleIds: number[];
}

export interface BulkAssignRolesToGroupsRequest {
  groupIds: number[];
  roleIds: number[];
  mode?: 'add' | 'replace';
}

export interface BulkRemoveRolesFromGroupsRequest {
  groupIds: number[];
  roleIds: number[];
}

export interface RoleTabPermission {
  tabId: string;
  canView: boolean;
  createdAt: number;
}

export interface RoleWidgetPermission {
  widgetId: string;
  canView: boolean;
  createdAt: number;
}

export interface RoleLinkActionPermission {
  actionId: string;
  canView: boolean;
  createdAt: number;
}

export interface AssignTabsRequest {
  tabIds: string[];
  canView?: boolean;
}

export interface AssignWidgetsRequest {
  widgetIds: string[];
  canView?: boolean;
}

export interface AssignLinkActionsRequest {
  actionIds: string[];
  canView?: boolean;
}

export const LINK_ACTION_IDS = [
  'notes',
  'favorite',
  'health',
  'copy',
  'mobile',
  'qr',
  'browser',
] as const;

export type LinkActionId = (typeof LINK_ACTION_IDS)[number];

export const LINK_ACTION_OPTIONS: Array<{ id: LinkActionId; label: string; description: string }> = [
  { id: 'notes', label: 'View notes', description: 'Show the notes/info button when a link has notes' },
  { id: 'favorite', label: 'Favorite', description: 'Allow marking or unmarking a link as a favorite' },
  { id: 'health', label: 'Check link health', description: 'Allow re-checking HTTP(S) link health status' },
  { id: 'copy', label: 'Copy URL', description: 'Allow copying the link URL to the clipboard' },
  { id: 'mobile', label: 'Mobile preview', description: 'Allow opening the mobile/tablet preview for a link' },
  { id: 'qr', label: 'Show QR code', description: 'Allow displaying a QR code for a link' },
  { id: 'browser', label: 'Open in browser', description: 'Allow choosing a browser when browser-specific links are enabled' },
];

export interface RoleAssignmentTotals {
  tiles: number;
  links: number;
  widgets: number;
  linkActions: number;
}

export const rolesService = {
  async getAllRoles(): Promise<{ roles: Role[]; totals: RoleAssignmentTotals }> {
    const response = await fetch(`${API_BASE}/roles`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch roles');
    }

    const data = await response.json();
    // Backward compatible if an older API still returns a bare array
    if (Array.isArray(data)) {
      return {
        roles: data,
        totals: { tiles: 0, links: 0, widgets: 0, linkActions: LINK_ACTION_IDS.length },
      };
    }

    return {
      roles: Array.isArray(data?.roles) ? data.roles : [],
      totals: {
        tiles: Number(data?.totals?.tiles) || 0,
        links: Number(data?.totals?.links) || 0,
        widgets: Number(data?.totals?.widgets) || 0,
        linkActions: Number(data?.totals?.linkActions) || LINK_ACTION_IDS.length,
      },
    };
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

  async getRoleWidgets(roleId: number): Promise<RoleWidgetPermission[]> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/widgets`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch role widgets');
    }

    return response.json();
  },

  async getRoleLinkActions(roleId: number): Promise<RoleLinkActionPermission[]> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/link-actions`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch role link actions');
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

  async getBatchUserRoles(): Promise<BatchUserRolesResponse[]> {
    const response = await fetch(`${API_BASE}/roles/users/batch-roles`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch batch user roles');
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

  async bulkAssignRolesToUsers(request: BulkAssignRolesRequest): Promise<{ assigned: number; failed: number; errors?: string[] }> {
    const response = await fetch(`${API_BASE}/roles/bulk-assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to bulk assign roles to users');
    }

    return response.json();
  },

  async bulkRemoveRolesFromUsers(request: BulkRemoveRolesRequest): Promise<{ removed: number; failed: number; errors?: string[] }> {
    const response = await fetch(`${API_BASE}/roles/bulk-remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to bulk remove roles from users');
    }

    return response.json();
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

  async assignWidgetsToRole(roleId: number, request: AssignWidgetsRequest): Promise<void> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/assign-widgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to assign widgets to role');
    }
  },

  async assignLinkActionsToRole(roleId: number, request: AssignLinkActionsRequest): Promise<void> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/assign-link-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to assign link actions to role');
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

  async getAllowedLinkActions(): Promise<string[]> {
    const response = await fetch(`${API_BASE}/roles/current-user/link-actions`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch allowed link actions');
    }

    const data = await response.json();
    return Array.isArray(data?.actionIds) ? data.actionIds : [];
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

  async removeWidgetFromRole(roleId: number, widgetId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/widget/${encodeURIComponent(widgetId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to remove widget from role');
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

  async getRoleGroups(roleId: number): Promise<RoleGroupAssignment[]> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/groups`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch teams for role');
    }

    return response.json();
  },

  async removeGroupFromRole(roleId: number, groupId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/roles/${roleId}/group/${groupId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to remove team from role');
    }
  },

  async bulkAssignRolesToGroups(request: BulkAssignRolesToGroupsRequest): Promise<{ assigned: number; failed: number; errors?: string[] }> {
    const response = await fetch(`${API_BASE}/roles/bulk-assign-to-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to bulk assign roles to groups');
    }

    return response.json();
  },

  async bulkRemoveRolesFromGroups(request: BulkRemoveRolesFromGroupsRequest): Promise<{ removed: number; failed: number; errors?: string[] }> {
    const response = await fetch(`${API_BASE}/roles/bulk-remove-from-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to bulk remove roles from groups');
    }

    return response.json();
  },
};
