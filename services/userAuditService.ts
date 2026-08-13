const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface UserAuditLogEntry {
  id: number;
  created_at: number;
  actor_id: number | null;
  actor_username: string | null;
  action: string;
  target_user_id: number | null;
  target_username: string | null;
  details: Record<string, unknown> | string | null;
  ip_address: string | null;
}

export interface UserAuditLogResponse {
  logs: UserAuditLogEntry[];
  total: number;
  page: number;
  per_page: number;
  actions: string[];
}

export interface UserAuditLogQuery {
  page?: number;
  per_page?: number;
  action?: string;
  q?: string;
  target_user_id?: number;
  actor_id?: number;
}

function buildQuery(params: UserAuditLogQuery): string {
  const search = new URLSearchParams();
  if (params.page) search.set('page', String(params.page));
  if (params.per_page) search.set('per_page', String(params.per_page));
  if (params.action) search.set('action', params.action);
  if (params.q) search.set('q', params.q);
  if (params.target_user_id) search.set('target_user_id', String(params.target_user_id));
  if (params.actor_id) search.set('actor_id', String(params.actor_id));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const userAuditService = {
  async list(params: UserAuditLogQuery = {}): Promise<UserAuditLogResponse> {
    const response = await fetch(`${API_BASE}/user-audit${buildQuery(params)}`, {
      method: 'GET',
      credentials: 'include',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load audit log');
    }
    return {
      logs: data.logs || [],
      total: data.total || 0,
      page: data.page || 1,
      per_page: data.per_page || 50,
      actions: data.actions || [],
    };
  },
};
