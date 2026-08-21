import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { settingsService, AppSettings } from '../services/settingsService';
import { getAppBasePath, getAppStorageScope } from '../services/apiHelpers';

function brandingStorageKey(base: string): string {
  const scope = getAppStorageScope() || '__root__';
  return `${base}:${scope}`;
}

export const BRANDING_CACHE_KEY = brandingStorageKey('linknest_branding_cache');
export const BRANDING_CSS_CACHE_KEY = brandingStorageKey('linknest_branding_css');

/** Keys to hydrate from localStorage so nav sizes/fonts match before API returns */
const BRANDING_HYDRATE_KEYS = [
  'app_name', 'page_title', 'page_title_pattern', 'spaces_title', 'spaces_subtitle',
  'logo_type', 'logo_icon', 'logo_image', 'logo_size',
  'header_logo_image', 'header_logo_size', 'app_subheading',
  'app_name_font_size', 'app_name_font_family', 'app_name_font_weight', 'app_name_font_style',
  'app_name_font_color', 'app_name_font_color_dark', 'app_name_letter_spacing', 'app_name_line_height',
  'app_subheading_font_size', 'app_subheading_font_family', 'app_subheading_font_weight', 'app_subheading_font_style',
  'app_subheading_font_color', 'app_subheading_font_color_dark', 'app_subheading_letter_spacing', 'app_subheading_line_height',
  'nav_bg_light', 'nav_bg_to_light', 'nav_bg_dark', 'nav_bg_to_dark', 'nav_gradient_angle',
  'nav_border_light', 'nav_border_dark', 'nav_icon_color_light', 'nav_icon_color_dark',
  'hero_icon',
  'hero_title_font_size', 'hero_title_font_family', 'hero_title_font_weight', 'hero_title_font_style',
  'hero_title_color', 'hero_title_color_dark', 'hero_title_letter_spacing', 'hero_title_line_height',
  'hero_subtitle_font_size', 'hero_subtitle_font_family', 'hero_subtitle_font_weight', 'hero_subtitle_font_style',
  'hero_subtitle_color', 'hero_subtitle_color_dark', 'hero_subtitle_letter_spacing', 'hero_subtitle_line_height',
  'hero_bg_from', 'hero_bg_to', 'hero_bg_from_dark', 'hero_bg_to_dark', 'hero_bg_angle',
  'hero_overlay_color', 'hero_overlay_to', 'hero_overlay_opacity', 'hero_icon_bg_from', 'hero_icon_bg_to',
  'auth_wash_from', 'auth_wash_to', 'favicon',
  'guest_access_enabled', 'public_tile_animation', 'maintenance_enabled', 'maintenance_message',
  'disabled_tabs', 'footer_text', 'show_database_path_in_footer', 'semi_pwa_enabled',
] as const;

/** Branding keys that can be live-previewed before Save Settings */
export const BRANDING_PREVIEW_KEYS = [
  'app_name',
  'app_subheading',
  'logo_type',
  'logo_icon',
  'logo_image',
  'logo_size',
  'header_logo_image',
  'header_logo_size',
  'app_name_font_size',
  'app_name_font_family',
  'app_name_font_weight',
  'app_name_font_style',
  'app_name_font_color',
  'app_name_font_color_dark',
  'app_name_letter_spacing',
  'app_name_line_height',
  'app_subheading_font_size',
  'app_subheading_font_family',
  'app_subheading_font_weight',
  'app_subheading_font_style',
  'app_subheading_font_color',
  'app_subheading_font_color_dark',
  'app_subheading_letter_spacing',
  'app_subheading_line_height',
  'nav_bg_light',
  'nav_bg_to_light',
  'nav_bg_dark',
  'nav_bg_to_dark',
  'nav_gradient_angle',
  'nav_border_light',
  'nav_border_dark',
  'nav_icon_color_light',
  'nav_icon_color_dark',
  'hero_icon',
  'spaces_title',
  'spaces_subtitle',
  'hero_title_font_size',
  'hero_title_font_family',
  'hero_title_font_weight',
  'hero_title_font_style',
  'hero_title_color',
  'hero_title_color_dark',
  'hero_title_letter_spacing',
  'hero_title_line_height',
  'hero_subtitle_font_size',
  'hero_subtitle_font_family',
  'hero_subtitle_font_weight',
  'hero_subtitle_font_style',
  'hero_subtitle_color',
  'hero_subtitle_color_dark',
  'hero_subtitle_letter_spacing',
  'hero_subtitle_line_height',
  'hero_bg_from',
  'hero_bg_to',
  'hero_bg_from_dark',
  'hero_bg_to_dark',
  'hero_bg_angle',
  'hero_overlay_color',
  'hero_overlay_to',
  'hero_overlay_opacity',
  'hero_icon_bg_from',
  'hero_icon_bg_to',
  'auth_wash_from',
  'auth_wash_to',
  'page_title',
  'page_title_pattern',
] as const;

