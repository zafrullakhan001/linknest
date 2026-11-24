/** In-app documentation guides (docs/*.md via API). */

function resolveApiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) {
    return envBase;
  }
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    if (path !== '/' && path.length > 1) {
      const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
      if (cleanPath && cleanPath !== '/') {
        return `${cleanPath}/api`;
      }
    }
  }
  return '/api';
}

const API_BASE = resolveApiBase();

export interface DocListItem {
  id: string;
  file: string;
  title: string;
  category: string;
  description?: string | null;
}

export interface DocsListPayload {
  docs: DocListItem[];
  categories: Record<string, DocListItem[]>;
  count: number;
}

export interface DocFilePayload {
  file: string;
  title: string;
  category: string;
  markdown: string;
}

async function parseJson(res: Response): Promise<any> {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function listDocs(): Promise<DocsListPayload> {
  const res = await fetch(`${API_BASE}/docs/list`, { credentials: 'include' });
  const data = await parseJson(res);
  return data.data as DocsListPayload;
}

export async function getDoc(name: string): Promise<DocFilePayload> {
  const params = new URLSearchParams({ name });
  const res = await fetch(`${API_BASE}/docs/file?${params.toString()}`, {
    credentials: 'include',
  });
  const data = await parseJson(res);
  return data.data as DocFilePayload;
}
