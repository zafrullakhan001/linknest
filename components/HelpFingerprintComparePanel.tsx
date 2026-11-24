import React, { useMemo, useRef, useState } from 'react';
import {
  diffFingerprintSnapshots,
  fingerprintSignalLabel,
  parseFingerprintSnapshotFile,
  serializeFingerprintSnapshot,
  type FingerprintAttribute,
  type FingerprintAttributeDiff,
  type FingerprintDiffStatus,
  type FingerprintResult,
  type FingerprintSnapshot,
} from '../services/fingerprintService';

type Side = 'a' | 'b';

const GROUP_META: Record<
  FingerprintAttribute['group'],
  { label: string; wrap: string; heading: string }
> = {
  http: {
    label: 'HTTP headers',
    wrap: 'border-sky-200/80 dark:border-sky-800/50',
    heading: 'text-sky-800 dark:text-sky-200',
  },
  extensions: {
    label: 'LinkNest extensions',
    wrap: 'border-violet-200/80 dark:border-violet-800/50',
    heading: 'text-violet-800 dark:text-violet-200',
  },
  javascript: {
    label: 'Javascript attributes',
    wrap: 'border-amber-200/80 dark:border-amber-800/50',
    heading: 'text-amber-800 dark:text-amber-200',
  },
  geo: {
    label: 'Geographic location',
    wrap: 'border-emerald-200/80 dark:border-emerald-800/50',
    heading: 'text-emerald-800 dark:text-emerald-200',
  },
};

const ROW_CLASS: Record<FingerprintDiffStatus, string> = {
  unchanged: 'bg-white/80 dark:bg-slate-900/30',
  changed: 'bg-amber-100/80 dark:bg-amber-950/40',
  onlyA: 'bg-sky-100/80 dark:bg-sky-950/40',
  onlyB: 'bg-fuchsia-100/70 dark:bg-fuchsia-950/35',
};

const STATUS_LABEL: Record<FingerprintDiffStatus, string> = {
  unchanged: 'same',
  changed: 'changed',
  onlyA: 'only A',
  onlyB: 'only B',
};

interface HelpFingerprintComparePanelProps {
  currentResult: FingerprintResult | null;
}

