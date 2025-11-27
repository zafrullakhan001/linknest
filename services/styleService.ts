// Use Vite's runtime value if available, but don't depend on its TypeScript types
const API_BASE = (import.meta as any)?.env?.VITE_API_BASE || '/api';

export interface SpaceStyles {
  // Tile/Space styling
  tileBackgroundColor: string;
  tileBorderColor: string;
  tileBorderWidth: number;
  tileBorderRadius: number;
  tilePadding: number;
  tileElevation: number; // Shadow intensity (0-5)
  
  // Spacing
  tileGap: number; // Gap between tiles
  categorySpacing: number; // Spacing between categories
  
  // Gradient
  useGradient: boolean;
  gradientType: 'linear' | 'radial' | 'conic';
  gradientDirection: number; // 0-360 degrees for linear
  gradientStartColor: string;
  gradientEndColor: string;
  gradientStop: number; // 0-100 for gradient stop position
  
  // Hover effects
  hoverElevation: number;
  hoverScale: number; // 1.0 = no scale, 1.1 = 10% larger
  hoverTranslateY: number; // pixels to move up on hover
  
  // Visual effects
  raisedEffect: boolean; // 3D raised appearance with multiple shadows
  raisedIntensity: number; // 0-5, intensity of raised effect
  metallicEffect: boolean; // Metallic/shiny appearance
  metallicType: 'silver' | 'gold' | 'chrome' | 'bronze' | 'copper' | 'custom';
  metallicIntensity: number; // 0-100, intensity of metallic effect
  metallicCustomColor: string; // Custom color for metallic effect
  
  // Category header styling
  categoryHeaderColor: string;
  categoryHeaderSize: number; // font size
  categoryHeaderSpacing: number; // margin bottom
  
  // Grid settings
  gridColumns: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
}

export const DEFAULT_STYLES: SpaceStyles = {
  tileBackgroundColor: '#ffffff',
  tileBorderColor: '#e2e8f0',
  tileBorderWidth: 1,
  tileBorderRadius: 12,
  tilePadding: 16,
  tileElevation: 0,
  tileGap: 16,
  categorySpacing: 32,
  useGradient: false,
  gradientType: 'linear',
  gradientDirection: 135,
  gradientStartColor: '#3b82f6',
  gradientEndColor: '#8b5cf6',
  gradientStop: 50,
  hoverElevation: 2,
  hoverScale: 1.0,
  hoverTranslateY: -2,
  raisedEffect: false,
  raisedIntensity: 3,
  metallicEffect: false,
  metallicType: 'silver',
  metallicIntensity: 50,
  metallicCustomColor: '#c0c0c0',
  categoryHeaderColor: '#475569',
  categoryHeaderSize: 14,
  categoryHeaderSpacing: 12,
  gridColumns: {
    sm: 1,
    md: 2,
    lg: 3,
    xl: 4
  }
};

