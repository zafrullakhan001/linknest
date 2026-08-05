import { LinkHealth } from '../types';

// Match other services: guard against environments where import.meta.env may not be typed
// Vite injects VITE_API_BASE at build time; fallback to '/api' for safety.
// API_BASE uses relative URLs (starting with /) which are protocol-agnostic
// This ensures the app works with both HTTP and HTTPS automatically
const API_BASE: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_BASE) ||
  '/api';

// Safety guard so frontend never "spins forever" even if backend/network hangs
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: number;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} request timed out after ${ms}ms`));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result as T;
  } finally {
    window.clearTimeout(timeoutId!);
  }
}

export interface HealthStats {
  total: number;
  healthy: number;
  broken: number;
  timeout: number;
  restricted: number;
  unknown: number;
}

export interface LinkHealthMap {
  [linkId: string]: LinkHealth;
}

export const linkHealthService = {
  /**
   * Get health status for all links
   */
  async getAllHealth(): Promise<LinkHealthMap> {
    const response = await withTimeout(
      fetch(`${API_BASE}/linkhealth`, {
        credentials: 'include'
      }),
      8000,
      'getAllHealth'
    );
    if (!response.ok) {
      throw new Error('Failed to fetch link health');
    }
    const data = await response.json();
    return data.health || {};
  },

  /**
   * Get health statistics
   */
  async getStats(): Promise<HealthStats> {
    const response = await withTimeout(
      fetch(`${API_BASE}/linkhealth/stats`, {
        credentials: 'include'
      }),
      8000,
      'getStats'
    );
    if (!response.ok) {
      throw new Error('Failed to fetch health stats');
    }
    const data = await response.json();
    return data.stats;
  },

  /**
   * Check a single link
   */
  async checkLink(linkId: string): Promise<LinkHealth> {
    const response = await withTimeout(
      fetch(`${API_BASE}/linkhealth/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ linkId })
      }),
      8000,
      'checkLink'
    );
    
    if (!response.ok) {
      throw new Error('Failed to check link');
    }
    
    const data = await response.json();
    return data.health;
  },

  /**
   * Check all links in a tile
   */
  async checkTileLinks(tileId: string, force: boolean = true): Promise<LinkHealthMap> {
    const response = await withTimeout(
      fetch(`${API_BASE}/linkhealth/check-tile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tileId, force })
      }),
      15000, // Allow a bit more time for whole-tile checks
      'checkTileLinks'
    );
    
    if (!response.ok) {
      throw new Error('Failed to check tile links');
    }
    
    const data = await response.json();
    return data.results || {};
  },

  /**
   * Check all links (admin feature)
   */
  async checkAllLinks(force: boolean = false, maxAge: number = 3600): Promise<{
    checked: number;
    results: { healthy: number; broken: number; timeout: number; unknown: number };
  }> {
    const response = await withTimeout(
      fetch(`${API_BASE}/linkhealth/check-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ force, maxAge })
      }),
      30000, // Admin bulk check can legitimately take a bit longer
      'checkAllLinks'
    );
    
    if (!response.ok) {
      throw new Error('Failed to check all links');
    }
    
    return await response.json();
  },

  /**
   * Get health indicator color class
   */
  getHealthColor(status: string): string {
    switch (status) {
      case 'healthy':
      case 'accessible':
      case 'restricted':
        return 'bg-emerald-500'; // Active / available
      case 'broken':
        return 'bg-red-500';
      case 'unknown':
      case 'timeout':
      case 'redirected':
        return 'bg-amber-500'; // Unsure, timed out, or redirected
      case 'checking':
        return 'bg-blue-500 animate-pulse';
      default:
        return 'bg-amber-500';
    }
  },

  /**
   * Get health status label
   */
  getHealthLabel(status: string): string {
    switch (status) {
      case 'healthy':
        return 'Link is working';
      case 'accessible':
        return 'Link is online (may require authentication)';
      case 'broken':
        return 'Link is broken';
      case 'timeout':
        return 'Link timed out';
      case 'redirected':
        return 'Link redirected';
      case 'restricted':
        return 'Link is online (requires authentication)';
      case 'checking':
        return 'Checking...';
      case 'unknown':
        return 'Status unsure';
      default:
        return 'Status unsure';
    }
  }
};

