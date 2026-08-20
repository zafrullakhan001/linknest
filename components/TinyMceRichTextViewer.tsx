import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureRichTextFontsLoaded } from '../utils/richTextFonts';

const MSG = 'linknest-tinymce';

interface TinyMceRichTextViewerProps {
  html: string;
  className?: string;
  onEscape?: () => void;
}

/**
 * Read-only TinyMCE iframe so dialog viewers use the same CSS/fonts as the editor.
 */
export const TinyMceRichTextViewer: React.FC<TinyMceRichTextViewerProps> = ({
  html,
  className = '',
  onEscape,
}) => {
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
    return `${base}tinymce-editor.html?v=view1&mode=view&dark=${dark ? '1' : '0'}`;
  }, []);

  const postToViewer = useCallback((payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ source: MSG, ...payload }, '*');
  }, []);

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
        title="Rich text viewer"
        src={iframeSrc}
        className={`h-full w-full min-h-0 border-0 bg-transparent ${ready ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => {
          postToViewer({ type: 'set', html: htmlRef.current });
        }}
      />
    </div>
  );
};
