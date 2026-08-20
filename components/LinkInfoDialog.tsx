import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../contexts/SettingsContext';
import { getDisplayUrl } from '../utils/urlDisplay';
import { tryHandleSshLinkClick } from '../utils/sshLink';
import { tryHandleVncLinkClick } from '../utils/vncLink';
import { linkifyHtml } from '../utils/richTextDisplay';
import { useAccessRestrictionGate } from '../contexts/AccessRestrictionContext';
import { toSpeakableText, useReadAloud } from '../hooks/useReadAloud';
import { ReadAloudButtons, ReadAloudVoiceSelect } from './ReadAloudControls';
import { TinyMceRichTextViewer } from './TinyMceRichTextViewer';

interface LinkInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  linkId?: string;
  linkLabel: string;
  linkIcon?: string;
  richTextContent: string;
  linkUrl?: string;
  browser?: string;
}

const SECTION_EMOJIS: Array<{ match: RegExp; emoji: string }> = [
  { match: /owner\s+information/i, emoji: '👤' },
  { match: /support\s+team/i, emoji: '🛟' },
  { match: /service\s*now\s+group/i, emoji: '🎫' },
  { match: /contact\s+information/i, emoji: '📇' },
  { match: /service\s*now\s+ticket/i, emoji: '🧾' },
  { match: /go[- ]?live/i, emoji: '🚀' },
  { match: /major\s+upgrade/i, emoji: '⬆️' },
  { match: /manager\s+information/i, emoji: '👔' },
];

function stripHtmlTags(content: string): string {
  if (!content) return '';
  if (typeof document === 'undefined') return content.replace(/<[^>]*>/g, '');
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  return tempDiv.textContent || tempDiv.innerText || '';
}

function getSectionEmoji(text: string): string | null {
  for (const entry of SECTION_EMOJIS) {
    if (entry.match.test(text)) return entry.emoji;
  }
  return null;
}

