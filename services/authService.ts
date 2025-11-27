export interface User {
  id: number;
  username: string;
  email: string;
  is_admin?: boolean;
  is_approved?: boolean;
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
  auth_source?: string;
  created_at: number;
}

export interface UserListItem {
  id: number;
  username: string;
  auth_source?: string;
}

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
  }
};

