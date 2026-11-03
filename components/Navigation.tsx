import React, { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings, resolveBrandedAssetHref } from '../contexts/SettingsContext';
import { useMobile } from '../hooks/useMobile';
import { useNavOverlapLayout } from '../hooks/useNavOverlapLayout';
import { getDisabledTabsFromSettings } from '../services/tabVisibilityService';
import { getUpdaterStatus } from '../services/updaterService';
import { isSignInButtonVisible } from '../services/settingsService';
import { ProfileMenu } from './ProfileMenu';
import { ThemeModeMenu } from './ThemeModeMenu';
import { NavWidgetsPill } from './NavWidgetsPill';
import { buildNavWidgetItems } from './navWidgetItems';


const QRCodeDialog = lazy(() => import('./QRCodeDialog').then(m => ({ default: m.QRCodeDialog })));
const UpdatesDialog = lazy(() => import('./UpdatesDialog').then(m => ({ default: m.UpdatesDialog })));

interface NavigationProps {
  darkMode: boolean;
  showClock: boolean;
  toggleClock: () => void;
  showPhoneticAlphabet: boolean;
  togglePhoneticAlphabet: () => void;
  showNotes: boolean;
  toggleNotes: () => void;
  showMedia: boolean;
  toggleMedia: () => void;
  showWeather: boolean;
  toggleWeather: () => void;
  showCalculator: boolean;
  toggleCalculator: () => void;
  showPasswordGenerator: boolean;
  togglePasswordGenerator: () => void;
  showZoomControl: boolean;
  toggleZoomControl: () => void;
  showTheme: boolean;
  toggleThemeWidget: () => void;
  showFavOrganizer: boolean;
  toggleFavOrganizer: () => void;
  showChat: boolean;
  toggleChat: () => void;
  showSnakeGame: boolean;
  toggleSnakeGame: () => void;
  showVncViewer: boolean;
  toggleVncViewer: () => void;
  showSshTerminal: boolean;
  toggleSshTerminal: () => void;
  showInternetSpeedTester: boolean;
  toggleInternetSpeedTester: () => void;
  hasUnreadChatMessages?: boolean;
  user: { id: number; username: string; email: string; is_admin?: boolean } | null;
  onLoginClick: () => void;
  onHelpClick: () => void;
  isWidgetAllowed: (widgetId: string) => boolean;
}

