import { resolveApiBase } from './apiHelpers';

export interface User {
  id: number;
  username: string;
  email: string;
  is_admin?: boolean;
  is_approved?: boolean;
  auth_source?: string;
  display_name?: string | null;
  notes?: string | null;
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
  notes?: string | null;
  created_at: number;
}

export interface LdapUserDetail {
  found: boolean;
  dn: string;
  cn: string;
  username: string;
  userPrincipalName: string;
  displayName: string;
  givenName: string;
  sn: string;
  email: string;
  description: string;
  title: string;
  department: string;
  company: string;
  office: string;
  telephone: string;
  mobile: string;
  employeeId: string;
  employeeNumber: string;
  manager: { cn: string; dn: string } | null;
  account: {
    disabled: boolean;
    locked: boolean;
    lockoutTime: string | null;
    passwordNeverExpires: boolean;
    passwordExpired: boolean;
    pwdLastSet: string | null;
    accountExpires: string | null;
    accountNeverExpires: boolean;
    lastLogonTimestamp: string | null;
    whenCreated: string | null;
    whenChanged: string | null;
    userAccountControl: {
      raw: number;
      flags: string[];
      disabled: boolean;
      password_never_expires: boolean;
      password_expired: boolean;
      normal_account: boolean;
    };
  };
  groups: Array<{ cn: string; dn: string }>;
  groupCount: number;
  meta?: {
    filter?: string;
    uri?: string;
    search_base?: string;
  };
}

export interface UserListItem {
  id: number;
  username: string;
  email?: string;
  auth_source?: string;
  is_admin?: boolean;
  display_name?: string | null;
}

const API_BASE = resolveApiBase();

/** Format LDAP API errors with diagnostic details for admins */
function formatLdapError(data: { error?: string; details?: Record<string, unknown> }): string {
  const lines: string[] = [data.error || 'Failed to search LDAP users'];
  const details = data.details;
  if (!details || typeof details !== 'object') {
    return lines.join('\n');
  }

  const push = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === '') return;
    if (typeof value === 'object') return;
    lines.push(`${label}: ${String(value)}`);
  };

  push('Errno', details.ldap_errno);
  push('LDAP error', details.ldap_error);
  push('Diagnostic', details.diagnostic);
  push('Server', details.uri);
  push('Search base', details.search_base);
  push('Scope', details.search_scope);
  push('Search term', details.search_term);
  push('Step', details.step);
  push('Filter', details.filter);
  push('Attempt', details.attempt);

  if (Array.isArray(details.attempts) && details.attempts.length > 0) {
    lines.push('Filter attempts:');
    details.attempts.forEach((attempt: any, i: number) => {
      const name = attempt?.attempt || `attempt_${i + 1}`;
      const err = attempt?.ldap_error || 'unknown';
      const errno = attempt?.ldap_errno != null ? ` (errno ${attempt.ldap_errno})` : '';
      const diag = attempt?.diagnostic ? ` — ${attempt.diagnostic}` : '';
      const filter = attempt?.filter ? `\n    filter: ${attempt.filter}` : '';
      lines.push(`  ${i + 1}. ${name}: ${err}${errno}${diag}${filter}`);
    });
  }

  push('Hint', details.hint);

  return lines.join('\n');
}

