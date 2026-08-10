import React, { useState, useEffect } from 'react';
import { themeService, ThemeName, AVAILABLE_THEMES } from '../services/themeService';
import { isEscapeDialogOpen } from '../hooks/useEscapeToClose';

interface ThemeWidgetProps {
  onClose?: () => void;
}

export const ThemeWidget: React.FC<ThemeWidgetProps> = ({ onClose }) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(themeService.getCurrentTheme());

  // Escape key handler to close widget
  useEffect(() => {
    if (!onClose) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
        if (isEscapeDialogOpen()) return;
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => {
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [onClose]);

  useEffect(() => {
    // Update theme when it changes externally
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'linknest_theme_name' && e.newValue) {
        const newTheme = e.newValue as ThemeName;
        setCurrentTheme(newTheme);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleThemeSelect = (themeName: ThemeName) => {
    themeService.setTheme(themeName);
    setCurrentTheme(themeName);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 min-w-[360px] max-w-[420px] max-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white">
              <circle cx="13.5" cy="6.5" r=".5"></circle>
              <circle cx="17.5" cy="10.5" r=".5"></circle>
              <circle cx="8.5" cy="7.5" r=".5"></circle>
              <circle cx="6.5" cy="12.5" r=".5"></circle>
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Choose Theme</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Select a visual style</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            title="Close theme widget"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>

      {/* Theme List - Scrollable */}
      <div className="space-y-3 overflow-y-auto flex-1 pr-2 -mr-2 custom-scrollbar" style={{ maxHeight: 'calc(80vh - 180px)' }}>
        {AVAILABLE_THEMES.map((theme) => {
          const isSelected = currentTheme === theme.name;
          
          return (
            <button
              key={theme.name}
              onClick={() => handleThemeSelect(theme.name)}
              className={`w-full relative flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                isSelected
                  ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20 shadow-md'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/50 hover:shadow-sm'
              }`}
            >
              {/* Preview Colors */}
              <div className="flex gap-1.5">
                {theme.previewColors.map((color, idx) => (
                  <div
                    key={idx}
                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-600"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>

              {/* Theme Info */}
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-slate-900 dark:text-white">
                    {theme.displayName}
                  </h4>
                  {isSelected && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4 text-brand-500 dark:text-brand-400"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {theme.description}
                </p>
              </div>

              {/* Radio Indicator */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    isSelected
                      ? 'border-brand-500 dark:border-brand-400'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {isSelected && (
                    <div className="w-2.5 h-2.5 rounded-full bg-brand-500 dark:bg-brand-400" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Info Note */}
      <div className="mt-6 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex-shrink-0">
        <p className="text-xs text-blue-800 dark:text-blue-300">
          💡 <strong>Tip:</strong> Your theme preference is saved automatically and will persist across sessions.
        </p>
      </div>
    </div>
  );
};
