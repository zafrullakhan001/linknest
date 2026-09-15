import React, { useState, KeyboardEvent } from 'react';

const MAX_TAGS = 100;
const MAX_TAG_LENGTH = 50;

export function normalizeSearchTag(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.length > MAX_TAG_LENGTH ? trimmed.slice(0, MAX_TAG_LENGTH) : trimmed;
}

export function addSearchTag(tags: string[], raw: string): string[] {
  const tag = normalizeSearchTag(raw);
  if (!tag || tags.length >= MAX_TAGS) return tags;
  const lower = tag.toLowerCase();
  if (tags.some((t) => t.toLowerCase() === lower)) return tags;
  return [...tags, tag];
}

interface SearchTagsInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  /** Tailwind classes for the outer chip container (border/background). */
  className?: string;
}

/**
 * Chip-style input for space search tags (Enter/comma to add, × to remove).
 */
export const SearchTagsInput: React.FC<SearchTagsInputProps> = ({
  tags,
  onChange,
  disabled = false,
  className = 'w-full min-h-[42px] bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-brand-500/50 focus-within:border-brand-500 transition-all',
}) => {
  const [draft, setDraft] = useState('');

  const commitDraft = (raw: string) => {
    const next = addSearchTag(tags, raw);
    if (next !== tags) {
      onChange(next);
    }
    setDraft('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (draft.trim()) {
        commitDraft(draft);
      }
      return;
    }
    if (e.key === 'Backspace' && !draft && tags.length > 0) {
      e.preventDefault();
      onChange(tags.slice(0, -1));
    }
  };

  const handleChange = (value: string) => {
    if (value.includes(',')) {
      const parts = value.split(',');
      let next = tags;
      for (let i = 0; i < parts.length - 1; i++) {
        next = addSearchTag(next, parts[i]);
      }
      if (next !== tags) onChange(next);
      setDraft(parts[parts.length - 1]);
      return;
    }
    setDraft(value);
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className={`${className} flex flex-wrap gap-1.5 items-center`}>
        {tags.map((tag, index) => (
          <span
            key={`${tag.toLowerCase()}-${index}`}
            className="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 text-xs font-medium"
          >
            <span className="truncate">{tag}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(index)}
                className="shrink-0 text-sky-600 dark:text-sky-300 hover:text-red-600 dark:hover:text-red-400"
                aria-label={`Remove tag ${tag}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            )}
          </span>
        ))}
        <input
          type="text"
          value={draft}
          disabled={disabled || tags.length >= MAX_TAGS}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (draft.trim()) commitDraft(draft);
          }}
          placeholder={tags.length === 0 ? 'Type a tag and press Enter…' : tags.length >= MAX_TAGS ? 'Limit reached' : 'Add tag…'}
          className="flex-1 min-w-[8rem] bg-transparent border-0 outline-none text-sm text-slate-900 dark:text-white placeholder-slate-400 py-1"
          maxLength={MAX_TAG_LENGTH}
        />
      </div>
      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        {tags.length}/{MAX_TAGS} tags · alternate search keywords for this space
      </p>
    </div>
  );
};

export default SearchTagsInput;
