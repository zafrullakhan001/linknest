import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { SpaceStyles, DEFAULT_STYLES, styleService } from '../services/styleService';
import { useAuth } from './AuthContext';

interface StyleContextType {
  styles: SpaceStyles;
  isLoading: boolean;
  refreshStyles: () => Promise<void>;
  updateStyles: (styles: SpaceStyles) => void;
}

const StyleContext = createContext<StyleContextType | undefined>(undefined);

export const StyleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [styles, setStyles] = useState<SpaceStyles>(DEFAULT_STYLES);
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated, loading: authLoading } = useAuth();
  const prevAuthRef = useRef<boolean | undefined>(undefined);
  const initialMountRef = useRef(true);

  const loadStyles = async () => {
    setIsLoading(true);
    try {
      const loadedStyles = await styleService.getStyles();
      setStyles(loadedStyles);
      applyStyles(loadedStyles);
    } catch (error) {
      console.error('Failed to load styles:', error);
      applyStyles(DEFAULT_STYLES);
    } finally {
      setIsLoading(false);
    }
  };

  const applyStyles = (styleData: SpaceStyles) => {
    // Remove existing style tag if any
    const existingStyle = document.getElementById('linknest-custom-styles');
    if (existingStyle) {
      existingStyle.remove();
    }

    // Create new style tag
    const styleTag = document.createElement('style');
    styleTag.id = 'linknest-custom-styles';
    styleTag.textContent = styleService.generateCSS(styleData, document.documentElement.classList.contains('dark'));
    document.head.appendChild(styleTag);
  };

  useEffect(() => {
    loadStyles();
    
    // Listen for refresh events
    const handleRefresh = () => {
      loadStyles();
    };
    
    window.addEventListener('refreshStyles', handleRefresh);
    
    return () => {
      window.removeEventListener('refreshStyles', handleRefresh);
    };
  }, []);

  // Reload styles when authentication state changes (but not on initial mount)
  useEffect(() => {
    // Skip if auth is still loading
    if (authLoading) {
      return;
    }

    // On initial mount, just record the auth state and don't reload
    if (initialMountRef.current) {
      initialMountRef.current = false;
      prevAuthRef.current = isAuthenticated;
      return;
    }

    // Only reload if authentication state actually changed
    if (prevAuthRef.current !== isAuthenticated) {
      prevAuthRef.current = isAuthenticated;
      loadStyles();
    }
  }, [isAuthenticated, authLoading]);

  // Reapply styles when they change or dark mode changes
  useEffect(() => {
    // Reapply styles when dark mode changes
    const observer = new MutationObserver(() => {
      applyStyles(styles);
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    
    return () => {
      observer.disconnect();
    };
  }, [styles]);

  const refreshStyles = async () => {
    await loadStyles();
  };

  const updateStyles = (newStyles: SpaceStyles) => {
    setStyles(newStyles);
    applyStyles(newStyles);
  };

  return (
    <StyleContext.Provider value={{ styles, isLoading, refreshStyles, updateStyles }}>
      {children}
    </StyleContext.Provider>
  );
};

export const useStyles = () => {
  const context = useContext(StyleContext);
  if (context === undefined) {
    throw new Error('useStyles must be used within a StyleProvider');
  }
  return context;
};

