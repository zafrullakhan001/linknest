import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { getDisplayUrl } from '../utils/urlDisplay';

interface QRCodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  label: string;
}

export const QRCodeDialog: React.FC<QRCodeDialogProps> = ({
  isOpen,
  onClose,
  url,
  label,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const displayUrl = getDisplayUrl(url);

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-code-dialog-title"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-sm w-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 id="qr-code-dialog-title" className="text-lg font-bold text-slate-900 dark:text-white">
              QR Code
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={label}>
              {label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0"
            title="Close"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-6 flex flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
            <QRCodeSVG
              value={url}
              size={256}
              level="M"
              bgColor="#FFFFFF"
              fgColor="#000000"
              marginSize={4}
              title={`QR code for ${label}`}
            />
          </div>
          <p
            className="text-xs text-slate-500 dark:text-slate-400 font-mono text-center break-all max-w-full"
            title={url}
          >
            {displayUrl}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
            Scan with your phone camera to open this link
          </p>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
