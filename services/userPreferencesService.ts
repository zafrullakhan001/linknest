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

export interface UserPreferences {
  [key: string]: string | number | boolean | null;
}

export const userPreferencesService = {
  /**
   * Get all user preferences. Returns {} on API error (e.g. 500) to avoid console noise.
   */
  async getPreferences(): Promise<UserPreferences> {
    try {
      const response = await fetch(`${API_BASE}/settings/user-preferences`, {
        method: 'GET',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        return {};
      }

      return data.preferences || {};
    } catch {
      return {};
    }
  },

  /**
   * Get a specific preference value
   */
  async getPreference(key: string): Promise<string | null> {
    const preferences = await this.getPreferences();
    return preferences[key] || null;
  },

  /**
   * Update user preferences
   */
  async updatePreferences(preferences: Partial<UserPreferences>): Promise<void> {
    const response = await fetch(`${API_BASE}/settings/user-preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ preferences })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update user preferences');
    }
  },

  /**
   * Update a single preference
   */
  async updatePreference(key: string, value: string | number | boolean | null): Promise<void> {
    await this.updatePreferences({ [key]: value });
  }
};

