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
  logo_size?: string; // Brand logo height in px (nav)
  header_logo_image?: string; // Separate company/org logo for top-left of nav
  header_logo_size?: string; // Header/company logo height in px (nav)
  app_subheading?: string; // Text under app name in nav
  app_name_font_size?: string;
  app_name_font_family?: string;
  app_name_font_weight?: string;
  app_name_font_style?: string;
  app_name_font_color?: string;
  app_name_font_color_dark?: string;
  app_name_letter_spacing?: string; // em units as string e.g. "0.02"
  app_name_line_height?: string;
  app_subheading_font_size?: string;
  app_subheading_font_family?: string;
  app_subheading_font_weight?: string;
  app_subheading_font_style?: string;
  app_subheading_font_color?: string;
  app_subheading_font_color_dark?: string;
  app_subheading_letter_spacing?: string;
  app_subheading_line_height?: string;
  // Nav chrome
  nav_bg_light?: string;
  nav_bg_to_light?: string; // optional gradient end (light)
  nav_bg_dark?: string;
  nav_bg_to_dark?: string; // optional gradient end (dark)
  nav_gradient_angle?: string; // degrees, default 90
  nav_border_light?: string;
  nav_border_dark?: string;
  nav_icon_color_light?: string;
  nav_icon_color_dark?: string;
  // Hero branding
  hero_icon?: string;
  spaces_subtitle?: string;
  hero_title_font_size?: string;
  hero_title_font_family?: string;
  hero_title_font_weight?: string;
  hero_title_font_style?: string;
  hero_title_color?: string;
  hero_title_color_dark?: string;
  hero_title_letter_spacing?: string;
  hero_title_line_height?: string;
  hero_subtitle_font_size?: string;
  hero_subtitle_font_family?: string;
  hero_subtitle_font_weight?: string;
  hero_subtitle_font_style?: string;
  hero_subtitle_color?: string;
  hero_subtitle_color_dark?: string;
  hero_subtitle_letter_spacing?: string;
  hero_subtitle_line_height?: string;
  hero_bg_from?: string;
  hero_bg_to?: string;
  hero_bg_from_dark?: string;
  hero_bg_to_dark?: string;
  hero_bg_angle?: string; // degrees, default 135
  hero_overlay_color?: string;
  hero_overlay_to?: string; // optional overlay gradient end
  hero_overlay_opacity?: string; // 0–40
  hero_icon_bg_from?: string;
  hero_icon_bg_to?: string;
  // Auth wash
  auth_wash_from?: string;
  auth_wash_to?: string;
  // Tab title
  page_title_pattern?: string;
  favicon: string;
  /** Center mark on link QR codes: favicon image or a custom emoji */
  qr_branding_mode?: 'favicon' | 'emoji';
  qr_branding_emoji?: string;
  footer_text?: string; // Footer text displayed at the bottom of pages
  guest_access_enabled?: string; // '0' or '1' - controls whether guests can view spaces
  /** '0' or '1' - when '0', hide Sign up on the login dialog and reject POST /auth/register. Admins can still create local users. */
  local_registration_enabled?: string;
  /** '0' or '1' - when '0', hide the Sign In button in the UI. Login still opens via #/signin or ?signin in the URL. */
  signin_button_enabled?: string;
  /** Default tile entrance animation for first-time visitors (until they pick their own). */
  public_tile_animation?: string;
  show_database_path_in_footer?: string; // '0' or '1' - controls whether database path is shown in footer
  disabled_tabs?: string; // JSON array string of disabled app tabs (e.g. ["public","favorites"])
  /** JSON array of device preview presets (DevicePreset[]) */
  device_presets?: string;
  /** JSON array of preset ids for the Device Preview quick-select bar */
  device_quick_presets?: string;
  /** JSON string array of URL/host patterns skipped by Check Links */
  link_check_exceptions?: string;
  /** JSON string array of hosts that skip in-app mobile preview (iframe blocked) */
  iframe_block_domains?: string;

  // LDAP Settings
  ldap_enabled?: string;
  ldap_server?: string;
  ldap_port?: string;
  ldap_protocol?: string;
  ldap_base_dn?: string;
  ldap_login_domain?: string; // Optional explicit domain label for login dropdown
  ldap_servers?: string; // JSON string of LDAP servers array
  ldap_bind_dn?: string;
  ldap_bind_password?: string;
  /** Test-only: which ldap_servers entry to load stored bind password from when form password is blank */
  ldap_server_index?: string;
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
  ldap_denied_groups?: string;
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
  /** '1' = show host:port in LDAP server dropdowns (admin test + login); '0' = name/domain only */
  ldap_dropdown_show_host?: string;

  // Browser-Specific Link Opening Settings
  browser_specific_links_enabled?: string; // '0' or '1' - controls whether browser-specific link opening is enabled
  browser_extension_id?: string; // Browser extension ID for opening links in specific browsers

  // Maintenance Mode Settings
  maintenance_enabled?: string; // '0' or '1' - controls whether maintenance mode is enabled
  maintenance_message?: string; // Message to display on maintenance page
  semi_pwa_enabled?: string; // '0' or '1' - aggressive cache: serve from browser cache; hard refresh revalidates
  semi_pwa_include_paths?: string; // comma-separated path segments to cache (empty = cache all except excluded)
  semi_pwa_exclude_paths?: string; // comma-separated path segments to never cache

  // Addon: Monitorv2 (advanced monitoring with PostgreSQL/TimescaleDB)
  monitorv2_enabled?: string; // '0' or '1' - when '0', hide Monitorv2 tab on main page

  // SAML Settings
  saml_enabled?: string; // '0' or '1'
  local_auth_enabled?: string; // '0' or '1'
  sp_entity_id?: string;
  sp_assertion_consumer_service?: string;
  sp_single_logout_service?: string;
  sp_site_url?: string;
  idp_entity_id?: string;
  idp_sso_url?: string;
  idp_slo_url?: string;
  idp_x509cert?: string;
  nameid_format?: string;
  strict?: string; // '0' or '1'
  debug?: string; // '0' or '1'
  map_name_to?: string;
  map_email_to?: string;
  map_display_name_to?: string;
  auto_provision?: string; // '0' or '1'
}

