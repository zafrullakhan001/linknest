import React, { useRef, useState } from 'react';
import { EmojiPickerPopover } from './EmojiPickerPanel';

interface TitleEmojiPickerProps {
  value?: string;
  onChange: (emoji: string) => void;
  size?: 'sm' | 'md' | 'lg';
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const emoji = (value || '').trim();
  const btnSize = size === 'lg' ? 'w-16 h-14 text-2xl' : size === 'sm' ? 'w-7 h-7 text-sm' : 'w-9 h-9 text-lg';

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${btnSize} rounded-lg border-2 flex items-center justify-center transition-all ${
          emoji
            ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:border-brand-400'
            : 'bg-slate-50 dark:bg-slate-900/50 border-dashed border-slate-300 dark:border-slate-600 hover:border-brand-400 text-slate-400'
        }`}
        title={title}
        aria-label={title}
        aria-expanded={open}
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
      <EmojiPickerPopover
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onChange}
        anchorRef={btnRef}
        currentValue={emoji}
      />
    </div>
  );
};
