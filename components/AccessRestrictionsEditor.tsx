import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AccessBrowserName,
  AccessOsName,
  AccessRestrictions,
  AccessTimeRule,
} from '../types';
import { ACCESS_BROWSER_NAMES, ACCESS_OS_NAMES, hasAccessRestrictions } from '../services/accessRestrictionService';
import { formatFingerprintHashDisplay } from '../services/fingerprintService';

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

type PaneId = 'time-host' | 'network-vpn' | 'device' | 'browser' | 'os' | 'country' | 'date' | 'referrer' | 'fingerprint';

const PANES: { id: PaneId; label: string }[] = [
  { id: 'time-host', label: 'Time & host' },
  { id: 'network-vpn', label: 'Network / VPN' },
  { id: 'device', label: 'Device' },
  { id: 'browser', label: 'Browser' },
  { id: 'os', label: 'OS' },
  { id: 'country', label: 'Country' },
  { id: 'date', label: 'Date range' },
  { id: 'referrer', label: 'Referrer' },
  { id: 'fingerprint', label: 'Fingerprint' },
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

function isIpRangePattern(pattern: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  if (p.includes('/')) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}\s*-\s*\d{1,3}(?:\.\d{1,3}){3}$/.test(p)) return true;
  if (p.includes(':') && p.includes('-') && !p.includes('*')) return true;
  return false;
}

function formatHostRules(
  rules: AccessRestrictions['hostRules'],
  mode: 'allow' | 'deny',
  ranges = false
): string {
  return (rules || [])
    .filter((r) => r.mode === mode && isIpRangePattern(r.pattern) === ranges)
    .map((r) => r.pattern)
    .join('\n');
}

function parseHostRules(text: string, mode: 'allow' | 'deny'): NonNullable<AccessRestrictions['hostRules']> {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((pattern) => ({ mode, pattern }));
}

function replaceHostRuleGroup(
  rules: AccessRestrictions['hostRules'],
  mode: 'allow' | 'deny',
  ranges: boolean,
  text: string
): NonNullable<AccessRestrictions['hostRules']> {
  const kept = (rules || []).filter((r) => !(r.mode === mode && isIpRangePattern(r.pattern) === ranges));
  return [...kept, ...parseHostRules(text, mode)];
}

function formatLines(list?: string[] | null): string {
  return (list || []).join('\n');
}

function formatFingerprintLines(list?: string[] | null): string {
  return (list || []).map((line) => formatFingerprintHashDisplay(line)).join('\n');
}

function parseFingerprintLines(text: string): string[] {
  return parseLines(text).map((line) => formatFingerprintHashDisplay(line));
}

function parseLines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function formattedTimeSnapshot(rules: AccessTimeRule[] | undefined): string {
  return `${formatTimeRules(rules, 'allow')}\n---\n${formatTimeRules(rules, 'deny')}`;
}

function PaneHint({ children }: { children: React.ReactNode }): React.ReactElement {
  return <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{children}</p>;
}

