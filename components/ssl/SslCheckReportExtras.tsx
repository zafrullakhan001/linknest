import React from 'react';
import type { CheckResult } from './SslUrlChecker';
import { Bell, CheckCircle, XCircle, ChevronRight } from 'lucide-react';

type Props = {
  result: CheckResult;
  gradeLegendOpen: boolean;
  onToggleGradeLegend: () => void;
  onAddWatchlist?: () => void;
  onOpenChainValidator?: () => void;
};

const SslCheckReportExtras: React.FC<Props> = ({
  result,
  onAddWatchlist,
  onOpenChainValidator,
}) => {
  return (
    <>
      {result.chain_trust?.browser_valid !== undefined && (
        <div
          className={`rounded-lg border-2 p-4 text-sm ${
            result.chain_trust.browser_valid
              ? 'border-emerald-500 bg-white dark:bg-gray-800/95'
              : 'border-rose-500 bg-white dark:bg-gray-800/95'
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            {result.chain_trust.browser_valid ? (
              <>
                <CheckCircle className="w-7 h-7 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">Certificate chain is valid</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Linked names, dates, and signatures check out (same check as Chain validator)
                  </p>
                </div>
              </>
            ) : (
              <>
                <XCircle className="w-7 h-7 text-rose-600 shrink-0" />
                <div>
                  <p className="text-lg font-bold text-rose-900 dark:text-rose-100">Certificate chain validation failed</p>
                  <p className="text-xs text-rose-700 dark:text-rose-300">Issues in served PEM order, dates, or signatures</p>
                </div>
              </>
            )}
          </div>

          {result.chain_trust.browser_chain_labels && result.chain_trust.browser_chain_labels.length > 0 && (
            <div className="mb-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/45 p-3">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Chain order (leaf → root)</p>
              <div className="flex flex-wrap items-center gap-1 text-xs text-gray-800 dark:text-gray-200">
                {result.chain_trust.browser_chain_labels.map((label, idx) => (
                  <React.Fragment key={`${label}-${idx}`}>
                    {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                    <span
                      className="inline-flex max-w-[140px] truncate rounded-md bg-white dark:bg-gray-800 px-2 py-1 font-medium ring-1 ring-gray-200 dark:ring-gray-600"
                      title={label}
                    >
                      {label}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {result.chain_trust.browser_errors && result.chain_trust.browser_errors.length > 0 && (
            <ul className="text-xs text-rose-800 dark:text-rose-200 list-disc list-inside mb-2">
              {result.chain_trust.browser_errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          {result.chain_trust.browser_warnings && result.chain_trust.browser_warnings.length > 0 && (
            <ul className="text-xs text-amber-800 dark:text-amber-200 list-disc list-inside mb-2">
              {result.chain_trust.browser_warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Browser validation does not prove Mozilla/Apple/Microsoft trust-store acceptance.
          </p>

          {onOpenChainValidator && result.chain_pems && result.chain_pems.length > 0 && (
            <button type="button" onClick={onOpenChainValidator} className="mt-2 text-xs text-indigo-600 hover:underline">
              Open in Chain validator
            </button>
          )}
        </div>
      )}

      {result.chain_trust &&
        (result.chain_trust.trusted !== null ||
          result.chain_trust.messages.some((m) => !/browser|chain validator/i.test(m))) && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              result.chain_trust.trusted === true
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
                : result.chain_trust.trusted === false
                  ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100'
                  : 'border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100'
            }`}
          >
            <p className="font-semibold">System CA trust ({result.chain_trust.status})</p>
            <ul className="text-xs mt-1 list-disc list-inside">
              {result.chain_trust.messages
                .filter((m) => !/not recognized|skipped|unable to find openssl/i.test(m))
                .map((m) => (
                  <li key={m}>{m}</li>
                ))}
            </ul>
          </div>
        )}

      {result.ok && onAddWatchlist && (
        <button
          type="button"
          onClick={onAddWatchlist}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:underline print:hidden"
        >
          <Bell className="w-3.5 h-3.5" />
          Add to watchlist
        </button>
      )}
    </>
  );
};

export default SslCheckReportExtras;
