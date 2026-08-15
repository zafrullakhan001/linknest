import React, { useCallback, useEffect, useState } from 'react';
import { RichTextEditor } from './RichTextEditor';
import { TinyMceRichTextEditor } from './TinyMceRichTextEditor';

export type RichTextEditorKind = 'simple' | 'tinymce';

const STORAGE_KEY = 'linknest-rich-text-editor';

export function readRichTextEditorPreference(): RichTextEditorKind {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'tinymce' || raw === 'simple') return raw;
  } catch {
    /* ignore */
  }
  return 'simple';
}

export function writeRichTextEditorPreference(kind: RichTextEditorKind): void {
  try {
    localStorage.setItem(STORAGE_KEY, kind);
  } catch {
    /* ignore */
  }
}

interface SelectableRichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Hide the Simple | TinyMCE toggle (still uses stored preference). */
  hideToggle?: boolean;
  /** Open TinyMCE full screen immediately when that editor is selected. */
  startOpen?: boolean;
}

/**
 * Facade that lets the user pick the built-in contentEditable editor or TinyMCE.
 * Preference is remembered per browser in localStorage.
 */
export const SelectableRichTextEditor: React.FC<SelectableRichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Enter text...',
  className = '',
  hideToggle = false,
  startOpen = false,
}) => {
  const [kind, setKind] = useState<RichTextEditorKind>(() => readRichTextEditorPreference());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'simple' || e.newValue === 'tinymce')) {
        setKind(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const selectKind = useCallback((next: RichTextEditorKind) => {
    setKind(next);
    writeRichTextEditorPreference(next);
  }, []);

  return (
    <div className={`selectable-rich-text-editor space-y-2 ${className}`}>
      {!hideToggle && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Editor
          </span>
          <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => selectKind('simple')}
              className={`px-2.5 py-1 font-medium transition-colors ${
                kind === 'simple'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              title="Built-in rich text editor"
            >
              Simple
            </button>
            <button
              type="button"
              onClick={() => selectKind('tinymce')}
              className={`px-2.5 py-1 font-medium transition-colors border-l border-slate-300 dark:border-slate-600 ${
                kind === 'tinymce'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
              title="TinyMCE (same engine family as Joomla)"
            >
              TinyMCE
            </button>
          </div>
        </div>
      )}
      {kind === 'tinymce' ? (
        <TinyMceRichTextEditor
          key="tinymce"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          startOpen={startOpen}
        />
      ) : (
        <RichTextEditor
          key="simple"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
      )}
    </div>
  );
};
