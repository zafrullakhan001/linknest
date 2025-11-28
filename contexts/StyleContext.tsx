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
    // Prevent duplicate applications
    if (applyingStylesRef.current && !synchronous) {
      return;
    }
    applyingStylesRef.current = true;

    const apply = () => {
      try {
        // Get or create style tag
        let styleTag = styleTagRef.current;

        // Check if tag exists and is still in DOM
        if (!styleTag || !styleTag.isConnected) {
          // First check if tag was created by inline script
          const existingStyle = document.getElementById('linknest-custom-styles');
          if (existingStyle && existingStyle.isConnected) {
            styleTag = existingStyle as HTMLStyleElement;
            styleTagRef.current = styleTag;
          } else {
            // Remove any orphaned style tag first (just in case)
            if (existingStyle) {
              existingStyle.remove();
            }

            // Create new style tag
            styleTag = document.createElement('style');
            styleTag.id = 'linknest-custom-styles';
            document.head.appendChild(styleTag);
            styleTagRef.current = styleTag;
          }
        }

        // Update style content
        const isDark = document.documentElement.classList.contains('dark');
        styleTag.textContent = styleService.generateCSS(styleData, isDark);
      } catch (error) {
        console.error('Error applying styles:', error);
      } finally {
        applyingStylesRef.current = false;
      }
    };

    // Apply synchronously on initial mount to prevent flash, otherwise use requestAnimationFrame
    if (synchronous) {
      apply();
    } else {
      requestAnimationFrame(apply);
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

    // Listen for refresh events
    const handleRefresh = () => {
      loadStyles();
    };

    window.addEventListener('refreshStyles', handleRefresh);

    return () => {
      window.removeEventListener('refreshStyles', handleRefresh);
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
    stylesRef.current = newStyles;
    applyStyles(newStyles);
    // Cache updated styles immediately
    styleService.cacheStyles(newStyles);
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

