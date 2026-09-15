import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EMOJI_PICKER_CATEGORIES } from '../types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

/** True when the field looks like a pasted/custom emoji rather than a keyword search. */
function looksLikeCustomEmoji(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Keyword searches are letters/numbers/spaces/hyphens only
  if (/^[a-z0-9\s-]+$/i.test(trimmed)) return false;
  // Guard against accidental long pastes (URLs, paragraphs)
  if (trimmed.length > 64) return false;
  return true;
}

function emojisForQuery(search: string, activeId: string): string[] {
  const q = search.trim().toLowerCase();
  if (!q) {
    return EMOJI_PICKER_CATEGORIES.find((c) => c.id === activeId)?.emojis || [];
  }
  // Custom/pasted emoji: don't filter the catalog; the "Use this emoji" action handles it
  if (looksLikeCustomEmoji(search)) {
    return [];
  }
  const matchedCats = EMOJI_PICKER_CATEGORIES.filter(
    (c) =>
      c.id.includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.keywords.includes(q)
  );
  if (matchedCats.length > 0) {
    return Array.from(new Set(matchedCats.flatMap((c) => c.emojis)));
  }
  return Array.from(new Set(EMOJI_PICKER_CATEGORIES.flatMap((c) => c.emojis))).filter((emoji) =>
    emoji.includes(search.trim())
  );
}

export const EmojiPickerPanel: React.FC<{
  onSelect: (emoji: string) => void;
  currentValue?: string;
}> = ({ onSelect, currentValue = '' }) => {
  const [activeTab, setActiveTab] = useState('popular');
  const [searchTerm, setSearchTerm] = useState('');

  const customEmoji = looksLikeCustomEmoji(searchTerm) ? searchTerm.trim() : '';
  const filteredEmojis = useMemo(
    () => emojisForQuery(searchTerm, activeTab),
    [searchTerm, activeTab]
  );

  const applyCustomEmoji = (raw: string) => {
    const emoji = raw.trim();
    if (!looksLikeCustomEmoji(emoji)) return false;
    onSelect(emoji);
    return true;
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-800">
      <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-800 space-y-2">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            const next = e.target.value;
            setSearchTerm(next);
            if (next) setActiveTab('');
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData?.getData('text')?.trim() || '';
            if (looksLikeCustomEmoji(pasted)) {
              e.preventDefault();
              applyCustomEmoji(pasted);
            }
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            if (applyCustomEmoji(searchTerm)) {
              e.preventDefault();
            }
          }}
          placeholder="Search… or paste any emoji here"
          className="w-full text-sm px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 dark:text-white"
          autoFocus
        />
        {customEmoji ? (
          <button
            type="button"
            onClick={() => applyCustomEmoji(customEmoji)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
          >
            <span className="text-xl leading-none" aria-hidden>
              {customEmoji}
            </span>
            Use this emoji
          </button>
        ) : null}
      </div>

      {!searchTerm && (
        <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto shrink-0">
          {EMOJI_PICKER_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => {
                setActiveTab(category.id);
                setSearchTerm('');
              }}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === category.id
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {filteredEmojis.length > 0 ? (
          <div className="grid grid-cols-8 gap-1">
            {filteredEmojis.map((emoji, idx) => (
              <button
                key={`${emoji}-${idx}`}
                type="button"
                onClick={() => onSelect(emoji)}
                title={emoji}
                className={`h-10 w-full flex items-center justify-center text-xl rounded-lg transition-all hover:bg-brand-100 dark:hover:bg-brand-900/30 hover:scale-110 ${
                  currentValue === emoji ? 'bg-brand-100 dark:bg-brand-900/40 ring-1 ring-brand-400' : ''
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : customEmoji ? (
          <div className="text-center py-6 text-sm text-slate-500 dark:text-slate-400 space-y-2">
            <div className="text-4xl" aria-hidden>
              {customEmoji}
            </div>
            <p>This emoji isn’t in the built-in list. Click <span className="font-semibold text-slate-700 dark:text-slate-200">Use this emoji</span> above, or press Enter.</p>
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-slate-500 dark:text-slate-400 space-y-1">
            <p>No emojis found. Try “health”, “erp”, “bio”, or “cloud”.</p>
            <p className="text-xs">Or paste any emoji from Emojipedia / Windows emoji panel (Win + .).</p>
          </div>
        )}
      </div>

      <div className="p-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 shrink-0">
        <a
          href="https://emojipedia.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
        >
          More on Emojipedia
        </a>
        <a
          href="https://emojidb.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300"
        >
          More on EmojiDB
        </a>
      </div>
    </div>
  );
};

type PopoverPos = { top: number; left: number; width: number; height: number };

function computePopoverPosition(anchor: DOMRect): PopoverPos {
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(416, vw - margin * 2);
  const preferredHeight = 420;
  const maxHeight = Math.min(preferredHeight, vh - margin * 2);

  if (vw < 520) {
    const height = Math.min(maxHeight, Math.round(vh * 0.72));
    return {
      top: Math.max(margin, Math.round((vh - height) / 2)),
      left: Math.round((vw - width) / 2),
      width,
      height,
    };
  }

  let left = anchor.left;
  if (left + width > vw - margin) left = vw - width - margin;
  if (left < margin) left = margin;

  const spaceBelow = vh - anchor.bottom - margin;
  const spaceAbove = anchor.top - margin;
  const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;

  if (openUp) {
    const height = Math.min(maxHeight, Math.max(240, spaceAbove - 6));
    return { top: Math.max(margin, anchor.top - 6 - height), left, width, height };
  }

  const height = Math.min(maxHeight, Math.max(240, spaceBelow - 6));
  let top = anchor.bottom + 6;
  if (top + height > vh - margin) top = Math.max(margin, vh - margin - height);
  return { top, left, width, height };
}

export const EmojiPickerPopover: React.FC<{
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  anchorRef: { current: HTMLElement | null };
  currentValue?: string;
}> = ({ open, onClose, onSelect, anchorRef, currentValue }) => {
  const [pos, setPos] = useState<PopoverPos | null>(null);

  useEscapeToClose(open, onClose);

  const updatePosition = () => {
    const el = anchorRef.current;
    if (!el) return;
    setPos(computePopoverPosition(el.getBoundingClientRect()));
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updatePosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  if (!open || !pos || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10050]" onClick={onClose} />
      <div
        className="fixed z-[10051] rounded-xl border-2 border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col"
        style={{ top: pos.top, left: pos.left, width: pos.width, height: pos.height }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Choose emoji"
      >
        <EmojiPickerPanel
          currentValue={currentValue}
          onSelect={(emoji) => {
            onSelect(emoji);
            onClose();
          }}
        />
      </div>
    </>,
    document.body
  );
};
