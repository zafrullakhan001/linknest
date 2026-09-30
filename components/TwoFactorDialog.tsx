import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  authService,
  type TwoFactorApiError,
  type TwoFactorSetupPayload,
  type TwoFactorStatus,
} from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import { SecurePasswordInput } from './SecurePasswordInput';

interface TwoFactorDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type TwoFactorStep = 'status' | 'setup' | 'codes' | 'regenerate' | 'disable';

function formatWhen(ts: number | null | undefined): string {
  if (!ts) return 'Never';
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return '—';
  }
}

/** Trim a user-agent string down to something readable in a list. */
function formatDevice(ua: string | null): string {
  if (!ua) return 'Unknown browser';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
      : /OPR\//.test(ua) ? 'Opera'
        : /Chrome\//.test(ua) ? 'Chrome'
          : /Firefox\//.test(ua) ? 'Firefox'
            : /Safari\//.test(ua) ? 'Safari'
              : 'Browser';
  const os =
    /Windows/.test(ua) ? 'Windows'
      : /Android/.test(ua) ? 'Android'
        : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
          : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
            : /Linux/.test(ua) ? 'Linux'
              : '';
  return os ? `${browser} on ${os}` : browser;
}

function splitCodes(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export const TwoFactorDialog: React.FC<TwoFactorDialogProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [step, setStep] = useState<TwoFactorStep>('status');
  const [setupPayload, setSetupPayload] = useState<TwoFactorSetupPayload | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [codesCopied, setCodesCopied] = useState(false);

  const authSource = user?.auth_source ?? 'local';
  const confirmsWithPassword = authSource === 'local';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await authService.getTwoFactorStatus();
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load two-factor status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setStep('status');
      setSetupPayload(null);
      setRecoveryCodes([]);
      setCode('');
      setPassword('');
      setError('');
      setSuccess('');
      setLinkCopied(false);
      setCodesCopied(false);
      void load();
    }
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const describeError = (err: unknown, fallback: string): string => {
    const apiError = err as TwoFactorApiError;
    if (apiError && typeof apiError.message === 'string' && apiError.message) {
      return apiError.message;
    }
    return fallback;
  };

  const handleStartSetup = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const payload = await authService.startTwoFactorSetup();
      setSetupPayload(payload);
      setCode('');
      setLinkCopied(false);
      setStep('setup');
    } catch (err) {
      setError(describeError(err, 'Failed to start setup'));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmEnable = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter the 6-digit code from your authenticator app');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await authService.enableTwoFactor(trimmed);
      setRecoveryCodes(result.recoveryCodes);
      setStatus(result.status);
      setCode('');
      setStep('codes');
      setSuccess('Two-factor authentication is on');
    } catch (err) {
      setError(describeError(err, 'Failed to enable two-factor authentication'));
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerate = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter the current 6-digit code from your authenticator app');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await authService.regenerateRecoveryCodes(trimmed);
      setRecoveryCodes(result.recoveryCodes);
      setStatus(result.status);
      setCode('');
      setStep('codes');
      setCodesCopied(false);
      setSuccess('New recovery codes generated — save them now');
    } catch (err) {
      setError(describeError(err, 'Failed to generate recovery codes'));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    if (confirmsWithPassword && !password) {
      setError('Enter your password to turn off two-factor authentication');
      return;
    }
    if (!confirmsWithPassword && !code.trim()) {
      setError('Enter the current code from your authenticator app');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await authService.disableTwoFactor(
        confirmsWithPassword ? { password } : { code: code.trim() }
      );
      setStatus(result.status);
      setPassword('');
      setCode('');
      setRecoveryCodes([]);
      setStep('status');
      setSuccess(result.message || 'Two-factor authentication turned off');
    } catch (err) {
      setError(describeError(err, 'Failed to disable two-factor authentication'));
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeDevice = async (id: number) => {
    if (!window.confirm('Stop trusting this browser? The next sign-in there will ask for a code.')) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await authService.revokeTwoFactorDevice(id);
      setStatus(next);
      setSuccess('Trusted browser removed');
    } catch (err) {
      setError(describeError(err, 'Failed to revoke trusted browser'));
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeAllDevices = async () => {
    if (!window.confirm('Stop trusting every remembered browser? Each one will ask for a code next time.')) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await authService.revokeTwoFactorDevice(null);
      setStatus(next);
      setSuccess('All trusted browsers removed');
    } catch (err) {
      setError(describeError(err, 'Failed to revoke trusted browsers'));
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (value: string, mark: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(value);
      mark(true);
      setTimeout(() => mark(false), 2000);
    } catch {
      setError('Could not copy to the clipboard — copy it manually.');
    }
  };

  const downloadCodes = () => {
    const body = [
      'LinkNest two-factor recovery codes',
      `Account: ${user?.username ?? ''}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      ...recoveryCodes,
      '',
      'Each code can be used once instead of an authenticator code.',
    ].join('\n');
    try {
      const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'linknest-recovery-codes.txt';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch {
      setError('Download failed — copy the codes manually.');
    }
  };

  const enabled = !!status?.enabled;

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="two-factor-dialog-title"
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-sky-50 to-indigo-50/80 dark:from-sky-950/40 dark:to-indigo-950/30">
          <div>
            <h2 id="two-factor-dialog-title" className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span aria-hidden>🛡️</span> Two-factor authentication
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              {authSource === 'local'
                ? 'Protect your local account with a code from an authenticator app.'
                : `Protect your ${authSource.toUpperCase()} sign-in with a code from an authenticator app.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2.5 text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2.5 text-sm text-emerald-800 dark:text-emerald-200">
              {success}
            </div>
          )}

          {loading && !status && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
          )}

          {step === 'status' && status && (
            <>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    Authenticator app (TOTP)
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      enabled
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {enabled ? 'On' : 'Off'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {enabled
                    ? 'You enter a 6-digit code from your authenticator app each time you sign in with your username and password.'
                    : 'Turn this on to require a 6-digit code after your username and password.'}
                </p>
                {enabled && (
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                    <dt className="font-medium">Enabled</dt>
                    <dd>{formatWhen(status.confirmed_at)}</dd>
                    <dt className="font-medium">Last used</dt>
                    <dd>{formatWhen(status.last_used_at)}</dd>
                    <dt className="font-medium">Recovery codes left</dt>
                    <dd>{status.recovery_codes_remaining}</dd>
                    <dt className="font-medium">Device clock</dt>
                    <dd>
                      {status.clock_offset_seconds === 0
                        ? 'In sync'
                        : `${status.clock_offset_seconds > 0 ? '+' : ''}${status.clock_offset_seconds}s`}
                    </dd>
                  </dl>
                )}
                {enabled && status.clock_offset_seconds !== 0 && (
                  <p className="text-[11px] text-orange-700 dark:text-orange-300 mt-1.5 leading-relaxed">
                    Your authenticator device&apos;s clock is {Math.abs(status.clock_offset_seconds)} seconds
                    {' '}{status.clock_offset_seconds > 0 ? 'ahead of' : 'behind'} the server. Codes still work
                    (the server tracks the offset), but turning on automatic time sync on that device is recommended.
                  </p>
                )}
              </div>

              {status.required && !enabled && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-100">
                  Your administrator requires two-factor authentication for this account.
                </div>
              )}

              {enabled && status.trusted_devices.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Trusted browsers
                    </h3>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRevokeAllDevices()}
                      className="text-xs font-medium text-red-600 dark:text-red-400 disabled:opacity-50"
                    >
                      Revoke all
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 mb-2">
                    These browsers skip the code for 30 days after a verified sign-in.
                  </p>
                  <ul className="space-y-2">
                    {status.trusted_devices.map((device) => (
                      <li
                        key={device.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-3 py-2.5 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {formatDevice(device.user_agent)}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Added {formatWhen(device.created_at)} · Last used {formatWhen(device.last_used_at)} · Expires {formatWhen(device.expires_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleRevokeDevice(device.id)}
                          className="text-xs font-medium text-red-600 dark:text-red-400 shrink-0 disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {!enabled ? (
                  <button
                    type="button"
                    disabled={busy || !status.available}
                    onClick={() => void handleStartSetup()}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
                  >
                    {busy ? 'Starting…' : 'Enable two-factor authentication'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setStep('regenerate');
                        setCode('');
                        setError('');
                        setSuccess('');
                      }}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50"
                    >
                      New recovery codes
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setStep('disable');
                        setPassword('');
                        setCode('');
                        setError('');
                        setSuccess('');
                      }}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
                    >
                      Turn off
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {step === 'setup' && setupPayload && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                Scan this QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).
              </p>
              <div className="flex justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-4">
                <QRCodeSVG
                  value={setupPayload.otpauth_uri}
                  size={176}
                  level="M"
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                  marginSize={2}
                  title="Two-factor setup QR code"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Can&apos;t scan? Enter this setup key manually:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 text-xs font-mono tracking-wider rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 break-all">
                    {setupPayload.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyText(setupPayload.secret, setLinkCopied)}
                    className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 whitespace-nowrap"
                  >
                    {linkCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Enter the {setupPayload.digits}-digit code shown in the app
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, setupPayload.digits))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  className="w-full px-3 py-2.5 text-center text-lg font-mono tracking-[0.3em] rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder={'0'.repeat(setupPayload.digits)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleConfirmEnable()}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
                >
                  {busy ? 'Verifying…' : 'Verify and turn on'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStep('status');
                    setSetupPayload(null);
                    setCode('');
                    setError('');
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === 'codes' && recoveryCodes.length > 0 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
                Save these one-time recovery codes somewhere safe. Each code works once, in place of an
                authenticator code. They are shown only now.
              </div>
              <pre className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-3 text-sm font-mono text-slate-800 dark:text-slate-100 grid grid-cols-2 gap-x-4 gap-y-1 max-h-56 overflow-y-auto">
                {recoveryCodes.map((recoveryCode) => (
                  <span key={recoveryCode}>{recoveryCode}</span>
                ))}
              </pre>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyText(recoveryCodes.join('\n'), setCodesCopied)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  {codesCopied ? 'Copied' : 'Copy codes'}
                </button>
                <button
                  type="button"
                  onClick={downloadCodes}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  Download .txt
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep('status');
                    setRecoveryCodes([]);
                    setSuccess('');
                  }}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white"
                >
                  I&apos;ve saved them
                </button>
              </div>
            </div>
          )}

          {step === 'regenerate' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                Generating new recovery codes invalidates the old ones. Enter a current code from your
                authenticator app to continue.
              </p>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                className="w-full px-3 py-2.5 text-center text-lg font-mono tracking-[0.3em] rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="000000"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRegenerate()}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
                >
                  {busy ? 'Generating…' : 'Generate new codes'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStep('status');
                    setCode('');
                    setError('');
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === 'disable' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2.5 text-xs text-rose-900 dark:text-rose-100 leading-relaxed">
                Turning this off removes your authenticator secret, recovery codes and trusted browsers.
                Your account will then only require your username and password.
              </div>
              {confirmsWithPassword ? (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Confirm with your password
                  </label>
                  <SecurePasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    showToggle
                    autoFocus
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                    placeholder="Your current password"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Confirm with a current code from your authenticator app
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    className="w-full px-3 py-2.5 text-center text-lg font-mono tracking-[0.3em] rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                    placeholder="000000"
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDisable()}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
                >
                  {busy ? 'Turning off…' : 'Turn off two-factor authentication'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStep('status');
                    setPassword('');
                    setCode('');
                    setError('');
                  }}
                  className="px-4 py-2 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
