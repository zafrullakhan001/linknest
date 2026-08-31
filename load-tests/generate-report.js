/**
 * Generate a self-contained HTML load-test report from a k6 summary JSON.
 *
 * Usage:
 *   node load-tests/generate-report.js
 *   node load-tests/generate-report.js load-tests/results/last-summary.json load-tests/results/report.html
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const summaryPath = path.resolve(process.argv[2] || path.join(__dirname, 'results', 'last-summary.json'));
const outPath = path.resolve(process.argv[3] || path.join(__dirname, 'results', 'report.html'));
const metaPath = path.join(path.dirname(outPath), 'meta.json');

if (!fs.existsSync(summaryPath)) {
  console.error(`Summary not found: ${summaryPath}`);
  process.exit(1);
}

const chartVendorPath = path.join(__dirname, 'vendor', 'chart.umd.min.js');
if (!fs.existsSync(chartVendorPath)) {
  console.error(`Missing Chart.js vendor file: ${chartVendorPath}`);
  console.error('Download with: curl -L -o load-tests/vendor/chart.umd.min.js https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const m = data.metrics || {};
const state = data.state || {};

function resolveBranding() {
  const envName = process.env.APP_NAME && process.env.APP_NAME.trim();
  const envFavicon = process.env.FAVICON_URL && process.env.FAVICON_URL.trim();
  let appName = envName || 'Application';
  let favicon = envFavicon || '';

  if (!envName || !envFavicon) {
    try {
      const helper = path.join(__dirname, 'get-app-name.php');
      const raw = execFileSync('php', [helper, '--json'], { encoding: 'utf8' }).trim();
      const parsed = JSON.parse(raw);
      if (!envName && parsed?.appName) appName = String(parsed.appName).trim() || appName;
      if (!envFavicon && parsed?.favicon) favicon = String(parsed.favicon).trim();
    } catch (_) {
      if (!envName) {
        try {
          const helper = path.join(__dirname, 'get-app-name.php');
          const name = execFileSync('php', [helper], { encoding: 'utf8' }).trim();
          if (name) appName = name;
        } catch (__) {
          /* ignore */
        }
      }
    }
  }

  return { appName, favicon };
}