export const Navigation: React.FC<NavigationProps> = ({ darkMode, showClock, toggleClock, showPhoneticAlphabet, togglePhoneticAlphabet, showNotes, toggleNotes, showMedia, toggleMedia, showWeather, toggleWeather, showCalculator, toggleCalculator, showPasswordGenerator, togglePasswordGenerator, showZoomControl, toggleZoomControl, showTheme, toggleThemeWidget, showFavOrganizer, toggleFavOrganizer, showChat, toggleChat, showSnakeGame, toggleSnakeGame, showVncViewer, toggleVncViewer, showSshTerminal, toggleSshTerminal, showInternetSpeedTester, toggleInternetSpeedTester, hasUnreadChatMessages = false, user, onLoginClick, onHelpClick, isWidgetAllowed }) => {
  const { logout } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const disabledTabs = getDisabledTabsFromSettings(settings);
  const showSignInButton = isSignInButtonVisible(settings, settingsLoading);
  // Tablets / narrow desktops: hide company logo so centered brand + widgets don't collide
  const isCompactNav = useMobile(1280);
  const [showAppQrDialog, setShowAppQrDialog] = useState(false);
  const [showUpdatesDialog, setShowUpdatesDialog] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateCount, setUpdateCount] = useState(0);

  const handleLogout = async () => {
    try {
      await logout();
      window.location.hash = '#/';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  useEffect(() => {
    const openUpdates = () => setShowUpdatesDialog(true);
    window.addEventListener('openAppUpdates', openUpdates);
    return () => window.removeEventListener('openAppUpdates', openUpdates);
  }, []);

  const handleUpdateAvailabilityChange = useCallback((available: boolean, count: number) => {
    setUpdateAvailable(available);
    setUpdateCount(count);
  }, []);

  useEffect(() => {
    if (!user?.is_admin) {
      setUpdateAvailable(false);
      setUpdateCount(0);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await getUpdaterStatus();
        if (cancelled) return;
        setUpdateAvailable(Boolean(s.updateAvailable));
        setUpdateCount(s.updateCount || 0);
      } catch {
        /* ignore — e.g. offline or non-admin race */
      }
    };
    poll();
    const intervalMs = 15 * 60 * 1000;
    const id = window.setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user?.is_admin]);

  const logoSize = Math.min(80, Math.max(16, parseInt(settings.logo_size || '32', 10) || 32));
  const headerLogoSize = Math.min(120, Math.max(20, parseInt(settings.header_logo_size || '40', 10) || 40));
  const showCompanyLogo = Boolean(settings.header_logo_image) && !isCompactNav;
  const navMinHeight = Math.max(
    64,
    (showCompanyLogo ? headerLogoSize : 0) + 16,
    (settings.logo_type === 'image' && settings.logo_image ? logoSize : 32) + 16,
    settings.app_subheading ? 72 : 64
  );
  const appShareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}${window.location.search}#/`
    : '#/';
  const appShareLabel = settings.app_name || 'LinkNest';

  // --- Measured nav layout: keep the centered brand clear of the side clusters ---
  const navInnerRef = useRef<HTMLDivElement>(null);
  const rightClusterRef = useRef<HTMLDivElement>(null);
  const companyLogoRef = useRef<HTMLAnchorElement>(null);
  const widgetsPillRef = useRef<HTMLDivElement>(null);
  const widgetIconProbeRef = useRef<HTMLButtonElement>(null);

  const hasUser = Boolean(user);
  const isAdmin = Boolean(user?.is_admin);

  const navWidgets = buildNavWidgetItems({
    isWidgetAllowed,
    hasUser,
    isAdmin,
    showClock,
    toggleClock,
    showWeather,
    toggleWeather,
    showCalculator,
    toggleCalculator,
    showNotes,
    toggleNotes,
    showMedia,
    toggleMedia,
    showPasswordGenerator,
    togglePasswordGenerator,
    showPhoneticAlphabet,
    togglePhoneticAlphabet,
    showZoomControl,
    toggleZoomControl,
    showTheme,
    toggleThemeWidget,
    showFavOrganizer,
    toggleFavOrganizer,
    showChat,
    toggleChat,
    showSnakeGame,
    toggleSnakeGame,
    showVncViewer,
    toggleVncViewer,
    showSshTerminal,
    toggleSshTerminal,
    showInternetSpeedTester,
    toggleInternetSpeedTester,
  });

  // Smallest brand box worth centering: logo/icon + a readable slice of the name.
  const brandMinWidth = logoSize + 64;
  const widgetHeadCount = 4;
  // Re-measure when the brand text, icon set, or auth state changes.
  const navLayoutSignature = [
    settings.app_name,
    settings.app_subheading,
    settings.logo_type,
    settings.logo_image,
    settings.logo_size,
    settings.header_logo_image,
    settings.header_logo_size,
    navWidgets.length,
    user?.id ?? '',
    isAdmin ? '1' : '0',
    updateAvailable ? '1' : '0',
    showSignInButton ? '1' : '0',
  ].join('|');

  const navLayout = useNavOverlapLayout({
    enabled: true,
    navRef: navInnerRef,
    rightClusterRef,
    companyLogoRef,
    iconProbeRef: widgetIconProbeRef,
    brandMinWidth,
    widgetCount: navWidgets.length,
    headCount: widgetHeadCount,
    signature: navLayoutSignature,
  });


  return (
    <nav className="linknest-nav fixed top-0 left-0 right-0 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-[100] transition-colors duration-300">
      <div ref={navInnerRef} className="relative w-full px-4 py-2" style={{ minHeight: navMinHeight }}>
        {/* Far-left company logo — wide screens only */}
        {showCompanyLogo ? (
          <a
            href="#/"
            onClick={(e) => {
              e.preventDefault();
              window.location.hash = '#/';
            }}
            ref={companyLogoRef}
            className="linknest-header-logo absolute left-4 top-1/2 -translate-y-1/2 z-20 flex items-center"
            title="Home"
          >

            <img
              src={resolveBrandedAssetHref(settings.header_logo_image)}
              alt=""
              className="object-contain w-auto h-auto max-w-full"
              style={{ height: headerLogoSize, maxWidth: Math.min(headerLogoSize * 4, 180) }}
            />
          </a>
        ) : null}

        {/* App brand — left on tablet/compact, centered on wide screens */}
        <div
          onClick={() => window.location.hash = '#/'}
          style={
            isCompactNav
              ? { maxWidth: Math.max(96, navLayout.compactBrandMaxWidth) }
              : { maxWidth: Math.max(96, navLayout.brandMaxWidth) }
          }
          className={
            isCompactNav
              ? 'absolute left-4 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2 group cursor-pointer min-w-0 pr-2'
              : 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center gap-2 group cursor-pointer min-w-0'
          }
        >

          {/* Show from hydrated cache; blank only when nothing to show yet */}
          {settingsLoading && !settings.app_name && !settings.header_logo_image ? (
            <div className="h-8 min-w-[7rem]" aria-hidden="true" />
          ) : (
            <>
              {settings.logo_type === 'image' && settings.logo_image ? (
                <img
                  src={resolveBrandedAssetHref(settings.logo_image)}
                  alt={settings.app_name}
                  className="rounded-lg object-contain group-hover:scale-105 transition-transform flex-shrink-0"
                  style={{ height: logoSize, width: logoSize }}
                />
              ) : settings.logo_type !== 'image' && settings.logo_icon ? (
                <div
                  className="rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform flex-shrink-0"
                  style={{ height: logoSize, width: logoSize, fontSize: Math.max(14, logoSize * 0.55) }}
                >
                  {settings.logo_icon}
                </div>
              ) : null}
              <div className={`flex flex-col min-w-0 ${isCompactNav ? 'items-start text-left' : 'items-center text-center'}`}>
                <span className="linknest-page-title linknest-brand-app-name text-xl font-bold leading-tight truncate max-w-full">
                  {settings.app_name || ''}
                </span>
                {settings.app_subheading ? (
                  <span className="linknest-brand-subheading text-xs text-slate-500 dark:text-slate-400 leading-tight truncate max-w-full">
                    {settings.app_subheading}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div ref={rightClusterRef} className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 sm:gap-4 flex-shrink-0 z-10">
          {/* Auth Section */}
          <div className="flex items-center gap-3 order-1 sm:order-none">
            {user ? (
              <>
                {user.is_admin && (
                  <div className="flex items-center gap-0.5 bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-full p-1 shadow-sm backdrop-blur-sm">
                    {!disabledTabs.has('admin') && (
                      <button
                        onClick={() => window.location.hash = '#/admin'}
                        className="p-2 rounded-full transition-all linknest-nav-icon hover:bg-slate-200 dark:hover:bg-slate-700"
                        title="Admin Panel"
                        aria-label="Admin Panel"
                      >
                        <span className="text-base sm:text-lg leading-none" aria-hidden="true">👤</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowUpdatesDialog(true)}
                      className={`p-2 rounded-full transition-all relative linknest-nav-icon ${
                        updateAvailable
                          ? 'hover:bg-amber-50 dark:hover:bg-amber-900/30'
                          : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                      title={updateAvailable ? `${updateCount} app update${updateCount === 1 ? '' : 's'} available` : 'App updates'}
                      aria-label={updateAvailable ? `${updateCount} app update${updateCount === 1 ? '' : 's'} available` : 'App updates'}
                    >
                      <span className="text-base sm:text-lg leading-none" aria-hidden="true">🔔</span>
                      {updateAvailable && (
                        <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
                      )}
                    </button>
                    {!disabledTabs.has('style') && (
                      <button
                        onClick={() => {
                          const event = new CustomEvent('openStyleManager');
                          window.dispatchEvent(event);
                        }}
                        className="p-2 rounded-full transition-all linknest-nav-icon hover:bg-slate-200 dark:hover:bg-slate-700"
                        title="Style Manager"
                        aria-label="Style Manager"
                      >
                        <span className="text-base sm:text-lg leading-none" aria-hidden="true">🎨</span>
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              showSignInButton && (
              <button
                onClick={onLoginClick}
                className="px-5 py-2 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-full font-medium transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                Sign In
              </button>
              )
            )}
          </div>

          {/* Widgets Pill — collapses into an overflow menu when the nav is tight */}
          <NavWidgetsPill
            items={navWidgets}
            collapse={navLayout.collapseWidgets}
            headCount={widgetHeadCount}
            pillRef={widgetsPillRef}
            iconProbeRef={widgetIconProbeRef}
          />

          {/* System Section */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowAppQrDialog(true)}
              className="linknest-nav-icon p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
              title="Share app URL via QR code"
              aria-label="Share app URL via QR code"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                <path d="M14 14h3v3h-3z"></path>
                <path d="M17 17h3v3h-3z"></path>
                <path d="M14 20h3"></path>
                <path d="M20 14v3"></path>
              </svg>
            </button>
            <ThemeModeMenu darkMode={darkMode} />
            <button
              onClick={onHelpClick}
              className="linknest-nav-icon p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
              title="Help & About"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <path d="M12 17h.01"></path>
              </svg>
            </button>
          </div>

          {/* Profile avatar menu (user icon with dropdown: display name, change password, logout) */}
          {user && <ProfileMenu onLogout={handleLogout} />}
        </div>
      </div>

      <Suspense fallback={null}>
        {showAppQrDialog && (
          <QRCodeDialog
            isOpen={showAppQrDialog}
            onClose={() => setShowAppQrDialog(false)}
            url={appShareUrl}
            label={appShareLabel}
          />
        )}
        {showUpdatesDialog && (
          <UpdatesDialog
            isOpen={showUpdatesDialog}
            onClose={() => setShowUpdatesDialog(false)}
            onUpdateAvailabilityChange={handleUpdateAvailabilityChange}
          />
        )}
      </Suspense>
    </nav>
  );
};