interface SettingsContextType {
  settings: AppSettings;
  loading: boolean;
  refreshSettings: () => Promise<void>;
  patchSettings: (partial: Partial<AppSettings>) => void;
  clearCache: () => Promise<void>;
  setBrandingPreview: (partial: Partial<AppSettings>) => void;
  clearBrandingPreview: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const emptyBrandingDefaults: AppSettings = {
  app_name: '',
  page_title: '',
  spaces_title: 'My Spaces',
  logo_type: 'icon',
  logo_icon: '',
  logo_image: '',
  logo_size: '32',
  header_logo_image: '',
  header_logo_size: '40',
  app_subheading: '',
  app_name_font_size: '20',
  app_name_font_family: 'inherit',
  app_name_font_weight: 'bold',
  app_name_font_style: 'normal',
  app_name_font_color: '',
  app_name_font_color_dark: '',
  app_name_letter_spacing: '0',
  app_name_line_height: '1.25',
  app_subheading_font_size: '12',
  app_subheading_font_family: 'inherit',
  app_subheading_font_weight: 'normal',
  app_subheading_font_style: 'normal',
  app_subheading_font_color: '',
  app_subheading_font_color_dark: '',
  app_subheading_letter_spacing: '0',
  app_subheading_line_height: '1.3',
  nav_bg_light: '',
  nav_bg_to_light: '',
  nav_bg_dark: '',
  nav_bg_to_dark: '',
  nav_gradient_angle: '90',
  nav_border_light: '',
  nav_border_dark: '',
  nav_icon_color_light: '',
  nav_icon_color_dark: '',
  hero_icon: '',
  spaces_subtitle: '',
  hero_title_font_size: '36',
  hero_title_font_family: 'inherit',
  hero_title_font_weight: 'bold',
  hero_title_font_style: 'normal',
  hero_title_color: '',
  hero_title_color_dark: '',
  hero_title_letter_spacing: '0',
  hero_title_line_height: '1.2',
  hero_subtitle_font_size: '16',
  hero_subtitle_font_family: 'inherit',
  hero_subtitle_font_weight: 'normal',
  hero_subtitle_font_style: 'normal',
  hero_subtitle_color: '',
  hero_subtitle_color_dark: '',
  hero_subtitle_letter_spacing: '0',
  hero_subtitle_line_height: '1.4',
  hero_bg_from: '',
  hero_bg_to: '',
  hero_bg_from_dark: '',
  hero_bg_to_dark: '',
  hero_bg_angle: '135',
  hero_overlay_color: '',
  hero_overlay_to: '',
  hero_overlay_opacity: '0',
  hero_icon_bg_from: '',
  hero_icon_bg_to: '',
  auth_wash_from: '',
  auth_wash_to: '',
  page_title_pattern: '{page_title}',
  favicon: '',
  qr_branding_mode: 'favicon',
  qr_branding_emoji: '❤️',
  footer_text: '© 2025 Adventhealth - Designed and developed by AIT Architecture team',
  public_tile_animation: 'fade-in',
};

/** Resolve browser tab title from pattern tokens. Never invents "LinkNest". */
export function resolvePageTitle(s: Pick<AppSettings, 'page_title' | 'app_name' | 'page_title_pattern'>): string {
  const pageTitle = (s.page_title || '').trim() || (s.app_name || '').trim();
  const appName = (s.app_name || '').trim();
  const pattern = (s.page_title_pattern || '{page_title}').trim() || '{page_title}';
  const resolved = pattern
    .replace(/\{page_title\}/g, pageTitle)
    .replace(/\{app_name\}/g, appName)
    .replace(/\s+/g, ' ')
    .trim();
  return resolved || pageTitle || appName || '';
}

export function cacheBrandingSnapshot(s: AppSettings) {
  try {
    const snap: Record<string, unknown> = {};
    for (const key of BRANDING_HYDRATE_KEYS) {
      snap[key] = (s as Record<string, unknown>)[key] ?? '';
    }
    localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(snap));
  } catch (_) { /* ignore */ }
}

