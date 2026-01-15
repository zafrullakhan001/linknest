// Resolve API base dynamically based on current location
// Protocol-agnostic: uses relative URLs that work with both HTTP and HTTPS
function resolveApiBase(): string {
  // Prefer Vite-injected env when available
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) {
    return envBase;
  }

  // Fallback: dynamically detect base path from current location
  // This automatically uses the same protocol (HTTP/HTTPS) as the page
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    
    // Extract base path (everything before the last segment or root)
    // Examples:
    // /myapp/ -> /myapp/api
    // /myapp/index.html -> /myapp/api
    // / -> /api
    if (path !== '/' && path.length > 1) {
      // Remove trailing slash and any filename
      const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
      if (cleanPath && cleanPath !== '/') {
        return `${cleanPath}/api`;
      }
    }
  }

  // Default fallback (root deployment)
  // Using relative URL ensures it works with both HTTP and HTTPS
  return '/api';
}

const API_BASE = resolveApiBase();

export interface AppSettings {
  app_name: string;
  page_title: string;
  spaces_title: string;
  logo_type: 'icon' | 'image';
  logo_icon: string;
  logo_image: string;
  favicon: string;
  footer_text?: string; // Footer text displayed at the bottom of pages
  guest_access_enabled?: string; // '0' or '1' - controls whether guests can view spaces
  show_database_path_in_footer?: string; // '0' or '1' - controls whether database path is shown in footer
  disabled_tabs?: string; // JSON array string of disabled app tabs (e.g. ["public","favorites"])

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

  // Browser-Specific Link Opening Settings
  browser_specific_links_enabled?: string; // '0' or '1' - controls whether browser-specific link opening is enabled
  browser_extension_id?: string; // Browser extension ID for opening links in specific browsers

  // Maintenance Mode Settings
  maintenance_enabled?: string; // '0' or '1' - controls whether maintenance mode is enabled
  maintenance_message?: string; // Message to display on maintenance page
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
      favicon: data.settings?.favicon || '',
      footer_text: data.settings?.footer_text || '© 2025 Adventhealth - Designed and developed by AIT Architecture team',
      guest_access_enabled: data.settings?.guest_access_enabled || '1', // Default to enabled
      show_database_path_in_footer: data.settings?.show_database_path_in_footer || '1', // Default to enabled
      disabled_tabs: data.settings?.disabled_tabs || '[]',

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
      // Browser-specific link opening defaults
      browser_specific_links_enabled: data.settings?.browser_specific_links_enabled || '0',
      browser_extension_id: data.settings?.browser_extension_id || '',
      // Maintenance mode defaults
      maintenance_enabled: data.settings?.maintenance_enabled || '0',
      maintenance_message: data.settings?.maintenance_message || '',
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

  async uploadFavicon(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('favicon', file);

    const response = await fetch(`${API_BASE}/settings/upload-favicon`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to upload favicon');
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
  },

  async getDatabasePath(): Promise<{ relative: string; absolute: string }> {
    const response = await fetch(`${API_BASE}/settings/database-path`, {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch database path');
    }

    return {
      relative: data.database_path || '',
      absolute: data.database_path_absolute || data.database_path || ''
    };
  }
};

