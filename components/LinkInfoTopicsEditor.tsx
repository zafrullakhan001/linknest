import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SelectableRichTextEditor } from './SelectableRichTextEditor';
import { MobileRichTextEditor } from './MobileRichTextEditor';
import {
  createEmptyInfoTopic,
  demoInfoTopics,
  demoMaintenanceTopics,
  demoNotesTopics,
  isLinkInfoTopicVisible,
  linkContentTopicKindMeta,
  linkInfoTopicsToRichTextHtml,
  normalizeLinkContentTopics,
  type LinkContentTopicKind,
  type LinkInfoTopic,
} from '../utils/linkInfoTopics';
import { resolveApiBase } from '../services/apiHelpers';
import { hasVisibleRichText, prepareViewerHtml } from '../utils/richTextDisplay';

export type LinkInfoRevision = {
  id: number;
  linkId: string;
  topics: LinkInfoTopic[];
  createdAt: number;
  userId: number | null;
  username: string;
  topicCount: number;
  titles: string[];
};

type Props = {
  topics: LinkInfoTopic[];
  onChange: (topics: LinkInfoTopic[]) => void;
  plain?: boolean;
  /** Content kind — drives history endpoint, default titles, and demo fill. */
  kind?: LinkContentTopicKind;
  /** When set with linkId, shows History that loads prior topic sets into the draft. */
  tileId?: string;
  linkId?: string;
  /** Use the compact mobile rich-text editor on the right pane. */
  mobile?: boolean;
  /** Accent color for selected topic / restore button. */
  accent?: 'violet' | 'amber' | 'sky';
};

async function fetchContentRevisions(
  tileId: string,
  linkId: string,
  kind: LinkContentTopicKind
): Promise<LinkInfoRevision[]> {
  const path = linkContentTopicKindMeta(kind).historyPath;
  const apiBase = resolveApiBase().replace(/\/$/, '');
  const res = await fetch(
    `${apiBase}/tiles/${encodeURIComponent(tileId)}/links/${encodeURIComponent(linkId)}/${path}`,
    { credentials: 'include' }
  );
  const raw = await res.text();
  let data: { error?: string; revisions?: LinkInfoRevision[] } = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      res.ok
        ? 'History response was not JSON (check API base path / routing).'
        : `Failed to load history (HTTP ${res.status})`
    );
  }
  if (!res.ok) {
    throw new Error(data.error || `Failed to load history (HTTP ${res.status})`);
  }
  return Array.isArray(data.revisions) ? data.revisions : [];
}

function formatWhen(ts: number): string {
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return String(ts);
  }
}

function accentClasses(accent: 'violet' | 'amber' | 'sky', plain: boolean) {
  if (plain) {
    return {
      border: 'border-slate-300 dark:border-slate-600',
      selected: 'bg-slate-700 text-white',
      history:
        'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800',
      restore: 'bg-slate-600 hover:bg-slate-500',
      add: 'text-slate-700 dark:text-slate-300',
      focus: 'focus:border-slate-500 focus:ring-slate-500/40',
    };
  }
  if (accent === 'amber') {
    return {
      border: 'border-amber-200 dark:border-amber-800/50',
      selected: 'bg-amber-500 text-white',
      history:
        'border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/40',
      restore: 'bg-amber-500 hover:bg-amber-600',
      add: 'text-amber-700 dark:text-amber-300',
      focus: 'focus:border-amber-500 focus:ring-amber-500/40',
    };
  }
  if (accent === 'sky') {
    return {
      border: 'border-sky-200 dark:border-sky-800/50',
      selected: 'bg-sky-600 text-white',
      history:
        'border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-200 hover:bg-sky-50 dark:hover:bg-sky-950/40',
      restore: 'bg-sky-600 hover:bg-sky-500',
      add: 'text-sky-700 dark:text-sky-300',
      focus: 'focus:border-sky-500 focus:ring-sky-500/40',
    };
  }
  return {
    border: 'border-violet-200 dark:border-violet-800/50',
    selected: 'bg-violet-600 text-white',
    history:
      'border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-200 hover:bg-violet-50 dark:hover:bg-violet-950/40',
    restore: 'bg-violet-600 hover:bg-violet-500',
    add: 'text-violet-700 dark:text-violet-300',
    focus: 'focus:border-violet-500 focus:ring-violet-500/40',
  };
}

