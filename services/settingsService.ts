// Use Vite's runtime value if available, but don't depend on its TypeScript types
const API_BASE = (import.meta as any)?.env?.VITE_API_BASE || '/api';

export interface AppSettings {
  app_name: string;
  page_title: string;
  spaces_title: string;
  logo_type: 'icon' | 'image';
  logo_icon: string;
  logo_image: string;

  // LDAP Settings
  ldap_enabled?: string;
  ldap_server?: string;
  ldap_port?: string;
  ldap_protocol?: string;
  ldap_base_dn?: string;
  ldap_login_domain?: string; // Optional explicit domain label for login dropdown
  ldap_bind_dn?: string;
  ldap_bind_password?: string;
  ldap_user_search_base?: string;
  ldap_user_filter?: string;
  ldap_user_attributes?: string;
  ldap_group_search_base?: string;
  ldap_group_filter?: string;
  ldap_group_attributes?: string;
  ldap_auto_create_users?: string;
  ldap_auto_update_users?: string;
  ldap_sync_interval?: string;
  ldap_require_group_membership?: string;
  ldap_required_groups?: string;
  ldap_timeout?: string;
  ldap_tls?: string;
  // Advanced LDAP Settings
  ldap_search_scope?: string; // 'base', 'one', 'sub'
  ldap_user_dn_template?: string; // e.g., "CN={username},CN=Users,DC=example,DC=com"
  ldap_nested_groups?: string; // '0' or '1'
  ldap_case_sensitive?: string; // '0' or '1'
  ldap_ssl_verify?: string; // '0' or '1'
  ldap_connection_retry?: string; // number of retries
  ldap_retry_delay?: string; // seconds between retries
  ldap_email_attribute?: string; // custom email attribute
  ldap_display_name_attribute?: string; // custom display name attribute
  ldap_referrals?: string; // '0' or '1'
}

export const settingsService = {
  async getSettings(noCache: boolean = false): Promise<AppSettings> {
    const url = `${API_BASE}/settings${noCache ? '?_t=' + Date.now() : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: noCache ? 'no-cache' : 'default'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch settings');
    }

    // Return with defaults if some settings are missing
    return {
      app_name: data.settings?.app_name || 'LinkNest',
      page_title: data.settings?.page_title || 'LinkNest',
      spaces_title: data.settings?.spaces_title || 'My Spaces',
      logo_type: (data.settings?.logo_type || 'icon') as 'icon' | 'image',
      logo_icon: data.settings?.logo_icon || '🔗',
      logo_image: data.settings?.logo_image || '',

      // LDAP defaults
      ldap_enabled: data.settings?.ldap_enabled || '0',
      ldap_server: data.settings?.ldap_server || '',
      ldap_port: data.settings?.ldap_port || '389',
      ldap_protocol: data.settings?.ldap_protocol || 'ldap',
      ldap_base_dn: data.settings?.ldap_base_dn || '',
      ldap_login_domain: data.settings?.ldap_login_domain || '',
      ldap_bind_dn: data.settings?.ldap_bind_dn || '',
      ldap_bind_password: data.settings?.ldap_bind_password || '',
      ldap_user_search_base: data.settings?.ldap_user_search_base || '',
      ldap_user_filter: data.settings?.ldap_user_filter || '(sAMAccountName={username})',
      ldap_user_attributes: data.settings?.ldap_user_attributes || 'sAMAccountName,mail,displayName',
      ldap_group_search_base: data.settings?.ldap_group_search_base || '',
      ldap_group_filter: data.settings?.ldap_group_filter || '(objectClass=group)',
      ldap_group_attributes: data.settings?.ldap_group_attributes || 'cn,distinguishedName,member',
      ldap_auto_create_users: data.settings?.ldap_auto_create_users || '1',
      ldap_auto_update_users: data.settings?.ldap_auto_update_users || '1',
      ldap_sync_interval: data.settings?.ldap_sync_interval || '3600',
      ldap_require_group_membership: data.settings?.ldap_require_group_membership || '0',
      ldap_required_groups: data.settings?.ldap_required_groups || '',
      ldap_timeout: data.settings?.ldap_timeout || '30',
      ldap_tls: data.settings?.ldap_tls || '0',
      // Advanced LDAP defaults
      ldap_search_scope: data.settings?.ldap_search_scope || 'sub',
      ldap_user_dn_template: data.settings?.ldap_user_dn_template || '',
      ldap_nested_groups: data.settings?.ldap_nested_groups || '0',
      ldap_case_sensitive: data.settings?.ldap_case_sensitive || '0',
      ldap_ssl_verify: data.settings?.ldap_ssl_verify || '1',
      ldap_connection_retry: data.settings?.ldap_connection_retry || '3',
      ldap_retry_delay: data.settings?.ldap_retry_delay || '1',
      ldap_email_attribute: data.settings?.ldap_email_attribute || '',
      ldap_display_name_attribute: data.settings?.ldap_display_name_attribute || '',
      ldap_referrals: data.settings?.ldap_referrals || '0',
    };
  },

  async updateSettings(settings: Partial<AppSettings>): Promise<void> {
    const response = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ settings })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update settings');
    }
  },

  async uploadLogo(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('logo', file);

    const response = await fetch(`${API_BASE}/settings/upload-logo`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to upload logo');
    }

    return data.url;
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

  async testLdapConnection(settings: Partial<AppSettings>, testUsername?: string, testPassword?: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/ldap_test.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...settings, test_username: testUsername, test_password: testPassword })
    });

    const data = await response.json();

    // Even if response is OK, the result might be failure (success: false)
    // But if response is NOT OK (e.g. 500), throw error
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to test LDAP connection');
    }

    return data;
  },

  async encryptPassword(password: string): Promise<string> {
    const response = await fetch(`${API_BASE}/settings/encrypt-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to encrypt password');
    }

    return data.encrypted;
  },

  async decryptPassword(encryptedPassword: string): Promise<string> {
    const response = await fetch(`${API_BASE}/settings/decrypt-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ encrypted_password: encryptedPassword })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to decrypt password');
    }

    return data.password;
  }
};