export function readBrandingCache(): Partial<AppSettings> | null {
  try {
    const raw = localStorage.getItem(BRANDING_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

export function markBrandingReady() {
  try {
    document.documentElement.classList.add('ln-branding-ready');
  } catch (_) { /* ignore */ }
}

function getInitialSettings(): AppSettings {
  const cached = typeof window !== 'undefined' ? readBrandingCache() : null;
  if (!cached) return emptyBrandingDefaults;
  return { ...emptyBrandingDefaults, ...cached };
}

function resolveApiBaseForManifest(): string {
  if (typeof window === 'undefined') return '/api';
  const path = window.location.pathname || '';
  if (path !== '/' && path.length > 1) {
    const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
    if (cleanPath && cleanPath !== '/') return `${cleanPath}/api`;
  }
  return '/api';
}

function applyBrandingCss(s: AppSettings) {
  let el = document.getElementById('linknest-branding-styles') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'linknest-branding-styles';
    document.head.appendChild(el);
  }

  const nameSize = parseInt(s.app_name_font_size || '20', 10) || 20;
  const subSize = parseInt(s.app_subheading_font_size || '12', 10) || 12;
  const nameLs = s.app_name_letter_spacing ?? '0';
  const subLs = s.app_subheading_letter_spacing ?? '0';
  const nameLh = s.app_name_line_height || '1.25';
  const subLh = s.app_subheading_line_height || '1.3';
  const nameFamily = s.app_name_font_family && s.app_name_font_family !== 'inherit' ? s.app_name_font_family : null;
  const subFamily = s.app_subheading_font_family && s.app_subheading_font_family !== 'inherit' ? s.app_subheading_font_family : null;
  const heroTitleSize = parseInt(s.hero_title_font_size || '36', 10) || 36;
  const heroSubSize = parseInt(s.hero_subtitle_font_size || '16', 10) || 16;
  const heroTitleLs = s.hero_title_letter_spacing ?? '0';
  const heroSubLs = s.hero_subtitle_letter_spacing ?? '0';
  const heroTitleLh = s.hero_title_line_height || '1.2';
  const heroSubLh = s.hero_subtitle_line_height || '1.4';
  const heroTitleFamily = s.hero_title_font_family && s.hero_title_font_family !== 'inherit' ? s.hero_title_font_family : null;
  const heroSubFamily = s.hero_subtitle_font_family && s.hero_subtitle_font_family !== 'inherit' ? s.hero_subtitle_font_family : null;
  const overlayOpacity = Math.min(40, Math.max(0, parseFloat(s.hero_overlay_opacity || '0') || 0)) / 100;

  const rules: string[] = [];

  const mobileNameSize = Math.min(nameSize, 17);
  const mobileSubSize = Math.min(subSize, 10);

  rules.push(`
.auth-modal-app-name,
nav.linknest-nav .linknest-brand-app-name {
  font-size: ${nameSize}px !important;
  font-weight: ${s.app_name_font_weight || 'bold'} !important;
  font-style: ${s.app_name_font_style || 'normal'} !important;
  letter-spacing: ${nameLs}em !important;
  line-height: ${nameLh} !important;
  ${nameFamily ? `font-family: ${nameFamily} !important;` : ''}
  ${s.app_name_font_color ? `color: ${s.app_name_font_color} !important; -webkit-text-fill-color: ${s.app_name_font_color} !important; background: none !important;` : ''}
}
.auth-modal-app-subheading,
nav.linknest-nav .linknest-brand-subheading {
  font-size: ${subSize}px !important;
  font-weight: ${s.app_subheading_font_weight || 'normal'} !important;
  font-style: ${s.app_subheading_font_style || 'normal'} !important;
  letter-spacing: ${subLs}em !important;
  line-height: ${subLh} !important;
  ${subFamily ? `font-family: ${subFamily} !important;` : ''}
  ${s.app_subheading_font_color ? `color: ${s.app_subheading_font_color} !important;` : ''}
}
@media (max-width: 767px) {
  nav.linknest-nav .linknest-brand-app-name { font-size: ${mobileNameSize}px !important; }
  nav.linknest-nav .linknest-brand-subheading { font-size: ${mobileSubSize}px !important; }
  nav.linknest-nav .linknest-header-logo img { max-width: 88px !important; }
}`);

  if (s.app_name_font_color_dark) {
    rules.push(`.dark .auth-modal-app-name, .dark nav.linknest-nav .linknest-brand-app-name {
  color: ${s.app_name_font_color_dark} !important; -webkit-text-fill-color: ${s.app_name_font_color_dark} !important; background: none !important;
}`);
  }
  if (s.app_subheading_font_color_dark) {
    rules.push(`.dark .auth-modal-app-subheading, .dark nav.linknest-nav .linknest-brand-subheading {
  color: ${s.app_subheading_font_color_dark} !important;
}`);
  }

  if (s.nav_bg_light && s.nav_bg_to_light) {
    const angle = parseInt(s.nav_gradient_angle || '90', 10) || 90;
    rules.push(`nav.linknest-nav { background-image: linear-gradient(${angle}deg, ${s.nav_bg_light}, ${s.nav_bg_to_light}) !important; background-color: transparent !important; }`);
  } else if (s.nav_bg_light) {
    rules.push(`nav.linknest-nav { background-color: ${s.nav_bg_light} !important; background-image: none !important; }`);
  }
  if (s.nav_bg_dark && s.nav_bg_to_dark) {
    const angle = parseInt(s.nav_gradient_angle || '90', 10) || 90;
    rules.push(`.dark nav.linknest-nav { background-image: linear-gradient(${angle}deg, ${s.nav_bg_dark}, ${s.nav_bg_to_dark}) !important; background-color: transparent !important; }`);
  } else if (s.nav_bg_dark) {
    rules.push(`.dark nav.linknest-nav { background-color: ${s.nav_bg_dark} !important; background-image: none !important; }`);
  }
  if (s.nav_border_light) {
    rules.push(`nav.linknest-nav { border-color: ${s.nav_border_light} !important; }`);
  }
  if (s.nav_border_dark) {
    rules.push(`.dark nav.linknest-nav { border-color: ${s.nav_border_dark} !important; }`);
  }
  if (s.nav_icon_color_light) {
    rules.push(`nav.linknest-nav .linknest-nav-icon { color: ${s.nav_icon_color_light} !important; }`);
  }
  if (s.nav_icon_color_dark) {
    rules.push(`.dark nav.linknest-nav .linknest-nav-icon { color: ${s.nav_icon_color_dark} !important; }`);
  }

  rules.push(`.linknest-hero-section .linknest-spaces-title {
  font-size: ${heroTitleSize}px !important;
  font-weight: ${s.hero_title_font_weight || 'bold'} !important;
  font-style: ${s.hero_title_font_style || 'normal'} !important;
  letter-spacing: ${heroTitleLs}em !important;
  line-height: ${heroTitleLh} !important;
  ${heroTitleFamily ? `font-family: ${heroTitleFamily} !important;` : ''}
  ${s.hero_title_color ? `color: ${s.hero_title_color} !important; -webkit-text-fill-color: ${s.hero_title_color} !important; background: none !important;` : ''}
}
.linknest-hero-section .linknest-spaces-subtitle {
  font-size: ${heroSubSize}px !important;
  font-weight: ${s.hero_subtitle_font_weight || 'normal'} !important;
  font-style: ${s.hero_subtitle_font_style || 'normal'} !important;
  letter-spacing: ${heroSubLs}em !important;
  line-height: ${heroSubLh} !important;
  ${heroSubFamily ? `font-family: ${heroSubFamily} !important;` : ''}
  ${s.hero_subtitle_color ? `color: ${s.hero_subtitle_color} !important;` : ''}
}
@media (max-width: 639px) {
  .linknest-hero-section .linknest-spaces-title { font-size: ${Math.min(heroTitleSize, 36)}px !important; }
  .linknest-hero-section .linknest-spaces-subtitle { font-size: ${Math.min(heroSubSize, 14)}px !important; }
}`);
  if (s.hero_title_color_dark) {
    rules.push(`.dark .linknest-hero-section .linknest-spaces-title { color: ${s.hero_title_color_dark} !important; -webkit-text-fill-color: ${s.hero_title_color_dark} !important; background: none !important; }`);
  }
  if (s.hero_subtitle_color_dark) {
    rules.push(`.dark .linknest-hero-section .linknest-spaces-subtitle { color: ${s.hero_subtitle_color_dark} !important; }`);
  }

  const heroAngle = parseInt(s.hero_bg_angle || '135', 10) || 135;
  if (s.hero_bg_from && s.hero_bg_to) {
    rules.push(`.linknest-hero-section { background-image: linear-gradient(${heroAngle}deg, ${s.hero_bg_from}, ${s.hero_bg_to}) !important; background-color: transparent !important; }`);
  } else if (s.hero_bg_from) {
    rules.push(`.linknest-hero-section { background: ${s.hero_bg_from} !important; }`);
  }
  if (s.hero_bg_from_dark && s.hero_bg_to_dark) {
    rules.push(`.dark .linknest-hero-section { background-image: linear-gradient(${heroAngle}deg, ${s.hero_bg_from_dark}, ${s.hero_bg_to_dark}) !important; background-color: transparent !important; }`);
  } else if (s.hero_bg_from_dark) {
    rules.push(`.dark .linknest-hero-section { background: ${s.hero_bg_from_dark} !important; }`);
  }

  const overlayBg = s.hero_overlay_color && s.hero_overlay_to
    ? `linear-gradient(${heroAngle}deg, ${s.hero_overlay_color}, ${s.hero_overlay_to})`
    : (s.hero_overlay_color || 'transparent');
  rules.push(`.linknest-hero-brand-overlay {
  position: absolute; inset: 0; pointer-events: none; z-index: 1;
  background: ${overlayBg};
  opacity: ${overlayOpacity};
}`);

  if (s.hero_icon_bg_from && s.hero_icon_bg_to) {
    rules.push(`.linknest-hero-icon { background-image: linear-gradient(to bottom right, ${s.hero_icon_bg_from}, ${s.hero_icon_bg_to}) !important; }`);
  } else if (s.hero_icon_bg_from) {
    rules.push(`.linknest-hero-icon { background: ${s.hero_icon_bg_from} !important; }`);
  }

  if (s.auth_wash_from && s.auth_wash_to) {
    rules.push(`.auth-modal-wash { background: linear-gradient(135deg, ${s.auth_wash_from}, ${s.auth_wash_to}) !important; }`);
  } else if (s.auth_wash_from) {
    rules.push(`.auth-modal-wash { background: ${s.auth_wash_from} !important; }`);
  }

  el.textContent = rules.join('\n').trim();
  try {
    localStorage.setItem(BRANDING_CSS_CACHE_KEY, el.textContent || '');
  } catch (_) { /* ignore */ }
}

/** Built-in tab icon (never 404s). Used when no upload is set or the file is missing. */
export const DEFAULT_FAVICON_HREF =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%233b82f6'/%3E%3Cpath fill='none' stroke='%23fff' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round' d='M13.2 18.8l-1.2 1.2a3.6 3.6 0 01-5.1-5.1l2.2-2.2m9.9-.9l1.2-1.2a3.6 3.6 0 015.1 5.1l-2.2 2.2M12.8 19.2l6.4-6.4'/%3E%3C/svg%3E";

function faviconMimeType(href: string): string {
  const path = href.split('?')[0].toLowerCase();
  if (href.startsWith('data:image/svg') || path.endsWith('.svg')) return 'image/svg+xml';
  if (href.startsWith('data:image/x-icon') || path.endsWith('.ico')) return 'image/x-icon';
  if (path.endsWith('.webp')) return 'image/webp';
  if (href.startsWith('data:image/png')) return 'image/png';
  return 'image/png';
}

/** Prefix /uploads/... with the install folder (e.g. /linknest) so it is not requested from the domain root. */
export function resolveBrandedAssetHref(raw: string): string {
  const url = String(raw || '').trim();
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  const base = getAppBasePath();
  const prefixUploads = (pathname: string, search = ''): string => {
    let path = pathname.startsWith('/') ? pathname : `/${pathname}`;
    path = path.replace(/^\/[^/]+(\/uploads\/)/, '$1');
    if (path.startsWith('/uploads/') && base) {
      path = `${base}${path}`;
    }
    return path + search;
  };

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.pathname.includes('/uploads/')) {
        return prefixUploads(parsed.pathname, parsed.search);
      }
    } catch {
      /* keep original */
    }
    return url;
  }

  return prefixUploads(url);
}

