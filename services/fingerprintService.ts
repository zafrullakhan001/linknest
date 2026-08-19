import { getAppBasePath, resolveApiBase } from './apiHelpers';
import { listDetectedBrowserExtensions, type DetectedBrowserExtension } from './bookmarkImportService';

const API_BASE = resolveApiBase();

export const FINGERPRINT_COOKIE = 'ln_fp';
export const FINGERPRINT_GPS_STORAGE = 'ln_fp_gps';
export const FINGERPRINT_EXCLUDED_STORAGE = 'ln_fp_excluded';
export const FINGERPRINT_HASH_PREFIX = 'lnfp_';

export interface FingerprintAttribute {
  group: 'http' | 'javascript' | 'geo' | 'extensions';
  name: string;
  value: string;
  hashed: boolean;
  /** When set, this row can be included or excluded from the hash. */
  signalId?: string;
  hashable?: boolean;
  volatile?: boolean;
}

export interface FingerprintSignalDef {
  id: string;
  label: string;
  group: 'http' | 'javascript' | 'geo';
  hashKeys: string[];
  volatile?: boolean;
}

/** Signals that often change (VPN, DHCP, travel) and are easy to exclude for a stable hash. */
export const FINGERPRINT_NETWORK_SIGNAL_IDS = [
  'ipAddress',
  'hostname',
  'localIps',
  'ipCountry',
  'ipRegion',
  'ipCity',
  'ipTimezone',
  'connection',
] as const;

/** Stable-device preset: drop network/location signals that commonly rotate. */
export const FINGERPRINT_STABLE_EXCLUDED_IDS: string[] = [
  ...FINGERPRINT_NETWORK_SIGNAL_IDS,
  'gps',
];

export const FINGERPRINT_SIGNAL_CATALOG: FingerprintSignalDef[] = [
  { id: 'httpUserAgent', label: 'User agent (HTTP)', group: 'http', hashKeys: ['httpUserAgent'] },
  { id: 'httpAccept', label: 'Accept', group: 'http', hashKeys: ['httpAccept'] },
  { id: 'httpContentEncoding', label: 'Content encoding', group: 'http', hashKeys: ['httpContentEncoding'] },
  { id: 'httpContentLanguage', label: 'Content language (HTTP)', group: 'http', hashKeys: ['httpContentLanguage'] },
  { id: 'httpUpgradeInsecureRequests', label: 'Upgrade Insecure Requests', group: 'http', hashKeys: ['httpUpgradeInsecureRequests'] },
  { id: 'jsUserAgent', label: 'User agent (JS)', group: 'javascript', hashKeys: ['jsUserAgent'] },
  { id: 'platform', label: 'Platform', group: 'javascript', hashKeys: ['platform'] },
  { id: 'cookieEnabled', label: 'Cookies enabled', group: 'javascript', hashKeys: ['cookieEnabled'] },
  { id: 'timezone', label: 'Timezone', group: 'javascript', hashKeys: ['timezone'], volatile: true },
  { id: 'languages', label: 'Content language (JS)', group: 'javascript', hashKeys: ['languages'] },
  { id: 'canvas', label: 'Canvas', group: 'javascript', hashKeys: ['canvas'] },
  { id: 'fonts', label: 'List of fonts (JS)', group: 'javascript', hashKeys: ['fonts'] },
  { id: 'adblock', label: 'Use of Adblock', group: 'javascript', hashKeys: ['adblock'], volatile: true },
  { id: 'doNotTrack', label: 'Do Not Track', group: 'javascript', hashKeys: ['doNotTrack'], volatile: true },
  { id: 'navigatorProps', label: 'Navigator properties', group: 'javascript', hashKeys: ['navigatorProps'] },
  { id: 'buildID', label: 'BuildID', group: 'javascript', hashKeys: ['buildID'] },
  { id: 'product', label: 'Product', group: 'javascript', hashKeys: ['product'] },
  { id: 'productSub', label: 'Product sub', group: 'javascript', hashKeys: ['productSub'] },
  { id: 'vendor', label: 'Vendor', group: 'javascript', hashKeys: ['vendor'] },
  { id: 'vendorSub', label: 'Vendor sub', group: 'javascript', hashKeys: ['vendorSub'] },
  { id: 'hardwareConcurrency', label: 'Hardware concurrency', group: 'javascript', hashKeys: ['hardwareConcurrency'] },
  { id: 'javaEnabled', label: 'Java enabled', group: 'javascript', hashKeys: ['javaEnabled'] },
  { id: 'deviceMemory', label: 'Device memory', group: 'javascript', hashKeys: ['deviceMemory'] },
  { id: 'plugins', label: 'List of plugins', group: 'javascript', hashKeys: ['plugins'] },
  { id: 'screenWidth', label: 'Screen width', group: 'javascript', hashKeys: ['screenWidth'] },
  { id: 'screenHeight', label: 'Screen height', group: 'javascript', hashKeys: ['screenHeight'] },
  { id: 'screenDepth', label: 'Screen depth', group: 'javascript', hashKeys: ['screenDepth'] },
  { id: 'screenAvailTop', label: 'Screen available top', group: 'javascript', hashKeys: ['screenAvailTop'], volatile: true },
  { id: 'screenAvailLeft', label: 'Screen available Left', group: 'javascript', hashKeys: ['screenAvailLeft'], volatile: true },
  { id: 'screenAvailHeight', label: 'Screen available Height', group: 'javascript', hashKeys: ['screenAvailHeight'] },
  { id: 'screenAvailWidth', label: 'Screen available width', group: 'javascript', hashKeys: ['screenAvailWidth'] },
  { id: 'permissions', label: 'Permissions', group: 'javascript', hashKeys: ['permissions'], volatile: true },
  { id: 'webglVendor', label: 'WebGL Vendor', group: 'javascript', hashKeys: ['webglVendor'] },
  { id: 'webglRenderer', label: 'WebGL Renderer', group: 'javascript', hashKeys: ['webglRenderer'] },
  { id: 'webglData', label: 'WebGL Data', group: 'javascript', hashKeys: ['webglData'] },
  { id: 'webglParameters', label: 'WebGL Parameters', group: 'javascript', hashKeys: ['webglParameters'] },
  { id: 'localStorage', label: 'Use of local storage', group: 'javascript', hashKeys: ['localStorage'] },
  { id: 'sessionStorage', label: 'Use of session storage', group: 'javascript', hashKeys: ['sessionStorage'] },
  { id: 'indexedDB', label: 'Use of IndexedDB', group: 'javascript', hashKeys: ['indexedDB'] },
  { id: 'audioFormats', label: 'Audio formats', group: 'javascript', hashKeys: ['audioFormats'] },
  { id: 'audioContext', label: 'Audio context', group: 'javascript', hashKeys: ['audioContext'] },
  { id: 'analyser', label: 'Frequency analyser', group: 'javascript', hashKeys: ['analyser'] },
  { id: 'videoFormats', label: 'Video formats', group: 'javascript', hashKeys: ['videoFormats'] },
  { id: 'mediaDevices', label: 'Media devices', group: 'javascript', hashKeys: ['mediaDevices'], volatile: true },
  { id: 'accelerometer', label: 'Accelerometer', group: 'javascript', hashKeys: ['accelerometer'] },
  { id: 'gyroscope', label: 'Gyroscope', group: 'javascript', hashKeys: ['gyroscope'] },
  { id: 'proximity', label: 'Proximity sensor', group: 'javascript', hashKeys: ['proximity'] },
  { id: 'keyboardLayout', label: 'Keyboard layout', group: 'javascript', hashKeys: ['keyboardLayout'] },
  {
    id: 'connection',
    label: 'Connection',
    group: 'javascript',
    hashKeys: ['connectionEffectiveType', 'connectionSaveData'],
    volatile: true,
  },
  { id: 'locationBar', label: 'Location bar', group: 'javascript', hashKeys: ['locationBar'] },
  { id: 'menuBar', label: 'Menu bar', group: 'javascript', hashKeys: ['menuBar'] },
  { id: 'personalBar', label: 'Personal bar', group: 'javascript', hashKeys: ['personalBar'] },
  { id: 'statusBar', label: 'Status bar', group: 'javascript', hashKeys: ['statusBar'] },
  { id: 'toolBar', label: 'Tool bar', group: 'javascript', hashKeys: ['toolBar'] },
  { id: 'ipAddress', label: 'Public IP address', group: 'geo', hashKeys: ['ipAddress'], volatile: true },
  { id: 'hostname', label: 'Machine / host name', group: 'geo', hashKeys: ['hostname'], volatile: true },
  { id: 'localIps', label: 'Local IP addresses', group: 'geo', hashKeys: ['localIps'], volatile: true },
  { id: 'ipCountry', label: 'IP country', group: 'geo', hashKeys: ['ipCountry'], volatile: true },
  { id: 'ipRegion', label: 'IP region', group: 'geo', hashKeys: ['ipRegion'], volatile: true },
  { id: 'ipCity', label: 'IP city', group: 'geo', hashKeys: ['ipCity'], volatile: true },
  { id: 'ipTimezone', label: 'IP timezone', group: 'geo', hashKeys: ['ipTimezone'], volatile: true },
  { id: 'gps', label: 'GPS', group: 'geo', hashKeys: ['gpsLatCell', 'gpsLonCell'], volatile: true },
];

