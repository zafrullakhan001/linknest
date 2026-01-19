export interface User {
  id: number;
  username: string;
  email: string;
  is_admin?: boolean;
  is_approved?: boolean;
  impersonating?: boolean;
  impersonating_admin_id?: number;
  impersonating_admin_username?: string;
}

export interface PendingUser {
  id: number;
  username: string;
  email: string;
  created_at: number;
}

export interface AllUser {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  is_approved: boolean;
  is_disabled?: boolean;
  auth_source?: string;
  created_at: number;
}

export interface UserListItem {
  id: number;
  username: string;
  email?: string;
  auth_source?: string;
  is_admin?: boolean;
}

// API_BASE uses relative URLs (starting with /) which are protocol-agnostic
// This ensures the app works with both HTTP and HTTPS automatically
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export const authService = {
  async register(username: string, email: string, password: string): Promise<{ pending: boolean; message?: string }> {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, email, password })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    
    return { pending: data.pending || false, message: data.message };
  },

  async login(username: string, password: string, authMethod?: 'local' | 'ldap', rememberMe?: boolean): Promise<User> {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password, auth_method: authMethod, remember_me: rememberMe || false })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }
    
    return data.user;
  },

  async logout(): Promise<void> {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'GET',
      credentials: 'include'
    });
  },

  async getCurrentUser(): Promise<User | null> {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        method: 'GET',
        credentials: 'include'
      });

      const data = await response.json();
      return data.user || null;
    } catch (error) {
      return null;
    }
  },

  // Admin functions
  async getPendingUsers(): Promise<PendingUser[]> {
    const response = await fetch(`${API_BASE}/auth/pending`, {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch pending users');
    }
    
    return data.users || [];
  },

  async approveUser(userId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/approve/${userId}`, {
      method: 'PUT',
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to approve user');
    }
  },

  async bulkApproveUsers(userIds: number[]): Promise<{ approved_count: number }> {
    const response = await fetch(`${API_BASE}/auth/bulk-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user_ids: userIds })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to approve users');
    }
    
    return { approved_count: data.approved_count || 0 };
  },

  async rejectUser(userId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/reject/${userId}`, {
      method: 'PUT',
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to reject user');
    }
  },

  async getAllUsers(): Promise<AllUser[]> {
    const response = await fetch(`${API_BASE}/auth/all`, {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch users');
    }
    
    return data.users || [];
  },

  async resetUserPassword(userId: number, newPassword: string): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/reset-password/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ new_password: newPassword })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to reset password');
    }
  },

  async deleteUser(userId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/delete/${userId}`, {
      method: 'PUT',
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete user');
    }
  },

  async updateUser(userId: number, username: string, email: string, auth_source: 'local' | 'ldap' | 'saml' = 'local'): Promise<AllUser> {
    const response = await fetch(`${API_BASE}/auth/update/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, email, auth_source })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update user');
    }
    
    return data.user;
  },

  async changeAdminPassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/change-admin-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to change password');
    }
  },

  async getUsers(): Promise<UserListItem[]> {
    const response = await fetch(`${API_BASE}/auth/users`, {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch users');
    }
    
    return data.users || [];
  },

  async toggleAuthSource(userId: number): Promise<{ auth_source: string }> {
    const response = await fetch(`${API_BASE}/auth/toggle-auth-source/${userId}`, {
      method: 'PUT',
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to toggle auth source');
    }
    
    return { auth_source: data.auth_source };
  },

  async autoDetectAuthSources(): Promise<{ message: string; results: any }> {
    const response = await fetch(`${API_BASE}/auth/auto-detect-auth-sources`, {
      method: 'POST',
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to auto-detect auth sources');
    }
    
    return { message: data.message, results: data.results };
  },

  async searchLdapUsers(searchTerm: string): Promise<Array<{ username: string; email: string; displayName: string; dn: string }>> {
    const response = await fetch(`${API_BASE}/auth/search-ldap-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ search: searchTerm })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to search LDAP users');
    }
    
    return data.users || [];
  },

  async addLocalUser(username: string, email: string, password: string): Promise<{ user: AllUser; message: string }> {
    const response = await fetch(`${API_BASE}/auth/add-local-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, email, password })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to add local user');
    }
    
    return { user: data.user, message: data.message };
  },

  async addLdapUser(username: string, email: string, dn: string, displayName?: string): Promise<{ user: AllUser; message: string }> {
    const response = await fetch(`${API_BASE}/auth/add-ldap-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, email, dn, displayName })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to add LDAP user');
    }
    
    return { user: data.user, message: data.message };
  },

  async toggleAdmin(userId: number): Promise<{ is_admin: boolean }> {
    const response = await fetch(`${API_BASE}/auth/toggle-admin/${userId}`, {
      method: 'PUT',
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to toggle admin status');
    }
    
    return { is_admin: data.is_admin };
  },

  async toggleDisable(userId: number): Promise<{ is_disabled: boolean }> {
    const response = await fetch(`${API_BASE}/auth/toggle-disable/${userId}`, {
      method: 'PUT',
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to toggle disabled status');
    }
    
    return { is_disabled: data.is_disabled };
  },

  async bulkDisableUsers(userIds: number[]): Promise<{ disabled_count: number }> {
    const response = await fetch(`${API_BASE}/auth/bulk-disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user_ids: userIds })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to disable users');
    }
    
    return { disabled_count: data.disabled_count || 0 };
  },

  async bulkPromoteUsers(userIds: number[]): Promise<{ promoted_count: number }> {
    const response = await fetch(`${API_BASE}/auth/bulk-promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user_ids: userIds })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to promote users');
    }
    
    return { promoted_count: data.promoted_count || 0 };
  },

  async bulkToggleApproval(userIds: number[]): Promise<{ approved_count: number; unapproved_count: number }> {
    const response = await fetch(`${API_BASE}/auth/bulk-toggle-approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user_ids: userIds })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to toggle approval');
    }
    
    return { approved_count: data.approved_count || 0, unapproved_count: data.unapproved_count || 0 };
  },

  async bulkImportLocalUsers(csvFile: File): Promise<{ results: any; summary: any; message: string }> {
    const formData = new FormData();
    formData.append('csv_file', csvFile);

    const response = await fetch(`${API_BASE}/auth/bulk-import-local`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to import users');
    }
    
    return {
      results: data.results,
      summary: data.summary,
      message: data.message
    };
  },

  async bulkImportLdapUsers(users: Array<{ username: string; email: string; dn: string; displayName?: string }>): Promise<{ results: any; summary: any; message: string }> {
    const response = await fetch(`${API_BASE}/auth/bulk-import-ldap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ users })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to import LDAP users');
    }
    
    return {
      results: data.results,
      summary: data.summary,
      message: data.message
    };
  },

  async bulkImportSamlUsers(csvFile: File): Promise<{ results: any; summary: any; message: string }> {
    const formData = new FormData();
    formData.append('csv_file', csvFile);

    const response = await fetch(`${API_BASE}/auth/bulk-import-saml`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to import SAML users');
    }
    
    return {
      results: data.results,
      summary: data.summary,
      message: data.message
    };
  },

  async startImpersonation(targetUserId: number): Promise<User> {
    const response = await fetch(`${API_BASE}/auth/impersonate/${targetUserId}`, {
      method: 'POST',
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to start impersonation');
    }
    
    return data.user;
  },

  async stopImpersonation(): Promise<User> {
    const response = await fetch(`${API_BASE}/auth/stop-impersonation`, {
      method: 'POST',
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to stop impersonation');
    }
    
    return data.user;
  }
};

