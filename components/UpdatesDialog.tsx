import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  applyUpdaterRelease,
  checkUpdaterReleases,
  getUpdaterJob,
  getUpdaterPreview,
  getUpdaterStatus,
  rollbackUpdater,
  UpdaterCommit,
  UpdaterHistoryEntry,
  UpdaterJob,
  UpdaterPreview,
  UpdaterRelease,
  UpdaterStatus,
} from '../services/updaterService';
import { settingsService } from '../services/settingsService';
import { useSettings } from '../contexts/SettingsContext';
import { renderReleaseNotesHtml } from '../utils/releaseNotesMarkdown';
import { useMobile } from '../hooks/useMobile';

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

type WindowGeom = { x: number; y: number; width: number; height: number };

const GEOM_STORAGE_KEY = 'linknest-updates-dialog-geom';
const MIN_WIDTH = 480;
const MIN_HEIGHT = 420;

function formatWhen(ts?: number | null, iso?: string | null): string {
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  if (ts && ts > 0) return new Date(ts * 1000).toLocaleString();
  return '—';
}

function statusBadge(status: string): string {
  const s = (status || 'M').toUpperCase();
  if (s === 'A') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  if (s === 'D') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
  if (s === 'R') return 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200';
}

function defaultGeom(): WindowGeom {
  const margin = 16;
  const width = Math.min(720, window.innerWidth - margin * 2);
  const height = Math.min(720, window.innerHeight - margin * 2);
  return {
    width: Math.max(MIN_WIDTH, width),
    height: Math.max(MIN_HEIGHT, height),
    x: Math.max(0, Math.round((window.innerWidth - width) / 2)),
    y: Math.max(0, Math.round((window.innerHeight - height) / 2)),
  };
}

