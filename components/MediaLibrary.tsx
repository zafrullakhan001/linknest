import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { MediaFile, MediaFolder, MediaKind, MediaStatus } from '../types';
import {
  createMediaFolder,
  deleteMediaFolder,
  formatMediaSize,
  listMediaFiles,
  listMediaFolders,
  listMediaTags,
  purgeAllMediaTrash,
  purgeMediaFiles,
  trashMediaFile,
  updateMediaFile,
  updateMediaFolder,
  uploadMediaFiles,
  batchTransformMediaFiles,
  batchTrashMediaFiles,
} from '../services/mediaService';
import type { MediaTransformOptions } from '../types';
import { MediaImageEditor } from './MediaImageEditor';

export type MediaLibraryMode = 'manage' | 'picker';

interface MediaLibraryProps {
  mode?: MediaLibraryMode;
  onClose?: () => void;
  /** Picker mode: called when user selects a file to insert */
  onSelect?: (file: MediaFile) => void;
  /** Compact height for floating widget / modal */
  compact?: boolean;
  className?: string;
}

type ViewFilter = 'all' | MediaKind | 'archived' | 'trash';

const KIND_LABELS: Record<string, string> = {
  all: 'All',
  image: 'Images',
  pdf: 'Documents',
  audio: 'Audio',
  video: 'Video',
  archived: 'Archived',
  trash: 'Trash',
};