const SIGNAL_BY_ID: Record<string, FingerprintSignalDef> = Object.fromEntries(
  FINGERPRINT_SIGNAL_CATALOG.map((s) => [s.id, s])
);

function knownSignalIds(): Set<string> {
  return new Set(FINGERPRINT_SIGNAL_CATALOG.map((s) => s.id));
}

export function getExcludedFingerprintSignals(): string[] {
  const known = knownSignalIds();
  try {
    const raw = localStorage.getItem(FINGERPRINT_EXCLUDED_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is string => typeof id === 'string' && known.has(id))
      .sort();
  } catch {
    return [];
  }
}

export function setExcludedFingerprintSignals(ids: string[]): string[] {
  const known = knownSignalIds();
  const next = Array.from(new Set(ids.filter((id) => known.has(id)))).sort();
  try {
    if (next.length) localStorage.setItem(FINGERPRINT_EXCLUDED_STORAGE, JSON.stringify(next));
    else localStorage.removeItem(FINGERPRINT_EXCLUDED_STORAGE);
  } catch {
    /* ignore */
  }
  memoryCache = null;
  return next;
}

export function setFingerprintSignalIncluded(id: string, included: boolean): string[] {
  const excluded = new Set(getExcludedFingerprintSignals());
  if (included) excluded.delete(id);
  else excluded.add(id);
  return setExcludedFingerprintSignals(Array.from(excluded));
}

export type FingerprintHashPreset = 'full' | 'stable';

export function applyFingerprintHashPreset(preset: FingerprintHashPreset): string[] {
  return setExcludedFingerprintSignals(preset === 'stable' ? FINGERPRINT_STABLE_EXCLUDED_IDS : []);
}

export function fingerprintSignalLabel(id: string): string {
  return SIGNAL_BY_ID[id]?.label || id;
}

export interface FingerprintGpsPlace {
  country_code: string;
  country_name: string;
  region: string;
  city: string;
}

export interface FingerprintGps {
  lat: number;
  lon: number;
  latCell: number;
  lonCell: number;
}

export interface FingerprintResult {
  hash: string;
  hashDisplay: string;
  attributes: FingerprintAttribute[];
  gps: FingerprintGps | null;
  gpsIncluded: boolean;
  gpsHashed?: boolean;
  gpsPlace: FingerprintGpsPlace | null;
  publicIp: string;
  hostname: string;
  localIps: string[];
  extensions: DetectedBrowserExtension[];
  collectedAt: number;
  excludedSignals: string[];
}

interface CollectedFingerprint {
  hashSignals: Record<string, unknown>;
  attributes: FingerprintAttribute[];
  gps: FingerprintGps | null;
  gpsPlace: FingerprintGpsPlace | null;
  publicIp: string;
  hostname: string;
  localIps: string[];
  extensions: DetectedBrowserExtension[];
  collectedAt: number;
}

let memoryCache: FingerprintResult | null = null;
let collectionCache: CollectedFingerprint | null = null;

