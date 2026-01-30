import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { getDisabledTabsFromSettings } from '../services/tabVisibilityService';
import { ProfileMenu } from './ProfileMenu';

interface NavigationProps {
  darkMode: boolean;
  toggleTheme: () => void;
  showClock: boolean;
  toggleClock: () => void;
  showPhoneticAlphabet: boolean;
  togglePhoneticAlphabet: () => void;
  showNotes: boolean;
  toggleNotes: () => void;
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
  hasUnreadChatMessages?: boolean;
  user: { id: number; username: string; email: string; is_admin?: boolean } | null;
  onLoginClick: () => void;
  onHelpClick: () => void;
  isWidgetAllowed: (widgetId: string) => boolean;
}

export const Navigation: React.FC<NavigationProps> = ({ darkMode, toggleTheme: toggleDarkMode, showClock, toggleClock, showPhoneticAlphabet, togglePhoneticAlphabet, showNotes, toggleNotes, showWeather, toggleWeather, showCalculator, toggleCalculator, showPasswordGenerator, togglePasswordGenerator, showZoomControl, toggleZoomControl, showTheme, toggleThemeWidget, showFavOrganizer, toggleFavOrganizer, showChat, toggleChat, showSnakeGame, toggleSnakeGame, hasUnreadChatMessages = false, user, onLoginClick, onHelpClick, isWidgetAllowed }) => {
  const { logout } = useAuth();
  const { settings } = useSettings();
  const disabledTabs = getDisabledTabsFromSettings(settings);

  const handleLogout = async () => {
    try {
      await logout();
      window.location.hash = '#/';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <nav className="linknest-nav border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-[100] transition-colors duration-300">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-6xl">
        <div
          onClick={() => window.location.hash = '#/'}
          className="flex items-center gap-2 group cursor-pointer"
        >
          {settings.logo_type === 'image' && settings.logo_image ? (
            <img
              src={settings.logo_image}
              alt={settings.app_name}
              className="w-8 h-8 rounded-lg object-contain group-hover:scale-105 transition-transform"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform text-lg">
              {settings.logo_icon || '🔗'}
            </div>
          )}
          <span className="linknest-page-title text-xl font-bold">
            {settings.app_name || 'LinkNest'}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Auth Section */}
          <div className="flex items-center gap-3 order-1 sm:order-none">
            {user ? (
              <>
                {user.is_admin && (
                  <>
                    {!disabledTabs.has('admin') && (
                      <button
                        onClick={() => window.location.hash = '#/admin'}
                        className="p-2 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-lg transition-colors flex items-center gap-2"
                        title="Admin Panel"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                          <path fillRule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clipRule="evenodd" />
                        </svg>
                        <span className="hidden lg:inline text-sm font-medium">Admin</span>
                      </button>
                    )}
                    {!disabledTabs.has('style') && (
                      <button
                        onClick={() => {
                          const event = new CustomEvent('openStyleManager');
                          window.dispatchEvent(event);
                        }}
                        className="p-2 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-lg transition-colors flex items-center gap-2"
                        title="Style Manager"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                          <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v11.5A2.25 2.25 0 0115.75 18h-11.5A2.25 2.25 0 012 15.75V4.25zm11.03 3.28a.75.75 0 00-1.06-1.06l-2.5 2.5a.75.75 0 000 1.06l2.5 2.5a.75.75 0 001.06-1.06l-1.22-1.22h4.69a.75.75 0 000-1.5h-4.69l1.22-1.22z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <button
                onClick={onLoginClick}
                className="px-5 py-2 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-full font-medium transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                Sign In
              </button>
            )}
          </div>

          {/* Widgets Pill */}
          <div className="flex items-center gap-0.5 bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-full p-1 shadow-sm backdrop-blur-sm">
            {isWidgetAllowed('clock') && (
              <button
                onClick={toggleClock}
                className={`p-2 rounded-full transition-all ${showClock ? 'bg-white dark:bg-slate-700 text-brand-500 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                title={showClock ? "Hide Clock Widget" : "Show Clock Widget"}
              >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              </button>
            )}
            {isWidgetAllowed('weather') && (
              <button
                onClick={toggleWeather}
                className={`p-2 rounded-full transition-all ${showWeather ? 'bg-white dark:bg-slate-700 text-brand-500 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                title={showWeather ? "Hide Weather Widget" : "Show Weather Widget"}
              >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
                <path d="M22 10a3 3 0 0 0-3-3h-2.5a2.5 2.5 0 0 0-5 0H12a3 3 0 0 0 0 6h3a2.5 2.5 0 0 0 5 0H22Z"></path>
              </svg>
              </button>
            )}
            {isWidgetAllowed('calculator') && (
              <button
                onClick={toggleCalculator}
                className={`p-2 rounded-full transition-all ${showCalculator ? 'bg-white dark:bg-slate-700 text-brand-500 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                title={showCalculator ? "Hide Calculator Widget" : "Show Calculator Widget"}
              >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
                <rect x="4" y="2" width="16" height="20" rx="2"></rect>
                <line x1="8" y1="6" x2="16" y2="6"></line>
                <line x1="8" y1="10" x2="16" y2="10"></line>
                <line x1="8" y1="14" x2="16" y2="14"></line>
                <line x1="8" y1="18" x2="16" y2="18"></line>
              </svg>
              </button>
            )}
            {user && isWidgetAllowed('notes') && (
              <button
                onClick={toggleNotes}
                className={`p-2 rounded-full transition-all ${showNotes ? 'bg-white dark:bg-slate-700 text-brand-500 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                title={showNotes ? "Hide Notes Widget" : "Show Notes Widget"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              </button>
            )}
            {isWidgetAllowed('password-generator') && (
              <button
                onClick={togglePasswordGenerator}
                className={`p-2 rounded-full transition-all ${showPasswordGenerator ? 'bg-white dark:bg-slate-700 text-brand-500 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                title={showPasswordGenerator ? "Hide Password Generator Widget" : "Show Password Generator Widget"}
              >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
                <rect x="5" y="11" width="14" height="10" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              </button>
            )}
            {isWidgetAllowed('phonetic-alphabet') && (
              <button
                onClick={togglePhoneticAlphabet}
                className={`p-2 rounded-full transition-all ${showPhoneticAlphabet ? 'bg-white dark:bg-slate-700 text-brand-500 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                title={showPhoneticAlphabet ? "Hide Phonetic Alphabet" : "Show Phonetic Alphabet"}
              >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
                <path d="M8 8h4M8 12h4M8 16h4"></path>
              </svg>
              </button>
            )}
            {isWidgetAllowed('zoom-control') && (
              <button
                onClick={toggleZoomControl}
                className={`p-2 rounded-full transition-all ${showZoomControl ? 'bg-white dark:bg-slate-700 text-brand-500 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                title={showZoomControl ? "Hide Zoom Control Widget" : "Show Zoom Control Widget"}
              >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
              </button>
            )}
            {isWidgetAllowed('theme') && (
              <button
                onClick={toggleThemeWidget}
                className={`p-2 rounded-full transition-all ${showTheme ? 'bg-white dark:bg-slate-700 text-brand-500 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                title={showTheme ? "Hide Theme Widget" : "Show Theme Widget"}
              >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
                <circle cx="13.5" cy="6.5" r=".5"></circle>
                <circle cx="17.5" cy="10.5" r=".5"></circle>
                <circle cx="8.5" cy="7.5" r=".5"></circle>
                <circle cx="6.5" cy="12.5" r=".5"></circle>
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
              </svg>
              </button>
            )}
            {isWidgetAllowed('fav-organizer') && (
              <button
                onClick={toggleFavOrganizer}
                className={`p-2 rounded-full transition-all ${showFavOrganizer ? 'bg-white dark:bg-slate-700 text-brand-500 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                title={showFavOrganizer ? "Hide Favorite Organizer Widget" : "Show Favorite Organizer Widget"}
              >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                <path d="M12 2v14"></path>
                <path d="M8 6h8"></path>
                <path d="M8 10h8"></path>
                <path d="M8 14h6"></path>
              </svg>
              </button>
            )}
            {user && isWidgetAllowed('chat') && (
              <button
                onClick={toggleChat}
                className={`p-2 rounded-full transition-all relative ${showChat ? 'bg-white dark:bg-slate-700 text-brand-500 shadow-sm' : hasUnreadChatMessages ? 'hover:bg-slate-200 dark:hover:bg-slate-700 text-red-500 dark:text-red-400' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                title={showChat ? "Hide Chat Widget" : hasUnreadChatMessages ? "Show Chat Widget (New messages)" : "Show Chat Widget"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                {hasUnreadChatMessages && !showChat && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
                )}
              </button>
            )}
            {isWidgetAllowed('snake-game') && (
              <button
                onClick={toggleSnakeGame}
                className={`p-2 rounded-full transition-all ${showSnakeGame ? 'bg-white dark:bg-slate-700 text-brand-500 shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'}`}
                title={showSnakeGame ? "Hide Snake Game Widget" : "Show Snake Game Widget"}
              >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
                <path d="M2 12h20"></path>
                <path d="M12 2v20"></path>
                <path d="M8 8l-4 4 4 4"></path>
                <path d="M16 8l4 4-4 4"></path>
              </svg>
              </button>
            )}
          </div>

          {/* System Section */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-indigo-500">
                  <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.7-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <button
              onClick={onHelpClick}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
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
    </nav>
  );
};
