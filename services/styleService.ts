// Resolve API base dynamically based on current location
// Protocol-agnostic: uses relative URLs that work with both HTTP and HTTPS
function resolveApiBase(): string {
  // Prefer Vite-injected env when available
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) {
    return envBase;
  }

  // Fallback: dynamically detect base path from current location
  // This automatically uses the same protocol (HTTP/HTTPS) as the page
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    
    // Extract base path (everything before the last segment or root)
    // Examples:
    // /myapp/ -> /myapp/api
    // /myapp/index.html -> /myapp/api
    // / -> /api
    if (path !== '/' && path.length > 1) {
      // Remove trailing slash and any filename
      const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
      if (cleanPath && cleanPath !== '/') {
        return `${cleanPath}/api`;
      }
    }
  }

  // Default fallback (root deployment)
  // Using relative URL ensures it works with both HTTP and HTTPS
  return '/api';
}

const API_BASE = resolveApiBase();

export interface SpaceStyles {
  // Global Page Settings
  pageZoom: number; // Global page zoom percentage (50-150)

  // Tile/Space styling
  tileBackgroundColor: string;
  tileDarkBackgroundColor: string; // Dark mode background color
  tileBorderColor: string;
  tileDarkBorderColor: string; // Dark mode border color
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
  
  // Tile description text styling
  tileDescriptionTextColor: string;
  tileDescriptionDarkTextColor: string; // Dark mode text color
  tileDescriptionFontFamily: string;
  tileDescriptionFontSize: number;
  tileDescriptionFontStyle: string; // 'normal' | 'italic'

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

  // Hero Section Styling
  heroSectionEnabled: boolean;
  heroSectionStyle: 'gradient' | 'solid' | 'glassmorphism' | 'minimal';
  heroSectionBackgroundColor: string;
  heroSectionGradientStart: string;
  heroSectionGradientEnd: string;
  heroSectionGradientDirection: number; // 0-360 degrees
  heroSectionGradientType: 'linear' | 'radial' | 'conic';
  heroSectionBlur: number; // For glassmorphism (0-20)
  heroSectionOpacity: number; // 0-100
  heroSectionBorderRadius: number;
  heroSectionPadding: number;
  heroSectionMarginBottom: number;
  heroSectionElevation: number; // Shadow (0-5)
  heroSectionBorderWidth: number;
  heroSectionBorderColor: string;
  heroSectionShowAnimatedOrbs: boolean;
  heroSectionOrbColor1: string;
  heroSectionOrbColor2: string;
  heroSectionOrbColor3: string;
  heroSectionOrbOpacity: number; // 0-100
  heroSectionTitleGradientEnabled: boolean;
  heroSectionTitleGradientStart: string;
  heroSectionTitleGradientMid: string;
  heroSectionTitleGradientEnd: string;
  heroSectionTextColor: string;
  heroSectionDarkTextColor: string;

  // Footer font styling
  footerFontFamily: string;
  footerFontSize: number;
  footerFontWeight: string;
  footerFontStyle: string;
  footerColor: string;

  // Spaces Grid Tab Styling
  spacesTabStyle: 'underline' | 'pill' | 'box' | 'minimal';
  spacesTabActiveColor: string;
  spacesTabInactiveColor: string;
  spacesTabBorderRadius: number;
  spacesTabFontFamily: string;
  spacesTabFontSize: number;
  spacesTabFontWeight: string;
  spacesTabFontStyle: string;

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

  // Content Page UX Styling
  contentHeaderStyle: 'gradient' | 'solid' | 'glassmorphism' | 'minimal';
  contentHeaderGradientStart: string;
  contentHeaderGradientEnd: string;
  contentHeaderGradientDirection: number;
  contentHeaderSolidColor: string;
  contentHeaderBlur: number; // For glassmorphism effect (0-20)
  contentHeaderOpacity: number; // 0-100

  // Content Section Styling
  contentSectionStyle: 'card' | 'flat' | 'bordered' | 'elevated' | 'gradient';
  contentSectionBackgroundColor: string;
  contentSectionBorderColor: string;
  contentSectionBorderRadius: number;
  contentSectionElevation: number;
  contentSectionSpacing: number;
  contentSectionGradientStart: string;
  contentSectionGradientEnd: string;
  contentSectionGradientDirection: number;
  contentSectionTopBarEnabled: boolean;
  contentSectionTopBarColor: string;
  contentSectionTopBarHeight: number;

  // Content Link Styling
  contentLinkStyle: 'pill' | 'card' | 'minimal' | 'button';
  contentLinkBackgroundColor: string;
  contentLinkBorderColor: string;
  contentLinkNoBorder: boolean;
  contentLinkBorderRadius: number;
  contentLinkHoverEffect: 'lift' | 'glow' | 'scale' | 'slide';
  contentLinkPadding: number;
  contentLinkSpacing: number;
  contentLinkIconSize: number;

  // Content Tab Styling
  contentTabStyle: 'underline' | 'pill' | 'box' | 'minimal';
  contentTabActiveColor: string;
  contentTabInactiveColor: string;
  contentTabBorderRadius: number;
  contentTabFontFamily: string;
  contentTabFontSize: number;
  contentTabFontWeight: string;
  contentTabFontStyle: string;

  // Content Typography
  contentTitleFontFamily: string;
  contentTitleFontSize: number;
  contentTitleFontWeight: string;
  contentTitleFontStyle: string;
  contentSectionTitleFontFamily: string;
  contentSectionTitleFontSize: number;
  contentSectionTitleFontWeight: string;
  contentSectionTitleFontStyle: string;
  contentLinkFontFamily: string;
  contentLinkFontSize: number;
  contentLinkFontWeight: string;
  contentLinkFontStyle: string;

  // Content Section Vertical Spacing
  contentSectionVerticalSpacing: number; // Space between sections

  // Content Visual Enhancements
  contentShowLinkIcons: boolean;
  contentShowLinkDomain: boolean;
  contentShowHealthStatus: boolean;
  contentAnimateLinks: boolean;
  contentLinkAnimationDelay: number; // ms between each link animation

  // Content Grid settings
  contentGridColumns: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
}

