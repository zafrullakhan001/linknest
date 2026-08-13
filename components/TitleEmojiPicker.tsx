import React, { useState } from 'react';
import { POPULAR_EMOJIS } from '../types';

interface TitleEmojiPickerProps {
  value?: string;
  onChange: (emoji: string) => void;
  size?: 'sm' | 'md';
  title?: string;
}

/** Compact emoji picker shown to the left of tab/section titles. */
export const TitleEmojiPicker: React.FC<TitleEmojiPickerProps> = ({
  value = '',
  onChange,
  size = 'md',
  title = 'Choose emoji',
}) => {
  const [open, setOpen] = useState(false);
  const emoji = (value || '').trim();
  const btnSize = size === 'sm' ? 'w-7 h-7 text-sm' : 'w-9 h-9 text-lg';

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${btnSize} rounded-lg border-2 flex items-center justify-center transition-all ${
          emoji
            ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:border-brand-400'
            : 'bg-slate-50 dark:bg-slate-900/50 border-dashed border-slate-300 dark:border-slate-600 hover:border-brand-400 text-slate-400'
        }`}
        title={title}
        aria-label={title}
      >
        <span aria-hidden>{emoji || '😀'}</span>
      </button>
      {emoji ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange('');
            setOpen(false);
          }}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-500 hover:bg-red-500 text-white text-[10px] leading-none flex items-center justify-center z-10"
          title="Clear emoji"
        >
          ×
        </button>
      ) : null}
      {open ? (
        <>
          <div className="fixed inset-0 z-[40]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 w-72 max-h-64 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[50] flex flex-col overflow-hidden">
            <div className="p-2 border-b border-slate-100 dark:border-slate-700">
              <input
                type="text"
                value={emoji}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Type or paste emoji…"
                className="w-full text-sm px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="flex flex-wrap gap-1">
                {POPULAR_EMOJIS.slice(0, 120).map((item, i) => (
                  <button
                    key={`${item}-${i}`}
                    type="button"
                    onClick={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                    className="text-xl p-1.5 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/30 hover:scale-110 transition-all"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
