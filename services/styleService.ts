// Resolve API base so it works both in dev (/api via Vite proxy)
// and in XAMPP/production where the app is served from /linknest.
// Protocol-agnostic: uses relative URLs that work with both HTTP and HTTPS
function resolveApiBase(): string {
  // Prefer Vite-injected env when available
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) {
    return envBase;
  }

  // Fallback based on current location (runtime)
  // This automatically uses the same protocol (HTTP/HTTPS) as the page
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    // If app is served from /linknest, use /linknest/api
    if (path.startsWith('/linknest')) {
      return '/linknest/api';
    }
  }

  // Default dev / generic fallback
  // Using relative URL ensures it works with both HTTP and HTTPS
  return '/api';
}

const API_BASE = resolveApiBase();

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
  categoryFontFamily: string;
  categoryFontWeight: string;
  categoryFontStyle: string;
  
  // Tile/Space font styling
  tileFontFamily: string;
  tileFontSize: number;
  tileFontWeight: string;
  tileFontStyle: string;
  
  // Page title font styling
  pageTitleFontFamily: string;
  pageTitleFontSize: number;
  pageTitleFontWeight: string;
  pageTitleFontStyle: string;
  pageTitleGradientEnabled: boolean;
  
  // Spaces title (Landing page heading) font styling
  spacesTitleFontFamily: string;
  spacesTitleFontSize: number;
  spacesTitleFontWeight: string;
  spacesTitleFontStyle: string;
  
  // Grid settings
  gridColumns: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  
  // Background/Page styling
  backgroundRaised: boolean; // Raised table-like background
  backgroundTableType: 'wood' | 'marble' | 'metal' | 'fabric' | 'clean';
  backgroundRaisedIntensity: number; // 0-5, how raised the background appears
  backgroundTableColor: string; // Base color for table surface
  backgroundTableWidth: number; // 0-100, percentage width of the table (0 = full width, 100 = max-width container)
  backgroundUseGradient: boolean; // Use gradient for background
  backgroundGradientType: 'linear' | 'radial' | 'conic';
  backgroundGradientDirection: number; // 0-360 degrees for linear
  backgroundGradientStartColor: string;
  backgroundGradientEndColor: string;
  backgroundGradientStop: number; // 0-100 for gradient stop position
  backgroundMetallicEffect: boolean; // Metallic effect for background
  backgroundMetallicType: 'silver' | 'gold' | 'chrome' | 'bronze' | 'copper' | 'custom';
  backgroundMetallicIntensity: number; // 0-100, intensity of metallic effect
  backgroundMetallicCustomColor: string; // Custom color for metallic effect
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
  categoryFontFamily: 'inherit',
  categoryFontWeight: 'bold',
  categoryFontStyle: 'normal',
  tileFontFamily: 'inherit',
  tileFontSize: 14,
  tileFontWeight: 'bold',
  tileFontStyle: 'normal',
  pageTitleFontFamily: 'inherit',
  pageTitleFontSize: 20,
  pageTitleFontWeight: 'bold',
  pageTitleFontStyle: 'normal',
  pageTitleGradientEnabled: true,
  spacesTitleFontFamily: 'inherit',
  spacesTitleFontSize: 24,
  spacesTitleFontWeight: 'bold',
  spacesTitleFontStyle: 'normal',
  gridColumns: {
    sm: 1,
    md: 2,
    lg: 3,
    xl: 4
  },
  backgroundRaised: false,
  backgroundTableType: 'wood',
  backgroundRaisedIntensity: 3,
  backgroundTableColor: '#8b7355',
  backgroundTableWidth: 100,
  backgroundUseGradient: false,
  backgroundGradientType: 'linear',
  backgroundGradientDirection: 135,
  backgroundGradientStartColor: '#8b7355',
  backgroundGradientEndColor: '#6b5238',
  backgroundGradientStop: 50,
  backgroundMetallicEffect: false,
  backgroundMetallicType: 'silver',
  backgroundMetallicIntensity: 50,
  backgroundMetallicCustomColor: '#c0c0c0'
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
        color: ${isDark ? '#cbd5e1' : styles.categoryHeaderColor} !important;
        font-size: ${styles.categoryHeaderSize}px !important;
        margin-bottom: ${styles.categoryHeaderSpacing}px !important;
        font-family: ${styles.categoryFontFamily} !important;
        font-weight: ${styles.categoryFontWeight} !important;
        font-style: ${styles.categoryFontStyle} !important;
      }
      
      .linknest-tile h3 {
        font-family: ${styles.tileFontFamily} !important;
        font-size: ${styles.tileFontSize}px !important;
        font-weight: ${styles.tileFontWeight} !important;
        font-style: ${styles.tileFontStyle} !important;
      }
      
      .linknest-page-title {
        font-family: ${styles.pageTitleFontFamily} !important;
        font-size: ${styles.pageTitleFontSize}px !important;
        font-weight: ${styles.pageTitleFontWeight} !important;
        font-style: ${styles.pageTitleFontStyle} !important;
        ${styles.pageTitleGradientEnabled 
          ? `background-clip: text !important;
        -webkit-background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
        background-image: linear-gradient(to right, rgb(30 41 55), rgb(100 116 139)) !important;`
          : `color: ${isDark ? 'rgb(255 255 255)' : 'rgb(30 41 55)'} !important;`}
      }
      
      ${styles.pageTitleGradientEnabled 
        ? `.dark .linknest-page-title {
        background-image: linear-gradient(to right, rgb(255 255 255), rgb(148 163 184)) !important;
      }`
        : ''}
      
      .linknest-spaces-title {
        font-family: ${styles.spacesTitleFontFamily} !important;
        font-size: ${styles.spacesTitleFontSize}px !important;
        font-weight: ${styles.spacesTitleFontWeight} !important;
        font-style: ${styles.spacesTitleFontStyle} !important;
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
      
      ${styles.backgroundRaised ? `
      /* Raised Table Background */
      .linknest-page-background {
        position: relative;
        background: ${getTableBackground(styles)} !important;
        border-radius: 16px;
        padding: 24px;
        margin: 20px auto;
        width: ${styles.backgroundTableWidth}%;
        max-width: ${styles.backgroundTableWidth === 100 ? 'calc(100% - 40px)' : `${styles.backgroundTableWidth}%`};
        box-shadow: ${getTableShadow(styles.backgroundRaisedIntensity)} !important;
        border: 2px solid ${getTableBorder(styles.backgroundTableType)};
      }
      
      ${styles.backgroundMetallicEffect ? `
      .linknest-page-background::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 50%;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%);
        border-radius: 14px 14px 0 0;
        pointer-events: none;
        z-index: 0;
      }
      ` : `
      .linknest-page-background::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border-radius: 14px;
        background: ${getTableOverlay(styles)};
        pointer-events: none;
        z-index: 0;
      }
      `}
      
      .linknest-page-background > * {
        position: relative;
        z-index: 1;
      }
      ` : ''}
    `;
  }
};

// Helper functions for table background effects
function getTableBackground(styles: SpaceStyles): string {
  const baseColor = styles.backgroundTableColor;
  
  // Build base texture/pattern based on table type
  let basePattern = '';
  switch (styles.backgroundTableType) {
    case 'wood':
      basePattern = `linear-gradient(135deg, 
        ${darkenColor(baseColor, 0.1)} 0%, 
        ${baseColor} 25%, 
        ${lightenColor(baseColor, 0.05)} 50%, 
        ${baseColor} 75%, 
        ${darkenColor(baseColor, 0.1)} 100%
      ), repeating-linear-gradient(
        90deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.03) 2px,
        rgba(0, 0, 0, 0.03) 4px
      )`;
      break;
    case 'marble':
      basePattern = `linear-gradient(135deg, 
        ${lightenColor(baseColor, 0.2)} 0%, 
        ${baseColor} 30%, 
        ${lightenColor(baseColor, 0.1)} 50%, 
        ${baseColor} 70%, 
        ${darkenColor(baseColor, 0.1)} 100%
      ), radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.3) 0%, transparent 50%)`;
      break;
    case 'metal':
      basePattern = `linear-gradient(135deg, 
        ${lightenColor(baseColor, 0.15)} 0%, 
        ${baseColor} 25%, 
        ${darkenColor(baseColor, 0.1)} 50%, 
        ${baseColor} 75%, 
        ${lightenColor(baseColor, 0.1)} 100%
      )`;
      break;
    case 'fabric':
      basePattern = `repeating-linear-gradient(
        45deg,
        ${baseColor},
        ${baseColor} 10px,
        ${darkenColor(baseColor, 0.05)} 10px,
        ${darkenColor(baseColor, 0.05)} 20px
      )`;
      break;
    case 'clean':
    default:
      basePattern = baseColor;
      break;
  }
  
  // Add gradient if enabled
  let gradientCSS = '';
  if (styles.backgroundUseGradient) {
    if (styles.backgroundGradientType === 'linear') {
      gradientCSS = `linear-gradient(${styles.backgroundGradientDirection}deg, ${styles.backgroundGradientStartColor} ${styles.backgroundGradientStop}%, ${styles.backgroundGradientEndColor})`;
    } else if (styles.backgroundGradientType === 'radial') {
      gradientCSS = `radial-gradient(circle, ${styles.backgroundGradientStartColor} ${styles.backgroundGradientStop}%, ${styles.backgroundGradientEndColor})`;
    } else if (styles.backgroundGradientType === 'conic') {
      gradientCSS = `conic-gradient(from ${styles.backgroundGradientDirection}deg, ${styles.backgroundGradientStartColor} ${styles.backgroundGradientStop}%, ${styles.backgroundGradientEndColor})`;
    }
  }
  
  // Add metallic effect if enabled
  let metallicCSS = '';
  if (styles.backgroundMetallicEffect) {
    const metallicColors: Record<string, { start: string; mid: string; end: string; highlight: string }> = {
      silver: { start: '#e8e8e8', mid: '#c0c0c0', end: '#a8a8a8', highlight: '#ffffff' },
      gold: { start: '#ffd700', mid: '#ffed4e', end: '#daa520', highlight: '#fffacd' },
      chrome: { start: '#e8e8e8', mid: '#d0d0d0', end: '#b0b0b0', highlight: '#f5f5f5' },
      bronze: { start: '#cd7f32', mid: '#b87333', end: '#8b4513', highlight: '#daa520' },
      copper: { start: '#b87333', mid: '#cd7f32', end: '#8b4513', highlight: '#daa520' },
      custom: { start: styles.backgroundMetallicCustomColor, mid: styles.backgroundMetallicCustomColor, end: styles.backgroundMetallicCustomColor, highlight: '#ffffff' }
    };
    
    const metallic = metallicColors[styles.backgroundMetallicType] || metallicColors.silver;
    const intensity = styles.backgroundMetallicIntensity / 100;
    
    metallicCSS = `linear-gradient(135deg, 
      ${metallic.highlight} 0%, 
      ${metallic.start} ${10 * intensity}%, 
      ${metallic.mid} 50%, 
      ${metallic.end} ${90 * intensity}%, 
      ${metallic.start} 100%
    )`;
  }
  
  // Combine all effects
  const layers: string[] = [];
  
  // Base pattern/texture first
  if (basePattern) {
    layers.push(basePattern);
  }
  
  // Gradient second (if enabled)
  if (gradientCSS) {
    layers.push(gradientCSS);
  }
  
  // Metallic effect last (if enabled)
  if (metallicCSS) {
    layers.push(metallicCSS);
  }
  
  // If only one layer, return it directly, otherwise combine
  if (layers.length === 0) {
    return baseColor;
  } else if (layers.length === 1) {
    return layers[0];
  } else {
    return layers.join(', ');
  }
}

function getTableShadow(intensity: number): string {
  const shadows = [
    '0 2px 8px rgba(0, 0, 0, 0.1), 0 1px 4px rgba(0, 0, 0, 0.06)',
    '0 4px 12px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08)',
    '0 8px 24px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
    '0 12px 32px rgba(0, 0, 0, 0.18), 0 6px 16px rgba(0, 0, 0, 0.12), inset 0 2px 0 rgba(255, 255, 255, 0.15)',
    '0 16px 40px rgba(0, 0, 0, 0.2), 0 8px 20px rgba(0, 0, 0, 0.15), inset 0 2px 0 rgba(255, 255, 255, 0.2)',
    '0 20px 48px rgba(0, 0, 0, 0.25), 0 10px 24px rgba(0, 0, 0, 0.18), inset 0 3px 0 rgba(255, 255, 255, 0.25)'
  ];
  return shadows[Math.min(intensity, 5)];
}

function getTableBorder(type: string): string {
  const borders: Record<string, string> = {
    wood: 'rgba(101, 67, 33, 0.3)',
    marble: 'rgba(200, 200, 200, 0.4)',
    metal: 'rgba(150, 150, 150, 0.5)',
    fabric: 'rgba(100, 100, 100, 0.2)',
    clean: 'rgba(0, 0, 0, 0.1)'
  };
  return borders[type] || borders.clean;
}

function getTableOverlay(styles: SpaceStyles): string {
  if (styles.backgroundTableType === 'wood') {
    return `linear-gradient(180deg, 
      rgba(255, 255, 255, 0.05) 0%, 
      transparent 30%, 
      transparent 70%, 
      rgba(0, 0, 0, 0.05) 100%
    )`;
  } else if (styles.backgroundTableType === 'marble') {
    return `radial-gradient(ellipse at top left, rgba(255, 255, 255, 0.2) 0%, transparent 50%)`;
  } else if (styles.backgroundTableType === 'metal') {
    return `linear-gradient(135deg, 
      rgba(255, 255, 255, 0.1) 0%, 
      transparent 50%, 
      rgba(0, 0, 0, 0.05) 100%
    )`;
  }
  return 'transparent';
}

function lightenColor(color: string, amount: number): string {
  // Simple color lightening - convert hex to RGB, lighten, convert back
  let hex = color.replace('#', '');
  
  // Handle 3-digit hex codes
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  
  // Validate hex color
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return color; // Return original if invalid
  }
  
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  const newR = Math.min(255, Math.floor(r + (255 - r) * amount));
  const newG = Math.min(255, Math.floor(g + (255 - g) * amount));
  const newB = Math.min(255, Math.floor(b + (255 - b) * amount));
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

function darkenColor(color: string, amount: number): string {
  // Simple color darkening
  let hex = color.replace('#', '');
  
  // Handle 3-digit hex codes
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('');
  }
  
  // Validate hex color
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return color; // Return original if invalid
  }
  
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  const newR = Math.max(0, Math.floor(r * (1 - amount)));
  const newG = Math.max(0, Math.floor(g * (1 - amount)));
  const newB = Math.max(0, Math.floor(b * (1 - amount)));
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

