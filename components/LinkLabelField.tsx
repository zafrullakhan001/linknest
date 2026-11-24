import React, { useState } from 'react';
import { SelectableRichTextEditor } from './SelectableRichTextEditor';
import { MobileRichTextEditor } from './MobileRichTextEditor';
import { looksLikeHtml, stripHtmlToPlainText } from '../utils/richTextDisplay';

interface LinkLabelFieldProps {
  value: string;
  onChange: (value: string) => void;
  variant?: 'desktop' | 'mobile';
}

export const LinkLabelField: React.FC<LinkLabelFieldProps> = ({
  value,
  onChange,
  variant = 'desktop',
}) => {
  const [useRichText, setUseRichText] = useState(() => looksLikeHtml(value));
  const isMobile = variant === 'mobile';

  const toggleRichText = () => {
    if (useRichText) {
      onChange(stripHtmlToPlainText(value));
      setUseRichText(false);
      return;
    }
    setUseRichText(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
          {useRichText ? 'Link Label (Rich Text)' : 'Link Label'}
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={useRichText}
          title={useRichText ? 'Use a simple text field' : 'Use the rich-text editor'}
          onClick={toggleRichText}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            useRichText ? 'bg-sky-500' : 'bg-slate-400 dark:bg-slate-600'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              useRichText ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      {useRichText ? (
        isMobile ? (
          <MobileRichTextEditor
            value={value}
            onChange={onChange}
            placeholder="Enter link name with formatting..."
          />
        ) : (
          <SelectableRichTextEditor
            value={value}
            onChange={onChange}
            placeholder="Enter link name with formatting..."
          />
        )
      ) : (
        <input
          type="text"
          value={looksLikeHtml(value) ? stripHtmlToPlainText(value) : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter link name..."
          className={
            isMobile
              ? 'w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50'
              : 'w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all'
          }
          style={isMobile ? { minHeight: '44px' } : undefined}
        />
      )}
    </div>
  );
};