export const HelpFingerprintComparePanel: React.FC<HelpFingerprintComparePanelProps> = ({
  currentResult,
}) => {
  const [snapshotA, setSnapshotA] = useState<FingerprintSnapshot | null>(null);
  const [snapshotB, setSnapshotB] = useState<FingerprintSnapshot | null>(null);
  const [labelA, setLabelA] = useState('');
  const [labelB, setLabelB] = useState('');
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const fileARef = useRef<HTMLInputElement>(null);
  const fileBRef = useRef<HTMLInputElement>(null);

  const loadFile = async (side: Side, file: File | undefined) => {
    if (!file) return;
    try {
      const snap = await parseFingerprintSnapshotFile(file);
      if (side === 'a') {
        setSnapshotA(snap);
        setLabelA(file.name);
        setErrorA(null);
      } else {
        setSnapshotB(snap);
        setLabelB(file.name);
        setErrorB(null);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not read that JSON file.';
      if (side === 'a') {
        setSnapshotA(null);
        setLabelA(file.name);
        setErrorA(message);
      } else {
        setSnapshotB(null);
        setLabelB(file.name);
        setErrorB(message);
      }
    }
  };

  const useCurrentAsA = () => {
    if (!currentResult) return;
    setSnapshotA(serializeFingerprintSnapshot(currentResult));
    setLabelA('Current browser');
    setErrorA(null);
    if (fileARef.current) fileARef.current.value = '';
  };

  const clearSide = (side: Side) => {
    if (side === 'a') {
      setSnapshotA(null);
      setLabelA('');
      setErrorA(null);
      if (fileARef.current) fileARef.current.value = '';
    } else {
      setSnapshotB(null);
      setLabelB('');
      setErrorB(null);
      if (fileBRef.current) fileBRef.current.value = '';
    }
  };

  const swapPanels = () => {
    setSnapshotA(snapshotB);
    setSnapshotB(snapshotA);
    setLabelA(labelB);
    setLabelB(labelA);
    setErrorA(errorB);
    setErrorB(errorA);
    if (fileARef.current) fileARef.current.value = '';
    if (fileBRef.current) fileBRef.current.value = '';
  };

  const diff = useMemo(() => {
    if (!snapshotA || !snapshotB) return null;
    return diffFingerprintSnapshots(snapshotA, snapshotB);
  }, [snapshotA, snapshotB]);

  const visibleRows = useMemo(() => {
    if (!diff) return [];
    return showAll ? diff.rows : diff.rows.filter((row) => row.status !== 'unchanged');
  }, [diff, showAll]);

  const grouped = useMemo(() => {
    const map: Record<FingerprintAttribute['group'], FingerprintAttributeDiff[]> = {
      http: [],
      extensions: [],
      javascript: [],
      geo: [],
    };
    for (const row of visibleRows) map[row.group].push(row);
    return map;
  }, [visibleRows]);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-violet-200/70 dark:border-violet-800/40 bg-gradient-to-br from-violet-50/80 via-white to-sky-50/70 dark:from-violet-950/30 dark:via-slate-900/40 dark:to-sky-950/20 p-4">
        <h3 className="text-xl font-semibold text-violet-900 dark:text-violet-100 mb-2">
          Compare fingerprint JSON
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Load two exports (for example a normal window and InPrivate / Incognito) to see which
          attributes changed. You can also use the fingerprint currently collected in this browser as
          File A and pick the other export as File B.
        </p>
      </section>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={swapPanels}
          disabled={!snapshotA && !snapshotB && !labelA && !labelB}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50"
        >
          Swap panels
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SidePicker
          title="File A"
          label={labelA}
          error={errorA}
          snapshot={snapshotA}
          inputRef={fileARef}
          onFile={(file) => void loadFile('a', file)}
          onClear={() => clearSide('a')}
          extra={
            <button
              type="button"
              onClick={useCurrentAsA}
              disabled={!currentResult}
              className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/80 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 disabled:opacity-50"
            >
              Use current fingerprint
            </button>
          }
        />
        <SidePicker
          title="File B"
          label={labelB}
          error={errorB}
          snapshot={snapshotB}
          inputRef={fileBRef}
          onFile={(file) => void loadFile('b', file)}
          onClear={() => clearSide('b')}
        />
      </div>

      {diff ? (
        <div
          className={`rounded-xl border p-4 space-y-3 ${
            diff.hashMatch
              ? 'border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/70 dark:bg-emerald-950/25'
              : 'border-amber-200/80 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/25'
          }`}
        >
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {diff.hashMatch ? 'Hashes match' : 'Hashes differ'}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <HashBlock title="File A" display={diff.hashDisplayA} original={diff.hashA} />
            <HashBlock title="File B" display={diff.hashDisplayB} original={diff.hashB} />
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {diff.counts.changed} changed · {diff.counts.onlyA} only in A · {diff.counts.onlyB} only in B
            · {diff.counts.unchanged} same
          </p>
          {diff.excludedOnlyA.length || diff.excludedOnlyB.length ? (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Excluded signals differ
              {diff.excludedOnlyA.length
                ? ` · only A: ${diff.excludedOnlyA.map((id) => fingerprintSignalLabel(id)).join(', ')}`
                : ''}
              {diff.excludedOnlyB.length
                ? ` · only B: ${diff.excludedOnlyB.map((id) => fingerprintSignalLabel(id)).join(', ')}`
                : ''}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border ${
                !showAll
                  ? 'border-violet-400 bg-violet-100 dark:bg-violet-900/50 text-violet-900 dark:text-violet-100'
                  : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
              }`}
            >
              Differences only
            </button>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border ${
                showAll
                  ? 'border-violet-400 bg-violet-100 dark:bg-violet-900/50 text-violet-900 dark:text-violet-100'
                  : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
              }`}
            >
              All attributes
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Choose two fingerprint JSON files to compare.
        </p>
      )}

      {diff
        ? (['http', 'extensions', 'javascript', 'geo'] as const).map((group) => {
            const rows = grouped[group];
            if (!rows.length) return null;
            const meta = GROUP_META[group];
            return (
              <section key={group}>
                <h4 className={`text-sm font-semibold mb-2 ${meta.heading}`}>{meta.label}</h4>
                <div className={`overflow-x-auto rounded-xl border ${meta.wrap}`}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <th className="text-left px-3 py-2 font-medium w-[28%]">Attribute</th>
                        <th className="text-left px-3 py-2 font-medium">File A</th>
                        <th className="text-left px-3 py-2 font-medium">File B</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.key} className={ROW_CLASS[row.status]}>
                          <td className="align-top px-3 py-2 font-medium text-slate-700 dark:text-slate-200">
                            {row.name}
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-slate-100/90 dark:bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-normal text-slate-600 dark:text-slate-300">
                              {STATUS_LABEL[row.status]}
                            </span>
                          </td>
                          <td className="align-top px-3 py-2 whitespace-pre-wrap break-all font-mono text-xs text-slate-800 dark:text-slate-100">
                            {formatSideValue(row.valueA, row.hashedA)}
                          </td>
                          <td className="align-top px-3 py-2 whitespace-pre-wrap break-all font-mono text-xs text-slate-800 dark:text-slate-100">
                            {formatSideValue(row.valueB, row.hashedB)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
        : null}

      {diff && !visibleRows.length ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          Every listed attribute is the same. If the hashes still differ, excluded-signal choices or
          hashed vs excluded flags may be the cause.
        </p>
      ) : null}
    </div>
  );
};

function formatSideValue(value: string | null, hashed: boolean | null): string {
  if (value === null) return '—';
  if (hashed === null) return value;
  return `${value}\n${hashed ? '(hashed)' : '(not hashed)'}`;
}

const SidePicker: React.FC<{
  title: string;
  label: string;
  error: string | null;
  snapshot: FingerprintSnapshot | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File | undefined) => void;
  onClear: () => void;
  extra?: React.ReactNode;
}> = ({ title, label, error, snapshot, inputRef, onFile, onClear, extra }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-4 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {extra}
        {snapshot || label ? (
          <button
            type="button"
            onClick={onClear}
            className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
    <input
      ref={inputRef}
      type="file"
      accept="application/json,.json"
      className="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-slate-200 dark:file:border-slate-600 file:bg-slate-50 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200"
      onChange={(e) => onFile(e.target.files?.[0])}
    />
    {label ? <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p> : null}
    {error ? <p className="text-xs text-rose-700 dark:text-rose-400">{error}</p> : null}
    {snapshot ? (
      <div className="space-y-1.5">
        {snapshot.exportedAt ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{snapshot.exportedAt}</p>
        ) : null}
        <HashBlock title="Hash" display={snapshot.hashDisplay} original={snapshot.hash} />
      </div>
    ) : null}
  </div>
);

const HashBlock: React.FC<{ title: string; display: string; original: string }> = ({
  title,
  display,
  original,
}) => (
  <div className="space-y-1">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {title}
    </div>
    <code className="block break-all text-sm font-mono text-violet-900 dark:text-violet-100 bg-white/85 dark:bg-slate-900/70 rounded-lg px-3 py-2 border border-violet-200/80 dark:border-violet-800/50">
      {display}
    </code>
    {original && original !== display ? (
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Original hash:{' '}
        <code className="break-all font-mono text-slate-700 dark:text-slate-200">{original}</code>
      </p>
    ) : null}
  </div>
);