function applyFaviconLinks(href: string) {
  const type = faviconMimeType(href);
  const nextIcon = document.createElement('link');
  nextIcon.rel = 'icon';
  nextIcon.type = type;
  nextIcon.href = href;
  const nextApple = document.createElement('link');
  nextApple.rel = 'apple-touch-icon';
  nextApple.href = href;
  document.head.appendChild(nextIcon);
  document.head.appendChild(nextApple);
  document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((link) => {
    if (link !== nextIcon && link !== nextApple) link.remove();
  });
}

function updatePwaIcons(faviconUrl: string, appName: string) {
  const resolved = resolveBrandedAssetHref(faviconUrl);
  applyFaviconLinks(resolved || DEFAULT_FAVICON_HREF);

  let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (!manifestLink) {
    manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    document.head.appendChild(manifestLink);
  }
  const apiBase = resolveApiBaseForManifest();
  manifestLink.href = `${apiBase}/manifest?_t=${Date.now()}`;

  if (appName) {
    let appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null;
    if (!appleTitle) {
      appleTitle = document.createElement('meta');
      appleTitle.name = 'apple-mobile-web-app-title';
      document.head.appendChild(appleTitle);
    }
    appleTitle.content = appName;
  }
}

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(getInitialSettings);
  const [previewOverrides, setPreviewOverrides] = useState<Partial<AppSettings>>({});
  const [loading, setLoading] = useState(() => !readBrandingCache());

  const effectiveSettings = useMemo(
    () => ({ ...settings, ...previewOverrides }),
    [settings, previewOverrides]
  );

  const patchSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const setBrandingPreview = useCallback((partial: Partial<AppSettings>) => {
    const patch: Partial<AppSettings> = {};
    for (const key of BRANDING_PREVIEW_KEYS) {
      if (key in partial) {
        (patch as Record<string, unknown>)[key] = (partial as Record<string, unknown>)[key];
      }
    }
    if (Object.keys(patch).length === 0) return;
    setPreviewOverrides((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearBrandingPreview = useCallback(() => {
    setPreviewOverrides({});
  }, []);

  const loadSettings = async () => {
    try {
      const loadedSettings = await settingsService.getSettings();
      setSettings(loadedSettings);
      setPreviewOverrides({});
      cacheBrandingSnapshot(loadedSettings);

      document.title = resolvePageTitle(loadedSettings);
      updatePwaIcons(loadedSettings.favicon, loadedSettings.app_name);
      markBrandingReady();
      setLoading(false);

      const semiPwaEnabled = loadedSettings.semi_pwa_enabled === '1' || loadedSettings.semi_pwa_enabled === 'true';
      const swPath = getSwPath();
      if (!('serviceWorker' in navigator)) {
        return;
      }
      // Service worker register/update is slow and must not block first paint
      void (async () => {
        try {
          if (semiPwaEnabled) {
            const reg = await navigator.serviceWorker.register(swPath, { scope: getSwScope() });
            const askWaitingToActivate = (worker: ServiceWorker | null) => {
              if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
            };
            if (reg.waiting) askWaitingToActivate(reg.waiting);
            reg.addEventListener('updatefound', () => {
              const installing = reg.installing;
              if (!installing) return;
              installing.addEventListener('statechange', () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  askWaitingToActivate(installing);
                }
              });
            });
            await reg.update();
            if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(brandingStorageKey('linknest_pwa_logged'))) {
              sessionStorage.setItem(brandingStorageKey('linknest_pwa_logged'), '1');
              console.log('[LinkNest PWA] Semi-PWA is ON. Normal load = from cache. Hard refresh (Ctrl+F5 / Cmd+Shift+R) = from database/server — look for "[LinkNest PWA] Database/network fetch" in console.');
            }
          } else {
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(brandingStorageKey('linknest_pwa_logged'));
            const scope = getSwScope();
            const reg = await navigator.serviceWorker.getRegistration(scope);
            if (reg) await reg.unregister();
            try {
              const cacheNames = await caches.keys();
              const linknestCache = cacheNames.filter((n) => n.startsWith('linknest-pwa'));
              await Promise.all(linknestCache.map((n) => caches.delete(n)));
            } catch (_) { /* ignore */ }
          }
        } catch (e) {
          console.warn('[LinkNest PWA] Service worker registration failed:', e);
        }
      })();
    } catch (error) {
      console.error('Failed to load settings:', error);
      markBrandingReady();
      setLoading(false);
    }
  };

  function getSwPath() {
    const path = typeof window !== 'undefined' ? window.location.pathname || '' : '';
    const base = path.replace(/\/[^/]*$/, '') || '';
    return (base || '') + '/sw-cache-first.php';
  }

  function getSwScope() {
    const path = typeof window !== 'undefined' ? window.location.pathname || '' : '';
    const base = path.replace(/\/[^/]*$/, '') || '';
    return (base || '/') + '/';
  }

  const clearCache = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration(getSwScope());
        if (reg && reg.active) {
          reg.active.postMessage({ type: 'CLEAR_CACHE' });
        }
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('[LinkNest PWA] Cache cleared manually');
      }
      window.location.reload();
    } catch (e) {
      console.error('[LinkNest PWA] Error clearing cache:', e);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Apply branding CSS immediately (and when preview/settings change)
  useEffect(() => {
    applyBrandingCss(effectiveSettings);
    document.title = resolvePageTitle(effectiveSettings);
    // If we hydrated from cache, reveal nav immediately — API refresh still updates styles
    if (effectiveSettings.app_name || (typeof localStorage !== 'undefined' && localStorage.getItem(BRANDING_CSS_CACHE_KEY))) {
      markBrandingReady();
    }
  }, [effectiveSettings]);

  return (
    <SettingsContext.Provider value={{
      settings: effectiveSettings,
      loading,
      refreshSettings: loadSettings,
      patchSettings,
      clearCache,
      setBrandingPreview,
      clearBrandingPreview
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    return {
      settings: {
        ...emptyBrandingDefaults,
        app_name: 'LinkNest',
        page_title: 'LinkNest',
        logo_icon: '🔗',
      },
      loading: false,
      refreshSettings: async () => { },
      patchSettings: () => { },
      clearCache: async () => { },
      setBrandingPreview: () => { },
      clearBrandingPreview: () => { }
    };
  }
  return context;
};
