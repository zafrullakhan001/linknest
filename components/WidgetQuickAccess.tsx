import React, { useEffect, useRef } from 'react';

interface WidgetQuickAccessProps {
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

  // Focus search input when component mounts
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      
      // Always allow Escape to close, even when in input
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      // Handle Enter key
      if (e.key === 'Enter' && filteredWidgets.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const widget = filteredWidgets[selectedIndex];
        if (widget) {
          widget.onToggle();
          onClose();
        }
        return;
      }

      // Handle arrow keys
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % filteredWidgets.length);
        // If in input, blur it to show selection
        if (isInInput && searchInputRef.current) {
          searchInputRef.current.blur();
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev - 1 + filteredWidgets.length) % filteredWidgets.length);
        // If in input, blur it to show selection
        if (isInInput && searchInputRef.current) {
          searchInputRef.current.blur();
        }
        return;
      }
    };

    // Use capture phase to intercept before other handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [filteredWidgets, selectedIndex, onClose]);

  return (
    <div
      ref={menuRef}
      className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 min-w-[320px] max-w-[400px]"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Widgets</h3>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
            Ctrl+Shift+Y
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
            title="Close Widget Menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            // Prevent default form submission on Enter
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              if (filteredWidgets.length > 0) {
                const widget = filteredWidgets[selectedIndex];
                if (widget) {
                  widget.onToggle();
                  onClose();
                }
              }
            }
            // Allow Escape to work
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }
          }}
          placeholder="Search widgets..."
          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
      </div>

      {/* Widget List */}
      <div className="max-h-[400px] overflow-y-auto">
        {filteredWidgets.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
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
                className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                  index === selectedIndex ? 'bg-slate-50 dark:bg-slate-700/50' : ''
                } ${widget.isVisible ? 'bg-brand-50/50 dark:bg-brand-900/20' : ''}`}
              >
                <div
                  className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                    widget.isVisible
                      ? 'bg-brand-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {widget.icon}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{widget.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {widget.isVisible ? 'Visible' : 'Hidden'}
                  </div>
                </div>
                {widget.isVisible && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4 text-brand-500 flex-shrink-0"
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
      <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-lg">
        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>↑↓ navigate, Enter toggle, Esc close</span>
          <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">Ctrl+Shift+Y</span>
        </div>
      </div>
    </div>
  );
};

