import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Tile, Link } from './types';
import { getTiles, getTile, saveTiles, createTile, deleteTile, cloneTile, toSummaryTile } from './services/storageService';
import { settingsService } from './services/settingsService';
import { authService } from './services/authService';
import { Navigation } from './components/Navigation';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider, useSettings, readBrandingCache } from './contexts/SettingsContext';
import { StyleProvider, useStyles } from './contexts/StyleContext';
import { AuthModal } from './components/AuthModal';
import { getDisabledTabsFromSettings } from './services/tabVisibilityService';
import { MaintenancePage } from './components/MaintenancePage';
import { BroadcastBanner } from './components/BroadcastBanner';
import {
  OPEN_SSH_TERMINAL_EVENT,
  type OpenSshTerminalDetail,
} from './utils/sshLink';
import {
  OPEN_VNC_VIEWER_EVENT,
  type OpenVncViewerDetail,
} from './utils/vncLink';
import { themeService } from './services/themeService';
import {
  getMsUntilNextThemeChange,
  getThemeMode,
  getThemeSchedule,
  persistAppliedTheme,
  resolveDarkMode,
  shouldBeDarkNow,
  subscribeThemePreference,
} from './services/themePreferenceService';
import { getMessages } from './services/chatService';
import { useMobile } from './hooks/useMobile';
import { getAllowedWidgets } from './services/widgetService';
import { performanceAnalyticsService } from './services/performanceAnalyticsService';

// Lazy load heavy components for better initial load performance
const TileGrid = lazy(() => import('./components/TileGrid').then(m => ({ default: m.TileGrid })));
const TileDetail = lazy(() => import('./components/TileDetail').then(m => ({ default: m.TileDetail })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));
const StyleManager = lazy(() => import('./components/StyleManager').then(m => ({ default: m.StyleManager })));
const PageBackgroundDialog = lazy(() => import('./components/PageBackgroundDialog').then(m => ({ default: m.PageBackgroundDialog })));
const HelpAboutDialog = lazy(() => import('./components/HelpAboutDialog').then(m => ({ default: m.HelpAboutDialog })));
const CelebrationEffects = lazy(() => import('./components/CelebrationEffects').then(m => ({ default: m.CelebrationEffects })));
const WidgetQuickAccess = lazy(() => import('./components/WidgetQuickAccess').then(m => ({ default: m.WidgetQuickAccess })));
const FloatingWidgetQuickAccess = lazy(() => import('./components/FloatingWidgetQuickAccess').then(m => ({ default: m.FloatingWidgetQuickAccess })));
const FloatingClock = lazy(() => import('./components/FloatingClock').then(m => ({ default: m.FloatingClock })));
const TimezoneDisplay = lazy(() => import('./components/TimezoneDisplay').then(m => ({ default: m.TimezoneDisplay })));
const FloatingPhoneticAlphabet = lazy(() => import('./components/FloatingPhoneticAlphabet').then(m => ({ default: m.FloatingPhoneticAlphabet })));
const PhoneticAlphabet = lazy(() => import('./components/PhoneticAlphabet').then(m => ({ default: m.PhoneticAlphabet })));
const FloatingNotesWidget = lazy(() => import('./components/FloatingNotesWidget').then(m => ({ default: m.FloatingNotesWidget })));
const NotesWidget = lazy(() => import('./components/NotesWidget').then(m => ({ default: m.NotesWidget })));
const FloatingWeatherWidget = lazy(() => import('./components/FloatingWeatherWidget').then(m => ({ default: m.FloatingWeatherWidget })));
const WeatherWidget = lazy(() => import('./components/WeatherWidget').then(m => ({ default: m.WeatherWidget })));
const FloatingCalculatorWidget = lazy(() => import('./components/FloatingCalculatorWidget').then(m => ({ default: m.FloatingCalculatorWidget })));
const CalculatorWidget = lazy(() => import('./components/CalculatorWidget').then(m => ({ default: m.CalculatorWidget })));
const FloatingPasswordGeneratorWidget = lazy(() => import('./components/FloatingPasswordGeneratorWidget').then(m => ({ default: m.FloatingPasswordGeneratorWidget })));
const PasswordGeneratorWidget = lazy(() => import('./components/PasswordGeneratorWidget').then(m => ({ default: m.PasswordGeneratorWidget })));
const FloatingPageZoomControl = lazy(() => import('./components/FloatingPageZoomControl').then(m => ({ default: m.FloatingPageZoomControl })));
const PageZoomWidget = lazy(() => import('./components/PageZoomControl').then(m => ({ default: m.PageZoomWidget })));
const FloatingThemeWidget = lazy(() => import('./components/FloatingThemeWidget').then(m => ({ default: m.FloatingThemeWidget })));
const ThemeWidget = lazy(() => import('./components/ThemeWidget').then(m => ({ default: m.ThemeWidget })));
const FloatingFavOrganizerWidget = lazy(() => import('./components/FloatingFavOrganizerWidget').then(m => ({ default: m.FloatingFavOrganizerWidget })));
const FavOrganizerWidget = lazy(() => import('./components/FavOrganizerWidget').then(m => ({ default: m.FavOrganizerWidget })));
const FloatingChatWidget = lazy(() => import('./components/FloatingChatWidget').then(m => ({ default: m.FloatingChatWidget })));
const ChatWidget = lazy(() => import('./components/ChatWidget').then(m => ({ default: m.ChatWidget })));
const FloatingSnakeGameWidget = lazy(() => import('./components/FloatingSnakeGameWidget').then(m => ({ default: m.FloatingSnakeGameWidget })));
const SnakeGameWidget = lazy(() => import('./components/SnakeGameWidget').then(m => ({ default: m.SnakeGameWidget })));
const FloatingVncViewerWidget = lazy(() => import('./components/FloatingVncViewerWidget').then(m => ({ default: m.FloatingVncViewerWidget })));
const VncViewerWidget = lazy(() => import('./components/VncViewerWidget').then(m => ({ default: m.VncViewerWidget })));
const FloatingSshTerminalWidget = lazy(() => import('./components/FloatingSshTerminalWidget').then(m => ({ default: m.FloatingSshTerminalWidget })));
const SshTerminalWidget = lazy(() => import('./components/SshTerminalWidget').then(m => ({ default: m.SshTerminalWidget })));