function ExampleBox({ title = 'Example', children }: { title?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-600 bg-white/70 dark:bg-slate-800/50 px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-0.5">{title}</p>
      <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{children}</div>
    </div>
  );
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
    case 'fingerprint':
      return !!(value.fingerprintHashes && value.fingerprintHashes.length > 0);
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
  /** Skip the outer card and heading when a parent already provides them. */
  embedded?: boolean;
  /** Collapse behind a header row (like Advanced). Ignored when embedded. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export const AccessRestrictionsEditor: React.FC<AccessRestrictionsEditorProps> = ({
  value,
  onChange,
  disabled = false,
  compact = false,
  embedded = false,
  collapsible = true,
  defaultOpen,
}) => {
  const [pane, setPane] = useState<PaneId>('time-host');
  const [open, setOpen] = useState(() => defaultOpen ?? hasAccessRestrictions(value));
  const current: AccessRestrictions = value || {};
  const [allowTimeText, setAllowTimeText] = useState(() => formatTimeRules(value?.timeRules, 'allow'));
  const [denyTimeText, setDenyTimeText] = useState(() => formatTimeRules(value?.timeRules, 'deny'));
  const lastTimeSnapshot = useRef(formattedTimeSnapshot(value?.timeRules));
  const [fingerprintText, setFingerprintText] = useState(() => formatFingerprintLines(value?.fingerprintHashes));
  const lastFingerprintSnapshot = useRef(formatFingerprintLines(value?.fingerprintHashes));
  const [referrerText, setReferrerText] = useState(() => formatLines(value?.referrerPatterns));
  const lastReferrerSnapshot = useRef(formatLines(value?.referrerPatterns));

  const emit = (next: AccessRestrictions) => {
    onChange(hasAccessRestrictions(next) ? next : null);
  };

  useEffect(() => {
    const next = formattedTimeSnapshot(value?.timeRules);
    if (next === lastTimeSnapshot.current) return;
    lastTimeSnapshot.current = next;
    setAllowTimeText(formatTimeRules(value?.timeRules, 'allow'));
    setDenyTimeText(formatTimeRules(value?.timeRules, 'deny'));
  }, [value?.timeRules]);

  useEffect(() => {
    const next = formatFingerprintLines(value?.fingerprintHashes);
    if (next === lastFingerprintSnapshot.current) return;
    lastFingerprintSnapshot.current = next;
    setFingerprintText(next);
  }, [value?.fingerprintHashes]);

  useEffect(() => {
    const next = formatLines(value?.referrerPatterns);
    if (next === lastReferrerSnapshot.current) return;
    lastReferrerSnapshot.current = next;
    setReferrerText(next);
  }, [value?.referrerPatterns]);

  const commitTimeRules = (allowText: string, denyText: string) => {
    const nextRules = [...parseTimeRules(allowText, 'allow'), ...parseTimeRules(denyText, 'deny')];
    lastTimeSnapshot.current = formattedTimeSnapshot(nextRules);
    emit({ ...current, timeRules: nextRules });
  };

  const stopFieldKeys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' && e.currentTarget instanceof HTMLTextAreaElement) {
      e.nativeEvent.stopImmediatePropagation();
    }
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
  const hasRules = hasAccessRestrictions(current);
  const showCollapseChrome = collapsible && !embedded;

  const clearRestrictions = () => {
    lastTimeSnapshot.current = formattedTimeSnapshot(undefined);
    setAllowTimeText('');
    setDenyTimeText('');
    setFingerprintText('');
    lastFingerprintSnapshot.current = '';
    setReferrerText('');
    lastReferrerSnapshot.current = '';
    onChange(null);
  };

  const clearButton = hasRules ? (
    <button
      type="button"
      disabled={disabled}
      onClick={clearRestrictions}
      className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
    >
      Clear all restrictions
    </button>
  ) : null;

  const fields = (
    <>
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
          <PaneHint>
            Time zone: <code>{timezone}</code>. One rule per line: <code>Day HH:MM-HH:MM</code>. Use <code>Any</code> for every day. Allow lists restrict opening to those windows; block lists always deny those windows.
          </PaneHint>
          <ExampleBox>
            {`Mon 09:00-17:00
Fri 09:00-12:00
Any 00:00-23:59`}
          </ExampleBox>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Times access is allowed
              <textarea
                disabled={disabled}
                rows={3}
                autoComplete="off"
                spellCheck={false}
                className={`${textareaClass} mt-1`}
                placeholder={'Mon 09:00-17:00\nTue 09:00-17:00'}
                value={allowTimeText}
                onKeyDown={stopFieldKeys}
                onChange={(e) => {
                  const text = e.target.value;
                  setAllowTimeText(text);
                  commitTimeRules(text, denyTimeText);
                }}
              />
            </label>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Times access is blocked
              <textarea
                disabled={disabled}
                rows={3}
                autoComplete="off"
                spellCheck={false}
                className={`${textareaClass} mt-1`}
                placeholder={'Sat 00:00-23:59\nSun 00:00-23:59'}
                value={denyTimeText}
                onKeyDown={stopFieldKeys}
                onChange={(e) => {
                  const text = e.target.value;
                  setDenyTimeText(text);
                  commitTimeRules(allowTimeText, text);
                }}
              />
            </label>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Allowed hosts / IPs
              <textarea
                disabled={disabled}
                rows={3}
                autoComplete="off"
                spellCheck={false}
                className={`${textareaClass} mt-1`}
                placeholder={'192.168.10.15\n10.0.*\noffice.example.com'}
                value={formatHostRules(current.hostRules, 'allow')}
                onKeyDown={stopFieldKeys}
                onChange={(e) => emit({
                  ...current,
                  hostRules: replaceHostRuleGroup(current.hostRules, 'allow', false, e.target.value),
                })}
              />
            </label>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Blocked hosts / IPs
              <textarea
                disabled={disabled}
                rows={3}
                autoComplete="off"
                spellCheck={false}
                className={`${textareaClass} mt-1`}
                placeholder={'203.0.113.10\n*.untrusted.example'}
                value={formatHostRules(current.hostRules, 'deny')}
                onKeyDown={stopFieldKeys}
                onChange={(e) => emit({
                  ...current,
                  hostRules: replaceHostRuleGroup(current.hostRules, 'deny', false, e.target.value),
                })}
              />
            </label>
          </div>
          <PaneHint>
            IP ranges are checked against the visitor&apos;s address. Use CIDR (<code>10.0.0.0/8</code>) or start-end (<code>192.168.1.1-192.168.1.254</code>), one per line.
          </PaneHint>
          <ExampleBox title="IP range examples">
            {`10.0.0.0/8
192.168.1.1-192.168.1.254
2001:db8::/32`}
          </ExampleBox>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Allowed IP ranges
              <textarea
                disabled={disabled}
                rows={3}
                autoComplete="off"
                spellCheck={false}
                className={`${textareaClass} mt-1`}
                placeholder={'10.0.0.0/8\n192.168.1.1-192.168.1.254'}
                value={formatHostRules(current.hostRules, 'allow', true)}
                onKeyDown={stopFieldKeys}
                onChange={(e) => emit({
                  ...current,
                  hostRules: replaceHostRuleGroup(current.hostRules, 'allow', true, e.target.value),
                })}
              />
            </label>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Blocked IP ranges
              <textarea
                disabled={disabled}
                rows={3}
                autoComplete="off"
                spellCheck={false}
                className={`${textareaClass} mt-1`}
                placeholder={'203.0.113.0/24\n198.51.100.1-198.51.100.50'}
                value={formatHostRules(current.hostRules, 'deny', true)}
                onKeyDown={stopFieldKeys}
                onChange={(e) => emit({
                  ...current,
                  hostRules: replaceHostRuleGroup(current.hostRules, 'deny', true, e.target.value),
                })}
              />
            </label>
          </div>
        </div>
      )}

      {pane === 'network-vpn' && (
        <div className="space-y-3">
          <PaneHint>
            Use this when the item should only open on a corporate network or VPN. An allow list of IP ranges is enough; the trusted header is optional if your reverse proxy sets one.
          </PaneHint>
          <ExampleBox>
            {`10.0.0.0/8
192.168.1.1-192.168.1.254
Header: X-VPN-Status = active`}
          </ExampleBox>
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
              autoComplete="off"
              spellCheck={false}
              className={`${textareaClass} mt-1`}
              placeholder={'10.0.0.0/8\n192.168.1.1-192.168.1.254'}
              value={current.vpn?.allowedIpRanges || ''}
              onKeyDown={stopFieldKeys}
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
                onKeyDown={stopFieldKeys}
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
                onKeyDown={stopFieldKeys}
                onChange={(e) => emit({ ...current, vpn: { ...(current.vpn || {}), trustedHeaderValue: e.target.value } })}
              />
            </label>
          </div>
        </div>
      )}

      {pane === 'device' && (
        <div className="space-y-3">
          <PaneHint>
            Limits opening by screen class. Desktop means a regular computer. Mobile/tablet covers phones and tablets. Leave as Any device for no extra check.
          </PaneHint>
          <ExampleBox>Desktop only — phones cannot open this item.</ExampleBox>
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
        </div>
      )}

      {pane === 'browser' && (
        <div className="space-y-3">
          <PaneHint>
            Check the browsers that may open this item. If none are checked, any browser is allowed. The number is a minimum version; 0 means any version of that browser.
          </PaneHint>
          <ExampleBox>Chrome 120 — Chrome 120 or newer can open it; unchecked browsers cannot.</ExampleBox>
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
        </div>
      )}

      {pane === 'os' && (
        <div className="space-y-3">
          <PaneHint>
            Check the operating systems that may open this item. If none are checked, any OS is allowed.
          </PaneHint>
          <ExampleBox>Windows + macOS — Android and iOS phones are blocked.</ExampleBox>
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
        </div>
      )}

      {pane === 'country' && (
        <div className="space-y-3">
          <PaneHint>
            Use two-letter ISO country codes, one per line. An allow list means only those countries can open it. A deny list blocks those countries even if they also appear in the allow list.
          </PaneHint>
          <ExampleBox>
            {`US
CA
GB`}
          </ExampleBox>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Allow only these countries
              <textarea
                disabled={disabled}
                rows={3}
                autoComplete="off"
                spellCheck={false}
                className={`${textareaClass} mt-1`}
                placeholder={'US\nCA'}
                value={formatLines(current.countryAllow)}
                onKeyDown={stopFieldKeys}
                onChange={(e) => emit({ ...current, countryAllow: parseLines(e.target.value).map((c) => c.toUpperCase()) })}
              />
            </label>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Deny these countries
              <textarea
                disabled={disabled}
                rows={3}
                autoComplete="off"
                spellCheck={false}
                className={`${textareaClass} mt-1`}
                placeholder={'CN\nRU'}
                value={formatLines(current.countryDeny)}
                onKeyDown={stopFieldKeys}
                onChange={(e) => emit({ ...current, countryDeny: parseLines(e.target.value).map((c) => c.toUpperCase()) })}
              />
            </label>
          </div>
        </div>
      )}

      {pane === 'date' && (
        <div className="space-y-3">
          <PaneHint>
            Optional calendar window. Opening is blocked before the start date and after the end date. Leave either field blank for no start or no end.
          </PaneHint>
          <ExampleBox>Valid from 2026-01-01 until 2026-12-31</ExampleBox>
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
        </div>
      )}

      {pane === 'referrer' && (
        <div className="space-y-3">
          <PaneHint>
            The referrer is the page the browser came from when this item was opened. If you list prefixes here, the item can only be opened when the incoming page URL starts with one of them. Bookmarks, pasted URLs, and most “open in new tab” links send no referrer and will be blocked.
          </PaneHint>
          <ExampleBox title="Example prefixes">
            {`https://intranet.example.com/
https://app.company.com/dashboard
https://mail.google.com/`}
          </ExampleBox>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Allowed referrer prefixes (one per line)
            <textarea
              disabled={disabled}
              rows={4}
              autoComplete="off"
              spellCheck={false}
              className={`${textareaClass} mt-1`}
              placeholder={'https://intranet.example.com/\nhttps://app.company.com/dashboard'}
              value={referrerText}
              onKeyDown={stopFieldKeys}
              onKeyDownCapture={stopFieldKeys}
              onChange={(e) => {
                const text = e.target.value;
                setReferrerText(text);
                const parsed = parseLines(text);
                lastReferrerSnapshot.current = formatLines(parsed);
                emit({ ...current, referrerPatterns: parsed });
              }}
            />
          </label>
        </div>
      )}

      {pane === 'fingerprint' && (
        <div className="space-y-3">
          <PaneHint>
            Only browsers whose fingerprint hash matches a value below can open this item. Copy the hash from Help &amp; About → Fingerprint on the allowed device after choosing which signals to include (exclude IP address, hostname, and other changing values if the hash should stay stable). Include location there if GPS should be part of the key; GPS is matched within about 1 mile. One hash per line.
          </PaneHint>
          <ExampleBox title="Example">
            {`lnfp_a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff00`}
          </ExampleBox>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Allowed fingerprint hashes (one per line)
            <textarea
              disabled={disabled}
              rows={5}
              autoComplete="off"
              spellCheck={false}
              className={`${textareaClass} mt-1`}
              placeholder={'lnfp_…\nlnfp_…'}
              value={fingerprintText}
              onKeyDown={stopFieldKeys}
              onKeyDownCapture={stopFieldKeys}
              onChange={(e) => {
                const text = e.target.value;
                setFingerprintText(text);
                const parsed = parseFingerprintLines(text);
                lastFingerprintSnapshot.current = formatFingerprintLines(parsed);
                emit({ ...current, fingerprintHashes: parsed });
              }}
            />
          </label>
        </div>
      )}
    </>
  );

  const description = (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      Optional. Items stay visible; opening is blocked when a check fails. Leave blank for no extra gate.
    </p>
  );

  if (embedded) {
    return (
      <div>
        <div className="mb-3 space-y-2">
          {description}
          {clearButton}
        </div>
        {fields}
      </div>
    );
  }

  if (showCollapseChrome) {
    return (
      <div className="rounded-xl border-2 overflow-hidden shadow-sm border-slate-200 dark:border-slate-700">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg bg-slate-200/80 dark:bg-slate-700" aria-hidden>
            🛡️
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Additional access restrictions</span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Optional extra gate when opening
            </span>
          </span>
          {hasRules ? <AccessRestrictionsBadge rules={current} /> : null}
          <svg
            className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {open && (
          <div className={`${compact ? 'px-3 py-3' : 'px-3.5 py-3.5'} space-y-3 border-t border-slate-100 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/40`}>
            {description}
            {clearButton}
            {fields}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-700 ${compact ? 'p-3' : 'p-4'} bg-slate-50/80 dark:bg-slate-900/40`}>
      <div className="mb-3 space-y-2">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Additional access restrictions</h4>
        {description}
        {clearButton}
      </div>
      {fields}
    </div>
  );
};
