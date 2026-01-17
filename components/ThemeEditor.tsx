import React, { useState, useEffect, useCallback, useRef } from 'react';
import { themeService, ThemeName } from '../services/themeService';

interface ThemeEditorProps {
  themeName: ThemeName;
  onClose: () => void;
  onSave: () => void;
}

interface ThemeCustomization {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  opacity: number;
  blurIntensity: number;
  borderOpacity: number;
}

// Get default colors based on theme
const getDefaultCustomization = (themeName: ThemeName): ThemeCustomization => {
  const themeDefaults: Record<ThemeName, ThemeCustomization> = {
    'default': { primaryColor: '#f8fafc', secondaryColor: '#e2e8f0', accentColor: '#6366f1', opacity: 1.0, blurIntensity: 0, borderOpacity: 0.25 },
    'glassmorphism': { primaryColor: '#0f172a', secondaryColor: '#1e293b', accentColor: '#06b6d4', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'ocean-blue': { primaryColor: '#0c4a6e', secondaryColor: '#075985', accentColor: '#0ea5e9', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'forest-green': { primaryColor: '#14532d', secondaryColor: '#166534', accentColor: '#22c55e', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'cyan-mist': { primaryColor: '#155e75', secondaryColor: '#0891b2', accentColor: '#67e8f9', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'emerald-glass': { primaryColor: '#064e3b', secondaryColor: '#047857', accentColor: '#10b981', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'azure-sky': { primaryColor: '#1e40af', secondaryColor: '#2563eb', accentColor: '#60a5fa', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'teal-waves': { primaryColor: '#134e4a', secondaryColor: '#0f766e', accentColor: '#5eead4', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'mint-frost': { primaryColor: '#065f46', secondaryColor: '#047857', accentColor: '#6ee7b7', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'sapphire-night': { primaryColor: '#1e3a8a', secondaryColor: '#1e40af', accentColor: '#3b82f6', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'aqua-marine': { primaryColor: '#164e63', secondaryColor: '#0e7490', accentColor: '#22d3ee', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'jade-shimmer': { primaryColor: '#064e3b', secondaryColor: '#047857', accentColor: '#6ee7b7', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'arctic-ice': { primaryColor: '#0c4a6e', secondaryColor: '#075985', accentColor: '#7dd3fc', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'tropical-lagoon': { primaryColor: '#155e75', secondaryColor: '#0891b2', accentColor: '#67e8f9', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'deep-sea': { primaryColor: '#0c1222', secondaryColor: '#1e3a5f', accentColor: '#60a5fa', opacity: 0.8, blurIntensity: 20, borderOpacity: 0.25 },
    'neon-cyan': { primaryColor: '#164e63', secondaryColor: '#0891b2', accentColor: '#a5f3fc', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.35 },
    'pastel-blue': { primaryColor: '#1e40af', secondaryColor: '#3b82f6', accentColor: '#bfdbfe', opacity: 0.65, blurIntensity: 20, borderOpacity: 0.3 },
    'sea-foam': { primaryColor: '#047857', secondaryColor: '#10b981', accentColor: '#a7f3d0', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'glacier': { primaryColor: '#0e7490', secondaryColor: '#06b6d4', accentColor: '#cffafe', opacity: 0.75, blurIntensity: 25, borderOpacity: 0.3 },
    'pacific-blue': { primaryColor: '#1e40af', secondaryColor: '#2563eb', accentColor: '#93c5fd', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'mint-glass': { primaryColor: '#065f46', secondaryColor: '#10b981', accentColor: '#a7f3d0', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'turquoise-dream': { primaryColor: '#0f766e', secondaryColor: '#14b8a6', accentColor: '#99f6e4', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.3 },
    'modern': { primaryColor: '#1a1a2e', secondaryColor: '#16213e', accentColor: '#533483', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'classic': { primaryColor: '#1f2937', secondaryColor: '#374151', accentColor: '#6366f1', opacity: 0.75, blurIntensity: 20, borderOpacity: 0.25 },
    'minimal': { primaryColor: '#ffffff', secondaryColor: '#f3f4f6', accentColor: '#6366f1', opacity: 0.9, blurIntensity: 10, borderOpacity: 0.2 },
  };

  return themeDefaults[themeName] || themeDefaults['glassmorphism'];
};

export const ThemeEditor: React.FC<ThemeEditorProps> = ({ themeName, onClose, onSave }) => {
  const [customization, setCustomization] = useState<ThemeCustomization>(() => {
    const stored = localStorage.getItem(`linknest_theme_custom_${themeName}`);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return getDefaultCustomization(themeName);
      }
    }
    return getDefaultCustomization(themeName);
  });

  const [preview, setPreview] = useState(true);

  // Drag functionality state
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dialogRef = useRef<HTMLDivElement>(null);

  // Debounce timer for performance
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Memoized preview application for performance
  const applyPreviewStylesMemoized = useCallback(() => {
    const styleId = 'theme-editor-preview';
    let styleTag = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }

    // Check if this is a glassmorphism theme or default theme
    const isGlassmorphismTheme = themeName !== 'default' && themeName !== 'classic' && themeName !== 'minimal';
    const useBlur = isGlassmorphismTheme && customization.blurIntensity > 0;

    const css = `
      .theme-${themeName} .linknest-app-container {
        background: ${isGlassmorphismTheme
        ? `linear-gradient(135deg, ${customization.primaryColor} 0%, ${customization.secondaryColor} 50%, ${customization.primaryColor} 100%)`
        : customization.primaryColor} !important;
        ${isGlassmorphismTheme ? 'background-attachment: fixed;' : ''}
      }
      .theme-${themeName} nav,
      .theme-${themeName} .bg-white,
      .theme-${themeName} .dark\\:bg-slate-800 {
        background: ${isGlassmorphismTheme
        ? hexToRgba(customization.secondaryColor, customization.opacity)
        : customization.secondaryColor} !important;
        ${useBlur ? `backdrop-filter: blur(${customization.blurIntensity}px) saturate(180%) !important;` : ''}
        ${useBlur ? `-webkit-backdrop-filter: blur(${customization.blurIntensity}px) saturate(180%) !important;` : ''}
        border-color: ${hexToRgba(customization.accentColor, customization.borderOpacity)} !important;
      }
      .theme-${themeName} [class*="rounded"],
      .theme-${themeName} .linknest-tile {
        background: ${isGlassmorphismTheme
        ? hexToRgba(customization.secondaryColor, customization.opacity - 0.1)
        : customization.secondaryColor} !important;
        ${useBlur ? `backdrop-filter: blur(${customization.blurIntensity}px) saturate(180%) !important;` : ''}
        ${useBlur ? `-webkit-backdrop-filter: blur(${customization.blurIntensity}px) saturate(180%) !important;` : ''}
        border: 1px solid ${hexToRgba(customization.accentColor, customization.borderOpacity)} !important;
      }
      .theme-${themeName} .linknest-tile:hover {
        border-color: ${hexToRgba(customization.accentColor, customization.borderOpacity + 0.2)} !important;
        ${isGlassmorphismTheme ? `box-shadow: 0 12px 40px 0 ${hexToRgba(customization.accentColor, 0.3)} !important;` : ''}
      }
      .theme-${themeName} .bg-brand-500,
      .theme-${themeName} .bg-brand-600 {
        background: ${isGlassmorphismTheme
        ? `linear-gradient(135deg, ${customization.accentColor} 0%, ${adjustBrightness(customization.accentColor, 20)} 100%)`
        : customization.accentColor} !important;
      }
      .theme-${themeName} .text-brand-500,
      .theme-${themeName} .text-brand-600 {
        color: ${customization.accentColor} !important;
      }
    `;

    styleTag.textContent = css;
  }, [customization, themeName]);

  // Debounced preview update for performance
  useEffect(() => {
    if (preview) {
      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new timer with 16ms delay (60fps) for smooth, flicker-free updates
      debounceTimerRef.current = setTimeout(() => {
        applyPreviewStylesMemoized();
      }, 16); // 16ms debounce for 60fps smooth updates
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      removePreviewStyles();
    };
  }, [customization, preview, applyPreviewStylesMemoized]);

  const applyPreviewStyles = () => {
    const styleId = 'theme-editor-preview';
    let styleTag = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }

    // Check if this is a glassmorphism theme or default theme
    const isGlassmorphismTheme = themeName !== 'default' && themeName !== 'classic' && themeName !== 'minimal';
    const useBlur = isGlassmorphismTheme && customization.blurIntensity > 0;

    const css = `
      .theme-${themeName} .linknest-app-container {
        background: ${isGlassmorphismTheme
        ? `linear-gradient(135deg, ${customization.primaryColor} 0%, ${customization.secondaryColor} 50%, ${customization.primaryColor} 100%)`
        : customization.primaryColor} !important;
        ${isGlassmorphismTheme ? 'background-attachment: fixed;' : ''}
      }
      .theme-${themeName} nav,
      .theme-${themeName} .bg-white,
      .theme-${themeName} .dark\\:bg-slate-800 {
        background: ${isGlassmorphismTheme
        ? hexToRgba(customization.secondaryColor, customization.opacity)
        : customization.secondaryColor} !important;
        ${useBlur ? `backdrop-filter: blur(${customization.blurIntensity}px) saturate(180%) !important;` : ''}
        ${useBlur ? `-webkit-backdrop-filter: blur(${customization.blurIntensity}px) saturate(180%) !important;` : ''}
        border-color: ${hexToRgba(customization.accentColor, customization.borderOpacity)} !important;
      }
      .theme-${themeName} [class*="rounded"],
      .theme-${themeName} .linknest-tile {
        background: ${isGlassmorphismTheme
        ? hexToRgba(customization.secondaryColor, customization.opacity - 0.1)
        : customization.secondaryColor} !important;
        ${useBlur ? `backdrop-filter: blur(${customization.blurIntensity}px) saturate(180%) !important;` : ''}
        ${useBlur ? `-webkit-backdrop-filter: blur(${customization.blurIntensity}px) saturate(180%) !important;` : ''}
        border: 1px solid ${hexToRgba(customization.accentColor, customization.borderOpacity)} !important;
      }
      .theme-${themeName} .linknest-tile:hover {
        border-color: ${hexToRgba(customization.accentColor, customization.borderOpacity + 0.2)} !important;
        ${isGlassmorphismTheme ? `box-shadow: 0 12px 40px 0 ${hexToRgba(customization.accentColor, 0.3)} !important;` : ''}
      }
      .theme-${themeName} .bg-brand-500,
      .theme-${themeName} .bg-brand-600 {
        background: ${isGlassmorphismTheme
        ? `linear-gradient(135deg, ${customization.accentColor} 0%, ${adjustBrightness(customization.accentColor, 20)} 100%)`
        : customization.accentColor} !important;
      }
      .theme-${themeName} .text-brand-500,
      .theme-${themeName} .text-brand-600 {
        color: ${customization.accentColor} !important;
      }
    `;

    styleTag.textContent = css;
  };

  const removePreviewStyles = () => {
    const styleTag = document.getElementById('theme-editor-preview');
    if (styleTag) {
      styleTag.remove();
    }
  };

  const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const adjustBrightness = (hex: string, percent: number): string => {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, Math.max(0, (num >> 16) + amt));
    const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
    const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  };

  const handleSave = () => {
    localStorage.setItem(`linknest_theme_custom_${themeName}`, JSON.stringify(customization));
    applyPreviewStylesMemoized(); // Keep preview styles as permanent
    onSave();
  };

  const handleReset = () => {
    const defaults = getDefaultCustomization(themeName);
    setCustomization(defaults);
    localStorage.removeItem(`linknest_theme_custom_${themeName}`);
    removePreviewStyles();
  };

  const handleResetToOriginal = () => {
    // Remove all custom styles for this theme
    localStorage.removeItem(`linknest_theme_custom_${themeName}`);

    // Remove the preview style tag
    removePreviewStyles();

    // Remove the permanent custom style tag
    const customStyleTag = document.getElementById(`theme-custom-${themeName}`);
    if (customStyleTag) {
      customStyleTag.remove();
    }

    // Reset to default customization values
    const defaults = getDefaultCustomization(themeName);
    setCustomization(defaults);

    // Reapply the base theme without customizations
    themeService.applyTheme(themeName);

    // Close the editor
    onClose();
  };

  const updateCustomization = useCallback((key: keyof ThemeCustomization, value: any) => {
    setCustomization(prev => ({ ...prev, [key]: value }));
  }, []);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Allow dragging from header or its children
    if (dialogRef.current) {
      e.preventDefault();
      setIsDragging(true);
      const rect = dialogRef.current.getBoundingClientRect();
      // Store offset from current position, not from dialog's top-left
      setDragStart({
        x: e.clientX - (position.x || rect.left),
        y: e.clientY - (position.y || rect.top)
      });
    }
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging && dialogRef.current) {
      e.preventDefault();
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      // Keep dialog within viewport bounds
      const maxX = window.innerWidth - dialogRef.current.offsetWidth;
      const maxY = window.innerHeight - dialogRef.current.offsetHeight;


      // Use requestAnimationFrame for smooth 60fps dragging
      requestAnimationFrame(() => {
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div className="fixed inset-0 bg-black/10 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{
          position: 'fixed',
          left: position.x ? `${position.x}px` : '50%',
          top: position.y ? `${position.y}px` : '50%',
          transform: position.x || position.y ? 'none' : 'translate(-50%, -50%)',
          cursor: isDragging ? 'grabbing' : 'default',
          willChange: isDragging ? 'transform' : 'auto'
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6 flex items-center justify-between z-10 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
        >
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Edit Theme</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Customize "{themeService.getTheme(themeName)?.displayName || themeName}" theme
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Color Pickers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Primary Color
              </label>
              <div className="flex gap-3 items-center">
                <div className="relative group">
                  <input
                    type="color"
                    value={customization.primaryColor}
                    onChange={(e) => updateCustomization('primaryColor', e.target.value)}
                    className="w-24 h-16 rounded-xl border-4 border-slate-300 dark:border-slate-600 cursor-pointer hover:border-brand-500 hover:scale-105 transition-all shadow-lg hover:shadow-xl"
                    style={{ backgroundColor: customization.primaryColor }}
                    title="Click to select primary color"
                  />
                  <div className="absolute -bottom-1 -right-1 bg-slate-900 text-white text-xs px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Pick
                  </div>
                </div>
                <input
                  type="text"
                  value={customization.primaryColor}
                  onChange={(e) => updateCustomization('primaryColor', e.target.value)}
                  className="flex-1 px-4 py-3 border-2 border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  placeholder="#1e293b"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Secondary Color
              </label>
              <div className="flex gap-3 items-center">
                <div className="relative group">
                  <input
                    type="color"
                    value={customization.secondaryColor}
                    onChange={(e) => updateCustomization('secondaryColor', e.target.value)}
                    className="w-24 h-16 rounded-xl border-4 border-slate-300 dark:border-slate-600 cursor-pointer hover:border-brand-500 hover:scale-105 transition-all shadow-lg hover:shadow-xl"
                    style={{ backgroundColor: customization.secondaryColor }}
                    title="Click to select secondary color"
                  />
                  <div className="absolute -bottom-1 -right-1 bg-slate-900 text-white text-xs px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Pick
                  </div>
                </div>
                <input
                  type="text"
                  value={customization.secondaryColor}
                  onChange={(e) => updateCustomization('secondaryColor', e.target.value)}
                  className="flex-1 px-4 py-3 border-2 border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  placeholder="#334155"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Accent Color
              </label>
              <div className="flex gap-3 items-center">
                <div className="relative group">
                  <input
                    type="color"
                    value={customization.accentColor}
                    onChange={(e) => updateCustomization('accentColor', e.target.value)}
                    className="w-24 h-16 rounded-xl border-4 border-slate-300 dark:border-slate-600 cursor-pointer hover:border-brand-500 hover:scale-105 transition-all shadow-lg hover:shadow-xl"
                    style={{ backgroundColor: customization.accentColor }}
                    title="Click to select accent color"
                  />
                  <div className="absolute -bottom-1 -right-1 bg-slate-900 text-white text-xs px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Pick
                  </div>
                </div>
                <input
                  type="text"
                  value={customization.accentColor}
                  onChange={(e) => updateCustomization('accentColor', e.target.value)}
                  className="flex-1 px-4 py-3 border-2 border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                  placeholder="#06b6d4"
                />
              </div>
            </div>
          </div>

          {/* Sliders */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Background Opacity: {Math.round(customization.opacity * 100)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={customization.opacity}
                onChange={(e) => updateCustomization('opacity', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span>10%</span>
                <span>100%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Blur Intensity: {customization.blurIntensity}px
              </label>
              <input
                type="range"
                min="0"
                max="40"
                step="2"
                value={customization.blurIntensity}
                onChange={(e) => updateCustomization('blurIntensity', parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span>0px</span>
                <span>40px</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Border Opacity: {Math.round(customization.borderOpacity * 100)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={customization.borderOpacity}
                onChange={(e) => updateCustomization('borderOpacity', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                <span>10%</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          {/* Preview Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Live Preview</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">See changes in real-time</p>
            </div>
            <button
              onClick={() => {
                setPreview(!preview);
                if (preview) {
                  removePreviewStyles();
                } else {
                  applyPreviewStyles();
                }
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${preview ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${preview ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>

          {/* Preview Box */}
          <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-lg border-2 border-slate-200 dark:border-slate-700">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-3">Live Preview:</p>
            <div
              className="p-6 rounded-xl border-2 relative z-10 shadow-lg"
              style={{
                background: customization.blurIntensity > 0
                  ? `rgba(${parseInt(customization.secondaryColor.slice(1, 3), 16)}, ${parseInt(customization.secondaryColor.slice(3, 5), 16)}, ${parseInt(customization.secondaryColor.slice(5, 7), 16)}, ${customization.opacity})`
                  : customization.secondaryColor,
                backdropFilter: customization.blurIntensity > 0 ? `blur(${customization.blurIntensity}px)` : 'none',
                WebkitBackdropFilter: customization.blurIntensity > 0 ? `blur(${customization.blurIntensity}px)` : 'none',
                borderColor: `${customization.accentColor}${Math.round(customization.borderOpacity * 255).toString(16).padStart(2, '0')}`,
                minHeight: '150px',
              }}
            >
              {/* Background pattern for preview context */}
              <div
                className="absolute inset-0 rounded-xl opacity-20 -z-10"
                style={{
                  background: `linear-gradient(135deg, ${customization.primaryColor} 0%, ${customization.secondaryColor} 100%)`,
                }}
              />

              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-lg shadow-md"
                    style={{ backgroundColor: customization.accentColor }}
                  />
                  <div>
                    <h4 className="font-semibold text-white drop-shadow-sm">Sample Card</h4>
                    <p className="text-sm text-white/80 drop-shadow-sm">This is how your theme will look</p>
                  </div>
                </div>
                <button
                  className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  style={{
                    background: customization.blurIntensity > 0
                      ? `linear-gradient(135deg, ${customization.accentColor} 0%, ${adjustBrightness(customization.accentColor, 20)} 100%)`
                      : customization.accentColor,
                  }}
                >
                  Sample Button
                </button>
              </div>
            </div>

            {/* Color swatches preview */}
            <div className="mt-4 flex gap-2">
              <div className="flex-1">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Primary</p>
                <div
                  className="h-8 rounded border border-slate-300 dark:border-slate-600"
                  style={{ backgroundColor: customization.primaryColor }}
                />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Secondary</p>
                <div
                  className="h-8 rounded border border-slate-300 dark:border-slate-600"
                  style={{ backgroundColor: customization.secondaryColor }}
                />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Accent</p>
                <div
                  className="h-8 rounded border border-slate-300 dark:border-slate-600"
                  style={{ backgroundColor: customization.accentColor }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-6 flex items-center justify-between gap-4">
          <div className="flex gap-3">
            <button
              onClick={handleResetToOriginal}
              className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-red-200 dark:border-red-800"
              title="Remove all customizations and return to original theme"
            >
              Reset to Original
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title="Reset to default colors for this theme"
            >
              Reset to Default
            </button>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
