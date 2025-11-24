const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface AppSettings {
  app_name: string;
  page_title: string;
  spaces_title: string;
  logo_type: 'icon' | 'image';
  logo_icon: string;
  logo_image: string;
}

export const settingsService = {
  async getSettings(): Promise<AppSettings> {
    const response = await fetch(`${API_BASE}/settings`, {
      method: 'GET',
      credentials: 'include'
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
  }
};

