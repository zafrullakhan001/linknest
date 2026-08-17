import React, { useMemo, useState } from 'react';
import type {
  AccessBrowserName,
  AccessOsName,
  AccessRestrictions,
  AccessTimeRule,
} from '../types';
import { ACCESS_BROWSER_NAMES, ACCESS_OS_NAMES, hasAccessRestrictions } from '../services/accessRestrictionService';

const DAY_LABELS: { n: number | null; label: string }[] = [
  { n: null, label: 'Any' },
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
  { n: 7, label: 'Sun' },
];

const DAY_MAP: Record<string, number | null> = {
  any: null, all: null,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
  sun: 7, sunday: 7,
};

const BROWSER_LABELS: Record<AccessBrowserName, string> = {
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  safari: 'Safari',
  opera: 'Opera',
  brave: 'Brave',
  vivaldi: 'Vivaldi',
  duckduckgo: 'DuckDuckGo',
};

const OS_LABELS: Record<AccessOsName, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
};

type PaneId = 'time-host' | 'network-vpn' | 'device' | 'browser' | 'os' | 'country' | 'date' | 'referrer';

const PANES: { id: PaneId; label: string }[] = [
  { id: 'time-host', label: 'Time & host' },
  { id: 'network-vpn', label: 'Network / VPN' },
  { id: 'device', label: 'Device' },
  { id: 'browser', label: 'Browser' },
  { id: 'os', label: 'OS' },
  { id: 'country', label: 'Country' },
  { id: 'date', label: 'Date range' },
  { id: 'referrer', label: 'Referrer' },
];

function formatTimeRules(rules: AccessTimeRule[] | undefined, mode: 'allow' | 'deny'): string {
  return (rules || [])
    .filter((r) => r.mode === mode)
    .map((r) => {
      const day = DAY_LABELS.find((d) => d.n === (r.dayOfWeek ?? null))?.label || 'Any';
      const start = (r.startTime || '00:00').slice(0, 5);
      const end = (r.endTime || '23:59').slice(0, 5);
      return `${day} ${start}-${end}`;
    })
    .join('\n');
}

function parseTimeRules(text: string, mode: 'allow' | 'deny'): AccessTimeRule[] {
  const out: AccessTimeRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z]+)\s+(\d{1,2}:\d{2})(?::\d{2})?\s*-\s*(\d{1,2}:\d{2})(?::\d{2})?$/);
    if (!m) continue;
    const dayKey = m[1].toLowerCase();
    if (!(dayKey in DAY_MAP)) continue;
    out.push({
      mode,
      dayOfWeek: DAY_MAP[dayKey],
      startTime: m[2].length === 5 ? `${m[2]}:00` : m[2],
      endTime: m[3].length === 5 ? `${m[3]}:00` : m[3],
    });
  }
  return out;
}

function formatHostRules(rules: AccessRestrictions['hostRules'], mode: 'allow' | 'deny'): string {
  return (rules || []).filter((r) => r.mode === mode).map((r) => r.pattern).join('\n');
}

function parseHostRules(text: string, mode: 'allow' | 'deny'): NonNullable<AccessRestrictions['hostRules']> {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((pattern) => ({ mode, pattern }));
}

function formatLines(list?: string[] | null): string {
  return (list || []).join('\n');
}

function parseLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function paneHasValues(id: PaneId, value: AccessRestrictions): boolean {
  switch (id) {
    case 'time-host':
      return !!(value.timeRules?.length || value.hostRules?.length);
    case 'network-vpn':
      return !!(value.vpn?.required || value.vpn?.allowedIpRanges || value.vpn?.trustedHeaderName);
    case 'device':
      return !!(value.allowedDeviceType && value.allowedDeviceType !== 'any');
    case 'browser':
      return !!(value.browsers && value.browsers.length > 0);
    case 'os':
      return !!(value.osAllow && value.osAllow.length > 0);
    case 'country':
      return !!(value.countryAllow?.length || value.countryDeny?.length);
    case 'date':
      return !!(value.validFrom || value.validUntil);
    case 'referrer':
      return !!(value.referrerPatterns && value.referrerPatterns.length > 0);
    default:
      return false;
  }
}

export function AccessRestrictionsBadge({ rules }: { rules?: AccessRestrictions | null }): React.ReactElement | null {
  if (!hasAccessRestrictions(rules)) return null;
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px]"
      title="Open-time access restrictions are configured"
    >
      🛡️
    </span>
  );
}

