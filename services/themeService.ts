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
    name: 'glassmorphism',
    displayName: 'Glassmorphism',
    description: 'Translucent dark teal-blue with blurred backgrounds',
    previewColors: ['#0f172a', '#1e293b', '#334155']
  },
  {
    name: 'ocean-blue',
    displayName: 'Ocean Blue',
    description: 'Deep oceanic blues with transparent layers',
    previewColors: ['#0c4a6e', '#075985', '#0369a1']
  },
  {
    name: 'forest-green',
    displayName: 'Forest Green',
    description: 'Rich forest greens with glass effects',
    previewColors: ['#14532d', '#166534', '#15803d']
  },
  {
    name: 'cyan-mist',
    displayName: 'Cyan Mist',
    description: 'Bright cyan with misty transparency',
    previewColors: ['#155e75', '#0891b2', '#06b6d4']
  },
  {
    name: 'emerald-glass',
    displayName: 'Emerald Glass',
    description: 'Vibrant emerald with glassmorphism',
    previewColors: ['#064e3b', '#047857', '#059669']
  },
  {
    name: 'azure-sky',
    displayName: 'Azure Sky',
    description: 'Bright azure sky with soft transparency',
    previewColors: ['#1e40af', '#2563eb', '#3b82f6']
  },
  {
    name: 'teal-waves',
    displayName: 'Teal Waves',
    description: 'Flowing teal waves with glass effects',
    previewColors: ['#134e4a', '#0f766e', '#14b8a6']
  },
  {
    name: 'mint-frost',
    displayName: 'Mint Frost',
    description: 'Cool mint with frosty glass texture',
    previewColors: ['#065f46', '#047857', '#10b981']
  },
  {
    name: 'sapphire-night',
    displayName: 'Sapphire Night',
    description: 'Deep sapphire with night mode glass',
    previewColors: ['#1e3a8a', '#1e40af', '#2563eb']
  },
  {
    name: 'aqua-marine',
    displayName: 'Aqua Marine',
    description: 'Aquamarine tones with marine depth',
    previewColors: ['#164e63', '#0e7490', '#06b6d4']
  },
  {
    name: 'jade-shimmer',
    displayName: 'Jade Shimmer',
    description: 'Jade green with shimmering effects',
    previewColors: ['#064e3b', '#047857', '#34d399']
  },
  {
    name: 'arctic-ice',
    displayName: 'Arctic Ice',
    description: 'Cool ice blue with crystalline transparency',
    previewColors: ['#0c4a6e', '#075985', '#0ea5e9']
  },
  {
    name: 'tropical-lagoon',
    displayName: 'Tropical Lagoon',
    description: 'Tropical turquoise lagoon vibes',
    previewColors: ['#155e75', '#0891b2', '#22d3ee']
  },
  {
    name: 'deep-sea',
    displayName: 'Deep Sea',
    description: 'Deep sea blues with mysterious depth',
    previewColors: ['#0c1222', '#1e3a5f', '#3b82f6']
  },
  {
    name: 'neon-cyan',
    displayName: 'Neon Cyan',
    description: 'Vibrant neon cyan with modern glow',
    previewColors: ['#164e63', '#0891b2', '#67e8f9']
  },
  {
    name: 'pastel-blue',
    displayName: 'Pastel Blue',
    description: 'Soft pastel blues with gentle transparency',
    previewColors: ['#3b82f6', '#60a5fa', '#93c5fd']
  },
  {
    name: 'sea-foam',
    displayName: 'Sea Foam',
    description: 'Light sea foam green with bubbly effects',
    previewColors: ['#047857', '#10b981', '#6ee7b7']
  },
  {
    name: 'glacier',
    displayName: 'Glacier',
    description: 'Cool glacier blue with icy clarity',
    previewColors: ['#0e7490', '#06b6d4', '#67e8f9']
  },
  {
    name: 'pacific-blue',
    displayName: 'Pacific Blue',
    description: 'Vast Pacific Ocean blue tones',
    previewColors: ['#1e40af', '#2563eb', '#60a5fa']
  },
  {
    name: 'mint-glass',
    displayName: 'Mint Glass',
    description: 'Fresh mint with clear glass effects',
    previewColors: ['#065f46', '#10b981', '#6ee7b7']
  },
  {
    name: 'turquoise-dream',
    displayName: 'Turquoise Dream',
    description: 'Dreamy turquoise with ethereal transparency',
    previewColors: ['#0f766e', '#14b8a6', '#5eead4']
  },
  {
    name: 'modern',
    displayName: 'Modern',
    description: 'Contemporary design with vibrant colors',
    previewColors: ['#1a1a2e', '#16213e', '#0f3460']
  },
  {
    name: 'classic',
    displayName: 'Classic',
    description: 'Traditional and professional look',
    previewColors: ['#1f2937', '#374151', '#4b5563']
  },
  {
    name: 'minimal',
    displayName: 'Minimal',
    description: 'Clean and simple design',
    previewColors: ['#ffffff', '#f3f4f6', '#e5e7eb']
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

      const css = `
        .theme-${themeName} .linknest-app-container {
          background: linear-gradient(135deg, ${customization.primaryColor} 0%, ${customization.secondaryColor} 50%, ${customization.primaryColor} 100%) !important;
        }
        .theme-${themeName} nav,
        .theme-${themeName} .bg-white,
        .theme-${themeName} .dark\\:bg-slate-800 {
          background: ${hexToRgba(customization.secondaryColor, customization.opacity)} !important;
          backdrop-filter: blur(${customization.blurIntensity}px) saturate(180%) !important;
          -webkit-backdrop-filter: blur(${customization.blurIntensity}px) saturate(180%) !important;
          border-color: ${hexToRgba(customization.accentColor, customization.borderOpacity)} !important;
        }
        .theme-${themeName} [class*="rounded"],
        .theme-${themeName} .linknest-tile {
          background: ${hexToRgba(customization.secondaryColor, customization.opacity - 0.1)} !important;
          backdrop-filter: blur(${customization.blurIntensity}px) saturate(180%) !important;
          -webkit-backdrop-filter: blur(${customization.blurIntensity}px) saturate(180%) !important;
          border: 1px solid ${hexToRgba(customization.accentColor, customization.borderOpacity)} !important;
        }
        .theme-${themeName} .linknest-tile:hover {
          border-color: ${hexToRgba(customization.accentColor, customization.borderOpacity + 0.2)} !important;
          box-shadow: 0 12px 40px 0 ${hexToRgba(customization.accentColor, 0.3)} !important;
        }
        .theme-${themeName} .bg-brand-500,
        .theme-${themeName} .bg-brand-600 {
          background: linear-gradient(135deg, ${customization.accentColor} 0%, ${adjustBrightness(customization.accentColor, 20)} 100%) !important;
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
