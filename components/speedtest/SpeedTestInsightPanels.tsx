import React from 'react';
import { SpeedFinding, UseCaseGrade } from '../../services/speedTestDiagnostics';
import { SpeedTestResult, formatMbps, formatMs } from '../../services/speedTestService';

const SEVERITY: Record<SpeedFinding['severity'], string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  bad: 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200',
};

const GRADE_TONE: Record<string, string> = {
  A: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  B: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  C: 'bg-lime-500/15 text-lime-800 dark:text-lime-300 border-lime-500/30',
  D: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30',
  F: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
};

export const UseCaseGradesPanel: React.FC<{ grades: UseCaseGrade[] }> = ({ grades }) => {
  if (!grades?.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {grades.map((g) => (
        <div
          key={g.key}
          className={`rounded-2xl border px-3 py-2 ${GRADE_TONE[g.grade] || GRADE_TONE.C}`}
          title={`${g.label}: grade ${g.grade}. ${g.hint}`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide opacity-80">{g.label}</div>
          <div className="text-2xl font-black leading-none mt-0.5">{g.grade}</div>
          <div className="text-[10px] mt-1 opacity-80 line-clamp-2">{g.hint}</div>
        </div>
      ))}
    </div>
  );
};

export const DiagnosticsPanel: React.FC<{ findings: SpeedFinding[] }> = ({ findings }) => {
  if (!findings?.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-[#333] bg-white/80 dark:bg-[#1a1a1a]/80 p-3 space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Diagnostics</div>
      {findings.map((f) => (
        <div key={f.id} className={`rounded-xl border px-3 py-2 ${SEVERITY[f.severity]}`}>
          <div className="text-xs font-bold">{f.title}</div>
          <div className="text-[11px] opacity-90 mt-0.5">{f.detail}</div>
        </div>
      ))}
    </div>
  );
};

export const BufferbloatCards: React.FC<{ result: SpeedTestResult | null; loadedDown: number | null; loadedUp: number | null }> = ({
  result,
  loadedDown,
  loadedUp,
}) => {
  const dl = result?.bufferbloatDownload;
  const ul = result?.bufferbloatUpload;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div
        className="rounded-2xl border border-slate-200 dark:border-[#333] bg-white/80 dark:bg-[#1a1a1a]/80 px-3.5 py-3"
        title="Bufferbloat (download): how much ping rises while downloading. High bloat means queues fill under load — laggy gaming/calls even with high Mbps."
      >
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Bufferbloat (download)</div>
        <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white">
          {dl?.grade || '—'} · +{formatMs(result?.bufferbloatDownloadMs ?? null)}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          Idle {formatMs(result?.pingMs ?? null)} → loaded {formatMs(loadedDown ?? result?.loadedPingMs ?? null)}
        </div>
      </div>
      <div
        className="rounded-2xl border border-slate-200 dark:border-[#333] bg-white/80 dark:bg-[#1a1a1a]/80 px-3.5 py-3"
        title="Bufferbloat (upload): how much ping rises while uploading. Common on asymmetric links when upload saturates the queue."
      >
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Bufferbloat (upload)</div>
        <div className="text-xl font-black tabular-nums text-slate-900 dark:text-white">
          {ul?.grade || '—'} · +{formatMs(result?.bufferbloatUploadMs ?? null)}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          Idle {formatMs(result?.pingMs ?? null)} → loaded {formatMs(loadedUp ?? result?.loadedUploadPingMs ?? null)}
        </div>
      </div>
    </div>
  );
};

export const NetworkDetailsPanel: React.FC<{ result: SpeedTestResult | null }> = ({ result }) => {
  const m = result?.meta;
  return (
    <div
      className="rounded-2xl border border-slate-200 dark:border-[#333] bg-white/80 dark:bg-[#1a1a1a]/80 px-4 py-3 text-xs text-slate-600 dark:text-slate-400 space-y-1"
      title="Details from the last completed test (IP, path, mode used for that run)."
    >
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Connection details</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        <div title="Public or reported client IP for this test path.">IP: <span className="font-semibold text-slate-800 dark:text-slate-200">{m?.ip || '—'}</span></div>
        <div title="IPv4 and/or IPv6 addresses seen for this session.">IPv4 / IPv6: <span className="font-semibold text-slate-800 dark:text-slate-200">{[m?.ipv4, m?.ipv6].filter(Boolean).join(' · ') || '—'}</span></div>
        <div title="Browser Network Information API connection type when available (e.g. wifi, ethernet).">Type: <span className="font-semibold text-slate-800 dark:text-slate-200">{m?.connectionType || '—'}</span></div>
        <div title="Browser user-agent summary for this run.">Browser: <span className="font-semibold text-slate-800 dark:text-slate-200">{m?.browser || '—'}</span></div>
        <div title="Hostname of the speed-test endpoint used.">Endpoint: <span className="font-semibold text-slate-800 dark:text-slate-200">{m?.endpointHost || '—'}</span></div>
        {result?.target === 'custom' && (
          <div
            className="sm:col-span-2"
            title="Which network path the custom-server result measured: this browser directly, or this LinkNest host relaying."
          >
            Path:{' '}
            <span className="font-semibold text-violet-700 dark:text-violet-300">
              {m?.endpointMode === 'proxy'
                ? 'LinkNest host → endpoint (relayed; not this device)'
                : 'This browser → endpoint'}
            </span>
          </div>
        )}
        <div title="HTTP and TLS versions reported for the transfer path when known.">Protocol: <span className="font-semibold text-slate-800 dark:text-slate-200">{[m?.httpProtocol, m?.tls].filter(Boolean).join(' · ') || '—'}</span></div>
        <div title="Approximate edge location / colo for the internet target.">Location: <span className="font-semibold text-slate-800 dark:text-slate-200">{[m?.loc, m?.colo].filter(Boolean).join(' · ') || '—'}</span></div>
        <div title="Browser-estimated downlink from the Network Information API (not the measured test).">
          Est. downlink:{' '}
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {m?.connectionDownlink != null ? formatMbps(m.connectionDownlink) : '—'}
          </span>
        </div>
        {result && (
          <>
            <div title="Connection mode and stream count used for this completed result (not necessarily the toggle if you changed it after).">
              Mode: <span className="font-semibold text-slate-800 dark:text-slate-200">{result.connectionMode} ({result.streams} streams)</span>
            </div>
            <div title="Whether this run was measured in the browser or by the server worker.">
              Executor: <span className="font-semibold text-slate-800 dark:text-slate-200">{result.executor}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