interface ProbePayload {
  headers?: {
    userAgent?: string;
    accept?: string;
    contentEncoding?: string;
    contentLanguage?: string;
    upgradeInsecureRequests?: string;
    referer?: string;
  };
    geo?: {
    ip?: string;
    hostname?: string | null;
    country_code?: string | null;
    country_name?: string | null;
    region_name?: string | null;
    city_name?: string | null;
    timezone?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
}

const FONT_CANDIDATES = [
  'Agency FB', 'Algerian', 'Arial', 'Arial Black', 'Arial Narrow', 'Arial Rounded MT Bold',
  'Bahnschrift', 'Baskerville', 'Book Antiqua', 'Bookman Old Style', 'Bradley Hand',
  'Calibri', 'Cambria', 'Candara', 'Century', 'Century Gothic', 'Century Schoolbook',
  'Comic Sans MS', 'Consolas', 'Constantia', 'Copperplate', 'Copperplate Gothic Bold',
  'Corbel', 'Courier', 'Courier New', 'Didot', 'Franklin Gothic Medium', 'Gabriola',
  'Garamond', 'Georgia', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'HoloLens MDL2 Assets',
  'Impact', 'Ink Free', 'Jokerman', 'Leelawadee UI', 'Lucida Console', 'Lucida Handwriting',
  'Lucida Sans', 'Lucida Sans Unicode', 'MS Gothic', 'MS PGothic', 'MS Sans Serif',
  'MS Serif', 'MV Boli', 'Malgun Gothic', 'Marlett', 'Microsoft Himalaya', 'Microsoft JhengHei',
  'Microsoft New Tai Lue', 'Microsoft PhagsPa', 'Microsoft Sans Serif', 'Microsoft Tai Le',
  'Microsoft YaHei', 'Microsoft Yi Baiti', 'MingLiU', 'Mongolian Baiti', 'Monaco',
  'Myanmar Text', 'Nirmala UI', 'Noto Sans', 'Noto Serif', 'Palatino', 'Palatino Linotype',
  'Papyrus', 'Parchment', 'Playbill', 'Rockwell', 'Segoe MDL2 Assets', 'Segoe Print',
  'Segoe Script', 'Segoe UI', 'Segoe UI Emoji', 'Segoe UI Historic', 'Segoe UI Symbol',
  'SimSun', 'Sitka Text', 'Sylfaen', 'Symbol', 'Tahoma', 'Times', 'Times New Roman',
  'Trebuchet MS', 'Verdana', 'Webdings', 'Wingdings', 'Yu Gothic', 'Apple Color Emoji',
  'AppleGothic', 'Avenir', 'Avenir Next', 'Chalkboard', 'Futura', 'Geneva', 'Hiragino Sans',
  'Hoefler Text', 'Menlo', 'Optima', 'San Francisco', 'SF Pro Text', 'DejaVu Sans',
  'DejaVu Serif', 'FreeSans', 'FreeSerif', 'Liberation Sans', 'Liberation Serif',
  'Nimbus Sans', 'Ubuntu', 'Cantarell', 'Droid Sans', 'Roboto',
];

const AUDIO_TYPES = [
  'audio/3gpp', 'audio/aac', 'audio/flac', 'audio/mpeg',
  'audio/ogg; codecs="flac"', 'audio/ogg; codecs="vorbis"', 'audio/ogg; codecs="opus"',
  'audio/wav; codecs="1"', 'audio/webm; codecs="vorbis"', 'audio/webm; codecs="opus"',
  'audio/x-mpegurl', 'audio/mp4; codecs="mp4a.40.2"',
];

const VIDEO_TYPES = [
  'video/mp4; codecs="flac"', 'video/ogg; codecs="opus"',
  'video/webm; codecs="vp9, opus"', 'video/webm; codecs="vp8, vorbis"',
  'video/mp4', 'video/webm',
];

const PERMISSION_NAMES = [
  'accelerometer', 'accessibility-events', 'ambient-light-sensor', 'camera',
  'clipboard-read', 'clipboard-write', 'geolocation', 'background-sync',
  'magnetometer', 'microphone', 'midi', 'notifications', 'payment-handler',
  'persistent-storage', 'push',
];

function formatExtensionAttributes(extensions: DetectedBrowserExtension[]): FingerprintAttribute[] {
  const sync = extensions.find((e) => e.kind === 'bookmark-sync');
  const pro = extensions.find((e) => e.kind === 'launcher-pro');
  const others = extensions.filter((e) => e.kind === 'other');
  const rows: FingerprintAttribute[] = [
    attr(
      'extensions',
      'Bookmark Sync',
      sync
        ? [
            'Installed',
            sync.version ? `version ${sync.version}` : '',
            sync.readEnabled ? 'Read-only (Sync) On' : 'Read-only (Sync) Off',
            sync.writeEnabled ? 'Read-write (OutSync) On' : 'Read-write (OutSync) Off',
          ]
            .filter(Boolean)
            .join('\n')
        : 'Not detected',
      false
    ),
    attr(
      'extensions',
      'Browser Launcher Pro',
      pro ? ['Installed', pro.version ? `version ${pro.version}` : ''].filter(Boolean).join('\n') : 'Not detected',
      false
    ),
  ];
  for (const extra of others) {
    rows.push(
      attr(
        'extensions',
        extra.name,
        extra.version ? `Installed\nversion ${extra.version}` : 'Installed',
        false
      )
    );
  }
  return rows;
}

type AttrOptions = {
  hashed?: boolean;
  signalId?: string;
  volatile?: boolean;
};

function attr(
  group: FingerprintAttribute['group'],
  name: string,
  value: unknown,
  hashedOrOpts: boolean | AttrOptions = true
): FingerprintAttribute {
  let hashed = true;
  let signalId: string | undefined;
  let volatile = false;
  if (typeof hashedOrOpts === 'boolean') {
    hashed = hashedOrOpts;
  } else {
    hashed = hashedOrOpts.hashed !== false;
    signalId = hashedOrOpts.signalId;
    volatile = !!hashedOrOpts.volatile;
  }
  let text: string;
  if (value === null || value === undefined) text = 'No value';
  else if (typeof value === 'boolean') text = value ? 'true' : 'false';
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  if (text === '') text = 'No value';
  return {
    group,
    name,
    value: text,
    hashed,
    signalId,
    hashable: !!signalId,
    volatile,
  };
}

function sig(id: string): AttrOptions {
  return { signalId: id, volatile: !!SIGNAL_BY_ID[id]?.volatile };
}

function applyAttributeHashFlags(
  attributes: FingerprintAttribute[],
  excluded: Set<string>,
  gpsAvailable: boolean
): FingerprintAttribute[] {
  return attributes.map((row) => {
    if (!row.signalId) {
      return { ...row, hashed: false, hashable: false };
    }
    let hashed = !excluded.has(row.signalId);
    if (row.signalId === 'gps' && !gpsAvailable) hashed = false;
    return {
      ...row,
      hashable: true,
      hashed,
      volatile: row.volatile || !!SIGNAL_BY_ID[row.signalId]?.volatile,
    };
  });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return fallbackFnvHex(text);
}

function fallbackFnvHex(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = (h >>> 0).toString(16).padStart(8, '0');
  let h2 = 84696351;
  for (let i = 0; i < text.length; i++) {
    h2 ^= text.charCodeAt(i) + i;
    h2 = Math.imul(h2, 16777619);
  }
  const b = (h2 >>> 0).toString(16).padStart(8, '0');
  return (a + b + a + b + a + b + a + b).slice(0, 64);
}

export function normalizeFingerprintHash(raw: string): string | null {
  let v = String(raw || '').trim().toLowerCase();
  if (v.startsWith(FINGERPRINT_HASH_PREFIX)) {
    v = v.slice(FINGERPRINT_HASH_PREFIX.length);
  }
  v = v.replace(/[^a-f0-9]/g, '');
  return v.length === 64 ? v : null;
}

export function formatFingerprintHashDisplay(hash: string): string {
  const n = normalizeFingerprintHash(hash);
  return n ? `${FINGERPRINT_HASH_PREFIX}${n}` : hash;
}

export function hasGpsConsent(): boolean {
  try {
    return localStorage.getItem(FINGERPRINT_GPS_STORAGE) === '1';
  } catch {
    return false;
  }
}

export function setGpsConsent(accepted: boolean): void {
  try {
    if (accepted) localStorage.setItem(FINGERPRINT_GPS_STORAGE, '1');
    else localStorage.removeItem(FINGERPRINT_GPS_STORAGE);
  } catch {
    /* ignore */
  }
}

export function persistFingerprintCookie(hash: string): void {
  const n = normalizeFingerprintHash(hash);
  if (!n || typeof document === 'undefined') return;
  const base = getAppBasePath();
  const path = base ? `${base}/` : '/';
  document.cookie = `${FINGERPRINT_COOKIE}=${encodeURIComponent(n)}; Path=${path}; SameSite=Lax; Max-Age=31536000`;
}

export function readFingerprintCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === FINGERPRINT_COOKIE) {
      return normalizeFingerprintHash(decodeURIComponent(rest.join('=')));
    }
  }
  return null;
}

async function fetchProbe(): Promise<ProbePayload> {
  try {
    const res = await fetch(`${API_BASE}/fingerprint/probe`, { credentials: 'include' });
    if (!res.ok) return {};
    return (await res.json()) as ProbePayload;
  } catch {
    return {};
  }
}

function detectFonts(): string[] {
  if (typeof document === 'undefined') return [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const bases = ['monospace', 'sans-serif', 'serif'];
  const sample = 'mmmmmmmmmmlliWw';
  const baselines: Record<string, number> = {};
  for (const base of bases) {
    ctx.font = `72px ${base}`;
    baselines[base] = ctx.measureText(sample).width;
  }
  const found: string[] = [];
  for (const font of FONT_CANDIDATES) {
    for (const base of bases) {
      ctx.font = `72px "${font}", ${base}`;
      if (ctx.measureText(sample).width !== baselines[base]) {
        found.push(font);
        break;
      }
    }
  }
  return found;
}

function canvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'Not supported';
    ctx.textBaseline = 'top';
    ctx.font = '16px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 280, 60);
    ctx.fillStyle = '#069';
    ctx.fillText('LinkNest fingerprint 😃', 4, 8);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Cwm fjordbank glyphs vext quiz', 4, 30);
    ctx.beginPath();
    ctx.arc(240, 20, 16, 0, Math.PI * 2);
    ctx.strokeStyle = '#c33';
    ctx.stroke();
    return canvas.toDataURL();
  } catch {
    return 'Not supported';
  }
}

