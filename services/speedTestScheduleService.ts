import { resolveApiBase } from './apiHelpers';
import { SpeedTestResult } from './speedTestService';

const API_BASE = resolveApiBase();

export interface SpeedTestScheduleRow {
  id: number;
  name: string;
  target: 'internet' | 'server';
  profile: 'quick' | 'standard' | 'thorough';
  executor: 'browser' | 'worker';
  owner_user_id: number | null;
  interval_minutes: number;
  is_enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpeedTestStoredResult {
  id: number;
  schedule_id: number | null;
  executor: 'browser' | 'worker';
  target: string;
  profile: string;
  run_at: string;
  duration_ms: number | null;
  status: string;
  result_json: string | null;
  created_by: number | null;
  trigger: string;
  parsed?: SpeedTestResult | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/speedtest${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function listSpeedTestSchedules(): Promise<SpeedTestScheduleRow[]> {
  const json = await api<{ data: SpeedTestScheduleRow[] }>('/schedules');
  return json.data || [];
}

export async function createSpeedTestSchedule(payload: {
  name: string;
  target: 'internet' | 'server';
  profile: 'quick' | 'standard' | 'thorough';
  executor: 'browser' | 'worker';
  interval_minutes: number;
  is_enabled?: boolean;
}): Promise<SpeedTestScheduleRow> {
  const json = await api<{ data: SpeedTestScheduleRow }>('/schedules', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return json.data;
}

export async function updateSpeedTestSchedule(
  id: number,
  payload: Partial<{
    name: string;
    target: 'internet' | 'server';
    profile: 'quick' | 'standard' | 'thorough';
    interval_minutes: number;
    is_enabled: boolean;
  }>
): Promise<SpeedTestScheduleRow> {
  const json = await api<{ data: SpeedTestScheduleRow }>(`/schedules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return json.data;
}

export async function deleteSpeedTestSchedule(id: number): Promise<void> {
  await api(`/schedules/${id}`, { method: 'DELETE' });
}

export async function listSpeedTestServerResults(limit = 40): Promise<SpeedTestStoredResult[]> {
  const json = await api<{ data: SpeedTestStoredResult[] }>(`/results?limit=${limit}`);
  return (json.data || []).map((row) => {
    let parsed: SpeedTestResult | null = null;
    if (row.result_json) {
      try {
        parsed = JSON.parse(row.result_json) as SpeedTestResult;
      } catch {
        parsed = null;
      }
    }
    return { ...row, parsed };
  });
}

export async function postSpeedTestResult(result: SpeedTestResult, trigger: 'manual' | 'scheduled' = 'manual'): Promise<void> {
  await api('/results', {
    method: 'POST',
    body: JSON.stringify({
      trigger,
      result,
    }),
  });
}

export async function getSpeedTestStatus(): Promise<{
  interactive_remaining: number;
  worker_bytes_today: number;
  worker_daily_cap_bytes: number;
  worker_running: boolean;
  last_worker_result: SpeedTestStoredResult | null;
}> {
  const json = await api<{ data: any }>('/status');
  return json.data;
}

export async function runWorkerSpeedTestNow(scheduleId?: number): Promise<void> {
  await api('/run-now', {
    method: 'POST',
    body: JSON.stringify({ schedule_id: scheduleId ?? null }),
  });
}