export const styleService = {
  async getStyles(): Promise<SpaceStyles> {
    try {
      const response = await fetch(`${API_BASE}/styles`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-cache'
      });

      if (!response.ok) {
        // If no styles exist, return defaults
        return { ...DEFAULT_STYLES };
      }

      const data = await response.json();
      if (data.styles) {
        // Merge with defaults to ensure all properties exist
        return { ...DEFAULT_STYLES, ...data.styles };
      }

      return { ...DEFAULT_STYLES };
    } catch (error) {
      console.error('Failed to load styles:', error);
      return { ...DEFAULT_STYLES };
    }
  },

  async saveStyles(styles: SpaceStyles): Promise<void> {
    const response = await fetch(`${API_BASE}/styles`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ styles })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to save styles');
    }
  },

  async resetStyles(): Promise<void> {
    const response = await fetch(`${API_BASE}/styles`, {
      method: 'DELETE',
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to reset styles');
    }
  },

  exportStyles(styles: SpaceStyles): void {
    const dataStr = JSON.stringify(styles, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `linknest-styles-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  async importStyles(file: File): Promise<SpaceStyles> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const imported = JSON.parse(content);
          
          // Validate and merge with defaults
          const styles: SpaceStyles = {
            ...DEFAULT_STYLES,
            ...imported
          };
          
          // Validate grid columns
          if (!styles.gridColumns || typeof styles.gridColumns !== 'object') {
            styles.gridColumns = { ...DEFAULT_STYLES.gridColumns };
          }
          
          resolve(styles);
        } catch (error) {
          reject(new Error('Invalid style file format'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  },

  generateCSS(styles: SpaceStyles, isDark: boolean = false): string {
    const shadowIntensity = styles.tileElevation;
    const hoverShadowIntensity = styles.hoverElevation;
    
    const shadows = [
      'none',
      '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
      '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
      '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
      '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
    ];
    
    const hoverShadows = [
      'none',
      '0 2px 4px 0 rgba(0, 0, 0, 0.1)',
      '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
      '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
      '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
    ];
    
    let gradientCSS = '';
    if (styles.useGradient) {
      if (styles.gradientType === 'linear') {
        gradientCSS = `linear-gradient(${styles.gradientDirection}deg, ${styles.gradientStartColor} ${styles.gradientStop}%, ${styles.gradientEndColor})`;
      } else if (styles.gradientType === 'radial') {
        gradientCSS = `radial-gradient(circle, ${styles.gradientStartColor} ${styles.gradientStop}%, ${styles.gradientEndColor})`;
      } else if (styles.gradientType === 'conic') {
        gradientCSS = `conic-gradient(from ${styles.gradientDirection}deg, ${styles.gradientStartColor} ${styles.gradientStop}%, ${styles.gradientEndColor})`;
      }
    }
    
    // Build background with effects
    let bgColor = styles.useGradient ? gradientCSS : styles.tileBackgroundColor;
    
    // Metallic effect
    let metallicCSS = '';
    if (styles.metallicEffect) {
      const metallicColors: Record<string, { start: string; mid: string; end: string; highlight: string }> = {
        silver: { start: '#e8e8e8', mid: '#c0c0c0', end: '#a8a8a8', highlight: '#ffffff' },
        gold: { start: '#ffd700', mid: '#ffed4e', end: '#daa520', highlight: '#fffacd' },
        chrome: { start: '#e8e8e8', mid: '#d0d0d0', end: '#b0b0b0', highlight: '#f5f5f5' },
        bronze: { start: '#cd7f32', mid: '#b87333', end: '#8b4513', highlight: '#daa520' },
        copper: { start: '#b87333', mid: '#cd7f32', end: '#8b4513', highlight: '#daa520' },
        custom: { start: styles.metallicCustomColor, mid: styles.metallicCustomColor, end: styles.metallicCustomColor, highlight: '#ffffff' }
      };
      
      const metallic = metallicColors[styles.metallicType] || metallicColors.silver;
      const intensity = styles.metallicIntensity / 100;
      
      // Create metallic gradient with highlight
      metallicCSS = `linear-gradient(135deg, 
        ${metallic.highlight} 0%, 
        ${metallic.start} ${10 * intensity}%, 
        ${metallic.mid} 50%, 
        ${metallic.end} ${90 * intensity}%, 
        ${metallic.start} 100%
      )`;
      
      // If gradient is already set, combine them
      if (styles.useGradient) {
        bgColor = `${metallicCSS}, ${gradientCSS}`;
      } else {
        bgColor = metallicCSS;
      }
    }
    
    // Raised effect shadows
    let raisedShadow = '';
    if (styles.raisedEffect) {
      const intensity = styles.raisedIntensity;
      const baseShadow = shadows[Math.min(shadowIntensity, 5)];
      
      // Create multi-layer shadow for 3D raised effect
      const raisedShadows = [
        '', // 0 - no raised effect
        '0 2px 4px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.1)', // 1
        '0 4px 8px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.15)', // 2
        '0 6px 12px rgba(0, 0, 0, 0.15), 0 3px 6px rgba(0, 0, 0, 0.1), inset 0 2px 0 rgba(255, 255, 255, 0.2)', // 3
        '0 8px 16px rgba(0, 0, 0, 0.18), 0 4px 8px rgba(0, 0, 0, 0.12), inset 0 2px 0 rgba(255, 255, 255, 0.25)', // 4
        '0 12px 24px rgba(0, 0, 0, 0.2), 0 6px 12px rgba(0, 0, 0, 0.15), inset 0 3px 0 rgba(255, 255, 255, 0.3)' // 5
      ];
      
      raisedShadow = raisedShadows[Math.min(intensity, 5)];
    }
    
    const finalShadow = styles.raisedEffect && raisedShadow 
      ? raisedShadow 
      : shadows[Math.min(shadowIntensity, 5)];
    
    return `
      .linknest-tile {
        background: ${bgColor} !important;
        border-color: ${styles.tileBorderColor} !important;
        border-width: ${styles.tileBorderWidth}px !important;
        border-radius: ${styles.tileBorderRadius}px !important;
        padding: ${styles.tilePadding}px !important;
        box-shadow: ${finalShadow} !important;
        ${styles.raisedEffect ? 'transform: translateY(-1px);' : ''}
        ${styles.metallicEffect ? 'position: relative; overflow: hidden;' : ''}
      }
      
      ${styles.metallicEffect ? `
      .linknest-tile::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 50%;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%);
        border-radius: ${styles.tileBorderRadius}px ${styles.tileBorderRadius}px 0 0;
        pointer-events: none;
        z-index: 1;
      }
      .linknest-tile > * {
        position: relative;
        z-index: 2;
      }
      ` : ''}
      
      .linknest-tile:hover {
        box-shadow: ${styles.raisedEffect && raisedShadow 
          ? `0 ${8 + hoverShadowIntensity * 2}px ${16 + hoverShadowIntensity * 4}px rgba(0, 0, 0, 0.2), 0 ${4 + hoverShadowIntensity}px ${8 + hoverShadowIntensity * 2}px rgba(0, 0, 0, 0.15), inset 0 2px 0 rgba(255, 255, 255, 0.3)` 
          : hoverShadows[Math.min(hoverShadowIntensity, 5)]} !important;
        transform: translateY(${styles.raisedEffect ? -styles.hoverTranslateY - 1 : -styles.hoverTranslateY}px) scale(${styles.hoverScale}) !important;
      }
      
      .linknest-tile-grid {
        gap: ${styles.tileGap}px !important;
      }
      
      .linknest-category {
        margin-bottom: ${styles.categorySpacing}px !important;
      }
      
      .linknest-category-header {
        color: ${styles.categoryHeaderColor} !important;
        font-size: ${styles.categoryHeaderSize}px !important;
        margin-bottom: ${styles.categoryHeaderSpacing}px !important;
      }
      
      @media (min-width: 640px) {
        .linknest-tile-grid {
          grid-template-columns: repeat(${styles.gridColumns.sm}, minmax(0, 1fr)) !important;
        }
      }
      
      @media (min-width: 768px) {
        .linknest-tile-grid {
          grid-template-columns: repeat(${styles.gridColumns.md}, minmax(0, 1fr)) !important;
        }
      }
      
      @media (min-width: 1024px) {
        .linknest-tile-grid {
          grid-template-columns: repeat(${styles.gridColumns.lg}, minmax(0, 1fr)) !important;
        }
      }
      
      @media (min-width: 1280px) {
        .linknest-tile-grid {
          grid-template-columns: repeat(${styles.gridColumns.xl}, minmax(0, 1fr)) !important;
        }
      }
    `;
  }
};

