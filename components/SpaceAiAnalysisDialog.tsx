import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tile } from '../types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { useDraggableResizableDialog } from '../hooks/useDraggableResizableDialog';
import { createTile, saveTile } from '../services/storageService';
import { normalizeImportedTiles } from '../services/spaceTransferService';
import {
  buildSpaceAnalysisPayload,
  buildSpaceAnalysisPrompt,
  downloadTextFile,
  mergeAnalyzedTile,
  parseLlmSpaceJson,
  spaceAnalysisFilename,
  spaceAnalysisOutputFilename,
  summarizeAnalyzedTile,
  type SpaceAnalysisSummary,
} from '../services/spaceAiAnalysisService';

interface SpaceAiAnalysisDialogProps {
  open: boolean;
  tile: Tile;
  onClose: () => void;
  onApplied: (tile: Tile) => void | Promise<void>;
  onImported: (tile: Tile) => void | Promise<void>;
}

export const SpaceAiAnalysisDialog: React.FC<SpaceAiAnalysisDialogProps> = ({
  open,
  tile,
  onClose,
  onApplied,
  onImported,
}) => {
  const [pasteText, setPasteText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [parsedTile, setParsedTile] = useState<Tile | null>(null);
  const [summary, setSummary] = useState<SpaceAnalysisSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'apply' | 'import' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    modalRef,
    modalPosition,
    modalSize,
    isDragging,
    isResizing,
    handleDragStart,
    handleResizeStart,
    isReady,
  } = useDraggableResizableDialog({
    open,
    defaultWidth: 768,
    defaultHeight: 880,
    minWidth: 400,
    minHeight: 360,
  });

  const payload = useMemo(() => buildSpaceAnalysisPayload(tile), [tile]);
  const prompt = useMemo(() => buildSpaceAnalysisPrompt(tile), [tile]);
  const payloadJson = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const outputFile = useMemo(() => spaceAnalysisOutputFilename(tile), [tile]);
  const combined = useMemo(
    () =>
      `${prompt}\n\n---INPUT: attach the downloaded space JSON file (${spaceAnalysisFilename(tile, 'json')}) instead of pasting it here when the space is large---\n\n${payloadJson}\n`,
    [prompt, payloadJson, tile]
  );

  useEffect(() => {
    if (!open) {
      setPasteText('');
      setUploadedFileName(null);
      setParsedTile(null);
      setSummary(null);
      setError(null);
      setNotice(null);
      setBusy(null);
    }
  }, [open, tile.id]);

  useEscapeToClose(open, onClose);

  const flash = (message: string) => {
    setNotice(message);
    setError(null);
    window.setTimeout(() => setNotice(null), 2500);
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${label} copied to clipboard.`);
    } catch {
      setError(`Could not copy ${label.toLowerCase()}. Download it instead.`);
    }
  };

  const parseResponse = useCallback(
    (raw: string, sourceLabel: string) => {
      setError(null);
      setNotice(null);
      try {
        const analyzed = parseLlmSpaceJson(raw);
        if (!analyzed.title) {
          throw new Error('Parsed space is missing a title.');
        }
        setParsedTile(analyzed);
        setSummary(summarizeAnalyzedTile(tile, analyzed));
        flash(`${sourceLabel} validated.`);
      } catch (e) {
        setParsedTile(null);
        setSummary(null);
        setError(e instanceof Error ? e.message : 'Failed to parse JSON.');
      }
    },
    [tile]
  );

  const handleParse = useCallback(() => {
    parseResponse(pasteText, 'JSON');
  }, [parseResponse, pasteText]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setUploadedFileName(file.name);
      setPasteText('');
      setParsedTile(null);
      setSummary(null);
      setError(null);
      setNotice(null);
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        if (!text.trim()) {
          setError('The selected file is empty.');
          return;
        }
        parseResponse(text, file.name);
      };
      reader.onerror = () => {
        setError('Could not read the selected file.');
      };
      reader.readAsText(file);
    },
    [parseResponse]
  );

  const handleApply = async () => {
    if (!parsedTile) return;
    setBusy('apply');
    setError(null);
    try {
      const merged = mergeAnalyzedTile(tile, parsedTile);
      await saveTile(merged, true);
      await onApplied(merged);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply space.');
    } finally {
      setBusy(null);
    }
  };

  const handleImportNew = async () => {
    if (!parsedTile) return;
    setBusy('import');
    setError(null);
    try {
      const [normalized] = normalizeImportedTiles({
        type: 'tile',
        tiles: [{ ...parsedTile, group: parsedTile.group || tile.group || 'Imported' }],
      });
      if (!normalized) {
        throw new Error('Could not normalize the imported space.');
      }
      const created = await createTile({
        ...normalized,
        title: normalized.title?.endsWith('(AI)') ? normalized.title : `${normalized.title} (AI)`,
        group: tile.group || normalized.group,
        sourceTab: tile.sourceTab === 'staging' ? 'staging' : 'public',
      });
      await onImported(created);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import as a new space.');
    } finally {
      setBusy(null);
    }
  };

  if (!open || !isReady) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10080]" role="presentation">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="space-ai-analysis-title"
        className={`absolute flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden ${
          isDragging || isResizing ? 'will-change-transform' : ''
        }`}
        style={{
          left: modalPosition.x,
          top: modalPosition.y,
          width: modalSize.width,
          height: modalSize.height,
          transition: isDragging || isResizing ? 'none' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onMouseDown={handleDragStart}
          className={`px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3 shrink-0 select-none cursor-move bg-slate-50/80 dark:bg-slate-900/90 ${
            isDragging ? 'cursor-grabbing' : ''
          }`}
        >
          <div className="min-w-0 flex-1">
            <h2 id="space-ai-analysis-title" className="text-lg font-bold text-slate-900 dark:text-white">
              AI space analysis
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Send the prompt and space JSON to an LLM. It should return a downloadable{' '}
              <code className="font-mono text-xs">{outputFile}</code> file — upload that here (no need to paste huge JSON).
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 uppercase tracking-wide font-semibold">
              Drag header to move · corner to resize
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              1. Send to an LLM
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyText(combined, 'Prompt + JSON')}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-brand-600 hover:bg-brand-500 text-white"
              >
                Copy prompt + JSON
              </button>
              <button
                type="button"
                onClick={() => void copyText(prompt, 'Prompt')}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100"
              >
                Copy prompt
              </button>
              <button
                type="button"
                onClick={() => void copyText(payloadJson, 'JSON')}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100"
              >
                Copy JSON
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(prompt, spaceAnalysisFilename(tile, 'txt'), 'text/plain;charset=utf-8')
                }
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Download prompt
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(payloadJson, spaceAnalysisFilename(tile, 'json'), 'application/json;charset=utf-8')
                }
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Download JSON
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Prefer <strong>Download JSON</strong> and attach it to the LLM (ChatGPT, Claude, etc.) instead of pasting
              large payloads. Ask the model to save the optimized result as{' '}
              <code className="font-mono">{outputFile}</code> — not inline chat text.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              2. Upload LLM JSON file
            </h3>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-brand-600 hover:bg-brand-500 text-white"
              >
                Choose JSON file…
              </button>
              {uploadedFileName ? (
                <span className="text-sm text-slate-600 dark:text-slate-300 truncate max-w-full">
                  {uploadedFileName}
                </span>
              ) : (
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Expected: <code className="font-mono text-xs">{outputFile}</code>
                </span>
              )}
            </div>

            <details className="mt-4 group">
              <summary className="text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200">
                Or paste JSON manually (small spaces only)
              </summary>
              <textarea
                value={pasteText}
                onChange={(e) => {
                  setPasteText(e.target.value);
                  setUploadedFileName(null);
                  setParsedTile(null);
                  setSummary(null);
                }}
                spellCheck={false}
                placeholder='{ "version": "1.3", "type": "tile", "tile": { ... } }'
                className="mt-2 w-full h-32 font-mono text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={handleParse}
                disabled={!pasteText.trim()}
                className="mt-2 px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 disabled:opacity-50"
              >
                Validate pasted JSON
              </button>
            </details>
          </section>

          {summary && parsedTile && (
            <section className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-4">
              <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-100 mb-2">
                Ready to import {summary.spaceEmoji} {parsedTile.title}
              </h3>
              <ul className="text-sm text-emerald-800 dark:text-emerald-200 space-y-1">
                <li>
                  Links: {summary.originalLinkCount} → {summary.analyzedLinkCount}
                  {summary.analyzedLinkCount < summary.originalLinkCount
                    ? ` (${summary.originalLinkCount - summary.analyzedLinkCount} removed)`
                    : ''}
                </li>
                <li>
                  Tabs: {summary.originalTabCount} → {summary.analyzedTabCount} ({summary.tabsWithEmoji} with emoji)
                </li>
                <li>
                  Emojis added: {summary.sectionsWithEmoji} sections, {summary.linksWithIcon} links
                </li>
              </ul>
            </section>
          )}

          {notice && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>
          )}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex flex-wrap justify-end gap-2 shrink-0 bg-slate-50 dark:bg-slate-900/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleImportNew()}
            disabled={!parsedTile || busy !== null}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 disabled:opacity-50"
          >
            {busy === 'import' ? 'Importing…' : 'Import as new space'}
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={!parsedTile || busy !== null}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
          >
            {busy === 'apply' ? 'Applying…' : 'Apply to this space'}
          </button>
        </div>

        <div
          onMouseDown={handleResizeStart}
          className={`absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize flex items-end justify-end p-0.5 rounded-br-2xl z-10 ${
            isResizing ? 'bg-brand-500/20' : 'hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
          }`}
          title="Resize"
          aria-label="Resize dialog"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" className="text-slate-400 dark:text-slate-500" aria-hidden>
            <path
              d="M10 2L2 10M10 6L6 10M10 10L10 10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
      </div>
    </div>,
    document.body
  );
};
