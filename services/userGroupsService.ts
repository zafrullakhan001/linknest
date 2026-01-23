// Resolve API base dynamically based on current location
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

export interface UserGroup {
  id: number;
  name: string;
  description: string | null;
  memberCount: number;
  roleCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface GroupMember {
  id: number;
  username: string;
  email: string;
  authSource: string;
  joinedAt: number;
}

export interface GroupRole {
  id: number;
  name: string;
  description: string | null;
  assignedAt: number;
}

export interface CreateUserGroupRequest {
  name: string;
  description?: string;
}

export interface UpdateUserGroupRequest {
  name?: string;
  description?: string;
}

export const userGroupsService = {
  async getAllGroups(): Promise<UserGroup[]> {
    const response = await fetch(`${API_BASE}/user-groups`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch user groups');
    }

    return response.json();
  },

  async getGroup(groupId: number): Promise<UserGroup> {
    const response = await fetch(`${API_BASE}/user-groups/${groupId}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch user group');
    }

    return response.json();
  },

  async getGroupMembers(groupId: number): Promise<GroupMember[]> {
    const response = await fetch(`${API_BASE}/user-groups/${groupId}/members`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch group members');
    }

    return response.json();
  },

  async getGroupRoles(groupId: number): Promise<GroupRole[]> {
    const response = await fetch(`${API_BASE}/user-groups/${groupId}/roles`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch group roles');
    }

    return response.json();
  },

  async getUserGroups(userId: number): Promise<{ userId: number; username: string; email: string; groups: Array<{ id: number; name: string; description: string | null; joinedAt: number }> }> {
    const response = await fetch(`${API_BASE}/user-groups/user/${userId}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch user groups');
    }

    return response.json();
  },

  async getBatchUserGroups(): Promise<Record<number, Array<{ id: number; name: string; description: string | null }>>> {
    const response = await fetch(`${API_BASE}/user-groups/users/batch-groups`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch batch user groups');
    }

    return response.json();
  },

  async createGroup(request: CreateUserGroupRequest): Promise<{ success: boolean; id: number }> {
    const response = await fetch(`${API_BASE}/user-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to create user group');
    }

    return response.json();
  },

  async updateGroup(groupId: number, request: UpdateUserGroupRequest): Promise<void> {
    const response = await fetch(`${API_BASE}/user-groups/${groupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to update user group');
    }
  },

  async deleteGroup(groupId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/user-groups/${groupId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete user group');
    }
  },

  async addMembersToGroup(groupId: number, userIds: number[]): Promise<{ success: boolean; added: number; skipped: number }> {
    const response = await fetch(`${API_BASE}/user-groups/${groupId}/add-members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userIds }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to add members to group');
    }

    return response.json();
  },

  async removeMemberFromGroup(groupId: number, userId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/user-groups/${groupId}/member/${userId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to remove member from group');
    }
  },

  async assignRolesToGroup(groupId: number, roleIds: number[]): Promise<void> {
    const response = await fetch(`${API_BASE}/user-groups/${groupId}/assign-roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ roleIds }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to assign roles to group');
    }
  },

  async removeRoleFromGroup(groupId: number, roleId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/user-groups/${groupId}/role/${roleId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to remove role from group');
    }
  },

  async bulkAssignGroupsToUsers(userIds: number[], groupIds: number[], mode: 'add' | 'replace' = 'add'): Promise<{ success: boolean; assigned: number; failed: number; errors?: string[] }> {
    const response = await fetch(`${API_BASE}/user-groups/bulk-assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userIds, groupIds, mode }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to bulk assign groups');
    }

    return response.json();
  },
};
