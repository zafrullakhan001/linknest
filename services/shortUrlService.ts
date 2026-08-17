import { resolveApiBase } from './apiHelpers';

export type ShortUrlTargetType = 'tile' | 'tab' | 'section' | 'link';

export interface RecycleShortUrlResult {
  code: string;
  shortUrl: string;
  targetType: ShortUrlTargetType;
  targetId: string;
}

export async function recycleShortUrl(
  targetType: ShortUrlTargetType,
  targetId: string
): Promise<RecycleShortUrlResult> {
  const res = await fetch(`${resolveApiBase()}/short-urls/recycle`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetType, targetId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to recycle short URL');
  }
  return data as RecycleShortUrlResult;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
