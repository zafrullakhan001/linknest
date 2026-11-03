import React, { useEffect, useRef, useState } from 'react';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import {
  userTransferService,
  UserTransferFormat,
  UserTransferImportResponse,
} from '../services/userTransferService';

export type UserTransferMode = 'export' | 'import';

interface UserTransferDialogProps {
  isOpen: boolean;
  mode: UserTransferMode;
  selectedUserIds: number[];
  onClose: () => void;
  onImported: () => void | Promise<void>;
}

export const UserTransferDialog: React.FC<UserTransferDialogProps> = ({
  isOpen,
  mode,
  selectedUserIds,
  onClose,
  onImported,
}) => {
  const [format, setFormat] = useState<UserTransferFormat>('json');
  const [includePasswordHashes, setIncludePasswordHashes] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState<UserTransferImportResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEscapeToClose(isOpen && !busy, onClose);

  useEffect(() => {
    if (!isOpen) return;
    setFormat('json');
    setIncludePasswordHashes(false);
    setFile(null);
    setBusy(false);
    setError('');
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const selectedCount = selectedUserIds.length;
  const title = mode === 'export' ? 'Export users' : 'Import users';

  const handleExport = async () => {
    setError('');
    if (selectedCount === 0) {
      setError('Select at least one user in the table first.');
      return;
    }
    if (includePasswordHashes) {
      const ok = window.confirm(
        'Include password hashes for local users?\n\n' +
          'The download will contain sensitive password hashes. Keep the file private and do not paste it into chat.'
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await userTransferService.exportUsers(selectedUserIds, format, includePasswordHashes);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export users');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setError('');
    setImportResult(null);
    if (!file) {
      setError('Choose a JSON or CSV file to import.');
      return;
    }
    setBusy(true);
    try {
      const result = await userTransferService.importUsers(file);
      setImportResult(result);
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import users');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-transfer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 id="user-transfer-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              {title}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              {mode === 'export'
                ? `Download ${selectedCount} selected user${selectedCount === 1 ? '' : 's'} as JSON or CSV (local and LDAP).`
                : 'Create new local and LDAP users from a JSON or CSV file. Existing usernames and emails are skipped.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {mode === 'export' && (
            <>
              <fieldset>
                <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Format</legend>
                <div className="flex gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="user-transfer-format"
                      checked={format === 'json'}
                      onChange={() => setFormat('json')}
                      disabled={busy}
                      className="text-sky-600 focus:ring-sky-500"
                    />
                    JSON
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="user-transfer-format"
                      checked={format === 'csv'}
                      onChange={() => setFormat('csv')}
                      disabled={busy}
                      className="text-sky-600 focus:ring-sky-500"
                    />
                    CSV
                  </label>
                </div>
              </fieldset>

              <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePasswordHashes}
                  onChange={(e) => setIncludePasswordHashes(e.target.checked)}
                  disabled={busy}
                  className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <span>
                  <span className="font-medium">Include password hashes</span>
                  <span className="block text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                    Only for local users, so passwords can move to another LinkNest. The file becomes sensitive.
                  </span>
                </span>
              </label>
            </>
          )}

          {mode === 'import' && (
            <>
              <div>
                <label htmlFor="user-transfer-file" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  File (.json or .csv)
                </label>
                <input
                  id="user-transfer-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv,text/csv,application/json"
                  disabled={busy}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setImportResult(null);
                    setError('');
                  }}
                  className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-sky-600 file:text-white hover:file:bg-sky-500"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => userTransferService.downloadTemplate('json')}
                  disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Download JSON template
                </button>
                <button
                  type="button"
                  onClick={() => userTransferService.downloadTemplate('csv')}
                  disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Download CSV template
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Local rows need a <code className="px-1 rounded bg-slate-100 dark:bg-slate-800">password</code> or{' '}
                <code className="px-1 rounded bg-slate-100 dark:bg-slate-800">password_hash</code>. LDAP rows do not need a DN.
                Existing users are left unchanged.
              </p>
            </>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2">
              {error}
            </div>
          )}

          {importResult && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-900 dark:text-emerald-100 px-3 py-2 space-y-2">
              <p className="font-medium">{importResult.message}</p>
              <ul className="text-xs space-y-0.5 text-emerald-800 dark:text-emerald-200">
                <li>Created: {importResult.summary.created}</li>
                <li>Skipped (already exist): {importResult.summary.skipped}</li>
                <li>Errors: {importResult.summary.errors}</li>
              </ul>
              {importResult.results.errors.length > 0 && (
                <div className="max-h-28 overflow-y-auto text-xs text-red-700 dark:text-red-300 border-t border-emerald-200/60 dark:border-emerald-800 pt-2">
                  {importResult.results.errors.slice(0, 20).map((row, i) => (
                    <div key={`err-${i}`}>
                      {row.username}: {row.reason || 'Error'}
                    </div>
                  ))}
                </div>
              )}
              {importResult.results.skipped.length > 0 && (
                <div className="max-h-28 overflow-y-auto text-xs text-amber-800 dark:text-amber-200 border-t border-emerald-200/60 dark:border-emerald-800 pt-2">
                  {importResult.results.skipped.slice(0, 20).map((row, i) => (
                    <div key={`skip-${i}`}>
                      {row.username}: {row.reason || 'Skipped'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {importResult ? 'Close' : 'Cancel'}
          </button>
          {mode === 'export' && (
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={busy || selectedCount === 0}
              className="px-4 py-2 text-sm rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {busy ? 'Exporting…' : `Export ${selectedCount || ''}`}
            </button>
          )}
          {mode === 'import' && !importResult && (
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={busy || !file}
              className="px-4 py-2 text-sm rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? 'Importing…' : 'Import'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
