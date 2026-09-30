import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  checkRuntimeNow,
  getRuntimeStatus,
  runtimeReportUrl,
  runtimeStatusClass,
  runtimeStatusLabel,
  type RuntimeStatus,
  type RuntimeStep,
} from '../services/runtimeService';

const ADMIN_SECTION_CARD =
  'bg-white dark:bg-slate-800 border border-sky-200/70 dark:border-sky-800/40 rounded-xl overflow-hidden shadow-sm shadow-sky-500/5';
const ADMIN_SECTION_HEADER =
  'bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-800/40 px-6 py-5';
const ADMIN_SECTION_TITLE =
  'text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2';
const ADMIN_SECTION_SUBTITLE = 'text-sm text-sky-800/70 dark:text-sky-200/70 mt-0.5';
const ADMIN_PRIMARY_BTN =
  'bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-sky-500/20';
const ADMIN_SECONDARY_BTN =
  'bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-700 text-sky-800 dark:text-sky-200 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors';

const MONO = 'font-mono text-[11px] leading-relaxed';

function formatBytes(bytes?: number | null): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes) || bytes <= 0) {
    return '—';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function formatAgo(ts?: number | null): string {
  if (!ts) {
    return 'never';
  }
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ago`;
  }
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDate(value?: string | null): string {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString().slice(0, 10);
}

const CopyButton: React.FC<{ text: string; label?: string; onCopied?: () => void }> = ({
  text,
  label = 'Copy',
  onCopied,
}) => {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [text, onCopied]);

  return (
    <button
      type="button"
      onClick={copy}
      className={`${ADMIN_SECONDARY_BTN} px-2.5 py-1 text-xs`}
      title="Copy to clipboard"
    >
      {copied ? 'Copied' : label}
    </button>
  );
};

const StatusPill: React.FC<{ status: string; label?: string }> = ({ status, label }) => (
  <span
    className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${runtimeStatusClass(status)}`}
  >
    {label ?? runtimeStatusLabel(status)}
  </span>
);

const SecurityBadge: React.FC<{ title?: string }> = ({ title }) => (
  <span
    title={title ?? 'A vendor-declared security release is available'}
    className="inline-flex rounded-md border border-red-200/80 dark:border-red-800/60 bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-800 dark:bg-red-950/60 dark:text-red-200"
  >
    Security
  </span>
);

const SHELL_LABEL: Record<string, string> = {
  powershell: 'PowerShell',
  cmd: 'Command Prompt',
  bash: 'Shell',
};

const ElevatedBadge: React.FC = () => (
  <span className="inline-flex rounded-md border border-amber-200/80 dark:border-amber-800/60 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
    Run as administrator
  </span>
);

const StepBlock: React.FC<{ step: RuntimeStep }> = ({ step }) => (
  <div className="rounded-lg border border-sky-100 dark:border-sky-900/50 bg-slate-50 dark:bg-slate-900/60 p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <span>{step.title}</span>
          {step.elevated && <ElevatedBadge />}
        </p>
        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-sky-700 dark:text-sky-300">
          {SHELL_LABEL[step.shell] ?? step.shell}
        </p>
      </div>
      <CopyButton text={step.code} />
    </div>
    <pre
      className={`${MONO} mt-2 overflow-x-auto whitespace-pre rounded-md bg-slate-900 p-3 text-slate-100 dark:bg-black/70`}
    >
      {step.code}
    </pre>
    {step.note && (
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{step.note}</p>
    )}
  </div>
);