export const DEFAULT_STYLES: SpaceStyles = {
  pageZoom: 100,
  tileBackgroundColor: '#ffffff',
  tileDarkBackgroundColor: '#1e293b',
  tileBorderColor: '#e2e8f0',
  tileDarkBorderColor: 'rgba(148, 163, 184, 0.3)',
  tileBorderWidth: 1,
  tileBorderRadius: 12,
  tilePadding: 16,
  tileElevation: 0,
  tileGap: 16,
  categorySpacing: 5,
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
  tileDescriptionTextColor: '#475569',
  tileDescriptionDarkTextColor: 'rgb(148, 163, 184)',
  tileDescriptionFontFamily: 'inherit',
  tileDescriptionFontSize: 12,
  tileDescriptionFontStyle: 'normal',
  pageTitleFontFamily: 'inherit',
  pageTitleFontSize: 20,
  pageTitleFontWeight: 'bold',
  pageTitleFontStyle: 'normal',
  pageTitleGradientEnabled: true,
  spacesTitleFontFamily: 'inherit',
  spacesTitleFontSize: 24,
  spacesTitleFontWeight: 'bold',
  spacesTitleFontStyle: 'normal',
  heroSectionEnabled: true,
  heroSectionStyle: 'gradient',
  heroSectionBackgroundColor: '#ffffff',
  heroSectionGradientStart: '#eef2ff',
  heroSectionGradientEnd: '#ddd6fe',
  heroSectionGradientDirection: 135,
  heroSectionGradientType: 'linear',
  heroSectionBlur: 12,
  heroSectionOpacity: 100,
  heroSectionBorderRadius: 16,
  heroSectionPadding: 32,
  heroSectionMarginBottom: 32,
  heroSectionElevation: 2,
  heroSectionBorderWidth: 1,
  heroSectionBorderColor: 'rgba(99, 102, 241, 0.2)',
  heroSectionShowAnimatedOrbs: true,
  heroSectionOrbColor1: '#3b82f6',
  heroSectionOrbColor2: '#8b5cf6',
  heroSectionOrbColor3: '#60a5fa',
  heroSectionOrbOpacity: 20,
  heroSectionTitleGradientEnabled: true,
  heroSectionTitleGradientStart: '#3b82f6',
  heroSectionTitleGradientMid: '#8b5cf6',
  heroSectionTitleGradientEnd: '#3b82f6',
  heroSectionTextColor: '#1e293b',
  heroSectionDarkTextColor: '#ffffff',
  footerFontFamily: 'inherit',
  footerFontSize: 14,
  footerFontWeight: 'normal',
  footerFontStyle: 'normal',
  footerColor: '#94a3b8',
  spacesTabStyle: 'underline',
  spacesTabActiveColor: '#3b82f6',
  spacesTabInactiveColor: '#64748b',
  spacesTabBorderRadius: 0,
  spacesTabFontFamily: 'inherit',
  spacesTabFontSize: 14,
  spacesTabFontWeight: '500',
  spacesTabFontStyle: 'normal',
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
  backgroundMetallicCustomColor: '#c0c0c0',

  // Content Page UX Defaults
  contentHeaderStyle: 'gradient',
  contentHeaderGradientStart: '#3b82f6',
  contentHeaderGradientEnd: '#8b5cf6',
  contentHeaderGradientDirection: 135,
  contentHeaderSolidColor: '#3b82f6',
  contentHeaderBlur: 12,
  contentHeaderOpacity: 95,

  contentSectionStyle: 'card',
  contentSectionBackgroundColor: '#ffffff',
  contentSectionBorderColor: '#e2e8f0',
  contentSectionBorderRadius: 16,
  contentSectionElevation: 1,
  contentSectionSpacing: 24,
  contentSectionGradientStart: '#3b82f6',
  contentSectionGradientEnd: '#8b5cf6',
  contentSectionGradientDirection: 135,
  contentSectionTopBarEnabled: false,
  contentSectionTopBarColor: '#3b82f6',
  contentSectionTopBarHeight: 4,

  contentLinkStyle: 'card',
  contentLinkBackgroundColor: '#ffffff',
  contentLinkBorderColor: '#e2e8f0',
  contentLinkNoBorder: false,
  contentLinkBorderRadius: 12,
  contentLinkHoverEffect: 'lift',
  contentLinkPadding: 16,
  contentLinkSpacing: 12,
  contentLinkIconSize: 40,

  contentTabStyle: 'underline',
  contentTabActiveColor: '#3b82f6',
  contentTabInactiveColor: '#64748b',
  contentTabBorderRadius: 8,
  contentTabFontFamily: 'inherit',
  contentTabFontSize: 14,
  contentTabFontWeight: '500',
  contentTabFontStyle: 'normal',

  contentTitleFontFamily: 'inherit',
  contentTitleFontSize: 24,
  contentTitleFontWeight: 'bold',
  contentTitleFontStyle: 'normal',
  contentSectionTitleFontFamily: 'inherit',
  contentSectionTitleFontSize: 16,
  contentSectionTitleFontWeight: '600',
  contentSectionTitleFontStyle: 'normal',
  contentLinkFontFamily: 'inherit',
  contentLinkFontSize: 14,
  contentLinkFontWeight: '500',
  contentLinkFontStyle: 'normal',
  contentSectionVerticalSpacing: 32,

  contentShowLinkIcons: true,
  contentShowLinkDomain: true,
  contentShowHealthStatus: true,
  contentAnimateLinks: true,
  contentLinkAnimationDelay: 30,
  contentGridColumns: {
    sm: 1,
    md: 2,
    lg: 3,
    xl: 4
  }
};

