import type { AccessRestrictions } from '../types';
import { resolveApiBase } from './apiHelpers';

const API_BASE = resolveApiBase();

export interface AccessRestrictionCheckResult {
  allowed: boolean;
  message?: string | null;
  reason?: string | null;
  failedAt?: 'tile' | 'tab' | 'link' | string | null;
}

export const ACCESS_BROWSER_NAMES = [
  'chrome', 'edge', 'firefox', 'safari', 'opera', 'brave', 'vivaldi', 'duckduckgo',
] as const;

export const ACCESS_OS_NAMES = ['windows', 'macos', 'linux', 'android', 'ios'] as const;

export function hasAccessRestrictions(rules?: AccessRestrictions | null): boolean {
  if (!rules) return false;
  if (rules.timeRules && rules.timeRules.length > 0) return true;
  if (rules.hostRules && rules.hostRules.length > 0) return true;
  if (rules.vpn?.required || (rules.vpn?.allowedIpRanges && rules.vpn.allowedIpRanges.trim()) || (rules.vpn?.trustedHeaderName && rules.vpn.trustedHeaderName.trim())) return true;
  if (rules.allowedDeviceType && rules.allowedDeviceType !== 'any') return true;
  if (rules.browsers && rules.browsers.length > 0) return true;
  if (rules.osAllow && rules.osAllow.length > 0) return true;
  if (rules.countryAllow && rules.countryAllow.length > 0) return true;
  if (rules.countryDeny && rules.countryDeny.length > 0) return true;
  if (rules.validFrom || rules.validUntil) return true;
  if (rules.referrerPatterns && rules.referrerPatterns.length > 0) return true;
  if (rules.fingerprintHashes && rules.fingerprintHashes.length > 0) return true;
  return false;
}

export async function checkAccessRestriction(
  entityType: 'tile' | 'tab' | 'link',
  id: string,
  fingerprintHash?: string | null
): Promise<AccessRestrictionCheckResult> {
  const response = await fetch(`${API_BASE}/access-restrictions/check`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityType, id, fingerprintHash: fingerprintHash || undefined }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 404) {
    return { allowed: false, message: data.error || 'Not found', reason: 'not_found' };
  }
  if (!response.ok) {
    return { allowed: false, message: data.error || 'Unable to verify access', reason: 'error' };
  }
  return {
    allowed: data.allowed !== false,
    message: data.message ?? null,
    reason: data.reason ?? null,
    failedAt: data.failedAt ?? null,
  };
}
