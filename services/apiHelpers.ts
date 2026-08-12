// Helper functions for API calls

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
  if (typeof window !== 'undefined') {
    let path = (window.location.pathname || '').replace(/\/index\.html?$/i, '');
    path = path.replace(/\/$/, '') || '/';

    if (path !== '/' && path.length > 1) {
      const parent = path.replace(/\/[^/]*$/, '');
      const baseDir = parent && parent !== '' ? parent : path;
      if (baseDir && baseDir !== '/') {
        return `${baseDir}/api`;
      }
    }
  }

  // Default fallback (root deployment)
  return '/api';
}