const CommandSection: React.FC<{
  title: string;
  emoji: string;
  steps: RuntimeStep[];
  downtime?: { requiresRestart: boolean; window: string; summary: string; planning: string } | null;
  defaultOpen?: boolean;
  footer?: React.ReactNode;
}> = ({ title, emoji, steps, downtime, defaultOpen = false, footer }) => {
  const [open, setOpen] = useState(defaultOpen);
  const allCode = useMemo(() => steps.map((s) => `# ${s.title}\n${s.code}`).join('\n\n'), [steps]);

  return (
    <div className="rounded-xl border border-sky-100 dark:border-sky-900/50 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-sky-50/80 to-white dark:from-sky-950/30 dark:to-slate-800 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <span aria-hidden>{emoji}</span>
          <span className="text-sm font-bold text-slate-900 dark:text-white">{title}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {steps.length} option{steps.length === 1 ? '' : 's'}
          </span>
          <span className="text-xs text-sky-700 dark:text-sky-300">{open ? 'Hide' : 'Show'} commands</span>
        </button>
        <div className="flex items-center gap-2">
          {downtime && (
            <span
              className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                downtime.requiresRestart
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
              }`}
            >
              {downtime.requiresRestart ? `Restart needed · ${downtime.window}` : 'No downtime'}
            </span>
          )}
          {steps.length > 0 && <CopyButton text={allCode} label="Copy all" />}
        </div>
      </div>
      {open && (
        <div className="space-y-3 border-t border-sky-100 dark:border-sky-900/50 p-4">
          {downtime && (
            <p className="rounded-lg bg-slate-50 dark:bg-slate-900/60 p-3 text-xs text-slate-700 dark:text-slate-200">
              <strong>{downtime.summary}</strong>
              {downtime.planning ? <> {downtime.planning}</> : null}
            </p>
          )}
          {steps.map((step) => (
            <StepBlock key={step.id} step={step} />
          ))}
          {footer}
        </div>
      )}
    </div>
  );
};

const SummaryBanner: React.FC<{
  summary: RuntimeStatus['summary'];
  layoutLabel: string;
  requiresElevation: boolean;
  sources: RuntimeStatus['sources'];
}> = ({ summary, layoutLabel, requiresElevation, sources }) => (
  <div
    className={`rounded-xl border p-4 text-sm ${
      summary.securityAvailable
        ? 'border-red-200/80 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-100'
        : summary.updateAvailable
          ? 'border-amber-200/80 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100'
          : 'border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100'
    }`}
  >
    <p className="font-semibold">{summary.message}</p>
    {summary.securityAvailable && (
      <p className="mt-1 text-xs">
        At least one available release is a vendor-declared security release — apply it soon.
      </p>
    )}
    <p className="mt-1 text-xs opacity-80">
      Host detected as <strong>{layoutLabel}</strong>
      {requiresElevation ? ' — PHP/Apache changes need an Administrator shell.' : '.'}{' '}
      Vendor indexes read {formatAgo(sources.php.fetchedAt)} (PHP) and {formatAgo(sources.node.fetchedAt)}{' '}
      (Node).
      {(sources.php.error || sources.node.error) && (
        <>
          {' '}
          Index warning: {sources.php.error || sources.node.error} — commands below are still generated from
          the local install.
        </>
      )}
    </p>
  </div>
);

export const RuntimeUpdatesPanel: React.FC<{
  /**
   * Reports whether underlying-software patches are available so the caller
   * (nav bell / Admin nav) can surface a badge. Read-only advisory only.
   */
  onUpdateAvailabilityChange?: (available: boolean, count: number) => void;
}> = ({ onUpdateAvailabilityChange }) => {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force: boolean) => {
    if (force) {
      setChecking(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = force ? await checkRuntimeNow() : await getRuntimeStatus();
      setStatus(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load runtime status');
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!status || !onUpdateAvailabilityChange) {
      return;
    }
    onUpdateAvailabilityChange(
      Boolean(status.summary.updateAvailable),
      Number(status.summary.patchCount) || 0
    );
  }, [status, onUpdateAvailabilityChange]);

  if (loading && !status) {
    return (
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h3 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>🧱</span> System Runtime
          </h3>
          <p className={ADMIN_SECTION_SUBTITLE}>
            Detecting the PHP, Node.js, Apache and SQLite versions on this host…
          </p>
        </div>
        <div className="space-y-2 p-6 text-sm text-slate-600 dark:text-slate-300">
          <p>Probing runtimes and reading the official release indexes (read-only).</p>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h3 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>🧱</span> System Runtime
          </h3>
          <p className={ADMIN_SECTION_SUBTITLE}>Could not read the underlying software versions.</p>
        </div>
        <div className="space-y-3 p-6">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button type="button" className={`${ADMIN_PRIMARY_BTN} px-3 py-2`} onClick={() => void load(false)}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const { components, summary, layout, sources, capabilities } = status;
  const php = components.php.update;
  const node = components.node.update;

  const versionRows: Array<{
    key: string;
    label: string;
    version: string;
    detail: React.ReactNode;
    status?: string;
    security?: boolean;
    note?: string;
  }> = [
    {
      key: 'php',
      label: 'PHP',
      version: components.php.info.version,
      detail: (
        <>
          {components.php.info.zts ? 'Thread Safe (ZTS)' : 'Non-Thread Safe (NTS)'} ·{' '}
          {components.php.info.arch} · {components.php.info.sapi}
          <br />
          <span className="font-mono">{components.php.info.iniPath || 'php.ini unknown'}</span>
          {components.php.info.missingExtensions.length > 0 && (
            <span className="text-red-700 dark:text-red-300">
              <br />
              Missing extensions: {components.php.info.missingExtensions.join(', ')}
            </span>
          )}
        </>
      ),
      status: php.status,
      security: php.security,
    },
    {
      key: 'node',
      label: 'Node.js',
      version: node.currentVersion || 'not installed',
      detail: (
        <>
          {node.arch || 'arch unknown'} · {node.pathSource || 'location unknown'}
          {node.ltsName ? ` · LTS ${node.ltsName}` : ''}
          <br />
          <span className="font-mono">{node.path || 'node not found'}</span>
        </>
      ),
      status: node.status,
      security: node.security,
    },
    {
      key: 'npm',
      label: 'npm',
      version: node.npmVersion || 'unknown',
      detail: 'Bundled with Node.js',
      note: 'Updates with Node.js',
    },
    {
      key: 'apache',
      label: 'Apache',
      version: components.apache.info.version || 'unknown',
      detail: (
        <>
          {components.apache.info.arch || 'arch unknown'}
          <br />
          <span className="font-mono">{components.apache.info.path || 'httpd not found'}</span>
        </>
      ),
      note: 'Check vendor page',
    },
    {
      key: 'sqlite',
      label: 'SQLite',
      version: components.sqlite.info.engineVersion || 'unknown',
      detail: (
        <>
          {components.sqlite.info.journalMode || 'journal ?'} · schema v
          {components.sqlite.info.schemaVersion ?? '?'} · {formatBytes(components.sqlite.info.dbBytes)}
          {components.sqlite.info.libDllPath && (
            <>
              <br />
              <span className="font-mono">
                {components.sqlite.info.libDllPath} ({components.sqlite.info.libDllArch || '?'})
              </span>
            </>
          )}
        </>
      ),
      note: '>= 3.53 expected',
    },
    {
      key: 'git',
      label: 'git',
      version: components.git.info.version || 'not installed',
      detail: (
        <>
          App version {components.git.info.appVersion || '?'}
          {components.git.info.buildId ? ` · build ${components.git.info.buildId}` : ''}
        </>
      ),
      note: 'Used by App Updates',
    },
  ];


  return (
    <div className="space-y-4">
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className={ADMIN_SECTION_TITLE}>
                <span aria-hidden>🧱</span> Underlying software
              </h3>
              <p className={ADMIN_SECTION_SUBTITLE}>
                Current PHP, Node.js, npm, Apache and SQLite versions, the patches published by the
                vendors, and the exact commands to apply them. <strong>Read-only</strong> — nothing is
                installed or restarted from here.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`${ADMIN_PRIMARY_BTN} px-3 py-2`}
                onClick={() => void load(true)}
                disabled={checking}
              >
                {checking ? 'Checking…' : 'Check for patches'}
              </button>
              <a
                className={`${ADMIN_SECONDARY_BTN} inline-flex items-center px-3 py-2`}
                href={runtimeReportUrl('md')}
                target="_blank"
                rel="noreferrer"
              >
                Download report
              </a>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-6">
          <SummaryBanner summary={summary} layoutLabel={layout.label} requiresElevation={layout.requiresElevation} sources={sources} />
          {error && (
            <p className="rounded-lg border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-800 dark:text-red-200">
              {error}
            </p>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Read-only guarantee: this panel only reads versions and vendor indexes. It never upgrades,
            installs, replaces or restarts anything. Its only write is a local cache
            (<code className="font-mono">{capabilities.writes}</code>).
          </p>
        </div>
      </div>

      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h3 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>📋</span> Installed versions
          </h3>
          <p className={ADMIN_SECTION_SUBTITLE}>Detected on this host right now.</p>
        </div>
        <div className="overflow-x-auto p-6">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="py-2 pr-3">Component</th>
                <th className="py-2 pr-3">Version</th>
                <th className="py-2 pr-3">Details</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200">
              {versionRows.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="py-2.5 pr-3 font-semibold">{row.label}</td>
                  <td className="py-2.5 pr-3 font-mono">{row.version}</td>
                  <td className="py-2.5 pr-3 text-xs">{row.detail}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.status && <StatusPill status={row.status} />}
                      {row.security && <SecurityBadge />}
                      {!row.status && !row.security && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">{row.note}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {layout.notes.length > 0 && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-300">
              {layout.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h3 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>⬆️</span> Available patches &amp; command lines
          </h3>
          <p className={ADMIN_SECTION_SUBTITLE}>
            Generated for the <strong>{layout.label}</strong> layout. Copy a command and run it from an
            Administrator shell — this page does not execute anything.
          </p>
        </div>
        <div className="space-y-4 p-6">
          <div className="rounded-xl border border-sky-100 p-4 text-sm dark:border-sky-900/50">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-white">PHP</span>
              <span className="font-mono text-xs">{php.currentVersion}</span>
              <span aria-hidden>→</span>
              <span className="font-mono text-xs font-semibold">{php.latestForLine || 'unknown'}</span>
              <StatusPill status={php.status} />
              {php.security && <SecurityBadge />}
              {php.publishedAt && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  released {formatDate(php.publishedAt)}
                </span>
              )}
              {php.notesUrl && (
                <a
                  className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300"
                  href={php.notesUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Release notes
                </a>
              )}
            </div>
            {php.newerMinorAvailable && (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                A newer PHP minor line is published ({php.latestAny}). Plan a minor upgrade separately if you
                want it.
              </p>
            )}
            {php.securityHint?.status === 'security' && php.securityHint.excerpt && (
              <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-900 dark:bg-red-950/30 dark:text-red-100">
                Vendor note: {php.securityHint.excerpt}
              </p>
            )}
          </div>

          <CommandSection
            title="PHP patch / upgrade"
            emoji="🐘"
            steps={components.php.instructions.steps}
            downtime={components.php.instructions.downtime}
            defaultOpen
          />

          <div className="rounded-xl border border-sky-100 p-4 text-sm dark:border-sky-900/50">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-white">Node.js</span>
              <span className="font-mono text-xs">{node.currentVersion || 'not installed'}</span>
              <span aria-hidden>→</span>
              <span className="font-mono text-xs font-semibold">{node.latestForLine || 'unknown'}</span>
              <StatusPill status={node.status} />
              {node.security && <SecurityBadge />}
              {node.latestLts && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  LTS {node.latestLts.version}
                </span>
              )}
              {node.notesUrl && (
                <a
                  className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300"
                  href={node.notesUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Changelog
                </a>
              )}
            </div>
            {node.missingSecurityVersions.length > 0 && (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Missing vendor security releases on this line:{' '}
                <span className="font-mono">{node.missingSecurityVersions.join(', ')}</span>
              </p>
            )}
          </div>

          <CommandSection
            title="Node.js / npm upgrade"
            emoji="⬡"
            steps={components.node.instructions.steps}
            downtime={components.node.instructions.downtime}
          />

            <CommandSection
              title="Apache patch"
              emoji="🪶"
              steps={components.apache.instructions.steps}
              downtime={components.apache.instructions.downtime}
            />

            <CommandSection
              title="SQLite engine / DLL"
              emoji="🗃️"
              steps={components.sqlite.instructions.steps}
              downtime={components.sqlite.instructions.downtime}
            />
        </div>
      </div>

      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h3 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>⏱️</span> Downtime reference
          </h3>
          <p className={ADMIN_SECTION_SUBTITLE}>What each component costs while it is being patched.</p>
        </div>
        <div className="overflow-x-auto p-6">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="py-2 pr-3">Component</th>
                <th className="py-2 pr-3">Outage</th>
                <th className="py-2 pr-3">Why / how to plan</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200">
              {(['php', 'node', 'apache', 'sqlite'] as const).map((key) => {
                const info = status.downtime?.[key];
                if (!info) {
                  return null;
                }
                return (
                  <tr key={key} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="py-2.5 pr-3 font-semibold uppercase">{key}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          info.requiresRestart
                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                        }`}
                      >
                        {info.requiresRestart ? `Restart: ${info.window}` : 'No downtime'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      {info.summary}
                      {info.planning ? ` ${info.planning}` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h3 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>🔗</span> Sources &amp; guides
          </h3>
          <p className={ADMIN_SECTION_SUBTITLE}>
            Where the numbers come from, and where the full procedures live.
          </p>
        </div>
        <div className="space-y-2 p-6 text-xs text-slate-700 dark:text-slate-200">
          <p>
            <strong>PHP:</strong>{' '}
            {sources.php.url ? (
              <a
                className="text-sky-700 hover:underline dark:text-sky-300"
                href={sources.php.url}
                target="_blank"
                rel="noreferrer"
              >
                {sources.php.source}
              </a>
            ) : (
              sources.php.source
            )}{' '}
            — {sources.php.lineCount} release line(s), read {formatAgo(sources.php.fetchedAt)}
            {sources.php.stale ? ' (cached copy)' : ''}
            {sources.php.error ? ` — ${sources.php.error}` : ''}
          </p>
          <p>
            <strong>Node.js:</strong>{' '}
            {sources.node.url ? (
              <a
                className="text-sky-700 hover:underline dark:text-sky-300"
                href={sources.node.url}
                target="_blank"
                rel="noreferrer"
              >
                {sources.node.source}
              </a>
            ) : (
              sources.node.source
            )}{' '}
            — {sources.node.lineCount} major line(s), read {formatAgo(sources.node.fetchedAt)}
            {sources.node.stale ? ' (cached copy)' : ''}
            {sources.node.error ? ` — ${sources.node.error}` : ''}
          </p>
          <p>
            Cache: <code className="font-mono">{status.cacheFile}</code> · vendor indexes are cached for up to{' '}
            {Math.max(1, Math.round(status.capabilities.cacheTtlSeconds / 3600))} h. Press{' '}
            <strong>Check for patches</strong> to refresh immediately.
          </p>
          <p>
            Full procedure, verification steps and rollback: <strong>Help → Guides → Runtime (PHP / Node)
            updates</strong> (<code className="font-mono">docs/RUNTIME_UPDATES.md</code>), plus{' '}
            <strong>Guides → Upgrade PHP in XAMPP</strong> and <strong>Guides → Upgrade Vanilla Apache +
            PHP</strong>.
          </p>
          <p>
            Server health (extensions, OPcache, SQLite, writable folders):{' '}
            <a
              className="text-sky-700 hover:underline dark:text-sky-300"
              href="../health.php?format=json"
              target="_blank"
              rel="noreferrer"
            >
              /health.php?format=json
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RuntimeUpdatesPanel;


