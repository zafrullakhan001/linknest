/**
 * Media library API client — shared site media catalog.
 */
import { resolveApiBase } from './apiHelpers';
import type {
  MediaFile,
  MediaFolder,
  MediaKind,
  MediaListResponse,
  MediaStatus,
  MediaTag,
  MediaTransformOptions,
} from '../types';

function getApiBase(): string {
  return resolveApiBase();
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: string }).error || `Request failed (${res.status})`;
    throw new Error(err);
  }
  return data as T;
}

export interface MediaListParams {
  q?: string;
  folderId?: number | null;
  kind?: MediaKind | '';
  status?: MediaStatus | 'all';
  tag?: string;
  page?: number;
  perPage?: number;
}

export async function listMediaFiles(params: MediaListParams = {}): Promise<MediaListResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.folderId != null) qs.set('folder_id', String(params.folderId));
  if (params.kind) qs.set('kind', params.kind);
  if (params.status) qs.set('status', params.status);
  if (params.tag) qs.set('tag', params.tag);
  if (params.page) qs.set('page', String(params.page));
  if (params.perPage) qs.set('per_page', String(params.perPage));
  const res = await fetch(`${getApiBase()}/media?${qs.toString()}`, { credentials: 'include' });
  return parseJson<MediaListResponse>(res);
}

export async function getMediaFile(id: number): Promise<MediaFile> {
  const res = await fetch(`${getApiBase()}/media/${id}`, { credentials: 'include' });
  const data = await parseJson<{ data: MediaFile }>(res);
  return data.data;
}

export async function listMediaFolders(): Promise<MediaFolder[]> {
  const res = await fetch(`${getApiBase()}/media/folders`, { credentials: 'include' });
  const data = await parseJson<{ data: MediaFolder[] }>(res);
  return data.data;
}

export async function listMediaTags(): Promise<MediaTag[]> {
  const res = await fetch(`${getApiBase()}/media/tags`, { credentials: 'include' });
  const data = await parseJson<{ data: MediaTag[] }>(res);
  return data.data;
}

export async function createMediaFolder(name: string, parentId: number | null = null): Promise<MediaFolder> {
  const res = await fetch(`${getApiBase()}/media/folders`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parentId }),
  });
  const data = await parseJson<{ data: MediaFolder }>(res);
  return data.data;
}

export async function updateMediaFolder(
  id: number,
  patch: { name?: string; parentId?: number | null; sortOrder?: number }
): Promise<MediaFolder> {
  const res = await fetch(`${getApiBase()}/media/folders/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await parseJson<{ data: MediaFolder }>(res);
  return data.data;
}

export async function deleteMediaFolder(id: number): Promise<void> {
  const res = await fetch(`${getApiBase()}/media/folders/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  await parseJson<{ success: boolean }>(res);
}

export async function uploadMediaFiles(
  files: File[],
  options: {
    folderId?: number | null;
    tags?: string[];
    removeBackground?: boolean;
    bgColor?: string;
  } = {}
): Promise<{ data: MediaFile[]; errors: Array<{ name: string; error: string }> }> {
  const form = new FormData();
  files.forEach((f) => form.append('files[]', f));
  if (options.folderId != null) form.append('folder_id', String(options.folderId));
  if (options.tags?.length) form.append('tags', JSON.stringify(options.tags));
  if (options.removeBackground) form.append('remove_background', '1');
  if (options.bgColor) form.append('bg_color', options.bgColor);

  const res = await fetch(`${getApiBase()}/media`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  return parseJson(res);
}

export async function updateMediaFile(
  id: number,
  patch: {
    title?: string;
    altText?: string;
    description?: string;
    folderId?: number | null;
    status?: MediaStatus;
    tags?: string[];
  }
): Promise<MediaFile> {
  const res = await fetch(`${getApiBase()}/media/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await parseJson<{ data: MediaFile }>(res);
  return data.data;
}

export async function trashMediaFile(id: number): Promise<MediaFile> {
  const res = await fetch(`${getApiBase()}/media/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const data = await parseJson<{ data?: MediaFile; success?: boolean }>(res);
  if (data.data) return data.data;
  throw new Error('Unexpected response');
}

export async function purgeMediaFiles(ids: number[]): Promise<number> {
  const res = await fetch(`${getApiBase()}/media/purge`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const data = await parseJson<{ purged: number }>(res);
  return data.purged;
}

export async function purgeAllMediaTrash(): Promise<number> {
  const res = await fetch(`${getApiBase()}/media/purge-all`, {
    method: 'POST',
    credentials: 'include',
  });
  const data = await parseJson<{ purged: number }>(res);
  return data.purged;
}

export async function transformMediaFile(id: number, options: MediaTransformOptions): Promise<MediaFile> {
  const res = await fetch(`${getApiBase()}/media/${id}/transform`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  const data = await parseJson<{ data: MediaFile }>(res);
  return data.data;
}

export async function batchTransformMediaFiles(
  ids: number[],
  options: MediaTransformOptions
): Promise<{ data: MediaFile[]; errors: Array<{ id: number; error: string }>; transformed: number }> {
  const res = await fetch(`${getApiBase()}/media/batch-transform`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, replace: true, ...options }),
  });
  const data = await parseJson<{
    data?: MediaFile[];
    errors?: Array<{ id: number; error: string }>;
    transformed?: number;
    error?: string;
    success?: boolean;
  }>(res);
  if (!res.ok && data.error && !(data.errors && data.errors.length)) {
    throw new Error(data.error);
  }
  return {
    data: data.data || [],
    errors: data.errors || [],
    transformed: data.transformed ?? (data.data?.length || 0),
  };
}

export async function batchTrashMediaFiles(ids: number[]): Promise<number> {
  const res = await fetch(`${getApiBase()}/media/batch-trash`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const data = await parseJson<{ trashed: number }>(res);
  return data.trashed;
}

/** Build HTML snippet for inserting a media file into rich text. */
export function mediaFileToInsertHtml(file: MediaFile): string {
  const url = file.url || '';
  const title = (file.title || file.originalName || 'Media').replace(/"/g, '&quot;');
  const alt = (file.altText || title).replace(/"/g, '&quot;');
  switch (file.kind) {
    case 'image':
      return `<img src="${url}" alt="${alt}" style="max-width:100%;height:auto;" />`;
    case 'pdf':
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>`;
    case 'video':
      return `<video controls src="${url}" style="max-width:100%;height:auto;"></video>`;
    case 'audio':
      return `<audio controls src="${url}"></audio>`;
    default:
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>`;
  }
}

export function formatMediaSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
