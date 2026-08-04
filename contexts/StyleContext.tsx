import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { SpaceStyles, DEFAULT_STYLES, styleService } from '../services/styleService';
import { useAuth } from './AuthContext';
import { userPreferencesService } from '../services/userPreferencesService';

interface StyleContextType {
  styles: SpaceStyles;
  isLoading: boolean;
  refreshStyles: () => Promise<void>;
  updateStyles: (styles: SpaceStyles) => void;
}

const StyleContext = createContext<StyleContextType | undefined>(undefined);

const StyleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize with cached styles if available (including stale cache), otherwise use defaults
  const getInitialStyles = () => {
    const cached = styleService.getCachedStyles(true);
    return cached || DEFAULT_STYLES;
  };

  const hasCachedOnMount = styleService.hasCachedStyles(true);
  
  const [styles, setStyles] = useState<SpaceStyles>(getInitialStyles);
  const [isLoading, setIsLoading] = useState(!hasCachedOnMount);
  const { isAuthenticated, loading: authLoading } = useAuth();
  const prevAuthRef = useRef<boolean | undefined>(undefined);
  const initialMountRef = useRef(true);
  const applyingStylesRef = useRef(false);
  const styleTagRef = useRef<HTMLStyleElement | null>(null);
  const stylesRef = useRef<SpaceStyles>(getInitialStyles());
  const backgroundRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadStylesRef = useRef<(options?: { silent?: boolean }) => Promise<void>>();

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
        // Clear any temporary inline zoom from the HTML bootstrap script
        // (stylesheet zoom should own this going forward)
        document.documentElement.style.removeProperty('zoom');
        
        // Trigger zoom adjustment after styles are applied
        // Use a custom event to notify the zoom adjustment effect
        // Dispatch after a microtask to ensure CSS is processed
        Promise.resolve().then(() => {
          window.dispatchEvent(new CustomEvent('linknest-styles-applied', { 
            detail: { pageZoom: styleData.pageZoom || 100 } 
          }));
        });
      } catch (error) {
        console.error('Error applying styles:', error);
      }
    };

    // Apply synchronously on initial mount to prevent flash, otherwise use requestAnimationFrame
    if (synchronous) {
      apply();
      // For synchronous, also trigger adjustment after styles are set
      Promise.resolve().then(() => {
        window.dispatchEvent(new CustomEvent('linknest-styles-applied', { 
          detail: { pageZoom: styleData.pageZoom || 100 } 
        }));
      });
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

  const scheduleBackgroundStylesRetry = useCallback(() => {
    if (backgroundRetryTimerRef.current) {
      clearTimeout(backgroundRetryTimerRef.current);
    }
    backgroundRetryTimerRef.current = setTimeout(() => {
      backgroundRetryTimerRef.current = null;
      if (styleService.getLastLoadSource() === 'api') {
        return;
      }
      void loadStylesRef.current?.({ silent: true });
    }, 3000);
  }, []);

  const loadStyles = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    try {
      const loadedStyles = await styleService.getStyles();
      const loadSource = styleService.getLastLoadSource();
      
      // For authenticated users, load their personal zoom preference from database
      // This ensures registered users get their saved zoom preference, not the global styles zoom
      if (isAuthenticated) {
        try {
          const userZoom = await userPreferencesService.getPreference('page_zoom');
          if (userZoom) {
            const zoomValue = parseInt(userZoom, 10);
            if (!isNaN(zoomValue) && zoomValue >= 10 && zoomValue <= 200) {
              loadedStyles.pageZoom = zoomValue;
            }
          }
        } catch (error) {
          console.error('Failed to load user zoom preference:', error);
          // Fallback to localStorage if database fails
          const localZoom = localStorage.getItem('linknest_user_page_zoom');
          if (localZoom) {
            const zoomValue = parseInt(localZoom, 10);
            if (!isNaN(zoomValue) && zoomValue >= 10 && zoomValue <= 200) {
              loadedStyles.pageZoom = zoomValue;
            }
          }
        }
      } else {
        // For guest users, preserve their localStorage zoom preference
        // This prevents backend styles from overwriting guest user's zoom setting
        const guestZoom = localStorage.getItem('linknest_user_page_zoom');
        if (guestZoom) {
          const zoomValue = parseInt(guestZoom, 10);
          if (!isNaN(zoomValue) && zoomValue >= 10 && zoomValue <= 200) {
            loadedStyles.pageZoom = zoomValue;
          }
        }
      }
      
      setStyles(loadedStyles);
      stylesRef.current = loadedStyles;
      // Apply loaded styles immediately
      applyStyles(loadedStyles, false);
      // Cache the loaded styles
      styleService.cacheStyles(loadedStyles);

      if (loadSource === 'stale-cache' || loadSource === 'defaults') {
        scheduleBackgroundStylesRetry();
      }
    } catch (error) {
      console.error('Failed to load styles:', error);
      // Try to use cached styles on error (including stale)
      const cached = styleService.getCachedStyles(true);
      const fallbackStyles = cached || DEFAULT_STYLES;
      
      // For authenticated users, try to load zoom from database
      if (isAuthenticated) {
        try {
          const userZoom = await userPreferencesService.getPreference('page_zoom');
          if (userZoom) {
            const zoomValue = parseInt(userZoom, 10);
            if (!isNaN(zoomValue) && zoomValue >= 10 && zoomValue <= 200) {
              fallbackStyles.pageZoom = zoomValue;
            }
          }
        } catch (error) {
          // Fallback to localStorage
          const localZoom = localStorage.getItem('linknest_user_page_zoom');
          if (localZoom) {
            const zoomValue = parseInt(localZoom, 10);
            if (!isNaN(zoomValue) && zoomValue >= 10 && zoomValue <= 200) {
              fallbackStyles.pageZoom = zoomValue;
            }
          }
        }
      } else {
        // For guest users, preserve their localStorage zoom preference
        const guestZoom = localStorage.getItem('linknest_user_page_zoom');
        if (guestZoom) {
          const zoomValue = parseInt(guestZoom, 10);
          if (!isNaN(zoomValue) && zoomValue >= 10 && zoomValue <= 200) {
            fallbackStyles.pageZoom = zoomValue;
          }
        }
      }
      
      setStyles(fallbackStyles);
      stylesRef.current = fallbackStyles;
      applyStyles(fallbackStyles, false);
      scheduleBackgroundStylesRetry();
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }, [applyStyles, isAuthenticated, scheduleBackgroundStylesRetry]);

  useEffect(() => {
    loadStylesRef.current = loadStyles;
  }, [loadStyles]);

  // Apply styles immediately on mount to prevent flash
  // Apply cached or default styles synchronously before React renders
  useEffect(() => {
    // Get cached styles or defaults
    const cached = styleService.getCachedStyles(true);
    const initialStyles = cached || DEFAULT_STYLES;
    
    // Apply synchronously immediately
    const applyInitial = () => {
      applyStyles(initialStyles, true);
      // Ensure pre-rendered CSS exists for the next page load bootstrap
      if (cached) {
        styleService.cacheStyles(initialStyles);
      }
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

    // Listen for refresh events (explicit refresh trigger)
    const handleRefresh = () => {
      loadStyles();
    };

    window.addEventListener('refreshStyles', handleRefresh);

    return () => {
      window.removeEventListener('refreshStyles', handleRefresh);
      if (backgroundRetryTimerRef.current) {
        clearTimeout(backgroundRetryTimerRef.current);
        backgroundRetryTimerRef.current = null;
      }
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

  // Preserve user's zoom preference when styles are loaded/reloaded
  // For registered users: load from database
  // For guest users: load from localStorage
  // This prevents backend styles from overwriting user's zoom setting
  const lastUserZoomRef = useRef<number | null>(null);
  const zoomCheckInProgressRef = useRef(false);
  useEffect(() => {
    if (authLoading || zoomCheckInProgressRef.current) return;
    
    const preserveZoomPreference = async () => {
      zoomCheckInProgressRef.current = true;
      
      try {
        let savedZoom: number | null = null;
        
        if (isAuthenticated) {
          // For registered users: load from database
          try {
            const dbZoom = await userPreferencesService.getPreference('page_zoom');
            if (dbZoom) {
              const zoomValue = parseInt(dbZoom, 10);
              if (!isNaN(zoomValue) && zoomValue >= 10 && zoomValue <= 200) {
                savedZoom = zoomValue;
              }
            }
          } catch (error) {
            // Fallback to localStorage
            const localZoom = localStorage.getItem('linknest_user_page_zoom');
            if (localZoom) {
              const zoomValue = parseInt(localZoom, 10);
              if (!isNaN(zoomValue) && zoomValue >= 10 && zoomValue <= 200) {
                savedZoom = zoomValue;
              }
            }
          }
        } else {
          // For guest users: load from localStorage
          const guestZoom = localStorage.getItem('linknest_user_page_zoom');
          if (guestZoom) {
            const zoomValue = parseInt(guestZoom, 10);
            if (!isNaN(zoomValue) && zoomValue >= 10 && zoomValue <= 200) {
              savedZoom = zoomValue;
            }
          }
        }
        
        // Only restore if:
        // 1. Current zoom is different from user's saved preference
        // 2. The current zoom doesn't match what we last set (not a user change)
        // This prevents overwriting user-initiated zoom changes
        if (savedZoom !== null && styles.pageZoom !== savedZoom && lastUserZoomRef.current !== savedZoom) {
          // This appears to be a backend reload overwriting user preference
          const updatedStyles = { ...styles, pageZoom: savedZoom };
          setStyles(updatedStyles);
          stylesRef.current = updatedStyles;
          applyStyles(updatedStyles, false);
          styleService.cacheStyles(updatedStyles);
          lastUserZoomRef.current = savedZoom;
        } else if (savedZoom !== null && styles.pageZoom === savedZoom) {
          // Current zoom matches user preference, update ref
          lastUserZoomRef.current = savedZoom;
        }
      } catch (error) {
        console.error('Failed to preserve zoom preference:', error);
      } finally {
        zoomCheckInProgressRef.current = false;
      }
    };
    
    preserveZoomPreference();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles.pageZoom, isAuthenticated, authLoading]); // Only watch pageZoom, not entire styles object

  // Handle page zoom to eliminate white space (similar to browser zoom)
  useEffect(() => {
    const zoomValue = styles.pageZoom || 100;
    const zoomScale = zoomValue / 100;

    // Function to check if zoom CSS is actually applied
    const isZoomApplied = (): boolean => {
      const html = document.documentElement;
      const computedStyle = window.getComputedStyle(html);
      const zoom = computedStyle.zoom;
      // Check if zoom is set (either as a number or via transform)
      return zoom !== '1' && zoom !== 'normal' && zoom !== '';
    };

    // Function to adjust layout for zoom and remove white space
    const adjustLayoutForZoom = (retryCount: number = 0) => {
      const html = document.documentElement;
      const body = document.body;
      const root = document.getElementById('root');
      const container = document.querySelector('.linknest-app-container') as HTMLElement;

      // Wait for container to exist
      if (!container && retryCount < 20) {
        setTimeout(() => {
          adjustLayoutForZoom(retryCount + 1);
        }, 50);
        return;
      }

      // If zoom should be applied but CSS isn't ready yet, retry
      if (zoomValue !== 100 && !isZoomApplied() && retryCount < 20) {
        // CSS zoom might not be applied yet, retry after a short delay
        setTimeout(() => {
          adjustLayoutForZoom(retryCount + 1);
        }, 50);
        return;
      }

      if (zoomValue !== 100 && container) {
        // When zoomed, the viewport height needs to account for zoom
        // CSS zoom scales the content, but 100vh still refers to original viewport
        // We need to adjust the container's min-height to prevent white space
        
        // Get the actual viewport height
        const viewportHeight = window.innerHeight;
        
        // When CSS zoom is applied, 100vh is still the original viewport height
        // But visually, everything is scaled by zoomScale
        // To fill the viewport without white space, we need: viewportHeight / zoomScale
        // This gives us the height that, when zoomed, will exactly fill the viewport
        const adjustedHeight = viewportHeight / zoomScale;
        container.style.minHeight = `${adjustedHeight}px`;
        
        // Ensure html/body don't create extra space
        if (html) {
          html.style.height = '100%';
          html.style.overflowY = 'auto';
        }
        
        if (body) {
          body.style.height = '100%';
          body.style.overflowY = 'auto';
        }
      } else {
        // Reset to default when zoom is 100%
        if (container) {
          container.style.minHeight = '';
        }
        if (html) {
          html.style.height = '';
          html.style.overflowY = '';
        }
        if (body) {
          body.style.height = '';
          body.style.overflowY = '';
        }
      }
    };

    // Adjust immediately, then retry if needed
    // Use multiple strategies to ensure it runs consistently
    let rafId: number;
    const scheduleAdjustment = () => {
      // First attempt: requestAnimationFrame
      rafId = requestAnimationFrame(() => {
        adjustLayoutForZoom();
        
        // Second attempt: after a short delay to catch late style applications
        setTimeout(() => {
          adjustLayoutForZoom();
        }, 100);
        
        // Third attempt: after styles might be fully processed
        setTimeout(() => {
          adjustLayoutForZoom();
        }, 300);
      });
    };

    // Run immediately
    scheduleAdjustment();
    
    // Also run when DOM is ready (if not already)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scheduleAdjustment);
    } else {
      // DOM is already ready, but run after a brief delay to ensure React has rendered
      setTimeout(scheduleAdjustment, 0);
    }

    // Also adjust on window resize
    const handleResize = () => {
      adjustLayoutForZoom();
    };

    window.addEventListener('resize', handleResize);
    
    // Watch for style tag changes to ensure we adjust after CSS is applied
    const styleTag = document.getElementById('linknest-custom-styles');
    let styleObserver: MutationObserver | null = null;
    
    if (styleTag) {
      styleObserver = new MutationObserver(() => {
        // When style tag content changes, adjust layout
        setTimeout(() => {
          adjustLayoutForZoom();
        }, 50);
      });
      styleObserver.observe(styleTag, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }
    
    // Also adjust when content changes (use ResizeObserver for container)
    const container = document.querySelector('.linknest-app-container');
    let resizeObserver: ResizeObserver | null = null;
    
    if (container && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        adjustLayoutForZoom();
      });
      resizeObserver.observe(container);
    }

    // Listen for when styles are applied - this ensures we adjust after CSS is injected
    const handleStylesApplied = (event: CustomEvent) => {
      const appliedZoom = event.detail?.pageZoom || zoomValue;
      if (appliedZoom === zoomValue) {
        // Styles with matching zoom were applied, adjust layout
        setTimeout(() => {
          adjustLayoutForZoom();
        }, 50);
      }
    };

    window.addEventListener('linknest-styles-applied', handleStylesApplied as EventListener);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('linknest-styles-applied', handleStylesApplied as EventListener);
      if (styleObserver) {
        styleObserver.disconnect();
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [styles.pageZoom]);

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
    // Update the last user zoom ref when styles are updated
    // This prevents the preservation useEffect from overwriting user-initiated changes
    if (newStyles.pageZoom !== undefined) {
      lastUserZoomRef.current = newStyles.pageZoom;
    }
    
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

