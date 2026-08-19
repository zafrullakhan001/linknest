import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collectFingerprint,
  clearFingerprintCache,
  lookupFingerprintRegistry,
  registerFingerprintTag,
  type FingerprintAttribute,
  type FingerprintResult,
  type FingerprintRegistryLookup,
} from '../services/fingerprintService';

const GROUP_META: Record<
  FingerprintAttribute['group'],
  { label: string; emoji: string; wrap: string; heading: string; stripeEven: string; stripeOdd: string }
> = {
  http: {
    label: 'HTTP headers',
    emoji: '📡',
    wrap: 'border-sky-200/80 dark:border-sky-800/50',
    heading: 'text-sky-800 dark:text-sky-200',
    stripeEven: 'bg-sky-50/70 dark:bg-sky-950/25',
    stripeOdd: 'bg-white/80 dark:bg-slate-900/30',
  },
  extensions: {
    label: 'LinkNest extensions',
    emoji: '🧩',
    wrap: 'border-violet-200/80 dark:border-violet-800/50',
    heading: 'text-violet-800 dark:text-violet-200',
    stripeEven: 'bg-violet-50/70 dark:bg-violet-950/25',
    stripeOdd: 'bg-white/80 dark:bg-slate-900/30',
  },
  javascript: {
    label: 'Javascript attributes',
    emoji: '⚙️',
    wrap: 'border-amber-200/80 dark:border-amber-800/50',
    heading: 'text-amber-800 dark:text-amber-200',
    stripeEven: 'bg-amber-50/60 dark:bg-amber-950/20',
    stripeOdd: 'bg-white/80 dark:bg-slate-900/30',
  },
  geo: {
    label: 'Geographic location',
    emoji: '🌍',
    wrap: 'border-emerald-200/80 dark:border-emerald-800/50',
    heading: 'text-emerald-800 dark:text-emerald-200',
    stripeEven: 'bg-emerald-50/70 dark:bg-emerald-950/20',
    stripeOdd: 'bg-white/80 dark:bg-slate-900/30',
  },
};

const ATTR_EMOJI: Record<string, string> = {
  'User agent': '🧭',
  Accept: '📥',
  'Content encoding': '🗜️',
  'Content language': '🗣️',
  'Upgrade Insecure Requests': '🔒',
  Referer: '🔗',
  'Bookmark Sync': '🔖',
  'Browser Launcher Pro': '🚀',
  Platform: '💻',
  'Cookies enabled': '🍪',
  Timezone: '🕒',
  Canvas: '🎨',
  'List of fonts (JS)': '🔤',
  'Use of Adblock': '🛡️',
  'Do Not Track': '🚫',
  'Navigator properties': '🧭',
  BuildID: '🏷️',
  Product: '📦',
  'Product sub': '📦',
  Vendor: '🏪',
  'Vendor sub': '🏪',
  'Hardware concurrency': '🧠',
  'Java enabled': '☕',
  'Device memory': '💾',
  'List of plugins': '🔌',
  'Screen width': '🖥️',
  'Screen height': '🖥️',
  'Screen depth': '🌈',
  'Screen available top': '⬆️',
  'Screen available Left': '⬅️',
  'Screen available Height': '↕️',
  'Screen available width': '↔️',
  Permissions: '🛂',
  'WebGL Vendor': '🎮',
  'WebGL Renderer': '🎮',
  'WebGL Data': '🎮',
  'WebGL Parameters': '🎮',
  'Use of local storage': '🗄️',
  'Use of session storage': '🗂️',
  'Use of IndexedDB': '📚',
  'Audio formats': '🔊',
  'Audio context': '🎚️',
  'Frequency analyser': '📈',
  'Audio data': '🎵',
  'Video formats': '🎬',
  'Media devices': '📷',
  Accelerometer: '📳',
  Gyroscope: '🌀',
  'Proximity sensor': '📡',
  'Keyboard layout': '⌨️',
  Battery: '🔋',
  Connection: '📶',
  key: '🔑',
  'Location bar': '📍',
  'Menu bar': '📋',
  'Personal bar': '⭐',
  'Status bar': '📊',
  'Tool bar': '🧰',
  'Result state': '📌',
  'List of fonts (Flash)': '⚡',
  'Screen resolution (Flash)': '⚡',
  'Language (Flash)': '⚡',
  'Platform (Flash)': '⚡',
  'Public IP address': '🌐',
  'Machine / host name': '🖥️',
  'Local IP addresses': '🏠',
  'MAC address': '🪪',
  Country: '🗺️',
  Region: '🏞️',
  City: '🏙️',
  'IP country': '🗺️',
  'IP region': '🏞️',
  'IP city': '🏙️',
  'IP timezone': '🕒',
  GPS: '📍',
};