function webglInfo(): { vendor: string; renderer: string; data: string; parameters: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl || !(gl instanceof WebGLRenderingContext)) {
      return { vendor: 'Not supported', renderer: 'Not supported', data: 'Not supported', parameters: 'Not supported' };
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '') : String(gl.getParameter(gl.VENDOR) || '');
    const renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : String(gl.getParameter(gl.RENDERER) || '');
    const extensions = gl.getSupportedExtensions() || [];
    const params = [
      gl.getParameter(gl.VERSION),
      gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
      gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
      gl.getParameter(gl.MAX_VARYING_VECTORS),
      gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE),
      gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE),
    ];
    return {
      vendor: vendor || 'No value',
      renderer: renderer || 'No value',
      data: `${vendor}|${renderer}|${extensions.length}`,
      parameters: `${extensions.length} extensions; ${params.join(',')}`,
    };
  } catch {
    return { vendor: 'Not supported', renderer: 'Not supported', data: 'Not supported', parameters: 'Not supported' };
  }
}

function mediaSupport(types: string[], kind: 'audio' | 'video'): Record<string, string> {
  const el = document.createElement(kind);
  const out: Record<string, string> = {};
  for (const t of types) {
    try {
      const r = el.canPlayType(t);
      out[t] = r || 'no';
    } catch {
      out[t] = 'no';
    }
  }
  return out;
}

function audioContextInfo(): { sampleRate: number | string; state: string } {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return { sampleRate: 'Not supported', state: 'Not supported' };
    const ctx = new AC();
    const info = { sampleRate: ctx.sampleRate, state: ctx.state };
    void ctx.close();
    return info;
  } catch {
    return { sampleRate: 'Not supported', state: 'Not supported' };
  }
}

function analyserInfo(): Record<string, number | string> {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return { status: 'Not supported' };
    const ctx = new AC();
    const node = ctx.createAnalyser();
    const info = {
      channelCount: node.channelCount,
      channelCountMode: node.channelCountMode,
      channelInterpretation: node.channelInterpretation,
      fftSize: node.fftSize,
      frequencyBinCount: node.frequencyBinCount,
      maxDecibels: node.maxDecibels,
      minDecibels: node.minDecibels,
      numberOfInputs: node.numberOfInputs,
      numberOfOutputs: node.numberOfOutputs,
      smoothingTimeConstant: node.smoothingTimeConstant,
    };
    void ctx.close();
    return info;
  } catch {
    return { status: 'Not supported' };
  }
}

function detectAdblock(): boolean {
  try {
    const bait = document.createElement('div');
    bait.className = 'adsbox adsbygoogle ad-banner ads banner-ad';
    bait.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;';
    document.body.appendChild(bait);
    const blocked = bait.offsetHeight === 0 || getComputedStyle(bait).display === 'none' || getComputedStyle(bait).visibility === 'hidden';
    bait.remove();
    return blocked;
  } catch {
    return false;
  }
}

function storageWorks(kind: 'localStorage' | 'sessionStorage'): boolean {
  try {
    const s = window[kind];
    const k = '__ln_fp__';
    s.setItem(k, '1');
    s.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function navigatorPropertyNames(): string[] {
  try {
    const names = new Set<string>();
    Object.getOwnPropertyNames(Navigator.prototype).forEach((n) => names.add(n));
    Object.getOwnPropertyNames(navigator).forEach((n) => names.add(n));
    return Array.from(names).sort();
  } catch {
    return [];
  }
}

function pluginList(): string {
  try {
    const plugins = navigator.plugins;
    if (!plugins || plugins.length === 0) return 'No value';
    const parts: string[] = [];
    for (let i = 0; i < plugins.length; i++) {
      const p = plugins.item(i);
      if (p) parts.push(`Plugin ${i}: ${p.name}; ${p.description}; ${p.filename}`);
    }
    return parts.join('. ') || 'No value';
  } catch {
    return 'No value';
  }
}

async function queryPermissions(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!navigator.permissions || typeof navigator.permissions.query !== 'function') {
    return { status: 'Not supported' };
  }
  await Promise.all(
    PERMISSION_NAMES.map(async (name) => {
      try {
        const status = await navigator.permissions.query({ name: name as PermissionName });
        out[name] = status.state;
      } catch {
        out[name] = 'Not supported';
      }
    })
  );
  return out;
}

async function mediaDeviceCounts(): Promise<string> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return 'Not supported';
    const devices = await navigator.mediaDevices.enumerateDevices();
    const counts = { audioinput: 0, videoinput: 0, audiooutput: 0 };
    for (const d of devices) {
      if (d.kind === 'audioinput') counts.audioinput += 1;
      else if (d.kind === 'videoinput') counts.videoinput += 1;
      else if (d.kind === 'audiooutput') counts.audiooutput += 1;
    }
    return `${counts.audioinput} audioinput\n${counts.videoinput} videoinput\n${counts.audiooutput} audiooutput`;
  } catch {
    return 'Not supported';
  }
}

async function keyboardLayout(): Promise<string> {
  try {
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
    if (!kb?.getLayoutMap) return 'Other';
    const map = await kb.getLayoutMap();
    const keys = ['KeyQ', 'KeyW', 'KeyA', 'KeyZ'];
    return keys.map((k) => `${k}=${map.get(k) || ''}`).join(', ') || 'Other';
  } catch {
    return 'Other';
  }
}

async function batteryInfo(): Promise<Record<string, unknown>> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean; chargingTime: number; dischargingTime: number; level: number }> };
    if (!nav.getBattery) return { status: 'Not supported' };
    const b = await nav.getBattery();
    return {
      charging: b.charging,
      chargingTime: b.chargingTime,
      dischargingTime: b.dischargingTime,
      level: b.level,
    };
  } catch {
    return { status: 'Not supported' };
  }
}

function connectionInfo(): Record<string, unknown> {
  try {
    const c = (navigator as Navigator & { connection?: { downlink?: number; effectiveType?: string; rtt?: number; saveData?: boolean } }).connection;
    if (!c) return { status: 'Not supported' };
    return {
      downlink: c.downlink,
      effectiveType: c.effectiveType,
      rtt: c.rtt,
      saveData: c.saveData,
    };
  } catch {
    return { status: 'Not supported' };
  }
}

function timezoneOffsetLabel(): string {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

async function geolocationPermissionState(): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'unknown';
  }
}

