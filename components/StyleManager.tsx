import React, { useState, useEffect, useRef } from 'react';
import { SpaceStyles, DEFAULT_STYLES, styleService } from '../services/styleService';
import { useAuth } from '../contexts/AuthContext';

interface StyleManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onStylesChange?: (styles: SpaceStyles) => void;
}

type StyleTab = 'spaces' | 'content';

export const StyleManager: React.FC<StyleManagerProps> = ({ isOpen, onClose, onStylesChange }) => {
  const { user } = useAuth();
  const [styles, setStyles] = useState<SpaceStyles>(DEFAULT_STYLES);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<StyleTab>('spaces');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (isOpen) {
      loadStyles();
      // Reset initial mount flag when dialog opens
      isInitialMount.current = true;
      // Center the dialog on open - wait for next frame to get dialog dimensions
      setTimeout(() => {
        if (dialogRef.current) {
          const dialogWidth = dialogRef.current.offsetWidth;
          const dialogHeight = dialogRef.current.offsetHeight;
          const centerX = (window.innerWidth - dialogWidth) / 2 + dialogWidth / 2;
          const centerY = (window.innerHeight - dialogHeight) / 2 + dialogHeight / 2;
          setPosition({ x: centerX, y: centerY });
        } else {
          // Fallback: center of screen
          setPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
          });
        }
      }, 0);
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dialogRef.current || !headerRef.current) return;

    // Calculate offset from center of dialog
    const rect = dialogRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    setDragOffset({
      x: e.clientX - centerX,
      y: e.clientY - centerY
    });
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dialogRef.current) return;

      // Calculate new position (center point of dialog) accounting for drag offset
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // Keep dialog within viewport bounds
      const dialogWidth = dialogRef.current.offsetWidth;
      const dialogHeight = dialogRef.current.offsetHeight;
      const halfWidth = dialogWidth / 2;
      const halfHeight = dialogHeight / 2;

      const maxX = window.innerWidth - halfWidth;
      const maxY = window.innerHeight - halfHeight;

      setPosition({
        x: Math.max(halfWidth, Math.min(newX, maxX)),
        y: Math.max(halfHeight, Math.min(newY, maxY))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const loadStyles = async () => {
    setIsLoading(true);
    try {
      const loadedStyles = await styleService.getStyles();
      setStyles(loadedStyles);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to load styles:', error);
      alert('Failed to load styles');
    } finally {
      setIsLoading(false);
    }
  };

  // Use effect to call onStylesChange after state updates to avoid React warning
  // Use a ref to track if this is the initial mount to prevent calling onStylesChange with defaults
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return; // Skip on initial mount
    }
    if (onStylesChange && styles) {
      onStylesChange(styles);
    }
  }, [styles]); // Remove onStylesChange from deps to prevent unnecessary re-runs

  const updateStyle = <K extends keyof SpaceStyles>(key: K, value: SpaceStyles[K]) => {
    setStyles(prev => {
      const updated = { ...prev, [key]: value };
      setHasChanges(true);
      return updated;
    });
  };

  const updateNestedStyle = (key: string, value: any) => {
    setStyles(prev => {
      // Deep clone the previous state to avoid mutating nested objects
      // This is important because prev might contain references to DEFAULT_STYLES
      const updated = JSON.parse(JSON.stringify(prev));

      const keys = key.split('.');
      let current: any = updated;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      current[keys[keys.length - 1]] = value;
      setHasChanges(true);
      return updated;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await styleService.saveStyles(styles);
      setHasChanges(false);
      // Trigger a refresh of styles in the context
      window.dispatchEvent(new CustomEvent('refreshStyles'));
      alert('Styles saved successfully!');
    } catch (error) {
      console.error('Failed to save styles:', error);
      alert('Failed to save styles: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all styles to default? This cannot be undone.')) {
      return;
    }

    setIsSaving(true);
    try {
      await styleService.resetStyles();
      const defaultStyles = { ...DEFAULT_STYLES };
      setStyles(defaultStyles);
      setHasChanges(false);
      if (onStylesChange) {
        onStylesChange(defaultStyles);
      }
      // Trigger a refresh of styles in the context
      window.dispatchEvent(new CustomEvent('refreshStyles'));
      alert('Styles reset to default!');
    } catch (error) {
      console.error('Failed to reset styles:', error);
      alert('Failed to reset styles: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    if (!user?.is_admin) {
      alert('Only administrators can export styles.');
      return;
    }
    try {
      styleService.exportStyles(styles);
      alert('Styles exported successfully!');
    } catch (error) {
      console.error('Failed to export styles:', error);
      alert('Failed to export styles');
    }
  };

  const handleImport = async () => {
    if (!user?.is_admin) {
      alert('Only administrators can import styles.');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const importedStyles = await styleService.importStyles(file);
      setStyles(importedStyles);
      setHasChanges(true);
      if (onStylesChange) {
        onStylesChange(importedStyles);
      }
      alert('Styles imported successfully! Click Save to apply.');
    } catch (error) {
      console.error('Failed to import styles:', error);
      alert('Failed to import styles: ' + (error instanceof Error ? error.message : 'Invalid file format'));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] p-4 pointer-events-none">
      {/* Backdrop - less opaque, no blur, clickable to close */}
      <div
        className="absolute inset-0 bg-slate-900/20 dark:bg-slate-900/30 pointer-events-auto"
        onClick={onClose}
      ></div>

      {/* Dialog - draggable */}
      <div
        ref={dialogRef}
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl relative pointer-events-auto"
        style={{
          position: 'absolute',
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: 'translate(-50%, -50%)',
          cursor: isDragging ? 'grabbing' : 'default',
          userSelect: 'none'
        }}
      >
        {/* Header - draggable area */}
        <div
          ref={headerRef}
          onMouseDown={(e) => {
            // Don't start dragging if clicking on the close button or its children
            const target = e.target as HTMLElement;
            if (target.closest('button')) return;
            handleMouseDown(e);
          }}
          className={`flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-brand-50 to-violet-50 dark:from-brand-500/10 dark:to-violet-500/10 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          <div className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2h-3a2 2 0 00-2-2H7zM7 4h3a1 1 0 011 1v10a1 1 0 01-1 1H7a1 1 0 01-1-1V5a1 1 0 011-1z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Style Manager</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Customize the appearance of your spaces • Drag to move</p>
            </div>
          </div>
          <button
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 px-6 bg-slate-50 dark:bg-slate-900/50">
          <button
            onClick={() => setActiveTab('spaces')}
            className={`px-6 py-3 text-sm font-semibold transition-all relative ${activeTab === 'spaces'
              ? 'text-brand-600 dark:text-brand-400'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
          >
            <span className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
              </svg>
              Spaces Grid
            </span>
            {activeTab === 'spaces' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-500 to-violet-500"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('content')}
            className={`px-6 py-3 text-sm font-semibold transition-all relative ${activeTab === 'content'
              ? 'text-brand-600 dark:text-brand-400'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
          >
            <span className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" clipRule="evenodd" />
              </svg>
              Content Page UX
            </span>
            {activeTab === 'content' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-brand-500 to-violet-500"></div>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-230px)] p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
          ) : activeTab === 'spaces' ? (
            <div className="space-y-6">
              {/* Global Page Zoom */}
              <section className="bg-gradient-to-r from-brand-50/50 to-violet-50/50 dark:from-brand-500/5 dark:to-violet-500/5 -mx-6 -mt-6 px-6 py-5 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-500">
                    <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                  </svg>
                  Global Page Settings
                </h3>
                <div className="flex items-center gap-6">
                  <div className="flex-1 max-w-md">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Page Zoom: {styles.pageZoom || 100}%
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="50"
                        max="150"
                        step="5"
                        value={styles.pageZoom || 100}
                        onChange={(e) => updateStyle('pageZoom', parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateStyle('pageZoom', 80)}
                          className={`px-2 py-1 text-xs rounded ${(styles.pageZoom || 100) === 80 ? 'bg-brand-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                        >
                          80%
                        </button>
                        <button
                          onClick={() => updateStyle('pageZoom', 100)}
                          className={`px-2 py-1 text-xs rounded ${(styles.pageZoom || 100) === 100 ? 'bg-brand-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                        >
                          100%
                        </button>
                        <button
                          onClick={() => updateStyle('pageZoom', 120)}
                          className={`px-2 py-1 text-xs rounded ${(styles.pageZoom || 100) === 120 ? 'bg-brand-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                        >
                          120%
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Adjust the overall zoom level of the application</p>
                  </div>
                </div>
              </section>

              {/* Tile Styling */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-500">
                    <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                  </svg>
                  Tile Styling
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Background Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={styles.tileBackgroundColor}
                        onChange={(e) => updateStyle('tileBackgroundColor', e.target.value)}
                        className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={styles.tileBackgroundColor}
                        onChange={(e) => updateStyle('tileBackgroundColor', e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Border Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={styles.tileBorderColor}
                        onChange={(e) => updateStyle('tileBorderColor', e.target.value)}
                        className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={styles.tileBorderColor}
                        onChange={(e) => updateStyle('tileBorderColor', e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        placeholder="#e2e8f0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Border Width: {styles.tileBorderWidth}px</label>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      value={styles.tileBorderWidth}
                      onChange={(e) => updateStyle('tileBorderWidth', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Border Radius: {styles.tileBorderRadius}px</label>
                    <input
                      type="range"
                      min="0"
                      max="24"
                      value={styles.tileBorderRadius}
                      onChange={(e) => updateStyle('tileBorderRadius', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Padding: {styles.tilePadding}px</label>
                    <input
                      type="range"
                      min="8"
                      max="32"
                      value={styles.tilePadding}
                      onChange={(e) => updateStyle('tilePadding', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Elevation (Shadow): {styles.tileElevation}</label>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      value={styles.tileElevation}
                      onChange={(e) => updateStyle('tileElevation', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </section>

              {/* Spacing */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-violet-500">
                    <path d="M10.75 16.5a.75.75 0 000-1.5h-4.5a.75.75 0 000 1.5h4.5zM10.75 13.5a.75.75 0 000-1.5h-4.5a.75.75 0 000 1.5h4.5zM10.75 10.5a.75.75 0 000-1.5h-4.5a.75.75 0 000 1.5h4.5zM6 4.5a.75.75 0 00-.75.75v9.5c0 .414.336.75.75.75h8a.75.75 0 00.75-.75v-9.5A.75.75 0 0014 4.5H6z" />
                  </svg>
                  Spacing
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tile Gap: {styles.tileGap}px</label>
                    <input
                      type="range"
                      min="0"
                      max="32"
                      value={styles.tileGap}
                      onChange={(e) => updateStyle('tileGap', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Category Spacing: {styles.categorySpacing}px</label>
                    <input
                      type="range"
                      min="16"
                      max="64"
                      value={styles.categorySpacing}
                      onChange={(e) => updateStyle('categorySpacing', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </section>

              {/* Gradient */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-500">
                    <path fillRule="evenodd" d="M1 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H3a2 2 0 01-2-2V5zm11 1H4v8h8V6zM3 4a1 1 0 000 2h1V4H3zm12 0a1 1 0 100 2h1V4h-1z" clipRule="evenodd" />
                  </svg>
                  Gradient
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="useGradient"
                      checked={styles.useGradient}
                      onChange={(e) => updateStyle('useGradient', e.target.checked)}
                      className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                    />
                    <label htmlFor="useGradient" className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Gradient</label>
                  </div>
                  {styles.useGradient && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6 border-l-2 border-brand-200 dark:border-brand-800">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Gradient Type</label>
                        <select
                          value={styles.gradientType}
                          onChange={(e) => updateStyle('gradientType', e.target.value as 'linear' | 'radial' | 'conic')}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        >
                          <option value="linear">Linear</option>
                          <option value="radial">Radial</option>
                          <option value="conic">Conic</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Direction: {styles.gradientDirection}°</label>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={styles.gradientDirection}
                          onChange={(e) => updateStyle('gradientDirection', parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Color</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={styles.gradientStartColor}
                            onChange={(e) => updateStyle('gradientStartColor', e.target.value)}
                            className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={styles.gradientStartColor}
                            onChange={(e) => updateStyle('gradientStartColor', e.target.value)}
                            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">End Color</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={styles.gradientEndColor}
                            onChange={(e) => updateStyle('gradientEndColor', e.target.value)}
                            className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={styles.gradientEndColor}
                            onChange={(e) => updateStyle('gradientEndColor', e.target.value)}
                            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Gradient Stop: {styles.gradientStop}%</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={styles.gradientStop}
                          onChange={(e) => updateStyle('gradientStop', parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Hover Effects */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-emerald-500">
                    <path d="M10 1a6 6 0 00-3.815 10.631L7 19l2.184-2.183a6 6 0 003.632-10.631A6 6 0 0010 1zM8 10a2 2 0 114 0 2 2 0 01-4 0z" />
                  </svg>
                  Hover Effects
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Hover Elevation: {styles.hoverElevation}</label>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      value={styles.hoverElevation}
                      onChange={(e) => updateStyle('hoverElevation', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Hover Scale: {styles.hoverScale.toFixed(2)}x</label>
                    <input
                      type="range"
                      min="1.0"
                      max="1.2"
                      step="0.01"
                      value={styles.hoverScale}
                      onChange={(e) => updateStyle('hoverScale', parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Hover Translate Y: {styles.hoverTranslateY}px</label>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={styles.hoverTranslateY}
                      onChange={(e) => updateStyle('hoverTranslateY', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </section>

              {/* Visual Effects */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-purple-500">
                    <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                  </svg>
                  Visual Effects
                </h3>
                <div className="space-y-6">
                  {/* Raised Effect */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="raisedEffect"
                        checked={styles.raisedEffect}
                        onChange={(e) => updateStyle('raisedEffect', e.target.checked)}
                        className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                      />
                      <label htmlFor="raisedEffect" className="text-sm font-medium text-slate-700 dark:text-slate-300">Raised Effect (3D Appearance)</label>
                    </div>
                    {styles.raisedEffect && (
                      <div className="pl-6 border-l-2 border-brand-200 dark:border-brand-800">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Raised Intensity: {styles.raisedIntensity}</label>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            value={styles.raisedIntensity}
                            onChange={(e) => updateStyle('raisedIntensity', parseInt(e.target.value))}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                            <span>Subtle</span>
                            <span>Strong</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Metallic Effect */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="metallicEffect"
                        checked={styles.metallicEffect}
                        onChange={(e) => updateStyle('metallicEffect', e.target.checked)}
                        className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                      />
                      <label htmlFor="metallicEffect" className="text-sm font-medium text-slate-700 dark:text-slate-300">Metallic Effect (Shiny Appearance)</label>
                    </div>
                    {styles.metallicEffect && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6 border-l-2 border-brand-200 dark:border-brand-800">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Metallic Type</label>
                          <select
                            value={styles.metallicType}
                            onChange={(e) => updateStyle('metallicType', e.target.value as 'silver' | 'gold' | 'chrome' | 'bronze' | 'copper' | 'custom')}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                          >
                            <option value="silver">Silver</option>
                            <option value="gold">Gold</option>
                            <option value="chrome">Chrome</option>
                            <option value="bronze">Bronze</option>
                            <option value="copper">Copper</option>
                            <option value="custom">Custom</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Metallic Intensity: {styles.metallicIntensity}%</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={styles.metallicIntensity}
                            onChange={(e) => updateStyle('metallicIntensity', parseInt(e.target.value))}
                            className="w-full"
                          />
                        </div>
                        {styles.metallicType === 'custom' && (
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Custom Metallic Color</label>
                            <div className="flex gap-2">
                              <input
                                type="color"
                                value={styles.metallicCustomColor}
                                onChange={(e) => updateStyle('metallicCustomColor', e.target.value)}
                                className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                              />
                              <input
                                type="text"
                                value={styles.metallicCustomColor}
                                onChange={(e) => updateStyle('metallicCustomColor', e.target.value)}
                                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                                placeholder="#c0c0c0"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Background Table Effect */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-600">
                    <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                  </svg>
                  Background Table Effect
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="backgroundRaised"
                      checked={styles.backgroundRaised}
                      onChange={(e) => updateStyle('backgroundRaised', e.target.checked)}
                      className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                    />
                    <label htmlFor="backgroundRaised" className="text-sm font-medium text-slate-700 dark:text-slate-300">Raised Table Background</label>
                  </div>
                  {styles.backgroundRaised && (
                    <div className="space-y-4 pl-6 border-l-2 border-brand-200 dark:border-brand-800">
                      {/* Basic Settings */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Table Type</label>
                          <select
                            value={styles.backgroundTableType}
                            onChange={(e) => updateStyle('backgroundTableType', e.target.value as 'wood' | 'marble' | 'metal' | 'fabric' | 'clean')}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                          >
                            <option value="wood">Wood</option>
                            <option value="marble">Marble</option>
                            <option value="metal">Metal</option>
                            <option value="fabric">Fabric</option>
                            <option value="clean">Clean</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Raised Intensity: {styles.backgroundRaisedIntensity}</label>
                          <input
                            type="range"
                            min="0"
                            max="5"
                            value={styles.backgroundRaisedIntensity}
                            onChange={(e) => updateStyle('backgroundRaisedIntensity', parseInt(e.target.value))}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                            <span>Flat</span>
                            <span>Very Raised</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Table Width: {styles.backgroundTableWidth}%</label>
                          <input
                            type="range"
                            min="50"
                            max="100"
                            value={styles.backgroundTableWidth}
                            onChange={(e) => updateStyle('backgroundTableWidth', parseInt(e.target.value))}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                            <span>Narrow</span>
                            <span>Full Width</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Table Surface Color</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={styles.backgroundTableColor}
                              onChange={(e) => updateStyle('backgroundTableColor', e.target.value)}
                              className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={styles.backgroundTableColor}
                              onChange={(e) => updateStyle('backgroundTableColor', e.target.value)}
                              className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                              placeholder="#8b7355"
                            />
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {styles.backgroundTableType === 'wood' && 'Recommended: Brown tones (#8b7355, #6b5238)'}
                        {styles.backgroundTableType === 'marble' && 'Recommended: Light gray/white tones (#e8e8e8, #f5f5f5)'}
                        {styles.backgroundTableType === 'metal' && 'Recommended: Gray/silver tones (#c0c0c0, #a8a8a8)'}
                        {styles.backgroundTableType === 'fabric' && 'Recommended: Neutral tones (#d4d4d4, #e5e5e5)'}
                        {styles.backgroundTableType === 'clean' && 'Any color works well'}
                      </p>

                      {/* Gradient Options */}
                      <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="backgroundUseGradient"
                            checked={styles.backgroundUseGradient}
                            onChange={(e) => updateStyle('backgroundUseGradient', e.target.checked)}
                            className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                          />
                          <label htmlFor="backgroundUseGradient" className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Gradient</label>
                        </div>
                        {styles.backgroundUseGradient && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Gradient Type</label>
                              <select
                                value={styles.backgroundGradientType}
                                onChange={(e) => updateStyle('backgroundGradientType', e.target.value as 'linear' | 'radial' | 'conic')}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                              >
                                <option value="linear">Linear</option>
                                <option value="radial">Radial</option>
                                <option value="conic">Conic</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Direction: {styles.backgroundGradientDirection}°</label>
                              <input
                                type="range"
                                min="0"
                                max="360"
                                value={styles.backgroundGradientDirection}
                                onChange={(e) => updateStyle('backgroundGradientDirection', parseInt(e.target.value))}
                                className="w-full"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Color</label>
                              <div className="flex gap-2">
                                <input
                                  type="color"
                                  value={styles.backgroundGradientStartColor}
                                  onChange={(e) => updateStyle('backgroundGradientStartColor', e.target.value)}
                                  className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                />
                                <input
                                  type="text"
                                  value={styles.backgroundGradientStartColor}
                                  onChange={(e) => updateStyle('backgroundGradientStartColor', e.target.value)}
                                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">End Color</label>
                              <div className="flex gap-2">
                                <input
                                  type="color"
                                  value={styles.backgroundGradientEndColor}
                                  onChange={(e) => updateStyle('backgroundGradientEndColor', e.target.value)}
                                  className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                />
                                <input
                                  type="text"
                                  value={styles.backgroundGradientEndColor}
                                  onChange={(e) => updateStyle('backgroundGradientEndColor', e.target.value)}
                                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Gradient Stop: {styles.backgroundGradientStop}%</label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={styles.backgroundGradientStop}
                                onChange={(e) => updateStyle('backgroundGradientStop', parseInt(e.target.value))}
                                className="w-full"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Metallic Effect */}
                      <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="backgroundMetallicEffect"
                            checked={styles.backgroundMetallicEffect}
                            onChange={(e) => updateStyle('backgroundMetallicEffect', e.target.checked)}
                            className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                          />
                          <label htmlFor="backgroundMetallicEffect" className="text-sm font-medium text-slate-700 dark:text-slate-300">Metallic Effect</label>
                        </div>
                        {styles.backgroundMetallicEffect && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Metallic Type</label>
                              <select
                                value={styles.backgroundMetallicType}
                                onChange={(e) => updateStyle('backgroundMetallicType', e.target.value as 'silver' | 'gold' | 'chrome' | 'bronze' | 'copper' | 'custom')}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                              >
                                <option value="silver">Silver</option>
                                <option value="gold">Gold</option>
                                <option value="chrome">Chrome</option>
                                <option value="bronze">Bronze</option>
                                <option value="copper">Copper</option>
                                <option value="custom">Custom</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Metallic Intensity: {styles.backgroundMetallicIntensity}%</label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={styles.backgroundMetallicIntensity}
                                onChange={(e) => updateStyle('backgroundMetallicIntensity', parseInt(e.target.value))}
                                className="w-full"
                              />
                            </div>
                            {styles.backgroundMetallicType === 'custom' && (
                              <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Custom Metallic Color</label>
                                <div className="flex gap-2">
                                  <input
                                    type="color"
                                    value={styles.backgroundMetallicCustomColor}
                                    onChange={(e) => updateStyle('backgroundMetallicCustomColor', e.target.value)}
                                    className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                  />
                                  <input
                                    type="text"
                                    value={styles.backgroundMetallicCustomColor}
                                    onChange={(e) => updateStyle('backgroundMetallicCustomColor', e.target.value)}
                                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                                    placeholder="#c0c0c0"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Category Header */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-rose-500">
                    <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v11.5A2.25 2.25 0 0115.75 18h-11.5A2.25 2.25 0 012 15.75V4.25zm3.75 7.5a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zm2.25-3a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5H8zm2.25-3a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zm2.25 6a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zm2.25-3a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5z" clipRule="evenodd" />
                  </svg>
                  Category Header
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Header Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={styles.categoryHeaderColor}
                        onChange={(e) => updateStyle('categoryHeaderColor', e.target.value)}
                        className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={styles.categoryHeaderColor}
                        onChange={(e) => updateStyle('categoryHeaderColor', e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Size: {styles.categoryHeaderSize}px</label>
                    <input
                      type="range"
                      min="10"
                      max="20"
                      value={styles.categoryHeaderSize}
                      onChange={(e) => updateStyle('categoryHeaderSize', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Spacing: {styles.categoryHeaderSpacing}px</label>
                    <input
                      type="range"
                      min="4"
                      max="24"
                      value={styles.categoryHeaderSpacing}
                      onChange={(e) => updateStyle('categoryHeaderSpacing', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </section>

              {/* Typography */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-500">
                    <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716a1.5 1.5 0 011.465 1.175L16.5 15.5A1.5 1.5 0 0115 17h-1.148a1.5 1.5 0 01-1.465-1.175l-.716-3.223a1.5 1.5 0 00-1.767-1.052l-.933.267a1.5 1.5 0 01-1.767-1.052l-.267-.933a1.5 1.5 0 00-1.052-1.767l-.933-.267a1.5 1.5 0 01-1.052-1.767l.267-.933A1.5 1.5 0 004.148 2H3.5A1.5 1.5 0 002 3.5z" clipRule="evenodd" />
                  </svg>
                  Typography
                </h3>

                {/* Spaces (Tiles) Typography */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Spaces (Tiles)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4 border-l-2 border-indigo-200 dark:border-indigo-800">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Family</label>
                      <select
                        value={styles.tileFontFamily}
                        onChange={(e) => updateStyle('tileFontFamily', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      >
                        <option value="inherit">Inherit (Default)</option>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
                        <option value="'Times New Roman', Times, serif">Times New Roman</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="'Courier New', Courier, monospace">Courier New</option>
                        <option value="Verdana, sans-serif">Verdana</option>
                        <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                        <option value="'Comic Sans MS', cursive">Comic Sans MS</option>
                        <option value="Impact, sans-serif">Impact</option>
                        <option value="'Lucida Console', monospace">Lucida Console</option>
                        <option value="Tahoma, sans-serif">Tahoma</option>
                        <option value="'Palatino Linotype', Palatino, serif">Palatino</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Size: {styles.tileFontSize}px</label>
                      <input
                        type="range"
                        min="10"
                        max="24"
                        value={styles.tileFontSize}
                        onChange={(e) => updateStyle('tileFontSize', parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Weight</label>
                      <select
                        value={styles.tileFontWeight}
                        onChange={(e) => updateStyle('tileFontWeight', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      >
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                        <option value="100">Thin (100)</option>
                        <option value="200">Extra Light (200)</option>
                        <option value="300">Light (300)</option>
                        <option value="400">Regular (400)</option>
                        <option value="500">Medium (500)</option>
                        <option value="600">Semi Bold (600)</option>
                        <option value="700">Bold (700)</option>
                        <option value="800">Extra Bold (800)</option>
                        <option value="900">Black (900)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Style</label>
                      <select
                        value={styles.tileFontStyle}
                        onChange={(e) => updateStyle('tileFontStyle', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      >
                        <option value="normal">Normal</option>
                        <option value="italic">Italic</option>
                        <option value="oblique">Oblique</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Categories Typography */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Categories</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-4 border-l-2 border-indigo-200 dark:border-indigo-800">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Family</label>
                      <select
                        value={styles.categoryFontFamily}
                        onChange={(e) => updateStyle('categoryFontFamily', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      >
                        <option value="inherit">Inherit (Default)</option>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
                        <option value="'Times New Roman', Times, serif">Times New Roman</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="'Courier New', Courier, monospace">Courier New</option>
                        <option value="Verdana, sans-serif">Verdana</option>
                        <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                        <option value="'Comic Sans MS', cursive">Comic Sans MS</option>
                        <option value="Impact, sans-serif">Impact</option>
                        <option value="'Lucida Console', monospace">Lucida Console</option>
                        <option value="Tahoma, sans-serif">Tahoma</option>
                        <option value="'Palatino Linotype', Palatino, serif">Palatino</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Weight</label>
                      <select
                        value={styles.categoryFontWeight}
                        onChange={(e) => updateStyle('categoryFontWeight', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      >
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                        <option value="100">Thin (100)</option>
                        <option value="200">Extra Light (200)</option>
                        <option value="300">Light (300)</option>
                        <option value="400">Regular (400)</option>
                        <option value="500">Medium (500)</option>
                        <option value="600">Semi Bold (600)</option>
                        <option value="700">Bold (700)</option>
                        <option value="800">Extra Bold (800)</option>
                        <option value="900">Black (900)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Style</label>
                      <select
                        value={styles.categoryFontStyle}
                        onChange={(e) => updateStyle('categoryFontStyle', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      >
                        <option value="normal">Normal</option>
                        <option value="italic">Italic</option>
                        <option value="oblique">Oblique</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 pl-4">Note: Font size is controlled in the Category Header section above.</p>
                </div>

                {/* Page Title Typography */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Page Title</h4>
                  <div className="space-y-4 pl-4 border-l-2 border-indigo-200 dark:border-indigo-800">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="pageTitleGradientEnabled"
                        checked={styles.pageTitleGradientEnabled}
                        onChange={(e) => updateStyle('pageTitleGradientEnabled', e.target.checked)}
                        className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                      />
                      <label htmlFor="pageTitleGradientEnabled" className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Gradient</label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Family</label>
                        <select
                          value={styles.pageTitleFontFamily}
                          onChange={(e) => updateStyle('pageTitleFontFamily', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        >
                          <option value="inherit">Inherit (Default)</option>
                          <option value="Arial, sans-serif">Arial</option>
                          <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
                          <option value="'Times New Roman', Times, serif">Times New Roman</option>
                          <option value="Georgia, serif">Georgia</option>
                          <option value="'Courier New', Courier, monospace">Courier New</option>
                          <option value="Verdana, sans-serif">Verdana</option>
                          <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                          <option value="'Comic Sans MS', cursive">Comic Sans MS</option>
                          <option value="Impact, sans-serif">Impact</option>
                          <option value="'Lucida Console', monospace">Lucida Console</option>
                          <option value="Tahoma, sans-serif">Tahoma</option>
                          <option value="'Palatino Linotype', Palatino, serif">Palatino</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Size: {styles.pageTitleFontSize}px</label>
                        <input
                          type="range"
                          min="14"
                          max="32"
                          value={styles.pageTitleFontSize}
                          onChange={(e) => updateStyle('pageTitleFontSize', parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Weight</label>
                        <select
                          value={styles.pageTitleFontWeight}
                          onChange={(e) => updateStyle('pageTitleFontWeight', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        >
                          <option value="normal">Normal</option>
                          <option value="bold">Bold</option>
                          <option value="100">Thin (100)</option>
                          <option value="200">Extra Light (200)</option>
                          <option value="300">Light (300)</option>
                          <option value="400">Regular (400)</option>
                          <option value="500">Medium (500)</option>
                          <option value="600">Semi Bold (600)</option>
                          <option value="700">Bold (700)</option>
                          <option value="800">Extra Bold (800)</option>
                          <option value="900">Black (900)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Style</label>
                        <select
                          value={styles.pageTitleFontStyle}
                          onChange={(e) => updateStyle('pageTitleFontStyle', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        >
                          <option value="normal">Normal</option>
                          <option value="italic">Italic</option>
                          <option value="oblique">Oblique</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Spaces Title (Landing Page Heading) Typography */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Spaces Title (Landing Page Heading)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4 border-l-2 border-indigo-200 dark:border-indigo-800">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Family</label>
                      <select
                        value={styles.spacesTitleFontFamily}
                        onChange={(e) => updateStyle('spacesTitleFontFamily', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      >
                        <option value="inherit">Inherit (Default)</option>
                        <option value="Arial, sans-serif">Arial</option>
                        <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
                        <option value="'Times New Roman', Times, serif">Times New Roman</option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="'Courier New', Courier, monospace">Courier New</option>
                        <option value="Verdana, sans-serif">Verdana</option>
                        <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                        <option value="'Comic Sans MS', cursive">Comic Sans MS</option>
                        <option value="Impact, sans-serif">Impact</option>
                        <option value="'Lucida Console', monospace">Lucida Console</option>
                        <option value="Tahoma, sans-serif">Tahoma</option>
                        <option value="'Palatino Linotype', Palatino, serif">Palatino</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Size: {styles.spacesTitleFontSize}px</label>
                      <input
                        type="range"
                        min="16"
                        max="40"
                        value={styles.spacesTitleFontSize}
                        onChange={(e) => updateStyle('spacesTitleFontSize', parseInt(e.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Weight</label>
                      <select
                        value={styles.spacesTitleFontWeight}
                        onChange={(e) => updateStyle('spacesTitleFontWeight', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      >
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                        <option value="100">Thin (100)</option>
                        <option value="200">Extra Light (200)</option>
                        <option value="300">Light (300)</option>
                        <option value="400">Regular (400)</option>
                        <option value="500">Medium (500)</option>
                        <option value="600">Semi Bold (600)</option>
                        <option value="700">Bold (700)</option>
                        <option value="800">Extra Bold (800)</option>
                        <option value="900">Black (900)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Style</label>
                      <select
                        value={styles.spacesTitleFontStyle}
                        onChange={(e) => updateStyle('spacesTitleFontStyle', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      >
                        <option value="normal">Normal</option>
                        <option value="italic">Italic</option>
                        <option value="oblique">Oblique</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* Grid Settings */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-cyan-500">
                    <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v11.5A2.25 2.25 0 0115.75 18h-11.5A2.25 2.25 0 012 15.75V4.25zm3.75 7.5a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zm2.25-3a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5H8zm2.25-3a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zm2.25 6a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zm2.25-3a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5z" clipRule="evenodd" />
                  </svg>
                  Grid Columns
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Small (sm)</label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={styles.gridColumns.sm}
                      onChange={(e) => updateNestedStyle('gridColumns.sm', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Medium (md)</label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={styles.gridColumns.md}
                      onChange={(e) => updateNestedStyle('gridColumns.md', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Large (lg)</label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={styles.gridColumns.lg}
                      onChange={(e) => updateNestedStyle('gridColumns.lg', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Extra Large (xl)</label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={styles.gridColumns.xl}
                      onChange={(e) => updateNestedStyle('gridColumns.xl', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </section>
            </div>
          ) : (
            /* Content Page UX Tab */
            <div className="space-y-6">
              {/* Header Styling */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-violet-500">
                    <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5v-6.621a1.5 1.5 0 00-.44-1.06l-5.878-5.878A1.5 1.5 0 009.621 2H4.5zm3.75 8.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5zm0 3a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
                  </svg>
                  Header Style
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Header Style</label>
                    <select
                      value={styles.contentHeaderStyle}
                      onChange={(e) => updateStyle('contentHeaderStyle', e.target.value as 'gradient' | 'solid' | 'glassmorphism' | 'minimal')}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                    >
                      <option value="gradient">Gradient</option>
                      <option value="solid">Solid Color</option>
                      <option value="glassmorphism">Glassmorphism</option>
                      <option value="minimal">Minimal</option>
                    </select>
                  </div>
                  {styles.contentHeaderStyle === 'gradient' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Direction: {styles.contentHeaderGradientDirection}°</label>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={styles.contentHeaderGradientDirection}
                          onChange={(e) => updateStyle('contentHeaderGradientDirection', parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Color</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={styles.contentHeaderGradientStart}
                            onChange={(e) => updateStyle('contentHeaderGradientStart', e.target.value)}
                            className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={styles.contentHeaderGradientStart}
                            onChange={(e) => updateStyle('contentHeaderGradientStart', e.target.value)}
                            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">End Color</label>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={styles.contentHeaderGradientEnd}
                            onChange={(e) => updateStyle('contentHeaderGradientEnd', e.target.value)}
                            className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={styles.contentHeaderGradientEnd}
                            onChange={(e) => updateStyle('contentHeaderGradientEnd', e.target.value)}
                            className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {styles.contentHeaderStyle === 'solid' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Header Color</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={styles.contentHeaderSolidColor}
                          onChange={(e) => updateStyle('contentHeaderSolidColor', e.target.value)}
                          className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={styles.contentHeaderSolidColor}
                          onChange={(e) => updateStyle('contentHeaderSolidColor', e.target.value)}
                          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                  {styles.contentHeaderStyle === 'glassmorphism' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Blur Intensity: {styles.contentHeaderBlur}px</label>
                        <input
                          type="range"
                          min="0"
                          max="20"
                          value={styles.contentHeaderBlur}
                          onChange={(e) => updateStyle('contentHeaderBlur', parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Opacity: {styles.contentHeaderOpacity}%</label>
                        <input
                          type="range"
                          min="50"
                          max="100"
                          value={styles.contentHeaderOpacity}
                          onChange={(e) => updateStyle('contentHeaderOpacity', parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* Section Styling */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-emerald-500">
                    <path d="M2 4.5A2.5 2.5 0 014.5 2h11a2.5 2.5 0 010 5h-11A2.5 2.5 0 012 4.5zM2.5 9.5A2.5 2.5 0 005 7h10a2.5 2.5 0 010 5H5a2.5 2.5 0 01-2.5-2.5zM3 15a2.5 2.5 0 002.5 2.5h9a2.5 2.5 0 000-5h-9A2.5 2.5 0 003 15z" />
                  </svg>
                  Sections
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Section Style</label>
                    <select
                      value={styles.contentSectionStyle}
                      onChange={(e) => updateStyle('contentSectionStyle', e.target.value as 'card' | 'flat' | 'bordered' | 'elevated')}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                    >
                      <option value="card">Card</option>
                      <option value="flat">Flat</option>
                      <option value="bordered">Bordered</option>
                      <option value="elevated">Elevated</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Background Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={styles.contentSectionBackgroundColor}
                        onChange={(e) => updateStyle('contentSectionBackgroundColor', e.target.value)}
                        className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={styles.contentSectionBackgroundColor}
                        onChange={(e) => updateStyle('contentSectionBackgroundColor', e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Border Radius: {styles.contentSectionBorderRadius}px</label>
                    <input
                      type="range"
                      min="0"
                      max="32"
                      value={styles.contentSectionBorderRadius}
                      onChange={(e) => updateStyle('contentSectionBorderRadius', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Elevation: {styles.contentSectionElevation}</label>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      value={styles.contentSectionElevation}
                      onChange={(e) => updateStyle('contentSectionElevation', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Inner Padding: {styles.contentSectionSpacing}px</label>
                    <input
                      type="range"
                      min="12"
                      max="48"
                      value={styles.contentSectionSpacing}
                      onChange={(e) => updateStyle('contentSectionSpacing', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Vertical Space Between: {styles.contentSectionVerticalSpacing || 32}px</label>
                    <input
                      type="range"
                      min="8"
                      max="64"
                      value={styles.contentSectionVerticalSpacing || 32}
                      onChange={(e) => updateStyle('contentSectionVerticalSpacing', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </section>

              {/* Link Styling */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-blue-500">
                    <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                    <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                  </svg>
                  Links
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Link Style</label>
                    <select
                      value={styles.contentLinkStyle}
                      onChange={(e) => updateStyle('contentLinkStyle', e.target.value as 'pill' | 'card' | 'minimal' | 'button')}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                    >
                      <option value="card">Card</option>
                      <option value="pill">Pill</option>
                      <option value="minimal">Minimal</option>
                      <option value="button">Button</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Hover Effect</label>
                    <select
                      value={styles.contentLinkHoverEffect}
                      onChange={(e) => updateStyle('contentLinkHoverEffect', e.target.value as 'lift' | 'glow' | 'scale' | 'slide')}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                    >
                      <option value="lift">Lift</option>
                      <option value="glow">Glow</option>
                      <option value="scale">Scale</option>
                      <option value="slide">Slide</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Background Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={styles.contentLinkBackgroundColor}
                        onChange={(e) => updateStyle('contentLinkBackgroundColor', e.target.value)}
                        className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={styles.contentLinkBackgroundColor}
                        onChange={(e) => updateStyle('contentLinkBackgroundColor', e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Border Radius: {styles.contentLinkBorderRadius}px</label>
                    <input
                      type="range"
                      min="0"
                      max="24"
                      value={styles.contentLinkBorderRadius}
                      onChange={(e) => updateStyle('contentLinkBorderRadius', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="contentLinkNoBorder"
                      checked={styles.contentLinkNoBorder}
                      onChange={(e) => updateStyle('contentLinkNoBorder', e.target.checked)}
                      className="w-4 h-4 text-brand-600 bg-slate-100 border-slate-300 rounded focus:ring-brand-500 dark:focus:ring-brand-600 dark:ring-offset-slate-800 focus:ring-2 dark:bg-slate-700 dark:border-slate-600"
                    />
                    <label htmlFor="contentLinkNoBorder" className="text-sm font-medium text-slate-700 dark:text-slate-300">No Border</label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Padding: {styles.contentLinkPadding}px</label>
                    <input
                      type="range"
                      min="8"
                      max="24"
                      value={styles.contentLinkPadding}
                      onChange={(e) => updateStyle('contentLinkPadding', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Spacing: {styles.contentLinkSpacing}px</label>
                    <input
                      type="range"
                      min="4"
                      max="24"
                      value={styles.contentLinkSpacing}
                      onChange={(e) => updateStyle('contentLinkSpacing', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Icon Size: {styles.contentLinkIconSize}px</label>
                    <input
                      type="range"
                      min="24"
                      max="64"
                      value={styles.contentLinkIconSize}
                      onChange={(e) => updateStyle('contentLinkIconSize', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </section>

              {/* Tab Styling */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-500">
                    <path d="M2 4.5A2.5 2.5 0 014.5 2h11a2.5 2.5 0 012.5 2.5v11a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 012 15.5v-11zM4.5 4a.5.5 0 00-.5.5V6h2V4H4.5zM8 4v2h2V4H8zm4 0v2h4V4h-4z" />
                  </svg>
                  Tabs
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tab Style</label>
                    <select
                      value={styles.contentTabStyle}
                      onChange={(e) => updateStyle('contentTabStyle', e.target.value as 'underline' | 'pill' | 'box' | 'minimal')}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                    >
                      <option value="underline">Underline</option>
                      <option value="pill">Pill</option>
                      <option value="box">Box</option>
                      <option value="minimal">Minimal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Active Tab Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={styles.contentTabActiveColor}
                        onChange={(e) => updateStyle('contentTabActiveColor', e.target.value)}
                        className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={styles.contentTabActiveColor}
                        onChange={(e) => updateStyle('contentTabActiveColor', e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Inactive Tab Color</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={styles.contentTabInactiveColor}
                        onChange={(e) => updateStyle('contentTabInactiveColor', e.target.value)}
                        className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={styles.contentTabInactiveColor}
                        onChange={(e) => updateStyle('contentTabInactiveColor', e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Border Radius: {styles.contentTabBorderRadius}px</label>
                    <input
                      type="range"
                      min="0"
                      max="16"
                      value={styles.contentTabBorderRadius}
                      onChange={(e) => updateStyle('contentTabBorderRadius', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </section>

              {/* Typography */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-indigo-500">
                    <path fillRule="evenodd" d="M10 2c-1.716 0-3.408.106-5.07.31C3.806 2.45 3 3.414 3 4.517V17.25a.75.75 0 001.075.676L10 15.082l5.925 2.844A.75.75 0 0017 17.25V4.517c0-1.103-.806-2.068-1.93-2.207A41.403 41.403 0 0010 2z" clipRule="evenodd" />
                  </svg>
                  Typography
                </h3>
                <div className="space-y-6">
                  {/* Title Typography */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Page Title</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pl-4 border-l-2 border-indigo-200 dark:border-indigo-800">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Family</label>
                        <select
                          value={styles.contentTitleFontFamily}
                          onChange={(e) => updateStyle('contentTitleFontFamily', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        >
                          <option value="inherit">Inherit (Default)</option>
                          <option value="Arial, sans-serif">Arial</option>
                          <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
                          <option value="Georgia, serif">Georgia</option>
                          <option value="Verdana, sans-serif">Verdana</option>
                          <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                          <option value="Tahoma, sans-serif">Tahoma</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Size: {styles.contentTitleFontSize}px</label>
                        <input
                          type="range"
                          min="18"
                          max="36"
                          value={styles.contentTitleFontSize}
                          onChange={(e) => updateStyle('contentTitleFontSize', parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Weight</label>
                        <select
                          value={styles.contentTitleFontWeight}
                          onChange={(e) => updateStyle('contentTitleFontWeight', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        >
                          <option value="normal">Normal</option>
                          <option value="500">Medium (500)</option>
                          <option value="600">Semi Bold (600)</option>
                          <option value="bold">Bold</option>
                          <option value="800">Extra Bold (800)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Style</label>
                        <select
                          value={styles.contentTitleFontStyle || 'normal'}
                          onChange={(e) => updateStyle('contentTitleFontStyle', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        >
                          <option value="normal">Normal</option>
                          <option value="italic">Italic</option>
                          <option value="oblique">Oblique</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Section Title Typography */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Section Title</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pl-4 border-l-2 border-emerald-200 dark:border-emerald-800">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Family</label>
                        <select
                          value={styles.contentSectionTitleFontFamily}
                          onChange={(e) => updateStyle('contentSectionTitleFontFamily', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        >
                          <option value="inherit">Inherit (Default)</option>
                          <option value="Arial, sans-serif">Arial</option>
                          <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
                          <option value="Georgia, serif">Georgia</option>
                          <option value="Verdana, sans-serif">Verdana</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Size: {styles.contentSectionTitleFontSize}px</label>
                        <input
                          type="range"
                          min="12"
                          max="24"
                          value={styles.contentSectionTitleFontSize}
                          onChange={(e) => updateStyle('contentSectionTitleFontSize', parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Weight</label>
                        <select
                          value={styles.contentSectionTitleFontWeight}
                          onChange={(e) => updateStyle('contentSectionTitleFontWeight', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        >
                          <option value="normal">Normal</option>
                          <option value="500">Medium (500)</option>
                          <option value="600">Semi Bold (600)</option>
                          <option value="bold">Bold</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Style</label>
                        <select
                          value={styles.contentSectionTitleFontStyle || 'normal'}
                          onChange={(e) => updateStyle('contentSectionTitleFontStyle', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        >
                          <option value="normal">Normal</option>
                          <option value="italic">Italic</option>
                          <option value="oblique">Oblique</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Link Typography */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">Link Text</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Family</label>
                        <select
                          value={styles.contentLinkFontFamily}
                          onChange={(e) => updateStyle('contentLinkFontFamily', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        >
                          <option value="inherit">Inherit (Default)</option>
                          <option value="Arial, sans-serif">Arial</option>
                          <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
                          <option value="Georgia, serif">Georgia</option>
                          <option value="Verdana, sans-serif">Verdana</option>
                          <option value="'Times New Roman', Times, serif">Times New Roman</option>
                          <option value="'Palatino Linotype', Palatino, serif">Palatino</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Size: {styles.contentLinkFontSize}px</label>
                        <input
                          type="range"
                          min="12"
                          max="18"
                          value={styles.contentLinkFontSize}
                          onChange={(e) => updateStyle('contentLinkFontSize', parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Weight</label>
                        <select
                          value={styles.contentLinkFontWeight}
                          onChange={(e) => updateStyle('contentLinkFontWeight', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        >
                          <option value="normal">Normal</option>
                          <option value="500">Medium (500)</option>
                          <option value="600">Semi Bold (600)</option>
                          <option value="bold">Bold</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Style</label>
                        <select
                          value={styles.contentLinkFontStyle || 'normal'}
                          onChange={(e) => updateStyle('contentLinkFontStyle', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                        >
                          <option value="normal">Normal</option>
                          <option value="italic">Italic</option>
                          <option value="oblique">Oblique</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Visual Enhancements */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-rose-500">
                    <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM10 7a3 3 0 100 6 3 3 0 000-6zM15.657 5.404a.75.75 0 10-1.06-1.06l-1.061 1.06a.75.75 0 001.06 1.06l1.06-1.06zM6.464 14.596a.75.75 0 10-1.06-1.06l-1.06 1.06a.75.75 0 001.06 1.06l1.06-1.06zM18 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zM14.596 15.657a.75.75 0 001.06-1.06l-1.06-1.061a.75.75 0 10-1.06 1.06l1.06 1.06zM5.404 6.464a.75.75 0 001.06-1.06l-1.06-1.06a.75.75 0 10-1.06 1.06l1.06 1.06z" />
                  </svg>
                  Visual Enhancements
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="contentShowLinkIcons"
                        checked={styles.contentShowLinkIcons}
                        onChange={(e) => updateStyle('contentShowLinkIcons', e.target.checked)}
                        className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                      />
                      <label htmlFor="contentShowLinkIcons" className="text-sm font-medium text-slate-700 dark:text-slate-300">Show Link Icons</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="contentShowLinkDomain"
                        checked={styles.contentShowLinkDomain}
                        onChange={(e) => updateStyle('contentShowLinkDomain', e.target.checked)}
                        className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                      />
                      <label htmlFor="contentShowLinkDomain" className="text-sm font-medium text-slate-700 dark:text-slate-300">Show Domain</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="contentShowHealthStatus"
                        checked={styles.contentShowHealthStatus}
                        onChange={(e) => updateStyle('contentShowHealthStatus', e.target.checked)}
                        className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                      />
                      <label htmlFor="contentShowHealthStatus" className="text-sm font-medium text-slate-700 dark:text-slate-300">Health Status</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="contentAnimateLinks"
                        checked={styles.contentAnimateLinks}
                        onChange={(e) => updateStyle('contentAnimateLinks', e.target.checked)}
                        className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                      />
                      <label htmlFor="contentAnimateLinks" className="text-sm font-medium text-slate-700 dark:text-slate-300">Animate Links</label>
                    </div>
                  </div>
                  {styles.contentAnimateLinks && (
                    <div className="pl-4 border-l-2 border-rose-200 dark:border-rose-800">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Animation Delay: {styles.contentLinkAnimationDelay}ms</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={styles.contentLinkAnimationDelay}
                        onChange={(e) => updateStyle('contentLinkAnimationDelay', parseInt(e.target.value))}
                        className="w-full max-w-xs"
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Delay between each link's entrance animation</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Grid Settings */}
              <section>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-cyan-500">
                    <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v11.5A2.25 2.25 0 0115.75 18h-11.5A2.25 2.25 0 012 15.75V4.25zm3.75 7.5a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zm2.25-3a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5H8zm2.25-3a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zm2.25 6a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5zm2.25-3a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5z" clipRule="evenodd" />
                  </svg>
                  Grid Columns
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Small (sm)</label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={styles.contentGridColumns?.sm || 1}
                      onChange={(e) => updateNestedStyle('contentGridColumns.sm', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Medium (md)</label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={styles.contentGridColumns?.md || 2}
                      onChange={(e) => updateNestedStyle('contentGridColumns.md', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Large (lg)</label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={styles.contentGridColumns?.lg || 3}
                      onChange={(e) => updateNestedStyle('contentGridColumns.lg', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Extra Large (xl)</label>
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={styles.contentGridColumns?.xl || 4}
                      onChange={(e) => updateNestedStyle('contentGridColumns.xl', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex gap-2">
            {user?.is_admin && (
              <button
                onClick={handleExport}
                className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 00-1.09 1.03l4.25 4.5a.75.75 0 001.07 0l4.25-4.5a.75.75 0 00-1.08-1.03l-2.955 3.129V2.75z" />
                  <path d="M3.5 12.75a.75.75 0 00-1.5 0v3.5A2.75 2.75 0 004.75 19h10.5A2.75 2.75 0 0018 16.25v-3.5a.75.75 0 00-1.5 0v3.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-3.5z" />
                </svg>
                Export
              </button>
            )}
            {user?.is_admin && (
              <>
                <button
                  onClick={handleImport}
                  className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.08-1.03l-4.25-4.5a.75.75 0 00-1.08 0l-4.25 4.5a.75.75 0 101.08 1.03l2.955-3.13V13.25zM3.5 12.75a.75.75 0 00-1.5 0v3.5A2.75 2.75 0 004.75 19h10.5A2.75 2.75 0 0018 16.25v-3.5a.75.75 0 00-1.5 0v3.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-3.5z" />
                  </svg>
                  Import
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </>
            )}
            <button
              onClick={handleReset}
              disabled={isSaving}
              className="px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
              </svg>
              Reset
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="px-5 py-2 text-sm bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-all shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/30 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 00-1.09 1.03l4.25 4.5a.75.75 0 001.07 0l4.25-4.5a.75.75 0 00-1.08-1.03l-2.955 3.129V2.75z" />
                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v3.5A2.75 2.75 0 004.75 19h10.5A2.75 2.75 0 0018 16.25v-3.5a.75.75 0 00-1.5 0v3.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-3.5z" />
                  </svg>
                  Save
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