function attributeEmoji(name: string): string {
  if (ATTR_EMOJI[name]) return ATTR_EMOJI[name];
  const n = name.toLowerCase();
  if (n.includes('font')) return '🔤';
  if (n.includes('screen')) return '🖥️';
  if (n.includes('audio')) return '🔊';
  if (n.includes('video')) return '🎬';
  if (n.includes('webgl')) return '🎮';
  if (n.includes('ip')) return '🌐';
  if (n.includes('gps') || n.includes('location')) return '📍';
  if (n.includes('country')) return '🌍';
  if (n.includes('city')) return '🏙️';
  if (n.includes('battery')) return '🔋';
  if (n.includes('plugin')) return '🔌';
  if (n.includes('sync')) return '🔖';
  if (n.includes('launcher') || n.includes('pro')) return '🚀';
  return '🔹';
}

export const HelpFingerprintPanel: React.FC = () => {
  const [result, setResult] = useState<FingerprintResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState('');
  const [tagName, setTagName] = useState('');
  const [registry, setRegistry] = useState<FingerprintRegistryLookup | null>(null);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const refreshRegistry = useCallback(async (hash: string) => {
    setRegistryLoading(true);
    try {
      const found = await lookupFingerprintRegistry(hash);
      setRegistry(found);
    } catch {
      setRegistry(null);
    } finally {
      setRegistryLoading(false);
    }
  }, []);

  const load = useCallback(async (opts?: { forceGps?: boolean }) => {
    setError(null);
    setSaveMessage(null);
    if (!opts?.forceGps) setLoading(true);
    try {
      if (!opts?.forceGps) clearFingerprintCache();
      const next = await collectFingerprint({ forceGps: opts?.forceGps, skipCache: true, includePlace: true });
      setResult(next);
      await refreshRegistry(next.hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not collect fingerprint.');
    } finally {
      setLoading(false);
      setGpsLoading(false);
    }
  }, [refreshRegistry]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyHash = async () => {
    if (!result?.hashDisplay) return;
    try {
      await navigator.clipboard.writeText(result.hashDisplay);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy to clipboard.');
    }
  };

  const includeGps = async () => {
    setGpsLoading(true);
    await load({ forceGps: true });
  };

  const saveTag = async () => {
    if (!result?.hash) return;
    const tag = tagName.trim();
    if (!tag) {
      setError('Enter a tag name for this fingerprint (for example Office PC).');
      return;
    }
    setSaveBusy(true);
    setError(null);
    setSaveMessage(null);
    try {
      const saved = await registerFingerprintTag(result.hash, tag);
      setRegistry(saved);
      setSaveMessage(`Saved as “${saved.savedTag || tag}”.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save fingerprint tag.');
    } finally {
      setSaveBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const attrs = result?.attributes || [];
    if (!q) return attrs;
    return attrs.filter(
      (a) => a.name.toLowerCase().includes(q) || a.value.toLowerCase().includes(q) || a.group.includes(q)
    );
  }, [result, filter]);

  const grouped = useMemo(() => {
    const map: Record<FingerprintAttribute['group'], FingerprintAttribute[]> = {
      http: [],
      extensions: [],
      javascript: [],
      geo: [],
    };
    for (const a of filtered) map[a.group].push(a);
    return map;
  }, [filtered]);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-violet-200/70 dark:border-violet-800/40 bg-gradient-to-br from-violet-50/80 via-white to-sky-50/70 dark:from-violet-950/30 dark:via-slate-900/40 dark:to-sky-950/20 p-4">
        <h3 className="text-xl font-semibold text-violet-900 dark:text-violet-100 mb-2 flex items-center gap-2">
          <span aria-hidden="true">🪪</span> Browser fingerprint
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Signals collected from this browser (similar to AmIUnique). Copy the hash and paste it into
          a space, tab, or link under <span className="font-medium text-violet-700 dark:text-violet-300">Access restrictions → Fingerprint</span>.
          Battery level, connection speed, and referer are shown but not hashed. GPS is added to the hash
          only after you accept location, using about a 1 mile radius so nearby movement stays valid.
          Public IP (and local IPs when the browser exposes them) are included in the hash. MAC address
          cannot be read by a web page. Bookmark Sync and Browser Launcher Pro are shown if installed,
          but they are not part of the hash.
        </p>
      </section>

      <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-800/50 bg-gradient-to-br from-indigo-50/90 to-violet-50/70 dark:from-indigo-950/35 dark:to-slate-900/50 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
            <span aria-hidden="true">🔐</span> Fingerprint hash
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void includeGps()}
              disabled={gpsLoading || loading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50"
            >
              <span aria-hidden="true">{gpsLoading ? '⏳' : '📍'}</span>{' '}
              {gpsLoading ? 'Requesting location…' : result?.gpsIncluded ? 'Refresh location' : 'Include my location'}
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/80 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900/50 disabled:opacity-50"
            >
              <span aria-hidden="true">🔄</span> Refresh
            </button>
            <button
              type="button"
              onClick={() => void copyHash()}
              disabled={!result?.hashDisplay || loading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50"
            >
              <span aria-hidden="true">{copied ? '✅' : '📋'}</span> {copied ? 'Copied' : 'Copy hash'}
            </button>
          </div>
        </div>
        <code className="block break-all text-sm font-mono text-violet-900 dark:text-violet-100 bg-white/85 dark:bg-slate-900/70 rounded-lg px-3 py-2 border border-violet-200/80 dark:border-violet-800/50">
          {loading && !result ? '✨ Collecting…' : result?.hashDisplay || 'Unavailable'}
        </code>
        {result?.publicIp ? (
          <p className="text-xs text-indigo-800/80 dark:text-indigo-200/80">
            <span aria-hidden="true">🌐</span> Public IP in this hash:{' '}
            <span className="font-mono">{result.publicIp}</span>
            {result.hostname ? (
              <>
                {' '}
                · <span aria-hidden="true">🖥️</span> Host: <span className="font-mono">{result.hostname}</span>
              </>
            ) : null}
            {result.localIps?.length ? ` · 🏠 Local: ${result.localIps.join(', ')}` : ''}
            . Changing network, VPN, or machine name can change the hash.
          </p>
        ) : null}
        {result?.gpsIncluded ? (
          <p className="text-xs text-emerald-800 dark:text-emerald-300 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/30 px-2.5 py-1.5">
            <span aria-hidden="true">📍</span> GPS included in this hash ({result.gps?.lat}, {result.gps?.lon}
            {result.gpsPlace?.city && result.gpsPlace.city !== 'Unknown'
              ? ` · ${[result.gpsPlace.city, result.gpsPlace.region, result.gpsPlace.country_name].filter((p) => p && p !== 'Unknown').join(', ')}`
              : ''}
            ). Coordinates are bucketed to about a 1 mile radius, so moving nearby usually keeps the same hash. City and country from GPS are display only.
          </p>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <span aria-hidden="true">🗺️</span> Location is IP country/region/timezone only until you click Include my location.
          </p>
        )}
        {result ? (
          <p className="text-xs text-violet-700/80 dark:text-violet-300/80">
            <span aria-hidden="true">🧩</span> Extensions (display only, not hashed): Bookmark Sync{' '}
            {result.extensions?.some((e) => e.kind === 'bookmark-sync') ? '✅ detected' : '○ not detected'}
            {' · '}
            Browser Launcher Pro{' '}
            {result.extensions?.some((e) => e.kind === 'launcher-pro') ? '✅ detected' : '○ not detected'}
          </p>
        ) : null}
      </div>

      {result && !loading ? (
        <div
          className={`rounded-xl border p-4 space-y-3 ${
            registry?.unique
              ? 'border-emerald-200/80 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50/90 to-teal-50/60 dark:from-emerald-950/30 dark:to-slate-900/40'
              : 'border-amber-200/80 dark:border-amber-800/50 bg-gradient-to-br from-amber-50/90 to-orange-50/50 dark:from-amber-950/25 dark:to-slate-900/40'
          }`}
        >
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <span aria-hidden="true">✨</span> Are you unique?
          </h4>
          {registryLoading ? (
            <p className="text-sm text-slate-500">⏳ Checking the fingerprint registry…</p>
          ) : !registry ? (
            <p className="text-sm text-slate-500">Could not check the fingerprint registry yet.</p>
          ) : registry.unique ? (
            <p className="text-base font-semibold text-emerald-800 dark:text-emerald-300">
              <span aria-hidden="true">🎉</span> Yes! You are unique among the {Number(registry.total || 1).toLocaleString()} fingerprints in our entire dataset.
              {registry.matches[0]?.tag ? (
                <span className="block mt-1 text-sm font-normal text-slate-600 dark:text-slate-400">
                  <span aria-hidden="true">🏷️</span> Stored tag:{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{registry.matches[0].tag}</span>
                  {registry.matches[0].username ? ` · ${registry.matches[0].username}` : ''}
                </span>
              ) : (
                <span className="block mt-1 text-sm font-normal text-slate-500 dark:text-slate-400">
                  Save a tag name below to add this fingerprint to the dataset.
                </span>
              )}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-base font-semibold text-amber-800 dark:text-amber-300">
                <span aria-hidden="true">🤝</span> Almost! Only {Number(registry.count).toLocaleString()} of the {Number(registry.total).toLocaleString()} fingerprints in our entire dataset have exactly the same fingerprint as yours ({Number(registry.percent || 0).toLocaleString()}%).
              </p>
              <p className="text-xs font-medium text-amber-800/80 dark:text-amber-300/80">🏷️ Matching tags</p>
              <ul className="list-none space-y-1 text-sm text-slate-700 dark:text-slate-200">
                {registry.matches.map((m) => (
                  <li key={`${m.tag}-${m.updatedAt || ''}`} className="rounded-lg bg-white/70 dark:bg-slate-900/40 px-2.5 py-1.5">
                    <span aria-hidden="true">🏷️</span>{' '}
                    <span className="font-semibold">{m.tag}</span>
                    {m.username ? <span className="text-slate-500"> · {m.username}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <label className="block flex-1 text-xs font-medium text-slate-700 dark:text-slate-300">
              🏷️ Tag name
              <input
                type="text"
                maxLength={80}
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void saveTag();
                  }
                }}
                placeholder="e.g. Office PC, Home laptop"
                className="mt-1 w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-100"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveTag()}
              disabled={saveBusy || !tagName.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 shrink-0"
            >
              <span aria-hidden="true">{saveBusy ? '⏳' : '💾'}</span> {saveBusy ? 'Saving…' : 'Save to registry'}
            </button>
          </div>
          {saveMessage ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">✅ {saveMessage}</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-rose-700 dark:text-rose-400 rounded-lg bg-rose-50 dark:bg-rose-950/30 px-3 py-2">
          ⚠️ {error}
        </p>
      ) : null}

      <label className="block">
        <span className="sr-only">Search for an attribute</span>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="🔍 Search for an attribute"
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-100"
        />
      </label>

      {(['http', 'extensions', 'javascript', 'geo'] as const).map((group) => {
        const rows = grouped[group];
        if (!rows.length && filter) return null;
        const meta = GROUP_META[group];
        return (
          <section key={group}>
            <h4 className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${meta.heading}`}>
              <span aria-hidden="true">{meta.emoji}</span> {meta.label}
            </h4>
            <div className={`overflow-x-auto rounded-xl border ${meta.wrap}`}>
              <table className="w-full text-sm">
                <tbody>
                  {(loading && !result ? [] : rows).map((row, idx) => (
                    <tr
                      key={`${group}-${row.name}`}
                      className={idx % 2 === 0 ? meta.stripeEven : meta.stripeOdd}
                    >
                      <td className="align-top w-[32%] min-w-[9rem] px-3 py-2 font-medium text-slate-700 dark:text-slate-200">
                        <span className="text-xs text-slate-400 mr-1.5">{idx + 1}</span>
                        <span aria-hidden="true" className="mr-1">
                          {attributeEmoji(row.name)}
                        </span>
                        {row.name}
                        {!row.hashed ? (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100/90 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-normal text-amber-800 dark:text-amber-200">
                            👁️ display only
                          </span>
                        ) : (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-teal-100/80 dark:bg-teal-900/40 px-1.5 py-0.5 text-[10px] font-normal text-teal-800 dark:text-teal-200">
                            🔐 hashed
                          </span>
                        )}
                      </td>
                      <td className="align-top px-3 py-2 text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-all font-mono text-xs">
                        {row.value}
                      </td>
                    </tr>
                  ))}
                  {loading && !result ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-500" colSpan={2}>
                        ✨ Collecting fingerprint…
                      </td>
                    </tr>
                  ) : null}
                  {!loading && !rows.length ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-500" colSpan={2}>
                        No matching attributes.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
};
