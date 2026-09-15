// Theme service to manage application themes
export type ThemeName = 
  | 'default' 
  | 'glassmorphism' 
  | 'modern' 
  | 'classic' 
  | 'minimal'
  | 'ocean-blue'
  | 'forest-green'
  | 'cyan-mist'
  | 'emerald-glass'
  | 'azure-sky'
  | 'teal-waves'
  | 'mint-frost'
  | 'sapphire-night'
  | 'aqua-marine'
  | 'jade-shimmer'
  | 'arctic-ice'
  | 'tropical-lagoon'
  | 'deep-sea'
  | 'neon-cyan'
  | 'pastel-blue'
  | 'sea-foam'
  | 'glacier'
  | 'pacific-blue'
  | 'mint-glass'
  | 'turquoise-dream';

export interface Theme {
  name: ThemeName;
  displayName: string;
  description: string;
  previewColors: string[]; // Array of color hex codes for preview
}

export const AVAILABLE_THEMES: Theme[] = [
  {
    name: 'default',
    displayName: 'Default',
    description: 'Standard dark and light theme',
    previewColors: ['#1e293b', '#334155', '#475569']
  },
  {
    name: 'minimal',
    displayName: 'Minimal',
    description: 'Clean and simple design',
    previewColors: ['#ffffff', '#f3f4f6', '#e5e7eb']
  },
  {
    name: 'classic',
    displayName: 'Classic',
    description: 'Traditional and professional look',
    previewColors: ['#1f2937', '#374151', '#4b5563']
  },
  {
    name: 'modern',
    displayName: 'Modern',
    description: 'Contemporary design with vibrant colors',
    previewColors: ['#1a1a2e', '#16213e', '#0f3460']
  }
];

const STORAGE_KEY = 'linknest_theme_name';
const DEFAULT_THEME: ThemeName = 'default';

export const themeService = {
  /**
   * Get the current theme name from localStorage
   */
  getCurrentTheme(): ThemeName {
    if (typeof window === 'undefined') return DEFAULT_THEME;
    
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && AVAILABLE_THEMES.some(t => t.name === stored)) {
      return stored as ThemeName;
    }
    return DEFAULT_THEME;
  },

  /**
   * Set the theme name and save to localStorage
   */
  setTheme(themeName: ThemeName): void {
    if (typeof window === 'undefined') return;
    
    localStorage.setItem(STORAGE_KEY, themeName);
    
    // Apply theme to document
    this.applyTheme(themeName);
  },

  /**
   * Apply theme classes to document
   */
  applyTheme(themeName: ThemeName): void {
    if (typeof document === 'undefined') return;
    
    // Remove all theme classes (comprehensive list)
    const allThemeClasses = [
      'theme-default', 'theme-glassmorphism', 'theme-modern', 'theme-classic', 'theme-minimal',
      'theme-ocean-blue', 'theme-forest-green', 'theme-cyan-mist', 'theme-emerald-glass',
      'theme-azure-sky', 'theme-teal-waves', 'theme-mint-frost', 'theme-sapphire-night',
      'theme-aqua-marine', 'theme-jade-shimmer', 'theme-arctic-ice', 'theme-tropical-lagoon',
      'theme-deep-sea', 'theme-neon-cyan', 'theme-pastel-blue', 'theme-sea-foam',
      'theme-glacier', 'theme-pacific-blue', 'theme-mint-glass', 'theme-turquoise-dream'
    ];
    
    document.documentElement.classList.remove(...allThemeClasses);
    
    // Add current theme class
    document.documentElement.classList.add(`theme-${themeName}`);
    
    // Apply custom theme modifications if they exist
    this.applyCustomThemeStyles(themeName);
  },

  /**
   * Apply custom theme modifications from localStorage
   */
  applyCustomThemeStyles(themeName: ThemeName): void {
    if (typeof document === 'undefined') return;
    
    const stored = localStorage.getItem(`linknest_theme_custom_${themeName}`);
    if (!stored) {
      // Remove any existing custom styles for this theme
      const existingStyle = document.getElementById(`theme-custom-${themeName}`);
      if (existingStyle) {
        existingStyle.remove();
      }
      return;
    }

    try {
      const customization = JSON.parse(stored);
      const styleId = `theme-custom-${themeName}`;
      let styleTag = document.getElementById(styleId) as HTMLStyleElement | null;
      
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        document.head.appendChild(styleTag);
      }

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

      // Check if this is a glassmorphism theme or default theme
      const isGlassmorphismTheme = themeName !== 'default' && themeName !== 'classic' && themeName !== 'minimal' && themeName !== 'modern';
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
    } catch (error) {
      console.error('Failed to apply custom theme styles:', error);
    }
  },

  /**
   * Get theme object by name
   */
  getTheme(themeName: ThemeName): Theme | undefined {
    return AVAILABLE_THEMES.find(t => t.name === themeName);
  },

  /**
   * Initialize theme on page load
   */
  initialize(): void {
    const themeName = this.getCurrentTheme();
    this.applyTheme(themeName);
  }
};

// Initialize theme on module load (if in browser)
if (typeof window !== 'undefined') {
  themeService.initialize();
}