function displayCoord(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** ~2 mile cells so a ~1 mile move usually stays in the same hash bucket. */
const GPS_CELL_MILES = 2;
const MILES_PER_DEGREE_LAT = 69;

function gpsHashCells(lat: number, lon: number): { latCell: number; lonCell: number } {
  const latStep = GPS_CELL_MILES / MILES_PER_DEGREE_LAT;
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const lonStep = GPS_CELL_MILES / (MILES_PER_DEGREE_LAT * cosLat);
  return {
    latCell: Math.round(lat / latStep),
    lonCell: Math.round(lon / lonStep),
  };
}

async function readGps(forcePrompt: boolean): Promise<FingerprintGps | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  const state = await geolocationPermissionState();
  const consented = hasGpsConsent();
  if (!forcePrompt) {
    if (state === 'denied') return null;
    if (state === 'prompt' && !consented) return null;
    if (state !== 'granted' && !consented) return null;
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsConsent(true);
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const cells = gpsHashCells(lat, lon);
        resolve({
          lat: displayCoord(lat),
          lon: displayCoord(lon),
          latCell: cells.latCell,
          lonCell: cells.lonCell,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
}

function formatGeoPlaceAttributes(
  geo: NonNullable<ProbePayload['geo']>,
  gpsPlace: FingerprintGpsPlace | null
): FingerprintAttribute[] {
  const ipCountry = [geo.country_code, geo.country_name].filter(Boolean).join(' — ') || 'Unknown';
  const ipOpts = { volatile: true as const };
  if (gpsPlace) {
    const gpsCountry = [gpsPlace.country_code, gpsPlace.country_name].filter(Boolean).join(' — ') || 'Unknown';
    return [
      attr('geo', 'Country', `${gpsCountry} (from GPS)`, false),
      attr('geo', 'Region', `${gpsPlace.region} (from GPS)`, false),
      attr('geo', 'City', `${gpsPlace.city} (from GPS)`, false),
      attr('geo', 'IP country', ipCountry, { ...ipOpts, signalId: 'ipCountry' }),
      attr('geo', 'IP region', geo.region_name || 'Unknown', { ...ipOpts, signalId: 'ipRegion' }),
      attr('geo', 'IP city', geo.city_name || 'Unknown', { ...ipOpts, signalId: 'ipCity' }),
    ];
  }
  return [
    attr('geo', 'Country', ipCountry, { ...ipOpts, signalId: 'ipCountry' }),
    attr('geo', 'Region', geo.region_name || 'Unknown', { ...ipOpts, signalId: 'ipRegion' }),
    attr('geo', 'City', geo.city_name || 'Unknown', { ...ipOpts, signalId: 'ipCity' }),
  ];
}

function hashPayloadFromSignals(
  signals: Record<string, unknown>,
  excluded: string[]
): Record<string, unknown> {
  const omitKeys = new Set<string>();
  for (const id of excluded) {
    const keys = SIGNAL_BY_ID[id]?.hashKeys || [id];
    for (const key of keys) omitKeys.add(key);
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(signals)) {
    if (!omitKeys.has(key)) out[key] = value;
  }
  if (excluded.length) {
    out._excluded = [...excluded].sort();
  }
  return out;
}

async function collectLocalIps(): Promise<string[]> {
  if (typeof RTCPeerConnection === 'undefined') return [];
  return new Promise((resolve) => {
    const found = new Set<string>();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      resolve(Array.from(found).sort());
    };
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] });
    const timer = window.setTimeout(finish, 1200);
    try {
      pc.createDataChannel('ln-fp');
    } catch {
      /* ignore */
    }
    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        window.clearTimeout(timer);
        finish();
        return;
      }
      const line = event.candidate.candidate || '';
      const tokens = line.split(' ');
      for (const token of tokens) {
        if (!token || token === '127.0.0.1' || token === '0.0.0.0' || token === '::1') continue;
        if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(token)) found.add(token);
        else if (token.includes(':') && /[a-fA-F0-9:]+/.test(token) && token.split(':').length >= 3) found.add(token.toLowerCase());
        else if (/\.local$/i.test(token)) found.add(token.toLowerCase());
      }
    };
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => {
        window.clearTimeout(timer);
        finish();
      });
  });
}

let skipInternalReverseGeocode = false;

async function reverseGeocodeGps(lat: number, lon: number): Promise<FingerprintGpsPlace | null> {
  const parsePlace = (raw: Record<string, unknown> | null | undefined): FingerprintGpsPlace | null => {
    if (!raw) return null;
    const loc = (raw.location && typeof raw.location === 'object' ? raw.location : raw) as Record<string, unknown>;
    const address = (loc.address && typeof loc.address === 'object' ? loc.address : loc) as Record<string, unknown>;
    const countryCode = String(loc.country_code || address.country_code || '').toUpperCase();
    const countryName = String(loc.country_name || loc.country || address.country || '');
    const region = String(loc.region || loc.region_name || address.state || address.region || address.county || '');
    const city = String(
      loc.city || loc.city_name || address.city || address.town || address.village || address.municipality || ''
    );
    if (!countryName && !city && (!countryCode || countryCode === 'XX')) return null;
    return {
      country_code: countryCode && countryCode !== 'XX' ? countryCode : '',
      country_name: countryName || 'Unknown',
      region: region || 'Unknown',
      city: city || 'Unknown',
    };
  };

  if (!skipInternalReverseGeocode) {
    try {
      const res = await fetch(
        `${API_BASE}/analytics/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lon))}`,
        { credentials: 'include' }
      );
      if (res.status === 401 || res.status === 403) {
        skipInternalReverseGeocode = true;
      } else if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const place = parsePlace(data);
        if (place && place.city !== 'Unknown') return place;
        if (place && place.country_name !== 'Unknown') return place;
      }
    } catch {
      /* fall through to Nominatim */
    }
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&zoom=10&addressdetails=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return parsePlace(data);
  } catch {
    return null;
  }
}

async function finalizeCollectedFingerprint(
  collected: CollectedFingerprint,
  excluded: string[]
): Promise<FingerprintResult> {
  const excludedSet = new Set(excluded);
  const hash = await sha256Hex(canonicalJson(hashPayloadFromSignals(collected.hashSignals, excluded)));
  const gpsHashed = !!collected.gps && !excludedSet.has('gps');
  const result: FingerprintResult = {
    hash,
    hashDisplay: formatFingerprintHashDisplay(hash),
    attributes: applyAttributeHashFlags(collected.attributes, excludedSet, !!collected.gps),
    gps: collected.gps,
    gpsIncluded: !!collected.gps,
    gpsHashed,
    gpsPlace: collected.gpsPlace,
    publicIp: collected.publicIp,
    hostname: collected.hostname,
    localIps: collected.localIps,
    extensions: collected.extensions,
    collectedAt: collected.collectedAt,
    excludedSignals: excluded,
  };
  memoryCache = result;
  persistFingerprintCookie(hash);
  try {
    sessionStorage.setItem('ln_fp_hash', hash);
  } catch {
    /* ignore */
  }
  return result;
}

