// Helper functions for API calls

export function resolveApiBase(): string {
  // Prefer Vite-injected env when available
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) {
    return envBase;
  }

  // Fallback: dynamically detect base path from current location
  if (typeof window !== 'undefined') {
    let path = (window.location.pathname || '').replace(/\/index\.html?$/i, '');
    path = path.replace(/\/$/, '') || '/';

    // Parent directory of the last path segment, or the segment itself when it is the app root
    // (e.g. /linknest with no trailing slash used to strip to '' and wrongly fall back to /api)
    // Examples:
    // /linknest/ -> /linknest/api
    // /linknest -> /linknest/api
    // /linknest/index.html -> /linknest/api
    // / -> /api
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
