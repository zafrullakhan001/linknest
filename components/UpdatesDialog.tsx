import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  applyUpdaterRelease,
  checkUpdaterReleases,
  getUpdaterJob,
  getUpdaterStatus,
  rollbackUpdater,
  UpdaterCommit,
  UpdaterJob,
  UpdaterRelease,
  UpdaterStatus,
} from '../services/updaterService';
import { settingsService } from '../services/settingsService';
import { useSettings } from '../contexts/SettingsContext';
import { renderReleaseNotesHtml } from '../utils/releaseNotesMarkdown';

interface UpdatesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
  onUpdateAvailabilityChange?: (available: boolean, count: number) => void;
}

type Selection =
  | { kind: 'commit'; sha: string }
  | { kind: 'release'; tag: string }
  | null;

export const UpdatesPanel: React.FC<{
  onUpdateAvailabilityChange?: (available: boolean, count: number) => void;
}> = ({ onUpdateAvailabilityChange }) => {
  const { settings, refreshSettings } = useSettings();
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<UpdaterJob | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [repoInput, setRepoInput] = useState('');
  const [branchInput, setBranchInput] = useState('main');
  const [tokenInput, setTokenInput] = useState('');
  const [intervalInput, setIntervalInput] = useState('30');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  const commits: UpdaterCommit[] = status?.commitUpdates || [];
  const releases: UpdaterRelease[] = status?.releases || [];

  const notifyAvailability = useCallback(
    (s: UpdaterStatus | null) => {
      if (!onUpdateAvailabilityChange) return;
      onUpdateAvailabilityChange(Boolean(s?.updateAvailable), s?.updateCount ?? 0);
    },
    [onUpdateAvailabilityChange]
  );

  const applyStatus = useCallback(
    (s: UpdaterStatus) => {
      setStatus(s);
      setJob(s.job);
      if (s.error) setError(s.error);
      else setError(null);
      notifyAvailability(s);
      setSelection((prev) => {
        if (prev) return prev;
        if (s.commitUpdates?.[0]?.sha) return { kind: 'commit', sha: s.commitUpdates[0].sha };
        if (s.releases?.[0]?.tag) return { kind: 'release', tag: s.releases[0].tag };
        return null;
      });
    },
    [notifyAvailability]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getUpdaterStatus();
      applyStatus(s);
    } catch (e: any) {
      setError(e?.message || 'Failed to load updater status');
    } finally {
      setLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setRepoInput((settings as any)?.updater_repo || status?.repo || 'zafrullakhan001/linknest');
    setBranchInput((settings as any)?.updater_track_branch || status?.trackBranch || 'main');
    setIntervalInput(
      String((settings as any)?.updater_check_interval_minutes || status?.checkIntervalMinutes || 30)
    );
    setTokenInput('');
  }, [settings, status?.repo, status?.trackBranch, status?.checkIntervalMinutes]);

  useEffect(() => {
    if (!applying && job?.status !== 'running') return;
    const id = window.setInterval(async () => {
      try {
        const j = await getUpdaterJob();
        setJob(j);
        if (j?.status === 'success') {
          setApplying(false);
          const s = await getUpdaterStatus();
          applyStatus(s);
        } else if (j?.status === 'error') {
          setApplying(false);
          setError(j.error || j.message || 'Update failed');
        }
      } catch {
        /* ignore */
      }
    }, 1500);
    return () => window.clearInterval(id);
  }, [applying, job?.status, applyStatus]);

  const handleCheck = async () => {
    setChecking(true);
    setError(null);
    try {
      const s = await checkUpdaterReleases();
      applyStatus(s);
      setSelection(null);
      if (s.commitUpdates?.[0]?.sha) setSelection({ kind: 'commit', sha: s.commitUpdates[0].sha });
      else if (s.releases?.[0]?.tag) setSelection({ kind: 'release', tag: s.releases[0].tag });
    } catch (e: any) {
      setError(e?.message || 'Check failed');
    } finally {
      setChecking(false);
    }
  };

  const handleApply = async () => {
    if (!selection) return;
    const label =
      selection.kind === 'commit'
        ? `commit ${selection.sha.slice(0, 7)}`
        : selection.tag;
    if (!window.confirm(`Apply update (${label})? Current install will be saved for rollback.`)) {
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const result =
        selection.kind === 'commit'
          ? await applyUpdaterRelease({ sha: selection.sha })
          : await applyUpdaterRelease({ tag: selection.tag });
      setJob(result.job);
      if (!result.async && result.job?.status === 'success') {
        setApplying(false);
        window.setTimeout(() => window.location.reload(), 800);
      }
    } catch (e: any) {
      setApplying(false);
      setError(e?.message || 'Failed to start update');
    }
  };

  const handleRollback = async () => {
    const target = status?.rollbackTarget;
    if (!target?.gitCommit) return;
    const short = target.gitCommit.slice(0, 7);
    if (
      !window.confirm(
        `Rollback to ${short} (v${target.appVersion})?\n${target.label || ''}`
      )
    ) {
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const result = await rollbackUpdater();
      setJob(result.job);
      if (!result.async && result.job?.status === 'success') {
        setApplying(false);
        window.setTimeout(() => window.location.reload(), 800);
      }
    } catch (e: any) {
      setApplying(false);
      setError(e?.message || 'Rollback failed');
    }
  };

  const handleSaveUpdaterSettings = async () => {
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      const payload: Record<string, string> = {
        updater_repo: repoInput.trim(),
        updater_track_branch: branchInput.trim() || 'main',
        updater_check_interval_minutes: intervalInput.trim() || '30',
      };
      if (tokenInput.trim() !== '') {
        payload.updater_github_token = tokenInput.trim();
      }
      await settingsService.updateSettings(payload as any);
      await refreshSettings?.();
      setSettingsMsg('Updater settings saved');
      await handleCheck();
    } catch (e: any) {
      setSettingsMsg(e?.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const canApply = Boolean(status?.canApply && selection && !applying);
  const applyLabel =
    selection?.kind === 'commit'
      ? `Update to ${selection.sha.slice(0, 7)}`
      : selection?.kind === 'release'
        ? `Update to ${selection.tag}`
        : 'Update now';

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading updater status…</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/80 dark:bg-slate-900/40">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Installed</div>
              <div className="font-semibold text-slate-900 dark:text-white text-lg">
                v{status?.currentVersion || '—'}
              </div>
              {status?.gitCommit && (
                <div className="text-xs text-slate-500 mt-1 font-mono">
                  {status.gitCommit.slice(0, 7)}
                  {status.commitMessage ? ` · ${status.commitMessage}` : ''}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/80 dark:bg-slate-900/40">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Tracking</div>
              <div className="font-semibold text-slate-900 dark:text-white capitalize">
                {status?.mode || '—'} · {status?.trackBranch || 'main'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Repo {status?.repo}
                {status?.updateAvailable
                  ? ` · ${status.updateCount} update${status.updateCount === 1 ? '' : 's'} available`
                  : ' · up to date'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCheck}
              disabled={checking || applying}
              className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 disabled:opacity-50"
            >
              {checking ? 'Checking…' : 'Check for updates'}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!canApply}
              className="px-3 py-1.5 text-sm rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
            >
              {applying ? 'Updating…' : applyLabel}
            </button>
            <button
              type="button"
              onClick={handleRollback}
              disabled={!status?.canRollback || applying}
              className="px-3 py-1.5 text-sm rounded-lg border border-amber-500 text-amber-800 dark:text-amber-300 disabled:opacity-50"
              title={
                status?.rollbackTarget?.gitCommit
                  ? `Rollback to ${status.rollbackTarget.gitCommit.slice(0, 7)}`
                  : 'No rollback snapshot'
              }
            >
              Rollback
            </button>
            {job?.status === 'success' && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 text-sm rounded-lg border border-emerald-500 text-emerald-700 dark:text-emerald-300"
              >
                Reload app
              </button>
            )}
          </div>

          {status?.rollbackTarget?.gitCommit && (
            <p className="text-xs text-slate-500">
              Rollback target: <span className="font-mono">{status.rollbackTarget.gitCommit.slice(0, 7)}</span>
              {' '}(v{status.rollbackTarget.appVersion}) — {status.historyCount || 0} snapshot
              {(status.historyCount || 0) === 1 ? '' : 's'} saved
            </p>
          )}

          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
              New commits on {status?.trackBranch || 'main'}
            </h4>
            {commits.length === 0 ? (
              <p className="text-sm text-slate-500">No newer commits than the installed SHA.</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {commits.map((c) => (
                  <li key={c.sha}>
                    <label
                      className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        selection?.kind === 'commit' && selection.sha === c.sha
                          ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="update-sel"
                        className="mt-1"
                        checked={selection?.kind === 'commit' && selection.sha === c.sha}
                        onChange={() => setSelection({ kind: 'commit', sha: c.sha })}
                        disabled={applying}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                            {c.shortSha || c.sha.slice(0, 7)}
                          </span>
                          <span className="text-sm text-slate-800 dark:text-slate-200">{c.message}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {c.author}
                          {c.date ? ` · ${new Date(c.date).toLocaleString()}` : ''}
                        </div>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
              Versioned releases
            </h4>
            {releases.length === 0 ? (
              <p className="text-sm text-slate-500">No newer semver releases than v{status?.currentVersion}.</p>
            ) : (
              <ul className="space-y-2 max-h-56 overflow-y-auto">
                {releases.map((rel) => (
                  <li key={rel.tag}>
                    <label
                      className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        selection?.kind === 'release' && selection.tag === rel.tag
                          ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="update-sel"
                        className="mt-1"
                        checked={selection?.kind === 'release' && selection.tag === rel.tag}
                        onChange={() => setSelection({ kind: 'release', tag: rel.tag })}
                        disabled={applying}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">{rel.tag}</span>
                          <span className="text-xs text-slate-500">{rel.name}</span>
                        </div>
                        {rel.assetName && (
                          <div className="text-xs text-slate-500 mt-0.5">Asset: {rel.assetName}</div>
                        )}
                        {rel.body && (
                          <div
                            className="mt-2 text-xs max-h-32 overflow-y-auto"
                            dangerouslySetInnerHTML={{ __html: renderReleaseNotesHtml(rel.body) }}
                          />
                        )}
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(applying || job?.status === 'running' || (job?.log && job.log.length > 0)) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {job?.rollback ? 'Rollback progress' : 'Progress'}
                </h4>
                <span className="text-xs text-slate-500">{job?.percent ?? 0}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-2">
                <div
                  className="h-full bg-brand-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, job?.percent ?? 0)}%` }}
                />
              </div>
              <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-3 max-h-40 overflow-y-auto font-mono">
                {(job?.log || []).join('\n') || job?.message || '…'}
              </pre>
            </div>
          )}

          <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Updater settings</h4>
            {!status?.tokenConfigured && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <p className="font-medium">Private GitHub repo / no token saved</p>
                <p>
                  Create a{' '}
                  <a
                    className="underline"
                    href="https://github.com/settings/tokens/new?scopes=repo&description=LinkNest%20Updater"
                    target="_blank"
                    rel="noreferrer"
                  >
                    classic Personal Access Token
                  </a>{' '}
                  with the <strong>repo</strong> scope, paste it below, save, then check again.
                </p>
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block text-xs text-slate-500">
                GitHub repo (owner/repo)
                <input
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </label>
              <label className="block text-xs text-slate-500">
                Track branch (mini updates)
                <input
                  value={branchInput}
                  onChange={(e) => setBranchInput(e.target.value)}
                  placeholder="main"
                  className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </label>
              <label className="block text-xs text-slate-500">
                Check interval (minutes)
                <input
                  type="number"
                  min={5}
                  value={intervalInput}
                  onChange={(e) => setIntervalInput(e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </label>
            </div>
            <label className="block text-xs text-slate-500">
              GitHub token {status?.tokenConfigured ? '(leave blank to keep existing)' : '(required for private repos)'}
              <input
                type="password"
                autoComplete="off"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={status?.tokenConfigured ? '•••••••• (saved)' : 'ghp_…'}
                className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveUpdaterSettings}
                disabled={savingSettings}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {savingSettings ? 'Saving…' : 'Save settings'}
              </button>
              {settingsMsg && <span className="text-xs text-slate-500">{settingsMsg}</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const UpdatesDialog: React.FC<UpdatesDialogProps> = ({
  isOpen,
  onClose,
  embedded = false,
  onUpdateAvailabilityChange,
}) => {
  useEffect(() => {
    if (!isOpen || embedded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose, embedded]);

  if (embedded) {
    return <UpdatesPanel onUpdateAvailabilityChange={onUpdateAvailabilityChange} />;
  }

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">App updates</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              New git commits + GitHub Releases — update or rollback in place
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          <UpdatesPanel onUpdateAvailabilityChange={onUpdateAvailabilityChange} />
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UpdatesDialog;
