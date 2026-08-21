import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ensureRichTextFontsLoaded } from '../utils/richTextFonts';

const MSG = 'linknest-tinymce';

interface TinyMceRichTextViewerProps {
  html: string;
  className?: string;
  onEscape?: () => void;
}

export interface TinyMceRichTextViewerHandle {
  getSelectedText: () => string;
  setSelectionHighlight: (on: boolean) => void;
  setSpeakProgress: (charIndex: number, charLength: number) => void;
}

/**
 * Read-only TinyMCE iframe so dialog viewers use the same CSS/fonts as the editor.
 */
export const TinyMceRichTextViewer = forwardRef<TinyMceRichTextViewerHandle, TinyMceRichTextViewerProps>(
  function TinyMceRichTextViewer({ html, className = '', onEscape }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const htmlRef = useRef(html || '');
    const onEscapeRef = useRef(onEscape);
    const [ready, setReady] = useState(false);

    htmlRef.current = html || '';
    onEscapeRef.current = onEscape;

    useEffect(() => {
      ensureRichTextFontsLoaded();
    }, []);

    const iframeSrc = useMemo(() => {
      const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
      const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
      return `${base}tinymce-editor.html?v=toolsmax6&mode=view&dark=${dark ? '1' : '0'}`;
    }, []);

    const postToViewer = useCallback((payload: Record<string, unknown>) => {
      iframeRef.current?.contentWindow?.postMessage({ source: MSG, ...payload }, '*');
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        getSelectedText: () => {
          try {
            const win = iframeRef.current?.contentWindow as
              | (Window & { __linknestGetSelectedText?: () => string })
              | null
              | undefined;
            const text = win?.__linknestGetSelectedText?.() || '';
            return String(text).replace(/\s+/g, ' ').trim();
          } catch {
            return '';
          }
        },
        setSelectionHighlight: (on: boolean) => {
          try {
            const win = iframeRef.current?.contentWindow as
              | (Window & { __linknestSetSelectionHighlight?: (on: boolean) => void })
              | null
              | undefined;
            win?.__linknestSetSelectionHighlight?.(on);
          } catch {
            // Ignore cross-frame failures
          }
        },
        setSpeakProgress: (charIndex: number, charLength: number) => {
          try {
            const win = iframeRef.current?.contentWindow as
              | (Window & { __linknestSetSpeakProgress?: (i: number, len: number) => void })
              | null
              | undefined;
            win?.__linknestSetSpeakProgress?.(charIndex, charLength);
          } catch {
            // Ignore
          }
        },
      }),
      []
    );

    useEffect(() => {
      const onMessage = (e: MessageEvent) => {
        if (e.origin !== window.location.origin) return;
        if (!e.data || e.data.source !== MSG) return;
        if (e.data.mode !== 'view') return;
        if (e.data.type === 'ready') {
          setReady(true);
          postToViewer({ type: 'set', html: htmlRef.current });
        }
        if (e.data.type === 'escape') {
          onEscapeRef.current?.();
        }
      };
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }, [postToViewer]);

    useEffect(() => {
      if (!ready) return;
      postToViewer({ type: 'set', html: htmlRef.current });
    }, [html, ready, postToViewer]);

    return (
      <div className={`tinymce-rich-text-viewer relative h-full w-full min-h-0 ${className}`}>
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500 pointer-events-none">
            Loading…
          </div>
        )}
        <iframe
          ref={iframeRef}
          title="TinyMCE viewer"
          src={iframeSrc}
          className={`h-full w-full min-h-0 border-0 bg-transparent ${ready ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => {
            postToViewer({ type: 'set', html: htmlRef.current });
          }}
        />
        <span
          className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-md border border-slate-200/90 bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm dark:border-slate-600/90 dark:bg-slate-800/90 dark:text-slate-400"
          title="Rendered with TinyMCE (same engine as the editor)"
          aria-label="TinyMCE viewer"
        >
          TinyMCE viewer
        </span>
      </div>
    );
  }
);
