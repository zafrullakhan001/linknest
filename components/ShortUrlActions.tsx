import React, { useCallback, useState } from 'react';
import { copyTextToClipboard, recycleShortUrl, type ShortUrlTargetType } from '../services/shortUrlService';

interface ShortUrlActionsProps {
  targetType: ShortUrlTargetType;
  targetId: string;
  shortUrl?: string | null;
  canRecycle?: boolean;
  compact?: boolean;
  /** When false, hide the short-URL copy button (recycle can still show). */
  showCopy?: boolean;
  onRecycled?: (next: { shortUrl: string; code: string }) => void;
}

export const ShortUrlActions: React.FC<ShortUrlActionsProps> = ({
  targetType,
  targetId,
  shortUrl,
  canRecycle = false,
  compact = false,
  showCopy = true,
  onRecycled,
}) => {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!shortUrl) return;
    const ok = await copyTextToClipboard(shortUrl);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }, [shortUrl]);

  const handleRecycle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canRecycle || busy) return;
    const kind = targetType === 'tile' ? 'space' : targetType;
    if (!window.confirm(`Recycle this ${kind} short URL? Old bookmarks to it will stop working. People will need to open this app to get the new one.`)) {
      return;
    }
    setBusy(true);
    try {
      const result = await recycleShortUrl(targetType, targetId);
      onRecycled?.({ shortUrl: result.shortUrl, code: result.code });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to recycle short URL');
    } finally {
      setBusy(false);
    }
  }, [busy, canRecycle, onRecycled, targetId, targetType]);

  const canCopy = showCopy && !!shortUrl;
  if (!canCopy && !canRecycle) {
    return null;
  }

  const btnClass = compact
    ? 'p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-all'
    : 'p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors';

  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      {canCopy ? (
        <button
          type="button"
          onClick={handleCopy}
          className={`${btnClass} text-orange-500 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-300`}
          title={copied ? 'Copied short URL' : 'Copy short URL'}
          aria-label={copied ? 'Copied short URL' : 'Copy short URL'}
        >
          {copied ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
              <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
            </svg>
          )}
        </button>
      ) : null}
      {canRecycle ? (
        <button
          type="button"
          onClick={handleRecycle}
          disabled={busy}
          className={`${btnClass} text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-50`}
          title="Recycle short URL (invalidate the old one)"
          aria-label="Recycle short URL"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
          </svg>
        </button>
      ) : null}
    </span>
  );
};
