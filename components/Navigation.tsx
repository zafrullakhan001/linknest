import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';

interface NavigationProps {
  darkMode: boolean;
  toggleTheme: () => void;
  user: { id: number; username: string; email: string; is_admin?: boolean } | null;
  onLoginClick: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({ darkMode, toggleTheme, user, onLoginClick }) => {
  const { logout } = useAuth();
  const { settings } = useSettings();

  const handleLogout = async () => {
    try {
      await logout();
      window.location.hash = '#/';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <nav className="border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-50 transition-colors duration-300">
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

        <div className="flex items-center gap-3">
          {user ? (
            <>
              {user.is_admin && (
                <>
                  <button
                    onClick={() => window.location.hash = '#/admin'}
                    className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clipRule="evenodd" />
                    </svg>
                    Admin
                  </button>
                  <button
                    onClick={() => {
                      const event = new CustomEvent('openStyleManager');
                      window.dispatchEvent(event);
                    }}
                    className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2"
                    title="Style Manager"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v11.5A2.25 2.25 0 0115.75 18h-11.5A2.25 2.25 0 012 15.75V4.25zm11.03 3.28a.75.75 0 00-1.06-1.06l-2.5 2.5a.75.75 0 000 1.06l2.5 2.5a.75.75 0 001.06-1.06l-1.22-1.22h4.69a.75.75 0 000-1.5h-4.69l1.22-1.22z" clipRule="evenodd" />
                    </svg>
                    Style
                  </button>
                </>
              )}
              <span className="text-sm text-slate-600 dark:text-slate-400 hidden sm:inline">
                {user.username}
              </span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={onLoginClick}
              className="px-4 py-1.5 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors"
            >
              Sign In
            </button>
          )}
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-all"
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
        </div>
      </div>
    </nav>
  );
};