interface AccessRestrictionsEditorProps {
  value?: AccessRestrictions | null;
  onChange: (next: AccessRestrictions | null | undefined) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const AccessRestrictionsEditor: React.FC<AccessRestrictionsEditorProps> = ({
  value,
  onChange,
  disabled = false,
  compact = false,
}) => {
  const [pane, setPane] = useState<PaneId>('time-host');
  const current: AccessRestrictions = value || {};

  const emit = (next: AccessRestrictions) => {
    onChange(hasAccessRestrictions(next) ? next : null);
  };

  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
    } catch {
      return 'local';
    }
  }, []);

  const textareaClass = 'w-full text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 font-mono';
  const inputClass = 'w-full text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5';

  return (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-700 ${compact ? 'p-3' : 'p-4'} bg-slate-50/80 dark:bg-slate-900/40`}>
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Additional access restrictions</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Optional. Items stay visible; opening is blocked when a check fails. Leave blank for no extra gate.
        </p>
        {hasAccessRestrictions(current) && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
          >
            Clear all restrictions
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="Restriction sections">
        {PANES.map((p, idx) => {
          const active = pane === p.id;
          const marked = paneHasValues(p.id, current);
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => setPane(p.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                active
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-brand-400'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'}`}>
                {idx + 1}
              </span>
              {p.label}
              {marked ? <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="Has values" /> : null}
            </button>
          );
        })}
      </div>

      {pane === 'time-host' && (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-500">Time zone: <code>{timezone}</code>. Format: <code>Mon 09:00-17:00</code> or <code>Any 00:00-23:59</code>.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Times access is allowed
              <textarea
                disabled={disabled}
                rows={3}
                className={`${textareaClass} mt-1`}
                placeholder={'Mon 09:00-17:00\nTue 09:00-17:00'}
                value={formatTimeRules(current.timeRules, 'allow')}
                onChange={(e) => emit({
                  ...current,
                  timeRules: [...parseTimeRules(e.target.value, 'allow'), ...parseTimeRules(formatTimeRules(current.timeRules, 'deny'), 'deny')],
                })}
              />
            </label>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Times access is blocked
              <textarea
                disabled={disabled}
                rows={3}
                className={`${textareaClass} mt-1`}
                placeholder={'Sat 00:00-23:59\nSun 00:00-23:59'}
                value={formatTimeRules(current.timeRules, 'deny')}
                onChange={(e) => emit({
                  ...current,
                  timeRules: [...parseTimeRules(formatTimeRules(current.timeRules, 'allow'), 'allow'), ...parseTimeRules(e.target.value, 'deny')],
                })}
              />
            </label>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Allowed hosts / IPs
              <textarea
                disabled={disabled}
                rows={3}
                className={`${textareaClass} mt-1`}
                placeholder={'192.168.10.15\n10.0.*'}
                value={formatHostRules(current.hostRules, 'allow')}
                onChange={(e) => emit({
                  ...current,
                  hostRules: [...parseHostRules(e.target.value, 'allow'), ...parseHostRules(formatHostRules(current.hostRules, 'deny'), 'deny')],
                })}
              />
            </label>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Blocked hosts / IPs
              <textarea
                disabled={disabled}
                rows={3}
                className={`${textareaClass} mt-1`}
                value={formatHostRules(current.hostRules, 'deny')}
                onChange={(e) => emit({
                  ...current,
                  hostRules: [...parseHostRules(formatHostRules(current.hostRules, 'allow'), 'allow'), ...parseHostRules(e.target.value, 'deny')],
                })}
              />
            </label>
          </div>
        </div>
      )}

      {pane === 'network-vpn' && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              disabled={disabled}
              checked={!!current.vpn?.required}
              onChange={(e) => emit({ ...current, vpn: { ...(current.vpn || {}), required: e.target.checked } })}
            />
            Require VPN / corporate network
          </label>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Allowed IP ranges (CIDR, wildcard, or start-end)
            <textarea
              disabled={disabled}
              rows={3}
              className={`${textareaClass} mt-1`}
              placeholder={'10.0.0.0/8\n192.168.1.1-192.168.1.254'}
              value={current.vpn?.allowedIpRanges || ''}
              onChange={(e) => emit({ ...current, vpn: { ...(current.vpn || {}), allowedIpRanges: e.target.value } })}
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Trusted header name
              <input
                disabled={disabled}
                className={`${inputClass} mt-1`}
                placeholder="X-VPN-Status"
                value={current.vpn?.trustedHeaderName || ''}
                onChange={(e) => emit({ ...current, vpn: { ...(current.vpn || {}), trustedHeaderName: e.target.value } })}
              />
            </label>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Trusted header value (optional)
              <input
                disabled={disabled}
                className={`${inputClass} mt-1`}
                placeholder="active"
                value={current.vpn?.trustedHeaderValue || ''}
                onChange={(e) => emit({ ...current, vpn: { ...(current.vpn || {}), trustedHeaderValue: e.target.value } })}
              />
            </label>
          </div>
        </div>
      )}

      {pane === 'device' && (
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Allowed device type
          <select
            disabled={disabled}
            className={`${inputClass} mt-1 max-w-xs`}
            value={current.allowedDeviceType || 'any'}
            onChange={(e) => emit({ ...current, allowedDeviceType: e.target.value as AccessRestrictions['allowedDeviceType'] })}
          >
            <option value="any">Any device</option>
            <option value="desktop">Desktop only</option>
            <option value="mobile">Mobile/tablet only</option>
          </select>
        </label>
      )}

      {pane === 'browser' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ACCESS_BROWSER_NAMES.map((name) => {
            const rule = (current.browsers || []).find((b) => b.name === name);
            return (
              <label key={name} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={!!rule}
                  onChange={(e) => {
                    const rest = (current.browsers || []).filter((b) => b.name !== name);
                    emit({
                      ...current,
                      browsers: e.target.checked ? [...rest, { name, minVersion: rule?.minVersion || 0 }] : rest,
                    });
                  }}
                />
                <span className="w-24">{BROWSER_LABELS[name]}</span>
                <input
                  type="number"
                  min={0}
                  disabled={disabled || !rule}
                  className={`${inputClass} w-20`}
                  placeholder="min"
                  value={rule?.minVersion ?? 0}
                  onChange={(e) => {
                    const rest = (current.browsers || []).filter((b) => b.name !== name);
                    emit({ ...current, browsers: [...rest, { name, minVersion: Math.max(0, Number(e.target.value) || 0) }] });
                  }}
                />
              </label>
            );
          })}
        </div>
      )}

      {pane === 'os' && (
        <div className="flex flex-wrap gap-3">
          {ACCESS_OS_NAMES.map((os) => {
            const checked = (current.osAllow || []).includes(os);
            return (
              <label key={os} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={checked}
                  onChange={(e) => {
                    const rest = (current.osAllow || []).filter((o) => o !== os);
                    emit({ ...current, osAllow: e.target.checked ? [...rest, os] : rest });
                  }}
                />
                {OS_LABELS[os]}
              </label>
            );
          })}
        </div>
      )}

      {pane === 'country' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Allow only these countries
            <textarea
              disabled={disabled}
              rows={3}
              className={`${textareaClass} mt-1`}
              placeholder={'US\nCA'}
              value={formatLines(current.countryAllow)}
              onChange={(e) => emit({ ...current, countryAllow: parseLines(e.target.value).map((c) => c.toUpperCase()) })}
            />
          </label>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Deny these countries
            <textarea
              disabled={disabled}
              rows={3}
              className={`${textareaClass} mt-1`}
              value={formatLines(current.countryDeny)}
              onChange={(e) => emit({ ...current, countryDeny: parseLines(e.target.value).map((c) => c.toUpperCase()) })}
            />
          </label>
        </div>
      )}

      {pane === 'date' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Valid from
            <input
              type="date"
              disabled={disabled}
              className={`${inputClass} mt-1`}
              value={current.validFrom || ''}
              onChange={(e) => emit({ ...current, validFrom: e.target.value || null })}
            />
          </label>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Valid until
            <input
              type="date"
              disabled={disabled}
              className={`${inputClass} mt-1`}
              value={current.validUntil || ''}
              onChange={(e) => emit({ ...current, validUntil: e.target.value || null })}
            />
          </label>
        </div>
      )}

      {pane === 'referrer' && (
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Allowed referrer prefixes (one per line)
          <textarea
            disabled={disabled}
            rows={3}
            className={`${textareaClass} mt-1`}
            placeholder="https://intranet.example.com/"
            value={formatLines(current.referrerPatterns)}
            onChange={(e) => emit({ ...current, referrerPatterns: parseLines(e.target.value) })}
          />
        </label>
      )}
    </div>
  );
};
