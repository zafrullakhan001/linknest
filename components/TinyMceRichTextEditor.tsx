import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { ensureRichTextFontsLoaded } from '../utils/richTextFonts';
import { prepareViewerHtml } from '../utils/richTextDisplay';
import { MediaPickerModal } from './MediaPickerModal';

interface TinyMceRichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** When true, open the full-screen editor immediately. Default is closed until the user asks for it. */
  startOpen?: boolean;
}

const MSG = 'linknest-tinymce';
/** Above nav (100), dialogs (100000), and typical overlays. */
const OVERLAY_Z = 2147483000;

/**
 * TinyMCE runs inside a same-origin iframe so its toolbar menus (colors, styles)
 * cannot be trapped by LinkNest overflow/z-index stacking.
 */
export const TinyMceRichTextEditor: React.FC<TinyMceRichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Enter text...',
  className = '',
  startOpen = false,
}) => {
  const [open, setOpen] = useState(startOpen);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    ensureRichTextFontsLoaded();
  }, []);
  const htmlRef = useRef(value || '');
  const readyRef = useRef(false);

  htmlRef.current = value || '';

  const iframeSrc = useMemo(() => {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
    const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    return `${base}tinymce-editor.html?v=medialib3&dark=${dark ? '1' : '0'}`;
  }, []);

  const postToEditor = useCallback((payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ source: MSG, ...payload }, '*');
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.source !== MSG) return;
      if (e.data.mode === 'view') return;
      if (e.data.type === 'ready') {
        readyRef.current = true;
        postToEditor({ type: 'set', html: htmlRef.current });
      }
      if (e.data.type === 'close') {
        onChange(htmlRef.current);
        setOpen(false);
      }
      if (e.data.type === 'change' || e.data.type === 'content') {
        const html = typeof e.data.html === 'string' ? e.data.html : '';
        htmlRef.current = html;
        onChange(html);
      }
      if (e.data.type === 'openMediaManager') {
        setShowMediaPicker(true);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onChange, postToEditor]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = useCallback(() => {
    postToEditor({ type: 'get' });
    onChange(htmlRef.current);
    setOpen(false);
  }, [onChange, postToEditor]);

  useEscapeToClose(open, close);

  const previewHtml = useMemo(() => {
    const raw = (value || '').trim();
    if (!raw) return `<p class="text-slate-400 italic">${placeholder}</p>`;
    return prepareViewerHtml(value);
  }, [value, placeholder]);

  return (
    <div className={`tinymce-rich-text-editor ${className}`}>
      <div className="rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/60 p-3 space-y-3">
        <div
          className="min-h-[80px] max-h-40 overflow-auto text-slate-800 dark:text-slate-200 ln-tinymce-content"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              readyRef.current = false;
              setOpen(true);
            }}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-500 text-white shadow-sm"
          >
            {open ? 'Editor open…' : 'Open full screen'}
          </button>
        </div>
      </div>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 flex flex-col bg-white dark:bg-slate-900"
            style={{ zIndex: OVERLAY_Z }}
            role="dialog"
            aria-modal="true"
            aria-label="TinyMCE full screen editor"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 shrink-0">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">TinyMCE Editor</h3>
              <button
                type="button"
                onClick={close}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-500 text-white shadow-sm"
              >
                Done
              </button>
            </div>
            <iframe
              ref={iframeRef}
              title="TinyMCE editor"
              src={iframeSrc}
              className="flex-1 w-full min-h-0 border-0 bg-white"
              onLoad={() => {
                postToEditor({ type: 'set', html: htmlRef.current });
              }}
            />
          </div>,
          document.body
        )}
      <MediaPickerModal
        open={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        onInsertHtml={(html) => {
          postToEditor({ type: 'insertHtml', html });
          setShowMediaPicker(false);
        }}
      />
    </div>
  );
};
