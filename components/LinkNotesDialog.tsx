import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface LinkNotesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  linkLabel: string;
  notes: string;
}

const SECTION_EMOJIS: Array<{ match: RegExp; emoji: string }> = [
  { match: /^owner\s+information/i, emoji: '👤' },
  { match: /^support\s+team/i, emoji: '🛟' },
  { match: /^service\s*now\s+group/i, emoji: '🎫' },
  { match: /^contact\s+information/i, emoji: '📇' },
  { match: /^service\s*now\s+ticket/i, emoji: '🧾' },
  { match: /^go[- ]?live/i, emoji: '🚀' },
  { match: /^major\s+upgrade/i, emoji: '⬆️' },
  { match: /^manager\s+information/i, emoji: '👔' },
];

const KNOWN_SECTION_RE =
  /^(Owner Information|Support Team Information|Service Now Group Information|Contact Information|Service Now Ticket Information|Go-Live Information|Major Upgrade Information|Manager Information)\s*:?\s*$/i;

function stripHtmlTags(content: string): string {
  if (!content) return '';
  if (typeof document === 'undefined') return content.replace(/<[^>]*>/g, '');
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  return tempDiv.textContent || tempDiv.innerText || '';
}

function getSectionEmoji(title: string): string {
  for (const entry of SECTION_EMOJIS) {
    if (entry.match.test(title)) return entry.emoji;
  }
  return '•';
}

function parseNotesSections(notes: string): Array<{ title: string; body: string }> {
  const text = (notes || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const lines = text.split('\n');
  const sections: Array<{ title: string; body: string }> = [];
  let currentTitle = '';
  let currentBody: string[] = [];

  const flush = () => {
    const body = currentBody.join('\n').trim();
    if (currentTitle || body) {
      sections.push({
        title: currentTitle || 'Notes',
        body,
      });
    }
    currentTitle = '';
    currentBody = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (KNOWN_SECTION_RE.test(trimmed)) {
      flush();
      currentTitle = trimmed.replace(/:\s*$/, '');
      continue;
    }
    currentBody.push(line);
  }
  flush();

  if (sections.length === 1 && sections[0].title === 'Notes') {
    return sections;
  }
  return sections.filter((s) => s.title || s.body);
}

function linkifyText(text: string): React.ReactNode[] {
  if (!text) return [];
  const pattern =
    /((https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}])|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const isEmail = token.includes('@') && !/^https?:\/\//i.test(token) && !/^www\./i.test(token);
    const href = isEmail
      ? `mailto:${token}`
      : /^www\./i.test(token)
        ? `https://${token}`
        : token;
    nodes.push(
      <a
        key={`lnk-${key++}`}
        href={href}
        target={isEmail ? undefined : '_blank'}
        rel={isEmail ? undefined : 'noopener noreferrer'}
        className="text-brand-600 dark:text-brand-500 underline underline-offset-2 hover:text-brand-700 dark:hover:text-brand-400 break-all"
        onClick={(e) => e.stopPropagation()}
      >
        {token}
      </a>
    );
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes.length ? nodes : [text];
}

function renderBodyLines(body: string): React.ReactNode {
  if (!body) {
    return <p className="text-sm text-slate-400 italic">No details</p>;
  }

  const lines = body.split('\n').filter((l) => l.trim().length > 0);
  return (
    <ul className="space-y-1.5">
      {lines.map((line, idx) => {
        const colonIdx = line.indexOf(':');
        const looksLikeLabel =
          colonIdx > 0 &&
          colonIdx < 48 &&
          !line.slice(0, colonIdx).includes('@') &&
          !/^https?:/i.test(line.slice(0, colonIdx));

        if (looksLikeLabel) {
          const label = line.slice(0, colonIdx).trim();
          const value = line.slice(colonIdx + 1).trim();
          return (
            <li key={idx} className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              <span className="font-medium text-slate-800 dark:text-slate-100">{label}:</span>{' '}
              <span className="break-words">{linkifyText(value)}</span>
            </li>
          );
        }

        return (
          <li key={idx} className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 break-words">
            {linkifyText(line.trim())}
          </li>
        );
      })}
    </ul>
  );
}

export const LinkNotesDialog: React.FC<LinkNotesDialogProps> = ({
  isOpen,
  onClose,
  linkLabel,
  notes,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const positionRef = useRef({ x: 0, y: 0 });
  const sizeRef = useRef({ width: 0, height: 0 });

  const plainLabel = useMemo(() => stripHtmlTags(linkLabel || ''), [linkLabel]);
  const sections = useMemo(() => parseNotesSections(notes), [notes]);

  useEffect(() => {
    if (!isOpen) return;

    const width = Math.min(640, window.innerWidth - 32);
    const height = Math.min(560, window.innerHeight - 32);
    const nextSize = { width, height };
    const nextPos = {
      x: Math.max(16, (window.innerWidth - width) / 2),
      y: Math.max(16, (window.innerHeight - height) / 2),
    };
    setSize(nextSize);
    setPosition(nextPos);
    sizeRef.current = nextSize;
    positionRef.current = nextPos;
    setCopied(false);
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
    if (target.closest('button')) return;
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
    const minWidth = 360;
    const minHeight = 280;
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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(notes || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    }
  };

  if (!isOpen || typeof document === 'undefined' || size.width === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999]" role="presentation">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-notes-dialog-title"
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
              <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-lg shrink-0 text-slate-600 dark:text-slate-300">
                📝
              </div>
              <div className="min-w-0">
                <h3
                  id="link-notes-dialog-title"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  Link Notes
                </h3>
                <p
                  className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate"
                  title={plainLabel}
                  dangerouslySetInnerHTML={{ __html: linkLabel || '' }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0"
              title="Close"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 bg-slate-50 dark:bg-slate-900/50">
          {sections.length === 0 ? (
            <div className="h-full min-h-[120px] flex flex-col items-center justify-center text-center gap-2 text-slate-400">
              <p className="text-sm">No notes for this link yet.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {sections.map((section, idx) => {
                const emoji = getSectionEmoji(section.title);
                return (
                  <section
                    key={`${section.title}-${idx}`}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3.5"
                  >
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100 dark:border-slate-700/80">
                      <span className="text-sm leading-none opacity-80" aria-hidden>
                        {emoji}
                      </span>
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {section.title}
                      </h4>
                    </div>
                    {renderBodyLines(section.body)}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {copied ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                  <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.44A1.5 1.5 0 008.378 6H4.5z" />
                </svg>
                Copy Notes
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
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
