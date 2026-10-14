import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, Legend } from 'recharts';
import { compareTargets } from '../../services/speedTestDiagnostics';
import { SpeedTestProgress, SpeedTestResult, formatMbps } from '../../services/speedTestService';
import { DiagnosticsPanel } from './SpeedTestInsightPanels';

export const LiveThroughputCharts: React.FC<{
  progress: SpeedTestProgress;
  result: SpeedTestResult | null;
}> = ({ progress, result }) => {
  const liveDown = (progress.downloadSparkline?.length ? progress.downloadSparkline : progress.sparkline || []).map(
    (v, i) => ({ i, v })
  );
  const liveUp = (progress.uploadSparkline || []).map((v, i) => ({ i, v }));
  const samples = result?.samples?.length
    ? result.samples.map((s) => ({
        t: Math.round(s.t / 1000),
        down: s.phase === 'download' ? s.mbps : null,
        up: s.phase === 'upload' ? s.mbps : null,
      }))
    : null;

  const downData = samples || liveDown.map((d) => ({ t: d.i, down: d.v, up: null as number | null }));
  const upData = samples || liveUp.map((d) => ({ t: d.i, down: null as number | null, up: d.v }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="rounded-2xl border border-slate-200 dark:border-[#333] bg-white/70 dark:bg-[#1a1a1a]/70 p-3 h-40">
        <div className="text-[11px] font-bold uppercase tracking-wide text-cyan-600 dark:text-cyan-400 mb-1">Download graph</div>
        <ResponsiveContainer width="100%" height="85%">
          <AreaChart data={downData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis dataKey="t" hide />
            <YAxis tick={{ fontSize: 10 }} width={36} />
            <Tooltip formatter={(v: number) => [formatMbps(v), 'Download']} />
            <Area type="monotone" dataKey="down" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} strokeWidth={2} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="rounded-2xl border border-slate-200 dark:border-[#333] bg-white/70 dark:bg-[#1a1a1a]/70 p-3 h-40">
        <div className="text-[11px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-1">Upload graph</div>
        <ResponsiveContainer width="100%" height="85%">
          <AreaChart data={upData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
            <XAxis dataKey="t" hide />
            <YAxis tick={{ fontSize: 10 }} width={36} />
            <Tooltip formatter={(v: number) => [formatMbps(v), 'Upload']} />
            <Area type="monotone" dataKey="up" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.18} strokeWidth={2} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export const ComparisonPanel: React.FC<{
  internet: SpeedTestResult | null;
  server: SpeedTestResult | null;
  onRunCompare: () => void;
  running: boolean;
  /** Label for the second (non-internet) leg — "This server" or "Custom server (host)". */
  serverLabel?: string;
}> = ({ internet, server, onRunCompare, running, serverLabel }) => {
  const findings = compareTargets(internet, server);
  const serverIsProxy = server?.target === 'custom' && server.meta.endpointMode === 'proxy';
  const secondLabel = serverLabel || 'This server';
  const chart = [
    {
      name: 'Download',
      Internet: internet?.downloadMbps ?? 0,
      Server: server?.downloadMbps ?? 0,
    },
    {
      name: 'Upload',
      Internet: internet?.uploadMbps ?? 0,
      Server: server?.uploadMbps ?? 0,
    },
  ];

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-[#333] bg-white/70 dark:bg-[#1a1a1a]/70 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">Path comparison</div>
          <p className="text-[11px] text-slate-500">
            Runs Internet first, then {secondLabel}. VPN/LAN notes are heuristics — browsers cannot read VPN adapters.
            {serverIsProxy ? ' The second leg was relayed from the LinkNest host.' : ''}
          </p>
        </div>
        <button
          type="button"
          disabled={running}
          onClick={onRunCompare}
          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {running ? 'Comparing…' : 'Compare both paths'}
        </button>
      </div>
      {(internet || server) && (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} width={40} />
              <Tooltip formatter={(v: number) => formatMbps(v)} />
              <Legend />
              <Bar dataKey="Internet" fill="#06b6d4" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Server" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-slate-200 dark:border-[#333] p-3">
          <div className="font-bold text-slate-700 dark:text-slate-200">Internet</div>
          <div>Down {formatMbps(internet?.downloadMbps)} · Up {formatMbps(internet?.uploadMbps)}</div>
          <div>Ping {internet ? `${Math.round(internet.pingMs ?? 0)} ms` : '—'}</div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-[#333] p-3">
          <div className="font-bold text-slate-700 dark:text-slate-200">{secondLabel}</div>
          <div>Down {formatMbps(server?.downloadMbps)} · Up {formatMbps(server?.uploadMbps)}</div>
          <div>Ping {server ? `${Math.round(server.pingMs ?? 0)} ms` : '—'}</div>
          {server?.target === 'custom' && (
            <div className="text-[11px] text-slate-500 mt-0.5">
              {server.meta.endpointMode === 'proxy' ? 'via LinkNest host' : 'browser-direct'}
            </div>
          )}
        </div>
      </div>
      <DiagnosticsPanel findings={findings} />
    </div>
  );
};
