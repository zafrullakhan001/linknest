import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Tile, Link } from './types';
import { getTiles, saveTiles, createTile, deleteTile, cloneTile } from './services/storageService';
import { settingsService } from './services/settingsService';
import { authService } from './services/authService';
import { Navigation } from './components/Navigation';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { StyleProvider, useStyles } from './contexts/StyleContext';
import { AuthModal } from './components/AuthModal';
import { TimezoneDisplay } from './components/TimezoneDisplay';
import { HelpAboutDialog } from './components/HelpAboutDialog';
import { getDisabledTabsFromSettings } from './services/tabVisibilityService';
import { FloatingClock } from './components/FloatingClock';
import { FloatingPhoneticAlphabet } from './components/FloatingPhoneticAlphabet';
import { PhoneticAlphabet } from './components/PhoneticAlphabet';
import { FloatingNotesWidget } from './components/FloatingNotesWidget';
import { NotesWidget } from './components/NotesWidget';
import { FloatingWeatherWidget } from './components/FloatingWeatherWidget';
import { WeatherWidget } from './components/WeatherWidget';
import { FloatingCalculatorWidget } from './components/FloatingCalculatorWidget';
import { CalculatorWidget } from './components/CalculatorWidget';
import { FloatingPasswordGeneratorWidget } from './components/FloatingPasswordGeneratorWidget';
import { PasswordGeneratorWidget } from './components/PasswordGeneratorWidget';
import { BroadcastBanner } from './components/BroadcastBanner';
import { MaintenancePage } from './components/MaintenancePage';
import { FloatingPageZoomControl } from './components/FloatingPageZoomControl';
import { PageZoomWidget } from './components/PageZoomControl';
import { FloatingThemeWidget } from './components/FloatingThemeWidget';
import { ThemeWidget } from './components/ThemeWidget';
import { FloatingFavOrganizerWidget } from './components/FloatingFavOrganizerWidget';
import { FavOrganizerWidget } from './components/FavOrganizerWidget';
import { themeService } from './services/themeService';

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
  const disabledTabs = useMemo(() => getDisabledTabsFromSettings(settings), [settings?.disabled_tabs]);

  // Footer Details Toggle State
  const [showFooterDetails, setShowFooterDetails] = useState(() => {
    const saved = localStorage.getItem('linknest_show_footer_details');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('linknest_show_footer_details', showFooterDetails.toString());
  }, [showFooterDetails]);

  // Clock Widget Visibility State
  const [showClock, setShowClock] = useState(() => {
    const saved = localStorage.getItem('linknest_show_clock_widget');
    return saved !== null ? saved === 'true' : true; // Default to shown
  });

  useEffect(() => {
    localStorage.setItem('linknest_show_clock_widget', showClock.toString());
  }, [showClock]);

  // Phonetic Alphabet Widget Visibility State
  const [showPhoneticAlphabet, setShowPhoneticAlphabet] = useState(() => {
    const saved = localStorage.getItem('linknest_show_phonetic_alphabet');
    return saved !== null ? saved === 'true' : false; // Default to hidden
  });

  useEffect(() => {
    localStorage.setItem('linknest_show_phonetic_alphabet', showPhoneticAlphabet.toString());
  }, [showPhoneticAlphabet]);

  // Notes Widget Visibility State (only for logged in users)
  const [showNotes, setShowNotes] = useState(() => {
    const saved = localStorage.getItem('linknest_show_notes_widget');
    return saved !== null ? saved === 'true' : false; // Default to hidden
  });

  useEffect(() => {
    localStorage.setItem('linknest_show_notes_widget', showNotes.toString());
  }, [showNotes]);

  // Weather Widget Visibility State
  const [showWeather, setShowWeather] = useState(() => {
    const saved = localStorage.getItem('linknest_show_weather_widget');
    return saved !== null ? saved === 'true' : false; // Default to hidden
  });

  useEffect(() => {
    localStorage.setItem('linknest_show_weather_widget', showWeather.toString());
  }, [showWeather]);

  // Calculator Widget Visibility State
  const [showCalculator, setShowCalculator] = useState(() => {
    const saved = localStorage.getItem('linknest_show_calculator_widget');
    return saved !== null ? saved === 'true' : false; // Default to hidden
  });

  useEffect(() => {
    localStorage.setItem('linknest_show_calculator_widget', showCalculator.toString());
  }, [showCalculator]);

  // Password Generator Widget Visibility State
  const [showPasswordGenerator, setShowPasswordGenerator] = useState(() => {
    const saved = localStorage.getItem('linknest_show_password_generator_widget');
    return saved !== null ? saved === 'true' : false; // Default to hidden
  });

  useEffect(() => {
    localStorage.setItem('linknest_show_password_generator_widget', showPasswordGenerator.toString());
  }, [showPasswordGenerator]);

  // Page Zoom Control Widget Visibility State
  const [showZoomControl, setShowZoomControl] = useState(() => {
    const saved = localStorage.getItem('linknest_show_zoom_control_widget');
    return saved !== null ? saved === 'true' : false; // Default to hidden
  });

  useEffect(() => {
    localStorage.setItem('linknest_show_zoom_control_widget', showZoomControl.toString());
  }, [showZoomControl]);

  // Theme Widget Visibility State
  const [showTheme, setShowTheme] = useState(() => {
    const saved = localStorage.getItem('linknest_show_theme_widget');
    return saved !== null ? saved === 'true' : false; // Default to hidden
  });

  useEffect(() => {
    localStorage.setItem('linknest_show_theme_widget', showTheme.toString());
  }, [showTheme]);

  // Fav Organizer Widget Visibility State
  const [showFavOrganizer, setShowFavOrganizer] = useState(() => {
    const saved = localStorage.getItem('linknest_show_fav_organizer_widget');
    return saved !== null ? saved === 'true' : false; // Default to hidden
  });

  useEffect(() => {
    localStorage.setItem('linknest_show_fav_organizer_widget', showFavOrganizer.toString());
  }, [showFavOrganizer]);

  // Initialize theme service on mount
  useEffect(() => {
    themeService.initialize();
  }, []);

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

  const toggleClock = () => {
    setShowClock(!showClock);
  };

  const togglePhoneticAlphabet = () => {
    setShowPhoneticAlphabet(!showPhoneticAlphabet);
  };

  const toggleNotes = () => {
    setShowNotes(!showNotes);
  };

  const toggleWeather = () => {
    setShowWeather(!showWeather);
  };

  const toggleCalculator = () => {
    setShowCalculator(!showCalculator);
  };

  const togglePasswordGenerator = () => {
    setShowPasswordGenerator(!showPasswordGenerator);
  };

  const toggleZoomControl = () => {
    setShowZoomControl(!showZoomControl);
  };

  const toggleThemeWidget = () => {
    setShowTheme(!showTheme);
  };

  const toggleFavOrganizer = () => {
    setShowFavOrganizer(!showFavOrganizer);
  };

  const handleTabClick = (tab: string) => {
    // Respect admin-configured disabled tabs (applies to everyone, including admins)
    const tabId = String(tab || '').toLowerCase().trim();
    if (tabId === 'favorites' && disabledTabs.has('favorites')) return;
    if (tabId === 'public' && disabledTabs.has('public')) return;
    if (tabId === 'private' && disabledTabs.has('private')) return;
    if (tabId === 'scheduled' && disabledTabs.has('scheduled')) return;
    if (tabId === 'expired' && disabledTabs.has('expired')) return;
    if (tabId === 'archive' && disabledTabs.has('archive')) return;
    if (tabId === 'recycle-bin' && disabledTabs.has('recycle-bin')) return;
    if (tabId === 'monitoring' && disabledTabs.has('monitoring')) return;

    // If we're not on the main grid, go there first
    if (window.location.hash !== '#/' && window.location.hash !== '') {
      window.location.hash = '#/';
      // Give it a tiny bit of time for TileGrid to mount
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('switchTab', { detail: tab }));
      }, 100);
    } else {
      window.dispatchEvent(new CustomEvent('switchTab', { detail: tab }));
    }
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


  // Check maintenance mode - show maintenance page if enabled and user is not admin
  const maintenanceEnabled = settings?.maintenance_enabled === '1';
  const isAdmin = user?.is_admin === true;

  if (maintenanceEnabled && !isAdmin && !authLoading && !settingsLoading) {
    return (
      <>
        <MaintenancePage
          message={settings?.maintenance_message || 'The application is currently undergoing maintenance. Please check back later.'}
          appName={settings?.app_name || 'Application'}
          showAdminLogin={!isAuthenticated}
          onAdminLogin={() => setAuthModalOpen(true)}
        />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
        />
      </>
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
      if (disabledTabs.has('admin')) {
        content = (
          <div className="w-full max-w-2xl mx-auto">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Admin Panel Disabled</h2>
              <p className="text-slate-600 dark:text-slate-400">
                This feature has been disabled by your administrator.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => (window.location.hash = '#/')}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold transition-colors"
                >
                  Back to Home
                </button>
              </div>
            </div>
          </div>
        );
      } else {
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
      }
    } else {
      window.location.hash = '#/';
      content = null;
    }
  } else if (route.startsWith('#/tile/')) {
    // Parse tile ID and optional 'from' query parameter
    const tilePath = route.split('/tile/')[1];
    const [tileId, queryString] = tilePath.split('?');
    const urlParams = new URLSearchParams(queryString || '');
    const sourceTab = urlParams.get('from') || null;
    
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
            sourceTab={sourceTab as 'public' | 'your-apps' | 'private' | 'favorites' | 'public-favorites' | null}
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
        showClock={showClock}
        toggleClock={toggleClock}
        showPhoneticAlphabet={showPhoneticAlphabet}
        togglePhoneticAlphabet={togglePhoneticAlphabet}
        showNotes={showNotes}
        toggleNotes={toggleNotes}
        showWeather={showWeather}
        toggleWeather={toggleWeather}
        showCalculator={showCalculator}
        toggleCalculator={toggleCalculator}
        showPasswordGenerator={showPasswordGenerator}
        togglePasswordGenerator={togglePasswordGenerator}
        showZoomControl={showZoomControl}
        toggleZoomControl={toggleZoomControl}
        showTheme={showTheme}
        toggleThemeWidget={toggleThemeWidget}
        showFavOrganizer={showFavOrganizer}
        toggleFavOrganizer={toggleFavOrganizer}
        user={user}
        onLoginClick={() => setAuthModalOpen(true)}
        onHelpClick={() => setHelpAboutOpen(true)}
      />
      {user?.impersonating && (
        <div className="bg-amber-500 dark:bg-amber-600 text-white px-4 py-3 flex items-center justify-between border-b border-amber-600 dark:border-amber-700">
          <div className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0">
              <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-3.385-.572zM16 8a2 2 0 11-4 0 2 2 0 014 0zm-1.615 8.428a1.224 1.224 0 00.569-1.175 5.966 5.966 0 00-2.081-.416 5.967 5.967 0 00-1.788.27A9.953 9.953 0 0013 18a9.953 9.953 0 003.385-.572z" />
            </svg>
            <span className="font-medium">
              You are viewing the app as <strong>{user.username}</strong> (Impersonated by {user.impersonating_admin_username})
            </span>
          </div>
          <button
            onClick={async () => {
              try {
                await authService.stopImpersonation();
                window.location.reload();
              } catch (error) {
                console.error('Failed to stop impersonation:', error);
                alert('Failed to stop impersonation. Please refresh the page.');
              }
            }}
            className="px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            Stop Impersonation
          </button>
        </div>
      )}
      <BroadcastBanner />
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
      <footer className={`linknest-footer ${showFooterDetails ? 'py-8' : 'py-4'} text-sm relative border-t border-slate-200 dark:border-slate-800 transition-all duration-300`} style={{ zIndex: 0 }}>
        <div className="container mx-auto max-w-6xl-plus px-4">
          <div className="flex flex-col items-center gap-6">
            {/* Quick Navigation Links */}
            <div className={`flex flex-wrap justify-center items-center gap-x-8 gap-y-4 text-slate-500 dark:text-slate-400 ${!showFooterDetails ? 'mb-0' : ''}`}>
              {!disabledTabs.has('public') && (
                <button
                  onClick={() => handleTabClick('public')}
                  className="hover:text-brand-600 dark:hover:text-brand-400 transition-colors flex items-center gap-1.5 font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                    <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                  Public
                </button>
              )}

              {!disabledTabs.has('favorites') && (
                <button
                  onClick={() => handleTabClick('favorites')}
                  className="hover:text-amber-500 transition-colors flex items-center gap-1.5 font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                  </svg>
                  Favorites
                </button>
              )}

              {isAuthenticated && (
                <>
                  {!disabledTabs.has('private') && (
                    <button
                      onClick={() => handleTabClick('private')}
                      className="hover:text-violet-500 transition-colors flex items-center gap-1.5 font-medium"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                      </svg>
                      Private
                    </button>
                  )}

                  {!disabledTabs.has('monitoring') && (
                    <button
                      onClick={() => handleTabClick('monitoring')}
                      className="hover:text-emerald-500 transition-colors flex items-center gap-1.5 font-medium"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                      </svg>
                      Monitoring
                    </button>
                  )}

                  {!disabledTabs.has('scheduled') && (
                    <button
                      onClick={() => handleTabClick('scheduled')}
                      className="hover:text-blue-500 transition-colors flex items-center gap-1.5 font-medium"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                      </svg>
                      Scheduled
                    </button>
                  )}

                  {!disabledTabs.has('expired') && (
                    <button
                      onClick={() => handleTabClick('expired')}
                      className="hover:text-orange-500 transition-colors flex items-center gap-1.5 font-medium"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                      </svg>
                      Expired
                    </button>
                  )}

                  {!disabledTabs.has('archive') && (
                    <button
                      onClick={() => handleTabClick('archive')}
                      className="hover:text-amber-600 transition-colors flex items-center gap-1.5 font-medium"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
                        <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.801a2 2 0 01-1.99-1.79L2 7.5zm5.22 1.22a.75.75 0 011.06 0L10 10.94l1.72-1.22a.75.75 0 111.06 1.06L11 12.06l1.72 1.22a.75.75 0 11-1.06 1.06L10 13.06l-1.72 1.22a.75.75 0 01-1.06-1.06L9 12.06l-1.72-1.22a.75.75 0 010-1.06z" clipRule="evenodd" />
                      </svg>
                      Archive
                    </button>
                  )}

                  {!disabledTabs.has('recycle-bin') && (
                    <button
                      onClick={() => handleTabClick('recycle-bin')}
                      className="hover:text-red-500 transition-colors flex items-center gap-1.5 font-medium"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                      </svg>
                      Recycle Bin
                    </button>
                  )}
                </>
              )}

              {/* Toggle Footer Details Button */}
              <button
                onClick={() => setShowFooterDetails(!showFooterDetails)}
                className={`p-1.5 rounded-full transition-all flex items-center justify-center ${showFooterDetails ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-brand-500' : 'bg-brand-50 dark:bg-brand-900/30 text-brand-500 hover:bg-brand-100 dark:hover:bg-brand-900/50'}`}
                title={showFooterDetails ? "Hide footer details" : "Show footer details"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform duration-300 ${showFooterDetails ? 'rotate-180' : ''}`}>
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {showFooterDetails && (
              <div className="flex-1 min-w-0 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="text-center text-slate-500 dark:text-slate-400">
                  <p
                    className="font-medium"
                    dangerouslySetInnerHTML={{ __html: settings.footer_text || '© 2025 Adventhealth - Designed and developed by AIT Architecture team' }}
                  ></p>
                </div>
                {((user?.is_admin && databasePathAbsolute) || (databasePath && settings.show_database_path_in_footer !== '0')) && (
                  <div className="text-center text-xs text-slate-400 dark:text-slate-500">
                    <div className="inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700/50 shadow-sm">
                      <span className="font-semibold text-[10px] uppercase tracking-wider opacity-70">Database</span>
                      <span className="h-3 w-px bg-slate-300 dark:bg-slate-700"></span>
                      <span className="font-mono">{user?.is_admin && databasePathAbsolute ? databasePathAbsolute : databasePath}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </footer>
      {showClock && (
        <FloatingClock>
          <TimezoneDisplay onClose={toggleClock} />
        </FloatingClock>
      )}
      {showPhoneticAlphabet && (
        <FloatingPhoneticAlphabet>
          <PhoneticAlphabet onClose={togglePhoneticAlphabet} />
        </FloatingPhoneticAlphabet>
      )}
      {isAuthenticated && showNotes && (
        <FloatingNotesWidget>
          <NotesWidget onClose={toggleNotes} />
        </FloatingNotesWidget>
      )}
      {showWeather && (
        <FloatingWeatherWidget>
          <WeatherWidget onClose={toggleWeather} />
        </FloatingWeatherWidget>
      )}
      {showCalculator && (
        <FloatingCalculatorWidget>
          <CalculatorWidget onClose={toggleCalculator} />
        </FloatingCalculatorWidget>
      )}
      {showPasswordGenerator && (
        <FloatingPasswordGeneratorWidget>
          <PasswordGeneratorWidget onClose={togglePasswordGenerator} />
        </FloatingPasswordGeneratorWidget>
      )}
      {showZoomControl && (
        <FloatingPageZoomControl onClose={toggleZoomControl}>
          <PageZoomWidget />
        </FloatingPageZoomControl>
      )}
      {showTheme && (
        <FloatingThemeWidget onClose={toggleThemeWidget}>
          <ThemeWidget onClose={toggleThemeWidget} />
        </FloatingThemeWidget>
      )}
      {showFavOrganizer && (
        <FloatingFavOrganizerWidget>
          <FavOrganizerWidget onClose={toggleFavOrganizer} />
        </FloatingFavOrganizerWidget>
      )}
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