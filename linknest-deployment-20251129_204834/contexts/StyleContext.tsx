import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { SpaceStyles, DEFAULT_STYLES, styleService } from '../services/styleService';
import { useAuth } from './AuthContext';

interface StyleContextType {
  styles: SpaceStyles;
  isLoading: boolean;
  refreshStyles: () => Promise<void>;
  updateStyles: (styles: SpaceStyles) => void;
}

const StyleContext = createContext<StyleContextType | undefined>(undefined);

const StyleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize with cached styles if available, otherwise use defaults
  const getInitialStyles = () => {
    const cached = styleService.getCachedStyles();
    return cached || DEFAULT_STYLES;
  };
  
  const [styles, setStyles] = useState<SpaceStyles>(getInitialStyles);
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated, loading: authLoading } = useAuth();
  const prevAuthRef = useRef<boolean | undefined>(undefined);
  const initialMountRef = useRef(true);
  const applyingStylesRef = useRef(false);
  const styleTagRef = useRef<HTMLStyleElement | null>(null);
  const stylesRef = useRef<SpaceStyles>(getInitialStyles());

  // Keep styles ref in sync
  useEffect(() => {
    stylesRef.current = styles;
  }, [styles]);

  const applyStyles = useCallback((styleData: SpaceStyles, synchronous: boolean = false) => {
    const apply = () => {
      try {
        // Always try to find the existing style tag first (might have been created by inline script)
        let styleTag = document.getElementById('linknest-custom-styles') as HTMLStyleElement | null;
        
        // If not found or not connected, create a new one
        if (!styleTag || !styleTag.isConnected) {
          // Remove any orphaned style tag first (just in case)
          if (styleTag && !styleTag.isConnected) {
            styleTag.remove();
          }

          // Create new style tag
          styleTag = document.createElement('style');
          styleTag.id = 'linknest-custom-styles';
          document.head.appendChild(styleTag);
        }
        
        // Update the ref
        styleTagRef.current = styleTag;

        // Update style content
        const isDark = document.documentElement.classList.contains('dark');
        const css = styleService.generateCSS(styleData, isDark);
        styleTag.textContent = css;
      } catch (error) {
        console.error('Error applying styles:', error);
      }
    };

    // Apply synchronously on initial mount to prevent flash, otherwise use requestAnimationFrame
    if (synchronous) {
      apply();
    } else {
      // For async application, prevent duplicate applications
      if (applyingStylesRef.current) {
        return;
      }
      applyingStylesRef.current = true;
      requestAnimationFrame(() => {
        apply();
        applyingStylesRef.current = false;
      });
    }
  }, []);

  const loadStyles = useCallback(async () => {
    setIsLoading(true);
    try {
      const loadedStyles = await styleService.getStyles();
      setStyles(loadedStyles);
      stylesRef.current = loadedStyles;
      // Apply loaded styles immediately
      applyStyles(loadedStyles, false);
      // Cache the loaded styles
      styleService.cacheStyles(loadedStyles);
    } catch (error) {
      console.error('Failed to load styles:', error);
      // Try to use cached styles on error
      const cached = styleService.getCachedStyles();
      const fallbackStyles = cached || DEFAULT_STYLES;
      setStyles(fallbackStyles);
      stylesRef.current = fallbackStyles;
      applyStyles(fallbackStyles, false);
    } finally {
      setIsLoading(false);
    }
  }, [applyStyles]);

  // Apply styles immediately on mount to prevent flash
  // Apply cached or default styles synchronously before React renders
  useEffect(() => {
    // Get cached styles or defaults
    const cached = styleService.getCachedStyles();
    const initialStyles = cached || DEFAULT_STYLES;
    
    // Apply synchronously immediately
    const applyInitial = () => {
      applyStyles(initialStyles, true);
    };

    if (document.readyState === 'loading') {
      // If document is still loading, wait for DOMContentLoaded
      const handleDOMReady = () => {
        applyInitial();
      };
      document.addEventListener('DOMContentLoaded', handleDOMReady);
      return () => document.removeEventListener('DOMContentLoaded', handleDOMReady);
    } else {
      // Document is already ready, apply immediately
      applyInitial();
    }
  }, [applyStyles]);

  useEffect(() => {
    loadStyles();

    // Debounce timer to prevent excessive API calls
    let reloadTimer: NodeJS.Timeout | null = null;
    const debouncedLoadStyles = () => {
      if (reloadTimer) {
        clearTimeout(reloadTimer);
      }
      reloadTimer = setTimeout(() => {
        loadStyles();
      }, 200);
    };

    // Listen for refresh events (explicit refresh trigger)
    const handleRefresh = () => {
      loadStyles();
    };

    // Reload styles when page becomes visible again (handles page refresh and tab switching)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        debouncedLoadStyles();
      }
    };

    // Reload styles when window gains focus (handles tab switching back)
    const handleFocus = () => {
      debouncedLoadStyles();
    };

    // Reload styles on page show (handles page refresh and back/forward navigation)
    const handlePageShow = (e: PageTransitionEvent) => {
      // Reload styles after page load, including from back/forward cache
      if (e.persisted || document.visibilityState === 'visible') {
        debouncedLoadStyles();
      }
    };

    window.addEventListener('refreshStyles', handleRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      if (reloadTimer) {
        clearTimeout(reloadTimer);
      }
      window.removeEventListener('refreshStyles', handleRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [loadStyles]);

  // Note: Styles are public and don't depend on authentication state
  // We don't reload styles when auth changes to prevent grid column changes
  // Styles are only reloaded on initial mount or when explicitly refreshed
  useEffect(() => {
    // Skip if auth is still loading
    if (authLoading) {
      return;
    }

    // On initial mount, just record the auth state
    if (initialMountRef.current) {
      initialMountRef.current = false;
      prevAuthRef.current = isAuthenticated;
      return;
    }

    // Don't reload styles when authentication state changes
    // This prevents grid columns from changing on sign in/out
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated, authLoading]);

  // Reapply styles when styles state changes
  useEffect(() => {
    // Apply styles whenever the styles state changes
    applyStyles(styles, false);
  }, [styles, applyStyles]);

  // Reapply styles when dark mode changes
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

  const refreshStyles = useCallback(async () => {
    await loadStyles();
  }, [loadStyles]);

  const updateStyles = useCallback((newStyles: SpaceStyles) => {
    setStyles(newStyles);
    stylesRef.current = newStyles;
    applyStyles(newStyles);
    // Cache updated styles immediately
    styleService.cacheStyles(newStyles);
  }, [applyStyles]);

  const contextValue = useMemo(() => ({
    styles,
    isLoading,
    refreshStyles,
    updateStyles
  }), [styles, isLoading, refreshStyles, updateStyles]);

  return (
    <StyleContext.Provider value={contextValue}>
      {children}
    </StyleContext.Provider>
  );
};

StyleProvider.displayName = 'StyleProvider';

export { StyleProvider };

export const useStyles = () => {
  const context = useContext(StyleContext);
  if (context === undefined) {
    throw new Error('useStyles must be used within a StyleProvider');
  }
  return context;
};

