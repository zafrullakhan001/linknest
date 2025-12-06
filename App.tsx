import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Tile, Link } from './types';
import { getTiles, saveTiles, createTile, deleteTile, cloneTile } from './services/storageService';
import { settingsService } from './services/settingsService';
import { Navigation } from './components/Navigation';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { StyleProvider, useStyles } from './contexts/StyleContext';
import { AuthModal } from './components/AuthModal';
import { TimezoneDisplay } from './components/TimezoneDisplay';
import { HelpAboutDialog } from './components/HelpAboutDialog';

// Lazy load heavy components for better initial load performance
const TileGrid = lazy(() => import('./components/TileGrid').then(m => ({ default: m.TileGrid })));
const TileDetail = lazy(() => import('./components/TileDetail').then(m => ({ default: m.TileDetail })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));
const StyleManager = lazy(() => import('./components/StyleManager').then(m => ({ default: m.StyleManager })));

// Loading fallback component
const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
  </div>
);

// Simple Hash Router implementation
const useHashRoute = () => {
  // Normalize hash: empty hash or no hash = root route (but don't modify URL)
  const normalizeHash = (hash: string) => {
    if (!hash || hash === '#' || hash === '#/') {
      return '#/';
    }
    return hash;
  };

  const [route, setRoute] = useState(normalizeHash(window.location.hash));

  useEffect(() => {
    const handler = () => {
      setRoute(normalizeHash(window.location.hash));
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  return route;
};

const AppContent: React.FC = () => {
  const route = useHashRoute();
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [styleManagerOpen, setStyleManagerOpen] = useState(false);
  const [helpAboutOpen, setHelpAboutOpen] = useState(false);
  const [authRequired, setAuthRequired] = useState(false); // Track if we got 401 error
  const [databasePath, setDatabasePath] = useState<string>('');
  const [databasePathAbsolute, setDatabasePathAbsolute] = useState<string>('');
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { updateStyles, styles, isLoading: stylesLoading } = useStyles();
  const { settings, loading: settingsLoading } = useSettings();

  // Theme State
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('linknest_theme');
    return saved ? saved === 'dark' : true; // Default to dark
  });

  // Auto-switch preference (default: enabled)
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(() => {
    const saved = localStorage.getItem('linknest_auto_switch');
    return saved !== null ? saved === 'true' : true; // Default to enabled
  });

  // Ref to track current darkMode state for auto-switch logic
  const darkModeRef = useRef(darkMode);
  useEffect(() => {
    darkModeRef.current = darkMode;
  }, [darkMode]);

  // Function to determine if it should be dark mode based on time
  const shouldBeDarkMode = useCallback(() => {
    const now = new Date();
    const hour = now.getHours();
    // Day mode: 7am-5pm (7:00 to 17:59) = light mode
    // Night mode: 6pm-6am (18:00 to 6:59) = dark mode
    return hour >= 18 || hour < 7;
  }, []);

  // Apply theme to DOM
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('linknest_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('linknest_theme', 'light');
    }
  }, [darkMode]);

  // Auto-switch theme based on time
  useEffect(() => {
    if (!autoSwitchEnabled) {
      return; // Don't auto-switch if disabled
    }

    // Function to check and update theme
    const checkAndUpdateTheme = () => {
      const shouldBeDark = shouldBeDarkMode();
      // Use ref to get current state to avoid stale closure
      if (shouldBeDark !== darkModeRef.current) {
        setDarkMode(shouldBeDark);
      }
    };

    // Check immediately on mount
    checkAndUpdateTheme();

    // Calculate milliseconds until next hour change (at 7am or 6pm)
    const getNextCheckTime = () => {
      const now = new Date();
      const hour = now.getHours();
      let nextHour: number;
      
      if (hour < 7) {
        // Before 7am, next change is at 7am
        nextHour = 7;
      } else if (hour < 18) {
        // Between 7am and 6pm, next change is at 6pm
        nextHour = 18;
      } else {
        // After 6pm, next change is at 7am next day
        nextHour = 7;
      }

      const nextCheck = new Date();
      nextCheck.setHours(nextHour, 0, 0, 0);
      
      // If we've passed the hour today, set for tomorrow
      if (nextCheck <= now) {
        nextCheck.setDate(nextCheck.getDate() + 1);
      }

      return nextCheck.getTime() - now.getTime();
    };

    // Set timeout for next hour change
    let timeoutId: NodeJS.Timeout;
    const scheduleNextCheck = () => {
      const delay = getNextCheckTime();
      timeoutId = setTimeout(() => {
        checkAndUpdateTheme();
        // Schedule subsequent checks every hour
        const intervalId = setInterval(() => {
          checkAndUpdateTheme();
        }, 60 * 60 * 1000); // Check every hour

        // Store interval ID to clear on cleanup
        (timeoutId as any).intervalId = intervalId;
      }, delay);
    };

    scheduleNextCheck();

    // Also check periodically (every minute) as a backup
    const intervalId = setInterval(() => {
      checkAndUpdateTheme();
    }, 60 * 1000); // Check every minute

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
      if ((timeoutId as any)?.intervalId) {
        clearInterval((timeoutId as any).intervalId);
      }
    };
  }, [autoSwitchEnabled, shouldBeDarkMode]);

  // Listen for style manager open event
  useEffect(() => {
    const handleOpenStyleManager = () => {
      if (user?.is_admin) {
        setStyleManagerOpen(true);
      }
    };

    window.addEventListener('openStyleManager', handleOpenStyleManager);
    return () => {
      window.removeEventListener('openStyleManager', handleOpenStyleManager);
    };
  }, [user]);

  const toggleTheme = () => {
    // When user manually toggles, disable auto-switch
    setAutoSwitchEnabled(false);
    localStorage.setItem('linknest_auto_switch', 'false');
    setDarkMode(!darkMode);
  };

  // Check guest access setting
  const guestAccessEnabled = settings.guest_access_enabled !== '0'; // Default to enabled if not set

  // Load data on mount
  useEffect(() => {
    // Reset auth required flag when user logs in
    if (isAuthenticated) {
      setAuthRequired(false);
    }

    // Don't load data if guest access is disabled and user is not authenticated
    if (!guestAccessEnabled && !isAuthenticated && !settingsLoading) {
      setLoading(false);
      setTiles([]);
      setAuthRequired(true);
      return;
    }

    const loadData = async () => {
      try {
        const stored = await getTiles();
        setTiles(stored);
        setAuthRequired(false);
      } catch (error: any) {
        // If guest access is disabled and we get a 401, set auth required flag
        if (error?.message?.includes('Authentication required') || (error?.response?.status === 401)) {
          if (!isAuthenticated) {
            setTiles([]);
            setAuthRequired(true);
            setLoading(false);
            return;
          }
        }
        console.error('Failed to load tiles:', error);
        setTiles([]);
        setAuthRequired(false);
      } finally {
        setLoading(false);
      }
    };

    if (!settingsLoading && (guestAccessEnabled || isAuthenticated)) {
      loadData();
    }
  }, [isAuthenticated, guestAccessEnabled, settingsLoading]); // Reload when auth state or guest access changes

  // Load database path on mount
  useEffect(() => {
    const loadDatabasePath = async () => {
      try {
        const paths = await settingsService.getDatabasePath();
        setDatabasePath(paths.relative);
        setDatabasePathAbsolute(paths.absolute);
      } catch (error) {
        console.error('Failed to load database path:', error);
        setDatabasePath('');
        setDatabasePathAbsolute('');
      }
    };

    loadDatabasePath();
  }, []);

  const handleUpdateTiles = async (newTiles: Tile[], skipReload: boolean = false) => {
    if (!isAuthenticated) {
      // Guest mode: just update local state for viewing
      setTiles(newTiles);
      return;
    }

    try {
      setTiles(newTiles);
      await saveTiles(newTiles);
      
      // Reload from server after successful save to ensure we have the latest data
      // This is especially important for tabs/sections which are stored separately
      // Skip reload if requested (e.g., during auto-save to preserve edit mode)
      if (!skipReload) {
        const stored = await getTiles();
        setTiles(stored);
      }
    } catch (error) {
      console.error('Failed to save tiles:', error);
      // Reload from server on error (unless we're skipping reload)
      if (!skipReload) {
        const stored = await getTiles();
        setTiles(stored);
      }
    }
  };

  const handleCreateTile = async (tile: Tile) => {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    try {
      const created = await createTile(tile);
      setTiles([...tiles, created]);
    } catch (error) {
      console.error('Failed to create tile:', error);
      throw error;
    }
  };

  const handleDeleteTile = async (tileId: string) => {
    if (!isAuthenticated) {
      return;
    }

    try {
      await deleteTile(tileId);
      setTiles(tiles.filter(t => t.id !== tileId));
    } catch (error) {
      console.error('Failed to delete tile:', error);
      throw error;
    }
  };

  const handleCloneTile = async (tileId: string) => {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    try {
      const cloned = await cloneTile(tileId);
      // Reload tiles to get the updated list
      const updatedTiles = await getTiles();
      setTiles(updatedTiles);
    } catch (error) {
      console.error('Failed to clone tile:', error);
      throw error;
    }
  };

  // Only show loading if settings are loading OR if we're authenticated and loading tiles
  // Don't show loading if guest access is disabled and user is not authenticated
  if (settingsLoading || stylesLoading || (loading && (isAuthenticated || guestAccessEnabled))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white transition-colors duration-300">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
      </div>
    );
  }


  // Routing Logic
  let content;

  // If guest access is disabled and user is not authenticated, show login message in content area
  // Also show if we got a 401 error (authRequired flag)
  const shouldShowLoginMessage = (!guestAccessEnabled && !isAuthenticated && !settingsLoading) ||
    (authRequired && !isAuthenticated);

  if (shouldShowLoginMessage) {
    content = (
      <div className="w-full max-w-2xl mx-auto">
        {/* Main Message Card */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-8 mb-6">
          <div className="text-center">
            {/* Icon */}
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                <svg className="h-10 w-10 text-brand-600 dark:text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
              Login Required
            </h2>

            {/* Description */}
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-2">
              Guest access has been disabled.
            </p>
            <p className="text-base text-slate-500 dark:text-slate-500 mb-8">
              Please sign in with your account to access and view all spaces.
            </p>

            {/* Login Button */}
            <button
              onClick={() => setAuthModalOpen(true)}
              className="w-full px-6 py-3.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold text-base transition-colors shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Sign In to Continue
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-blue-800 dark:text-blue-300 font-medium mb-1">
                Need an account?
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-400">
                Contact your administrator to create an account or use the registration option in the sign-in dialog.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  } else if (route === '#/' || route === '') {
    content = (
      <Suspense fallback={<LoadingFallback />}>
        <TileGrid
          tiles={tiles}
          onUpdateTiles={handleUpdateTiles}
          onCreateTile={handleCreateTile}
          onDeleteTile={handleDeleteTile}
          onCloneTile={handleCloneTile}
          isAuthenticated={isAuthenticated}
          onAuthRequired={() => setAuthModalOpen(true)}
        />
      </Suspense>
    );
  } else if (route === '#/admin') {
    if (user?.is_admin) {
      content = (
        <Suspense fallback={<LoadingFallback />}>
          <AdminPanel
            onUserApproved={() => {
              // Refresh tiles if needed
              const loadData = async () => {
                try {
                  const stored = await getTiles();
                  setTiles(stored);
                } catch (error) {
                  console.error('Failed to load tiles:', error);
                }
              };
              loadData();
            }}
          />
        </Suspense>
      );
    } else {
      window.location.hash = '#/';
      content = null;
    }
  } else if (route.startsWith('#/tile/')) {
    const tileId = route.split('/tile/')[1];
    const tile = tiles.find((t) => t.id === tileId);
    if (tile) {
      content = (
        <Suspense fallback={<LoadingFallback />}>
          <TileDetail
            tile={tile}
            allTiles={tiles}
            onUpdateTiles={handleUpdateTiles}
            isAuthenticated={isAuthenticated}
            onAuthRequired={() => setAuthModalOpen(true)}
          />
        </Suspense>
      );
    } else {
      // 404 or redirect
      window.location.hash = '#/';
      content = null;
    }
  } else {
    content = (
      <Suspense fallback={<LoadingFallback />}>
        <TileGrid
          tiles={tiles}
          onUpdateTiles={handleUpdateTiles}
          onCreateTile={handleCreateTile}
          onDeleteTile={handleDeleteTile}
          onCloneTile={handleCloneTile}
          isAuthenticated={isAuthenticated}
          onAuthRequired={() => setAuthModalOpen(true)}
        />
      </Suspense>
    );
  }

  return (
    <div className="linknest-app-container min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-brand-500 selection:text-white transition-colors duration-300">
      <Navigation
        darkMode={darkMode}
        toggleTheme={toggleTheme}
        user={user}
        onLoginClick={() => setAuthModalOpen(true)}
        onHelpClick={() => setHelpAboutOpen(true)}
      />
      <main className={`flex-grow container mx-auto px-4 py-8 max-w-6xl-plus linknest-page-content ${styles?.backgroundRaised ? 'linknest-page-background' : ''} ${!guestAccessEnabled && !isAuthenticated ? 'flex items-center justify-center' : ''}`}>
        {content}
      </main>
      {!isAuthenticated && guestAccessEnabled && (
        <div className="container mx-auto px-4 max-w-6xl-plus pb-4">
          <div className="p-2.5 bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/50 rounded-md text-center">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              👋 Guest Mode: You're viewing all public links.
              <button
                onClick={() => setAuthModalOpen(true)}
                className="ml-1.5 text-slate-700 dark:text-slate-300 hover:underline"
              >
                Sign in to edit
              </button>
            </p>
          </div>
        </div>
      )}
      <footer className="linknest-footer py-6 text-sm relative" style={{ zIndex: 1 }}>
        <div className="container mx-auto max-w-6xl-plus px-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="text-center">
                <p dangerouslySetInnerHTML={{ __html: settings.footer_text || '© 2025 Adventhealth - Designed and developed by AIT Architecture team' }}></p>
              </div>
              {((user?.is_admin && databasePathAbsolute) || (databasePath && settings.show_database_path_in_footer !== '0')) && (
                <div className="text-center text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium">Database:</span> <span className="font-mono">
                    {user?.is_admin && databasePathAbsolute ? databasePathAbsolute : databasePath}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="absolute right-4 bottom-6">
          <TimezoneDisplay />
        </div>
      </footer>
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
      {user?.is_admin && (
        <Suspense fallback={null}>
          <StyleManager
            isOpen={styleManagerOpen}
            onClose={() => setStyleManagerOpen(false)}
            onStylesChange={updateStyles}
          />
        </Suspense>
      )}
      <HelpAboutDialog
        isOpen={helpAboutOpen}
        onClose={() => setHelpAboutOpen(false)}
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <SettingsProvider>
        <StyleProvider>
          <AppContent />
        </StyleProvider>
      </SettingsProvider>
    </AuthProvider>
  );
};

export default App;