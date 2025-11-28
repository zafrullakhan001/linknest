import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
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
  const applyingStylesRef = useRef(false);
  const styleTagRef = useRef<HTMLStyleElement | null>(null);
  const stylesRef = useRef<SpaceStyles>(DEFAULT_STYLES);

  // Keep styles ref in sync
  useEffect(() => {
    stylesRef.current = styles;
  }, [styles]);

  const applyStyles = useCallback((styleData: SpaceStyles) => {
    // Prevent duplicate applications
    if (applyingStylesRef.current) {
      return;
    }
    applyingStylesRef.current = true;

    // Use requestAnimationFrame to batch style updates and prevent flicker
    requestAnimationFrame(() => {
      try {
        // Get or create style tag
        let styleTag = styleTagRef.current;

        // Check if tag exists and is still in DOM
        if (!styleTag || !styleTag.isConnected) {
          // Remove any existing style tag first (just in case)
          const existingStyle = document.getElementById('linknest-custom-styles');
          if (existingStyle) {
            existingStyle.remove();
          }

          // Create new style tag
          styleTag = document.createElement('style');
          styleTag.id = 'linknest-custom-styles';
          document.head.appendChild(styleTag);
          styleTagRef.current = styleTag;
        }

        // Update style content
        const isDark = document.documentElement.classList.contains('dark');
        styleTag.textContent = styleService.generateCSS(styleData, isDark);
      } catch (error) {
        console.error('Error applying styles:', error);
      } finally {
        applyingStylesRef.current = false;
      }
    });
  }, []);

  const loadStyles = useCallback(async () => {
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
  }, [applyStyles]);

  // Apply styles immediately on mount to prevent flash
  // Wait a tick to ensure dark mode class is set
  useEffect(() => {
    // Use setTimeout to ensure DOM is ready and dark mode is set
    const timer = setTimeout(() => {
      // Only apply defaults if we haven't loaded anything yet
      if (isLoading) {
        applyStyles(DEFAULT_STYLES);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [applyStyles, isLoading]);

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
  }, [loadStyles]);

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
  }, [isAuthenticated, authLoading, loadStyles]);

  // Reapply styles when they change or dark mode changes
  useEffect(() => {
    // Reapply styles when dark mode changes
    let timeoutId: NodeJS.Timeout;
    const observer = new MutationObserver(() => {
      // Debounce dark mode changes to prevent excessive updates
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        // Use ref to get current styles to avoid stale closure
        applyStyles(stylesRef.current);
      }, 50);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [applyStyles]);

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

