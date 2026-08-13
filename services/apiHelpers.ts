// Helper functions for API calls

/**
 * Install folder from the browser URL, e.g. "/ArchLinks" or "/ERP3".
 * Empty string for a domain-root deploy. Hash routes are not part of pathname.
 */
export function getAppBasePath(): string {
  if (typeof window === 'undefined') return '';

  let path = (window.location.pathname || '').replace(/\/index\.html?$/i, '');
  path = path.replace(/\/$/, '') || '/';

  if (path === '/' || path.length <= 1) return '';

  const parent = path.replace(/\/[^/]*$/, '');
  const baseDir = parent && parent !== '' ? parent : path;
  return baseDir && baseDir !== '/' ? baseDir : '';
}

export function resolveApiBase(): string {
  // Prefer Vite-injected env when it is an absolute app path (not portable/relative).
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (typeof envBase === 'string') {
    const t = envBase.trim().replace(/\/$/, '');
    if (t && t !== '/' && t !== './api' && t !== '.' && !t.startsWith('./') && t !== 'auto' && t !== '__AUTO__') {
      return t;
    }
  }

  // Fallback: dynamically detect base path from current location
  // Works for /ArchLinks, /ERP3, /linknest, domain root, etc.
  const baseDir = getAppBasePath();
  if (baseDir) {
    return `${baseDir}/api`;
  }

  // Default fallback (root deployment)
  return '/api';
}
