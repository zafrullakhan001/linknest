import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getPasskeySupportStatus,
  webauthnService,
  type PasskeyCredential,
} from '../services/webauthnService';

interface PasskeyManagerDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatWhen(ts: number | null | undefined): string {
  if (!ts) return 'Never';
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return '—';
  }
}

export const PasskeyManagerDialog: React.FC<PasskeyManagerDialogProps> = ({ isOpen, onClose }) => {
  const [credentials, setCredentials] = useState<PasskeyCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [nickname, setNickname] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await webauthnService.listCredentials();
      setCredentials(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load passkeys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void load();
      setNickname('');
      setSuccess('');
      setError('');
      setRenamingId(null);
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

  const passkeySupport = getPasskeySupportStatus();
  const supportOk = passkeySupport.supported;

  const handleAdd = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await webauthnService.registerPasskey(nickname.trim() || undefined);
      setNickname('');
      setSuccess('Passkey added successfully');
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add passkey';
      if (/cancel|abort|not allowed/i.test(msg)) {
        setError('Passkey registration was cancelled.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (id: number) => {
    const value = renameValue.trim();
    if (!value) {
      setError('Nickname cannot be empty');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await webauthnService.renameCredential(id, value);
      setRenamingId(null);
      setSuccess('Passkey renamed');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename passkey');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number, label: string) => {
    if (!window.confirm(`Remove passkey “${label}”? You will no longer be able to sign in with it.`)) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await webauthnService.deleteCredential(id);
      setSuccess('Passkey removed');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove passkey');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/75 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="passkey-manager-title"
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-violet-50 to-fuchsia-50/80 dark:from-violet-950/40 dark:to-fuchsia-950/30">
          <div>
            <h2 id="passkey-manager-title" className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span aria-hidden>🔑</span> Passkeys
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              Sign in with Windows Hello, Face ID, Touch ID, or a security key.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-white/80 dark:hover:bg-slate-700"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!supportOk && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-100">
              <p className="font-semibold">Passkeys are unavailable</p>
              <p className="mt-1 text-xs leading-relaxed">{passkeySupport.message}</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {success}
            </div>
          )}

          <div className="rounded-xl border border-violet-200/80 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-950/20 p-3 space-y-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              Nickname (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={64}
                placeholder="e.g. Work laptop"
                disabled={busy || !supportOk}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={busy || !supportOk}
                className="px-3 py-2 text-sm font-semibold rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 whitespace-nowrap"
              >
                {busy ? 'Wait…' : 'Add passkey'}
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Your passkeys</h3>
            {loading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
            ) : credentials.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No passkeys yet. Add one after signing in with Local, LDAP, or SAML.
              </p>
            ) : (
              <ul className="space-y-2">
                {credentials.map((cred) => (
                  <li
                    key={cred.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-3 py-2.5"
                  >
                    {renamingId === cred.id ? (
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          maxLength={64}
                          className="flex-1 px-2 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                          autoFocus
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleRename(cred.id)}
                          className="text-xs font-medium text-violet-700 dark:text-violet-300"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          className="text-xs text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{cred.nickname}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              Added {formatWhen(cred.created_at)} · Last used {formatWhen(cred.last_used_at)}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setRenamingId(cred.id);
                                setRenameValue(cred.nickname);
                              }}
                              className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-violet-600"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleDelete(cred.id, cred.nickname)}
                              className="text-xs font-medium text-red-600 dark:text-red-400"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
