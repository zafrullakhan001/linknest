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
  action_prefix?: string;
  q?: string;
  target_user_id?: number;
  actor_id?: number;
}

function buildQuery(params: UserAuditLogQuery): string {
  const search = new URLSearchParams();
  if (params.page) search.set('page', String(params.page));
  if (params.per_page) search.set('per_page', String(params.per_page));
  if (params.action) search.set('action', params.action);
  if (params.action_prefix) search.set('action_prefix', params.action_prefix);
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

  async purge(olderThanDays?: number): Promise<{ success: boolean; deleted_count: number; older_than_days: number | null }> {
    const body: { older_than_days?: number } = {};
    if (olderThanDays !== undefined && olderThanDays > 0) {
      body.older_than_days = olderThanDays;
    }
    const response = await fetch(`${API_BASE}/user-audit/purge`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to purge audit log');
    }
    return {
      success: !!data.success,
      deleted_count: typeof data.deleted_count === 'number' ? data.deleted_count : 0,
      older_than_days: data.older_than_days ?? null,
    };
  },
};