// LocalStorage key for caching styles
const STYLES_CACHE_KEY = 'linknest_styles_cache';
const STYLES_CACHE_TIMESTAMP_KEY = 'linknest_styles_cache_timestamp';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const styleService = {
  // Get cached styles from localStorage
  getCachedStyles(): SpaceStyles | null {
    try {
      const cached = localStorage.getItem(STYLES_CACHE_KEY);
      const timestamp = localStorage.getItem(STYLES_CACHE_TIMESTAMP_KEY);
      
      if (cached && timestamp) {
        const age = Date.now() - parseInt(timestamp, 10);
        if (age < CACHE_DURATION) {
          const parsed = JSON.parse(cached);
          // Merge with defaults to ensure all properties exist
          return { ...DEFAULT_STYLES, ...parsed };
        }
      }
    } catch (error) {
      console.error('Failed to read cached styles:', error);
    }
    return null;
  },

  // Cache styles to localStorage
  cacheStyles(styles: SpaceStyles): void {
    try {
      localStorage.setItem(STYLES_CACHE_KEY, JSON.stringify(styles));
      localStorage.setItem(STYLES_CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (error) {
      console.error('Failed to cache styles:', error);
    }
  },

  // Clear cached styles
  clearCache(): void {
    try {
      localStorage.removeItem(STYLES_CACHE_KEY);
      localStorage.removeItem(STYLES_CACHE_TIMESTAMP_KEY);
    } catch (error) {
      console.error('Failed to clear style cache:', error);
    }
  },

  async getStyles(): Promise<SpaceStyles> {
    try {
      const response = await fetch(`${API_BASE}/styles`, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-cache'
      });

      if (!response.ok) {
        // If no styles exist, try cache, then return defaults
        const cached = this.getCachedStyles();
        return cached || { ...DEFAULT_STYLES };
      }

      const data = await response.json();
      if (data.styles) {
        // Merge with defaults to ensure all properties exist
        const mergedStyles = { ...DEFAULT_STYLES, ...data.styles };
        // Cache the loaded styles
        this.cacheStyles(mergedStyles);
        return mergedStyles;
      }

      // Try cache if API returns no styles
      const cached = this.getCachedStyles();
      return cached || { ...DEFAULT_STYLES };
    } catch (error) {
      console.error('Failed to load styles:', error);
      // On error, try to use cached styles
      const cached = this.getCachedStyles();
      return cached || { ...DEFAULT_STYLES };
    }
  },

  async saveStyles(styles: SpaceStyles, profileName?: string): Promise<{ profileId: number; profileName: string }> {
    // Cache styles immediately when saving
    this.cacheStyles(styles);
    const response = await fetch(`${API_BASE}/styles`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ styles, profileName })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to save styles');
    }

    return {
      profileId: data.profileId,
      profileName: data.profileName
    };
  },

  async resetStyles(): Promise<void> {
    // Clear cache when resetting
    this.clearCache();
    
    const response = await fetch(`${API_BASE}/styles`, {
      method: 'DELETE',
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to reset styles');
    }
  },

  async getProfiles(): Promise<Array<{
    id: number;
    name: string;
    is_active: boolean;
    created_at: number;
    updated_at: number;
  }>> {
    const response = await fetch(`${API_BASE}/styles/profiles`, {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch profiles');
    }

    return data.profiles || [];
  },

  async getProfile(profileId: number): Promise<{
    id: number;
    name: string;
    styles: SpaceStyles;
    is_active: boolean;
    created_at: number;
    updated_at: number;
  }> {
    const response = await fetch(`${API_BASE}/styles/profiles/${profileId}`, {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch profile');
    }

    return data.profile;
  },

  async activateProfile(profileId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/styles/profiles/${profileId}/activate`, {
      method: 'PUT',
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to activate profile');
    }
  },

  async deleteProfile(profileId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/styles/profiles/${profileId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete profile');
    }
  },

  async deleteInactiveProfiles(): Promise<{ deletedCount: number }> {
    const response = await fetch(`${API_BASE}/styles/profiles/inactive`, {
      method: 'DELETE',
      credentials: 'include'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete inactive profiles');
    }

    return {
      deletedCount: data.deletedCount || 0
    };
  },

  async exportStyles(styles: SpaceStyles, includeProfiles: boolean = true): Promise<void> {
    // Merge with defaults to ensure all properties are included in export
    const completeStyles: SpaceStyles = {
      ...DEFAULT_STYLES,
      ...styles,
      // Ensure nested objects are fully merged
      gridColumns: {
        ...DEFAULT_STYLES.gridColumns,
        ...(styles.gridColumns || {})
      },
      contentGridColumns: {
        ...DEFAULT_STYLES.contentGridColumns,
        ...(styles.contentGridColumns || {})
      }
    };
    
    const exportData: any = {
      version: '1.1', // Updated version to include new tile dark mode and description styling properties
      exportedAt: new Date().toISOString(),
      styles: completeStyles
    };
    
    // Include profiles if requested
    if (includeProfiles) {
      try {
        const profiles = await this.getProfiles();
        // Get full profile data including styles
        const profilesWithStyles = await Promise.all(
          profiles.map(async (profile) => {
            const fullProfile = await this.getProfile(profile.id);
            // Merge with defaults to ensure all properties are included in export
            const completeProfileStyles: SpaceStyles = {
              ...DEFAULT_STYLES,
              ...fullProfile.styles,
              // Ensure nested objects are fully merged
              gridColumns: {
                ...DEFAULT_STYLES.gridColumns,
                ...(fullProfile.styles?.gridColumns || {})
              },
              contentGridColumns: {
                ...DEFAULT_STYLES.contentGridColumns,
                ...(fullProfile.styles?.contentGridColumns || {})
              }
            };
            return {
              id: profile.id,
              name: profile.name,
              styles: completeProfileStyles,
              is_active: profile.is_active,
              created_at: profile.created_at,
              updated_at: profile.updated_at
            };
          })
        );
        exportData.profiles = profilesWithStyles;
      } catch (error) {
        console.warn('Could not include profiles in export:', error);
        // Continue with export even if profiles fail
      }
    }
    
    const dataStr = JSON.stringify(exportData, null, 2);
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

  async importStyles(file: File): Promise<{ styles: SpaceStyles; profiles?: any[] }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const imported = JSON.parse(content);

          // Handle new format with version and profiles
          let stylesData: any;
          let profilesData: any[] | undefined;

          if (imported.version && imported.styles) {
            // New format with profiles
            stylesData = imported.styles;
            profilesData = imported.profiles;
          } else {
            // Old format - just styles
            stylesData = imported;
          }

          // Validate and merge with defaults - ensure all properties are included
          const styles: SpaceStyles = {
            ...DEFAULT_STYLES,
            ...stylesData
          };

          // Validate and merge gridColumns nested object
          if (!styles.gridColumns || typeof styles.gridColumns !== 'object') {
            styles.gridColumns = { ...DEFAULT_STYLES.gridColumns };
          } else {
            // Ensure all grid column breakpoints are present
            styles.gridColumns = {
              ...DEFAULT_STYLES.gridColumns,
              ...styles.gridColumns
            };
          }

          // Validate and merge contentGridColumns nested object
          if (!styles.contentGridColumns || typeof styles.contentGridColumns !== 'object') {
            styles.contentGridColumns = { ...DEFAULT_STYLES.contentGridColumns };
          } else {
            // Ensure all content grid column breakpoints are present
            styles.contentGridColumns = {
              ...DEFAULT_STYLES.contentGridColumns,
              ...styles.contentGridColumns
            };
          }

          // Ensure profile styles are also merged with defaults for backward compatibility
          if (profilesData && Array.isArray(profilesData)) {
            profilesData = profilesData.map((profile: any) => {
              if (profile.styles) {
                return {
                  ...profile,
                  styles: {
                    ...DEFAULT_STYLES,
                    ...profile.styles,
                    // Ensure nested objects are fully merged
                    gridColumns: {
                      ...DEFAULT_STYLES.gridColumns,
                      ...(profile.styles.gridColumns || {})
                    },
                    contentGridColumns: {
                      ...DEFAULT_STYLES.contentGridColumns,
                      ...(profile.styles.contentGridColumns || {})
                    }
                  }
                };
              }
              return profile;
            });
          }
          
          resolve({ styles, profiles: profilesData });
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

    // Build background with effects - adapt for dark mode
    let bgColor = styles.useGradient 
      ? gradientCSS 
      : (isDark ? (styles.tileDarkBackgroundColor || '#1e293b') : styles.tileBackgroundColor);

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

    const zoomValue = styles.pageZoom || 100;

    return `
      /* Global Page Zoom */
      .linknest-app-container {
        zoom: ${zoomValue / 100};
        -moz-transform: scale(${zoomValue / 100});
        -moz-transform-origin: top left;
      }
      
      @supports not (zoom: 1) {
        .linknest-app-container {
          transform: scale(${zoomValue / 100});
          transform-origin: top left;
          width: ${100 / (zoomValue / 100)}%;
        }
      }
      
      .linknest-tile {
        background: ${bgColor} !important;
        border-color: ${isDark ? (styles.tileDarkBorderColor || 'rgba(148, 163, 184, 0.3)') : styles.tileBorderColor} !important;
        border-width: ${styles.tileBorderWidth}px !important;
        border-radius: ${styles.tileBorderRadius}px !important;
        padding: ${styles.tilePadding}px !important;
        box-shadow: ${finalShadow} !important;
        ${styles.raisedEffect ? 'transform: translateY(-1px);' : ''}
        ${styles.metallicEffect ? 'position: relative; overflow: hidden;' : ''}
      }
      
      /* Dark Mode Tile Styles - Comprehensive override */
      /* Always override with solid dark background in dark mode, including gradients and metallic effects */
      .dark .linknest-tile {
        background: ${styles.tileDarkBackgroundColor || '#1e293b'} !important;
        border-color: ${styles.tileDarkBorderColor || 'rgba(148, 163, 184, 0.3)'} !important;
      }
      
      /* Override any inline or conflicting styles in dark mode */
      .dark .linknest-tile[style*="background"] {
        background: ${styles.tileDarkBackgroundColor || '#1e293b'} !important;
      }
      
      /* Tile Text Colors - ensure readability in dark mode */
      .dark .linknest-tile h3,
      .dark .linknest-tile h3 * {
        color: rgb(255, 255, 255) !important;
      }
      
      .dark .linknest-tile p {
        color: ${styles.tileDescriptionDarkTextColor || 'rgb(148, 163, 184)'} !important;
        font-family: ${styles.tileDescriptionFontFamily} !important;
        font-size: ${styles.tileDescriptionFontSize}px !important;
        font-style: ${styles.tileDescriptionFontStyle} !important;
      }
      
      .dark .linknest-tile p * {
        color: ${styles.tileDescriptionDarkTextColor || 'rgb(148, 163, 184)'} !important;
      }
      
      /* Dark mode link count and icon text */
      .dark .linknest-tile span,
      .dark .linknest-tile .text-slate-600,
      .dark .linknest-tile .text-slate-700 {
        color: rgb(148, 163, 184) !important;
      }
      
      /* Dark mode borders and dividers */
      .dark .linknest-tile .border-slate-100,
      .dark .linknest-tile .border-t,
      .dark .linknest-tile .border-slate-200,
      .dark .linknest-tile .border-slate-700 {
        border-color: rgba(148, 163, 184, 0.2) !important;
      }
      
      /* Dark mode SVG icons - ensure they're visible */
      .dark .linknest-tile svg {
        color: rgb(148, 163, 184) !important;
        fill: rgb(148, 163, 184) !important;
      }
      
      /* Dark mode metallic effect adjustment - hide or reduce metallic overlay */
      ${styles.metallicEffect ? `
      .dark .linknest-tile::before {
        display: none !important;
      }
      ` : ''}
      
      /* Hide metallic gradients in dark mode */
      .dark .linknest-tile {
        ${styles.metallicEffect ? `
          background-image: none !important;
        ` : ''}
      }
      
      /* Ensure all text elements in tiles are visible in dark mode */
      .dark .linknest-tile * {
        color: inherit;
      }
      
      /* Dark mode hover states */
      .dark .linknest-tile:hover {
        border-color: rgba(148, 163, 184, 0.4) !important;
      }
      
      /* Dark mode hover shadow enhancement */
      .dark .linknest-tile:hover {
        box-shadow: ${styles.raisedEffect && raisedShadow
        ? `0 ${8 + hoverShadowIntensity * 2}px ${16 + hoverShadowIntensity * 4}px rgba(0, 0, 0, 0.4), 0 ${4 + hoverShadowIntensity}px ${8 + hoverShadowIntensity * 2}px rgba(0, 0, 0, 0.3), inset 0 2px 0 rgba(255, 255, 255, 0.1)`
        : `0 ${4 + hoverShadowIntensity}px ${8 + hoverShadowIntensity * 2}px rgba(0, 0, 0, 0.3) !important`};
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
      
      /* Tile entrance animation */
      @keyframes tileFadeIn {
        from {
          opacity: 0;
          transform: translateY(16px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      .linknest-tile-animated {
        animation: tileFadeIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        opacity: 0;
      }
      
      /* Category entrance animation */
      @keyframes categoryFadeIn {
        from {
          opacity: 0;
          transform: translateX(-12px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      
      .linknest-category-animated {
        animation: categoryFadeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        opacity: 0;
      }
      
      /* Tile Grid - Completely independent from content link grid */
      .linknest-tile-grid {
        gap: ${styles.tileGap}px !important;
        display: grid !important;
        grid-template-columns: repeat(1, minmax(0, 1fr)) !important;
      }
      
      .linknest-category {
        margin-bottom: ${styles.categorySpacing}px !important;
        margin-top: 0 !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        min-height: unset !important;
      }
      
      .linknest-category:last-child {
        margin-bottom: 0 !important;
      }
      
      /* Ensure no spacing from parent containers or siblings */
      .linknest-tile-grid + .linknest-category,
      .linknest-category + .linknest-category {
        margin-top: 0 !important;
      }
      
      /* Override any Tailwind spacing utilities that might be applied */
      .linknest-category[class*="space-y"],
      .linknest-category[class*="mb-"],
      .linknest-category[class*="mt-"] {
        margin-top: 0 !important;
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
      
      /* Tile Description Text Styling */
      .linknest-tile p {
        color: ${styles.tileDescriptionTextColor} !important;
        font-family: ${styles.tileDescriptionFontFamily} !important;
        font-size: ${styles.tileDescriptionFontSize}px !important;
        font-style: ${styles.tileDescriptionFontStyle} !important;
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
      
      .linknest-footer {
        font-family: ${styles.footerFontFamily} !important;
        font-size: ${styles.footerFontSize}px !important;
        font-weight: ${styles.footerFontWeight} !important;
        font-style: ${styles.footerFontStyle} !important;
        color: ${styles.footerColor} !important;
      }
      
      /* Spaces Grid Tabs */
      ${generateSpacesTabCSS(styles, isDark)}
      
      /* Tile Grid Responsive - Independent breakpoints */
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
      
      /* Hero Section Styles */
      ${generateHeroSectionCSS(styles, isDark)}
      
      /* Content Page UX Styles */
      ${generateContentPageCSS(styles, isDark)}
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

// Helper function to convert hex to rgba
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex; // Return original if not a valid hex
}

// Generate Hero Section CSS
function generateHeroSectionCSS(styles: SpaceStyles, isDark: boolean): string {
  if (!styles.heroSectionEnabled) {
    return `
      .linknest-hero-section {
        display: none !important;
      }
    `;
  }

  // Build hero section background
  let heroBackground = '';
  switch (styles.heroSectionStyle) {
    case 'gradient':
      if (styles.heroSectionGradientType === 'linear') {
        heroBackground = `linear-gradient(${styles.heroSectionGradientDirection}deg, ${styles.heroSectionGradientStart}, ${styles.heroSectionGradientEnd})`;
      } else if (styles.heroSectionGradientType === 'radial') {
        heroBackground = `radial-gradient(circle, ${styles.heroSectionGradientStart}, ${styles.heroSectionGradientEnd})`;
      } else if (styles.heroSectionGradientType === 'conic') {
        heroBackground = `conic-gradient(from ${styles.heroSectionGradientDirection}deg, ${styles.heroSectionGradientStart}, ${styles.heroSectionGradientEnd})`;
      }
      break;
    case 'solid':
      heroBackground = styles.heroSectionBackgroundColor;
      break;
    case 'glassmorphism':
      heroBackground = isDark
        ? `rgba(30, 41, 59, ${styles.heroSectionOpacity / 100})`
        : `rgba(255, 255, 255, ${styles.heroSectionOpacity / 100})`;
      break;
    case 'minimal':
      heroBackground = 'transparent';
      break;
  }

  // Shadow generation
  const shadows = [
    'none',
    '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
  ];
  const heroShadow = shadows[Math.min(styles.heroSectionElevation, 5)];

  // Title gradient
  const titleGradient = styles.heroSectionTitleGradientEnabled
    ? `linear-gradient(to right, ${styles.heroSectionTitleGradientStart}, ${styles.heroSectionTitleGradientMid}, ${styles.heroSectionTitleGradientEnd})`
    : 'none';

  // Dark mode background fallback
  let darkModeBackground = '';
  if (styles.heroSectionStyle === 'gradient') {
    // For gradient, use darker variants in dark mode
    darkModeBackground = heroBackground;
  } else if (styles.heroSectionStyle === 'solid') {
    // Keep solid color as is (user chooses)
    darkModeBackground = heroBackground;
  } else if (styles.heroSectionStyle === 'minimal') {
    darkModeBackground = 'transparent';
  } else {
    darkModeBackground = heroBackground;
  }

  return `
    /* Hero Section Container */
    .linknest-hero-section {
      background: ${heroBackground} !important;
      border-radius: ${styles.heroSectionBorderRadius}px !important;
      padding: ${styles.heroSectionPadding}px !important;
      margin-bottom: ${styles.heroSectionMarginBottom}px !important;
      box-shadow: ${heroShadow} !important;
      border: ${styles.heroSectionBorderWidth}px solid ${styles.heroSectionBorderColor} !important;
      ${styles.heroSectionStyle === 'glassmorphism' ? `
        backdrop-filter: blur(${styles.heroSectionBlur}px) !important;
        -webkit-backdrop-filter: blur(${styles.heroSectionBlur}px) !important;
      ` : ''}
    }

    /* Dark Mode Hero Section */
    .dark .linknest-hero-section {
      ${styles.heroSectionStyle === 'gradient' ? `
        background: linear-gradient(${styles.heroSectionGradientDirection}deg, rgba(30, 41, 59, 0.8), rgba(51, 65, 85, 0.8)) !important;
      ` : styles.heroSectionStyle === 'solid' ? `
        background: ${isDark ? '#1e293b' : heroBackground} !important;
      ` : ''}
    }

    /* Animated Orbs */
    ${styles.heroSectionShowAnimatedOrbs ? `
      .linknest-hero-section .linknest-hero-orb-1 {
        background: ${hexToRgba(styles.heroSectionOrbColor1, styles.heroSectionOrbOpacity / 100)} !important;
      }
      .linknest-hero-section .linknest-hero-orb-2 {
        background: ${hexToRgba(styles.heroSectionOrbColor2, styles.heroSectionOrbOpacity / 100)} !important;
      }
      .linknest-hero-section .linknest-hero-orb-3 {
        background: ${hexToRgba(styles.heroSectionOrbColor3, styles.heroSectionOrbOpacity / 100)} !important;
      }
    ` : `
      .linknest-hero-section .linknest-hero-orb-1,
      .linknest-hero-section .linknest-hero-orb-2,
      .linknest-hero-section .linknest-hero-orb-3 {
        display: none !important;
      }
    `}

    /* Hero Title Gradient */
    ${styles.heroSectionTitleGradientEnabled ? `
      .linknest-hero-section .linknest-spaces-title {
        background: ${titleGradient} !important;
        -webkit-background-clip: text !important;
        background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
      }
      
      /* Dark mode title gradient - use lighter colors */
      .dark .linknest-hero-section .linknest-spaces-title {
        background: linear-gradient(to right, #60a5fa, #a78bfa, #60a5fa) !important;
        -webkit-background-clip: text !important;
        background-clip: text !important;
        -webkit-text-fill-color: transparent !important;
      }
    ` : `
      /* Title text color when gradient is disabled */
      .linknest-hero-section .linknest-spaces-title {
        color: ${styles.heroSectionTextColor} !important;
      }
      
      .dark .linknest-hero-section .linknest-spaces-title {
        color: ${styles.heroSectionDarkTextColor} !important;
      }
    `}
  `;
}

// Generate Content Page UX CSS
function generateContentPageCSS(styles: SpaceStyles, isDark: boolean): string {
  const contentShadows = [
    'none',
    '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
    '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
    '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
    '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
    '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
  ];

  // Header background based on style
  let headerBackground = '';
  switch (styles.contentHeaderStyle) {
    case 'gradient':
      headerBackground = `linear-gradient(${styles.contentHeaderGradientDirection}deg, ${styles.contentHeaderGradientStart}, ${styles.contentHeaderGradientEnd})`;
      break;
    case 'solid':
      headerBackground = styles.contentHeaderSolidColor;
      break;
    case 'glassmorphism':
      headerBackground = isDark
        ? `rgba(30, 41, 59, ${styles.contentHeaderOpacity / 100})`
        : `rgba(255, 255, 255, ${styles.contentHeaderOpacity / 100})`;
      break;
    case 'minimal':
      headerBackground = 'transparent';
      break;
  }

  // Link hover effects
  let linkHoverTransform = '';
  let linkHoverShadow = '';
  switch (styles.contentLinkHoverEffect) {
    case 'lift':
      linkHoverTransform = 'translateY(-4px)';
      linkHoverShadow = '0 12px 24px -8px rgba(0, 0, 0, 0.15)';
      break;
    case 'glow':
      linkHoverTransform = 'translateY(-2px)';
      linkHoverShadow = `0 0 20px ${styles.contentHeaderGradientStart}40`;
      break;
    case 'scale':
      linkHoverTransform = 'scale(1.02)';
      linkHoverShadow = '0 8px 16px -4px rgba(0, 0, 0, 0.12)';
      break;
    case 'slide':
      linkHoverTransform = 'translateX(8px)';
      linkHoverShadow = '0 4px 12px -2px rgba(0, 0, 0, 0.1)';
      break;
  }

  // Section styles
  let sectionBackground = '';
  let sectionBorder = '';
  let sectionShadow = '';
  switch (styles.contentSectionStyle) {
    case 'card':
      sectionBackground = isDark ? 'rgba(30, 41, 59, 0.6)' : styles.contentSectionBackgroundColor;
      sectionBorder = `1px solid ${isDark ? 'rgba(51, 65, 85, 0.5)' : styles.contentSectionBorderColor}`;
      sectionShadow = contentShadows[Math.min(styles.contentSectionElevation, 5)];
      break;
    case 'flat':
      sectionBackground = isDark ? 'rgba(30, 41, 59, 0.4)' : styles.contentSectionBackgroundColor;
      sectionBorder = 'none';
      sectionShadow = 'none';
      break;
    case 'bordered':
      sectionBackground = 'transparent';
      sectionBorder = `2px solid ${isDark ? 'rgba(71, 85, 105, 0.5)' : styles.contentSectionBorderColor}`;
      sectionShadow = 'none';
      break;
    case 'elevated':
      sectionBackground = isDark ? 'rgba(30, 41, 59, 0.8)' : styles.contentSectionBackgroundColor;
      sectionBorder = 'none';
      sectionShadow = contentShadows[Math.min(styles.contentSectionElevation + 2, 5)];
      break;
    case 'gradient':
      sectionBackground = `linear-gradient(${styles.contentSectionGradientDirection}deg, ${styles.contentSectionGradientStart}, ${styles.contentSectionGradientEnd})`;
      sectionBorder = 'none';
      sectionShadow = contentShadows[Math.min(styles.contentSectionElevation, 5)];
      break;
  }

  // Link styles
  let linkBackground = '';
  let linkBorder = '';
  let linkShadow = '';
  
  // Check if no-border is enabled first
  if (styles.contentLinkNoBorder) {
    linkBorder = 'none';
    // Still set background and shadow based on style
    switch (styles.contentLinkStyle) {
      case 'card':
        linkBackground = isDark ? 'rgba(51, 65, 85, 0.5)' : styles.contentLinkBackgroundColor;
        linkShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
        break;
      case 'pill':
        linkBackground = isDark ? 'rgba(51, 65, 85, 0.4)' : `${styles.contentLinkBackgroundColor}f5`;
        linkShadow = 'none';
        break;
      case 'minimal':
        linkBackground = 'transparent';
        linkShadow = 'none';
        break;
      case 'button':
        linkBackground = isDark
          ? `linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2))`
          : `linear-gradient(135deg, ${styles.contentHeaderGradientStart}10, ${styles.contentHeaderGradientEnd}10)`;
        linkShadow = '0 2px 8px rgba(59, 130, 246, 0.1)';
        break;
    }
  } else {
    switch (styles.contentLinkStyle) {
      case 'card':
        linkBackground = isDark ? 'rgba(51, 65, 85, 0.5)' : styles.contentLinkBackgroundColor;
        linkBorder = `1px solid ${isDark ? 'rgba(71, 85, 105, 0.5)' : styles.contentLinkBorderColor}`;
        linkShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
        break;
      case 'pill':
        linkBackground = isDark ? 'rgba(51, 65, 85, 0.4)' : `${styles.contentLinkBackgroundColor}f5`;
        linkBorder = `1px solid ${isDark ? 'rgba(71, 85, 105, 0.3)' : styles.contentLinkBorderColor}`;
        linkShadow = 'none';
        break;
      case 'minimal':
        linkBackground = 'transparent';
        linkBorder = 'none';
        linkShadow = 'none';
        break;
      case 'button':
        linkBackground = isDark
          ? `linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2))`
          : `linear-gradient(135deg, ${styles.contentHeaderGradientStart}10, ${styles.contentHeaderGradientEnd}10)`;
        linkBorder = `1px solid ${isDark ? 'rgba(59, 130, 246, 0.3)' : `${styles.contentHeaderGradientStart}30`}`;
        linkShadow = '0 2px 8px rgba(59, 130, 246, 0.1)';
        break;
    }
  }

  // Tab styles
  let tabActiveStyles = '';
  let tabInactiveStyles = '';
  switch (styles.contentTabStyle) {
    case 'underline':
      tabActiveStyles = `
        color: ${styles.contentTabActiveColor};
        border-bottom: 2px solid ${styles.contentTabActiveColor};
        background: transparent;
      `;
      tabInactiveStyles = `
        color: ${styles.contentTabInactiveColor};
        border-bottom: 2px solid transparent;
        background: transparent;
      `;
      break;
    case 'pill':
      tabActiveStyles = `
        color: white;
        background: ${styles.contentTabActiveColor};
        border-radius: ${styles.contentTabBorderRadius}px;
      `;
      tabInactiveStyles = `
        color: ${styles.contentTabInactiveColor};
        background: ${isDark ? 'rgba(51, 65, 85, 0.3)' : 'rgba(0, 0, 0, 0.05)'};
        border-radius: ${styles.contentTabBorderRadius}px;
      `;
      break;
    case 'box':
      tabActiveStyles = `
        color: ${styles.contentTabActiveColor};
        background: ${isDark ? 'rgba(59, 130, 246, 0.15)' : `${styles.contentTabActiveColor}10`};
        border: 1px solid ${styles.contentTabActiveColor};
        border-radius: ${styles.contentTabBorderRadius}px;
      `;
      tabInactiveStyles = `
        color: ${styles.contentTabInactiveColor};
        background: transparent;
        border: 1px solid ${isDark ? 'rgba(71, 85, 105, 0.5)' : '#e2e8f0'};
        border-radius: ${styles.contentTabBorderRadius}px;
      `;
      break;
    case 'minimal':
      tabActiveStyles = `
        color: ${styles.contentTabActiveColor};
        background: transparent;
        font-weight: 600;
      `;
      tabInactiveStyles = `
        color: ${styles.contentTabInactiveColor};
        background: transparent;
      `;
      break;
  }

  return `
    /* Content Page Header */
    .linknest-content-header {
      background: ${headerBackground} !important;
      ${styles.contentHeaderStyle === 'glassmorphism' ? `
        backdrop-filter: blur(${styles.contentHeaderBlur}px) !important;
        -webkit-backdrop-filter: blur(${styles.contentHeaderBlur}px) !important;
        border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.5)'} !important;
      ` : ''}
    }
    
    .linknest-content-header .linknest-content-title {
      font-family: ${styles.contentTitleFontFamily} !important;
      font-size: ${styles.contentTitleFontSize}px !important;
      font-weight: ${styles.contentTitleFontWeight} !important;
      font-style: ${styles.contentTitleFontStyle || 'normal'} !important;
    }
    
    /* Content Sections */
    .linknest-content-section {
      background: ${sectionBackground} !important;
      border: ${sectionBorder} !important;
      border-radius: ${styles.contentSectionBorderRadius}px !important;
      box-shadow: ${sectionShadow} !important;
      margin-bottom: ${styles.contentSectionVerticalSpacing || 32}px !important;
      padding: ${styles.contentSectionSpacing}px !important;
      ${styles.contentSectionTopBarEnabled ? 'position: relative; overflow: hidden;' : ''}
    }
    
    ${styles.contentSectionTopBarEnabled ? `
    .linknest-content-section::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: ${styles.contentSectionTopBarHeight}px;
      background: ${styles.contentSectionTopBarColor};
      border-radius: ${styles.contentSectionBorderRadius}px ${styles.contentSectionBorderRadius}px 0 0;
      z-index: 0;
    }
    .linknest-content-section > * {
      position: relative;
      z-index: 1;
    }
    ` : ''}
    
    .linknest-content-section:last-child {
      margin-bottom: 0 !important;
    }
    
    .linknest-content-section-title {
      font-family: ${styles.contentSectionTitleFontFamily} !important;
      font-size: ${styles.contentSectionTitleFontSize}px !important;
      font-weight: ${styles.contentSectionTitleFontWeight} !important;
      font-style: ${styles.contentSectionTitleFontStyle || 'normal'} !important;
    }
    
    /* Content Links */
    .linknest-content-link {
      background: ${linkBackground} !important;
      border: ${linkBorder} !important;
      border-radius: ${styles.contentLinkBorderRadius}px !important;
      box-shadow: ${linkShadow} !important;
      padding: ${styles.contentLinkPadding}px !important;
      margin-bottom: ${styles.contentLinkSpacing}px !important;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
      width: 100% !important;
      min-width: 0 !important;
      ${styles.contentAnimateLinks ? `
        animation: linkFadeIn 0.4s ease-out forwards;
        opacity: 0;
      ` : ''}
    }
    
    @keyframes linkFadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .linknest-content-link:hover {
      transform: ${linkHoverTransform} !important;
      box-shadow: ${linkHoverShadow} !important;
      ${styles.contentLinkStyle === 'button' ? `
        background: ${isDark
        ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(139, 92, 246, 0.3))'
        : `linear-gradient(135deg, ${styles.contentHeaderGradientStart}20, ${styles.contentHeaderGradientEnd}20)`} !important;
      ` : ''}
    }
    
    .linknest-content-link-title {
      font-family: ${styles.contentLinkFontFamily} !important;
      font-size: ${styles.contentLinkFontSize}px !important;
      font-weight: ${styles.contentLinkFontWeight} !important;
      font-style: ${styles.contentLinkFontStyle || 'normal'} !important;
      word-wrap: break-word !important;
      overflow-wrap: break-word !important;
      max-width: 100% !important;
    }
    
    .linknest-content-link-icon {
      width: ${styles.contentLinkIconSize}px !important;
      height: ${styles.contentLinkIconSize}px !important;
      ${!styles.contentShowLinkIcons ? 'display: none !important;' : ''}
    }
    
    .linknest-content-link-domain {
      ${!styles.contentShowLinkDomain ? 'display: none !important;' : ''}
    }
    
    .linknest-content-link-health {
      ${!styles.contentShowHealthStatus ? 'display: none !important;' : ''}
    }
    
    /* Content Tabs */
    .linknest-content-tab {
      ${tabInactiveStyles}
      font-family: ${styles.contentTabFontFamily} !important;
      font-size: ${styles.contentTabFontSize}px !important;
      font-weight: ${styles.contentTabFontWeight} !important;
      font-style: ${styles.contentTabFontStyle} !important;
      transition: all 0.2s ease !important;
    }
    
    .linknest-content-tab.active,
    .linknest-content-tab[data-active="true"] {
      ${tabActiveStyles}
      font-family: ${styles.contentTabFontFamily} !important;
      font-size: ${styles.contentTabFontSize}px !important;
      font-weight: ${styles.contentTabFontWeight} !important;
      font-style: ${styles.contentTabFontStyle} !important;
    }
    
    .linknest-content-tab:hover:not(.active):not([data-active="true"]) {
      color: ${styles.contentTabActiveColor} !important;
      opacity: 0.8;
    }
    
    /* Content Link Grid - Completely independent from tile grid */
    /* Use auto-fit to make columns flexible and expand to fill available space */
    /* Columns will automatically expand when there are fewer items than max columns */
    .linknest-content-link-grid {
      gap: ${styles.contentLinkSpacing}px !important;
      display: grid !important;
      width: 100% !important;
      /* Use auto-fit with a reasonable minimum width - columns will expand to fill space */
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)) !important;
    }
    
    .linknest-content-link-grid > * {
      width: 100% !important;
      min-width: 0 !important;
    }
    
    /* Content Link Grid Responsive - Flexible columns that expand to use available space */
    /* Adjust minimum width per breakpoint to allow better expansion */
    @media (min-width: 640px) {
      .linknest-content-link-grid {
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)) !important;
      }
    }
    
    @media (min-width: 768px) {
      .linknest-content-link-grid {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)) !important;
      }
    }
    
    @media (min-width: 1024px) {
      .linknest-content-link-grid {
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)) !important;
      }
    }
    
    @media (min-width: 1280px) {
      .linknest-content-link-grid {
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)) !important;
      }
    }
  `;
}

// Generate Spaces Grid Tab CSS
function generateSpacesTabCSS(styles: SpaceStyles, isDark: boolean): string {
  // Tab styles
  let tabActiveStyles = '';
  let tabInactiveStyles = '';
  switch (styles.spacesTabStyle) {
    case 'underline':
      tabActiveStyles = `
        color: ${styles.spacesTabActiveColor} !important;
        border-bottom: 2px solid ${styles.spacesTabActiveColor} !important;
        background: transparent !important;
      `;
      tabInactiveStyles = `
        color: ${styles.spacesTabInactiveColor} !important;
        border-bottom: 2px solid transparent !important;
        background: transparent !important;
      `;
      break;
    case 'pill':
      tabActiveStyles = `
        color: white !important;
        background: ${styles.spacesTabActiveColor} !important;
        border-radius: ${styles.spacesTabBorderRadius}px !important;
      `;
      tabInactiveStyles = `
        color: ${styles.spacesTabInactiveColor} !important;
        background: ${isDark ? 'rgba(51, 65, 85, 0.3)' : 'rgba(0, 0, 0, 0.05)'} !important;
        border-radius: ${styles.spacesTabBorderRadius}px !important;
      `;
      break;
    case 'box':
      tabActiveStyles = `
        color: ${styles.spacesTabActiveColor} !important;
        background: ${isDark ? 'rgba(59, 130, 246, 0.15)' : `${styles.spacesTabActiveColor}10`} !important;
        border: 1px solid ${styles.spacesTabActiveColor} !important;
        border-radius: ${styles.spacesTabBorderRadius}px !important;
      `;
      tabInactiveStyles = `
        color: ${styles.spacesTabInactiveColor} !important;
        background: transparent !important;
        border: 1px solid ${isDark ? 'rgba(71, 85, 105, 0.5)' : '#e2e8f0'} !important;
        border-radius: ${styles.spacesTabBorderRadius}px !important;
      `;
      break;
    case 'minimal':
      tabActiveStyles = `
        color: ${styles.spacesTabActiveColor} !important;
        background: transparent !important;
        font-weight: 600 !important;
      `;
      tabInactiveStyles = `
        color: ${styles.spacesTabInactiveColor} !important;
        background: transparent !important;
      `;
      break;
  }

  return `
    .linknest-spaces-tab {
      ${tabInactiveStyles}
      font-family: ${styles.spacesTabFontFamily} !important;
      font-size: ${styles.spacesTabFontSize}px !important;
      font-weight: ${styles.spacesTabFontWeight} !important;
      font-style: ${styles.spacesTabFontStyle} !important;
      transition: all 0.2s ease !important;
    }
    
    .linknest-spaces-tab.active,
    .linknest-spaces-tab[data-active="true"] {
      ${tabActiveStyles}
      font-family: ${styles.spacesTabFontFamily} !important;
      font-size: ${styles.spacesTabFontSize}px !important;
      font-weight: ${styles.spacesTabFontWeight} !important;
      font-style: ${styles.spacesTabFontStyle} !important;
    }
    
    .linknest-spaces-tab:hover:not(.active):not([data-active="true"]) {
      color: ${styles.spacesTabActiveColor} !important;
      opacity: 0.8;
    }
  `;
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

