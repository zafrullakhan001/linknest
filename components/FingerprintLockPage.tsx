import React from 'react';

interface FingerprintLockPageProps {
  message?: string;
  appName?: string;
  showAdminLogin?: boolean;
  onAdminLogin?: () => void;
  onRetry?: () => void;
  onOpenFingerprintHelp?: () => void;
}

export const FingerprintLockPage: React.FC<FingerprintLockPageProps> = ({
  message = 'This site only allows registered browser fingerprints. Guests and signed-in users without an allowed hash cannot access spaces.',
  appName = 'Application',
  showAdminLogin = true,
  onAdminLogin,
  onRetry,
  onOpenFingerprintHelp,
}) => {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center overflow-y-auto overflow-x-hidden"
      style={{
        minHeight: '100dvh',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-800 via-indigo-900 to-slate-950" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-20 -left-12 h-64 w-64 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
      </div>

      <div
        role="dialog"
        aria-labelledby="fingerprint-lock-title"
        aria-modal="true"
        className="relative z-10 w-full max-w-md mx-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-indigo-100 dark:border-indigo-900/50 overflow-hidden max-h-[min(92dvh,40rem)] flex flex-col"
      >
        <div className="shrink-0 bg-indigo-600 px-4 pt-5 pb-5 sm:px-6 sm:pt-6 sm:pb-6 text-center text-white">
          <div
            className="mx-auto mb-3 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-white/15 border border-white/25 text-3xl sm:text-4xl"
            aria-hidden
          >
            🪪
          </div>
          <h1 id="fingerprint-lock-title" className="text-xl sm:text-2xl font-bold tracking-tight">
            Fingerprint lock
          </h1>
          <p className="mt-1 text-sm text-indigo-100 px-2">
            {appName} is restricted to allowed devices
          </p>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 space-y-3">
          <div className="rounded-xl border border-indigo-100 dark:border-indigo-800/60 bg-indigo-50/80 dark:bg-indigo-950/40 p-3.5 sm:p-4 text-left">
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
              {message}
            </p>
          </div>

          <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/70 bg-white dark:bg-slate-900/60 p-3.5 sm:p-4 text-left">
            <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200 mb-1 flex items-center gap-1.5">
              <span aria-hidden>🔑</span> Administrators can always sign in
            </p>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Use your admin username and password even if this browser’s fingerprint hash is wrong or changed. After sign-in you can update allowed hashes or turn Fingerprint-only access off.
            </p>
          </div>
        </div>

        <div className="shrink-0 border-t border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-slate-950/60 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-col gap-2.5">
            {showAdminLogin && onAdminLogin ? (
              <button
                type="button"
                onClick={onAdminLogin}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-sm font-semibold shadow-sm transition flex items-center justify-center gap-2"
              >
                <span aria-hidden>🔑</span> Administrator sign in
              </button>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-indigo-800 dark:text-indigo-100 text-sm font-semibold border border-indigo-200 dark:border-indigo-700 active:scale-[0.98] transition flex items-center justify-center gap-2"
                >
                  <span aria-hidden>🔄</span> Try again
                </button>
              ) : null}
              {onOpenFingerprintHelp ? (
                <button
                  type="button"
                  onClick={onOpenFingerprintHelp}
                  className={`w-full min-h-[48px] px-4 py-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-indigo-800 dark:text-indigo-100 text-sm font-semibold border border-indigo-200 dark:border-indigo-700 active:scale-[0.98] transition flex items-center justify-center gap-2 ${!onRetry ? 'sm:col-span-2' : ''}`}
                >
                  <span aria-hidden>🪪</span> View my fingerprint
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
