import React, { useState, useImperativeHandle, forwardRef, useRef } from 'react';

const COLLAPSED_KEY = 'stagingOfflineKitCollapsed';
const DISMISSED_KEY = 'stagingOfflineKitDismissed';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export interface StagingOfflineKitHandle {
  /** Undismiss, expand, and scroll the kit into view (e.g. from Staging overview checklist). */
  reveal: () => void;
}

export interface StagingOfflineKitProps {
  onDownloadTemplate: () => void;
  onDownloadPrompt: () => void;
  onCsvFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onJsonFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const StagingOfflineKit = forwardRef<StagingOfflineKitHandle, StagingOfflineKitProps>(
  function StagingOfflineKit(
    { onDownloadTemplate, onDownloadPrompt, onCsvFileChange, onJsonFileChange },
    ref
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const [collapsed, setCollapsed] = useState(() => readFlag(COLLAPSED_KEY));
    const [dismissed, setDismissed] = useState(() => readFlag(DISMISSED_KEY));

    const setCollapsedPersist = (v: boolean) => {
      setCollapsed(v);
      writeFlag(COLLAPSED_KEY, v);
    };
    const setDismissedPersist = (v: boolean) => {
      setDismissed(v);
      writeFlag(DISMISSED_KEY, v);
    };

    useImperativeHandle(ref, () => ({
      reveal: () => {
        setDismissedPersist(false);
        setCollapsedPersist(false);
        requestAnimationFrame(() => {
          rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      },
    }));

    if (dismissed) {
      return (
        <div
          ref={rootRef}
          className="px-4 py-2 border-b border-amber-200/60 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20"
        >
          <button
            type="button"
            onClick={() => {
              setDismissedPersist(false);
              setCollapsedPersist(false);
            }}
            className="text-sm font-medium text-amber-800 dark:text-amber-200 hover:underline"
          >
            Show AI Offline Kit
          </button>
        </div>
      );
    }

    return (
      <div
        ref={rootRef}
        className="py-3 px-4 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">AI Offline Kit</h4>
            {!collapsed && (
              <p className="text-xs text-amber-800/80 dark:text-amber-200/70 mt-0.5 max-w-2xl">
                Bulk-import path: download templates → fill CSV with an AI → convert to JSON → import into Staging.
              </p>
            )}
            {collapsed && (
              <p className="text-xs text-amber-800/70 dark:text-amber-200/60 mt-0.5">
                Templates → CSV → JSON → Import — expand to use tools
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCollapsedPersist(!collapsed)}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-amber-800 dark:text-amber-200 hover:bg-amber-100/80 dark:hover:bg-amber-900/40 transition-colors"
            >
              {collapsed ? 'Expand' : 'Collapse'}
            </button>
            <button
              type="button"
              onClick={() => setDismissedPersist(true)}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <div className="bg-white dark:bg-slate-800/80 border border-amber-200/80 dark:border-amber-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Get templates</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                Download the CSV column layout and the prompt guide for ChatGPT/Claude.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onDownloadTemplate}
                  className="px-3 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-100 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/50 rounded-lg transition-colors"
                  title="Download CSV template for categories, spaces, tabs, sections, and links"
                >
                  CSV Template
                </button>
                <button
                  type="button"
                  onClick={onDownloadPrompt}
                  className="px-3 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-100 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/50 rounded-lg transition-colors"
                  title="Download AI prompt guide for offline generation"
                >
                  AI Prompt Guide
                </button>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800/80 border border-amber-200/80 dark:border-amber-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Convert</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                Upload your filled CSV. We convert it to import-ready JSON (nothing is saved yet).
              </p>
              <button
                type="button"
                onClick={() => csvInputRef.current?.click()}
                className="px-3 py-1.5 text-sm font-medium text-amber-900 dark:text-amber-100 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/50 rounded-lg transition-colors"
                title="Upload CSV to generate import-ready JSON file"
              >
                CSV → JSON
              </button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                onChange={onCsvFileChange}
                className="hidden"
              />
            </div>
            <div className="bg-white dark:bg-slate-800/80 border border-emerald-200/80 dark:border-emerald-800/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">
                  3
                </span>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">Import</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                Import the JSON into Staging only. Review spaces, then Move to Public when ready.
              </p>
              <button
                type="button"
                onClick={() => jsonInputRef.current?.click()}
                className="px-3 py-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 rounded-lg transition-colors"
                title="Import AI-generated JSON directly into Staging"
              >
                Import AI JSON
              </button>
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json"
                onChange={onJsonFileChange}
                className="hidden"
              />
            </div>
          </div>
        )}
      </div>
    );
  }
);