function hasLikelySession(): boolean {
  try {
    // HttpOnly session cookies are invisible here; this only helps when the
    // cookie is readable. Names are instance-scoped (LNSESSArchLinks, …).
    return /(?:^|; )(?:PHPSESSID|LNSESS[A-Za-z0-9]+)=/.test(document.cookie);
  } catch {
    return false;
  }
}

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
  const [pageBackgroundDialogOpen, setPageBackgroundDialogOpen] = useState(false);
  const [helpAboutOpen, setHelpAboutOpen] = useState(false);
  const [authRequired, setAuthRequired] = useState(false); // Track if we got 401 error
  const didAutoOpenLoginRef = useRef(false); // Avoid re-opening login when user closed it (guest disabled)
  const celebrationContainerRef = useRef<HTMLDivElement>(null);
  const [databasePath, setDatabasePath] = useState<string>('');
  const [databasePathAbsolute, setDatabasePathAbsolute] = useState<string>('');
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const { updateStyles, styles } = useStyles();
  const { settings, loading: settingsLoading } = useSettings();
  const disabledTabs = useMemo(() => getDisabledTabsFromSettings(settings), [settings?.disabled_tabs]);
  const isMobile = useMobile(768); // Hide widgets on mobile devices (below 768px width)
  
  // Allowed widgets state (for role-based widget filtering)
  const [allowedWidgetIds, setAllowedWidgetIds] = useState<Set<string>>(new Set());
  const [widgetsLoading, setWidgetsLoading] = useState(false);

  // Full space detail (home list is summary-only; detail always loads GET /tiles/{id})
  const [detailTile, setDetailTile] = useState<Tile | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

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

  // Chat Widget Visibility State (only for logged in users)
  const [showChat, setShowChat] = useState(() => {
    const saved = localStorage.getItem('linknest_show_chat_widget');
    return saved !== null ? saved === 'true' : false; // Default to hidden
  });

  useEffect(() => {
    localStorage.setItem('linknest_show_chat_widget', showChat.toString());
  }, [showChat]);

  // Snake Game Widget Visibility State
  const [showSnakeGame, setShowSnakeGame] = useState(() => {
    const saved = localStorage.getItem('linknest_show_snake_game_widget');
    return saved !== null ? saved === 'true' : false; // Default to hidden
  });

  useEffect(() => {
    localStorage.setItem('linknest_show_snake_game_widget', showSnakeGame.toString());
  }, [showSnakeGame]);

  // VNC Viewer Widget Visibility State
  const [showVncViewer, setShowVncViewer] = useState(() => {
    const saved = localStorage.getItem('linknest_show_vnc_viewer_widget');
    return saved !== null ? saved === 'true' : false;
  });
  const [vncPendingOpen, setVncPendingOpen] = useState<(OpenVncViewerDetail & { requestId: number }) | null>(null);

  useEffect(() => {
    localStorage.setItem('linknest_show_vnc_viewer_widget', showVncViewer.toString());
  }, [showVncViewer]);

  // SSH Terminal Widget Visibility State
  const [showSshTerminal, setShowSshTerminal] = useState(() => {
    const saved = localStorage.getItem('linknest_show_ssh_terminal_widget');
    return saved !== null ? saved === 'true' : false;
  });
  const [sshPendingOpen, setSshPendingOpen] = useState<(OpenSshTerminalDetail & { requestId: number }) | null>(null);

  useEffect(() => {
    localStorage.setItem('linknest_show_ssh_terminal_widget', showSshTerminal.toString());
  }, [showSshTerminal]);

  // Chat unread messages state
  const [hasUnreadChatMessages, setHasUnreadChatMessages] = useState(false);

  // Widget Quick Access Menu State
  const [showWidgetQuickAccess, setShowWidgetQuickAccess] = useState(false);

  // Poll for unread messages when widget is closed
  useEffect(() => {
    if (!isAuthenticated || showChat || !user) return;

    const checkUnreadMessages = async () => {
      try {
        const messages = await getMessages(1, 0, null); // Get latest message
        if (messages.length > 0) {
          const lastSeenId = parseInt(localStorage.getItem(`linknest_last_seen_message_${user.id}`) || '0', 10);
          const hasUnread = messages.some(msg =>
            msg.user_id !== user.id &&
            msg.id > lastSeenId
          );
          setHasUnreadChatMessages(hasUnread);
        }
      } catch (error) {
        // Silently fail - don't spam console
      }
    };

    // Check shortly after first paint, then poll
    const startDelay = window.setTimeout(() => {
      checkUnreadMessages();
    }, 4000);
    const interval = setInterval(checkUnreadMessages, 15000);
    return () => {
      window.clearTimeout(startDelay);
      clearInterval(interval);
    };
  }, [isAuthenticated, showChat, user]);

  // Initialize theme service on mount
  useEffect(() => {
    themeService.initialize();
  }, []);

  // Performance Analytics: capture location after first paint so it never delays the grid
  useEffect(() => {
    const run = () => {
      void (async () => {
        try {
          const cfg = await performanceAnalyticsService.getConfig();
          if (!cfg.enabled) return;
          await performanceAnalyticsService.ensureLocation(cfg, { allowPrompt: true });
        } catch {
          // ignore - analytics must never affect app UX
        }
      })();
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof idle === 'function') {
      const id = idle(run, { timeout: 4000 });
      return () => {
        const cancel = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        if (typeof cancel === 'function') cancel(id);
      };
    }
    const t = window.setTimeout(run, 2000);
    return () => window.clearTimeout(t);
  }, [isAuthenticated]);

  // Fetch allowed widgets when user logs in or auth state changes
  useEffect(() => {
    const fetchAllowedWidgets = async () => {
      // Admins get all widgets
      if (isAuthenticated && user?.is_admin) {
        setAllowedWidgetIds(new Set([
          'clock', 'weather', 'calculator', 'notes', 'password-generator',
          'phonetic-alphabet', 'zoom-control', 'theme', 'fav-organizer',
          'chat', 'snake-game', 'vnc-viewer', 'ssh-terminal'
        ]));
        setWidgetsLoading(false);
        return;
      }

      // Guests and authenticated non-admins: load from role permissions
      // (guests use the designated Public/is_guest role via the API)
      try {
        setWidgetsLoading(true);
        const allowedWidgets = await getAllowedWidgets();
        const widgetIds = new Set(allowedWidgets.map(w => w.id));
        setAllowedWidgetIds(widgetIds);
      } catch (error) {
        console.error('Failed to fetch allowed widgets:', error);
        // On error, show no widgets (strict security)
        setAllowedWidgetIds(new Set());
      } finally {
        setWidgetsLoading(false);
      }
    };

    fetchAllowedWidgets();
  }, [isAuthenticated, user]);

  // Helper function to check if a widget is allowed
  const isWidgetAllowed = useCallback((widgetId: string): boolean => {
    // Auth-only widgets are never available to guests
    if ((!isAuthenticated || !user) && ['notes', 'chat', 'fav-organizer'].includes(widgetId)) {
      return false;
    }

    // Admins can see all widgets
    if (user?.is_admin) return true;

    // During loading, don't show any widgets (prevent flickering)
    if (widgetsLoading) {
      return false;
    }

    return allowedWidgetIds.has(widgetId);
  }, [isAuthenticated, user, allowedWidgetIds, widgetsLoading]);

  // Theme State — keep in sync with index.html bootstrap + browser-only preferences
  const [darkMode, setDarkMode] = useState(() => {
    const isDark = resolveDarkMode();
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDark);
    }
    return isDark;
  });
  const [themeMode, setThemeModeState] = useState(() => getThemeMode());
  const [themeSchedule, setThemeScheduleState] = useState(() => getThemeSchedule());

  const darkModeRef = useRef(darkMode);
  useEffect(() => {
    darkModeRef.current = darkMode;
  }, [darkMode]);

  useEffect(() => {
    return subscribeThemePreference(() => {
      setThemeModeState(getThemeMode());
      setThemeScheduleState(getThemeSchedule());
      setDarkMode(resolveDarkMode());
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    persistAppliedTheme(darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (themeMode !== 'automatic') {
      return;
    }

    const checkAndUpdateTheme = () => {
      const shouldBeDark = shouldBeDarkNow(new Date(), themeSchedule);
      if (shouldBeDark !== darkModeRef.current) {
        setDarkMode(shouldBeDark);
      }
    };

    checkAndUpdateTheme();

    let timeoutId: number;
    const scheduleNextCheck = () => {
      const delay = getMsUntilNextThemeChange(new Date(), themeSchedule);
      timeoutId = window.setTimeout(() => {
        checkAndUpdateTheme();
        scheduleNextCheck();
      }, delay);
    };
    scheduleNextCheck();

    const intervalId = window.setInterval(checkAndUpdateTheme, 60 * 1000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [themeMode, themeSchedule]);

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

  // Open SSH Terminal from ssh:// (or auto://) space links
  useEffect(() => {
    const handleOpenSshTerminal = (ev: Event) => {
      const detail = (ev as CustomEvent<OpenSshTerminalDetail>).detail;
      if (!detail?.host) return;

      if (isMobile) {
        window.alert('SSH Terminal is available on desktop view.');
        return;
      }
      if (!isWidgetAllowed('ssh-terminal')) {
        window.alert('SSH Terminal widget is not enabled for your account.');
        return;
      }
      if (!isAuthenticated) {
        setAuthModalOpen(true);
        return;
      }

      setShowSshTerminal(true);
      setSshPendingOpen({
        ...detail,
        requestId: Date.now(),
      });
    };

    window.addEventListener(OPEN_SSH_TERMINAL_EVENT, handleOpenSshTerminal);
    return () => {
      window.removeEventListener(OPEN_SSH_TERMINAL_EVENT, handleOpenSshTerminal);
    };
  }, [isMobile, isAuthenticated, isWidgetAllowed]);

  // Open VNC Viewer from vnc:// (or auto-vnc://) space links
  useEffect(() => {
    const handleOpenVncViewer = (ev: Event) => {
      const detail = (ev as CustomEvent<OpenVncViewerDetail>).detail;
      if (!detail?.host) return;

      if (isMobile) {
        window.alert('VNC Viewer is available on desktop view.');
        return;
      }
      if (!isWidgetAllowed('vnc-viewer')) {
        window.alert('VNC Viewer widget is not enabled for your account.');
        return;
      }
      if (!isAuthenticated) {
        setAuthModalOpen(true);
        return;
      }

      setShowVncViewer(true);
      setVncPendingOpen({
        ...detail,
        requestId: Date.now(),
      });
    };

    window.addEventListener(OPEN_VNC_VIEWER_EVENT, handleOpenVncViewer);
    return () => {
      window.removeEventListener(OPEN_VNC_VIEWER_EVENT, handleOpenVncViewer);
    };
  }, [isMobile, isAuthenticated, isWidgetAllowed]);

  // Listen for page background dialog (admin only)
  useEffect(() => {
    const handleOpenPageBackground = () => {
      if (user?.is_admin) setPageBackgroundDialogOpen(true);
    };
    window.addEventListener('openPageBackgroundDialog', handleOpenPageBackground);
    return () => window.removeEventListener('openPageBackgroundDialog', handleOpenPageBackground);
  }, [user?.is_admin]);

  // Keyboard shortcut for widget quick access (Ctrl+Shift+U or Cmd+Shift+U)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in an input field (don't interfere)
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        (target as HTMLInputElement).type === 'search'
      ) {
        return;
      }

      // Ctrl+Shift+Y (Windows/Linux) or Cmd+Shift+Y (Mac) - Widgets menu
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        e.stopPropagation();
        setShowWidgetQuickAccess((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true); // Use capture phase to intercept before browser
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

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

  const toggleChat = () => {
    setShowChat(!showChat);
  };

  const toggleSnakeGame = () => {
    setShowSnakeGame(!showSnakeGame);
  };

  const toggleVncViewer = () => {
    setShowVncViewer(!showVncViewer);
  };

  const toggleSshTerminal = () => {
    if (showSshTerminal) {
      // Ask the widget to confirm / kill live sessions before hiding
      window.dispatchEvent(new CustomEvent('requestCloseSshTerminal'));
      return;
    }
    setShowSshTerminal(true);
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

  // Load tiles as soon as we know session state — do not wait for settings/styles APIs
  useEffect(() => {
    // Reset auth required flag when user logs in
    if (isAuthenticated) {
      setAuthRequired(false);
    }

    if (authLoading && hasLikelySession()) {
      return;
    }

    // Don't load data if guest access is disabled and user is not authenticated
    if (!guestAccessEnabled && !isAuthenticated && !settingsLoading) {
      setLoading(false);
      setTiles([]);
      setAuthRequired(true);
      return;
    }

    let cancelled = false;
    const loadData = async () => {
      try {
        const stored = await getTiles();
        if (cancelled) return;
        setTiles(stored);
        setAuthRequired(false);
      } catch (error: any) {
        if (cancelled) return;
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
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (guestAccessEnabled || isAuthenticated || settingsLoading) {
      loadData();
    }

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, guestAccessEnabled, settingsLoading, authLoading]);

  // Allow widgets (e.g. SSH → create private space) to refresh the dashboard tile list
  useEffect(() => {
    const onRefresh = () => {
      void getTiles()
        .then((stored) => setTiles(stored))
        .catch((err) => console.error('Failed to refresh tiles:', err));
    };
    window.addEventListener('linknest-tiles-refresh', onRefresh);
    return () => window.removeEventListener('linknest-tiles-refresh', onRefresh);
  }, []);

  // Load database path only when the footer would show it
  useEffect(() => {
    if (!showFooterDetails && !isMobile) {
      return;
    }
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
  }, [showFooterDetails, isMobile]);

  // Fetch full tile when opening #/tile/id (home list is card summary only)
  useEffect(() => {
    if (!route.startsWith('#/tile/')) {
      setDetailTile(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }
    const tilePath = route.split('/tile/')[1];
    const [tileId] = (tilePath || '').split('?');
    if (!tileId) {
      setDetailTile(null);
      setDetailLoading(false);
      setDetailError('Space not found.');
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    getTile(tileId)
      .then((t) => {
        if (cancelled) return;
        setDetailLoading(false);
        setDetailTile(t || null);
        if (!t) setDetailError('Space not found or you do not have permission to view it.');
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailLoading(false);
          setDetailTile(null);
          setDetailError(err?.message || 'Unable to load this space.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [route, isAuthenticated]);

  // If guest access is disabled and user is not authenticated, we show login dialog (computed here so hooks below run unconditionally).
  // Require !authLoading so we never show/open login until session check has finished (fixes refresh with existing session).
  const shouldShowLoginMessage = (!guestAccessEnabled && !isAuthenticated && !settingsLoading && !authLoading) ||
    (authRequired && !isAuthenticated && !authLoading);

  // Auto-open login dialog once when public view is disabled and user is not authenticated (must be above any early return)
  useEffect(() => {
    if (shouldShowLoginMessage && !didAutoOpenLoginRef.current) {
      didAutoOpenLoginRef.current = true;
      setAuthModalOpen(true);
    }
    if (!shouldShowLoginMessage) {
      didAutoOpenLoginRef.current = false;
    }
  }, [shouldShowLoginMessage]);

  // Close login modal when user becomes authenticated (e.g. after refresh with session, or after successful sign-in)
  useEffect(() => {
    if (isAuthenticated && authModalOpen) {
      setAuthModalOpen(false);
    }
  }, [isAuthenticated, authModalOpen]);

  const handleUpdateTiles = async (
    newTiles: Tile[],
    skipReload: boolean = false,
    isFinal: boolean = false,
    localOnly: boolean = false
  ) => {
    // Home list stays card-sized; never keep nested graphs in App tiles state
    setTiles(newTiles.map(toSummaryTile));

    if (detailTile) {
      const updatedDetail = newTiles.find((t) => t.id === detailTile.id);
      if (updatedDetail) {
        const hasNestedGraph =
          (updatedDetail.tabs?.length ?? 0) > 0 ||
          (updatedDetail.sections?.length ?? 0) > 0 ||
          !!updatedDetail.htmlContent;
        if (hasNestedGraph) {
          setDetailTile(updatedDetail);
        } else {
          // Card-level / message-board refresh: keep nested detail content
          setDetailTile({
            ...detailTile,
            ...updatedDetail,
            tabs: detailTile.tabs,
            sections: detailTile.sections,
            htmlContent: detailTile.htmlContent,
            // Prefer newly saved Message Board when present (including empty clear)
            messages: Array.isArray(updatedDetail.messages)
              ? updatedDetail.messages
              : detailTile.messages,
          });
        }
      }
    }

    if (!isAuthenticated || localOnly) {
      return;
    }

    // Only PUT tiles that include nested content. Summary/card payloads must not
    // be bulk-saved — updateTileInternal deletes tabs/sections and would wipe spaces.
    const tilesToPersist = newTiles.filter(
      (t) =>
        (t.tabs?.length ?? 0) > 0 ||
        (t.sections?.length ?? 0) > 0 ||
        !!t.htmlContent ||
        (t.messages?.length ?? 0) > 0
    );

    try {
      if (tilesToPersist.length > 0) {
        await saveTiles(tilesToPersist, isFinal);
      }

      if (!skipReload) {
        const stored = await getTiles();
        setTiles(stored);
        if (detailTile) {
          const fresh = await getTile(detailTile.id);
          if (fresh) setDetailTile(fresh);
        }
      }
    } catch (error) {
      console.error('Failed to save tiles:', error);
      if (!skipReload) {
        const stored = await getTiles();
        setTiles(stored);
        if (detailTile) {
          const fresh = await getTile(detailTile.id);
          if (fresh) setDetailTile(fresh);
        }
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
      setTiles([...tiles, toSummaryTile(created)]);
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

  // Keep Navigation mounted during load so the top bar does not pop in after the spinner.
  // Do not wait for settings/styles APIs — branding/styles are applied from cache before paint.
  if ((authLoading && hasLikelySession()) || (loading && (isAuthenticated || guestAccessEnabled))) {
    return (
      <div className={`linknest-app-container min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans ${!isMobile ? 'pt-16' : ''}`}>
        {!isMobile && (
          <Navigation
            darkMode={darkMode}
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
            showChat={showChat}
            toggleChat={toggleChat}
            showSnakeGame={showSnakeGame}
            toggleSnakeGame={toggleSnakeGame}
            showVncViewer={showVncViewer}
            toggleVncViewer={toggleVncViewer}
            showSshTerminal={showSshTerminal}
            toggleSshTerminal={toggleSshTerminal}
            hasUnreadChatMessages={hasUnreadChatMessages}
            user={user}
            onLoginClick={() => setAuthModalOpen(true)}
            onHelpClick={() => setHelpAboutOpen(true)}
            isWidgetAllowed={isWidgetAllowed}
          />
        )}
        <BroadcastBanner />
        <div className="flex-grow flex flex-col items-center justify-center gap-4 px-4">
          {(() => {
            const cached = readBrandingCache();
            const brand = settingsLoading && cached ? cached : settings;
            const headerLogo = brand.header_logo_image;
            const logoImage = brand.logo_type === 'image' ? brand.logo_image : '';
            const logoIcon = brand.logo_type !== 'image' ? (brand.logo_icon || '') : '';
            if (headerLogo) {
              return <img src={headerLogo} alt="" className="h-12 max-w-[12rem] object-contain opacity-90" />;
            }
            if (logoImage) {
              return <img src={logoImage} alt="" className="h-12 w-12 rounded-xl object-contain opacity-90" />;
            }
            if (logoIcon) {
              return (
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-2xl shadow-lg">
                  {logoIcon}
                </div>
              );
            }
            return null;
          })()}
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
        </div>
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
        />
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

  if (shouldShowLoginMessage) {
    // Show login dialog (opened by effect above). If user closed it, show minimal fallback to reopen.
    content = (
      <div className="w-full max-w-2xl mx-auto text-center">
        {!authModalOpen && (
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Sign in to access and view all spaces.
          </p>
        )}
        {!authModalOpen && (
          <button
            onClick={() => setAuthModalOpen(true)}
            className="px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold transition-colors inline-flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Sign In
          </button>
        )}
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
          darkMode={darkMode}
          onHelpClick={() => setHelpAboutOpen(true)}
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

    const displayTile = detailTile && detailTile.id === tileId ? detailTile : null;
    const isLoadingDetail = detailLoading || (!displayTile && !detailError);
    const isDetailError = !detailLoading && !!detailError;

    if (displayTile) {
      content = (
        <Suspense fallback={<LoadingFallback />}>
          <TileDetail
            tile={displayTile}
            allTiles={[displayTile, ...tiles.filter((t) => t.id !== displayTile.id)]}
            onUpdateTiles={handleUpdateTiles}
            isAuthenticated={isAuthenticated}
            onAuthRequired={() => setAuthModalOpen(true)}
            sourceTab={sourceTab as 'public' | 'your-apps' | 'private' | 'favorites' | 'public-favorites' | 'staging' | null}
            user={user}
          />
        </Suspense>
      );
    } else if (isDetailError) {
      content = (
        <div className="flex flex-col items-center justify-center min-h-[50vh] px-4">
          <p className="text-slate-600 dark:text-slate-400 mb-4">{detailError}</p>
          <button
            type="button"
            onClick={() => { window.location.hash = '#/'; }}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium"
          >
            Back to Dashboard
          </button>
        </div>
      );
    } else if (isLoadingDetail) {
      content = <LoadingFallback />;
    } else {
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
          darkMode={darkMode}
          onHelpClick={() => setHelpAboutOpen(true)}
        />
      </Suspense>
    );
  }

  return (
    <div className={`linknest-app-container min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-brand-500 selection:text-white transition-colors duration-300 ${!isMobile ? 'pt-16' : ''}`}>
      {/* Hide Navigation (widget bar) on mobile view - fixed so it never scrolls with background/center stage */}
      {!isMobile && (
        <Navigation
          darkMode={darkMode}
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
          showChat={showChat}
          toggleChat={toggleChat}
          showSnakeGame={showSnakeGame}
          toggleSnakeGame={toggleSnakeGame}
          showVncViewer={showVncViewer}
          toggleVncViewer={toggleVncViewer}
          showSshTerminal={showSshTerminal}
          toggleSshTerminal={toggleSshTerminal}
          hasUnreadChatMessages={hasUnreadChatMessages}
            user={user}
            onLoginClick={() => setAuthModalOpen(true)}
            onHelpClick={() => setHelpAboutOpen(true)}
            isWidgetAllowed={isWidgetAllowed}
          />
      )}
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
                const returnTo = sessionStorage.getItem('postImpersonationReturn');
                if (returnTo) {
                  try {
                    const { hash, adminPanelTab } = JSON.parse(returnTo);
                    sessionStorage.removeItem('postImpersonationReturn');
                    if (adminPanelTab) localStorage.setItem('adminPanelActiveTab', adminPanelTab);
                    if (hash) window.location.hash = hash;
                  } catch (_) { /* ignore */ }
                }
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
      <div className="flex-grow relative min-h-0 flex flex-col">
        <div ref={celebrationContainerRef} className={`absolute inset-0 w-full overflow-hidden pointer-events-none ${styles?.celebrationShowOnForeground ? 'z-[9999]' : 'z-0'}`} aria-hidden>
          <Suspense fallback={null}>
            <CelebrationEffects containerRef={celebrationContainerRef} styles={styles} />
          </Suspense>
        </div>
        <main className={`flex-grow mx-auto px-4 py-8 w-full linknest-page-content relative z-10 ${route === '#/admin' ? 'max-w-admin' : 'container max-w-6xl-plus'} ${styles?.backgroundRaised ? 'linknest-page-background' : ''} ${!guestAccessEnabled && !isAuthenticated ? 'flex items-center justify-center' : ''}`}>
          <div className="relative min-h-0">
            {content}
          </div>
        </main>
      </div>
      {!isAuthenticated && guestAccessEnabled && (
        <div className="container mx-auto px-4 max-w-6xl-plus pb-4">
          <div className="p-2.5 bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200/50 dark:border-slate-700/50 rounded-md text-center">
            <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-500 mb-1.5">
              Public Favorites are saved in this browser only. They will not appear on another computer or browser unless you export them here and import the file there.
            </p>
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
      <footer className={`linknest-footer ${(showFooterDetails || isMobile) ? 'py-6 md:py-8' : 'py-3 md:py-4'} text-xs sm:text-sm relative border-t border-slate-200 dark:border-slate-800 transition-all duration-300`} style={{ zIndex: 0 }}>
          <div className="container mx-auto max-w-6xl-plus px-3 sm:px-4">
            <div className="flex flex-col items-center gap-4 sm:gap-6">
              {/* Quick Navigation Links */}
              <div className={`flex flex-wrap justify-center items-center gap-x-3 gap-y-2 sm:gap-x-8 sm:gap-y-4 text-slate-500 dark:text-slate-400 ${!showFooterDetails && !isMobile ? 'mb-0' : ''}`}>
                {!disabledTabs.has('public') && (
                  <button
                    onClick={() => handleTabClick('public')}
                    className="hover:text-brand-600 dark:hover:text-brand-400 transition-colors flex items-center gap-1 sm:gap-1.5 font-medium"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                      <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                    Public
                  </button>
                )}

                {!disabledTabs.has('favorites') && (
                  <button
                    onClick={() => handleTabClick('favorites')}
                    className="hover:text-amber-500 transition-colors flex items-center gap-1 sm:gap-1.5 font-medium"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
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
                        className="hover:text-violet-500 transition-colors flex items-center gap-1 sm:gap-1.5 font-medium"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                          <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                        </svg>
                        Private
                      </button>
                    )}

                    {!disabledTabs.has('monitoring') && (
                      <button
                        onClick={() => handleTabClick('monitoring')}
                        className="hover:text-emerald-500 transition-colors flex items-center gap-1 sm:gap-1.5 font-medium"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                        </svg>
                        Monitoring
                      </button>
                    )}

                    {!disabledTabs.has('scheduled') && (
                      <button
                        onClick={() => handleTabClick('scheduled')}
                        className="hover:text-blue-500 transition-colors flex items-center gap-1 sm:gap-1.5 font-medium"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                        </svg>
                        Scheduled
                      </button>
                    )}

                    {!disabledTabs.has('expired') && (
                      <button
                        onClick={() => handleTabClick('expired')}
                        className="hover:text-orange-500 transition-colors flex items-center gap-1 sm:gap-1.5 font-medium"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                        </svg>
                        Expired
                      </button>
                    )}

                    {!disabledTabs.has('archive') && (
                      <button
                        onClick={() => handleTabClick('archive')}
                        className="hover:text-amber-600 transition-colors flex items-center gap-1 sm:gap-1.5 font-medium"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                          <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
                          <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.801a2 2 0 01-1.99-1.79L2 7.5zm5.22 1.22a.75.75 0 011.06 0L10 10.94l1.72-1.22a.75.75 0 111.06 1.06L11 12.06l1.72 1.22a.75.75 0 11-1.06 1.06L10 13.06l-1.72 1.22a.75.75 0 01-1.06-1.06L9 12.06l-1.72-1.22a.75.75 0 010-1.06z" clipRule="evenodd" />
                        </svg>
                        Archive
                      </button>
                    )}

                    {!disabledTabs.has('recycle-bin') && (
                      <button
                        onClick={() => handleTabClick('recycle-bin')}
                        className="hover:text-red-500 transition-colors flex items-center gap-1 sm:gap-1.5 font-medium"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                        </svg>
                        Recycle Bin
                      </button>
                    )}
                  </>
                )}

                {/* Toggle Footer Details Button — desktop only; mobile always shows text */}
                {!isMobile && (
                  <button
                    onClick={() => setShowFooterDetails(!showFooterDetails)}
                    className={`p-1.5 rounded-full transition-all flex items-center justify-center ${showFooterDetails ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-brand-500' : 'bg-brand-50 dark:bg-brand-900/30 text-brand-500 hover:bg-brand-100 dark:hover:bg-brand-900/50'}`}
                    title={showFooterDetails ? "Hide footer details" : "Show footer details"}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform duration-300 ${showFooterDetails ? 'rotate-180' : ''}`}>
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>

              {(showFooterDetails || isMobile) && (
                <div className="w-full max-w-xl flex flex-col gap-2.5 sm:gap-3 animate-in fade-in slide-in-from-top-2 duration-300 px-1">
                  <div className="text-center text-slate-500 dark:text-slate-400">
                    <p
                      className="font-medium text-[11px] sm:text-sm leading-relaxed break-words [&_a]:underline [&_a]:text-brand-600 dark:[&_a]:text-brand-400"
                      dangerouslySetInnerHTML={{ __html: settings.footer_text || '© 2025 Adventhealth - Designed and developed by AIT Architecture team' }}
                    ></p>
                  </div>
                  {((user?.is_admin && databasePathAbsolute) || (databasePath && settings.show_database_path_in_footer !== '0')) && (
                    <div className="text-center text-[10px] sm:text-xs text-slate-400 dark:text-slate-500">
                      <div className="inline-flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 bg-slate-100 dark:bg-slate-800/50 px-2.5 sm:px-3 py-1.5 rounded-xl sm:rounded-full border border-slate-200 dark:border-slate-700/50 shadow-sm max-w-full">
                        <span className="font-semibold text-[9px] sm:text-[10px] uppercase tracking-wider opacity-70 shrink-0">Database</span>
                        <span className="hidden sm:block h-3 w-px bg-slate-300 dark:bg-slate-700 shrink-0"></span>
                        <span className="font-mono break-all text-left">{user?.is_admin && databasePathAbsolute ? databasePathAbsolute : databasePath}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </footer>
      {/* Hide all widgets on mobile view */}
      {!isMobile && (
        <Suspense fallback={null}>
          {showClock && isWidgetAllowed('clock') && (
            <FloatingClock>
              <TimezoneDisplay onClose={toggleClock} />
            </FloatingClock>
          )}
          {showPhoneticAlphabet && isWidgetAllowed('phonetic-alphabet') && (
            <FloatingPhoneticAlphabet>
              <PhoneticAlphabet onClose={togglePhoneticAlphabet} />
            </FloatingPhoneticAlphabet>
          )}
          {isAuthenticated && showNotes && isWidgetAllowed('notes') && (
            <FloatingNotesWidget>
              <NotesWidget onClose={toggleNotes} />
            </FloatingNotesWidget>
          )}
          {showWeather && isWidgetAllowed('weather') && (
            <FloatingWeatherWidget>
              <WeatherWidget onClose={toggleWeather} />
            </FloatingWeatherWidget>
          )}
          {showCalculator && isWidgetAllowed('calculator') && (
            <FloatingCalculatorWidget>
              <CalculatorWidget onClose={toggleCalculator} />
            </FloatingCalculatorWidget>
          )}
          {showPasswordGenerator && isWidgetAllowed('password-generator') && (
            <FloatingPasswordGeneratorWidget>
              <PasswordGeneratorWidget onClose={togglePasswordGenerator} />
            </FloatingPasswordGeneratorWidget>
          )}
          {showZoomControl && isWidgetAllowed('zoom-control') && (
            <FloatingPageZoomControl onClose={toggleZoomControl}>
              <PageZoomWidget />
            </FloatingPageZoomControl>
          )}
          {showTheme && isWidgetAllowed('theme') && (
            <FloatingThemeWidget onClose={toggleThemeWidget}>
              <ThemeWidget onClose={toggleThemeWidget} />
            </FloatingThemeWidget>
          )}
          {isAuthenticated && showFavOrganizer && isWidgetAllowed('fav-organizer') && (
            <FloatingFavOrganizerWidget onClose={toggleFavOrganizer}>
              <FavOrganizerWidget />
            </FloatingFavOrganizerWidget>
          )}
          {showChat && isAuthenticated && isWidgetAllowed('chat') && (
            <FloatingChatWidget>
              <ChatWidget
                tiles={tiles}
                onClose={toggleChat}
                onUnreadChange={setHasUnreadChatMessages}
                onTileImported={async () => {
                  // Reload tiles after import with a small delay to ensure database save completes
                  try {
                    // Wait a bit for the database transaction to complete
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const stored = await getTiles();
                    setTiles(stored);

                    // Switch to private tab to show the imported tile
                    // Ensure we're on the main grid page first
                    if (window.location.hash !== '#/' && window.location.hash !== '') {
                      window.location.hash = '#/';
                      setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('switchTab', { detail: 'private' }));
                      }, 100);
                    } else {
                      window.dispatchEvent(new CustomEvent('switchTab', { detail: 'private' }));
                    }
                  } catch (error) {
                    console.error('Failed to reload tiles:', error);
                  }
                }}
              />
            </FloatingChatWidget>
          )}
          {showSnakeGame && isWidgetAllowed('snake-game') && (
            <FloatingSnakeGameWidget>
              <SnakeGameWidget onClose={toggleSnakeGame} />
            </FloatingSnakeGameWidget>
          )}
          {showVncViewer && isWidgetAllowed('vnc-viewer') && (
            <FloatingVncViewerWidget key={`vnc-float-${user?.id ?? 'guest'}`}>
              <VncViewerWidget
                key={`vnc-${user?.id ?? 'guest'}`}
                onClose={toggleVncViewer}
                pendingOpen={vncPendingOpen}
                onPendingOpenConsumed={() => setVncPendingOpen(null)}
              />
            </FloatingVncViewerWidget>
          )}
          {showSshTerminal && isWidgetAllowed('ssh-terminal') && (
            <FloatingSshTerminalWidget key={`ssh-float-${user?.id ?? 'guest'}`}>
              <SshTerminalWidget
                key={`ssh-${user?.id ?? 'guest'}`}
                onClose={() => setShowSshTerminal(false)}
                pendingOpen={sshPendingOpen}
                onPendingOpenConsumed={() => setSshPendingOpen(null)}
              />
            </FloatingSshTerminalWidget>
          )}
        </Suspense>
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
      {pageBackgroundDialogOpen && (
        <Suspense fallback={null}>
          <PageBackgroundDialog
            isOpen={pageBackgroundDialogOpen}
            onClose={() => setPageBackgroundDialogOpen(false)}
            styles={styles}
            onApply={updateStyles}
          />
        </Suspense>
      )}
      {helpAboutOpen && (
        <Suspense fallback={null}>
          <HelpAboutDialog
            isOpen={helpAboutOpen}
            onClose={() => setHelpAboutOpen(false)}
          />
        </Suspense>
      )}
      {/* Hide widget quick access on mobile view */}
      {!isMobile && showWidgetQuickAccess && (
        <Suspense fallback={null}>
        <FloatingWidgetQuickAccess>
          <WidgetQuickAccess
            onClose={() => setShowWidgetQuickAccess(false)}
            user={user}
            widgets={[
              {
                id: 'clock',
                name: 'Clock',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                ),
                isVisible: showClock,
                onToggle: toggleClock,
              },
              {
                id: 'weather',
                name: 'Weather',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
                    <path d="M22 10a3 3 0 0 0-3-3h-2.5a2.5 2.5 0 0 0-5 0H12a3 3 0 0 0 0 6h3a2.5 2.5 0 0 0 5 0H22Z"></path>
                  </svg>
                ),
                isVisible: showWeather,
                onToggle: toggleWeather,
              },
              {
                id: 'calculator',
                name: 'Calculator',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <rect x="4" y="2" width="16" height="20" rx="2"></rect>
                    <line x1="8" y1="6" x2="16" y2="6"></line>
                    <line x1="8" y1="10" x2="16" y2="10"></line>
                    <line x1="8" y1="14" x2="16" y2="14"></line>
                    <line x1="8" y1="18" x2="16" y2="18"></line>
                  </svg>
                ),
                isVisible: showCalculator,
                onToggle: toggleCalculator,
              },
              {
                id: 'notes',
                name: 'Notes',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                ),
                isVisible: showNotes,
                onToggle: toggleNotes,
                requiresAuth: true,
              },
              {
                id: 'password-generator',
                name: 'Password Generator',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <rect x="5" y="11" width="14" height="10" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                ),
                isVisible: showPasswordGenerator,
                onToggle: togglePasswordGenerator,
              },
              {
                id: 'phonetic-alphabet',
                name: 'Phonetic Alphabet',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
                    <path d="M8 8h4M8 12h4M8 16h4"></path>
                  </svg>
                ),
                isVisible: showPhoneticAlphabet,
                onToggle: togglePhoneticAlphabet,
              },
              {
                id: 'zoom-control',
                name: 'Zoom Control',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                    <line x1="11" y1="8" x2="11" y2="14"></line>
                    <line x1="8" y1="11" x2="14" y2="11"></line>
                  </svg>
                ),
                isVisible: showZoomControl,
                onToggle: toggleZoomControl,
              },
              {
                id: 'theme',
                name: 'Theme',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <circle cx="13.5" cy="6.5" r=".5"></circle>
                    <circle cx="17.5" cy="10.5" r=".5"></circle>
                    <circle cx="8.5" cy="7.5" r=".5"></circle>
                    <circle cx="6.5" cy="12.5" r=".5"></circle>
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
                  </svg>
                ),
                isVisible: showTheme,
                onToggle: toggleThemeWidget,
              },
              {
                id: 'fav-organizer',
                name: 'Favorite Organizer',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    <path d="M12 2v14"></path>
                    <path d="M8 6h8"></path>
                    <path d="M8 10h8"></path>
                    <path d="M8 14h6"></path>
                  </svg>
                ),
                isVisible: showFavOrganizer,
                onToggle: toggleFavOrganizer,
              },
              {
                id: 'chat',
                name: 'Chat',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                ),
                isVisible: showChat,
                onToggle: toggleChat,
                requiresAuth: true,
              },
              {
                id: 'snake-game',
                name: 'Snake Game',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M2 12h20"></path>
                    <path d="M12 2v20"></path>
                    <path d="M8 8l-4 4 4 4"></path>
                    <path d="M16 8l4 4-4 4"></path>
                  </svg>
                ),
                isVisible: showSnakeGame,
                onToggle: toggleSnakeGame,
              },
              {
                id: 'vnc-viewer',
                name: 'VNC Viewer',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <rect x="2" y="3" width="20" height="14" rx="2"></rect>
                    <path d="M8 21h8"></path>
                    <path d="M12 17v4"></path>
                  </svg>
                ),
                isVisible: showVncViewer,
                onToggle: toggleVncViewer,
              },
              {
                id: 'ssh-terminal',
                name: 'SSH Terminal',
                icon: (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <polyline points="4 17 10 11 4 5"></polyline>
                    <line x1="12" y1="19" x2="20" y2="19"></line>
                  </svg>
                ),
                isVisible: showSshTerminal,
                onToggle: toggleSshTerminal,
              },
            ].filter(widget => isWidgetAllowed(widget.id))}
          />
        </FloatingWidgetQuickAccess>
        </Suspense>
      )}
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