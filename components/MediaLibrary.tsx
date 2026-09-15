import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaArchive,
  FaArrowLeft,
  FaCheck,
  FaChevronDown,
  FaChevronRight,
  FaCompress,
  FaCopy,
  FaDownload,
  FaEdit,
  FaEraser,
  FaExpand,
  FaFile,
  FaFilePdf,
  FaFolder,
  FaFolderOpen,
  FaFolderPlus,
  FaImage,
  FaImages,
  FaList,
  FaMusic,
  FaPhotoVideo,
  FaRedo,
  FaSearch,
  FaTh,
  FaTimes,
  FaTrash,
  FaUndo,
  FaUpload,
  FaVideo,
  FaYoutube,
} from 'react-icons/fa';
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
  undoRemoveBackgroundMedia,
} from '../services/mediaService';
import type { MediaTransformOptions } from '../types';
import { isYouTubeUrl, toYouTubeThumbnailUrl, youtubeToInsertHtml } from '../utils/youtube';
import { MediaImageEditor } from './MediaImageEditor';
import { MediaLightbox } from './MediaLightbox';
import { MediaCompressDialog } from './MediaCompressDialog';

const LAST_FOLDER_KEY = 'linknest.mediaLibrary.lastFolderId.v1';

function readLastFolderId(): number | null {
  try {
    const v = localStorage.getItem(LAST_FOLDER_KEY);
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeLastFolderId(id: number): void {
  try {
    localStorage.setItem(LAST_FOLDER_KEY, String(id));
  } catch {
    // ignore quota / private mode
  }
}

function folderAncestorIds(folders: MediaFolder[], folderId: number | null): number[] {
  if (folderId == null) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const ids: number[] = [];
  let cur: MediaFolder | undefined = byId.get(folderId);
  while (cur) {
    ids.push(cur.id);
    cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
  }
  return ids;
}

function folderBreadcrumb(folders: MediaFolder[], folderId: number | null): MediaFolder[] {
  return folderAncestorIds(folders, folderId)
    .map((id) => folders.find((f) => f.id === id))
    .filter((f): f is MediaFolder => !!f)
    .reverse();
}

interface FolderTreeNodeProps {
  folder: MediaFolder;
  folders: MediaFolder[];
  activeId: number | null;
  expanded: Set<number>;
  depth: number;
  canManageFolders: boolean;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
  onRename: (f: MediaFolder) => void;
  onDelete: (f: MediaFolder) => void;
}

const FolderTreeNode: React.FC<FolderTreeNodeProps> = ({
  folder,
  folders,
  activeId,
  expanded,
  depth,
  canManageFolders,
  onSelect,
  onToggle,
  onRename,
  onDelete,
}) => {
  const children = folders
    .filter((f) => f.parentId === folder.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(folder.id);
  const isActive = activeId === folder.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-0.5 rounded-xl transition-colors ${
          isActive
            ? 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-200'
            : 'hover:bg-slate-100 dark:hover:bg-[#252525] text-slate-700 dark:text-slate-200'
        }`}
        style={{ paddingLeft: Math.min(depth, 6) * 10 }}
      >
        <button
          type="button"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 w-5 h-5 flex items-center justify-center"
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(folder.id);
            else onSelect(folder.id);
          }}
        >
          {hasChildren ? (
            isOpen ? (
              <FaChevronDown size={8} />
            ) : (
              <FaChevronRight size={8} />
            )
          ) : (
            <span className="w-2" />
          )}
        </button>
        <button
          type="button"
          className="flex-1 flex items-center gap-1.5 text-left px-1 py-1.5 truncate min-w-0"
          onClick={() => onSelect(folder.id)}
          onDoubleClick={() => canManageFolders && onRename(folder)}
          title={folder.name}
        >
          {isActive || isOpen ? (
            <FaFolderOpen className="text-cyan-500 shrink-0" size={11} />
          ) : (
            <FaFolder className="text-cyan-500/80 shrink-0" size={11} />
          )}
          <span className="truncate font-medium">{folder.name}</span>
        </button>
        {canManageFolders && folder.parentId != null && (
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
            title="Delete folder"
            onClick={() => onDelete(folder)}
          >
            <FaTimes size={10} />
          </button>
        )}
      </div>
      {hasChildren && isOpen &&
        children.map((child) => (
          <FolderTreeNode
            key={child.id}
            folder={child}
            folders={folders}
            activeId={activeId}
            expanded={expanded}
            depth={depth + 1}
            canManageFolders={canManageFolders}
            onSelect={onSelect}
            onToggle={onToggle}
            onRename={onRename}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
};

const SHELL =
  'flex flex-col overflow-hidden rounded-3xl border border-slate-200 dark:border-[#333] bg-gradient-to-b from-slate-50 to-white dark:from-[#151a22] dark:to-[#111] shadow-2xl';
const SEG = 'inline-flex flex-wrap rounded-xl bg-slate-100 dark:bg-[#252525] p-0.5';
const SEG_BTN = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all';
const SEG_ON = 'bg-white dark:bg-[#333] text-cyan-600 dark:text-cyan-400 shadow-sm';
const SEG_OFF = 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300';
const BTN =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:pointer-events-none active:scale-95';
const BTN_GHOST = `${BTN} bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#333]`;
const BTN_PRIMARY = `${BTN} bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25`;
const BTN_DANGER = `${BTN} bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20`;
const BTN_DANGER_GHOST = `${BTN} border border-red-400/70 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40`;
const BTN_ACCENT = `${BTN} border border-cyan-400/50 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/40`;
const BTN_SUCCESS = `${BTN} bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20`;
const FIELD =
  'rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1a1a1a] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30';
export type MediaLibraryMode = 'manage' | 'picker';

interface MediaLibraryProps {
  mode?: MediaLibraryMode;
  onClose?: () => void;
  /** Picker mode: called when user confirms Insert (or double-clicks) a file */
  onSelect?: (file: MediaFile) => void;
  /** Picker mode: insert raw HTML (YouTube embeds) at the editor caret */
  onInsertHtml?: (html: string) => void;
  /** Compact height for floating widget / modal */
  compact?: boolean;
  className?: string;
}

type ViewFilter = 'all' | MediaKind | 'archived' | 'trash';

const KIND_FILTERS: ViewFilter[] = ['all', 'image', 'pdf', 'audio', 'video'];
const STATUS_FILTERS: ViewFilter[] = ['archived', 'trash'];

const KIND_LABELS: Record<string, string> = {
  all: 'All',
  image: 'Images',
  pdf: 'Documents',
  audio: 'Audio',
  video: 'Video',
  archived: 'Archived',
  trash: 'Trash',
};

function KindGlyph({ kind, className = 'text-slate-400' }: { kind: MediaKind; className?: string }) {
  switch (kind) {
    case 'image':
      return <FaImage className={className} />;
    case 'pdf':
      return <FaFilePdf className={className} />;
    case 'audio':
      return <FaMusic className={className} />;
    case 'video':
      return <FaVideo className={className} />;
    default:
      return <FaFile className={className} />;
  }
}

export const MediaLibrary: React.FC<MediaLibraryProps> = ({
  mode = 'manage',
  onClose,
  onSelect,
  onInsertHtml,
  compact = false,
  className = '',
}) => {
  const { user } = useAuth();
  const isAdmin = !!(user?.is_admin);
  // File metadata / trash / transforms: admin manage surfaces only
  const canManage = isAdmin && mode !== 'picker';
  // Subfolders: admins can create in picker too (browse + organize for insert)
  const canCreateFolders = isAdmin;
  const canManageFolders = isAdmin && mode !== 'picker';
  const canUpload = isAdmin;

  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<number>>(() => new Set());
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState<ViewFilter>('all');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [tagFilter, setTagFilter] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [grid, setGrid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaFile | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingImage, setEditingImage] = useState<MediaFile | null>(null);
  const [lightboxFile, setLightboxFile] = useState<MediaFile | null>(null);
  const [compressOpen, setCompressOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showYoutube, setShowYoutube] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState('');
  const [optimizeOnUpload, setOptimizeOnUpload] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  /** File ids that can undo the last Remove BG (replace) action. */
  const [removeBgUndoIds, setRemoveBgUndoIds] = useState<number[]>([]);
  const [undoBusy, setUndoBusy] = useState(false);
  /** Live CSS preview degrees while bulk-rotating (keyed by file id). */
  const [previewRotate, setPreviewRotate] = useState<Record<number, number>>({});
  /** When false, preview angle resets instantly (no reverse spin after server save). */
  const [rotateTransitionOn, setRotateTransitionOn] = useState(true);
  const [detailTitle, setDetailTitle] = useState('');
  const [detailAlt, setDetailAlt] = useState('');
  const [detailTags, setDetailTags] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const rotateAnimTimerRef = useRef<number | null>(null);

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
        const saved = readLastFolderId();
        const savedFolder = saved != null ? list.find((f) => f.id === saved) : null;
        const root = list.find((f) => f.parentId == null) || list[0];
        const nextId = savedFolder?.id ?? root.id;
        setFolderId(nextId);
        setExpandedFolderIds(new Set(folderAncestorIds(list, nextId)));
      } else if (folderId != null) {
        setExpandedFolderIds((prev) => {
          const next = new Set(prev);
          folderAncestorIds(list, folderId).forEach((id) => next.add(id));
          return next;
        });
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
        page,
      });
      setFiles(res.data);
      setTotal(res.total);
      // #region agent log
      fetch('http://127.0.0.1:7808/ingest/ac6d79aa-db1a-4b9b-b803-66cfddabd40c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'cee2c4' },
        body: JSON.stringify({
          sessionId: 'cee2c4',
          location: 'MediaLibrary.tsx:loadFiles',
          message: 'files loaded',
          data: {
            count: res.data.length,
            total: res.total,
            page,
            imageThumbs: res.data.filter((f) => f.kind === 'image' && f.thumbUrl).length,
            imageOriginals: res.data.filter((f) => f.kind === 'image' && f.url).length,
          },
          timestamp: Date.now(),
          hypothesisId: 'B',
          runId: 'uplift-1',
        }),
      }).catch(() => {});
      // #endregion
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media');
    } finally {
      setLoading(false);
    }
  }, [q, folderId, kindForView, statusForView, tagFilter, page]);

  const loadTags = useCallback(async () => {
    try {
      const list = await listMediaTags();
      setTags(list.map((t) => t.name));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    setPage(1);
  }, [q, folderId, view, tagFilter]);

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

  useEffect(() => {
    if (folderId == null) return;
    writeLastFolderId(folderId);
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      folderAncestorIds(folders, folderId).forEach((id) => next.add(id));
      return next;
    });
  }, [folderId, folders]);

  const rootFolders = useMemo(
    () =>
      folders
        .filter((f) => f.parentId == null)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [folders]
  );

  const breadcrumb = useMemo(() => folderBreadcrumb(folders, folderId), [folders, folderId]);

  const selectFolder = useCallback((id: number) => {
    setFolderId(id);
  }, []);

  const toggleFolderExpanded = useCallback((id: number) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleInsertYoutube = () => {
    setYoutubeError(null);
    const html = youtubeToInsertHtml(youtubeUrl);
    if (!html) {
      setYoutubeError('Enter a valid YouTube URL or video ID.');
      return;
    }
    if (onInsertHtml) {
      onInsertHtml(html);
      setYoutubeUrl('');
      setShowYoutube(false);
      return;
    }
    setYoutubeError('YouTube insert is only available from the rich text Media picker.');
  };

  const handleUpload = async (fileList: FileList | File[]) => {
    if (!canUpload) return;
    const arr = Array.from(fileList);
    if (!arr.length) return;
    setUploading(true);
    setError(null);
    const allErrors: Array<{ name: string; error: string }> = [];
    try {
      for (let i = 0; i < arr.length; i++) {
        setUploadLabel(`Uploading ${i + 1}/${arr.length}…`);
        const result = await uploadMediaFiles([arr[i]], { folderId, optimize: optimizeOnUpload });
        if (result.errors?.length) {
          allErrors.push(...result.errors);
        }
        if (result.data?.length) {
          setFiles((prev) => {
            const ids = new Set(prev.map((f) => f.id));
            const extra = result.data.filter((f) => !ids.has(f.id));
            return extra.length ? [...extra, ...prev] : prev;
          });
          setTotal((t) => t + result.data.length);
        }
      }
      if (allErrors.length) {
        setError(allErrors.map((e) => `${e.name}: ${e.error}`).join('; '));
      }
      await loadFiles();
      await loadTags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadLabel('');
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
    if (!name || !canCreateFolders) return;
    try {
      await createMediaFolder(name, folderId);
      setNewFolderName('');
      await loadFolders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create folder');
    }
  };

  const handleRenameFolder = async (f: MediaFolder) => {
    if (!canManageFolders) return;
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
    if (!canManageFolders) return;
    const collectDescendantIds = (parentId: number): number[] => {
      const kids = folders.filter((x) => x.parentId === parentId);
      const ids: number[] = [];
      for (const kid of kids) {
        ids.push(kid.id, ...collectDescendantIds(kid.id));
      }
      return ids;
    };
    const descendantIds = collectDescendantIds(f.id);
    const subCount = descendantIds.length;
    const msg =
      subCount > 0
        ? `Delete folder "${f.name}" and everything under it?\n\n` +
          `This removes ${subCount} subfolder${subCount === 1 ? '' : 's'} and moves ALL files in this folder and its subfolders to Trash.\n\n` +
          `Folders are removed permanently. Files can be restored from Trash. Continue?`
        : `Delete folder "${f.name}"?\n\n` +
          `All files inside will be moved to Trash. The folder is removed permanently. Continue?`;
    if (!window.confirm(msg)) return;
    try {
      await deleteMediaFolder(f.id);
      const removed = new Set([f.id, ...descendantIds]);
      if (folderId != null && removed.has(folderId)) {
        const parent = f.parentId != null ? folders.find((x) => x.id === f.parentId) : null;
        const root = folders.find((x) => x.parentId == null);
        setFolderId(parent?.id ?? root?.id ?? null);
      }
      setSelected(null);
      await loadFolders();
      await loadFiles();
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
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  /** Permanently delete: selected trash items, or the whole trash if nothing is selected. */
  const handleDeleteFromTrash = async () => {
    if (!canManage) return;
    const ids: number[] = [...selectedIds];
    if (ids.length > 0) {
      if (!window.confirm(`Permanently delete ${ids.length} selected file(s)? This cannot be undone.`)) return;
      try {
        await purgeMediaFiles(ids);
        setSelectedIds(new Set());
        setSelected(null);
        await loadFiles();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete failed');
      }
      return;
    }
    if (total <= 0) return;
    if (!window.confirm(`Permanently delete all ${total} file(s) in Trash? This cannot be undone.`)) return;
    try {
      await purgeAllMediaTrash();
      setSelected(null);
      setSelectedIds(new Set());
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
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
        if (options.removeBackground) {
          setRemoveBgUndoIds(result.data.map((f) => f.id));
        } else {
          setRemoveBgUndoIds([]);
        }
        clearSelection();
        setSelected(null);
        await loadFiles();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setPreviewRotate({});
      setBulkBusy(false);
    }
  };

  const handleUndoRemoveBg = async () => {
    if (!canManage || removeBgUndoIds.length === 0 || undoBusy) return;
    setUndoBusy(true);
    setError(null);
    try {
      const result = await undoRemoveBackgroundMedia(removeBgUndoIds);
      if (result.errors?.length) {
        setError(
          `Undo: ${result.restored} restored, ${result.errors.length} failed — ` +
            result.errors.map((e) => `#${e.id}: ${e.error}`).join('; ')
        );
      }
      setRemoveBgUndoIds([]);
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Undo remove background failed');
    } finally {
      setUndoBusy(false);
    }
  };

  const bustMediaUrl = (url: string | null | undefined, stamp: number): string | undefined => {
    if (!url) return undefined;
    const base = url.split('?')[0];
    return `${base}?r=${stamp}`;
  };

  const handleBulkRotate = async (direction: 'left' | 'right') => {
    if (!canManage || selectedImageIds.length === 0 || bulkBusy) return;
    const apiDeg: 90 | 270 = direction === 'left' ? 270 : 90;
    const visualDelta = direction === 'left' ? -90 : 90;
    const ids = selectedImageIds;
    const idSet = new Set(ids);

    setBulkBusy(true);
    setError(null);
    setRotateTransitionOn(true);
    setPreviewRotate((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        next[id] = (next[id] || 0) + visualDelta;
      }
      return next;
    });

    await new Promise<void>((resolve) => {
      if (rotateAnimTimerRef.current != null) {
        window.clearTimeout(rotateAnimTimerRef.current);
      }
      rotateAnimTimerRef.current = window.setTimeout(() => {
        rotateAnimTimerRef.current = null;
        resolve();
      }, 450);
    });

    try {
      const result = await batchTransformMediaFiles(ids, { rotate: apiDeg, replace: true });
      const label = direction === 'left' ? 'Rotate left' : 'Rotate right';
      if (result.errors?.length) {
        setError(
          `${label}: ${result.transformed} ok, ${result.errors.length} failed — ` +
            result.errors.map((e) => `#${e.id}: ${e.error}`).join('; ')
        );
      } else if (!result.transformed) {
        setError(`${label} did not change any files`);
        setRotateTransitionOn(true);
        setPreviewRotate((prev) => {
          const next = { ...prev };
          for (const id of ids) {
            next[id] = (next[id] || 0) - visualDelta;
          }
          return next;
        });
        return;
      }

      if (result.transformed > 0) {
        const stamp = Date.now();
        const byId = new Map(result.data.map((f) => [f.id, f]));
        // Drop CSS angle instantly while swapping in the already-rotated bitmap (no reverse spin).
        setRotateTransitionOn(false);
        setPreviewRotate({});
        setFiles((prev) =>
          prev.map((f) => {
            if (!idSet.has(f.id)) return f;
            const updated = byId.get(f.id);
            if (!updated) {
              return {
                ...f,
                url: bustMediaUrl(f.url, stamp) ?? f.url,
                thumbUrl: bustMediaUrl(f.thumbUrl, stamp) ?? f.thumbUrl,
              };
            }
            return {
              ...updated,
              url: bustMediaUrl(updated.url, stamp) ?? updated.url,
              thumbUrl: bustMediaUrl(updated.thumbUrl, stamp) ?? updated.thumbUrl,
            };
          })
        );
        setSelected((cur) => {
          if (!cur || !idSet.has(cur.id)) return cur;
          const updated = byId.get(cur.id);
          if (!updated) {
            return {
              ...cur,
              url: bustMediaUrl(cur.url, stamp) ?? cur.url,
              thumbUrl: bustMediaUrl(cur.thumbUrl, stamp) ?? cur.thumbUrl,
            };
          }
          return {
            ...updated,
            url: bustMediaUrl(updated.url, stamp) ?? updated.url,
            thumbUrl: bustMediaUrl(updated.thumbUrl, stamp) ?? updated.thumbUrl,
          };
        });
        // Re-enable smooth transitions for the next rotate click.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setRotateTransitionOn(true));
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rotate failed');
      setRotateTransitionOn(true);
      setPreviewRotate((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          next[id] = (next[id] || 0) - visualDelta;
        }
        return next;
      });
    } finally {
      setBulkBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (rotateAnimTimerRef.current != null) {
        window.clearTimeout(rotateAnimTimerRef.current);
      }
    };
  }, []);

  const thumbRotateStyle = (fileId: number): React.CSSProperties => {
    const deg = previewRotate[fileId] || 0;
    const quarter = Math.abs(deg) % 180 === 90;
    return {
      transform: `rotate(${deg}deg) scale(${quarter ? 0.86 : 1})`,
      transition: rotateTransitionOn ? 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
      transformOrigin: 'center center',
    };
  };

  const handleTrashSelected = async () => {
    if (!canManage) return;
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} selected file(s)? They will move to Trash.`)) return;
    setBulkBusy(true);
    setError(null);
    try {
      await batchTrashMediaFiles(ids);
      clearSelection();
      setSelected(null);
      await loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
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

  const openLightbox = (file: MediaFile) => {
    if (file.kind !== 'image' || !file.url) return;
    // #region agent log
    fetch('http://127.0.0.1:7808/ingest/ac6d79aa-db1a-4b9b-b803-66cfddabd40c', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'cee2c4' },
      body: JSON.stringify({
        sessionId: 'cee2c4',
        location: 'MediaLibrary.tsx:openLightbox',
        message: 'open full size',
        data: {
          id: file.id,
          hasOriginalUrl: !!file.url,
          hasThumb: !!file.thumbUrl,
          usingThumbForPreview: false,
          width: file.width,
          height: file.height,
        },
        timestamp: Date.now(),
        hypothesisId: 'C',
        runId: 'uplift-1',
      }),
    }).catch(() => {});
    // #endregion
    setLightboxFile(file);
  };

  const totalPages = Math.max(1, Math.ceil(total / 96));

  const heightClass = compact ? 'h-full min-h-[360px]' : 'min-h-[560px] h-[min(80vh,860px)]';

  return (
    <div className={`${SHELL} ${heightClass} ${className}`}>
      <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-[#333] bg-white/70 dark:bg-[#1a1a1a]/80 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/30 shrink-0">
            <FaPhotoVideo size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">
                {mode === 'picker' ? 'Choose media' : 'Media Library'}
              </h2>
              <span className="shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-[#252525] text-slate-500 dark:text-slate-400">
                {total} {total === 1 ? 'file' : 'files'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {mode === 'picker'
                ? 'Select a file, then Insert — or paste a YouTube URL. Double-click inserts at the cursor.'
                : 'Images, documents, audio, and video — shared site library.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {mode === 'picker' && onInsertHtml && (
            <button
              type="button"
              title="Insert a YouTube video"
              onClick={() => {
                setShowYoutube((v) => !v);
                setYoutubeError(null);
              }}
              className={`${SEG_BTN} ${showYoutube ? SEG_ON : `${SEG_OFF} bg-slate-100 dark:bg-[#252525]`}`}
            >
              <FaYoutube size={12} className="text-red-500" />
              YouTube
            </button>
          )}
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
                title="Re-encode and cap at 2560px. Off = keep the original file."
                onClick={() => setOptimizeOnUpload((v) => !v)}
                className={`${SEG_BTN} ${optimizeOnUpload ? SEG_ON : `${SEG_OFF} bg-slate-100 dark:bg-[#252525]`}`}
              >
                {optimizeOnUpload ? <FaCheck size={10} /> : null}
                Optimize
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className={BTN_PRIMARY}
              >
                <FaUpload size={11} />
                {uploading ? uploadLabel || 'Uploading…' : 'Upload'}
              </button>
            </>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-[#333] transition-colors"
              title="Close"
            >
              <FaTimes size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-2.5 border-b border-slate-200 dark:border-[#333]">
        <div className={SEG}>
          {KIND_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`${SEG_BTN} ${view === key ? SEG_ON : SEG_OFF}`}
            >
              {key === 'image' ? <FaImage size={10} /> : null}
              {key === 'pdf' ? <FaFilePdf size={10} /> : null}
              {key === 'audio' ? <FaMusic size={10} /> : null}
              {key === 'video' ? <FaVideo size={10} /> : null}
              {KIND_LABELS[key]}
            </button>
          ))}
        </div>
        <div className={SEG}>
          {STATUS_FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`${SEG_BTN} ${
                view === key
                  ? key === 'trash'
                    ? 'bg-white dark:bg-[#333] text-red-600 dark:text-red-300 shadow-sm'
                    : SEG_ON
                  : SEG_OFF
              }`}
            >
              {key === 'archived' ? <FaArchive size={10} /> : <FaTrash size={10} />}
              {KIND_LABELS[key]}
            </button>
          ))}
        </div>
        <div className="relative ml-auto flex-1 min-w-[140px] max-w-[240px]">
          <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
          <input
            type="search"
            placeholder="Search…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            className={`${FIELD} w-full pl-7`}
          />
        </div>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className={FIELD}
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <div className={SEG}>
          <button
            type="button"
            onClick={() => setGrid(true)}
            className={`${SEG_BTN} ${grid ? SEG_ON : SEG_OFF}`}
            title="Grid view"
          >
            <FaTh size={11} />
          </button>
          <button
            type="button"
            onClick={() => setGrid(false)}
            className={`${SEG_BTN} ${!grid ? SEG_ON : SEG_OFF}`}
            title="List view"
          >
            <FaList size={11} />
          </button>
        </div>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 sm:px-5 py-2 border-b border-slate-200 dark:border-[#333] bg-white/50 dark:bg-[#1a1a1a]/50">
          <button type="button" onClick={selectAllInView} className={BTN_GHOST} title="Select all files in this folder/view">
            <FaCheck size={10} /> Select all
          </button>
          <button type="button" onClick={selectAllImagesInView} className={BTN_GHOST} title="Select all images in this folder/view">
            <FaImages size={10} /> Select images
          </button>
          {selectedIds.size > 0 && (
            <>
              <button type="button" onClick={clearSelection} className={BTN_GHOST}>
                <FaTimes size={10} /> Clear ({selectedIds.size})
              </button>
              {view !== 'trash' && (
                <button type="button" disabled={bulkBusy} onClick={handleTrashSelected} className={BTN_DANGER_GHOST}>
                  <FaTrash size={10} /> Delete
                </button>
              )}
              {selectedImageIds.length > 0 && view !== 'trash' && (
                <>
                  <span className="w-px h-5 bg-slate-200 dark:bg-[#333] mx-0.5" />
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => handleBulkRotate('left')}
                    className={BTN_GHOST}
                    title="Rotate selected images 90° left"
                  >
                    <FaUndo size={10} /> Rotate L
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => handleBulkRotate('right')}
                    className={BTN_GHOST}
                    title="Rotate selected images 90° right"
                  >
                    <FaRedo size={10} /> Rotate R
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => setCompressOpen(true)}
                    className={BTN_GHOST}
                    title="Compress selected images (choose size, quality, format)"
                  >
                    <FaCompress size={10} /> Compress
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => runBulkTransform({ format: 'jpg', quality: 82, replace: true }, 'Convert JPG')}
                    className={BTN_GHOST}
                    title="Convert selected images to JPEG"
                  >
                    <FaImage size={10} /> To JPG
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() =>
                      runBulkTransform({ removeBackground: true, format: 'png', replace: true }, 'Remove background')
                    }
                    className={BTN_GHOST}
                    title="Remove background color (corner sample → transparent PNG)"
                  >
                    <FaEraser size={10} /> Remove BG
                  </button>
                  {removeBgUndoIds.length > 0 && (
                    <button
                      type="button"
                      disabled={undoBusy || bulkBusy}
                      onClick={handleUndoRemoveBg}
                      className={BTN_ACCENT}
                      title="Restore images to how they looked before Remove BG"
                    >
                      <FaUndo size={10} /> Undo Remove BG ({removeBgUndoIds.length})
                    </button>
                  )}
                </>
              )}
              {bulkBusy && (
                <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 ml-1">Working…</span>
              )}
            </>
          )}
        </div>
      )}

      {canManage && removeBgUndoIds.length > 0 && (
        <div className="mx-4 sm:mx-5 mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50 dark:bg-cyan-950/30 px-3 py-2 text-xs text-cyan-800 dark:text-cyan-200">
          <span className="font-semibold">
            Background removed on {removeBgUndoIds.length} image{removeBgUndoIds.length === 1 ? '' : 's'}.
          </span>
          <button
            type="button"
            disabled={undoBusy}
            onClick={handleUndoRemoveBg}
            className={`${BTN_ACCENT} py-1`}
          >
            <FaUndo size={10} /> {undoBusy ? 'Restoring…' : 'Undo'}
          </button>
          <button type="button" className="font-bold underline opacity-70 hover:opacity-100" onClick={() => setRemoveBgUndoIds([])}>
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="mx-4 sm:mx-5 mt-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
          <button type="button" className="ml-2 font-bold underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {mode === 'picker' && showYoutube && onInsertHtml && (
        <div className="mx-4 sm:mx-5 mt-2 rounded-2xl border border-slate-200 dark:border-[#333] bg-white/80 dark:bg-[#1a1a1a]/80 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-white">
            <FaYoutube className="text-red-500" size={14} />
            Insert YouTube video
          </div>
          <div className="flex flex-wrap gap-2 items-start">
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => {
                setYoutubeUrl(e.target.value);
                setYoutubeError(null);
              }}
              placeholder="https://www.youtube.com/watch?v=… or youtu.be/…"
              className={`${FIELD} flex-1 min-w-[200px]`}
              onKeyDown={(e) => e.key === 'Enter' && handleInsertYoutube()}
            />
            <button type="button" onClick={handleInsertYoutube} className={BTN_SUCCESS}>
              Insert
            </button>
          </div>
          {youtubeError && <p className="text-xs text-red-600 dark:text-red-300">{youtubeError}</p>}
          {isYouTubeUrl(youtubeUrl) && toYouTubeThumbnailUrl(youtubeUrl) && (
            <div className="flex items-center gap-3">
              <img
                src={toYouTubeThumbnailUrl(youtubeUrl) || ''}
                alt=""
                className="h-16 w-28 object-cover rounded-lg border border-slate-200 dark:border-[#333]"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Preview — click Insert to place the player at the cursor.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {view !== 'trash' && view !== 'archived' && (
          <aside className="w-52 shrink-0 border-r border-slate-200 dark:border-[#333] overflow-y-auto p-2.5 text-xs">
            {breadcrumb.length > 1 && (
              <div className="flex flex-wrap items-center gap-0.5 mb-2 px-1 text-[10px] text-slate-500 dark:text-slate-400">
                {breadcrumb.map((crumb, i) => (
                  <React.Fragment key={crumb.id}>
                    {i > 0 && <span className="opacity-50">/</span>}
                    <button
                      type="button"
                      className={`truncate max-w-[4.5rem] hover:text-cyan-600 dark:hover:text-cyan-400 ${
                        crumb.id === folderId ? 'font-bold text-slate-700 dark:text-slate-200' : ''
                      }`}
                      onClick={() => selectFolder(crumb.id)}
                      title={crumb.name}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
            {breadcrumb.length > 1 && (
              <button
                type="button"
                className={`${BTN_GHOST} w-full justify-start mb-2`}
                onClick={() => {
                  const parent = breadcrumb[breadcrumb.length - 2];
                  if (parent) selectFolder(parent.id);
                }}
              >
                <FaArrowLeft size={10} /> Up
              </button>
            )}
            <div className="space-y-0.5 mb-2">
              {rootFolders.map((root) => (
                <FolderTreeNode
                  key={root.id}
                  folder={root}
                  folders={folders}
                  activeId={folderId}
                  expanded={expandedFolderIds}
                  depth={0}
                  canManageFolders={canManageFolders}
                  onSelect={selectFolder}
                  onToggle={toggleFolderExpanded}
                  onRename={handleRenameFolder}
                  onDelete={handleDeleteFolder}
                />
              ))}
            </div>
            {canCreateFolders && (
              <div className="mt-2 flex gap-1">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New subfolder"
                  className={`${FIELD} flex-1 min-w-0`}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                />
                <button type="button" onClick={handleCreateFolder} className={`${BTN_PRIMARY} px-2`} title="Create subfolder here">
                  <FaFolderPlus size={11} />
                </button>
              </div>
            )}
          </aside>
        )}

        {/* Files */}
        <div
          ref={dropRef}
          className="flex-1 overflow-y-auto p-3"
          onDragOver={(e) => {
            if (canUpload) e.preventDefault();
          }}
          onDrop={onDrop}
        >
          {view === 'trash' && canManage && (
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                onClick={handleDeleteFromTrash}
                disabled={selectedIds.size === 0 && total <= 0}
                className={BTN_DANGER}
                title={
                  selectedIds.size > 0
                    ? 'Permanently delete the selected files'
                    : 'Permanently delete everything in Trash'
                }
              >
                <FaTrash size={10} />
                {selectedIds.size > 0 ? `Delete (${selectedIds.size})` : 'Delete all'}
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-slate-500 p-6 text-center font-medium">Loading…</p>
          ) : files.length === 0 ? (
            <div className="m-2 rounded-2xl border border-dashed border-slate-300 dark:border-[#333] bg-white/50 dark:bg-[#1a1a1a]/40 px-4 py-10 text-center">
              <FaPhotoVideo className="mx-auto mb-2 text-slate-400" size={22} />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {canUpload ? 'No files yet' : 'No files in this view'}
              </p>
              {canUpload && (
                <p className="text-xs text-slate-500 mt-1">Upload or drag files here to add them to the library.</p>
              )}
            </div>
          ) : grid ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {files.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => setSelected(file)}
                  onDoubleClick={() => {
                    if (mode === 'picker' && onSelect && file.status === 'active') onSelect(file);
                    else if (file.kind === 'image' && file.url) openLightbox(file);
                  }}
                  className={`relative text-left rounded-2xl border p-1.5 transition-all ${
                    selected?.id === file.id
                      ? 'border-cyan-400 ring-2 ring-cyan-400/30 bg-white dark:bg-[#1a1a1a] shadow-sm'
                      : 'border-slate-200 dark:border-[#333] bg-white/70 dark:bg-[#1a1a1a]/70 hover:border-cyan-300 dark:hover:border-cyan-700'
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
                      className="absolute top-2 left-2 z-10 accent-cyan-500"
                      aria-label={`Select ${file.title || file.originalName}`}
                    />
                  )}
                  <div className="aspect-square bg-slate-100 dark:bg-[#111] rounded-xl flex items-center justify-center overflow-hidden mb-1.5">
                    {file.kind === 'image' && (file.thumbUrl || file.url) ? (
                      <img
                        src={file.thumbUrl || file.url || ''}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-contain will-change-transform"
                        style={thumbRotateStyle(file.id)}
                      />
                    ) : (
                      <KindGlyph kind={file.kind} className="text-2xl text-slate-400" />
                    )}
                  </div>
                  <div className="text-[11px] font-semibold truncate text-slate-800 dark:text-slate-200 px-0.5" title={file.originalName}>
                    {file.title || file.originalName}
                  </div>
                  <div className="text-[10px] text-slate-500 px-0.5 pb-0.5">
                    {formatMediaSize(file.sizeBytes)}
                    {file.width && file.height ? ` · ${file.width}×${file.height}` : ''}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-[#333]">
                  {canManage && <th className="w-8" />}
                  <th className="py-2 font-bold">Name</th>
                  <th className="font-bold">Kind</th>
                  <th className="font-bold">Size</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr
                    key={file.id}
                    className={`cursor-pointer transition-colors ${
                      selected?.id === file.id
                        ? 'bg-cyan-50 dark:bg-cyan-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-[#1a1a1a]'
                    }`}
                    onClick={() => setSelected(file)}
                    onDoubleClick={() => {
                      if (mode === 'picker' && onSelect && file.status === 'active') onSelect(file);
                      else if (file.kind === 'image' && file.url) openLightbox(file);
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
                          className="accent-cyan-500"
                          aria-label={`Select ${file.title || file.originalName}`}
                        />
                      </td>
                    )}
                    <td className="py-2 truncate max-w-[180px] font-semibold text-slate-800 dark:text-slate-200">
                      {file.title || file.originalName}
                    </td>
                    <td className="capitalize text-slate-500">{file.kind}</td>
                    <td className="text-slate-500">{formatMediaSize(file.sizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={BTN_GHOST}
              >
                Prev
              </button>
              <span className="text-xs font-bold text-slate-500">
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={BTN_GHOST}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Detail */}
        {selected && (
          <aside className="w-56 shrink-0 border-l border-slate-200 dark:border-[#333] overflow-y-auto p-3 text-xs space-y-2.5 bg-white/40 dark:bg-[#1a1a1a]/40">
            <div className="bg-slate-100 dark:bg-[#111] rounded-2xl p-2 flex items-center justify-center min-h-[120px] border border-slate-200/70 dark:border-[#333]">
              {selected.kind === 'image' && selected.url ? (
                <button
                  type="button"
                  className="block w-full overflow-hidden"
                  title="View original size"
                  onClick={() => openLightbox(selected)}
                >
                  <img
                    src={selected.url}
                    alt={selected.altText || selected.originalName}
                    className="max-h-36 max-w-full object-contain mx-auto cursor-zoom-in will-change-transform"
                    style={thumbRotateStyle(selected.id)}
                  />
                </button>
              ) : selected.kind === 'video' && selected.url ? (
                <video src={selected.url} className="max-h-28 max-w-full" controls />
              ) : selected.kind === 'audio' && selected.url ? (
                <audio src={selected.url} controls className="w-full" />
              ) : (
                <KindGlyph kind={selected.kind} className="text-3xl text-slate-400" />
              )}
            </div>
            <div className="font-bold text-slate-800 dark:text-white break-words leading-snug">{selected.originalName}</div>
            <div className="text-slate-500 capitalize">
              {selected.kind} · {formatMediaSize(selected.sizeBytes)}
              {selected.width && selected.height ? ` · ${selected.width}×${selected.height}` : ''}
            </div>

            {canManage && selected.status !== 'trash' && (
              <>
                <label className="block font-semibold text-slate-600 dark:text-slate-300">
                  Title
                  <input
                    value={detailTitle}
                    onChange={(e) => setDetailTitle(e.target.value)}
                    className={`${FIELD} mt-1 w-full`}
                  />
                </label>
                <label className="block font-semibold text-slate-600 dark:text-slate-300">
                  Alt text
                  <input
                    value={detailAlt}
                    onChange={(e) => setDetailAlt(e.target.value)}
                    className={`${FIELD} mt-1 w-full`}
                  />
                </label>
                <label className="block font-semibold text-slate-600 dark:text-slate-300">
                  Tags (comma-separated)
                  <input
                    value={detailTags}
                    onChange={(e) => setDetailTags(e.target.value)}
                    className={`${FIELD} mt-1 w-full`}
                  />
                </label>
                <button type="button" onClick={saveDetail} className={`${BTN_PRIMARY} w-full`}>
                  Save details
                </button>
              </>
            )}

            <div className="flex flex-col gap-1.5 pt-1">
              {mode === 'picker' && selected.status === 'active' && onSelect && (
                <button type="button" onClick={() => onSelect(selected)} className={`${BTN_SUCCESS} w-full`}>
                  Insert into editor
                </button>
              )}
              {selected.url && selected.kind === 'image' && (
                <button type="button" onClick={() => openLightbox(selected)} className={`${BTN_ACCENT} w-full`}>
                  <FaExpand size={10} /> View full size
                </button>
              )}
              {selected.url && (
                <button type="button" onClick={() => copyUrl(selected)} className={`${BTN_GHOST} w-full`}>
                  <FaCopy size={10} /> Copy URL
                </button>
              )}
              {selected.url && (
                <a href={selected.url} download={selected.originalName} className={`${BTN_GHOST} w-full`}>
                  <FaDownload size={10} /> Download
                </a>
              )}
              {canManage && selected.kind === 'image' && selected.status === 'active' && (
                <button type="button" onClick={() => setEditingImage(selected)} className={`${BTN_ACCENT} w-full`}>
                  <FaEdit size={10} /> Edit image
                </button>
              )}
              {canManage && selected.status === 'active' && (
                <>
                  <button type="button" onClick={() => setStatus(selected, 'archived')} className={`${BTN_GHOST} w-full`}>
                    <FaArchive size={10} /> Archive
                  </button>
                  <button type="button" onClick={() => handleTrash(selected)} className={`${BTN_DANGER_GHOST} w-full`}>
                    <FaTrash size={10} /> Delete
                  </button>
                </>
              )}
              {canManage && selected.status === 'archived' && (
                <>
                  <button type="button" onClick={() => setStatus(selected, 'active')} className={`${BTN_GHOST} w-full`}>
                    <FaUndo size={10} /> Restore to library
                  </button>
                  <button type="button" onClick={() => handleTrash(selected)} className={`${BTN_DANGER_GHOST} w-full`}>
                    <FaTrash size={10} /> Delete
                  </button>
                </>
              )}
              {canManage && selected.status === 'trash' && (
                <>
                  <button type="button" onClick={() => setStatus(selected, 'active')} className={`${BTN_GHOST} w-full`}>
                    <FaUndo size={10} /> Restore
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm('Permanently delete this file? This cannot be undone.')) return;
                      await purgeMediaFiles([selected.id]);
                      setSelected(null);
                      await loadFiles();
                    }}
                    className={`${BTN_DANGER} w-full`}
                  >
                    <FaTrash size={10} /> Delete
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
          onSaved={(f, meta) => {
            setEditingImage(null);
            setSelected(f);
            if (meta?.undoRemoveBg) {
              setRemoveBgUndoIds([f.id]);
            }
            loadFiles();
          }}
        />
      )}
      {lightboxFile && (
        <MediaLightbox
          file={lightboxFile}
          files={files}
          onClose={() => setLightboxFile(null)}
          onChange={(f) => {
            setLightboxFile(f);
            setSelected(f);
          }}
        />
      )}
      {compressOpen && (
        <MediaCompressDialog
          count={selectedImageIds.length}
          onClose={() => setCompressOpen(false)}
          onConfirm={(opts, label) => {
            setCompressOpen(false);
            runBulkTransform(opts, label);
          }}
        />
      )}
    </div>
  );
};
