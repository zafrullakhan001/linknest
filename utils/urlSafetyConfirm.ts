import type { UrlSafetyResult } from '../types';
import {
  formatSafetyConfirmMessage,
  safetyRequiresConfirm,
  urlSafetyService,
  type UrlSafetyCheckResult,
} from '../services/urlSafetyService';

/**
 * Confirm known malware/phishing verdicts without waiting for background checks.
 * Pending or unavailable verdicts do not prevent saving.
 */
export async function confirmUrlSafetyBeforeSave(
  url: string,
  known?: UrlSafetyResult | UrlSafetyCheckResult | null
): Promise<boolean> {
  const trimmed = (url || '').trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    return true;
  }

  if (known && 'verdict' in known) {
    if (known.blockMalicious || known.verdict === 'malicious' || known.requiresConfirm) {
      // Known live result from the form badges
      const msg =
        'flags' in known && Array.isArray((known as UrlSafetyCheckResult).flags)
          ? formatSafetyConfirmMessage(known as UrlSafetyCheckResult)
          : `This URL is listed as malware/phishing (${(known as UrlSafetyResult).matchedDomain || trimmed}). Add it anyway?`;
      if ((known as UrlSafetyResult).blockMalicious) {
        window.alert(
          `This URL is blocked by URL Safety settings (malware/phishing). Ask an admin to allowlist the domain or disable hard-block.`
        );
        return false;
      }
      return window.confirm(msg);
    }
    // Known non-malicious verdict — skip extra API call
    if (
      known.verdict === 'safe' ||
      known.verdict === 'adult' ||
      known.verdict === 'suspicious' ||
      known.verdict === 'disabled' ||
      known.verdict === 'unknown'
    ) {
      return true;
    }
  }

  return true;
}

/**
 * Confirm for multiple URLs (bulk add). Returns true if commit should proceed.
 */
export async function confirmBulkUrlSafetyBeforeSave(urls: string[]): Promise<boolean> {
  const httpUrls = urls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));
  if (httpUrls.length === 0) return true;

  const flagged: UrlSafetyCheckResult[] = [];
  // Cap concurrent checks
  const batchSize = 5;
  for (let i = 0; i < httpUrls.length; i += batchSize) {
    const chunk = httpUrls.slice(i, i + batchSize);
    const results = await Promise.all(
      chunk.map(async (url) => {
        try {
          return await urlSafetyService.checkUrl(url);
        } catch {
          return null;
        }
      })
    );
    for (const r of results) {
      if (r && safetyRequiresConfirm(r)) {
        flagged.push(r);
      }
      if (r?.blockMalicious) {
        window.alert(
          `At least one URL is blocked by URL Safety settings (malware/phishing):\n${r.url}\n\nRemove it or ask an admin to allowlist the domain.`
        );
        return false;
      }
    }
  }

  if (flagged.length === 0) return true;

  const preview = flagged
    .slice(0, 5)
    .map((r) => `• ${r.host || r.url}`)
    .join('\n');
  const more = flagged.length > 5 ? `\n…and ${flagged.length - 5} more` : '';
  return window.confirm(
    `${flagged.length} URL${flagged.length === 1 ? '' : 's'} flagged as malware/phishing:\n${preview}${more}\n\nAdd them anyway?`
  );
}
