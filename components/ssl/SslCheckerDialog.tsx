import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, X } from 'lucide-react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import SslUrlChecker from './SslUrlChecker';
import AppModal from './AppModal';
import { CertDecoderContent } from './CertDecoder';
import type { DecoderPopupRequest } from './sslTypes';

export interface SslCheckerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Full URL from the link editor (used to prefill host / port / path). */
  url: string;
}

function parseUrlParts(raw: string): { host: string; port: number; path: string } {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { host: '', port: 443, path: '/' };
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withScheme);
    const host = u.hostname || '';
    let port = 443;
    if (u.port) {
      port = parseInt(u.port, 10) || 443;
    } else if (u.protocol === 'http:') {
      port = 80;
    }
    const path = u.pathname && u.pathname !== '' ? u.pathname : '/';
    return { host, port, path };
  } catch {
    const cleaned = trimmed.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
    return { host: cleaned, port: 443, path: '/' };
  }
}

/**
 * On-demand SSL URL checker dialog (ported from SSL Forge).
 * Does not auto-run — user must click Run check inside the checker.
 */
export const SslCheckerDialog: React.FC<SslCheckerDialogProps> = ({ isOpen, onClose, url }) => {
  const parts = useMemo(() => parseUrlParts(url), [url]);
  const [decoderRequest, setDecoderRequest] = useState<DecoderPopupRequest | null>(null);

  useEscapeToClose(isOpen && !decoderRequest, onClose);

  if (!isOpen) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100075] flex items-center justify-center p-2 sm:p-4"
        role="presentation"
      >
        <button
          type="button"
          aria-label="Close SSL checker"
          className="absolute inset-0 bg-black/50 backdrop-blur-[1px] border-0 cursor-default"
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ssl-checker-dialog-title"
          className="relative z-10 w-full max-w-5xl max-h-[94vh] rounded-2xl border border-gray-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-950 shadow-2xl flex flex-col overflow-hidden"
        >
          <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
            <div className="min-w-0">
              <h2
                id="ssl-checker-dialog-title"
                className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100"
              >
                SSL URL checker
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                Probe an HTTPS endpoint by host and port, read TLS info, and rate common risks (on demand).
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setDecoderRequest({
                    host: parts.host || undefined,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
              >
                <Link2 className="w-3.5 h-3.5" />
                Open decoder popup
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-800"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
            <SslUrlChecker
              key={`${parts.host}:${parts.port}:${parts.path}`}
              initialHost={parts.host}
              initialPort={parts.port}
              initialPath={parts.path}
              autoRun={false}
              onOpenDecoderPopup={(request) => setDecoderRequest(request || {})}
            />
          </div>
        </div>
      </div>

      <AppModal
        open={!!decoderRequest}
        title="Cert Decoder"
        onClose={() => setDecoderRequest(null)}
        maxWidthClass="max-w-6xl"
      >
        <CertDecoderContent
          embedded
          initialPem={decoderRequest?.prefillPem || ''}
          initialHost={decoderRequest?.host || parts.host || ''}
          onRequestClose={() => setDecoderRequest(null)}
        />
      </AppModal>
    </>,
    document.body
  );
};

export default SslCheckerDialog;
