// Helper functions for API calls

const RESERVED_URL_SEGMENTS = new Set([
  'api',
  'uploads',
  'dist',
  'assets',
  'node_modules',
  'vendor',
  'public',
  'data',
  'bin',
  'scripts',
  'docs',
  'apache',
  's',
  '_ln_sshgw',
  '_ln_vncgw'
]);

function isRelativeApiBase(value: string): boolean {
  const t = value.trim();
  return (
    t === '' ||
    t === '/' ||
    t === '.' ||
    t === './api' ||
    t.startsWith('./') ||
    t === 'auto' ||
    t === '__AUTO__'
  );
}

/**
 * Install folder from the browser URL, e.g. "/ArchLinks" or "/ERP3".
 * Empty string for a domain-root deploy. Uses the first path segment so
 * /ArchLinks and /ArchLinks/ (with or without a trailing slash) match.
 */
export function getAppBasePath(): string {
  if (typeof window === 'undefined') return '';

  const path = (window.location.pathname || '').replace(/\/index\.html?$/i, '');
  const match = path.match(/^\/([^/]+)/);
  if (!match) return '';

  const seg = match[1];
  if (!seg || RESERVED_URL_SEGMENTS.has(seg.toLowerCase())) return '';
  return '/' + seg;
}

/**
 * localStorage scope for this install. Lowercased so /ArchLinks and /archlinks
 * share one list, while /ERP3 stays separate.
 */
export function getAppStorageScope(): string {
  return getAppBasePath().toLowerCase();
}

export function resolveApiBase(): string {
  const baseDir = getAppBasePath();
  const fromPath = baseDir ? `${baseDir}/api` : '/api';

  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (typeof envBase === 'string') {
    const t = envBase.trim().replace(/\/$/, '');
    if (t && !isRelativeApiBase(t)) {
      // Trust a baked absolute path only when it matches this folder.
      // A portable ZIP built with -BasePath "/ERP3" must not send
      // /ArchLinks traffic to /ERP3/api.
      if (!baseDir || t.toLowerCase() === fromPath.toLowerCase()) {
        return t;
      }
    }
  }

  return fromPath;
}
