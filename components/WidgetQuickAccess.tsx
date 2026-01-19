import React, { useEffect, useRef } from 'react';

interface WidgetQuickAccessProps {
  isOpen: boolean;
  onClose: () => void;
  widgets: Array<{
    id: string;
    name: string;
    icon: React.ReactNode;
    isVisible: boolean;
    onToggle: () => void;
    requiresAuth?: boolean;
  }>;
  user: { id: number; username: string; email: string; is_admin?: boolean } | null;
}

export const WidgetQuickAccess: React.FC<WidgetQuickAccessProps> = ({
  isOpen,
  onClose,
  widgets,
  user,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  // Filter widgets based on search query and auth requirements
  const filteredWidgets = widgets.filter((widget) => {
    if (widget.requiresAuth && !user) return false;
    if (searchQuery.trim() === '') return true;
    return widget.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Focus search input when menu opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Enter' && filteredWidgets.length > 0) {
        e.preventDefault();
        const widget = filteredWidgets[selectedIndex];
        if (widget) {
          widget.onToggle();
          onClose();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredWidgets.length);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredWidgets.length) % filteredWidgets.length);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredWidgets, selectedIndex, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to avoid closing immediately when opening
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4 pointer-events-none">
      <div
        ref={menuRef}
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-md pointer-events-auto"
        style={{ 
          animation: 'widgetMenuFadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Widgets</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            title="Close (Esc)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search widgets..."
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        {/* Widget List */}
        <div className="max-h-96 overflow-y-auto">
          {filteredWidgets.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
              <p>No widgets found</p>
            </div>
          ) : (
            <div className="py-2">
              {filteredWidgets.map((widget, index) => (
                <button
                  key={widget.id}
                  onClick={() => {
                    widget.onToggle();
                    onClose();
                  }}
                  className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                    index === selectedIndex ? 'bg-slate-50 dark:bg-slate-700/50' : ''
                  } ${widget.isVisible ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}
                >
                  <div
                    className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                      widget.isVisible
                        ? 'bg-brand-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {widget.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-slate-900 dark:text-white">{widget.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {widget.isVisible ? 'Visible' : 'Hidden'}
                    </div>
                  </div>
                  {widget.isVisible && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-5 h-5 text-brand-500"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-xl">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Use ↑↓ to navigate, Enter to toggle, Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