export async function collectFingerprint(opts?: {
  forceGps?: boolean;
  skipCache?: boolean;
  /** City/region labels for Help & About only — skip on access-check so we do not hit reverse-geocode. */
  includePlace?: boolean;
}): Promise<FingerprintResult> {
  const excluded = getExcludedFingerprintSignals();
  if (!opts?.skipCache && !opts?.forceGps && memoryCache?.excludedSignals) {
    if (
      memoryCache.excludedSignals.length === excluded.length &&
      memoryCache.excludedSignals.every((id, i) => id === excluded[i])
    ) {
      return memoryCache;
    }
  }
  if (!opts?.skipCache && !opts?.forceGps && collectionCache) {
    return finalizeCollectedFingerprint(collectionCache, excluded);
  }

  const [probe, gps, permissions, devices, layout, battery, localIps, extensions] = await Promise.all([
    fetchProbe(),
    readGps(!!opts?.forceGps),
    queryPermissions(),
    mediaDeviceCounts(),
    keyboardLayout(),
    batteryInfo(),
    collectLocalIps(),
    listDetectedBrowserExtensions(1800),
  ]);

  const headers = probe.headers || {};
  const geo = probe.geo || {};
  const gpsPlace = opts?.includePlace && gps ? await reverseGeocodeGps(gps.lat, gps.lon) : null;
  const fonts = detectFonts();
  const canvasRaw = canvasFingerprint();
  const canvasHash = canvasRaw === 'Not supported' ? canvasRaw : await sha256Hex(canvasRaw);
  const gl = webglInfo();
  const audioFormats = mediaSupport(AUDIO_TYPES, 'audio');
  const videoFormats = mediaSupport(VIDEO_TYPES, 'video');
  const audioCtx = audioContextInfo();
  const analyser = analyserInfo();
  const navProps = navigatorPropertyNames();
  const connection = connectionInfo();
  const adblock = detectAdblock();
  const screenObj = typeof screen !== 'undefined' ? screen : ({} as Screen);
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);

  const jsNav = nav as Navigator & {
    deviceMemory?: number;
    buildID?: string;
    javaEnabled?: () => boolean;
    msMaxTouchPoints?: number;
  };

  const hashSignals: Record<string, unknown> = {
    httpUserAgent: headers.userAgent || nav.userAgent || '',
    httpAccept: headers.accept || '',
    httpContentEncoding: headers.contentEncoding || '',
    httpContentLanguage: headers.contentLanguage || '',
    httpUpgradeInsecureRequests: headers.upgradeInsecureRequests || '',
    jsUserAgent: nav.userAgent || '',
    platform: nav.platform || '',
    cookieEnabled: !!nav.cookieEnabled,
    timezone: timezoneOffsetLabel(),
    languages: Array.isArray(nav.languages) ? [...nav.languages] : [nav.language || ''],
    canvas: canvasHash,
    fonts,
    adblock,
    doNotTrack: nav.doNotTrack || (window as unknown as { doNotTrack?: string }).doNotTrack || 'unspecified',
    navigatorProps: navProps,
    buildID: jsNav.buildID || 'Not supported',
    product: nav.product || '',
    productSub: nav.productSub || '',
    vendor: nav.vendor || '',
    vendorSub: nav.vendorSub || '',
    hardwareConcurrency: nav.hardwareConcurrency ?? null,
    javaEnabled: typeof jsNav.javaEnabled === 'function' ? jsNav.javaEnabled() : false,
    deviceMemory: jsNav.deviceMemory ?? null,
    plugins: pluginList(),
    screenWidth: screenObj.width ?? null,
    screenHeight: screenObj.height ?? null,
    screenDepth: screenObj.colorDepth ?? null,
    screenAvailTop: (screenObj as Screen & { availTop?: number }).availTop ?? 0,
    screenAvailLeft: (screenObj as Screen & { availLeft?: number }).availLeft ?? 0,
    screenAvailHeight: screenObj.availHeight ?? null,
    screenAvailWidth: screenObj.availWidth ?? null,
    permissions,
    webglVendor: gl.vendor,
    webglRenderer: gl.renderer,
    webglData: gl.data,
    webglParameters: gl.parameters,
    localStorage: storageWorks('localStorage'),
    sessionStorage: storageWorks('sessionStorage'),
    indexedDB: typeof indexedDB !== 'undefined',
    audioFormats,
    audioContext: audioCtx,
    analyser,
    videoFormats,
    mediaDevices: devices,
    accelerometer: typeof (window as unknown as { Accelerometer?: unknown }).Accelerometer !== 'undefined',
    gyroscope: typeof (window as unknown as { Gyroscope?: unknown }).Gyroscope !== 'undefined',
    proximity: typeof (window as unknown as { ProximitySensor?: unknown }).ProximitySensor !== 'undefined',
    keyboardLayout: layout,
    connectionEffectiveType: (connection as { effectiveType?: string }).effectiveType || 'unknown',
    connectionSaveData: !!(connection as { saveData?: boolean }).saveData,
    locationBar: !!window.locationbar?.visible,
    menuBar: !!window.menubar?.visible,
    personalBar: !!window.personalbar?.visible,
    statusBar: !!window.statusbar?.visible,
    toolBar: !!window.toolbar?.visible,
    ipAddress: geo.ip || '',
    hostname: (geo.hostname || '').toLowerCase(),
    localIps,
    ipCountry: geo.country_code || '',
    ipRegion: geo.region_name || '',
    ipCity: geo.city_name || '',
    ipTimezone: geo.timezone || '',
  };

  if (gps) {
    hashSignals.gpsLatCell = gps.latCell;
    hashSignals.gpsLonCell = gps.lonCell;
  }

  const attributes: FingerprintAttribute[] = [
    attr('http', 'User agent', headers.userAgent || nav.userAgent, sig('httpUserAgent')),
    attr('http', 'Accept', headers.accept, sig('httpAccept')),
    attr('http', 'Content encoding', headers.contentEncoding, sig('httpContentEncoding')),
    attr('http', 'Content language', headers.contentLanguage, sig('httpContentLanguage')),
    attr('http', 'Upgrade Insecure Requests', headers.upgradeInsecureRequests || 'No value', sig('httpUpgradeInsecureRequests')),
    attr('http', 'Referer', headers.referer || 'No value', false),
    ...formatExtensionAttributes(extensions),
    attr('javascript', 'User agent', nav.userAgent, sig('jsUserAgent')),
    attr('javascript', 'Platform', nav.platform, sig('platform')),
    attr('javascript', 'Cookies enabled', !!nav.cookieEnabled, sig('cookieEnabled')),
    attr('javascript', 'Timezone', timezoneOffsetLabel(), sig('timezone')),
    attr('javascript', 'Content language', (nav.languages || [nav.language]).join(','), sig('languages')),
    attr('javascript', 'Canvas', canvasHash, sig('canvas')),
    attr('javascript', 'List of fonts (JS)', fonts.length ? `${fonts.slice(0, 5).join('\n')}${fonts.length > 5 ? `\nAnd ${fonts.length - 5} others` : ''}` : 'No value', sig('fonts')),
    attr('javascript', 'Use of Adblock', adblock, sig('adblock')),
    attr('javascript', 'Do Not Track', nav.doNotTrack || 'unspecified', sig('doNotTrack')),
    attr('javascript', 'Navigator properties', `${navProps.length} properties detected`, sig('navigatorProps')),
    attr('javascript', 'BuildID', jsNav.buildID || 'Not supported', sig('buildID')),
    attr('javascript', 'Product', nav.product || 'No value', sig('product')),
    attr('javascript', 'Product sub', nav.productSub || 'No value', sig('productSub')),
    attr('javascript', 'Vendor', nav.vendor || 'No value', sig('vendor')),
    attr('javascript', 'Vendor sub', nav.vendorSub || 'No value', sig('vendorSub')),
    attr('javascript', 'Hardware concurrency', nav.hardwareConcurrency ?? 'No value', sig('hardwareConcurrency')),
    attr('javascript', 'Java enabled', typeof jsNav.javaEnabled === 'function' ? jsNav.javaEnabled() : false, sig('javaEnabled')),
    attr('javascript', 'Device memory', jsNav.deviceMemory ?? 'No value', sig('deviceMemory')),
    attr('javascript', 'List of plugins', pluginList(), sig('plugins')),
    attr('javascript', 'Screen width', screenObj.width, sig('screenWidth')),
    attr('javascript', 'Screen height', screenObj.height, sig('screenHeight')),
    attr('javascript', 'Screen depth', screenObj.colorDepth, sig('screenDepth')),
    attr('javascript', 'Screen available top', (screenObj as Screen & { availTop?: number }).availTop ?? 0, sig('screenAvailTop')),
    attr('javascript', 'Screen available Left', (screenObj as Screen & { availLeft?: number }).availLeft ?? 0, sig('screenAvailLeft')),
    attr('javascript', 'Screen available Height', screenObj.availHeight, sig('screenAvailHeight')),
    attr('javascript', 'Screen available width', screenObj.availWidth, sig('screenAvailWidth')),
    attr('javascript', 'Permissions', Object.entries(permissions).map(([k, v]) => `${k} : ${v}`).join('\n'), sig('permissions')),
    attr('javascript', 'WebGL Vendor', gl.vendor, sig('webglVendor')),
    attr('javascript', 'WebGL Renderer', gl.renderer, sig('webglRenderer')),
    attr('javascript', 'WebGL Data', gl.data, sig('webglData')),
    attr('javascript', 'WebGL Parameters', gl.parameters, sig('webglParameters')),
    attr('javascript', 'Use of local storage', storageWorks('localStorage'), sig('localStorage')),
    attr('javascript', 'Use of session storage', storageWorks('sessionStorage'), sig('sessionStorage')),
    attr('javascript', 'Use of IndexedDB', typeof indexedDB !== 'undefined', sig('indexedDB')),
    attr('javascript', 'Audio formats', Object.entries(audioFormats).map(([k, v]) => `${k} : ${v}`).join('\n'), sig('audioFormats')),
    attr('javascript', 'Audio context', `sampleRate : ${audioCtx.sampleRate}\nstate : ${audioCtx.state}`, sig('audioContext')),
    attr('javascript', 'Frequency analyser', Object.entries(analyser).map(([k, v]) => `${k} : ${v}`).join('\n'), sig('analyser')),
    attr('javascript', 'Audio data', 'Not supported', false),
    attr('javascript', 'Video formats', Object.entries(videoFormats).map(([k, v]) => `${k} : ${v}`).join('\n'), sig('videoFormats')),
    attr('javascript', 'Media devices', devices, sig('mediaDevices')),
    attr('javascript', 'Accelerometer', typeof (window as unknown as { Accelerometer?: unknown }).Accelerometer !== 'undefined', sig('accelerometer')),
    attr('javascript', 'Gyroscope', typeof (window as unknown as { Gyroscope?: unknown }).Gyroscope !== 'undefined', sig('gyroscope')),
    attr('javascript', 'Proximity sensor', typeof (window as unknown as { ProximitySensor?: unknown }).ProximitySensor !== 'undefined', sig('proximity')),
    attr('javascript', 'Keyboard layout', layout, sig('keyboardLayout')),
    attr('javascript', 'Battery', Object.entries(battery).map(([k, v]) => `${k} : ${v}`).join('\n'), false),
    attr('javascript', 'Connection', Object.entries(connection).map(([k, v]) => `${k} : ${v}`).join('\n'), sig('connection')),
    attr('javascript', 'key', 'No value', false),
    attr('javascript', 'Location bar', !!window.locationbar?.visible, sig('locationBar')),
    attr('javascript', 'Menu bar', !!window.menubar?.visible, sig('menuBar')),
    attr('javascript', 'Personal bar', !!window.personalbar?.visible, sig('personalBar')),
    attr('javascript', 'Status bar', !!window.statusbar?.visible, sig('statusBar')),
    attr('javascript', 'Tool bar', !!window.toolbar?.visible, sig('toolBar')),
    attr('javascript', 'Result state', 'No value', false),
    attr('javascript', 'List of fonts (Flash)', 'Flash not detected', false),
    attr('javascript', 'Screen resolution (Flash)', 'Flash not detected', false),
    attr('javascript', 'Language (Flash)', 'Flash not detected', false),
    attr('javascript', 'Platform (Flash)', 'Flash not detected', false),
    attr('geo', 'Public IP address', geo.ip || 'Unknown', sig('ipAddress')),
    attr('geo', 'Machine / host name', geo.hostname || 'Not available', sig('hostname')),
    attr('geo', 'Local IP addresses', localIps.length ? localIps.join('\n') : 'Not available', sig('localIps')),
    attr('geo', 'MAC address', 'Not available (browsers cannot read hardware MAC addresses)', false),
    ...formatGeoPlaceAttributes(geo, gpsPlace),
    attr('geo', 'IP timezone', geo.timezone || 'Unknown', sig('ipTimezone')),
    attr(
      'geo',
      'GPS',
      gps
        ? `${gps.lat}, ${gps.lon} (hashed to ~1 mile radius cell ${gps.latCell},${gps.lonCell})`
        : 'Not included (accept location to add to hash)',
      sig('gps')
    ),
  ];

  collectionCache = {
    hashSignals,
    attributes,
    gps,
    gpsPlace,
    publicIp: geo.ip || '',
    hostname: geo.hostname || '',
    localIps,
    extensions,
    collectedAt: Date.now(),
  };

  return finalizeCollectedFingerprint(collectionCache, excluded);
}