export const LinkInfoTopicsEditor: React.FC<Props> = ({
  topics,
  onChange,
  plain = false,
  kind = 'info',
  tileId,
  linkId,
  mobile = false,
  accent = kind === 'notes' ? 'amber' : kind === 'maintenance' ? 'amber' : 'violet',
}) => {
  const meta = linkContentTopicKindMeta(kind);
  const list = useMemo(() => normalizeLinkContentTopics(kind, topics), [kind, topics]);
  const [selectedId, setSelectedId] = useState<string>(() => list[0]?.id || '');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<LinkInfoRevision[]>([]);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const colors = accentClasses(accent, plain);

  useEffect(() => {
    if (!list.length) {
      setSelectedId('');
      return;
    }
    if (!list.some((t) => t.id === selectedId)) {
      setSelectedId(list[0].id);
    }
  }, [list, selectedId]);

  const selected = list.find((t) => t.id === selectedId) || list[0] || null;
  const selectedIndex = selected ? list.findIndex((t) => t.id === selected.id) : -1;

  const commit = useCallback(
    (next: LinkInfoTopic[]) => {
      onChange(next);
    },
    [onChange]
  );

  const updateSelected = (patch: Partial<LinkInfoTopic>) => {
    if (!selected) return;
    commit(list.map((t) => (t.id === selected.id ? { ...t, ...patch } : t)));
  };

  const addTopic = () => {
    const topic = createEmptyInfoTopic(`Topic ${list.length + 1}`, meta.idPrefix);
    commit([...list, topic]);
    setSelectedId(topic.id);
  };

  const removeSelected = () => {
    if (!selected || list.length <= 1) {
      commit([]);
      setSelectedId('');
      return;
    }
    const next = list.filter((t) => t.id !== selected.id);
    commit(next);
    setSelectedId(next[0]?.id || '');
  };

  const moveSelected = (dir: -1 | 1) => {
    if (selectedIndex < 0) return;
    const target = selectedIndex + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    const [item] = next.splice(selectedIndex, 1);
    next.splice(target, 0, item);
    commit(next);
  };

  const openHistory = async () => {
    if (!tileId || !linkId) return;
    setHistoryOpen(true);
    setPreviewId(null);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setRevisions(await fetchContentRevisions(tileId, linkId, kind));
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Failed to load history');
      setRevisions([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const restoreRevision = (rev: LinkInfoRevision) => {
    const restored = normalizeLinkContentTopics(kind, rev.topics);
    commit(restored);
    setSelectedId(restored[0]?.id || '');
    setPreviewId(null);
    setHistoryOpen(false);
  };

  const previewRevision = revisions.find((rev) => rev.id === previewId) || null;
  const previewTopics = previewRevision
    ? normalizeLinkContentTopics(kind, previewRevision.topics)
    : [];

  const idleBtn = 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800';
  const help =
    kind === 'notes'
      ? 'Add note topics on the left. Select one to edit on the right. Hide a topic to keep it in the draft without showing viewers. Tooltip stays separate below.'
      : kind === 'maintenance'
        ? 'Add maintenance topics on the left. Select one to edit on the right. Hide a topic to keep it without showing viewers.'
        : 'Add topics on the left. Select one to edit on the right. Hide a topic to keep it in the draft without showing viewers.';

  const toggleSelectedVisibility = () => {
    if (!selected) return;
    updateSelected({ hidden: isLinkInfoTopicVisible(selected) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-slate-500 dark:text-slate-400 min-w-0 flex-1">{help}</p>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {tileId && linkId ? (
            <button
              type="button"
              onClick={openHistory}
              className={`px-3 py-1 text-xs rounded-lg font-medium border transition-colors ${colors.history}`}
            >
              History
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              const demo =
                kind === 'notes' ? demoNotesTopics() : kind === 'maintenance' ? demoMaintenanceTopics() : demoInfoTopics();
              commit(demo);
              setSelectedId(demo[0].id);
            }}
            className={`px-3 py-1 text-xs text-white rounded-lg font-medium transition-colors ${
              plain ? 'bg-slate-600 hover:bg-slate-500' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            Demo Fill
          </button>
        </div>
      </div>

      <div className={`flex flex-col sm:flex-row gap-3 rounded-xl border-2 ${colors.border} bg-slate-50/80 dark:bg-slate-900/40 p-2 min-h-[220px]`}>
        <div className="sm:w-44 shrink-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1 px-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Topics</span>
            <button
              type="button"
              onClick={addTopic}
              className={`text-[11px] font-medium hover:underline ${colors.add}`}
              title="Add topic"
            >
              + Add
            </button>
          </div>
          <div className="flex sm:flex-col gap-1 overflow-x-auto sm:overflow-y-auto sm:max-h-[280px]">
            {list.length === 0 ? (
              <button
                type="button"
                onClick={addTopic}
                className="text-left text-xs px-2.5 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-500"
              >
                No topics yet — click to add
              </button>
            ) : (
              list.map((t) => {
                const shown = isLinkInfoTopicVisible(t);
                const active = t.id === selected?.id;
                return (
                  <div
                    key={t.id}
                    className={`flex items-stretch gap-0.5 rounded-lg shrink-0 sm:shrink ${
                      active ? colors.selected : idleBtn
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={`flex-1 min-w-0 text-left text-xs px-2.5 py-2 font-medium truncate rounded-l-lg ${
                        !shown ? 'opacity-60' : ''
                      }`}
                      title={shown ? t.title : `${t.title || 'Untitled'} (hidden)`}
                    >
                      <span className={!shown ? 'opacity-80' : undefined}>{t.title || 'Untitled'}</span>
                      {!shown ? <span className="ml-1 font-normal opacity-80">· hidden</span> : null}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(t.id);
                        commit(list.map((item) => (item.id === t.id ? { ...item, hidden: shown } : item)));
                      }}
                      className={`px-2 text-[11px] font-semibold rounded-r-lg border-l ${
                        active
                          ? 'border-white/25 hover:bg-black/10'
                          : 'border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                      title={shown ? 'Hide from viewers' : 'Show to viewers'}
                      aria-label={shown ? 'Hide topic' : 'Show topic'}
                      aria-pressed={!shown}
                    >
                      {shown ? 'Hide' : 'Show'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {selected ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={selected.title}
                  onChange={(e) => updateSelected({ title: e.target.value })}
                  placeholder="Topic title"
                  className={`flex-1 min-w-[140px] bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${colors.focus}`}
                />
                <button
                  type="button"
                  onClick={toggleSelectedVisibility}
                  className={`px-2 py-1.5 text-xs rounded-lg border font-medium ${
                    isLinkInfoTopicVisible(selected)
                      ? 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                      : 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
                  }`}
                  title={isLinkInfoTopicVisible(selected) ? 'Hide this topic from viewers' : 'Show this topic to viewers'}
                  aria-pressed={!isLinkInfoTopicVisible(selected)}
                >
                  {isLinkInfoTopicVisible(selected) ? 'Visible' : 'Hidden'}
                </button>
                <button
                  type="button"
                  onClick={() => moveSelected(-1)}
                  disabled={selectedIndex <= 0}
                  className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-40"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveSelected(1)}
                  disabled={selectedIndex < 0 || selectedIndex >= list.length - 1}
                  className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-40"
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={removeSelected}
                  className="px-2 py-1.5 text-xs rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300"
                  title="Delete topic"
                >
                  Delete
                </button>
              </div>
              {!isLinkInfoTopicVisible(selected) ? (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Hidden from viewers. It stays in this editor until you show it again or delete it.
                </p>
              ) : null}
              {mobile ? (
                <MobileRichTextEditor
                  value={selected.html}
                  onChange={(html) => updateSelected({ html })}
                  placeholder={`Enter ${meta.defaultTitle.toLowerCase()} for this topic...`}
                />
              ) : (
                <SelectableRichTextEditor
                  value={selected.html}
                  onChange={(html) => updateSelected({ html })}
                  placeholder={`Enter ${meta.defaultTitle.toLowerCase()} for this topic...`}
                  className="min-h-[200px]"
                />
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-sm text-slate-500">
              Add a topic to start editing.
            </div>
          )}
        </div>
      </div>

      {historyOpen ? (
        <div className="rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{meta.defaultTitle} history</div>
            <button
              type="button"
              onClick={() => {
                setPreviewId(null);
                setHistoryOpen(false);
              }}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Close
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Preview a saved version, then restore it into this draft. Save the link to keep it.
          </p>
          {historyLoading ? (
            <div className="text-xs text-slate-500 py-2">Loading…</div>
          ) : historyError ? (
            <div className="text-xs text-rose-600 py-2">{historyError}</div>
          ) : revisions.length === 0 ? (
            <div className="text-xs text-slate-500 py-2">No previous versions yet. History appears after you change and save topics.</div>
          ) : (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {revisions.map((rev) => {
                const open = previewId === rev.id;
                return (
                  <li
                    key={rev.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 ${
                      open
                        ? 'border-slate-400 dark:border-slate-500 bg-slate-50 dark:bg-slate-800/60'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate">
                        {formatWhen(rev.createdAt)} · {rev.username}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {rev.topicCount} topic{rev.topicCount === 1 ? '' : 's'}: {(rev.titles || []).join(', ') || '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewId(open ? null : rev.id)}
                        aria-expanded={open}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${colors.history} ${
                          open ? 'bg-slate-100 dark:bg-slate-800' : 'bg-white dark:bg-slate-900'
                        }`}
                      >
                        {open ? 'Hide' : 'Preview'}
                      </button>
                      <button
                        type="button"
                        onClick={() => restoreRevision(rev)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg text-white ${colors.restore}`}
                      >
                        Restore
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {previewRevision ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Preview · {formatWhen(previewRevision.createdAt)}
                </div>
                <button
                  type="button"
                  onClick={() => restoreRevision(previewRevision)}
                  className={`shrink-0 px-2.5 py-1 text-xs font-medium rounded-lg text-white ${colors.restore}`}
                >
                  Restore this version
                </button>
              </div>
              {previewTopics.length === 0 ? (
                <p className="text-xs text-slate-500">This version has no topics.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {previewTopics.map((topic) => {
                    const shown = isLinkInfoTopicVisible(topic);
                    return (
                      <div
                        key={topic.id}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5"
                      >
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5">
                          {topic.title || 'Untitled'}
                          {!shown ? (
                            <span className="ml-1.5 font-normal text-amber-700 dark:text-amber-300">· hidden</span>
                          ) : null}
                        </div>
                        {hasVisibleRichText(topic.html) ? (
                          <div
                            className="ln-tinymce-content text-sm text-slate-700 dark:text-slate-200"
                            dangerouslySetInnerHTML={{ __html: prepareViewerHtml(topic.html) }}
                          />
                        ) : (
                          <p className="text-xs text-slate-400">Empty</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <span className="sr-only" aria-hidden>
        {linkInfoTopicsToRichTextHtml(list, meta.defaultTitle)}
      </span>
    </div>
  );
};

export default LinkInfoTopicsEditor;
