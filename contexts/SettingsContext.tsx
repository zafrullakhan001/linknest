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
    favicon: ''
  });
  const [loading, setLoading] = useState(true);

  const loadSettings = async () => {
    try {
      const loadedSettings = await settingsService.getSettings();
      setSettings(loadedSettings);
      
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
        favicon: ''
      },
      loading: false,
      refreshSettings: async () => {}
    };
  }
  return context;
};