/** Default PWA exclude list: real-time monitors, auth (impersonation), maintenance APIs, opcache, settings. */
export const SEMI_PWA_EXCLUDE_PATHS_DEFAULT = 'monitors,monitorv2,auth,maintenance,opcache,settings';

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
      logo_size: data.settings?.logo_size || '32',
      header_logo_image: data.settings?.header_logo_image || '',
      header_logo_size: data.settings?.header_logo_size || '40',
      app_subheading: data.settings?.app_subheading || '',
      app_name_font_size: data.settings?.app_name_font_size || '20',
      app_name_font_family: data.settings?.app_name_font_family || 'inherit',
      app_name_font_weight: data.settings?.app_name_font_weight || 'bold',
      app_name_font_style: data.settings?.app_name_font_style || 'normal',
      app_name_font_color: data.settings?.app_name_font_color || '',
      app_name_font_color_dark: data.settings?.app_name_font_color_dark || '',
      app_name_letter_spacing: data.settings?.app_name_letter_spacing || '0',
      app_name_line_height: data.settings?.app_name_line_height || '1.25',
      app_subheading_font_size: data.settings?.app_subheading_font_size || '12',
      app_subheading_font_family: data.settings?.app_subheading_font_family || 'inherit',
      app_subheading_font_weight: data.settings?.app_subheading_font_weight || 'normal',
      app_subheading_font_style: data.settings?.app_subheading_font_style || 'normal',
      app_subheading_font_color: data.settings?.app_subheading_font_color || '',
      app_subheading_font_color_dark: data.settings?.app_subheading_font_color_dark || '',
      app_subheading_letter_spacing: data.settings?.app_subheading_letter_spacing || '0',
      app_subheading_line_height: data.settings?.app_subheading_line_height || '1.3',
      nav_bg_light: data.settings?.nav_bg_light || '',
      nav_bg_to_light: data.settings?.nav_bg_to_light || '',
      nav_bg_dark: data.settings?.nav_bg_dark || '',
      nav_bg_to_dark: data.settings?.nav_bg_to_dark || '',
      nav_gradient_angle: data.settings?.nav_gradient_angle || '90',
      nav_border_light: data.settings?.nav_border_light || '',
      nav_border_dark: data.settings?.nav_border_dark || '',
      nav_icon_color_light: data.settings?.nav_icon_color_light || '',
      nav_icon_color_dark: data.settings?.nav_icon_color_dark || '',
      hero_icon: data.settings?.hero_icon || '',
      spaces_subtitle: data.settings?.spaces_subtitle || '',
      hero_title_font_size: data.settings?.hero_title_font_size || '36',
      hero_title_font_family: data.settings?.hero_title_font_family || 'inherit',
      hero_title_font_weight: data.settings?.hero_title_font_weight || 'bold',
      hero_title_font_style: data.settings?.hero_title_font_style || 'normal',
      hero_title_color: data.settings?.hero_title_color || '',
      hero_title_color_dark: data.settings?.hero_title_color_dark || '',
      hero_title_letter_spacing: data.settings?.hero_title_letter_spacing || '0',
      hero_title_line_height: data.settings?.hero_title_line_height || '1.2',
      hero_subtitle_font_size: data.settings?.hero_subtitle_font_size || '16',
      hero_subtitle_font_family: data.settings?.hero_subtitle_font_family || 'inherit',
      hero_subtitle_font_weight: data.settings?.hero_subtitle_font_weight || 'normal',
      hero_subtitle_font_style: data.settings?.hero_subtitle_font_style || 'normal',
      hero_subtitle_color: data.settings?.hero_subtitle_color || '',
      hero_subtitle_color_dark: data.settings?.hero_subtitle_color_dark || '',
      hero_subtitle_letter_spacing: data.settings?.hero_subtitle_letter_spacing || '0',
      hero_subtitle_line_height: data.settings?.hero_subtitle_line_height || '1.4',
      hero_bg_from: data.settings?.hero_bg_from || '',
      hero_bg_to: data.settings?.hero_bg_to || '',
      hero_bg_from_dark: data.settings?.hero_bg_from_dark || '',
      hero_bg_to_dark: data.settings?.hero_bg_to_dark || '',
      hero_bg_angle: data.settings?.hero_bg_angle || '135',
      hero_overlay_color: data.settings?.hero_overlay_color || '',
      hero_overlay_to: data.settings?.hero_overlay_to || '',
      hero_overlay_opacity: data.settings?.hero_overlay_opacity || '0',
      hero_icon_bg_from: data.settings?.hero_icon_bg_from || '',
      hero_icon_bg_to: data.settings?.hero_icon_bg_to || '',
      auth_wash_from: data.settings?.auth_wash_from || '',
      auth_wash_to: data.settings?.auth_wash_to || '',
      page_title_pattern: data.settings?.page_title_pattern || '{page_title}',
      favicon: data.settings?.favicon || '',
      qr_branding_mode: data.settings?.qr_branding_mode === 'emoji' ? 'emoji' : 'favicon',
      qr_branding_emoji: data.settings?.qr_branding_emoji || '❤️',
      footer_text: data.settings?.footer_text || '© 2025 Adventhealth - Designed and developed by AIT Architecture team',
      guest_access_enabled: data.settings?.guest_access_enabled || '1', // Default to enabled
      local_registration_enabled: data.settings?.local_registration_enabled || '1', // Default to enabled
      signin_button_enabled: data.settings?.signin_button_enabled || '1', // Default to show Sign In
      public_tile_animation: data.settings?.public_tile_animation || 'fade-in',
      show_database_path_in_footer: data.settings?.show_database_path_in_footer || '1', // Default to enabled
      disabled_tabs: data.settings?.disabled_tabs || '[]',
      device_presets: data.settings?.device_presets || '',
      device_quick_presets: data.settings?.device_quick_presets || '',
      link_check_exceptions: data.settings?.link_check_exceptions || '[]',
      iframe_block_domains: data.settings?.iframe_block_domains || '[]',

      // LDAP defaults
      ldap_enabled: data.settings?.ldap_enabled || '0',
      ldap_server: data.settings?.ldap_server || '',
      ldap_port: data.settings?.ldap_port || '389',
      ldap_protocol: data.settings?.ldap_protocol || 'ldap',
      ldap_base_dn: data.settings?.ldap_base_dn || '',
      ldap_login_domain: data.settings?.ldap_login_domain || '',
      ldap_servers: data.settings?.ldap_servers || '',
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
      ldap_denied_groups: data.settings?.ldap_denied_groups || '',
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
      ldap_dropdown_show_host: data.settings?.ldap_dropdown_show_host ?? '1',
      // Browser-specific link opening defaults
      browser_specific_links_enabled: data.settings?.browser_specific_links_enabled || '0',
      browser_extension_id: data.settings?.browser_extension_id || '',
      // Maintenance mode defaults
      maintenance_enabled: data.settings?.maintenance_enabled || '0',
      maintenance_message: data.settings?.maintenance_message || '',
      semi_pwa_enabled: data.settings?.semi_pwa_enabled || '0',
      semi_pwa_include_paths: data.settings?.semi_pwa_include_paths || '',
      semi_pwa_exclude_paths: data.settings?.semi_pwa_exclude_paths || SEMI_PWA_EXCLUDE_PATHS_DEFAULT,

      // Addon: Monitorv2 - default enabled so tab shows unless addon is explicitly disabled
      monitorv2_enabled: data.settings?.monitorv2_enabled ?? '1',

      // SAML defaults
      saml_enabled: data.settings?.saml_enabled || '0',
      local_auth_enabled: data.settings?.local_auth_enabled || '1',
      sp_entity_id: data.settings?.sp_entity_id || '',
      sp_assertion_consumer_service: data.settings?.sp_assertion_consumer_service || '',
      sp_single_logout_service: data.settings?.sp_single_logout_service || '',
      sp_site_url: data.settings?.sp_site_url || '',
      idp_entity_id: data.settings?.idp_entity_id || '',
      idp_sso_url: data.settings?.idp_sso_url || '',
      idp_slo_url: data.settings?.idp_slo_url || '',
      idp_x509cert: data.settings?.idp_x509cert || '',
      nameid_format: data.settings?.nameid_format || 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      strict: data.settings?.strict || '1',
      debug: data.settings?.debug || '0',
      map_name_to: data.settings?.map_name_to || 'uid',
      map_email_to: data.settings?.map_email_to || 'email',
      map_display_name_to: data.settings?.map_display_name_to || 'cn',
      auto_provision: data.settings?.auto_provision || '1'
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

  /**
   * Upload brand or header logo.
   * Background removal is done server-side with PHP GD (ext-gd) — no frontend image library.
   * If removeBackground fails, enable extension=gd in php.ini and restart Apache.
   */
  async uploadLogo(
    file: File | null,
    settingKeyOrOptions:
      | 'logo_image'
      | 'header_logo_image'
      | {
          settingKey?: 'logo_image' | 'header_logo_image';
          removeBackground?: boolean;
          bgColor?: string;
          /** Reprocess an existing /uploads/logo_* URL without uploading a new file. */
          sourceUrl?: string;
        } = 'logo_image'
  ): Promise<string> {
    const options =
      typeof settingKeyOrOptions === 'string'
        ? { settingKey: settingKeyOrOptions as 'logo_image' | 'header_logo_image' }
        : settingKeyOrOptions;
    const settingKey = options.settingKey || 'logo_image';

    const formData = new FormData();
    if (file) {
      formData.append('logo', file);
    }
    formData.append('setting_key', settingKey);
    if (options.sourceUrl) {
      formData.append('source_url', options.sourceUrl);
    }
    if (options.removeBackground) {
      formData.append('remove_background', '1');
    }
    if (options.bgColor) {
      formData.append('bg_color', options.bgColor);
    }

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

  /**
   * Upload favicon (or reprocess existing).
   * Background removal requires PHP GD (ext-gd) on the server — not a JS library.
   */
  async uploadFavicon(
    file: File | null,
    options?: {
      removeBackground?: boolean;
      bgColor?: string;
      /** Reprocess an existing /uploads/favicon_* URL without uploading a new file. */
      sourceUrl?: string;
    }
  ): Promise<string> {
    const formData = new FormData();
    if (file) {
      formData.append('favicon', file);
    }
    if (options?.sourceUrl) {
      formData.append('source_url', options.sourceUrl);
    }
    if (options?.removeBackground) {
      formData.append('remove_background', '1');
    }
    if (options?.bgColor) {
      formData.append('bg_color', options.bgColor);
    }

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

  async purgeLdapSettings(): Promise<{ success: boolean; deleted: number; message: string }> {
    const response = await fetch(`${API_BASE}/settings/purge-ldap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({})
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to purge LDAP settings');
    }

    return data;
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