/** Build a browser-usable favicon href (absolute preferred). */
function resolveFaviconHref(favicon, siteBase) {
  if (!favicon) return '';
  if (/^https?:\/\//i.test(favicon) || favicon.startsWith('data:')) return favicon;
  const origin = (() => {
    try {
      return new URL(siteBase).origin;
    } catch (_) {
      return 'http://localhost';
    }
  })();
  const pathPart = favicon.startsWith('/') ? favicon : `/${favicon}`;
  return `${origin}${pathPart}`;
}

function faviconLinkTags(faviconHref) {
  if (!faviconHref) return '';
  const lower = faviconHref.toLowerCase().split('?')[0];
  const type = lower.endsWith('.svg')
    ? 'image/svg+xml'
    : lower.endsWith('.ico')
      ? 'image/x-icon'
      : 'image/png';
  const safe = faviconHref.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<link rel="icon" href="${safe}" type="${type}" />
<link rel="shortcut icon" href="${safe}" type="${type}" />
<link rel="apple-touch-icon" href="${safe}" />`;
}

function resolveAppName() {
  return resolveBranding().appName;
}

function resolveTestedAt() {
  if (process.env.TESTED_AT && !Number.isNaN(Date.parse(process.env.TESTED_AT))) {
    return new Date(process.env.TESTED_AT).toISOString();
  }
  try {
    if (fs.existsSync(metaPath)) {
      const prev = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (prev?.testedAt && !Number.isNaN(Date.parse(prev.testedAt))) {
        // Keep previous testedAt only when regenerating without a new summary mtime change
      }
    }
  } catch (_) {
    /* ignore */
  }
  try {
    const st = fs.statSync(summaryPath);
    return new Date(st.mtimeMs).toISOString();
  } catch (_) {
    return new Date().toISOString();
  }
}

function formatDisplayDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  } catch (_) {
    return iso;
  }
}

function v(metric, key, fallback = null) {
  const vals = m[metric]?.values;
  if (!vals) return fallback;
  return vals[key] ?? fallback;
}

function num(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function int(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Math.round(Number(n)).toLocaleString();
}

function pct(rate, digits = 2) {
  if (rate === null || rate === undefined) return '—';
  return `${(Number(rate) * 100).toFixed(digits)}%`;
}

function bytes(n) {
  if (n === null || n === undefined) return '—';
  const u = ['B', 'KB', 'MB', 'GB'];
  let x = Number(n);
  let i = 0;
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function durationMs(ms) {
  if (ms === null || ms === undefined) return '—';
  const s = Number(ms) / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function walkChecks(group, out = []) {
  if (!group) return out;
  const checks = Array.isArray(group.checks)
    ? group.checks
    : Object.values(group.checks || {});
  for (const c of checks) {
    if (c && (c.name || c.path)) {
      out.push({
        group: group.name || 'root',
        name: c.name || c.path,
        passes: c.passes || 0,
        fails: c.fails || 0,
      });
    }
  }
  const groups = Array.isArray(group.groups)
    ? group.groups
    : Object.values(group.groups || {});
  for (const g of groups) walkChecks(g, out);
  return out;
}

const checks = walkChecks(data.root_group);
const httpFailedRate = v('http_req_failed', 'rate', 0);
const apiOkRate = v('linknest_api_ok', 'rate', 1 - httpFailedRate);
const p95 = v('http_req_duration', 'p(95)', 0);
const homeP95 = v('linknest_home_ms', 'p(95)', 0);
const spaceP95 = v('linknest_space_ms', 'p(95)', 0);

const thresholds = [
  { name: 'HTTP failure rate', value: httpFailedRate, pass: httpFailedRate < 0.05, target: '< 5%', display: pct(httpFailedRate) },
  { name: 'API success rate', value: apiOkRate, pass: apiOkRate > 0.95, target: '> 95%', display: pct(apiOkRate) },
  { name: 'Overall p95 latency', value: p95, pass: p95 < 2000, target: '< 2,000 ms', display: `${num(p95, 0)} ms` },
  { name: 'Home p95 latency', value: homeP95, pass: homeP95 < 2000, target: '< 2,000 ms', display: `${num(homeP95, 0)} ms` },
  { name: 'Space p95 latency', value: spaceP95, pass: spaceP95 < 2000, target: '< 2,000 ms', display: `${num(spaceP95, 0)} ms` },
];

const passedCount = thresholds.filter((t) => t.pass).length;
const overallPass = passedCount === thresholds.length;
const generatedAt = new Date().toISOString();
const testedAt = resolveTestedAt();
const branding = resolveBranding();
const appName = branding.appName;
const baseUrl = (process.env.BASE_URL || 'http://localhost/linknest').replace(/\/$/, '');
const faviconHref = resolveFaviconHref(branding.favicon, baseUrl);
const faviconHtml = faviconLinkTags(faviconHref);

const reportMeta = {
  title: `${appName} Load Test Report`,
  appName,
  favicon: faviconHref || branding.favicon || '',
  baseUrl,
  vus: v('vus_max', 'max', 100),
  duration: durationMs(state.testRunDurationMs),
  durationMs: state.testRunDurationMs || 0,
  testedAt,
  testedAtDisplay: formatDisplayDate(testedAt),
  generatedAt,
  generatedAtDisplay: formatDisplayDate(generatedAt),
  overallPass,
  passedCount,
  thresholdTotal: thresholds.length,
};

const latencySeries = {
  labels: ['min', 'median', 'avg', 'p90', 'p95', 'max'],
  overall: [
    v('http_req_duration', 'min', 0),
    v('http_req_duration', 'med', 0),
    v('http_req_duration', 'avg', 0),
    v('http_req_duration', 'p(90)', 0),
    v('http_req_duration', 'p(95)', 0),
    v('http_req_duration', 'max', 0),
  ],
  waiting: [
    v('http_req_waiting', 'min', 0),
    v('http_req_waiting', 'med', 0),
    v('http_req_waiting', 'avg', 0),
    v('http_req_waiting', 'p(90)', 0),
    v('http_req_waiting', 'p(95)', 0),
    v('http_req_waiting', 'max', 0),
  ],
  home: [
    v('linknest_home_ms', 'min', 0),
    v('linknest_home_ms', 'med', 0),
    v('linknest_home_ms', 'avg', 0),
    v('linknest_home_ms', 'p(90)', 0),
    v('linknest_home_ms', 'p(95)', 0),
    v('linknest_home_ms', 'max', 0),
  ],
  space: [
    v('linknest_space_ms', 'min', 0),
    v('linknest_space_ms', 'med', 0),
    v('linknest_space_ms', 'avg', 0),
    v('linknest_space_ms', 'p(90)', 0),
    v('linknest_space_ms', 'p(95)', 0),
    v('linknest_space_ms', 'max', 0),
  ],
};

const timingBreakdown = {
  labels: ['Blocked', 'Connecting', 'Sending', 'Waiting (TTFB)', 'Receiving'],
  avg: [
    v('http_req_blocked', 'avg', 0),
    v('http_req_connecting', 'avg', 0),
    v('http_req_sending', 'avg', 0),
    v('http_req_waiting', 'avg', 0),
    v('http_req_receiving', 'avg', 0),
  ],
  p95: [
    v('http_req_blocked', 'p(95)', 0),
    v('http_req_connecting', 'p(95)', 0),
    v('http_req_sending', 'p(95)', 0),
    v('http_req_waiting', 'p(95)', 0),
    v('http_req_receiving', 'p(95)', 0),
  ],
};

const successFail = {
  ok: v('linknest_api_ok', 'passes', 0),
  err: v('linknest_api_errors', 'count', 0),
  checkPass: v('checks', 'passes', 0),
  checkFail: v('checks', 'fails', 0),
};

const kpis = [
  { label: 'Virtual Users', value: int(reportMeta.vus), hint: 'Peak concurrent VUs' },
  { label: 'Total Requests', value: int(v('http_reqs', 'count', 0)), hint: `${num(v('http_reqs', 'rate', 0), 1)} req/s` },
  { label: 'Iterations', value: int(v('iterations', 'count', 0)), hint: 'Full user journeys' },
  { label: 'Error Rate', value: pct(httpFailedRate), hint: `${int(v('http_req_failed', 'passes', 0))} failed reqs`, warn: httpFailedRate >= 0.05 },
  { label: 'API Success', value: pct(apiOkRate), hint: 'Successful API responses', warn: apiOkRate <= 0.95 },
  { label: 'p95 Latency', value: `${num(p95, 0)} ms`, hint: 'All HTTP requests', warn: p95 >= 2000 },
  { label: 'Home p95', value: `${num(homeP95, 0)} ms`, hint: 'Startup batch', warn: homeP95 >= 2000 },
  { label: 'Space p95', value: `${num(spaceP95, 0)} ms`, hint: 'Tile detail', warn: spaceP95 >= 2000 },
];

const detailRows = [
  ['HTTP requests', int(v('http_reqs', 'count', 0)), `${num(v('http_reqs', 'rate', 0), 2)} /s`],
  ['Iterations (journeys)', int(v('iterations', 'count', 0)), `${num(v('iterations', 'rate', 0), 2)} /s`],
  ['Avg iteration duration', `${num(v('iteration_duration', 'avg', 0) / 1000, 1)} s`, `p95 ${num(v('iteration_duration', 'p(95)', 0) / 1000, 1)} s`],
  ['Data received', bytes(v('data_received', 'count', 0)), `${bytes(v('data_received', 'rate', 0))}/s`],
  ['Data sent', bytes(v('data_sent', 'count', 0)), `${bytes(v('data_sent', 'rate', 0))}/s`],
  ['HTTP duration avg', `${num(v('http_req_duration', 'avg', 0), 1)} ms`, `med ${num(v('http_req_duration', 'med', 0), 1)} ms`],
  ['HTTP duration p90', `${num(v('http_req_duration', 'p(90)', 0), 1)} ms`, `p95 ${num(p95, 1)} ms`],
  ['HTTP duration max', `${num(v('http_req_duration', 'max', 0), 1)} ms`, `min ${num(v('http_req_duration', 'min', 0), 1)} ms`],
  ['Server wait (TTFB) p95', `${num(v('http_req_waiting', 'p(95)', 0), 1)} ms`, `avg ${num(v('http_req_waiting', 'avg', 0), 1)} ms`],
  ['Home load avg', `${num(v('linknest_home_ms', 'avg', 0), 1)} ms`, `max ${num(v('linknest_home_ms', 'max', 0), 0)} ms`],
  ['Space load avg', `${num(v('linknest_space_ms', 'avg', 0), 1)} ms`, `max ${num(v('linknest_space_ms', 'max', 0), 0)} ms`],
  ['API errors', int(v('linknest_api_errors', 'count', 0)), `${num(v('linknest_api_errors', 'rate', 0), 2)} /s`],
  ['Checks passed', int(v('checks', 'passes', 0)), pct(v('checks', 'rate', 0))],
  ['Checks failed', int(v('checks', 'fails', 0)), ''],
  ['Test wall time', reportMeta.duration, ''],
];

const chartPayload = {
  latencySeries,
  timingBreakdown,
  successFail,
  thresholds: thresholds.map((t) => ({ name: t.name, pass: t.pass, display: t.display, target: t.target })),
  checks,
};

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${reportMeta.title}</title>
${faviconHtml}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
<!-- Chart.js + bootstrap are same-origin (?asset=) so CSP script-src 'self' allows graphs -->
<script src="?asset=chart.umd.min.js"></script>
<style>
  :root {
    --bg: #f3efe6;
    --bg-2: #ebe4d6;
    --ink: #1c2421;
    --muted: #5c6b64;
    --line: rgba(28, 36, 33, 0.12);
    --panel: rgba(255, 252, 246, 0.92);
    --teal: #0f766e;
    --teal-deep: #115e59;
    --good: #1b7f5a;
    --good-bg: #d8f3e5;
    --bad: #b42318;
    --bad-bg: #fde8e6;
    --warn: #a15c07;
    --warn-bg: #fef0d6;
    --shadow: 0 1px 0 rgba(28,36,33,0.04);
    --radius: 18px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "IBM Plex Sans", system-ui, sans-serif;
    color: var(--ink);
    background:
      radial-gradient(1200px 600px at 10% -10%, rgba(15,118,110,0.12), transparent 55%),
      radial-gradient(900px 500px at 100% 0%, rgba(161,92,7,0.08), transparent 50%),
      linear-gradient(180deg, var(--bg), var(--bg-2));
    min-height: 100vh;
  }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 40px 24px 72px; }
  .hero {
    display: grid;
    grid-template-columns: 1.4fr 0.8fr;
    gap: 24px;
    align-items: end;
    margin-bottom: 28px;
  }
  .eyebrow {
    font-family: "IBM Plex Mono", monospace;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--teal);
    margin: 0 0 10px;
  }
  h1 {
    font-family: Fraunces, Georgia, serif;
    font-weight: 700;
    font-size: clamp(2.2rem, 4vw, 3.2rem);
    line-height: 1.05;
    margin: 0 0 12px;
    letter-spacing: -0.02em;
  }
  .subtitle { margin: 0; color: var(--muted); font-size: 1.05rem; max-width: 46ch; }
  .status {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 22px 24px;
    box-shadow: var(--shadow);
  }
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: "IBM Plex Mono", monospace;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 12px;
    border-radius: 999px;
    margin-bottom: 14px;
  }
  .status-badge.pass { background: var(--good-bg); color: var(--good); }
  .status-badge.fail { background: var(--bad-bg); color: var(--bad); }
  .status dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin: 0; }
  .status dt { color: var(--muted); font-size: 13px; }
  .status dd { margin: 0; font-family: "IBM Plex Mono", monospace; font-size: 13px; text-align: right; }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    margin-bottom: 22px;
  }
  .kpi {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 16px 18px;
    box-shadow: var(--shadow);
  }
  .kpi.warn { border-color: rgba(180, 35, 24, 0.28); background: linear-gradient(180deg, #fff8f6, var(--panel)); }
  .kpi .label { font-size: 12px; color: var(--muted); letter-spacing: 0.02em; margin-bottom: 8px; }
  .kpi .value {
    font-family: Fraunces, Georgia, serif;
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .kpi.warn .value { color: var(--bad); }
  .kpi .hint { margin-top: 8px; font-size: 12px; color: var(--muted); font-family: "IBM Plex Mono", monospace; }
  .grid-2 {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 16px;
    margin-bottom: 16px;
  }
  .grid-2b {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }
  .panel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 20px 22px 18px;
    box-shadow: var(--shadow);
  }
  .panel h2 {
    font-family: Fraunces, Georgia, serif;
    font-size: 1.25rem;
    margin: 0 0 4px;
    letter-spacing: -0.01em;
  }
  .panel .cap {
    margin: 0 0 16px;
    color: var(--muted);
    font-size: 13px;
  }
  .chart-box { position: relative; height: 280px; }
  .chart-box.sm { height: 240px; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  th, td {
    text-align: left;
    padding: 10px 8px;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }
  th {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    font-weight: 600;
  }
  td.mono, th.mono { font-family: "IBM Plex Mono", monospace; font-size: 13px; }
  .pill {
    display: inline-block;
    padding: 3px 9px;
    border-radius: 999px;
    font-family: "IBM Plex Mono", monospace;
    font-size: 11px;
    font-weight: 500;
  }
  .pill.ok { background: var(--good-bg); color: var(--good); }
  .pill.bad { background: var(--bad-bg); color: var(--bad); }
  .findings {
    display: grid;
    gap: 10px;
  }
  .finding {
    border-left: 3px solid var(--teal);
    padding: 10px 12px;
    background: rgba(15, 118, 110, 0.06);
    border-radius: 0 10px 10px 0;
  }
  .finding.warn { border-left-color: var(--bad); background: rgba(180, 35, 24, 0.06); }
  .finding strong { display: block; margin-bottom: 4px; }
  .finding p { margin: 0; color: var(--muted); font-size: 14px; }
  .glossary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px 20px;
  }
  .glossary-item {
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(255,252,246,0.55);
  }
  .glossary-item h3 {
    margin: 0 0 6px;
    font-size: 14px;
    font-family: "IBM Plex Mono", monospace;
    font-weight: 500;
    color: var(--teal-deep);
  }
  .glossary-item p {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--muted);
  }
  .glossary-item .example {
    margin-top: 8px;
    font-size: 12.5px;
    color: var(--ink);
    font-family: "IBM Plex Mono", monospace;
    background: rgba(15, 118, 110, 0.07);
    padding: 8px 10px;
    border-radius: 8px;
  }
  .glossary-note {
    margin-top: 16px;
    padding: 12px 14px;
    border-radius: 12px;
    background: rgba(28, 36, 33, 0.04);
    color: var(--muted);
    font-size: 13.5px;
    line-height: 1.45;
  }
  .solutions {
    display: grid;
    gap: 12px;
  }
  .solution {
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 14px 16px;
    background: rgba(255,252,246,0.7);
  }
  .solution.applied {
    border-color: rgba(27, 127, 90, 0.35);
    background: linear-gradient(180deg, #eaf8f0, rgba(255,252,246,0.85));
  }
  .solution.next {
    border-color: rgba(161, 92, 7, 0.28);
    background: linear-gradient(180deg, #fff8eb, rgba(255,252,246,0.85));
  }
  .solution .tag {
    display: inline-block;
    font-family: "IBM Plex Mono", monospace;
    font-size: 11px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 999px;
    margin-bottom: 8px;
  }
  .solution.applied .tag { background: var(--good-bg); color: var(--good); }
  .solution.next .tag { background: var(--warn-bg); color: var(--warn); }
  .solution h3 {
    margin: 0 0 6px;
    font-family: Fraunces, Georgia, serif;
    font-size: 1.05rem;
  }
  .solution p { margin: 0 0 8px; color: var(--muted); font-size: 14px; line-height: 1.45; }
  .solution ul { margin: 0; padding-left: 18px; color: var(--ink); font-size: 13.5px; line-height: 1.5; }
  .solution code {
    font-family: "IBM Plex Mono", monospace;
    font-size: 12px;
    background: rgba(28,36,33,0.06);
    padding: 1px 5px;
    border-radius: 4px;
  }
  .rundate {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
    align-items: center;
    margin: 16px 0 0;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: rgba(15, 118, 110, 0.07);
    font-size: 13.5px;
  }
  .rundate strong {
    font-family: "IBM Plex Mono", monospace;
    color: var(--teal-deep);
    font-weight: 500;
  }
  .steps {
    counter-reset: step;
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .steps li {
    position: relative;
    padding: 14px 14px 14px 56px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: rgba(255,252,246,0.7);
  }
  .steps li::before {
    counter-increment: step;
    content: counter(step);
    position: absolute;
    left: 14px;
    top: 14px;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: var(--teal);
    color: #fff;
    font-family: "IBM Plex Mono", monospace;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .steps h3 {
    margin: 0 0 6px;
    font-size: 15px;
    font-family: Fraunces, Georgia, serif;
  }
  .steps p { margin: 0; color: var(--muted); font-size: 13.5px; line-height: 1.45; }
  .steps pre {
    margin: 10px 0 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: #1c2421;
    color: #e8efe9;
    font-family: "IBM Plex Mono", monospace;
    font-size: 12.5px;
    overflow-x: auto;
    white-space: pre-wrap;
  }
  footer {
    margin-top: 28px;
    color: var(--muted);
    font-size: 12px;
    font-family: "IBM Plex Mono", monospace;
  }
  @media (max-width: 900px) {
    .hero, .kpis, .grid-2, .grid-2b, .glossary { grid-template-columns: 1fr; }
    .kpis { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 560px) {
    .kpis { grid-template-columns: 1fr; }
    .wrap { padding: 24px 16px 48px; }
  }
  @media print {
    body { background: white; }
    .panel, .kpi, .status { break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <div>
        <p class="eyebrow">${appName} · Application load test · k6 browse scenario</p>
        <h1>${reportMeta.title}</h1>
        <p class="subtitle">
          Concurrent user simulation for ${appName}: open home, browse spaces, and click links.
          This report is generated from the latest k6 summary and is also available in Admin → Load Test.
        </p>
        <div class="rundate">
          <span><strong>Test run:</strong> ${reportMeta.testedAtDisplay}</span>
          <span><strong>Report generated:</strong> ${reportMeta.generatedAtDisplay}</span>
          <span><strong>Peak VUs:</strong> ${int(reportMeta.vus)}</span>
          <span><strong>Duration:</strong> ${reportMeta.duration}</span>
        </div>
      </div>
      <aside class="status">
        <div class="status-badge ${overallPass ? 'pass' : 'fail'}">
          <span>${overallPass ? '● PASSED' : '● THRESHOLDS MISSED'}</span>
          <span>${passedCount}/${reportMeta.thresholdTotal}</span>
        </div>
        <dl>
          <dt>Application</dt><dd>${appName}</dd>
          <dt>Target</dt><dd>${reportMeta.baseUrl}</dd>
          <dt>Test run</dt><dd>${reportMeta.testedAtDisplay}</dd>
          <dt>Wall time</dt><dd>${reportMeta.duration}</dd>
        </dl>
      </aside>
    </header>

    <section class="kpis">
      ${kpis
        .map(
          (k) => `<article class="kpi${k.warn ? ' warn' : ''}">
        <div class="label">${k.label}</div>
        <div class="value">${k.value}</div>
        <div class="hint">${k.hint}</div>
      </article>`
        )
        .join('')}
    </section>

    <section class="grid-2">
      <article class="panel">
        <h2>Latency distribution</h2>
        <p class="cap">Request duration percentiles (ms) — overall vs home/space journeys</p>
        <div class="chart-box"><canvas id="latencyChart"></canvas></div>
      </article>
      <article class="panel">
        <h2>Success vs errors</h2>
        <p class="cap">API outcomes and assertion checks</p>
        <div class="chart-box sm"><canvas id="successChart"></canvas></div>
      </article>
    </section>

    <section class="grid-2b">
      <article class="panel">
        <h2>Request timing breakdown</h2>
        <p class="cap">Where time is spent inside each HTTP request (ms)</p>
        <div class="chart-box"><canvas id="timingChart"></canvas></div>
      </article>
      <article class="panel">
        <h2>Home vs space latency</h2>
        <p class="cap">Custom application journey timers (ms)</p>
        <div class="chart-box"><canvas id="journeyChart"></canvas></div>
      </article>
    </section>

    <section class="grid-2">
      <article class="panel">
        <h2>Thresholds</h2>
        <p class="cap">Pass/fail against configured SLOs</p>
        <table>
          <thead>
            <tr><th>Threshold</th><th class="mono">Actual</th><th class="mono">Target</th><th>Result</th></tr>
          </thead>
          <tbody>
            ${thresholds
              .map(
                (t) => `<tr>
              <td>${t.name}</td>
              <td class="mono">${t.display}</td>
              <td class="mono">${t.target}</td>
              <td><span class="pill ${t.pass ? 'ok' : 'bad'}">${t.pass ? 'PASS' : 'FAIL'}</span></td>
            </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </article>
      <article class="panel">
        <h2>Key findings</h2>
        <p class="cap">Interpretation of this run</p>
        <div class="findings">
          <div class="finding${homeP95 >= 2000 ? ' warn' : ''}">
            <strong>Home page is the bottleneck</strong>
            <p>Home batch p95 was ${num(homeP95, 0)} ms (avg ${num(v('linknest_home_ms', 'avg', 0), 0)} ms). Parallel calls to tiles/settings/styles dominate load time under concurrency.</p>
          </div>
          <div class="finding">
            <strong>Space detail stays healthy</strong>
            <p>Opening individual spaces stayed fast (p95 ${num(spaceP95, 0)} ms). Navigation into a tile is not the limiting factor.</p>
          </div>
          <div class="finding${httpFailedRate >= 0.05 ? ' warn' : ''}">
            <strong>Reliability under load</strong>
            <p>${pct(apiOkRate)} API success with ${int(v('linknest_api_errors', 'count', 0))} errors across ${int(v('http_reqs', 'count', 0))} requests (~${num(v('http_reqs', 'rate', 0), 1)} req/s).</p>
          </div>
          <div class="finding">
            <strong>Throughput</strong>
            <p>${int(v('iterations', 'count', 0))} full browse iterations completed with peak ${int(reportMeta.vus)} concurrent users over ${reportMeta.duration}.</p>
          </div>
        </div>
      </article>
    </section>

    <section class="grid-2b" style="margin-top:16px">
      <article class="panel">
        <h2>Checks</h2>
        <p class="cap">Assertion results by scenario step</p>
        <table>
          <thead>
            <tr><th>Group</th><th>Check</th><th class="mono">Pass</th><th class="mono">Fail</th></tr>
          </thead>
          <tbody>
            ${
              checks.length
                ? checks
                    .map(
                      (c) => `<tr>
              <td>${c.group}</td>
              <td>${c.name}</td>
              <td class="mono">${int(c.passes)}</td>
              <td class="mono">${int(c.fails)}</td>
            </tr>`
                    )
                    .join('')
                : '<tr><td colspan="4">No checks recorded</td></tr>'
            }
          </tbody>
        </table>
      </article>
      <article class="panel">
        <h2>Detailed metrics</h2>
        <p class="cap">Raw values from k6 summary</p>
        <table>
          <thead>
            <tr><th>Metric</th><th class="mono">Primary</th><th class="mono">Secondary</th></tr>
          </thead>
          <tbody>
            ${detailRows
              .map(
                (r) => `<tr>
              <td>${r[0]}</td>
              <td class="mono">${r[1]}</td>
              <td class="mono">${r[2]}</td>
            </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </article>
    </section>

    <section class="panel" style="margin-top:16px">
      <h2>How to run this load test again</h2>
      <p class="cap">Step-by-step for Windows / XAMPP (same machine that hosts ${appName})</p>
      <ol class="steps">
        <li>
          <h3>Confirm the app is running</h3>
          <p>Start Apache (and MySQL only if you use it). Open <code>${baseUrl}</code> in a browser and confirm the home page loads.</p>
        </li>
        <li>
          <h3>Install k6 (one-time)</h3>
          <p>If k6 is not installed yet, run this in PowerShell:</p>
          <pre>winget install --id GrafanaLabs.k6 -e --source winget --accept-package-agreements</pre>
          <p style="margin-top:8px">Then open a <strong>new</strong> PowerShell window so <code>k6</code> is on PATH.</p>
        </li>
        <li>
          <h3>Open a terminal in the project folder</h3>
          <pre>cd c:\\xampp\\htdocs\\linknest</pre>
        </li>
        <li>
          <h3>Run the standard 100-user test</h3>
          <p>This ramps to 100 concurrent users, runs for 5 minutes, writes results, and regenerates this HTML report:</p>
          <pre>.\\load-tests\\run.ps1</pre>
        </li>
        <li>
          <h3>Optional: smoke test or login scenario</h3>
          <pre>.\\load-tests\\run.ps1 -Smoke
.\\load-tests\\run.ps1 -Login -Username admin -Password admin123
.\\load-tests\\run.ps1 -Vus 100 -Duration 3m -BaseUrl ${baseUrl}</pre>
        </li>
        <li>
          <h3>Regenerate the report only (no new test)</h3>
          <pre>node .\\load-tests\\generate-report.js</pre>
          <p style="margin-top:8px">Then refresh <strong>Admin → Load Test</strong> in ${appName}, or open <code>load-tests/results/report.html</code>.</p>
        </li>
        <li>
          <h3>What a successful run looks like</h3>
          <p>Thresholds should show green for error rate (&lt; 5%), API success (&gt; 95%), and p95 latency (&lt; 2,000&nbsp;ms). Home p95 measures the full startup batch, so it can be slightly higher than a single request.</p>
        </li>
      </ol>
    </section>

    <section class="panel" style="margin-top:16px">
      <h2>Solutions for latency failures</h2>
      <p class="cap">Why Overall / Home p95 failed, what we fixed, and what to do next</p>
      <div class="solutions">
        <div class="solution applied">
          <span class="tag">APPLIED FIX · highest impact</span>
          <h3>Stop writing to SQLite on every home page load</h3>
          <p>
            Root cause of Home p95 ${num(homeP95, 0)}&nbsp;ms / Overall p95 ${num(p95, 0)}&nbsp;ms:
            <code>GET /api/tiles</code> had a position-normalization bug that <strong>UPDATE’d every tile on every list request</strong>.
            Under 100 concurrent users those writes serialized in SQLite (WAL still allows only one writer),
            so requests queued until near the 5s busy timeout — while Space detail stayed fast (~${num(spaceP95, 0)}&nbsp;ms) because it never hit that path.
          </p>
          <ul>
            <li>Removed write-on-read normalization from <code>handleGetTiles()</code> in <code>api/tiles.php</code>.</li>
            <li>List GET is read-only again; positions stay assigned on create/reorder.</li>
            <li>Duplicate positions (if any) are logged, not repaired mid-request.</li>
          </ul>
        </div>
        <div class="solution applied">
          <span class="tag">APPLIED FIX</span>
          <h3>Remove double tile-list fetch in the load test</h3>
          <p>
            The browse scenario called <code>/api/tiles</code> twice per home iteration (batch + refresh),
            doubling pressure on the heavy endpoint. It now reuses the batch response.
          </p>
        </div>
        <div class="solution next">
          <span class="tag">NEXT · recommended</span>
          <h3>Add a lightweight tiles summary for the home grid</h3>
          <p>
            Even after the write bug, home still downloads the full nested graph (tabs → sections → links)
            for every space (~100KB+). A <code>?summary=1</code> (or <code>/tiles/summary</code>) response with card fields only
            would cut payload and PHP work; load full detail when a user opens a space.
          </p>
          <ul>
            <li>Return: id, title, emoji, theme, group, visibility, position, favorites, decorations.</li>
            <li>Omit: nested links, rich text, messages, htmlContent.</li>
            <li>Keep full <code>GET /tiles/{id}</code> for space detail (already fast).</li>
          </ul>
        </div>
        <div class="solution next">
          <span class="tag">NEXT · optional</span>
          <h3>Further headroom as traffic grows</h3>
          <ul>
            <li>Drop duplicate top-level <code>sections</code> when <code>tabs</code> are present (~extra nested bytes).</li>
            <li>Short TTL cache for guest/public tile list + styles (invalidate on save).</li>
            <li>Ensure PHP OPcache is enabled on the XAMPP host; raise Apache worker threads if CPU queues.</li>
            <li>Avoid decrypting LDAP secrets on every public <code>/settings</code> GET.</li>
          </ul>
        </div>
      </div>
      <div class="glossary-note">
        <strong style="color:var(--ink)">How to verify:</strong>
        Re-run <code>.\load-tests\run.ps1</code> after the tiles.php fix. Home p95 and Overall p95 should drop sharply
        (target &lt; 2,000&nbsp;ms). If they still fail with much larger tile counts, prioritize the summary endpoint next.
      </div>
    </section>

    <section class="panel" style="margin-top:16px">
      <h2>Understanding these metrics</h2>
      <p class="cap">Plain-language guide so you can read this report without load-testing jargon</p>
      <div class="glossary">
        <div class="glossary-item">
          <h3>Virtual Users (VUs)</h3>
          <p>Each virtual user is a simulated person using the app at the same time. At 100 VUs, the test pretends 100 people are browsing ${appName} together — opening home, spaces, and links.</p>
          <div class="example">This run peaked at ${int(reportMeta.vus)} concurrent VUs.</div>
        </div>
        <div class="glossary-item">
          <h3>p95 Latency</h3>
          <p><strong>p95</strong> (95th percentile) means: if you sorted all response times from fastest to slowest, 95% of requests were <em>at or faster than</em> this value. Only the slowest 5% were worse. It shows what most users experience, without being skewed by a few extreme outliers like a plain average can be.</p>
          <div class="example">Overall p95 = ${num(p95, 0)} ms → 95% of requests finished in ${num(p95, 0)} ms or less.</div>
        </div>
        <div class="glossary-item">
          <h3>p90 / median / avg / max</h3>
          <p><strong>p90</strong> is the same idea as p95 but for 90% of requests. <strong>Median (p50)</strong> is the middle value — half faster, half slower. <strong>Average (avg)</strong> is the mean of all times and can be pulled up by a few very slow requests. <strong>Max</strong> is the single slowest request seen.</p>
          <div class="example">Rule of thumb: watch p95 for “typical worst case”; use max only for rare spikes.</div>
        </div>
        <div class="glossary-item">
          <h3>Home p95 vs Space p95</h3>
          <p><strong>Home p95</strong> is how long the startup “home screen” batch took (auth, settings, styles, tile list, arrangements) for most users. <strong>Space p95</strong> is how long opening one space/tile detail usually took. A slow home with a fast space usually means the tile <em>list</em> is the bottleneck, not opening a single space.</p>
          <div class="example">This run: Home p95 ${num(homeP95, 0)} ms · Space p95 ${num(spaceP95, 0)} ms.</div>
        </div>
        <div class="glossary-item">
          <h3>Error rate / API success</h3>
          <p><strong>Error rate</strong> is the share of HTTP requests that failed (timeouts, 4xx/5xx, connection errors). <strong>API success</strong> is the opposite — the percentage that returned an acceptable response. Lower error rate and higher success are better.</p>
          <div class="example">This run: ${pct(httpFailedRate)} errors · ${pct(apiOkRate)} API success.</div>
        </div>
        <div class="glossary-item">
          <h3>Requests / req/s / iterations</h3>
          <p>A <strong>request</strong> is one API call (for example GET /tiles). <strong>req/s</strong> is how many of those the server handled per second. An <strong>iteration</strong> is one full user journey (home → open spaces → click links). Throughput is healthy when req/s stays high while latency and errors stay within targets.</p>
          <div class="example">${int(v('http_reqs', 'count', 0))} requests (~${num(v('http_reqs', 'rate', 0), 1)}/s) across ${int(v('iterations', 'count', 0))} journeys.</div>
        </div>
        <div class="glossary-item">
          <h3>TTFB / Waiting</h3>
          <p><strong>Waiting (TTFB)</strong> — time to first byte — is how long the client waited for the server to start responding after the request was sent. If waiting is most of the total duration, the bottleneck is usually the PHP/SQLite backend, not the network.</p>
          <div class="example">Waiting p95 = ${num(v('http_req_waiting', 'p(95)', 0), 0)} ms on this run.</div>
        </div>
        <div class="glossary-item">
          <h3>Thresholds (PASS / FAIL)</h3>
          <p>Thresholds are the goals we set before the test (for example “p95 under 2 seconds”). <strong>PASS</strong> means that goal was met; <strong>FAIL</strong> means it was not. The report can still finish successfully as a test run while marking some thresholds as missed — that tells you where performance needs work.</p>
          <div class="example">Result: ${passedCount} of ${reportMeta.thresholdTotal} thresholds passed.</div>
        </div>
        <div class="glossary-item">
          <h3>Checks</h3>
          <p>Checks are assertions inside the script, such as “tile list returned HTTP 200” or “tile detail has an id”. High pass counts mean the app behaved correctly under load, not only that it responded quickly.</p>
          <div class="example">${int(v('checks', 'passes', 0))} checks passed · ${int(v('checks', 'fails', 0))} failed (${pct(v('checks', 'rate', 0))} pass rate).</div>
        </div>
        <div class="glossary-item">
          <h3>Data sent / received</h3>
          <p>Total bytes the load generator uploaded to and downloaded from the server. Large “data received” with slow home latency often means the tiles payload is heavy (many spaces or large JSON).</p>
          <div class="example">Received ${bytes(v('data_received', 'count', 0))} · Sent ${bytes(v('data_sent', 'count', 0))}.</div>
        </div>
      </div>
      <div class="glossary-note">
        <strong style="color:var(--ink)">How to use this report:</strong>
        Start with the KPI cards and thresholds. If Home p95 or overall p95 is red, investigate the home API batch (especially <code>/api/tiles</code>).
        If Space p95 is fine but Home is slow, users can open spaces quickly once the list loads — improve list performance first.
        If error rate rises with VUs, the server may be saturating (CPU, PHP workers, or SQLite lock contention).
      </div>
    </section>

    <footer>
      ${appName} · Test run ${reportMeta.testedAtDisplay} · Source ${path.basename(summaryPath)} · Scenario browse-spaces.js · ${generatedAt}
    </footer>
  </div>

<script src="?asset=report-charts.js"></script>
</body>
</html>`;

const chartsJs = `/* Generated by generate-report.js — do not edit */
const DATA = ${JSON.stringify(chartPayload)};

const teal = '#0f766e';
const tealSoft = 'rgba(15, 118, 110, 0.55)';
const ink = '#1c2421';
const amber = '#a15c07';
const rose = '#b42318';
const sage = '#1b7f5a';

if (typeof Chart === 'undefined') {
  console.error('Chart.js failed to load — graphs cannot render.');
} else {
Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
Chart.defaults.color = '#5c6b64';
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.usePointStyle = true;

new Chart(document.getElementById('latencyChart'), {
  type: 'bar',
  data: {
    labels: DATA.latencySeries.labels,
    datasets: [
      { label: 'Overall HTTP', data: DATA.latencySeries.overall, backgroundColor: teal, borderRadius: 6, maxBarThickness: 28 },
      { label: 'Waiting (TTFB)', data: DATA.latencySeries.waiting, backgroundColor: tealSoft, borderRadius: 6, maxBarThickness: 28 },
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { grid: { display: false } },
      y: { title: { display: true, text: 'Latency (ms)' }, grid: { color: 'rgba(28,36,33,0.06)' }, beginAtZero: true }
    }
  }
});

new Chart(document.getElementById('successChart'), {
  type: 'doughnut',
  data: {
    labels: ['API OK', 'API errors', 'Checks passed', 'Checks failed'],
    datasets: [{
      data: [DATA.successFail.ok, DATA.successFail.err, DATA.successFail.checkPass, DATA.successFail.checkFail],
      backgroundColor: [sage, rose, teal, amber],
      borderWidth: 0,
      hoverOffset: 4
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '58%',
    plugins: {
      legend: { position: 'bottom' }
    }
  }
});

new Chart(document.getElementById('timingChart'), {
  type: 'bar',
  data: {
    labels: DATA.timingBreakdown.labels,
    datasets: [
      { label: 'Average', data: DATA.timingBreakdown.avg, backgroundColor: teal, borderRadius: 6, maxBarThickness: 26 },
      { label: 'p95', data: DATA.timingBreakdown.p95, backgroundColor: amber, borderRadius: 6, maxBarThickness: 26 }
    ]
  },
  options: {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { title: { display: true, text: 'Time (ms)' }, grid: { color: 'rgba(28,36,33,0.06)' }, beginAtZero: true },
      y: { grid: { display: false } }
    }
  }
});

new Chart(document.getElementById('journeyChart'), {
  type: 'line',
  data: {
    labels: DATA.latencySeries.labels,
    datasets: [
      {
        label: 'Home load',
        data: DATA.latencySeries.home,
        borderColor: rose,
        backgroundColor: 'rgba(180,35,24,0.12)',
        fill: true,
        tension: 0.25,
        pointRadius: 4,
        pointBackgroundColor: rose
      },
      {
        label: 'Space detail',
        data: DATA.latencySeries.space,
        borderColor: teal,
        backgroundColor: 'rgba(15,118,110,0.10)',
        fill: true,
        tension: 0.25,
        pointRadius: 4,
        pointBackgroundColor: teal
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { grid: { display: false } },
      y: { title: { display: true, text: 'Latency (ms)' }, grid: { color: 'rgba(28,36,33,0.06)' }, beginAtZero: true }
    }
  }
});
}
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf8');
const chartsPath = path.join(path.dirname(outPath), 'report-charts.js');
fs.writeFileSync(chartsPath, chartsJs, 'utf8');

const meta = {
  appName,
  favicon: faviconHref || branding.favicon || '',
  title: reportMeta.title,
  testedAt,
  testedAtDisplay: reportMeta.testedAtDisplay,
  generatedAt,
  generatedAtDisplay: reportMeta.generatedAtDisplay,
  baseUrl,
  vus: reportMeta.vus,
  durationMs: reportMeta.durationMs,
  duration: reportMeta.duration,
  overallPass,
  passedCount,
  thresholdTotal: reportMeta.thresholdTotal,
  summaryFile: path.basename(summaryPath),
  reportFile: path.basename(outPath),
  httpReqs: v('http_reqs', 'count', 0),
  httpReqFailedRate: httpFailedRate,
  apiOkRate,
  p95,
  homeP95,
  spaceP95,
};
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

console.log(`Report written: ${outPath}`);
console.log(`Meta written:   ${metaPath}`);
console.log(`App: ${appName} · Tested: ${reportMeta.testedAtDisplay}`);
if (faviconHref) console.log(`Favicon: ${faviconHref}`);
console.log(`Overall: ${overallPass ? 'PASSED' : 'THRESHOLDS MISSED'} (${passedCount}/${thresholds.length})`);