function loadStoredGeom(): WindowGeom | null {
  try {
    const raw = localStorage.getItem(GEOM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WindowGeom;
    if (
      typeof parsed?.x !== 'number' ||
      typeof parsed?.y !== 'number' ||
      typeof parsed?.width !== 'number' ||
      typeof parsed?.height !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clampGeom(g: WindowGeom): WindowGeom {
  const maxW = Math.max(MIN_WIDTH, window.innerWidth - 8);
  const maxH = Math.max(MIN_HEIGHT, window.innerHeight - 8);
  const width = Math.min(Math.max(MIN_WIDTH, g.width), maxW);
  const height = Math.min(Math.max(MIN_HEIGHT, g.height), maxH);
  return {
    width,
    height,
    x: Math.min(Math.max(0, g.x), Math.max(0, window.innerWidth - 80)),
    y: Math.min(Math.max(0, g.y), Math.max(0, window.innerHeight - 48)),
  };
}

const CollapsibleSection: React.FC<{
  id: string;
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  accent?: 'brand' | 'amber' | 'sky' | 'slate';
  children: React.ReactNode;
}> = ({
  id,
  title,
  badge,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  accent = 'brand',
  children,
}) => {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const isOpen = controlledOpen ?? uncontrolled;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setUncontrolled(next);
  };
  const accentBorder =
    accent === 'amber'
      ? 'border-l-amber-500'
      : accent === 'sky'
        ? 'border-l-sky-500'
        : accent === 'slate'
          ? 'border-l-slate-400'
          : 'border-l-brand-500';
  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 ${accentBorder} overflow-hidden bg-white/60 dark:bg-slate-900/30`}
    >
      <button
        type="button"
        id={`upd-sec-${id}`}
        aria-expanded={isOpen}
        aria-controls={`upd-panel-${id}`}
        onClick={() => setOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
      >
        <svg
          className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm font-semibold text-slate-900 dark:text-white flex-1 min-w-0">
          {title}
        </span>
        {badge}
      </button>
      {isOpen && (
        <div
          id={`upd-panel-${id}`}
          className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800 space-y-3"
        >
          {children}
        </div>
      )}
    </div>
  );
};

const UpdateProgressBlock: React.FC<{ job: UpdaterJob | null }> = ({ job }) => {
  const status = job?.status || 'running';
  const isError = status === 'error';
  const isSuccess = status === 'success';
  const emoji = isError ? '❌' : isSuccess ? '✅' : '⏳';
  const title = job?.rollback
    ? `${emoji} Rollback progress`
    : `${emoji} Update progress`;
  const barClass = isError
    ? 'bg-red-500'
    : isSuccess
      ? 'bg-emerald-500'
      : 'bg-brand-500 animate-pulse';
  const ringClass = isError
    ? 'border-red-300 dark:border-red-700 bg-red-50/95 dark:bg-red-950/80'
    : isSuccess
      ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/95 dark:bg-emerald-950/80'
      : 'border-brand-300 dark:border-brand-600 bg-white/95 dark:bg-slate-900/95';

  return (
    <div
      className={`sticky top-0 z-10 -mx-1 px-1 py-1 rounded-xl backdrop-blur-sm ${ringClass} border shadow-sm`}
      role="status"
      aria-live="polite"
    >
      <div className="px-2.5 pt-2 pb-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h4>
          <span
            className={`text-xs font-mono tabular-nums font-semibold ${
              isError
                ? 'text-red-700 dark:text-red-300'
                : isSuccess
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-brand-700 dark:text-brand-300'
            }`}
          >
            {job?.percent ?? 0}%
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 truncate">{job?.message || '…'}</p>
        <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${barClass}`}
            style={{ width: `${Math.min(100, job?.percent ?? 0)}%` }}
          />
        </div>
        <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-lg p-2.5 max-h-28 overflow-y-auto font-mono leading-relaxed">
          {(job?.log || []).join('\n') || '…'}
        </pre>
      </div>
    </div>
  );
};

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
  const [preview, setPreview] = useState<UpdaterPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [backupDatabase, setBackupDatabase] = useState(true);
  const [historySelection, setHistorySelection] = useState<string | null>(null);
  const [restoreDatabase, setRestoreDatabase] = useState(true);
  const [repoInput, setRepoInput] = useState('');
  const [branchInput, setBranchInput] = useState('main');
  const [tokenInput, setTokenInput] = useState('');
  const [intervalInput, setIntervalInput] = useState('30');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [openUpdates, setOpenUpdates] = useState(true);
  const [openRollback, setOpenRollback] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const commits: UpdaterCommit[] = status?.commitUpdates || [];
  const releases: UpdaterRelease[] = status?.releases || [];
  const history: UpdaterHistoryEntry[] = status?.history || [];

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
      // Never sticky-show a finished success bar; only keep running/error jobs in the panel.
      const j = s.job;
      if (j && (j.status === 'running' || j.status === 'error')) {
        setJob(j);
      } else {
        setJob(null);
      }
      if (s.error) setError(s.error);
      else setError(null);
      notifyAvailability(s);
      if (s.updateAvailable) setOpenUpdates(true);
      if ((s.historyCount || 0) > 0) {
        /* keep rollback collapsed by default on mobile; expand only if user opened */
      }
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
    if (!applying) return;
    const id = window.setInterval(async () => {
      try {
        const j = await getUpdaterJob();
        if (j?.status === 'running') {
          setJob(j);
        } else if (j?.status === 'success') {
          setJob(j);
          setApplying(false);
          const s = await getUpdaterStatus();
          applyStatus(s);
          window.setTimeout(() => window.location.reload(), 800);
        } else if (j?.status === 'error') {
          setJob(j);
          setApplying(false);
          setError(j.error || j.message || 'Update failed');
        }
      } catch {
        /* ignore */
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [applying, applyStatus]);

  useEffect(() => {
    if (!selection) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const p =
          selection.kind === 'commit'
            ? await getUpdaterPreview({ sha: selection.sha })
            : await getUpdaterPreview({ tag: selection.tag });
        if (!cancelled) setPreview(p);
      } catch (e: any) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(e?.message || 'Failed to load change preview');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selection]);

  const selectedHistory = history.find((h) => h.id === historySelection) || null;

  useEffect(() => {
    if (selectedHistory) {
      setRestoreDatabase(Boolean(selectedHistory.hasDbBackup));
    }
  }, [selectedHistory?.id, selectedHistory?.hasDbBackup]);

  const showProgress =
    applying || job?.status === 'running' || job?.status === 'error' || job?.status === 'success';

  useEffect(() => {
    if (!showProgress || !progressRef.current) return;
    progressRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [showProgress, applying]);

  const handleCheck = async () => {
    setChecking(true);
    setError(null);
    setSelection(null);
    setPreview(null);
    try {
      const s = await checkUpdaterReleases();
      applyStatus(s);
      setOpenUpdates(true);
    } catch (e: any) {
      setError(e?.message || 'Check failed');
    } finally {
      setChecking(false);
    }
  };

  const handleApply = async () => {
    if (!selection) {
      setError('Select a commit or release first, then click Update.');
      return;
    }
    const label =
      selection.kind === 'commit' ? `commit ${selection.sha.slice(0, 7)}` : selection.tag;
    const dbNote = backupDatabase
      ? '\nA database snapshot will be saved for rollback.'
      : '\nDatabase will NOT be backed up.';
    if (
      !window.confirm(
        `Apply update (${label})?\nNothing runs until you confirm.${dbNote}`
      )
    ) {
      return;
    }
    setApplying(true);
    setError(null);
    setJob({
      status: 'running',
      percent: 0,
      message: 'Starting update...',
      log: [`[${new Date().toLocaleTimeString()}] Starting update...`],
    });
    try {
      const payload = {
        backupDatabase,
        previewFilesChanged: preview?.filesChanged,
        previewApproxBytes: preview?.approxBytes,
        ...(selection.kind === 'commit'
          ? { sha: selection.sha }
          : { tag: selection.tag }),
      };
      const result = await applyUpdaterRelease(payload);
      setJob(result.job);
      if (!result.async && result.job?.status === 'success') {
        setApplying(false);
        window.setTimeout(() => window.location.reload(), 800);
      } else if (!result.async && result.job?.status === 'error') {
        setApplying(false);
        setError(result.job.error || result.job.message || 'Update failed');
      }
    } catch (e: any) {
      setApplying(false);
      setError(e?.message || 'Failed to start update');
    }
  };

  const handleRollback = async () => {
    const target = selectedHistory;
    if (!target?.gitCommit || !target.id) {
      setError('Select a rollback snapshot first');
      setOpenRollback(true);
      return;
    }
    const short = target.gitCommit.slice(0, 7);
    const willRestoreDb = restoreDatabase && Boolean(target.hasDbBackup);
    if (
      !window.confirm(
        `Restore snapshot ${short} (v${target.appVersion})?\n` +
          `Created: ${formatWhen(target.capturedAt, target.capturedAtIso)}\n` +
          `${target.label || ''}\n` +
          (willRestoreDb
            ? 'Database will be restored from the snapshot.'
            : 'Code only — database will NOT be changed.')
      )
    ) {
      return;
    }
    setApplying(true);
    setError(null);
    setJob({
      status: 'running',
      percent: 0,
      rollback: true,
      message: 'Starting rollback...',
      log: [`[${new Date().toLocaleTimeString()}] Starting rollback...`],
    });
    try {
      const result = await rollbackUpdater({
        historyId: target.id,
        restoreDatabase: willRestoreDb,
      });
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
        : 'Select an update';

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {status?.hint && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          {status.hint}
        </div>
      )}

      {showProgress && (
        <div ref={progressRef}>
          <UpdateProgressBlock job={job} />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading updater status…</p>
      ) : (
        <>
          <CollapsibleSection
            id="status"
            title="📦 Installed status"
            defaultOpen
            accent="brand"
            badge={
              <span className="text-[11px] text-slate-500 font-mono">
                v{status?.currentVersion}
                {status?.gitCommit ? ` · ${status.gitCommit.slice(0, 7)}` : ''}
              </span>
            }
          >
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/80 dark:bg-emerald-950/30 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-0.5">
                  ✅ Installed
                </div>
                <div className="font-semibold text-slate-900 dark:text-white">
                  v{status?.currentVersion || '—'}
                </div>
                {status?.gitCommit && (
                  <div className="text-[11px] text-slate-500 mt-0.5 font-mono break-all">
                    {status.gitCommit.slice(0, 7)}
                    {status.commitMessage ? ` · ${status.commitMessage}` : ''}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-sky-200/80 dark:border-sky-800/60 bg-sky-50/80 dark:bg-sky-950/30 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-sky-700 dark:text-sky-400 mb-0.5">
                  🛰️ Tracking
                </div>
                <div className="font-semibold text-slate-900 dark:text-white capitalize">
                  {status?.mode || '—'} · {status?.trackBranch || 'main'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 break-all">
                  {status?.repo}
                  {status?.updateAvailable
                    ? ` · ${status.updateCount} update${status.updateCount === 1 ? '' : 's'} available`
                    : ' · up to date on tracked remote'}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Updates never run automatically — choose a commit/release, then confirm Update.
            </p>
            {status?.mode === 'zip' && status?.capabilities && !status.capabilities.nodeAvailable && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-950 dark:text-amber-100 space-y-1">
                <p className="font-semibold">Widget / UI updates need a Release ZIP on this server</p>
                <p className="text-[12px] leading-relaxed text-amber-900/90 dark:text-amber-100/90">
                  This install uses <strong>zip</strong> mode without Node.js. Publish a portable Release from
                  your build PC (
                  <code className="text-[11px] px-1 rounded bg-white/70 dark:bg-slate-900/50">
                    publish-update-release.ps1
                  </code>
                  , default relative base) so the same ZIP works for <strong>ArchLinks</strong>,{' '}
                  <strong>ERP3</strong>, and any folder — then apply that <strong>Release</strong> here (not
                  only a commit). Hard-refresh after Update.
                </p>
              </div>
            )}
            {status?.mode === 'git' && status?.capabilities?.nodeAvailable && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                Git mode with Node.js — applying a commit rebuilds <code className="px-1">dist/</code> so
                SSH/VNC widget UI updates apply.
              </p>
            )}
          </CollapsibleSection>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCheck}
              disabled={checking || applying}
              className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 disabled:opacity-50"
            >
              {checking ? '🔎 Checking…' : '🔎 Check for updates'}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!canApply}
              className="px-3 py-1.5 text-sm rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
              title={!selection ? 'Select a commit or release first' : undefined}
            >
              {applying ? '🚀 Updating…' : `🚀 ${applyLabel}`}
            </button>
          </div>

          <CollapsibleSection
            id="updates"
            title="🔎 Available updates"
            open={openUpdates}
            onOpenChange={setOpenUpdates}
            accent="sky"
            badge={
              <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 font-medium">
                {commits.length + releases.length}
              </span>
            }
          >
            <div>
              <h5 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Commits on {status?.trackBranch || 'main'}
              </h5>
              {commits.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No newer commits than the applied Release on the tracked branch.
                </p>
              ) : (
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {commits.map((c) => (
                    <li key={c.sha}>
                      <label
                        className={`flex gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
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
                            {c.localOnly && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                local only
                              </span>
                            )}
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
              <h5 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Versioned releases
              </h5>
              {releases.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No newer semver releases than v{status?.currentVersion}.
                </p>
              ) : (
                <ul className="space-y-2 max-h-40 overflow-y-auto">
                  {releases.map((rel) => (
                    <li key={rel.tag}>
                      <label
                        className={`flex gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
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
                          {rel.body && (
                            <div
                              className="mt-1 text-xs max-h-24 overflow-y-auto"
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

            {selection && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h5 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    📋 Change preview
                  </h5>
                  {previewLoading && <span className="text-[11px] text-slate-500">Analyzing…</span>}
                </div>
                {previewError && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">{previewError}</p>
                )}
                {preview && !previewLoading && (
                  <>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                        {preview.filesChanged} files
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                        ~{preview.approxSizeLabel}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                        ETA {preview.estimateLabel}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800">
                        {preview.needsRebuild ? 'Rebuild' : 'No rebuild'}
                      </span>
                    </div>
                    <div className="max-h-36 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-50 dark:bg-slate-900/60 sticky top-0">
                          <tr className="text-left text-slate-500">
                            <th className="px-2 py-1 w-10">St</th>
                            <th className="px-2 py-1">Path</th>
                            <th className="px-2 py-1 w-16 text-right">+/−</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.files.slice(0, 200).map((f) => (
                            <tr
                              key={`${f.status}:${f.path}`}
                              className="border-t border-slate-100 dark:border-slate-800"
                            >
                              <td className="px-2 py-1">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded font-mono ${statusBadge(f.status)}`}
                                >
                                  {f.status}
                                </span>
                              </td>
                              <td className="px-2 py-1 font-mono break-all text-slate-800 dark:text-slate-200">
                                {f.path}
                              </td>
                              <td className="px-2 py-1 text-right text-slate-500 tabular-nums">
                                {f.binary ? 'bin' : `+${f.additions}/−${f.deletions}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={backupDatabase}
                    onChange={(e) => setBackupDatabase(e.target.checked)}
                    disabled={applying}
                  />
                  <span>
                    <span className="font-medium">Back up database before updating</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      Recommended. Snapshot stored under data/updater-snapshots (last 10).
                    </span>
                  </span>
                </label>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="rollback"
            title="⏪ Rollback snapshots"
            open={openRollback}
            onOpenChange={setOpenRollback}
            accent="amber"
            badge={
              <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-medium">
                {history.length}/10
              </span>
            }
          >
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">No snapshots yet.</p>
            ) : (
              <>
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {history.map((h) => {
                    const id = h.id || `legacy_${h.capturedAt}`;
                    return (
                      <li key={id}>
                        <label
                          className={`flex gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            historySelection === id
                              ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-900/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="rollback-sel"
                            className="mt-1"
                            checked={historySelection === id}
                            onChange={() => setHistorySelection(id)}
                            disabled={applying}
                          />
                          <div className="min-w-0 flex-1 text-sm">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="font-mono text-xs font-semibold">
                                {(h.gitCommit || '').slice(0, 7) || '—'}
                              </span>
                              <span className="font-medium text-slate-900 dark:text-white">
                                v{h.appVersion}
                              </span>
                              {h.hasDbBackup ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                                  DB backup
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  Code only
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {formatWhen(h.capturedAt, h.capturedAtIso)}
                              {h.label ? ` · ${h.label}` : ''}
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={restoreDatabase && Boolean(selectedHistory?.hasDbBackup)}
                    onChange={(e) => setRestoreDatabase(e.target.checked)}
                    disabled={applying || !selectedHistory?.hasDbBackup}
                  />
                  <span>
                    <span className="font-medium">Also restore database</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      {selectedHistory?.hasDbBackup
                        ? 'Restores the SQLite snapshot taken with this entry.'
                        : 'Select a snapshot that has a DB backup.'}
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  onClick={handleRollback}
                  disabled={!selectedHistory?.gitCommit || applying}
                  className="px-3 py-1.5 text-sm rounded-lg border border-amber-500 text-amber-800 dark:text-amber-300 disabled:opacity-50"
                >
                  ⏪ Restore this snapshot
                </button>
              </>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            id="settings"
            title="⚙️ Updater settings"
            open={openSettings}
            onOpenChange={setOpenSettings}
            accent="slate"
            badge={
              !status?.tokenConfigured ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  token needed
                </span>
              ) : null
            }
          >
            {!status?.tokenConfigured && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                Private repos need a classic PAT with the <strong>repo</strong> scope.
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-2">
              <label className="block text-xs text-slate-500">
                GitHub repo
                <input
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </label>
              <label className="block text-xs text-slate-500">
                Track branch
                <input
                  value={branchInput}
                  onChange={(e) => setBranchInput(e.target.value)}
                  placeholder="main"
                  className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </label>
              <label className="block text-xs text-slate-500">
                Check interval (min)
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
              GitHub token {status?.tokenConfigured ? '(leave blank to keep)' : ''}
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
          </CollapsibleSection>
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
  const isMobile = useMobile(640);
  const [geom, setGeom] = useState<WindowGeom>(() => defaultGeom());
  const [isMaximized, setIsMaximized] = useState(false);
  const [preMaxGeom, setPreMaxGeom] = useState<WindowGeom | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ w: 0, h: 0, x: 0, y: 0 });

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

  useEffect(() => {
    if (!isOpen || embedded || isMobile) return;
    setIsMaximized(false);
    setPreMaxGeom(null);
    const stored = loadStoredGeom();
    setGeom(clampGeom(stored || defaultGeom()));
  }, [isOpen, embedded, isMobile]);

  useEffect(() => {
    if (!isOpen || embedded || isMobile || isMaximized) return;
    try {
      localStorage.setItem(GEOM_STORAGE_KEY, JSON.stringify(geom));
    } catch {
      /* ignore */
    }
  }, [geom, isOpen, embedded, isMobile, isMaximized]);

  useEffect(() => {
    if (!isOpen || embedded || isMobile) return;
    const onResize = () => {
      if (isMaximized) return;
      setGeom((prev) => clampGeom(prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen, embedded, isMobile, isMaximized]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const onMove = (e: MouseEvent) => {
      if (isDragging) {
        const nextX = e.clientX - dragOffset.x;
        const nextY = e.clientY - dragOffset.y;
        setGeom((prev) => ({
          ...prev,
          x: Math.min(Math.max(-prev.width + 80, nextX), window.innerWidth - 80),
          y: Math.min(Math.max(0, nextY), window.innerHeight - 48),
        }));
      }
      if (isResizing) {
        const dw = e.clientX - resizeStart.x;
        const dh = e.clientY - resizeStart.y;
        setGeom((prev) => ({
          ...prev,
          width: Math.max(MIN_WIDTH, Math.min(window.innerWidth - prev.x - 8, resizeStart.w + dw)),
          height: Math.max(MIN_HEIGHT, Math.min(window.innerHeight - prev.y - 8, resizeStart.h + dh)),
        }));
      }
    };

    const onUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStart]);

  const toggleMaximize = () => {
    if (isMaximized) {
      setGeom(preMaxGeom || clampGeom(defaultGeom()));
      setPreMaxGeom(null);
      setIsMaximized(false);
    } else {
      setPreMaxGeom(geom);
      setIsMaximized(true);
    }
  };

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (isMobile || isMaximized) return;
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    e.preventDefault();
    setIsDragging(true);
    setDragOffset({ x: e.clientX - geom.x, y: e.clientY - geom.y });
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (isMobile || isMaximized) return;
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeStart({ w: geom.width, h: geom.height, x: e.clientX, y: e.clientY });
  };

  if (embedded) {
    return <UpdatesPanel onUpdateAvailabilityChange={onUpdateAvailabilityChange} />;
  }

  if (!isOpen) return null;

  const header = (
    <div
      onMouseDown={handleHeaderMouseDown}
      onDoubleClick={() => {
        if (!isMobile) toggleMaximize();
      }}
      className={`flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0 bg-gradient-to-r from-brand-50/80 via-white to-cyan-50/60 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 ${
        !isMobile && !isMaximized ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-brand-500 to-cyan-600 flex items-center justify-center text-white text-lg shrink-0 shadow-sm"
          aria-hidden
        >
          🚀
        </div>
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
            App updates
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">
            {isMobile
              ? 'Manual updates only — preview, back up DB, then apply'
              : 'Drag header to move · Resize corner · Double-click to maximize'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {!isMobile && (
          <button
            type="button"
            onClick={toggleMaximize}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M5 4a1 1 0 00-1 1v3h2V6h2V4H5zm8 0v2h2v2h2V5a1 1 0 00-1-1h-3zM4 12v3a1 1 0 001 1h3v-2H6v-2H4zm12 0h-2v2h-2v2h3a1 1 0 001-1v-3z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path
                  fillRule="evenodd"
                  d="M4 4a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm2 1v8h8V5H6z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-end justify-center p-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="bg-white dark:bg-slate-800 rounded-t-2xl shadow-2xl w-full max-h-[92vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {header}
          <div className="p-4 overflow-y-auto flex-1">
            <UpdatesPanel onUpdateAvailabilityChange={onUpdateAvailabilityChange} />
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />
      <div
        className={`bg-white dark:bg-slate-800 shadow-2xl overflow-hidden flex flex-col pointer-events-auto border border-slate-200 dark:border-slate-700 relative ${
          isMaximized ? 'rounded-none' : 'rounded-2xl'
        } ${isDragging ? 'select-none' : ''}`}
        style={
          isMaximized
            ? {
                position: 'fixed',
                left: 0,
                top: 0,
                width: '100vw',
                height: '100dvh',
                maxWidth: '100vw',
                maxHeight: '100dvh',
              }
            : {
                position: 'fixed',
                left: geom.x,
                top: geom.y,
                width: geom.width,
                height: geom.height,
                maxWidth: '100vw',
                maxHeight: '100dvh',
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {header}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1">
          <UpdatesPanel onUpdateAvailabilityChange={onUpdateAvailabilityChange} />
        </div>
        {!isMaximized && (
          <div
            onMouseDown={handleResizeMouseDown}
            className="absolute right-0 bottom-0 w-5 h-5 cursor-nwse-resize z-10"
            title="Resize"
            aria-hidden
          >
            <svg
              viewBox="0 0 20 20"
              className="w-4 h-4 absolute right-1 bottom-1 text-slate-400 dark:text-slate-500"
              fill="currentColor"
            >
              <path d="M14 18l4-4v4h-4zM10 18l8-8v2l-6 6h-2zM6 18l12-12v2L8 18H6z" />
            </svg>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default UpdatesDialog;