export function clearFingerprintCache(): void {
  memoryCache = null;
  collectionCache = null;
}

export async function getFingerprintHash(opts?: { skipCache?: boolean }): Promise<string> {
  const result = await collectFingerprint(opts);
  return result.hash;
}

export interface FingerprintRegistryMatch {
  tag: string;
  username?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface FingerprintRegistryLookup {
  hash: string;
  unique: boolean;
  count: number;
  total: number;
  percent: number;
  matches: FingerprintRegistryMatch[];
  saved?: boolean;
  savedTag?: string;
}

export async function lookupFingerprintRegistry(hash: string): Promise<FingerprintRegistryLookup | null> {
  const n = normalizeFingerprintHash(hash);
  if (!n) return null;
  try {
    const res = await fetch(`${API_BASE}/fingerprint/lookup?hash=${encodeURIComponent(n)}`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return (await res.json()) as FingerprintRegistryLookup;
  } catch {
    return null;
  }
}

export async function registerFingerprintTag(
  hash: string,
  tag: string
): Promise<FingerprintRegistryLookup> {
  const n = normalizeFingerprintHash(hash);
  if (!n) {
    throw new Error('Invalid fingerprint hash.');
  }
  const res = await fetch(`${API_BASE}/fingerprint/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash: n, tag }),
  });
  const data = (await res.json().catch(() => ({}))) as FingerprintRegistryLookup & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Could not save fingerprint tag.');
  }
  return data;
}

export const FINGERPRINT_SNAPSHOT_KIND = 'linknest-fingerprint';
export const FINGERPRINT_SNAPSHOT_VERSION = 1;

const ATTR_GROUPS: FingerprintAttribute['group'][] = ['http', 'extensions', 'javascript', 'geo'];

export interface FingerprintSnapshotAttribute {
  name: string;
  value: string;
  group: FingerprintAttribute['group'];
  hashed: boolean;
  signalId?: string;
  hashable?: boolean;
  volatile?: boolean;
}

export interface FingerprintSnapshotExtension {
  kind: string;
  name: string;
  version: string;
}

export interface FingerprintSnapshot {
  kind: typeof FINGERPRINT_SNAPSHOT_KIND;
  version: number;
  exportedAt: string;
  hash: string;
  hashDisplay: string;
  excludedSignals: string[];
  attributes: FingerprintSnapshotAttribute[];
  publicIp: string;
  hostname: string;
  localIps: string[];
  gps: FingerprintGps | null;
  gpsPlace: FingerprintGpsPlace | null;
  gpsIncluded?: boolean;
  gpsHashed?: boolean;
  extensions: FingerprintSnapshotExtension[];
}

export type FingerprintDiffStatus = 'unchanged' | 'changed' | 'onlyA' | 'onlyB';

export interface FingerprintAttributeDiff {
  key: string;
  group: FingerprintAttribute['group'];
  name: string;
  status: FingerprintDiffStatus;
  valueA: string | null;
  valueB: string | null;
  hashedA: boolean | null;
  hashedB: boolean | null;
}

export interface FingerprintSnapshotDiff {
  hashMatch: boolean;
  hashA: string;
  hashB: string;
  hashDisplayA: string;
  hashDisplayB: string;
  excludedA: string[];
  excludedB: string[];
  excludedOnlyA: string[];
  excludedOnlyB: string[];
  counts: { unchanged: number; changed: number; onlyA: number; onlyB: number };
  rows: FingerprintAttributeDiff[];
}

function isAttrGroup(value: unknown): value is FingerprintAttribute['group'] {
  return value === 'http' || value === 'javascript' || value === 'geo' || value === 'extensions';
}

function snapshotAttrKey(group: string, name: string): string {
  return `${group}\0${name}`;
}

export function serializeFingerprintSnapshot(result: FingerprintResult): FingerprintSnapshot {
  return {
    kind: FINGERPRINT_SNAPSHOT_KIND,
    version: FINGERPRINT_SNAPSHOT_VERSION,
    exportedAt: new Date(result.collectedAt || Date.now()).toISOString(),
    hash: result.hash,
    hashDisplay: result.hashDisplay,
    excludedSignals: [...(result.excludedSignals || [])],
    attributes: (result.attributes || []).map((a) => ({
      name: a.name,
      value: a.value,
      group: a.group,
      hashed: !!a.hashed,
      signalId: a.signalId,
      hashable: a.hashable,
      volatile: a.volatile,
    })),
    publicIp: result.publicIp || '',
    hostname: result.hostname || '',
    localIps: [...(result.localIps || [])],
    gps: result.gps ? { ...result.gps } : null,
    gpsPlace: result.gpsPlace ? { ...result.gpsPlace } : null,
    gpsIncluded: result.gpsIncluded,
    gpsHashed: result.gpsHashed,
    extensions: (result.extensions || []).map((e) => ({
      kind: e.kind,
      name: e.name,
      version: e.version,
    })),
  };
}

export function fingerprintSnapshotToJson(result: FingerprintResult): string {
  return JSON.stringify(serializeFingerprintSnapshot(result), null, 2);
}

export function fingerprintSnapshotFilename(when: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}-${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  return `linknest-fingerprint-${stamp}.json`;
}

export function downloadFingerprintSnapshot(result: FingerprintResult): void {
  const blob = new Blob([fingerprintSnapshotToJson(result)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fingerprintSnapshotFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function parseFingerprintSnapshotJson(raw: string): FingerprintSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('That file is not a LinkNest fingerprint export.');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.kind !== FINGERPRINT_SNAPSHOT_KIND) {
    throw new Error('That file is not a LinkNest fingerprint export.');
  }
  if (obj.version !== FINGERPRINT_SNAPSHOT_VERSION) {
    throw new Error('This fingerprint export version is not supported.');
  }
  if (typeof obj.hash !== 'string' || typeof obj.hashDisplay !== 'string') {
    throw new Error('That fingerprint export is missing a hash.');
  }
  if (!Array.isArray(obj.attributes)) {
    throw new Error('That fingerprint export is missing attributes.');
  }

  const attributes: FingerprintSnapshotAttribute[] = [];
  for (const item of obj.attributes) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.name !== 'string' || typeof row.value !== 'string' || !isAttrGroup(row.group)) {
      continue;
    }
    attributes.push({
      name: row.name,
      value: row.value,
      group: row.group,
      hashed: !!row.hashed,
      signalId: typeof row.signalId === 'string' ? row.signalId : undefined,
      hashable: typeof row.hashable === 'boolean' ? row.hashable : undefined,
      volatile: typeof row.volatile === 'boolean' ? row.volatile : undefined,
    });
  }

  let gps: FingerprintGps | null = null;
  if (obj.gps && typeof obj.gps === 'object') {
    const g = obj.gps as Record<string, unknown>;
    if (
      typeof g.lat === 'number' &&
      typeof g.lon === 'number' &&
      typeof g.latCell === 'number' &&
      typeof g.lonCell === 'number'
    ) {
      gps = { lat: g.lat, lon: g.lon, latCell: g.latCell, lonCell: g.lonCell };
    }
  }

  let gpsPlace: FingerprintGpsPlace | null = null;
  if (obj.gpsPlace && typeof obj.gpsPlace === 'object') {
    const p = obj.gpsPlace as Record<string, unknown>;
    gpsPlace = {
      country_code: typeof p.country_code === 'string' ? p.country_code : '',
      country_name: typeof p.country_name === 'string' ? p.country_name : '',
      region: typeof p.region === 'string' ? p.region : '',
      city: typeof p.city === 'string' ? p.city : '',
    };
  }

  const extensions: FingerprintSnapshotExtension[] = [];
  if (Array.isArray(obj.extensions)) {
    for (const item of obj.extensions) {
      if (!item || typeof item !== 'object') continue;
      const e = item as Record<string, unknown>;
      extensions.push({
        kind: typeof e.kind === 'string' ? e.kind : 'other',
        name: typeof e.name === 'string' ? e.name : '',
        version: typeof e.version === 'string' ? e.version : '',
      });
    }
  }

  return {
    kind: FINGERPRINT_SNAPSHOT_KIND,
    version: FINGERPRINT_SNAPSHOT_VERSION,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
    hash: obj.hash,
    hashDisplay: obj.hashDisplay,
    excludedSignals: asStringArray(obj.excludedSignals),
    attributes,
    publicIp: typeof obj.publicIp === 'string' ? obj.publicIp : '',
    hostname: typeof obj.hostname === 'string' ? obj.hostname : '',
    localIps: asStringArray(obj.localIps),
    gps,
    gpsPlace,
    gpsIncluded: typeof obj.gpsIncluded === 'boolean' ? obj.gpsIncluded : undefined,
    gpsHashed: typeof obj.gpsHashed === 'boolean' ? obj.gpsHashed : undefined,
    extensions,
  };
}

export async function parseFingerprintSnapshotFile(file: File): Promise<FingerprintSnapshot> {
  const raw = await file.text();
  return parseFingerprintSnapshotJson(raw);
}

export function diffFingerprintSnapshots(
  a: FingerprintSnapshot,
  b: FingerprintSnapshot
): FingerprintSnapshotDiff {
  const mapA = new Map<string, FingerprintSnapshotAttribute>();
  const mapB = new Map<string, FingerprintSnapshotAttribute>();
  for (const attr of a.attributes) mapA.set(snapshotAttrKey(attr.group, attr.name), attr);
  for (const attr of b.attributes) mapB.set(snapshotAttrKey(attr.group, attr.name), attr);

  const keys = Array.from(new Set([...mapA.keys(), ...mapB.keys()]));
  const rows: FingerprintAttributeDiff[] = [];
  const counts = { unchanged: 0, changed: 0, onlyA: 0, onlyB: 0 };

  for (const key of keys) {
    const left = mapA.get(key);
    const right = mapB.get(key);
    const group = (left?.group || right?.group || 'javascript') as FingerprintAttribute['group'];
    const name = left?.name || right?.name || key;
    let status: FingerprintDiffStatus;
    if (left && !right) status = 'onlyA';
    else if (!left && right) status = 'onlyB';
    else if (left && right && (left.value !== right.value || !!left.hashed !== !!right.hashed)) status = 'changed';
    else status = 'unchanged';
    counts[status] += 1;
    rows.push({
      key,
      group,
      name,
      status,
      valueA: left ? left.value : null,
      valueB: right ? right.value : null,
      hashedA: left ? !!left.hashed : null,
      hashedB: right ? !!right.hashed : null,
    });
  }

  const groupOrder = new Map(ATTR_GROUPS.map((g, i) => [g, i]));
  rows.sort((x, y) => {
    const gx = groupOrder.get(x.group) ?? 99;
    const gy = groupOrder.get(y.group) ?? 99;
    if (gx !== gy) return gx - gy;
    return x.name.localeCompare(y.name);
  });

  const setA = new Set(a.excludedSignals);
  const setB = new Set(b.excludedSignals);

  return {
    hashMatch: a.hash === b.hash,
    hashA: a.hash,
    hashB: b.hash,
    hashDisplayA: a.hashDisplay,
    hashDisplayB: b.hashDisplay,
    excludedA: [...a.excludedSignals],
    excludedB: [...b.excludedSignals],
    excludedOnlyA: a.excludedSignals.filter((id) => !setB.has(id)),
    excludedOnlyB: b.excludedSignals.filter((id) => !setA.has(id)),
    counts,
    rows,
  };
}
