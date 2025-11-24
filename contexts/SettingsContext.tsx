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
    logo_image: ''
  });
  const [loading, setLoading] = useState(true);

  const loadSettings = async () => {
    try {
      const loadedSettings = await settingsService.getSettings();
      setSettings(loadedSettings);
      
      // Update page title
      document.title = loadedSettings.page_title || 'LinkNest';
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
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
        logo_image: ''
      },
      loading: false,
      refreshSettings: async () => {}
    };
  }
  return context;
};

