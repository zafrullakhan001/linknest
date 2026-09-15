import React, { useEffect, useState } from 'react';
import { collectFingerprint } from '../services/fingerprintService';

function parseFpUnlockReturn(hash: string): string | null {
  const qIndex = hash.indexOf('?');
  if (qIndex < 0) return null;
  const params = new URLSearchParams(hash.slice(qIndex + 1));
  const ret = params.get('return');
  if (!ret) return null;
  try {
    const url = new URL(ret, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return url.href;
  } catch {
    return null;
  }
}

export const FingerprintUnlockPage: React.FC = () => {
  const [status, setStatus] = useState('Preparing this browser…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await collectFingerprint({ skipCache: true });
        if (cancelled) return;
        const dest = parseFpUnlockReturn(window.location.hash);
        if (dest) {
          window.location.replace(dest);
          return;
        }
        window.location.hash = '#/';
      } catch {
        if (!cancelled) {
          setError('Could not capture this browser fingerprint.');
          setStatus('');
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl p-6 text-center">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Device check</h1>
        {status ? <p className="text-sm text-slate-600 dark:text-slate-400">{status}</p> : null}
        {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
        {!error ? (
          <div className="mt-4 mx-auto h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        ) : (
          <button
            type="button"
            className="mt-4 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium"
            onClick={() => {
              window.location.hash = '#/';
            }}
          >
            Go home
          </button>
        )}
      </div>
    </div>
  );
};