function kindIcon(kind: MediaKind): string {
  switch (kind) {
    case 'image':
      return '🖼️';
    case 'pdf':
      return '📄';
    case 'audio':
      return '🎵';
    case 'video':
      return '🎬';
    default:
      return '📎';
  }
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
  mode = 'manage',
  onClose,
  onSelect,
  compact = false,
  className = '',
}) => {
  const { user } = useAuth();
  const isAdmin = !!(user?.is_admin);
  // Admins manage in admin tab / floating widget; picker stays read-only for non-admins
  const canManage = isAdmin && mode !== 'picker';
  const canUpload = isAdmin;

  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState<ViewFilter>('all');
  const [q, setQ] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [grid, setGrid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaFile | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingImage, setEditingImage] = useState<MediaFile | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [detailTitle, setDetailTitle] = useState('');
  const [detailAlt, setDetailAlt] = useState('');
  const [detailTags, setDetailTags] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const statusForView = useMemo((): MediaStatus | 'all' => {
    if (view === 'archived') return 'archived';
    if (view === 'trash') return 'trash';
    return 'active';
  }, [view]);

  const kindForView = useMemo((): MediaKind | '' => {
    if (view === 'image' || view === 'pdf' || view === 'audio' || view === 'video') return view;
    return '';
  }, [view]);

  const loadFolders = useCallback(async () => {
    try {
      const list = await listMediaFolders();
      setFolders(list);
      if (folderId == null && list.length > 0) {
        const root = list.find((f) => f.parentId == null) || list[0];
        setFolderId(root.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folders');
    }
  }, [folderId]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMediaFiles({
        q: q.trim() || undefined,
        folderId: statusForView === 'trash' ? undefined : folderId,
        kind: kindForView || undefined,
        status: statusForView,
        tag: tagFilter || undefined,
        perPage: 96,
      });
      setFiles(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media');
    } finally {
      setLoading(false);
    }
  }, [q, folderId, kindForView, statusForView, tagFilter]);

  const loadTags = useCallback(async () => {
    try {
      const list = await listMediaTags();
      setTags(list.map((t) => t.name));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadFolders();
    loadTags();
  }, [loadFolders, loadTags]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (selected) {
      setDetailTitle(selected.title || '');
      setDetailAlt(selected.altText || '');
      setDetailTags((selected.tags || []).join(', '));
    }
  }, [selected]);

  const childFolders = useMemo(
    () => folders.filter((f) => f.parentId === folderId),
    [folders, folderId]
  );

  const handleUpload = async (fileList: FileList | File[]) => {
    if (!canUpload) return;
    const arr = Array.from(fileList);
    if (!arr.length) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadMediaFiles(arr, { folderId });
      if (result.errors?.length) {
        setError(result.errors.map((e) => `${e.name}: ${e.error}`).join('; '));
      }
      await loadFiles();
      await loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!canUpload) return;
    if (e.dataTransfer.files?.length) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !canManage) return;
    try {
      await createMediaFolder(name, folderId);
      setNewFolderName('');
      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create folder');
    }
  };

  const handleRenameFolder = async (f: MediaFolder) => {
    if (!canManage) return;
    const name = window.prompt('Rename folder', f.name);
    if (!name || name.trim() === f.name) return;
    try {
      await updateMediaFolder(f.id, { name: name.trim() });
      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const handleDeleteFolder = async (f: MediaFolder) => {
    if (!canManage) return;
    if (!window.confirm(`Delete folder "${f.name}"?`)) return;
    try {
      await deleteMediaFolder(f.id);
      if (folderId === f.id) {
        const root = folders.find((x) => x.parentId == null);
        setFolderId(root?.id ?? null);
      }
      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete folder failed');
    }
  };

  const saveDetail = async () => {
    if (!selected || !canManage) return;
    try {
      const tagsList = detailTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const updated = await updateMediaFile(selected.id, {
        title: detailTitle,
        altText: detailAlt,
        tags: tagsList,
      });
      setSelected(updated);
      await loadFiles();
      await loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const setStatus = async (file: MediaFile, status: MediaStatus) => {
    if (!canManage) return;
    try {
      const updated = await updateMediaFile(file.id, { status });
      setSelected(updated.status === 'trash' && view !== 'trash' ? null : updated);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleTrash = async (file: MediaFile) => {
    if (!canManage) return;
    try {
      await trashMediaFile(file.id);
      if (selected?.id === file.id) setSelected(null);
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trash failed');
    }
  };

  const handlePurgeSelected = async () => {
    if (!canManage) return;
    const ids: number[] = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Permanently delete ${ids.length} file(s)?`)) return;
    try {
      await purgeMediaFiles(ids);
      setSelectedIds(new Set());
      setSelected(null);
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purge failed');
    }
  };

  const handleEmptyTrash = async () => {
    if (!canManage) return;
    if (!window.confirm('Empty trash permanently?')) return;
    try {
      await purgeAllMediaTrash();
      setSelected(null);
      setSelectedIds(new Set());
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Empty trash failed');
    }
  };

  const selectAllInView = () => {
    setSelectedIds(new Set(files.map((f) => f.id)));
  };

  const selectAllImagesInView = () => {
    setSelectedIds(new Set(files.filter((f) => f.kind === 'image').map((f) => f.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedImageIds = useMemo(
    () => files.filter((f) => selectedIds.has(f.id) && f.kind === 'image').map((f) => f.id),
    [files, selectedIds]
  );

  const runBulkTransform = async (options: MediaTransformOptions, label: string) => {
    if (!canManage || selectedImageIds.length === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const result = await batchTransformMediaFiles(selectedImageIds, options);
      if (result.errors?.length) {
        setError(
          `${label}: ${result.transformed} ok, ${result.errors.length} failed — ` +
            result.errors.map((e) => `#${e.id}: ${e.error}`).join('; ')
        );
      } else if (!result.transformed) {
        setError(`${label} did not change any files`);
      }
      if (result.transformed > 0) {
        clearSelection();
        setSelected(null);
        await loadFiles();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleTrashSelected = async () => {
    if (!canManage) return;
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Move ${ids.length} selected file(s) to trash?`)) return;
    setBulkBusy(true);
    setError(null);
    try {
      await batchTrashMediaFiles(ids);
      clearSelection();
      setSelected(null);
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trash selected failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const copyUrl = async (file: MediaFile) => {
    if (!file.url) return;
    try {
      await navigator.clipboard.writeText(file.url);
    } catch {
      window.prompt('Copy URL', file.url);
    }
  };

  const currentFolder = folders.find((f) => f.id === folderId);
  const parentFolder = currentFolder?.parentId != null ? folders.find((f) => f.id === currentFolder.parentId) : null;

  const heightClass = compact ? 'h-full min-h-[360px]' : 'min-h-[520px] h-[min(70vh,720px)]';

  return (
    <div className={`flex flex-col bg-white dark:bg-slate-800 rounded-xl border border-sky-200/70 dark:border-sky-800/40 overflow-hidden ${heightClass} ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-800/40">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">📁</span>
          <h2 className="font-bold text-slate-900 dark:text-white truncate">Media Library</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">{total} files</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,audio/*,video/mp4,video/webm,video/ogg,.mov,.mp3,.wav,.m4a"
                className="hidden"
                onChange={(e) => e.target.files && handleUpload(e.target.files)}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </>
          )}
          {onClose && (
            <button type="button" onClick={onClose} className="px-2 py-1 text-slate-500 hover:text-slate-800 dark:hover:text-white text-lg leading-none" title="Close">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        {(Object.keys(KIND_LABELS) as ViewFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              view === key
                ? 'bg-sky-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            {KIND_LABELS[key]}
          </button>
        ))}
        <input
          type="search"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="ml-auto flex-1 min-w-[120px] max-w-[220px] text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-2 py-1"
        />
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-2 py-1"
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setGrid((g) => !g)}
          className="text-xs px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600"
          title={grid ? 'List view' : 'Grid view'}
        >
          {grid ? '☰' : '▦'}
        </button>
      </div>

      {/* Bulk actions */}
      {canManage && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 text-xs">
          <button
            type="button"
            onClick={selectAllInView}
            className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-800"
            title="Select all files in this folder/view"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={selectAllImagesInView}
            className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-800"
            title="Select all images in this folder/view"
          >
            Select images
          </button>
          {selectedIds.size > 0 && (
            <>
              <button
                type="button"
                onClick={clearSelection}
                className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-800"
              >
                Clear ({selectedIds.size})
              </button>
              {view !== 'trash' && (
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={handleTrashSelected}
                  className="px-2 py-0.5 rounded border border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                >
                  Trash selected
                </button>
              )}
              {selectedImageIds.length > 0 && view !== 'trash' && (
                <>
                  <span className="text-slate-400 mx-0.5">|</span>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => runBulkTransform({ rotate: 270, replace: true }, 'Rotate left')}
                    className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-50"
                    title="Rotate selected images 90° left"
                  >
                    ↺ Rotate L
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => runBulkTransform({ rotate: 90, replace: true }, 'Rotate right')}
                    className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-50"
                    title="Rotate selected images 90° right"
                  >
                    ↻ Rotate R
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() =>
                      runBulkTransform(
                        { format: 'jpg', quality: 72, width: 1920, height: 1920, replace: true },
                        'Compress'
                      )
                    }
                    className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-50"
                    title="Compress: max 1920px, JPEG quality 72 (replaces file)"
                  >
                    Compress
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => runBulkTransform({ format: 'jpg', quality: 82, replace: true }, 'Convert JPG')}
                    className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-50"
                    title="Convert selected images to JPEG"
                  >
                    To JPG
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() =>
                      runBulkTransform({ removeBackground: true, format: 'png', replace: true }, 'Remove background')
                    }
                    className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 disabled:opacity-50"
                    title="Remove background color (corner sample → transparent PNG)"
                  >
                    Remove BG
                  </button>
                </>
              )}
              {bulkBusy && <span className="text-sky-600 dark:text-sky-400 ml-1">Working…</span>}
            </>
          )}
        </div>
      )}

      {error && (
        <div className="px-3 py-1.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Folders */}
        {view !== 'trash' && view !== 'archived' && (
          <aside className="w-40 shrink-0 border-r border-slate-200 dark:border-slate-700 overflow-y-auto p-2 text-xs">
            {parentFolder && (
              <button
                type="button"
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 mb-1"
                onClick={() => setFolderId(parentFolder.id)}
              >
                ← Up
              </button>
            )}
            <div className="font-semibold text-slate-700 dark:text-slate-200 px-2 py-1 truncate" title={currentFolder?.name}>
              {currentFolder?.name || 'Library'}
            </div>
            {childFolders.map((f) => (
              <div key={f.id} className="group flex items-center gap-0.5">
                <button
                  type="button"
                  className="flex-1 text-left px-2 py-1 rounded hover:bg-sky-50 dark:hover:bg-sky-950/40 truncate"
                  onClick={() => setFolderId(f.id)}
                  onDoubleClick={() => canManage && handleRenameFolder(f)}
                >
                  📂 {f.name}
                </button>
                {canManage && (
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 text-red-500 px-1"
                    title="Delete folder"
                    onClick={() => handleDeleteFolder(f)}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {canManage && (
              <div className="mt-2 flex gap-1">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder"
                  className="flex-1 min-w-0 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-1 py-0.5"
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                />
                <button type="button" onClick={handleCreateFolder} className="text-sky-600 font-bold px-1">
                  +
                </button>
              </div>
            )}
          </aside>
        )}

        {/* Files */}
        <div
          ref={dropRef}
          className="flex-1 overflow-y-auto p-2"
          onDragOver={(e) => {
            if (canUpload) e.preventDefault();
          }}
          onDrop={onDrop}
        >
          {view === 'trash' && canManage && (
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={handlePurgeSelected}
                disabled={!selectedIds.size}
                className="text-xs px-2 py-1 rounded bg-red-600 text-white disabled:opacity-40"
              >
                Purge selected
              </button>
              <button type="button" onClick={handleEmptyTrash} className="text-xs px-2 py-1 rounded border border-red-400 text-red-600">
                Empty trash
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-slate-500 p-4">Loading…</p>
          ) : files.length === 0 ? (
            <p className="text-sm text-slate-500 p-4 text-center">
              {canUpload ? 'No files yet. Upload or drag files here.' : 'No files in this view.'}
            </p>
          ) : grid ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {files.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => {
                    setSelected(file);
                    if (mode === 'picker' && onSelect && file.status === 'active') {
                      // single-click selects for detail; double-click inserts — use Insert button
                    }
                  }}
                  onDoubleClick={() => {
                    if (mode === 'picker' && onSelect && file.status === 'active') onSelect(file);
                  }}
                  className={`relative text-left rounded-lg border p-1.5 hover:border-sky-400 transition-colors ${
                    selected?.id === file.id
                      ? 'border-sky-500 ring-1 ring-sky-400'
                      : 'border-slate-200 dark:border-slate-600'
                  }`}
                >
                  {canManage && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(file.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(file.id);
                          else next.delete(file.id);
                          return next;
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-1 left-1 z-10"
                      aria-label={`Select ${file.title || file.originalName}`}
                    />
                  )}
                  <div className="aspect-square bg-slate-100 dark:bg-slate-900 rounded flex items-center justify-center overflow-hidden mb-1">
                    {file.kind === 'image' && (file.thumbUrl || file.url) ? (
                      <img src={file.thumbUrl || file.url || ''} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">{kindIcon(file.kind)}</span>
                    )}
                  </div>
                  <div className="text-[11px] truncate text-slate-800 dark:text-slate-200" title={file.originalName}>
                    {file.title || file.originalName}
                  </div>
                  <div className="text-[10px] text-slate-500">{formatMediaSize(file.sizeBytes)}</div>
                </button>
              ))}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  {canManage && <th className="w-6" />}
                  <th className="py-1">Name</th>
                  <th>Kind</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr
                    key={file.id}
                    className={`cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-950/30 ${
                      selected?.id === file.id ? 'bg-sky-50 dark:bg-sky-950/40' : ''
                    }`}
                    onClick={() => setSelected(file)}
                    onDoubleClick={() => {
                      if (mode === 'picker' && onSelect && file.status === 'active') onSelect(file);
                    }}
                  >
                    {canManage && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(file.id)}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(file.id);
                              else next.delete(file.id);
                              return next;
                            });
                          }}
                          aria-label={`Select ${file.title || file.originalName}`}
                        />
                      </td>
                    )}
                    <td className="py-1.5 truncate max-w-[180px]">{file.title || file.originalName}</td>
                    <td>{file.kind}</td>
                    <td>{formatMediaSize(file.sizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail */}
        {selected && (
          <aside className="w-52 shrink-0 border-l border-slate-200 dark:border-slate-700 overflow-y-auto p-2 text-xs space-y-2">
            <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-2 flex items-center justify-center min-h-[100px]">
              {selected.kind === 'image' && selected.url ? (
                <img src={selected.thumbUrl || selected.url} alt="" className="max-h-28 max-w-full object-contain" />
              ) : selected.kind === 'video' && selected.url ? (
                <video src={selected.url} className="max-h-28 max-w-full" controls />
              ) : selected.kind === 'audio' && selected.url ? (
                <audio src={selected.url} controls className="w-full" />
              ) : (
                <span className="text-3xl">{kindIcon(selected.kind)}</span>
              )}
            </div>
            <div className="font-semibold text-slate-800 dark:text-slate-100 break-words">{selected.originalName}</div>
            <div className="text-slate-500">
              {selected.kind} · {formatMediaSize(selected.sizeBytes)}
              {selected.width && selected.height ? ` · ${selected.width}×${selected.height}` : ''}
            </div>

            {canManage && selected.status !== 'trash' && (
              <>
                <label className="block">
                  Title
                  <input
                    value={detailTitle}
                    onChange={(e) => setDetailTitle(e.target.value)}
                    className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-1.5 py-1"
                  />
                </label>
                <label className="block">
                  Alt text
                  <input
                    value={detailAlt}
                    onChange={(e) => setDetailAlt(e.target.value)}
                    className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-1.5 py-1"
                  />
                </label>
                <label className="block">
                  Tags (comma-separated)
                  <input
                    value={detailTags}
                    onChange={(e) => setDetailTags(e.target.value)}
                    className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-1.5 py-1"
                  />
                </label>
                <button type="button" onClick={saveDetail} className="w-full py-1 rounded bg-sky-600 text-white font-semibold">
                  Save details
                </button>
              </>
            )}

            <div className="flex flex-col gap-1 pt-1">
              {mode === 'picker' && selected.status === 'active' && onSelect && (
                <button
                  type="button"
                  onClick={() => onSelect(selected)}
                  className="w-full py-1.5 rounded bg-emerald-600 text-white font-semibold"
                >
                  Insert
                </button>
              )}
              {selected.url && (
                <button type="button" onClick={() => copyUrl(selected)} className="w-full py-1 rounded border border-slate-300 dark:border-slate-600">
                  Copy URL
                </button>
              )}
              {canManage && selected.kind === 'image' && selected.status === 'active' && (
                <button
                  type="button"
                  onClick={() => setEditingImage(selected)}
                  className="w-full py-1 rounded border border-sky-400 text-sky-700 dark:text-sky-300"
                >
                  Edit image
                </button>
              )}
              {canManage && selected.status === 'active' && (
                <>
                  <button type="button" onClick={() => setStatus(selected, 'archived')} className="w-full py-1 rounded border border-slate-300 dark:border-slate-600">
                    Archive
                  </button>
                  <button type="button" onClick={() => handleTrash(selected)} className="w-full py-1 rounded border border-red-400 text-red-600">
                    Trash
                  </button>
                </>
              )}
              {canManage && selected.status === 'archived' && (
                <>
                  <button type="button" onClick={() => setStatus(selected, 'active')} className="w-full py-1 rounded border border-slate-300 dark:border-slate-600">
                    Restore to library
                  </button>
                  <button type="button" onClick={() => handleTrash(selected)} className="w-full py-1 rounded border border-red-400 text-red-600">
                    Trash
                  </button>
                </>
              )}
              {canManage && selected.status === 'trash' && (
                <>
                  <button type="button" onClick={() => setStatus(selected, 'active')} className="w-full py-1 rounded border border-slate-300 dark:border-slate-600">
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm('Permanently delete this file?')) return;
                      await purgeMediaFiles([selected.id]);
                      setSelected(null);
                      await loadFiles();
                    }}
                    className="w-full py-1 rounded bg-red-600 text-white"
                  >
                    Purge
                  </button>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      {editingImage && (
        <MediaImageEditor
          file={editingImage}
          onClose={() => setEditingImage(null)}
          onSaved={(f) => {
            setEditingImage(null);
            setSelected(f);
            loadFiles();
          }}
        />
      )}
    </div>
  );
};