/** Inject section emojis into rich HTML headings / bold labels without changing stored content. */
function enhanceRichTextWithEmojis(html: string): string {
  if (!html || typeof document === 'undefined') return html || '';

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="__info_root">${html}</div>`, 'text/html');
    const root = doc.getElementById('__info_root');
    if (!root) return html;

    const candidates = root.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, p');
    candidates.forEach((el) => {
      const text = (el.textContent || '').trim();
      if (!text || text.length > 80) return;
      const emoji = getSectionEmoji(text.replace(/:\s*$/, ''));
      if (!emoji) return;
      // Avoid double-injecting
      if ((el.textContent || '').trimStart().startsWith(emoji)) return;
      // Only decorate clear section labels (short lines / trailing colon)
      const isHeading = /^H[1-6]$/i.test(el.tagName);
      const isBoldLabel = /^(STRONG|B)$/i.test(el.tagName) && /information|go-live|upgrade/i.test(text);
      const isShortPara = el.tagName === 'P' && /:\s*$/.test(text) && getSectionEmoji(text.replace(/:\s*$/, ''));
      if (!isHeading && !isBoldLabel && !isShortPara) return;

      el.insertBefore(doc.createTextNode(`${emoji} `), el.firstChild);
    });

    return root.innerHTML;
  } catch {
    return html;
  }
}

export const LinkInfoDialog: React.FC<LinkInfoDialogProps> = ({
  isOpen,
  onClose,
  linkId,
  linkLabel,
  linkIcon,
  richTextContent,
  linkUrl,
  browser,
}) => {
  const { settings } = useSettings();
  const { assertCanOpen } = useAccessRestrictionGate();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const positionRef = useRef({ x: 0, y: 0 });
  const sizeRef = useRef({ width: 0, height: 0 });

  const plainLabel = useMemo(() => stripHtmlTags(linkLabel || ''), [linkLabel]);
  const displayHtml = useMemo(
    () => enhanceRichTextWithEmojis(linkifyHtml(richTextContent || '')),
    [richTextContent]
  );
  const speakableText = useMemo(() => toSpeakableText(richTextContent || ''), [richTextContent]);
  const readAloud = useReadAloud({
    text: speakableText,
    active: isOpen,
    autoStart: false,
  });

  const formatBrowserName = (browserId: string | null | undefined): string => {
    if (!browserId || browserId === 'default') return '';
    return browserId
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .replace('Wsl', '(WSL)');
  };

  const normalizeBrowserId = (browserId: string): string => {
    if (!browserId) return browserId;
    const normalized = browserId.toLowerCase().trim();
    const shortAliases: Record<string, string> = {
      edge: 'edge-stable-local',
      chrome: 'chrome-stable-local',
    };
    return shortAliases[normalized] || browserId;
  };

  const openLinkInBrowser = (url: string, browserId: string) => {
    if (typeof window !== 'undefined' && (window as any).BrowserLauncher) {
      const BrowserLauncher = (window as any).BrowserLauncher;
      if (settings.browser_extension_id) {
        BrowserLauncher.setExtensionId(settings.browser_extension_id);
      }
      const normalizedBrowserId = normalizeBrowserId(browserId);
      BrowserLauncher.open(url, normalizedBrowserId, { fallback: true }, (response: any) => {
        if (!(response && response.success !== false)) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      }).catch(() => {
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const width = Math.min(720, window.innerWidth - 32);
    const height = Math.min(640, window.innerHeight - 32);
    const nextSize = { width, height };
    const nextPos = {
      x: Math.max(16, (window.innerWidth - width) / 2),
      y: Math.max(16, (window.innerHeight - height) / 2),
    };
    setSize(nextSize);
    setPosition(nextPos);
    sizeRef.current = nextSize;
    positionRef.current = nextPos;
  }, [isOpen]);

  useEffect(() => {
    if (!isDragging && !isResizing) {
      positionRef.current = position;
      sizeRef.current = size;
    }
  }, [position, size, isDragging, isResizing]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  const handleDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, select, label')) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - positionRef.current.x,
      y: e.clientY - positionRef.current.y,
    };
  };

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!dialogRef.current) return;
    const maxX = window.innerWidth - Math.min(sizeRef.current.width, window.innerWidth);
    const maxY = window.innerHeight - 48;
    const newX = Math.max(0, Math.min(e.clientX - dragStartRef.current.x, maxX));
    const newY = Math.max(0, Math.min(e.clientY - dragStartRef.current.y, maxY));
    positionRef.current = { x: newX, y: newY };
    dialogRef.current.style.left = `${newX}px`;
    dialogRef.current.style.top = `${newY}px`;
  }, []);

  const handleDragEnd = useCallback(() => {
    setPosition(positionRef.current);
    setIsDragging(false);
  }, []);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dialogRef.current) return;
    setIsResizing(true);
    const rect = dialogRef.current.getBoundingClientRect();
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
    };
  };

  const handleResize = useCallback((e: MouseEvent) => {
    if (!dialogRef.current) return;
    const minWidth = 400;
    const minHeight = 320;
    const maxWidth = window.innerWidth - positionRef.current.x - 8;
    const maxHeight = window.innerHeight - positionRef.current.y - 8;
    const newWidth = Math.max(
      minWidth,
      Math.min(resizeStartRef.current.width + (e.clientX - resizeStartRef.current.x), maxWidth)
    );
    const newHeight = Math.max(
      minHeight,
      Math.min(resizeStartRef.current.height + (e.clientY - resizeStartRef.current.y), maxHeight)
    );
    sizeRef.current = { width: newWidth, height: newHeight };
    dialogRef.current.style.width = `${newWidth}px`;
    dialogRef.current.style.height = `${newHeight}px`;
  }, []);

  const handleResizeEnd = useCallback(() => {
    setSize(sizeRef.current);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (!isDragging && !isResizing) return;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = isDragging ? 'move' : 'nwse-resize';
    document.addEventListener('mousemove', isDragging ? handleDrag : handleResize);
    document.addEventListener('mouseup', isDragging ? handleDragEnd : handleResizeEnd);
    return () => {
      document.removeEventListener('mousemove', isDragging ? handleDrag : handleResize);
      document.removeEventListener('mouseup', isDragging ? handleDragEnd : handleResizeEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, isResizing, handleDrag, handleResize, handleDragEnd, handleResizeEnd]);

  if (!isOpen || typeof document === 'undefined' || size.width === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999]" role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-info-dialog-title"
        className={`absolute flex flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl ${
          isDragging || isResizing ? 'will-change-transform' : 'animate-in fade-in zoom-in-95 duration-150'
        }`}
        style={{
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
          transition: isDragging || isResizing ? 'none' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — drag handle */}
        <div
          className={`shrink-0 cursor-move select-none px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 ${
            isDragging ? 'cursor-grabbing' : ''
          }`}
          onMouseDown={handleDragStart}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-lg shrink-0">
                {linkIcon || 'ℹ️'}
              </div>
              <div className="min-w-0">
                <h2
                  id="link-info-dialog-title"
                  className="text-base font-semibold text-slate-900 dark:text-white truncate"
                  title={plainLabel}
                  dangerouslySetInnerHTML={{ __html: linkLabel || '' }}
                />
                {linkUrl && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={linkUrl}>
                    {getDisplayUrl(linkUrl)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <ReadAloudButtons readAloud={readAloud} theme="slate" />
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title="Close"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <ReadAloudVoiceSelect readAloud={readAloud} id="link-info-voice" theme="slate" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden min-h-0 bg-slate-50 dark:bg-slate-900/50">
          {displayHtml ? (
            <TinyMceRichTextViewer html={displayHtml} onEscape={onClose} />
          ) : (
            <div className="h-full min-h-[120px] flex items-center justify-center text-sm text-slate-400">
              No information available for this link.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {linkUrl && (
              <>
                <button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (tryHandleSshLinkClick(linkUrl, e)) return;
                    if (tryHandleVncLinkClick(linkUrl, e)) return;
                    if (linkId) {
                      const allowed = await assertCanOpen('link', linkId);
                      if (!allowed) return;
                    }
                    if (settings.browser_specific_links_enabled === '1' && browser && browser !== 'default') {
                      openLinkInBrowser(linkUrl, browser);
                    } else {
                      window.open(linkUrl, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                    <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                  </svg>
                  Open Link
                </button>
                {settings.browser_specific_links_enabled === '1' && browser && browser !== 'default' && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Opens in {formatBrowserName(browser)}
                  </span>
                )}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>

        {/* Resize handle */}
        <div
          className={`absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end p-0.5 rounded-br-xl ${
            isResizing ? 'bg-slate-200/80 dark:bg-slate-600/50' : 'hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
          onMouseDown={handleResizeStart}
          title="Resize"
          aria-label="Resize dialog"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" className="text-slate-400 dark:text-slate-500" aria-hidden>
            <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          </svg>
        </div>
      </div>
    </div>,
    document.body
  );
};
