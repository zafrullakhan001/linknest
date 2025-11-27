import React, { useState, useEffect, useRef } from 'react';
import { SpaceStyles, DEFAULT_STYLES, styleService } from '../services/styleService';

interface StyleManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onStylesChange?: (styles: SpaceStyles) => void;
}

export const StyleManager: React.FC<StyleManagerProps> = ({ isOpen, onClose, onStylesChange }) => {
  const [styles, setStyles] = useState<SpaceStyles>(DEFAULT_STYLES);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
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
      const updated = { ...prev };
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
    try {
      styleService.exportStyles(styles);
      alert('Styles exported successfully!');
    } catch (error) {
      console.error('Failed to export styles:', error);
      alert('Failed to export styles');
    }
  };

  const handleImport = async () => {
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

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-180px)] p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
            </div>
          ) : (
            <div className="space-y-6">
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
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex gap-2">
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

