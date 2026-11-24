import React, { useEffect, useRef, useState } from 'react';

export interface RdpSessionPaneProps {
  /** Guacamole / web RDP gateway page (https:// or http://). */
  url: string;
  title?: string;
  active?: boolean;
  onStatus?: (status: 'connecting' | 'connected' | 'error', message?: string) => void;
}

/**
 * Embeds a browser-based RDP gateway (e.g. Apache Guacamole HTML UI) in a session tab.
 * Passwords stay in the gateway UI — the app never stores them.
 */
export const RdpSessionPane: React.FC<RdpSessionPaneProps> = ({
  url,
  title,
  active = true,
  onStatus,
}) => {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    const trimmed = String(url || '').trim();
    if (!trimmed) {
      setPhase('error');
      setError('RDP gateway URL is empty');
      onStatusRef.current?.('error', 'RDP gateway URL is empty');
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      setPhase('error');
      setError('RDP gateway must be an http:// or https:// page URL');
      onStatusRef.current?.(
        'error',
        'Use an https:// (or http://) Guacamole / web RDP URL'
      );
      return;
    }
    setPhase('loading');
    setError('');
    onStatusRef.current?.('connecting', 'Loading RDP gateway…');
  }, [url]);

  const handleLoad = () => {
    setPhase('ready');
    onStatusRef.current?.('connected', title ? `RDP · ${title}` : 'RDP connected');
  };

  const handleError = () => {
    setPhase('error');
    setError('Failed to load RDP gateway (blocked by X-Frame-Options or network)');
    onStatusRef.current?.(
      'error',
      'Gateway refused embed — open the URL in a new tab or allow framing'
    );
  };

  if (phase === 'error') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 bg-slate-950 text-center">
        <p className="text-xs text-rose-300 max-w-sm">{error}</p>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-sky-400 hover:underline"
          >
            Open gateway in new tab
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      className={`absolute inset-0 bg-slate-950 ${active ? 'z-10 visible' : 'z-0 invisible pointer-events-none'}`}
      aria-hidden={!active}
    >
      {phase === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-xs text-slate-400 pointer-events-none">
          Loading RDP gateway…
        </div>
      )}
      <iframe
        title={title || 'RDP session'}
        src={url}
        className="w-full h-full border-0 bg-black"
        allow="clipboard-read; clipboard-write; fullscreen"
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
};
