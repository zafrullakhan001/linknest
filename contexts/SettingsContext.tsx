import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { settingsService, AppSettings } from '../services/settingsService';

interface SettingsContextType {
  settings: AppSettings;
  loading: boolean;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>({
    app_name: 'LinkNest',
    page_title: 'LinkNest',
    spaces_title: 'My Spaces',
    logo_type: 'icon',
    logo_icon: '🔗',
    logo_image: '',
    favicon: '',
    footer_text: '© 2025 Adventhealth - Designed and developed by AIT Architecture team'
  });
  const [loading, setLoading] = useState(true);

  const loadSettings = async () => {
    try {
      const loadedSettings = await settingsService.getSettings();
      setSettings(loadedSettings);

      // Semi-PWA: register or unregister service worker based on setting
      const semiPwaEnabled = loadedSettings.semi_pwa_enabled === '1' || loadedSettings.semi_pwa_enabled === 'true';
      const swPath = getSwPath();
      if ('serviceWorker' in navigator) {
        if (semiPwaEnabled) {
          try {
            const reg = await navigator.serviceWorker.register(swPath, { scope: getSwScope() });
            await reg.update();
            // Log once per session so hard-refresh shows SW fetch messages instead of this again
            if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem('linknest_pwa_logged')) {
              sessionStorage.setItem('linknest_pwa_logged', '1');
              console.log('[LinkNest PWA] Semi-PWA is ON. Normal load = from cache. Hard refresh (Ctrl+F5 / Cmd+Shift+R) = from database/server — look for "[LinkNest PWA] Database/network fetch" in console.');
            }
          } catch (e) {
            console.warn('[LinkNest PWA] Service worker registration failed:', e);
          }
        } else {
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('linknest_pwa_logged');
          const scope = getSwScope();
          const reg = await navigator.serviceWorker.getRegistration(scope);
          if (reg) await reg.unregister();
          try {
            const cacheNames = await caches.keys();
            const linknestCache = cacheNames.filter((n) => n.startsWith('linknest-pwa'));
            await Promise.all(linknestCache.map((n) => caches.delete(n)));
          } catch (_) { /* ignore */ }
          console.log('[LinkNest PWA] Disabled. Using normal (database/server) fetch for all requests.');
        }
      }

      // Update page title
      document.title = loadedSettings.page_title || 'LinkNest';

      // Update favicon
      updateFavicon(loadedSettings.favicon);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  function getSwPath() {
    const path = typeof window !== 'undefined' ? window.location.pathname || '' : '';
    const base = path.replace(/\/[^/]*$/, '') || '';
    // Use .php endpoint so server returns application/javascript (avoids SPA rewrite returning HTML for .js)
    return (base || '') + '/sw-cache-first.php';
  }

  function getSwScope() {
    const path = typeof window !== 'undefined' ? window.location.pathname || '' : '';
    const base = path.replace(/\/[^/]*$/, '') || '';
    return (base || '/') + '/';
  }

  const updateFavicon = (faviconUrl: string) => {
    // Remove existing favicon links
    const existingLinks = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
    existingLinks.forEach(link => link.remove());
    
    if (faviconUrl) {
      // Create new favicon link
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = faviconUrl.endsWith('.svg') ? 'image/svg+xml' : 
                  faviconUrl.endsWith('.ico') ? 'image/x-icon' : 
                  'image/png';
      link.href = faviconUrl;
      document.head.appendChild(link);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading, refreshSettings: loadSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    // Return default settings if context is not available
    return {
      settings: {
        app_name: 'LinkNest',
        page_title: 'LinkNest',
        spaces_title: 'My Spaces',
        logo_type: 'icon' as const,
        logo_icon: '🔗',
        logo_image: '',
        favicon: '',
        footer_text: '© 2025 Adventhealth - Designed and developed by AIT Architecture team'
      },
      loading: false,
      refreshSettings: async () => {}
    };
  }
  return context;
};