export const authService = {
  async register(username: string, email: string, password: string, confirmPassword?: string): Promise<{ pending: boolean; message?: string }> {
    const body: Record<string, string> = { username, email, password };
    if (confirmPassword !== undefined) body.confirm_password = confirmPassword;
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    
    return { pending: data.pending || false, message: data.message };
  },

  async login(username: string, password: string, authMethod?: 'local' | 'ldap' | 'auto', rememberMe?: boolean, ldapServerIndex?: number, signal?: AbortSignal): Promise<User> {
    const body: any = { username, password, auth_method: authMethod, remember_me: rememberMe || false };
    if (ldapServerIndex !== undefined && ldapServerIndex !== null) {
      body.ldap_server_index = ldapServerIndex;
    }
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
      signal
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

  /** Change own password (local accounts only). */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/me/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to change password');
    }
  },

  /** Update own profile (e.g. display name). Returns updated user. */
  async updateProfile(params: { display_name?: string | null }): Promise<User> {
    const response = await fetch(`${API_BASE}/auth/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update profile');
    }
    return data.user;
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

  async updateUser(userId: number, username: string, email: string, auth_source: 'local' | 'ldap' | 'saml' = 'local', notes?: string | null): Promise<AllUser> {
    const response = await fetch(`${API_BASE}/auth/update/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, email, auth_source, notes: notes ?? null })
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

  async bulkSetAuthSource(userIds: number[], authSource: 'local' | 'ldap' | 'saml'): Promise<{ updated_count: number; auth_source: string }> {
    const response = await fetch(`${API_BASE}/auth/bulk-set-auth-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user_ids: userIds, auth_source: authSource })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update auth source');
    }

    return { updated_count: data.updated_count || userIds.length, auth_source: data.auth_source || authSource };
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

  async searchLdapUsers(searchTerm: string, ldapServerIndex?: number): Promise<Array<{ username: string; email: string; displayName: string; dn: string }>> {
    const body: { search: string; ldap_server_index?: number } = { search: searchTerm };
    if (ldapServerIndex !== undefined && ldapServerIndex !== null) {
      body.ldap_server_index = ldapServerIndex;
    }
    const response = await fetch(`${API_BASE}/auth/search-ldap-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(formatLdapError(data));
    }
    
    return data.users || [];
  },

  async getLdapUserDetail(username: string): Promise<LdapUserDetail> {
    const response = await fetch(`${API_BASE}/auth/ldap-user-detail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(formatLdapError({
        error: data.error || 'Failed to load LDAP user details',
        details: data.details,
      }));
    }

    return data.user as LdapUserDetail;
  },

  async addLocalUser(username: string, email: string, password: string, notes?: string | null): Promise<{ user: AllUser; message: string }> {
    const response = await fetch(`${API_BASE}/auth/add-local-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, email, password, notes: notes ?? null })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to add local user');
    }
    
    return { user: data.user, message: data.message };
  },

  async addLdapUser(username: string, email: string, dn: string, displayName?: string, ldapServerIndex?: number, notes?: string | null): Promise<{ user: AllUser; message: string }> {
    const body: { username: string; email: string; dn: string; displayName?: string; ldap_server_index?: number; notes?: string | null } = {
      username,
      email,
      dn,
      displayName,
      notes: notes ?? null
    };
    if (ldapServerIndex !== undefined && ldapServerIndex !== null) {
      body.ldap_server_index = ldapServerIndex;
    }
    const response = await fetch(`${API_BASE}/auth/add-ldap-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
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

  async bulkDemoteUsers(userIds: number[]): Promise<{ demoted_count: number }> {
    const response = await fetch(`${API_BASE}/auth/bulk-demote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user_ids: userIds })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to demote users');
    }

    return { demoted_count: data.demoted_count || 0 };
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

  async fetchLdapGroupMembers(
    groupDn: string,
    ldapServerIndex?: number,
    includeNested?: boolean
  ): Promise<{
    users: Array<{ username: string; email: string; displayName: string; dn: string }>;
    meta?: {
      group_dn?: string;
      group_cn?: string;
      include_nested?: boolean;
      result_count?: number;
      truncated?: boolean;
      max_members?: number;
    };
  }> {
    const body: { group_dn: string; ldap_server_index?: number; include_nested?: boolean } = {
      group_dn: groupDn,
    };
    if (ldapServerIndex !== undefined && ldapServerIndex !== null) {
      body.ldap_server_index = ldapServerIndex;
    }
    if (includeNested !== undefined) {
      body.include_nested = includeNested;
    }
    const response = await fetch(`${API_BASE}/auth/ldap-group-members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(formatLdapError(data));
    }

    return {
      users: data.users || [],
      meta: data.meta,
    };
  },

  async bulkImportLdapUsers(
    users: Array<{ username: string; email: string; dn: string; displayName?: string }>,
    ldapServerIndex?: number
  ): Promise<{ results: any; summary: any; message: string }> {
    const body: { users: typeof users; ldap_server_index?: number } = { users };
    if (ldapServerIndex !== undefined && ldapServerIndex !== null) {
      body.ldap_server_index = ldapServerIndex;
    }
    const response = await fetch(`${API_BASE}/auth/bulk-import-ldap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
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

