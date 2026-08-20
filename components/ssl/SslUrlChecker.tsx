import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Globe2,
  RefreshCw,
  Lock,
  Timer,
  Info,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  Copy,
  Printer,
  History,
  Trash2,
  ChevronDown,
  GitCompare,
  Link2,
} from 'lucide-react';
import { hostnameMatchesCert, parseCertificate, type ChainValidationResult } from '../../services/ssl/cryptoUtils';
import { enrichChainTrustWithBrowser, type EnrichedChainTrust } from '../../services/ssl/sslCheckChainTrust';
import {
  buildSslLabsGradeResult,
  categoryLabelForFinding,
  type GradeResult,
} from '../../services/ssl/sslCheckGrading';
import SslLabsReportSummary from './SslLabsReportSummary';
import SslLabsReportSections from './SslLabsReportSections';
import SslCheckReportExtras from './SslCheckReportExtras';
import { DecoderPopupRequest, ToolMode } from './sslTypes';
import {
  SSL_FORGE_CERTDIFF_PEM_A_KEY,
  SSL_FORGE_CERTDIFF_PEM_B_KEY,
  SSL_FORGE_PREFILL_CHAIN_PEM_KEY,
} from './sessionKeys';
import { lookupCertificateTransparency, runSslCheck } from '../../services/sslCheckService';

const HISTORY_KEY = 'linknest-ssl-check-history';
const REMINDER_KEY = 'linknest-ssl-check-reminders';
const MAX_HISTORY = 20;
const BULK_CONCURRENCY = 4;

/** AdventHealth-style baseline: min score and TLS 1.2+ */
const BASELINE_MIN_SCORE = 80;

const DNS_RESOLVER_OPTIONS: { id: DnsResolverId; label: string; hint: string }[] = [
  { id: 'system', label: 'System DNS (this server)', hint: 'Uses the resolver configured on the web server.' },
  { id: 'google', label: 'Google Public DNS', hint: 'Queries 8.8.8.8 from the server.' },
  { id: 'cloudflare', label: 'Cloudflare DNS', hint: 'Queries 1.1.1.1 from the server.' },
  { id: 'quad9', label: 'Quad9 DNS', hint: 'Queries 9.9.9.9 from the server.' },
  { id: 'opendns', label: 'OpenDNS', hint: 'Queries 208.67.222.222 from the server.' },
  { id: 'custom', label: 'Custom public DNS IP', hint: 'Enter a public DNS server IP, not an internal resolver.' },
];

type ProbeTargets = {
  sni?: string;
  tls_endpoint?: string;
  https_probe_url?: string;
  https_effective_url?: string | null;
  http_probe_url?: string;
  waf_probe_url?: string;
  forced_dns_ip?: string;
};

type DnsResolverId = 'system' | 'google' | 'cloudflare' | 'quad9' | 'opendns' | 'custom';

type DnsResolverInfo = {
  id: DnsResolverId | string;
  label: string;
  server?: string | null;
  requested?: string;
  error?: string;
};

type CtEntry = {
  id?: number | null;
  issuer_name?: string | null;
  name_value?: string | null;
  not_before?: string | null;
  not_after?: string | null;
};

type CtLookupResult = {
  ok?: boolean;
  count_returned?: number;
  entries?: CtEntry[];
  crt_sh_query_url?: string;
  note?: string;
};

type ApiResult = {
  ok: boolean;
  message?: string;
  host?: string;
  port?: number;
  protocol?: string;
  cipher?: string;
  headers?: Record<string, string>;
  headerFindings?: { header: string; status: 'present' | 'missing'; detail: string }[];
  dns_resolver?: DnsResolverInfo;
  dns_chain?: string[];
  dns_canonical?: string;
  redirect_dns_chain?: string[] | null;
  redirect_dns_canonical?: string | null;
  waf?: string | null;
  waf_info?: {
    detected: boolean;
    reason: string;
    vendor: string | null;
    source?: string;
    inconclusive?: boolean;
  };
  probe_targets?: ProbeTargets;
  resolved_ipv4?: string | null;
  resolved_ipv6?: string | null;
  peer_certificate_pem?: string | null;
  chain_pems?: string[];
  openssl_excerpt?: string | null;
  certificate?: {
    subject?: string;
    issuer?: string;
    validFrom?: string;
    validTo?: string;
    san?: string[];
  };
  caa?: { records: { flags: number; tag: string; value: string }[]; error?: string };
  caa_summary?: string;
  http_upgrade?: {
    ok: boolean;
    message?: string;
    start_url?: string;
    effective_url?: string;
    http_code?: number;
    ends_on_https?: boolean;
    curl_error?: string | null;
  };
  mixed_content_hint?: {
    ok: boolean;
    message?: string;
    sample_url?: string;
    truncated_html_bytes?: number;
    http_url_like_hits?: number;
    hint?: string;
  };
  tls_report?: {
    rows: { aspect: string; value: string; severity: string }[];
    weak: boolean;
    weak_reasons: string[];
    remediation: string[];
  };
  ocsp_stapling?: {
    stapled: boolean | null;
    status: string;
    detail: string;
  };
  posture?: {
    hsts_present: boolean;
    hsts_parsed: {
      raw: string;
      max_age: number | null;
      include_subdomains: boolean;
      preload: boolean;
    } | null;
    hsts_preload?: {
      hsts_header_present: boolean;
      max_age_sufficient: boolean;
      include_subdomains: boolean;
      preload_token: boolean;
      preload_ready: boolean;
      warnings: string[];
      notes: string[];
    };
  };
  chain_trust?: {
    status: string;
    trusted: boolean | null;
    chain_complete: boolean | null;
    missing_intermediate: boolean;
    weak_signature: boolean;
    weak_key: boolean;
    messages: string[];
    remediation: string[];
  };
  cert_meta?: {
    serial?: string | null;
    signature_algorithm?: string | null;
    key_type?: string | null;
    key_bits?: number | null;
    is_ca?: boolean;
    has_embedded_scts?: boolean;
  };
  dnssec?: {
    status: string;
    dnskey_present: boolean;
    ds_present: boolean;
    note: string;
  };
  dane?: {
    tlsa_name: string;
    records: { usage: number; selector: number; matching_type: number; data: string }[];
    spki_match: boolean | null;
    note: string;
  };
  deep_tls?: {
    rows: { version: string; supported: boolean; protocol: string | null; cipher: string | null; severity: string }[];
    client_notes: string[];
    note: string;
  } | null;
  sni_used?: string;
  probe_path?: string;
};

export type HostnameMatchInfo = {
  ok: boolean;
  matched: string[];
  reason?: string;
};

export type ScoreFinding = {
  label: string;
  severity: 'info' | 'warn' | 'bad';
  detail: string;
  /** Negative for deductions (warn −10, bad −25); info is 0 */
  scoreDelta: number;
  /** WAF-related rows use distinct pill styling */
  kind?: 'waf';
};

export type FindingScoreRow = ScoreFinding & {
  index: number;
  category: string;
  scoreBefore: number;
  scoreAfter: number;
};

export type CheckResult = {
  host: string;
  port: number;
  ok: boolean;
  message: string;
  score: number;
  durationSec: number;
  findings: ScoreFinding[];
  certificate?: {
    subject: string;
    issuer: string;
    validFrom?: string;
    validTo?: string;
    validDays?: number;
    san?: string[];
    protocol?: string;
    cipher?: string;
    issuerCn?: string;
  };
  headerFindings?: { header: string; status: 'present' | 'missing'; detail: string }[];
  dns_resolver?: DnsResolverInfo;
  dns_chain?: string[];
  dns_canonical?: string;
  redirect_dns_chain?: string[] | null;
  redirect_dns_canonical?: string | null;
  waf?: string | null;
  waf_reason?: string | null;
  waf_source?: string | null;
  waf_inconclusive?: boolean;
  caa?: ApiResult['caa'];
  caa_summary?: string;
  http_upgrade?: ApiResult['http_upgrade'];
  mixed_content_hint?: ApiResult['mixed_content_hint'];
  tls_report?: ApiResult['tls_report'];
  ocsp_stapling?: ApiResult['ocsp_stapling'];
  posture?: ApiResult['posture'];
  probe_targets?: ProbeTargets;
  resolved_ipv4?: string | null;
  resolved_ipv6?: string | null;
  peer_certificate_pem?: string | null;
  chain_pems?: string[];
  openssl_excerpt?: string | null;
  hostname_match?: HostnameMatchInfo | null;
  ct_lookup?: CtLookupResult | null;
  grade?: GradeResult;
  chain_trust?: EnrichedChainTrust;
  browser_chain?: ChainValidationResult | null;
  cert_meta?: ApiResult['cert_meta'];
  dnssec?: ApiResult['dnssec'];
  dane?: ApiResult['dane'];
  deep_tls?: ApiResult['deep_tls'];
  hsts_preload?: NonNullable<ApiResult['posture']>['hsts_preload'];
  /** Serializable snapshot for JSON download */
  export_payload?: Record<string, unknown>;
};

type HistoryEntry = { host: string; port: number; at: string; score: number; ok: boolean };

export type SslUrlCheckerProps = {
  initialHost?: string;
  initialPort?: number;
  initialSni?: string;
  initialPath?: string;
  initialDnsResolver?: DnsResolverId;
  initialDeepScan?: boolean;
  autoRun?: boolean;
  onNavigate?: (mode: ToolMode) => void;
  onOpenDecoderPopup?: (request?: DecoderPopupRequest) => void;
};

function mkFinding(label: string, severity: ScoreFinding['severity'], detail: string, kind?: 'waf'): ScoreFinding {
  const scoreDelta = severity === 'bad' ? -25 : severity === 'warn' ? -10 : 0;
  return kind ? { label, severity, detail, scoreDelta, kind } : { label, severity, detail, scoreDelta };
}

function buildFindingScoreRows(findings: ScoreFinding[]): FindingScoreRow[] {
  let running = 100;
  return findings.map((f, i) => {
    const scoreBefore = running;
    const scoreAfter = Math.max(0, running + f.scoreDelta);
    running = scoreAfter;
    return {
      ...f,
      index: i + 1,
      category: categoryLabelForFinding(f.label),
      scoreBefore,
      scoreAfter,
    };
  });
}

const FALLBACK_USER_IMPACT =
  'This lowered the score. Review the technical detail above and your HTTPS server or CDN settings if you operate the site.';

/** Plain-language impact for visitors when a row is warn or bad (info returns null). */
function endUserImpactForFinding(f: Pick<ScoreFinding, 'label' | 'severity' | 'detail' | 'kind'>): string | null {
  if (f.severity === 'info') return null;

  if (f.label.startsWith('Header:') && f.detail === 'Missing') {
    return 'Without this header, browsers may allow more risky behavior (such as extra features or embedded content). Site operators should send it on HTTPS responses; visitors rely on the site owner to fix it.';
  }
  if (f.label === 'Mixed content') {
    return 'Some page assets may still be requested over HTTP. Browsers can block or weaken them, so you might see missing images, broken scripts, or inconsistent security until the site serves everything over HTTPS.';
  }
  if (f.label === 'Hostname vs certificate' && f.severity === 'bad') {
    return 'The name you typed may not match the certificate. Treat this like the wrong site or a possible interception risk until the hostname and certificate align.';
  }
  if (f.label === 'Expired') {
    return 'The certificate is past its validity period. Browsers will show errors and connections should not be trusted until the certificate is renewed or replaced.';
  }
  if (f.label === 'Expiring soon') {
    return 'The certificate will stop working soon. Expect browser warnings or outages unless it is renewed before expiry.';
  }
  if (f.label === 'Old protocol') {
    return 'Negotiated TLS is outdated. Data in transit may be easier to attack than with modern TLS. Site operators should upgrade; visitors should prefer sites on current protocols.';
  }
  if (f.label === 'Weak cipher') {
    return 'The negotiated cipher suite is considered weak. Eavesdroppers with access to traffic could have an easier time breaking confidentiality or integrity until stronger ciphers are enabled.';
  }
  if (f.label === 'TLS suite' && f.severity === 'bad') {
    return 'Handshake settings look legacy or weak compared to current guidance. Operators should harden TLS configuration; users should be cautious with sensitive data until it improves.';
  }
  if (f.label === 'OCSP stapling' && f.severity === 'warn') {
    return 'Revocation status is not stapled on the connection. Browsers may do extra lookups (slightly slower or less private). This is usually an operator optimization, not an urgent risk for visitors.';
  }
  if (f.label === 'HTTP→HTTPS') {
    return 'Plain HTTP may not reliably jump to HTTPS for everyone. Users who type http:// could stay on an unencrypted path until redirects and HSTS are fixed on the server side.';
  }
  if (f.label === 'WAF / block signal') {
    return 'This signal is heuristic only (for example a block page). It might be a WAF, a bot filter, or a false positive; it does not by itself prove an attack on your device.';
  }
  if (f.label === 'WAF' && f.detail === 'Not detected') {
    return 'The scanner did not recognize a vendor WAF from DNS or fingerprints. The site may still sit behind a firewall or CDN; this is not proof that no protection exists.';
  }

  return FALLBACK_USER_IMPACT;
}

type DohAnswer = { type: number; data: string };

type DohJson = { Answer?: DohAnswer[]; Status?: number };

/** Public resolver (Cloudflare DoH); read-only, browser-initiated */
async function fetchCloudflareDoh(
  hostname: string,
  recordType: 'A' | 'AAAA',
  signal?: AbortSignal
): Promise<string | null> {
  const url = new URL('https://cloudflare-dns.com/dns-query');
  url.searchParams.set('name', hostname);
  url.searchParams.set('type', recordType);
  const r = await fetch(url.toString(), {
    headers: { Accept: 'application/dns-json' },
    signal,
  });
  if (!r.ok) return null;
  const j = (await r.json()) as DohJson;
  const want = recordType === 'A' ? 1 : 28;
  const hit = j.Answer?.find((a) => a.type === want);
  return hit?.data?.trim() || null;
}

function spkiHexFromCertInfo(cert: ReturnType<typeof parseCertificate>): string | null {
  if (!cert?.spkiSha256) return null;
  const hex = cert.spkiSha256.replace(/[^0-9a-fA-F]/g, '');
  return hex.length === 64 ? hex.toLowerCase() : null;
}

async function fetchCtSummary(spkiHex: string, signal?: AbortSignal): Promise<CtLookupResult | null> {
  try {
    const r = await lookupCertificateTransparency({ spkisha256: spkiHex, signal });
    const j = (await r.json()) as CtLookupResult;
    return j;
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async () => {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  };

  const n = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReportText(r: CheckResult): string {
  const lines: string[] = [
    `SSL check: ${r.host}:${r.port}`,
    `Score: ${r.score}/100${r.grade ? ` (${r.grade.letter})` : ''}`,
    `Duration: ${r.durationSec.toFixed(2)}s`,
    `OK: ${r.ok}`,
    r.dns_resolver ? `DNS resolver: ${r.dns_resolver.label}${r.dns_resolver.server ? ` (${r.dns_resolver.server})` : ''}` : '',
    '',
  ];
  if (r.certificate) {
    lines.push('Certificate', `  Subject: ${r.certificate.subject}`, `  Issuer: ${r.certificate.issuer}`);
    if (r.certificate.validTo) lines.push(`  Valid to: ${r.certificate.validTo}`);
    if (r.certificate.validDays !== undefined) lines.push(`  Days left: ${r.certificate.validDays}`);
    lines.push(`  Protocol: ${r.certificate.protocol || 'n/a'}`, `  Cipher: ${r.certificate.cipher || 'n/a'}`, '');
  }
  if (r.hostname_match) {
    lines.push(
      'Hostname vs cert',
      `  Match: ${r.hostname_match.ok ? 'yes' : 'no'}`,
      r.hostname_match.matched.length ? `  Matched: ${r.hostname_match.matched.join(', ')}` : '',
      r.hostname_match.reason ? `  Reason: ${r.hostname_match.reason}` : '',
      ''
    );
  }
  if (r.ct_lookup) {
    lines.push(
      'Certificate transparency',
      `  Entries (truncated): ${r.ct_lookup.count_returned ?? 0}`,
      r.ct_lookup.note ? `  Note: ${r.ct_lookup.note}` : '',
      ''
    );
  }
  if (r.findings.length) {
    const rows = buildFindingScoreRows(r.findings);
    lines.push(
      'Findings (score trail)',
      '  Rules: start 100; each warn -10; each bad -25; info 0.',
      ...rows.flatMap((row) => {
        const main = `  ${row.index}. [${row.severity}] ${row.scoreBefore}→${row.scoreAfter} (${row.scoreDelta === 0 ? '0' : String(row.scoreDelta)}) ${row.label}: ${row.detail}`;
        const impact = endUserImpactForFinding(row);
        if (impact) return [main, `      For you: ${impact}`];
        return [main];
      })
    );
  }
  return lines.filter(Boolean).join('\n');
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CAA_LOOKUP_UNAVAILABLE_GUIDANCE =
  'This checker could not query CAA from here. That does not prove the domain has no CAA—verify with your DNS provider or another DNS tool.';

const CAA_LOOKUP_FAILED_GUIDANCE =
  'CAA lookup did not complete from this checker. Verify CAA using external DNS tools if you need an authoritative answer.';

/** User-visible CAA notice (no stack or runtime details). */
function publicCaaNotice(error?: string): string | null {
  if (!error) return null;
  if (error === 'caa_lookup_not_supported') return CAA_LOOKUP_UNAVAILABLE_GUIDANCE;
  return CAA_LOOKUP_FAILED_GUIDANCE;
}

/** Human-readable CAA summary line (hides internal API tokens). */
function displayCaaSummary(summary?: string | null): string | null {
  if (!summary) return null;
  if (summary === 'no_caa_records') return 'No CAA records were returned by this check.';
  if (summary.startsWith('records_present:')) {
    return `CAA record tags observed: ${summary.replace(/^records_present:\s*/, '')}`;
  }
  return summary;
}

function sanitizeCaaForPublicExport(caa: ApiResult['caa']): Record<string, unknown> {
  const records = caa?.records ?? [];
  const err = caa?.error;
  if (err === 'caa_lookup_not_supported') {
    return {
      records: [],
      lookup_status: 'unavailable',
      guidance: CAA_LOOKUP_UNAVAILABLE_GUIDANCE,
    };
  }
  if (err === 'dns_lookup_failed' || err) {
    return {
      records,
      lookup_status: 'failed',
      guidance: CAA_LOOKUP_FAILED_GUIDANCE,
    };
  }
  return { records };
}

function sanitizeCaaSummaryForExport(summary: unknown): unknown {
  if (typeof summary !== 'string') return summary;
  return displayCaaSummary(summary) ?? summary;
}

/** Remove internal implementation details from downloadable JSON. */
function sanitizeExportPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  if (out.caa != null && typeof out.caa === 'object') {
    out.caa = sanitizeCaaForPublicExport(out.caa as ApiResult['caa']);
  }
  if ('caa_summary' in out) {
    out.caa_summary = sanitizeCaaSummaryForExport(out.caa_summary);
  }
  return out;
}

function buildFindingsOnlyExport(r: CheckResult): Record<string, unknown> {
  const rows = buildFindingScoreRows(r.findings);
  return {
    export_type: 'ssl_findings',
    host: r.host,
    port: r.port,
    score: r.score,
    ok: r.ok,
    score_rules:
      'Overall score = average of four SSL Labs categories (see grade panel). Finding trail rows show per-item deltas within categories.',
    generated_at: new Date().toISOString(),
    findings: rows.map((row) => ({
      index: row.index,
      label: row.label,
      detail: row.detail,
      severity: row.severity,
      category: row.category,
      points: row.scoreDelta,
      user_impact: endUserImpactForFinding(row) ?? undefined,
      waf_related: row.kind === 'waf' ? true : undefined,
    })),
  };
}

function downloadFindingsJson(r: CheckResult) {
  const safeHost = r.host.replace(/[^\w.-]+/g, '_');
  downloadText(`ssl-findings-${safeHost}.json`, JSON.stringify(buildFindingsOnlyExport(r), null, 2), 'application/json');
}

function downloadFindingsCsv(r: CheckResult) {
  const rows = buildFindingScoreRows(r.findings);
  const headers = ['index', 'label', 'detail', 'severity', 'category', 'points', 'user_impact', 'waf_related'];
  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      [
        String(row.index),
        csvEscape(row.label),
        csvEscape(row.detail),
        row.severity,
        csvEscape(row.category),
        String(row.scoreDelta),
        csvEscape(endUserImpactForFinding(row) ?? ''),
        row.kind === 'waf' ? 'yes' : 'no',
      ].join(',')
    ),
  ];
  const safeHost = r.host.replace(/[^\w.-]+/g, '_');
  downloadText(`ssl-findings-${safeHost}.csv`, lines.join('\n'), 'text/csv;charset=utf-8');
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {
    /* ignore */
  }
}

const normalizeCertificate = (apiResult: ApiResult) => {
  const { certificate, protocol, cipher, host, port } = apiResult;

  let validDays: number | undefined;
  if (certificate?.validTo) {
    const diff = new Date(certificate.validTo).getTime() - Date.now();
    validDays = Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  const issuerStr = certificate?.issuer || '';
  const issuerCnMatch = issuerStr.match(/commonName=([^,]+)/i);
  const issuerCn = issuerCnMatch ? issuerCnMatch[1].trim() : undefined;

  return {
    host,
    port,
    subject: certificate?.subject || 'Unknown subject',
    issuer: issuerStr || 'Unknown issuer',
    issuerCn,
    validFrom: certificate?.validFrom,
    validTo: certificate?.validTo,
    validDays,
    san: certificate?.san,
    protocol,
    cipher,
  };
};

const scoreFindings = (data: ReturnType<typeof normalizeCertificate>): ScoreFinding[] => {
  const findings: ScoreFinding[] = [];

  if (data.validDays !== undefined) {
    if (data.validDays < 0) {
      findings.push(mkFinding('Expired', 'bad', 'Certificate is expired.'));
    } else if (data.validDays < 15) {
      findings.push(mkFinding('Expiring soon', 'warn', `Expires in ${data.validDays} days.`));
    } else if (data.validDays < 45) {
      findings.push(mkFinding('Renew window', 'info', `Expires in ${data.validDays} days.`));
    }
  }

  if (data.protocol) {
    if (data.protocol.includes('TLSv1') && !data.protocol.includes('1.3') && !data.protocol.includes('1.2')) {
      findings.push(mkFinding('Old protocol', 'bad', `Protocol ${data.protocol}`));
    } else if (data.protocol.includes('1.2')) {
      findings.push(mkFinding('TLS 1.2', 'info', 'Modern but not latest.'));
    } else if (data.protocol.includes('1.3')) {
      findings.push(mkFinding('TLS 1.3', 'info', 'Latest protocol negotiated.'));
    }
  }

  if (data.cipher) {
    const lower = data.cipher.toLowerCase();
    if (lower.includes('rc4') || lower.includes('des') || lower.includes('3des') || lower.includes('md5')) {
      findings.push(mkFinding('Weak cipher', 'bad', data.cipher));
    } else if (lower.includes('aes256') || lower.includes('chacha20')) {
      findings.push(mkFinding('Strong cipher', 'info', data.cipher));
    } else {
      findings.push(mkFinding('Cipher', 'info', data.cipher));
    }
  }

  return findings;
};

function applyExtendedFindings(json: ApiResult & { chain_trust?: EnrichedChainTrust }, findings: ScoreFinding[]): void {
  const ct = json.chain_trust;
  if (ct?.browser_valid === true) {
    findings.push(
      mkFinding(
        'Certificate chain',
        'info',
        'Chain order, dates, and signatures valid (browser check, same as Chain validator).'
      )
    );
  } else if (ct?.browser_valid === false) {
    const msg = ct.browser_errors?.[0] || 'Certificate chain validation failed in browser.';
    findings.push(mkFinding('Certificate chain', 'bad', msg));
    if (ct.missing_intermediate) {
      findings.push(mkFinding('Missing intermediate', 'bad', 'Intermediate certificate(s) missing or incorrect in served chain.'));
    }
  }

  if (ct) {
    const opensslSkipped = ct.openssl_skipped === true;
    const userMsgs = opensslSkipped
      ? ct.messages.filter((m) => !/not recognized|skipped|unable to find openssl|openssl cli/i.test(m))
      : ct.messages;
    const userMsg = userMsgs[0] ?? '';

    if (ct.trusted === true) {
      findings.push(mkFinding('System CA trust', 'info', userMsg || 'Chain verifies against server CA bundle.'));
    } else if (ct.trusted === false && !opensslSkipped) {
      findings.push(mkFinding('System CA trust', 'bad', userMsg || 'Chain is not trusted by server CA bundle.'));
    } else if (opensslSkipped && ct.browser_valid !== false) {
      findings.push(
        mkFinding(
          'System CA trust',
          'info',
          ct.browser_valid
            ? 'Server OpenSSL check skipped; chain structure validated in browser.'
            : 'Server OpenSSL check skipped on this host.'
        )
      );
    } else if (ct.missing_intermediate && ct.browser_valid !== true) {
      findings.push(mkFinding('Chain trust', 'bad', userMsg || 'Missing or incomplete intermediate chain.'));
    }

    if (ct.weak_signature) {
      findings.push(mkFinding('Weak signature', 'bad', 'Leaf certificate uses a weak signature algorithm.'));
    }
    if (ct.weak_key) {
      findings.push(mkFinding('Weak key size', 'bad', 'Leaf key is below recommended size.'));
    }
    if (ct.leaf_is_ca) {
      findings.push(mkFinding('Leaf CA flag', 'bad', 'Leaf certificate has CA:TRUE.'));
    }
  }

  if (json.cert_meta?.has_embedded_scts) {
    findings.push(mkFinding('Embedded SCTs', 'info', 'Certificate includes embedded signed certificate timestamps.'));
  }

  const hp = json.posture?.hsts_preload;
  if (hp) {
    if (hp.preload_ready) {
      findings.push(mkFinding('HSTS preload', 'info', 'Header meets hstspreload.org requirements.'));
    } else if (hp.hsts_header_present && hp.warnings.length) {
      findings.push(mkFinding('HSTS preload', 'warn', hp.warnings[0]));
    } else if (!hp.hsts_header_present) {
      findings.push(mkFinding('HSTS preload', 'warn', 'No HSTS header for preload eligibility.'));
    }
  }

  if (json.headerFindings) {
    json.headerFindings.forEach((hf) => {
      const q = (hf as { quality?: string | null }).quality;
      if (q === 'weak' || q === 'deprecated') {
        findings.push(mkFinding(`Header: ${hf.header}`, 'warn', `${hf.detail} (${q})`));
      }
    });
  }

  if (json.dnssec?.status === 'dnssec_data_present') {
    findings.push(mkFinding('DNSSEC', 'info', 'DNSKEY or DS records present (read-only hint).'));
  }

  if (json.dane?.records?.length) {
    const match = json.dane.spki_match;
    if (match === true) {
      findings.push(mkFinding('DANE TLSA', 'info', 'TLSA record matches served certificate SPKI.'));
    } else if (match === false) {
      findings.push(mkFinding('DANE TLSA', 'warn', 'TLSA records present but do not match served SPKI.'));
    } else {
      findings.push(mkFinding('DANE TLSA', 'info', `${json.dane.records.length} TLSA record(s) found.`));
    }
  }

  if (json.deep_tls?.rows) {
    const legacy = json.deep_tls.rows.filter(
      (r) => (r.version === 'TLSv1' || r.version === 'TLSv1.1') && r.supported
    );
    if (legacy.length) {
      findings.push(mkFinding('Deep TLS scan', 'warn', `Legacy ${legacy.map((r) => r.version).join(', ')} still enabled.`));
    }
  }
}

async function runDiagnostics(
  host: string,
  port: number,
  options?: {
    signal?: AbortSignal;
    dnsResolver?: DnsResolverId;
    customDnsServer?: string;
    sni?: string;
    path?: string;
    deepScan?: boolean;
  }
): Promise<CheckResult> {
  const t0 = performance.now();
  const signal = options?.signal;

  try {
    const resp = await runSslCheck({
      host,
      port,
      dns_resolver: options?.dnsResolver ?? 'system',
      custom_dns_server:
        options?.dnsResolver === 'custom' && options.customDnsServer?.trim()
          ? options.customDnsServer.trim()
          : undefined,
      sni: options?.sni?.trim() || undefined,
      path: options?.path?.trim()
        ? options.path.trim().startsWith('/')
          ? options.path.trim()
          : `/${options.path.trim()}`
        : undefined,
      deep_scan: options?.deepScan || undefined,
      signal,
    });
    const rawBody = await resp.text();
    let json: ApiResult;
    try {
      json = JSON.parse(rawBody) as ApiResult;
    } catch {
      const snippet = rawBody.replace(/\s+/g, ' ').trim().slice(0, 200);
      throw new Error(
        snippet
          ? `Invalid response (not JSON): ${snippet}`
          : `Invalid response (not JSON, HTTP ${resp.status}). The server may have hit a PHP error or timeout.`
      );
    }
    if (!resp.ok || !json.ok) {
      throw new Error(json?.message || `Check failed (${resp.status})`);
    }

    const normalized = normalizeCertificate(json);
    const findings = scoreFindings(normalized);

    let hostnameMatch: HostnameMatchInfo | null = null;
    if (json.peer_certificate_pem) {
      const certInfo = parseCertificate(json.peer_certificate_pem);
      if (certInfo) {
        hostnameMatch = hostnameMatchesCert(host, certInfo);
        if (!hostnameMatch.ok) {
          findings.push(
            mkFinding(
              'Hostname vs certificate',
              'bad',
              hostnameMatch.reason || 'Name on certificate does not match this host.'
            )
          );
        } else {
          findings.push(mkFinding('Hostname vs certificate', 'info', `Matches: ${hostnameMatch.matched.join(', ')}`));
        }
      }
    }

    if (json.headerFindings) {
      json.headerFindings.forEach((hf) => {
        if (hf.status === 'missing') {
          findings.push(mkFinding(`Header: ${hf.header}`, 'warn', 'Missing'));
        } else {
          findings.push(mkFinding(`Header: ${hf.header}`, 'info', hf.detail));
        }
      });
    }

    const wafInc = json.waf_info?.inconclusive === true;
    if (json.waf_info?.detected && wafInc) {
      findings.push(
        mkFinding('WAF / block signal', 'warn', `${json.waf_info.reason} (inconclusive)`, 'waf')
      );
    } else if (json.waf_info?.detected && json.waf_info.vendor) {
      const vendorName = json.waf_info.vendor === 'Potential' ? 'Potential' : json.waf_info.vendor;
      const via =
        json.waf_info.source === 'dns'
          ? ' (via DNS CNAME)'
          : json.waf_info.source === 'redirect_dns'
            ? ' (via redirected host DNS CNAME)'
            : json.waf_info.source === 'headers'
              ? ' (via response headers)'
            : json.waf_info.source === 'probe'
              ? ' (via probe)'
              : '';
      findings.push(mkFinding(`${vendorName} WAF`, 'info', json.waf_info.reason + via, 'waf'));
    } else {
      findings.push(mkFinding('WAF', 'info', 'No vendor fingerprint detected (heuristic)', 'waf'));
    }

    const { chain_trust: enrichedChainTrust, browser: browserChain } = enrichChainTrustWithBrowser(
      json.chain_trust,
      json.peer_certificate_pem,
      json.chain_pems
    );
    const jsonForFindings = { ...json, chain_trust: enrichedChainTrust };
    applyExtendedFindings(jsonForFindings, findings);

    if (json.ocsp_stapling?.stapled === true) {
      findings.push(mkFinding('OCSP stapling', 'info', json.ocsp_stapling.detail));
    } else if (json.ocsp_stapling?.stapled === false) {
      findings.push(mkFinding('OCSP stapling', 'warn', json.ocsp_stapling.detail));
    }

    if (json.tls_report?.weak) {
      findings.push(
        mkFinding('TLS suite', 'bad', 'Weak or legacy indicators on negotiated settings.')
      );
    }

    if (
      json.http_upgrade?.ok &&
      json.http_upgrade.ends_on_https === false &&
      json.http_upgrade.http_code &&
      json.http_upgrade.http_code > 0
    ) {
      findings.push(
        mkFinding('HTTP→HTTPS', 'warn', 'Plain HTTP did not end on HTTPS after redirects.')
      );
    }

    if (json.mixed_content_hint?.ok && (json.mixed_content_hint.http_url_like_hits ?? 0) > 0) {
      findings.push(
        mkFinding(
          'Mixed content',
          'warn',
          `${json.mixed_content_hint.http_url_like_hits} possible http:// references in HTML sample.`
        )
      );
    }

    // Certificate transparency (crt.sh) is loaded in the UI after this response returns so the main score and findings appear faster.

    const grade = buildSslLabsGradeResult({
      findings,
      protocol: normalized.protocol,
      cipher: normalized.cipher,
      cert_meta: json.cert_meta,
      deep_tls: json.deep_tls,
      chain_browser_valid: enrichedChainTrust?.browser_valid,
      tls_report_weak: json.tls_report?.weak,
    });
    /** Canonical score matches SSL Labs summary (average of four categories). */
    const score = grade.numeric;
    const durationSec = (performance.now() - t0) / 1000;

    const findings_score_trail = buildFindingScoreRows(findings);

    const export_payload: Record<string, unknown> = {
      host,
      port,
      score,
      durationSec,
      ok: true,
      certificate: json.certificate,
      dns_resolver: json.dns_resolver,
      dns_chain: json.dns_chain,
      dns_canonical: json.dns_canonical,
      redirect_dns_chain: json.redirect_dns_chain,
      redirect_dns_canonical: json.redirect_dns_canonical,
      probe_targets: json.probe_targets,
      resolved_ipv4: json.resolved_ipv4,
      resolved_ipv6: json.resolved_ipv6,
      waf: json.waf,
      waf_info: json.waf_info,
      headerFindings: json.headerFindings,
      tls_report: json.tls_report,
      ocsp_stapling: json.ocsp_stapling,
      ct_lookup: null,
      hostname_match: hostnameMatch,
      caa: json.caa,
      caa_summary: json.caa_summary,
      findings,
      findings_score_trail,
      grade,
      chain_trust: enrichedChainTrust,
      browser_chain: browserChain,
      cert_meta: json.cert_meta,
      dnssec: json.dnssec,
      dane: json.dane,
      deep_tls: json.deep_tls,
      hsts_preload: json.posture?.hsts_preload,
    };

    return {
      host,
      port,
      ok: true,
      message: json.message || 'Check completed',
      score,
      grade,
      durationSec,
      findings,
      certificate: {
        subject: normalized.subject,
        issuer: normalized.issuer,
        validFrom: normalized.validFrom,
        validTo: normalized.validTo,
        validDays: normalized.validDays,
        san: normalized.san,
        protocol: normalized.protocol,
        cipher: normalized.cipher,
        issuerCn: normalized.issuerCn,
      },
      headerFindings: json.headerFindings,
      dns_resolver: json.dns_resolver,
      dns_chain: json.dns_chain,
      dns_canonical: json.dns_canonical,
      redirect_dns_chain: json.redirect_dns_chain,
      redirect_dns_canonical: json.redirect_dns_canonical,
      waf: json.waf,
      waf_reason: json.waf_info?.reason,
      waf_source: json.waf_info?.source,
      waf_inconclusive: wafInc,
      caa: json.caa,
      caa_summary: json.caa_summary,
      http_upgrade: json.http_upgrade,
      mixed_content_hint: json.mixed_content_hint,
      tls_report: json.tls_report,
      ocsp_stapling: json.ocsp_stapling,
      posture: json.posture,
      probe_targets: json.probe_targets,
      resolved_ipv4: json.resolved_ipv4 ?? null,
      resolved_ipv6: json.resolved_ipv6 ?? null,
      peer_certificate_pem: json.peer_certificate_pem ?? null,
      chain_pems: json.chain_pems,
      openssl_excerpt: json.openssl_excerpt ?? null,
      hostname_match: hostnameMatch,
      ct_lookup: null,
      chain_trust: enrichedChainTrust,
      browser_chain: browserChain,
      cert_meta: json.cert_meta,
      dnssec: json.dnssec,
      dane: json.dane,
      deep_tls: json.deep_tls,
      hsts_preload: json.posture?.hsts_preload,
      export_payload,
    };
  } catch (err: unknown) {
    const durationSec = (performance.now() - t0) / 1000;
    const msg = err instanceof Error ? err.message : 'Unable to check SSL';
    return {
      host,
      port,
      ok: false,
      message: msg,
      score: 0,
      durationSec,
      findings: [],
      export_payload: {
        host,
        port,
        ok: false,
        message: msg,
        durationSec,
        score: 0,
        findings: [],
        findings_score_trail: [],
      },
    };
  }
}

const SslUrlChecker: React.FC<SslUrlCheckerProps> = ({
  initialHost = '',
  initialPort,
  initialSni = '',
  initialPath = '/',
  initialDnsResolver = 'system',
  initialDeepScan = false,
  autoRun = false,
  onNavigate,
  onOpenDecoderPopup,
}) => {
  const [host, setHost] = useState(initialHost);
  const [port, setPort] = useState(initialPort && initialPort > 0 ? initialPort : 443);
  const [sniHost, setSniHost] = useState(initialSni);
  const [probePath, setProbePath] = useState(initialPath || '/');
  const [deepScan, setDeepScan] = useState(initialDeepScan);
  const [dnsResolver, setDnsResolver] = useState<DnsResolverId>(initialDnsResolver);
  const [customDnsServer, setCustomDnsServer] = useState('');
  const [gradeLegendOpen, setGradeLegendOpen] = useState(false);
  const [bulkFilter, setBulkFilter] = useState<'all' | 'failures' | 'low_score'>('all');
  const [bulkSort, setBulkSort] = useState<'score_desc' | 'score_asc' | 'host'>('score_desc');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkResults, setBulkResults] = useState<CheckResult[]>([]);
  const bulkAbortRef = useRef<AbortController | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [advOpen, setAdvOpen] = useState(false);
  const [compareHost, setCompareHost] = useState('');
  const [comparePort, setComparePort] = useState(443);
  const [compareLoading, setCompareLoading] = useState(false);
  const [comparePair, setComparePair] = useState<{ a: CheckResult; b: CheckResult } | null>(null);
  const autoRunRef = useRef(false);
  const scanGenRef = useRef(0);
  const [ctLoading, setCtLoading] = useState(false);

  type DohCrossCheckState =
    | { status: 'idle' }
    | { status: 'loading' }
    | {
        status: 'done';
        publicIpv4: string | null;
        publicIpv6: string | null;
        error?: string;
        matchV4: boolean | null;
        matchV6: boolean | null;
      };

  const [dohCrossCheck, setDohCrossCheck] = useState<DohCrossCheckState>({ status: 'idle' });
  const dohAbortRef = useRef<AbortController | null>(null);

  const findingRows = useMemo(() => {
    const list = result?.findings;
    if (!list?.length) return [];
    return buildFindingScoreRows(list);
  }, [result?.findings]);

  const diagOptions = useMemo(
    () => ({
      dnsResolver,
      customDnsServer,
      sni: sniHost.trim() || undefined,
      path: probePath.trim() || '/',
      deepScan,
    }),
    [dnsResolver, customDnsServer, sniHost, probePath, deepScan]
  );

  const filteredBulkResults = useMemo(() => {
    let rows = [...bulkResults];
    if (bulkFilter === 'failures') {
      rows = rows.filter((r) => !r.ok || r.score < BASELINE_MIN_SCORE);
    } else if (bulkFilter === 'low_score') {
      rows = rows.filter((r) => r.score < BASELINE_MIN_SCORE);
    }
    rows.sort((a, b) => {
      if (bulkSort === 'host') return `${a.host}:${a.port}`.localeCompare(`${b.host}:${b.port}`);
      if (bulkSort === 'score_asc') return a.score - b.score;
      return b.score - a.score;
    });
    return rows;
  }, [bulkResults, bulkFilter, bulkSort]);

  const scheduleCtLookup = useCallback((res: CheckResult, gen: number) => {
    if (!res.ok || !res.peer_certificate_pem) return;
    const ci = parseCertificate(res.peer_certificate_pem);
    const hex = ci ? spkiHexFromCertInfo(ci) : null;
    if (!hex) return;
    setCtLoading(true);
    void fetchCtSummary(hex)
      .then((ct) => {
        if (gen !== scanGenRef.current) return;
        setResult((prev) => {
          if (!prev || prev.host !== res.host || prev.port !== res.port) return prev;
          const export_payload =
            prev.export_payload && typeof prev.export_payload === 'object'
              ? { ...prev.export_payload, ct_lookup: ct }
              : prev.export_payload;
          return { ...prev, ct_lookup: ct, export_payload };
        });
      })
      .finally(() => {
        if (gen === scanGenRef.current) setCtLoading(false);
      });
  }, []);

  useEffect(() => {
    if (initialHost) setHost(initialHost);
    if (initialPort != null && initialPort > 0) setPort(initialPort);
  }, [initialHost, initialPort]);

  useEffect(() => {
    if (!autoRun || autoRunRef.current) return;
    const h = (initialHost || '').replace(/^https?:\/\//i, '').trim();
    if (!h) return;
    autoRunRef.current = true;
    const p = initialPort && initialPort > 0 ? initialPort : 443;
    void (async () => {
      setLoading(true);
      setCtLoading(false);
      const gen = ++scanGenRef.current;
      const res = await runDiagnostics(h, p, diagOptions);
      setResult(res);
      scheduleCtLookup(res, gen);
      setLoading(false);
    })();
  }, [autoRun, initialHost, initialPort, scheduleCtLookup, diagOptions]);

  const disabled = !host || loading;

  const pushHistory = useCallback((r: CheckResult) => {
    const entry: HistoryEntry = {
      host: r.host,
      port: r.port,
      at: new Date().toISOString(),
      score: r.score,
      ok: r.ok,
    };
    setHistory((prev) => {
      const rest = prev.filter((e) => !(e.host === entry.host && e.port === entry.port));
      const next = [entry, ...rest].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });
  }, []);

  const badgeClass = useMemo(
    () => ({
      info: 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900',
      warn: 'bg-amber-50 text-amber-800 border border-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900',
      bad: 'bg-rose-50 text-rose-700 border border-rose-100 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900',
    }),
    []
  );

  const wafBadgeClass = useMemo(
    () => ({
      info: 'bg-violet-50 text-violet-800 border border-violet-200 dark:bg-violet-950/45 dark:text-violet-200 dark:border-violet-800',
      warn: 'bg-fuchsia-50 text-fuchsia-900 border border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-200 dark:border-fuchsia-800',
      bad: 'bg-purple-50 text-purple-900 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800',
    }),
    []
  );

  useEffect(() => {
    dohAbortRef.current?.abort();
    if (!result?.ok || !result.host.trim()) {
      setDohCrossCheck({ status: 'idle' });
      return;
    }
    const ac = new AbortController();
    dohAbortRef.current = ac;
    setDohCrossCheck({ status: 'loading' });
    const h = result.host.trim();
    const normIp = (s: string | null | undefined) => (s == null || s === '' ? null : s.trim().toLowerCase());

    void (async () => {
      try {
        const [v4, v6] = await Promise.all([
          fetchCloudflareDoh(h, 'A', ac.signal),
          fetchCloudflareDoh(h, 'AAAA', ac.signal),
        ]);
        if (ac.signal.aborted) return;
        const srv4 = normIp(result.resolved_ipv4);
        const srv6 = normIp(result.resolved_ipv6);
        const pub4 = normIp(v4);
        const pub6 = normIp(v6);
        const matchV4 = srv4 && pub4 ? srv4 === pub4 : null;
        const matchV6 = srv6 && pub6 ? srv6 === pub6 : null;
        setDohCrossCheck({
          status: 'done',
          publicIpv4: pub4,
          publicIpv6: pub6,
          matchV4,
          matchV6,
        });
      } catch (e) {
        if (ac.signal.aborted) return;
        setDohCrossCheck({
          status: 'done',
          publicIpv4: null,
          publicIpv6: null,
          error: e instanceof Error ? e.message : 'lookup failed',
          matchV4: null,
          matchV6: null,
        });
      }
    })();

    return () => ac.abort();
  }, [result?.ok, result?.host, result?.resolved_ipv4, result?.resolved_ipv6]);

  const handleCheck = async () => {
    setLoading(true);
    setCtLoading(false);
    const gen = ++scanGenRef.current;
    const trimmedHost = host.replace(/^https?:\/\//i, '').trim();
    const finalPort = port || 443;
    const res = await runDiagnostics(trimmedHost, finalPort, diagOptions);
    setResult(res);
    if (res.ok) pushHistory(res);
    scheduleCtLookup(res, gen);
    setLoading(false);
  };

  const parseBulkLines = (text: string): { host: string; port: number }[] => {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(':').map((p) => p.trim());
        if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1])) {
          const pnum = Number(parts.pop());
          return { host: parts.join(':'), port: pnum || 443 };
        }
        return { host: line.replace(/^https?:\/\//i, ''), port: 443 };
      });
  };

  const handleBulkCheck = async () => {
    const items = parseBulkLines(bulkInput);
    if (!items.length) return;
    bulkAbortRef.current?.abort();
    const ac = new AbortController();
    bulkAbortRef.current = ac;
    setBulkLoading(true);
    setBulkProgress({ done: 0, total: items.length });
    setBulkResults([]);
    let completed = 0;
    try {
      const results = await mapWithConcurrency(
        items,
        BULK_CONCURRENCY,
        async (item) => {
          const res = await runDiagnostics(item.host, item.port, { signal: ac.signal, ...diagOptions });
          completed += 1;
          setBulkProgress({ done: completed, total: items.length });
          return res;
        },
        ac.signal
      );
      setBulkResults(results);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        /* cancelled */
      }
    } finally {
      setBulkLoading(false);
      bulkAbortRef.current = null;
    }
  };

  const cancelBulk = () => {
    bulkAbortRef.current?.abort();
  };

  const copyReport = async (r: CheckResult) => {
    try {
      await navigator.clipboard.writeText(buildReportText(r));
    } catch {
      /* ignore */
    }
  };

  const printReport = (r: CheckResult) => {
    const w = window.open('', '_blank');
    if (!w) return;
    const body = `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(buildReportText(r))}</pre>`;
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SSL check ${escapeHtml(r.host)}</title></head><body>${body}<script>addEventListener('load',function(){print();});<\/script></body></html>`
    );
    w.document.close();
  };

  const downloadJson = (r: CheckResult) => {
    const raw = (r.export_payload ?? { host: r.host, port: r.port, score: r.score, ok: r.ok }) as Record<string, unknown>;
    const payload = sanitizeExportPayload(raw);
    downloadText(`ssl-check-${r.host.replace(/[^\w.-]+/g, '_')}.json`, JSON.stringify(payload, null, 2), 'application/json');
  };

  const downloadBulkCsv = () => {
    if (!bulkResults.length) return;
    const headers = ['host', 'port', 'score', 'ok', 'valid_to', 'days_left', 'protocol', 'cipher', 'waf', 'hostname_match'];
    const rows = bulkResults.map((r) =>
      [
        csvEscape(r.host),
        String(r.port),
        String(r.score),
        r.ok ? 'yes' : 'no',
        csvEscape(r.certificate?.validTo || ''),
        r.certificate?.validDays != null ? String(r.certificate.validDays) : '',
        csvEscape(r.certificate?.protocol || ''),
        csvEscape(r.certificate?.cipher || ''),
        csvEscape(r.waf || (r.waf_inconclusive ? 'inconclusive' : '')),
        csvEscape(r.hostname_match ? (r.hostname_match.ok ? 'yes' : 'no') : ''),
      ].join(',')
    );
    downloadText('ssl-bulk-check.csv', [headers.join(','), ...rows].join('\n'), 'text/csv');
  };

  const downloadBulkJson = () => {
    if (!bulkResults.length) return;
    const data = bulkResults.map((r) =>
      sanitizeExportPayload((r.export_payload ?? { host: r.host, port: r.port, score: r.score, ok: r.ok }) as Record<string, unknown>)
    );
    downloadText('ssl-bulk-check.json', JSON.stringify(data, null, 2), 'application/json');
  };

  const openDecoder = (pem: string) => {
    if (onOpenDecoderPopup) {
      onOpenDecoderPopup({ prefillPem: pem });
      return;
    }
    if (!onNavigate) return;
    onNavigate(ToolMode.CERT_DECODER);
  };

  const openChainValidator = (pems: string[]) => {
    if (!onNavigate || !pems.length) return;
    try {
      sessionStorage.setItem(SSL_FORGE_PREFILL_CHAIN_PEM_KEY, pems.join('\n'));
    } catch {
      /* ignore */
    }
    onNavigate(ToolMode.CERT_CHAIN_VALIDATOR);
  };

  const openCertDiff = (pemA: string, pemB: string) => {
    if (!onNavigate) return;
    try {
      sessionStorage.setItem(SSL_FORGE_CERTDIFF_PEM_A_KEY, pemA);
      sessionStorage.setItem(SSL_FORGE_CERTDIFF_PEM_B_KEY, pemB);
    } catch {
      /* ignore */
    }
    onNavigate(ToolMode.CERT_DIFF);
  };

  const runCompare = async () => {
    if (!result?.ok || !compareHost.trim()) return;
    const h = compareHost.replace(/^https?:\/\//i, '').trim();
    const p = comparePort || 443;
    setCompareLoading(true);
    try {
      const b = await runDiagnostics(h, p, diagOptions);
      setComparePair({ a: result, b });
    } finally {
      setCompareLoading(false);
    }
  };

  const removeHistory = (hostH: string, portH: number) => {
    setHistory((prev) => {
      const next = prev.filter((e) => !(e.host === hostH && e.port === portH));
      saveHistory(next);
      return next;
    });
  };

  return (
    <div className="space-y-6" id="ssl-checker-root">
      <div className="bg-white dark:bg-gray-800/95 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <Globe2 className="w-5 h-5 text-indigo-600 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">SSL URL checker</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Probe an HTTPS endpoint by host and port. Checks run on the server that hosts this tool (TLS, HTTP headers, and related
              probes). When available, OpenSSL improves OCSP and handshake diagnostics.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">
          <p className="font-semibold text-gray-800 dark:text-gray-200">Limitations</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Results reflect what this server negotiates; corporate TLS inspection or scanners can change the certificate you see.</li>
            <li>If OCSP stapling or OpenSSL output is missing, the host running this tool may need the OpenSSL CLI configured on its PATH.</li>
            <li>CAA results from this tool may be incomplete; an empty result here is not proof that a domain has no CAA—confirm with your DNS provider.</li>
            <li>WAF detection is heuristic; HTTP 403 alone is flagged as inconclusive.</li>
            <li>DNS for the target is resolved read-only on this server, using either its system resolver or the public DNS option you select.</li>
          </ul>
          <p className="font-semibold text-gray-800 dark:text-gray-200 mt-3">Features</p>
          <ul className="list-disc list-inside space-y-0.5 mt-1">
            <li>SSL Labs–style grade (A+–F) with four category bars, chain trust, protocol matrix, HSTS preload hints.</li>
            <li>Optional deep TLS matrix and DNSSEC/DANE read-only checks.</li>
          </ul>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1.5fr_auto]">
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Host or URL</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="example.com or https://example.com"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value) || 443)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              min={1}
              max={65535}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">DNS resolver</label>
            <select
              value={dnsResolver}
              onChange={(e) => setDnsResolver(e.target.value as DnsResolverId)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {DNS_RESOLVER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void handleCheck()}
              disabled={disabled}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white ${disabled ? 'bg-indigo-200' : 'bg-indigo-600 hover:bg-indigo-700'} transition`}
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {loading ? 'Checking...' : 'Run check'}
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">SNI hostname (optional)</label>
            <input
              type="text"
              value={sniHost}
              onChange={(e) => setSniHost(e.target.value)}
              placeholder="Same as host if empty"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">HTTPS path</label>
            <input
              type="text"
              value={probePath}
              onChange={(e) => setProbePath(e.target.value)}
              placeholder="/"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 self-end pb-2">
            <input type="checkbox" checked={deepScan} onChange={(e) => setDeepScan(e.target.checked)} className="rounded" />
            Extended TLS scan (longer timeout)
          </label>
        </div>

        {dnsResolver === 'custom' && (
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_2fr]">
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Custom public DNS IP</label>
              <input
                type="text"
                value={customDnsServer}
                onChange={(e) => setCustomDnsServer(e.target.value)}
                placeholder="8.8.4.4"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <p className="self-end text-xs text-gray-500 dark:text-gray-400">
              Custom DNS must be a public IP address. Private/internal resolvers are rejected so this stays an outside-world check.
            </p>
          </div>
        )}

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Info className="w-4 h-4" />
          Choose public DNS when internal split-horizon DNS hides CDN/WAF CNAMEs. Deep link: add
          ?ssl_tool=1&amp;ssl_host=example.com&amp;ssl_port=443&amp;ssl_autorun=1 to open this tool and run once.
        </p>
      </div>

      {history.length > 0 && (
        <div className="bg-white dark:bg-gray-800/95 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <History className="w-4 h-4 text-indigo-600" />
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent checks</p>
          </div>
          <ul className="space-y-1 text-xs">
            {history.map((e) => (
              <li
                key={`${e.host}:${e.port}:${e.at}`}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 items-center gap-y-1"
              >
                <button
                  type="button"
                  className="text-left text-indigo-600 hover:underline min-w-0 truncate"
                  onClick={() => {
                    setHost(e.host);
                    setPort(e.port);
                  }}
                >
                  {e.host}:{e.port}
                </button>
                <span className="text-left text-gray-500 dark:text-gray-400 whitespace-nowrap tabular-nums text-[11px] sm:text-xs">
                  {e.ok ? `${e.score}/100` : 'failed'} · {new Date(e.at).toLocaleString()}
                </span>
                <button
                  type="button"
                  aria-label="Remove"
                  className="p-1 text-gray-400 hover:text-rose-600 justify-self-end"
                  onClick={() => removeHistory(e.host, e.port)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <div
          className="bg-white dark:bg-gray-800/95 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm space-y-4 print:shadow-none"
          id="ssl-checker-report"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Checked</p>
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {result.host}:{result.port}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Completed in {result.durationSec.toFixed(2)}s</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              {result.grade && (
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {result.grade.letter} · {result.score}/100
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 print:hidden">
            <button
              type="button"
              onClick={() => void copyReport(result)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy report
            </button>
            <button
              type="button"
              title="Full scan snapshot (sanitized for sharing)"
              onClick={() => downloadJson(result)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <FileDown className="w-3.5 h-3.5" />
              Full JSON
            </button>
            <button
              type="button"
              onClick={() => printReport(result)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            {onNavigate && result.peer_certificate_pem && (
              <>
                <button
                  type="button"
                  onClick={() => openDecoder(result.peer_certificate_pem!)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Open in Decoder
                </button>
                {result.chain_pems && result.chain_pems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openChainValidator(result.chain_pems!)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Open in Chain validator
                  </button>
                )}
              </>
            )}
          </div>

          {result.ok && result.grade && (
            <SslLabsReportSummary
              result={result}
              gradeLegendOpen={gradeLegendOpen}
              onToggleGradeLegend={() => setGradeLegendOpen((o) => !o)}
            />
          )}

          {result.ok && <SslLabsReportSections result={result} />}

          {result.ok && (
            <SslCheckReportExtras
              result={result}
              gradeLegendOpen={false}
              onToggleGradeLegend={() => {}}
              onOpenChainValidator={
                onNavigate && result.chain_pems?.length
                  ? () => openChainValidator(result.chain_pems!)
                  : undefined
              }
            />
          )}

          {!result.ok && (
            <div className="bg-rose-50 border border-rose-100 text-rose-800 text-sm rounded-lg p-3 flex items-start gap-2 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-200">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Check failed</p>
                <p>{result.message}</p>
              </div>
            </div>
          )}

          {result.ok && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                result.waf || result.waf_inconclusive
                  ? 'border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-900 dark:bg-violet-950/35 dark:text-violet-100'
                  : 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
              }`}
            >
              <p className="font-semibold">
                WAF/CDN detection:{' '}
                {result.waf ? `${result.waf} detected` : result.waf_inconclusive ? 'Block signal observed' : 'Not detected'}
              </p>
              <p className="text-xs mt-1 break-all">
                {result.waf_reason || 'No known DNS, TLS, or probe fingerprints matched.'}
              </p>
              {result.waf_source && (
                <p className="text-xs mt-1">
                  Source:{' '}
                  <span className="font-medium">
                    {result.waf_source === 'dns'
                      ? 'DNS CNAME chain'
                      : result.waf_source === 'redirect_dns'
                        ? 'Redirected host DNS CNAME chain'
                        : result.waf_source === 'headers'
                          ? 'HTTP response headers'
                          : result.waf_source}
                  </span>
                </p>
              )}
            </div>
          )}

          {result.probe_targets && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-xs space-y-1">
              <p className="font-semibold text-gray-800 dark:text-gray-200">Probe targets</p>
              <p>
                <span className="text-gray-500">SNI:</span>{' '}
                <span className="font-mono break-all">{result.probe_targets.sni}</span>
              </p>
              <p>
                <span className="text-gray-500">TLS:</span>{' '}
                <span className="font-mono break-all">{result.probe_targets.tls_endpoint}</span>
              </p>
              {result.probe_targets.forced_dns_ip && (
                <p>
                  <span className="text-gray-500">Forced DNS IP:</span>{' '}
                  <span className="font-mono break-all">{result.probe_targets.forced_dns_ip}</span>
                </p>
              )}
              <p>
                <span className="text-gray-500">HTTPS:</span>{' '}
                <span className="font-mono break-all">{result.probe_targets.https_probe_url}</span>
              </p>
              {result.probe_targets.https_effective_url && result.probe_targets.https_effective_url !== result.probe_targets.https_probe_url && (
                <p>
                  <span className="text-gray-500">HTTPS effective:</span>{' '}
                  <span className="font-mono break-all">{result.probe_targets.https_effective_url}</span>
                </p>
              )}
              <p>
                <span className="text-gray-500">HTTP upgrade probe:</span>{' '}
                <span className="font-mono break-all">{result.probe_targets.http_probe_url}</span>
              </p>
              {result.probe_targets.waf_probe_url && (
                <p>
                  <span className="text-gray-500">WAF probe (encoded):</span>{' '}
                  <span className="font-mono break-all text-[10px]">{result.probe_targets.waf_probe_url}</span>
                </p>
              )}
            </div>
          )}

          {result.ok && (
            <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/80 dark:bg-indigo-950/30 p-3 text-xs space-y-2">
              <p className="font-semibold text-indigo-900 dark:text-indigo-100">DNS and privacy</p>
              {result.dns_resolver && (
                <p className="font-mono text-indigo-900/90 dark:text-indigo-100/90 break-all">
                  Resolver: {result.dns_resolver.label}
                  {result.dns_resolver.server ? ` (${result.dns_resolver.server})` : ''}
                </p>
              )}
              {result.dns_resolver?.error && (
                <p className="text-amber-800 dark:text-amber-200">
                  DNS resolver note: {result.dns_resolver.error}. This scan fell back to system DNS.
                </p>
              )}
              <ul className="list-disc list-inside text-indigo-900/90 dark:text-indigo-100/90 space-y-1">
                <li>
                  This page only sends a normal request to this app&apos;s SSL check API. It does not edit your computer&apos;s hosts file or
                  system DNS settings.
                </li>
                <li>Lookups for the target host run read-only on the same server as this check, using the selected DNS resolver.</li>
                <li>The IP and CNAME values here are observations from that server, not changes to your PC or router.</li>
              </ul>
              <div className="pt-2 border-t border-indigo-200/80 dark:border-indigo-800 space-y-1.5">
                <p className="font-medium text-indigo-900 dark:text-indigo-100">Public DNS cross-check (this browser → Cloudflare DNS)</p>
                {dohCrossCheck.status === 'loading' && (
                  <p className="text-indigo-800/90 dark:text-indigo-200/90">Querying public resolver…</p>
                )}
                {dohCrossCheck.status === 'done' && dohCrossCheck.error && (
                  <p className="text-gray-700 dark:text-gray-300">
                    Could not reach Cloudflare DNS-over-HTTPS ({dohCrossCheck.error}). A corporate network, VPN, privacy extension, or
                    strict browser policy can block this; that does not indicate your local DNS was modified by this tool.
                  </p>
                )}
                {dohCrossCheck.status === 'done' && !dohCrossCheck.error && (
                  <>
                    <p className="font-mono break-all">
                      <span className="text-gray-600 dark:text-gray-400">A:</span> {dohCrossCheck.publicIpv4 ?? '—'}
                    </p>
                    <p className="font-mono break-all">
                      <span className="text-gray-600 dark:text-gray-400">AAAA:</span> {dohCrossCheck.publicIpv6 ?? '—'}
                    </p>
                    {dohCrossCheck.matchV4 === true && (
                      <p className="text-emerald-800 dark:text-emerald-200">
                        Public A record matches this scan&apos;s server A where both were available.
                      </p>
                    )}
                    {dohCrossCheck.matchV4 === false && (
                      <p className="text-amber-800 dark:text-amber-200">
                        Public A differs from this scan&apos;s server A — split-horizon DNS, geo/anycast routing, or different resolver paths
                        are common; this tool still does not write to your machine.
                      </p>
                    )}
                    {dohCrossCheck.matchV6 === true && (
                      <p className="text-emerald-800 dark:text-emerald-200">
                        Public AAAA matches this scan&apos;s server AAAA where both were available.
                      </p>
                    )}
                    {dohCrossCheck.matchV6 === false && result.resolved_ipv6 && dohCrossCheck.publicIpv6 && (
                      <p className="text-amber-800 dark:text-amber-200">
                        Public AAAA differs from this scan&apos;s server AAAA (same caveats as for A).
                      </p>
                    )}
                    {dohCrossCheck.matchV4 === null && result.resolved_ipv4 && (
                      <p className="text-gray-600 dark:text-gray-400">
                        No A from Cloudflare to compare, or scan had no server A — comparison skipped for IPv4.
                      </p>
                    )}
                    {dohCrossCheck.matchV4 === null && !result.resolved_ipv4 && dohCrossCheck.publicIpv4 && (
                      <p className="text-gray-600 dark:text-gray-400">Scan had no server A; public resolver returned {dohCrossCheck.publicIpv4}.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {(result.resolved_ipv4 || result.resolved_ipv6) && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-xs">
              <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                DNS (first A / AAAA{result.dns_resolver?.label ? ` via ${result.dns_resolver.label}` : ''})
              </p>
              {result.resolved_ipv4 && (
                <p className="font-mono">
                  A: {result.resolved_ipv4}
                </p>
              )}
              {result.resolved_ipv6 && (
                <p className="font-mono">
                  AAAA: {result.resolved_ipv6}
                </p>
              )}
            </div>
          )}

          {result.hostname_match && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                result.hostname_match.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
                  : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100'
              }`}
            >
              <p className="font-semibold">Hostname vs certificate</p>
              <p className="text-xs mt-1">
                {result.hostname_match.ok
                  ? `Matches: ${result.hostname_match.matched.join(', ')}`
                  : result.hostname_match.reason || 'No match'}
              </p>
            </div>
          )}

          {(result.ct_lookup || (ctLoading && result.ok && result.peer_certificate_pem)) && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm space-y-2">
              <p className="font-semibold text-gray-800 dark:text-gray-200">Certificate transparency (crt.sh)</p>
              {ctLoading && !result.ct_lookup && (
                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  Loading transparency data (runs after the main check so results appear faster)…
                </p>
              )}
              {result.ct_lookup && (
                <>
                  <p className="text-xs text-gray-600 dark:text-gray-300">
                    Showing up to {result.ct_lookup.count_returned ?? 0} entries (server-trimmed).
                  </p>
                  {result.ct_lookup.note && <p className="text-xs text-amber-800 dark:text-amber-200">{result.ct_lookup.note}</p>}
                  {result.ct_lookup.crt_sh_query_url && (
                    <a
                      href={result.ct_lookup.crt_sh_query_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                    >
                      Open crt.sh <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </>
              )}
            </div>
          )}

          {result.certificate && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="bg-gray-50 dark:bg-gray-900/45 border border-gray-100 dark:border-gray-700/90 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Subject</p>
                <p className="text-sm text-gray-900 dark:text-gray-100">{result.certificate.subject}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900/45 border border-gray-100 dark:border-gray-700/90 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Issuer</p>
                <p className="text-sm text-gray-900 dark:text-gray-100">{result.certificate.issuer}</p>
              </div>
              {result.certificate.validFrom && (
                <div className="bg-gray-50 dark:bg-gray-900/45 border border-gray-100 dark:border-gray-700/90 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Valid from</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{new Date(result.certificate.validFrom).toUTCString()}</p>
                </div>
              )}
              {result.certificate.validTo && (
                <div className="bg-gray-50 dark:bg-gray-900/45 border border-gray-100 dark:border-gray-700/90 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Valid to</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{new Date(result.certificate.validTo).toUTCString()}</p>
                </div>
              )}
              {result.certificate.validDays !== undefined && (
                <div className="bg-gray-50 dark:bg-gray-900/45 border border-gray-100 dark:border-gray-700/90 rounded-lg p-3 flex items-center gap-2">
                  <Timer className="w-4 h-4 text-indigo-600" />
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    Days remaining: <span className="font-semibold">{result.certificate.validDays}</span>
                  </p>
                </div>
              )}
              {result.certificate.san && (
                <div className="bg-gray-50 dark:bg-gray-900/45 border border-gray-100 dark:border-gray-700/90 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">SAN</p>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-800 dark:text-gray-200">
                    {result.certificate.san.map((s) => (
                      <span key={s} className="px-2 py-1 rounded bg-white dark:bg-gray-800/95 border border-gray-200 dark:border-gray-700">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(result.certificate.protocol || result.certificate.cipher) && (
                <div className="bg-gray-50 dark:bg-gray-900/45 border border-gray-100 dark:border-gray-700/90 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">TLS details</p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {result.certificate.protocol && <span className="mr-3">Protocol: {result.certificate.protocol}</span>}
                    {result.certificate.cipher && <span>Cipher: {result.certificate.cipher}</span>}
                  </p>
                </div>
              )}
            </div>
          )}

          {result.openssl_excerpt && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold bg-gray-50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200"
                onClick={() => setAdvOpen((o) => !o)}
              >
                OpenSSL s_client excerpt
                <ChevronDown className={`w-4 h-4 transition ${advOpen ? 'rotate-180' : ''}`} />
              </button>
              {advOpen && (
                <pre className="text-[10px] p-3 overflow-x-auto max-h-64 overflow-y-auto bg-gray-900 text-gray-100 font-mono">
                  {result.openssl_excerpt}
                </pre>
              )}
            </div>
          )}

          {result.tls_report && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Cipher / protocol report</p>
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/45 text-gray-600 dark:text-gray-300 text-left">
                    <tr>
                      <th className="px-3 py-2">Aspect</th>
                      <th className="px-3 py-2">Value</th>
                      <th className="px-3 py-2">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {result.tls_report.rows.map((row) => (
                      <tr key={row.aspect}>
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{row.aspect}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-900 dark:text-gray-100 break-all">{row.value}</td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              row.severity === 'bad'
                                ? 'text-rose-700 dark:text-rose-400'
                                : row.severity === 'warn'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : row.severity === 'good'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-gray-600 dark:text-gray-300'
                            }
                          >
                            {row.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.tls_report.weak_reasons.length > 0 && (
                <ul className="text-xs text-amber-800 dark:text-amber-200 list-disc list-inside">
                  {result.tls_report.weak_reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              <ul className="text-xs text-gray-600 dark:text-gray-300 list-disc list-inside">
                {result.tls_report.remediation.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {result.ocsp_stapling && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                result.ocsp_stapling.stapled === true
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
                  : result.ocsp_stapling.stapled === false
                    ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/45 text-gray-800 dark:text-gray-200'
              }`}
            >
              <p className="font-semibold">OCSP stapling</p>
              <p className="text-xs mt-1">{result.ocsp_stapling.detail}</p>
              <p className="text-xs mt-1 text-gray-600 dark:text-gray-300">
                Stapling details require the OpenSSL CLI wherever this tool is hosted; configure that environment if this section is empty
                or shows “not found”.
              </p>
            </div>
          )}

          {result.posture?.hsts_parsed && (
            <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 text-sm text-violet-900 dark:bg-violet-950/40 dark:border-violet-900 dark:text-violet-100">
              <p className="font-semibold">HSTS (parsed)</p>
              <p className="text-xs mt-1 font-mono break-all">{result.posture.hsts_parsed.raw}</p>
              <p className="text-xs mt-1">
                max-age: {result.posture.hsts_parsed.max_age ?? 'n/a'}
                {result.posture.hsts_parsed.include_subdomains ? ' · includeSubDomains' : ''}
                {result.posture.hsts_parsed.preload ? ' · preload' : ''}
              </p>
            </div>
          )}

          {result.http_upgrade?.ok && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm dark:bg-slate-900/40 dark:border-slate-700">
              <p className="font-semibold text-slate-800 dark:text-slate-100">HTTP → HTTPS redirect</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 break-all">From: {result.http_upgrade.start_url}</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 break-all">Effective: {result.http_upgrade.effective_url}</p>
              <p className="text-xs mt-1">
                Ends on HTTPS:{' '}
                <span className="font-medium">{result.http_upgrade.ends_on_https ? 'yes' : 'no'}</span> (HTTP{' '}
                {result.http_upgrade.http_code})
              </p>
            </div>
          )}

          {result.mixed_content_hint?.ok && (
            <div className="bg-amber-50/80 border border-amber-100 rounded-lg p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-100">
              <p className="font-semibold">Mixed content (best-effort)</p>
              <p className="text-xs mt-1">{result.mixed_content_hint.hint}</p>
              <p className="text-xs mt-1">
                Sample scanned: {result.mixed_content_hint.truncated_html_bytes} bytes · http://-like hits:{' '}
                {result.mixed_content_hint.http_url_like_hits}
              </p>
            </div>
          )}

          {result.caa && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">CAA records</p>
              {result.caa.error === 'caa_lookup_not_supported' && (
                <div className="text-xs text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900 rounded-lg p-2 bg-amber-50 dark:bg-amber-950/30">
                  {CAA_LOOKUP_UNAVAILABLE_GUIDANCE}
                </div>
              )}
              {result.caa.error && result.caa.error !== 'caa_lookup_not_supported' && (
                <p className="text-xs text-amber-700 dark:text-amber-300">{publicCaaNotice(result.caa.error)}</p>
              )}
              {!result.caa.records?.length && result.caa.error !== 'caa_lookup_not_supported' ? (
                <p className="text-xs text-gray-600 dark:text-gray-300">No CAA records (any CA may issue unless constrained elsewhere).</p>
              ) : null}
              {!!result.caa.records?.length && (
                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-900/45">
                      <tr>
                        <th className="px-2 py-1 text-left">Flags</th>
                        <th className="px-2 py-1 text-left">Tag</th>
                        <th className="px-2 py-1 text-left">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {result.caa.records.map((r, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1">{r.flags}</td>
                          <td className="px-2 py-1 font-medium">{r.tag}</td>
                          <td className="px-2 py-1 font-mono break-all">{r.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(() => {
                const summaryLine = displayCaaSummary(result.caa_summary);
                return summaryLine ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{summaryLine}</p>
                ) : null;
              })()}
            </div>
          )}

          {result.dns_chain && result.dns_chain.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 dark:bg-slate-900/40 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                DNS resolution (CNAME chain{result.dns_resolver?.label ? ` via ${result.dns_resolver.label}` : ''})
              </p>
              <p className="text-sm text-slate-800 dark:text-slate-100 font-mono break-all">{result.dns_chain.join(' → ')}</p>
              {result.dns_canonical && result.dns_canonical !== result.host && (
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">Canonical: {result.dns_canonical}</p>
              )}
            </div>
          )}

          {result.redirect_dns_chain && result.redirect_dns_chain.length > 0 && (
            <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 dark:bg-violet-950/30 dark:border-violet-900">
              <p className="text-xs font-semibold text-violet-800 dark:text-violet-200 mb-1">
                Redirected host DNS resolution
              </p>
              <p className="text-sm text-violet-950 dark:text-violet-100 font-mono break-all">{result.redirect_dns_chain.join(' → ')}</p>
              {result.redirect_dns_canonical && (
                <p className="text-xs text-violet-700 dark:text-violet-200 mt-1">Canonical: {result.redirect_dns_canonical}</p>
              )}
            </div>
          )}

          {findingRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Findings</p>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <button
                    type="button"
                    title="Download numbered findings, points, and user-impact text as JSON"
                    onClick={() => downloadFindingsJson(result)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <FileDown className="w-3 h-3" />
                    Findings JSON
                  </button>
                  <button
                    type="button"
                    title="Download findings table as CSV"
                    onClick={() => downloadFindingsCsv(result)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <FileSpreadsheet className="w-3 h-3" />
                    Findings CSV
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Overall score <span className="font-semibold">{result.score}/100</span>
                {result.grade ? ` (${result.grade.letter})` : ''} is the average of the four category bars above.
                Each <span className="font-medium text-amber-800 dark:text-amber-300">warn</span> is −10 and each{' '}
                <span className="font-medium text-rose-800 dark:text-rose-300">bad</span> is −25 inside its category;{' '}
                <span className="font-medium">Other</span> rows are informational only.
              </p>
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700 dark:text-gray-200 w-8">#</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">Check</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">Severity</th>
                      <th className="px-2 py-2 text-right font-semibold text-gray-700 dark:text-gray-200">Points</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {findingRows.map((row) => {
                      const pillMap = row.kind === 'waf' ? wafBadgeClass : badgeClass;
                      const userImpact = endUserImpactForFinding(row);
                      const impactBorder =
                        row.severity === 'bad'
                          ? 'border-rose-400 dark:border-rose-600'
                          : 'border-amber-400 dark:border-amber-600';
                      return (
                        <tr key={row.index} className="bg-white dark:bg-gray-800/95">
                          <td className="px-2 py-2 align-top text-gray-500 dark:text-gray-400">{row.index}</td>
                          <td className="px-2 py-2 align-top">
                            <span
                              className={`inline-flex max-w-full px-2.5 py-0.5 rounded-full font-medium ${pillMap[row.severity]}`}
                              title={row.kind === 'waf' ? 'WAF-related signal' : undefined}
                            >
                              {row.label}
                            </span>
                            <p className="text-gray-600 dark:text-gray-400 mt-1 font-mono text-[11px] break-all">{row.detail}</p>
                            {userImpact && (
                              <p
                                className={`mt-1.5 text-[11px] leading-snug text-gray-700 dark:text-gray-300 border-l-2 pl-2 ${impactBorder}`}
                              >
                                <span className="font-semibold text-gray-800 dark:text-gray-200">For you: </span>
                                {userImpact}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-2 align-top text-gray-700 dark:text-gray-200">{row.severity}</td>
                          <td className="px-2 py-2 align-top text-right font-mono text-gray-800 dark:text-gray-200">
                            {row.scoreDelta === 0 ? '0' : row.scoreDelta}
                          </td>
                          <td className="px-2 py-2 align-top text-gray-700 dark:text-gray-300">{row.category}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.headerFindings && result.headerFindings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Security headers</p>
              <div className="grid gap-2 md:grid-cols-2">
                {result.headerFindings.map((hf) => (
                  <div
                    key={hf.header}
                    className={`rounded-lg border p-3 text-sm ${
                      hf.status === 'missing'
                        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
                    }`}
                  >
                    <p className="font-semibold">{hf.header}</p>
                    <p className="text-xs mt-1">{hf.status === 'missing' ? 'Missing' : hf.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.ok && onNavigate && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-indigo-600" />
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Compare with another host</p>
              </div>
              <div className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
                <input
                  type="text"
                  value={compareHost}
                  onChange={(e) => setCompareHost(e.target.value)}
                  placeholder="other.example.com"
                  className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  value={comparePort}
                  onChange={(e) => setComparePort(Number(e.target.value) || 443)}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm"
                  min={1}
                  max={65535}
                />
                <button
                  type="button"
                  disabled={compareLoading || !compareHost.trim()}
                  onClick={() => void runCompare()}
                  className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium disabled:bg-indigo-300"
                >
                  {compareLoading ? '…' : 'Compare'}
                </button>
              </div>
              {comparePair && (
                <div className="space-y-3">
                  <div className="overflow-x-auto text-xs border rounded-lg">
                    <table className="min-w-full">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-900/50">
                          <th className="px-2 py-1 text-left">Metric</th>
                          <th className="px-2 py-1 text-left">{comparePair.a.host}</th>
                          <th className="px-2 py-1 text-left">{comparePair.b.host}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y dark:divide-gray-700">
                        <tr>
                          <td className="px-2 py-1">Score</td>
                          <td className="px-2 py-1">
                            {comparePair.a.score}
                            {comparePair.a.grade ? ` (${comparePair.a.grade.letter})` : ''}
                          </td>
                          <td className="px-2 py-1">
                            {comparePair.b.score}
                            {comparePair.b.grade ? ` (${comparePair.b.grade.letter})` : ''}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-2 py-1">Findings (warn+bad)</td>
                          <td className="px-2 py-1">
                            {comparePair.a.findings.filter((f) => f.severity !== 'info').length}
                          </td>
                          <td className="px-2 py-1">
                            {comparePair.b.findings.filter((f) => f.severity !== 'info').length}
                          </td>
                        </tr>
                        <tr>
                          <td className="px-2 py-1">Days left</td>
                          <td className="px-2 py-1">{comparePair.a.certificate?.validDays ?? 'n/a'}</td>
                          <td className="px-2 py-1">{comparePair.b.certificate?.validDays ?? 'n/a'}</td>
                        </tr>
                        <tr>
                          <td className="px-2 py-1">Protocol</td>
                          <td className="px-2 py-1">{comparePair.a.certificate?.protocol || 'n/a'}</td>
                          <td className="px-2 py-1">{comparePair.b.certificate?.protocol || 'n/a'}</td>
                        </tr>
                        <tr>
                          <td className="px-2 py-1">Issuer CN</td>
                          <td className="px-2 py-1">{comparePair.a.certificate?.issuerCn || 'n/a'}</td>
                          <td className="px-2 py-1">{comparePair.b.certificate?.issuerCn || 'n/a'}</td>
                        </tr>
                        <tr>
                          <td className="px-2 py-1">Hostname match</td>
                          <td className="px-2 py-1">{comparePair.a.hostname_match?.ok ? 'yes' : 'no'}</td>
                          <td className="px-2 py-1">{comparePair.b.hostname_match?.ok ? 'yes' : 'no'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {comparePair.a.peer_certificate_pem && comparePair.b.peer_certificate_pem && (
                    <button
                      type="button"
                      onClick={() =>
                        openCertDiff(comparePair.a.peer_certificate_pem!, comparePair.b.peer_certificate_pem!)
                      }
                      className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:underline"
                    >
                      Open in Cert diff
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <ExternalLink className="w-4 h-4" />
            Checks are heuristic and depend on what this server negotiates.
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800/95 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-start gap-3">
          <Globe2 className="w-4 h-4 text-indigo-600 mt-0.5" />
          <div>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Bulk check</p>
            <p className="text-xs text-gray-600 dark:text-gray-300">One host per line, optionally with port (e.g., example.com:8443)</p>
          </div>
        </div>
        <textarea
          value={bulkInput}
          onChange={(e) => setBulkInput(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="example.com&#10;example.org:4443&#10;https://another.example.com"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleBulkCheck()}
            disabled={bulkLoading || !bulkInput.trim()}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white ${bulkLoading || !bulkInput.trim() ? 'bg-indigo-200' : 'bg-indigo-600 hover:bg-indigo-700'} transition`}
          >
            {bulkLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {bulkLoading ? `Checking… ${bulkProgress.done}/${bulkProgress.total}` : 'Run bulk check'}
          </button>
          {bulkLoading && (
            <button
              type="button"
              onClick={cancelBulk}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
            >
              Cancel
            </button>
          )}
        </div>
        {bulkResults.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              Filter
              <select
                value={bulkFilter}
                onChange={(e) => setBulkFilter(e.target.value as typeof bulkFilter)}
                className="rounded border border-gray-200 dark:border-gray-600 px-2 py-1"
              >
                <option value="all">All</option>
                <option value="failures">Failures / below baseline</option>
                <option value="low_score">Score &lt; {BASELINE_MIN_SCORE}</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              Sort
              <select
                value={bulkSort}
                onChange={(e) => setBulkSort(e.target.value as typeof bulkSort)}
                className="rounded border border-gray-200 dark:border-gray-600 px-2 py-1"
              >
                <option value="score_desc">Score high→low</option>
                <option value="score_asc">Score low→high</option>
                <option value="host">Host</option>
              </select>
            </label>
          </div>
        )}
        {bulkResults.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadBulkCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs font-medium"
            >
              <FileDown className="w-3.5 h-3.5" />
              Download CSV
            </button>
            <button
              type="button"
              onClick={downloadBulkJson}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs font-medium"
            >
              <FileDown className="w-3.5 h-3.5" />
              Download JSON
            </button>
          </div>
        )}
        {bulkResults.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 dark:bg-gray-900/45 text-gray-700 dark:text-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left">Host</th>
                  <th className="px-3 py-2 text-left">Port</th>
                  <th className="px-3 py-2 text-left">Score</th>
                  <th className="px-3 py-2 text-left">Expiry</th>
                  <th className="px-3 py-2 text-left">Days left</th>
                  <th className="px-3 py-2 text-left">Protocol</th>
                  <th className="px-3 py-2 text-left">Cipher</th>
                  <th className="px-3 py-2 text-left">WAF</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredBulkResults.map((r) => (
                  <tr key={`${r.host}:${r.port}`} className="bg-white dark:bg-gray-800/95">
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{r.host}</td>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{r.port}</td>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                      {r.score}/100{r.grade ? ` (${r.grade.letter})` : ''}
                    </td>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                      {r.certificate?.validTo ? new Date(r.certificate.validTo).toUTCString().split(' GMT')[0] : 'n/a'}
                    </td>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                      {typeof r.certificate?.validDays === 'number' ? r.certificate.validDays : 'n/a'}
                    </td>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{r.certificate?.protocol || 'n/a'}</td>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{r.certificate?.cipher || 'n/a'}</td>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-200">
                      {r.waf ? (
                        <span title={r.waf_reason || ''} className="cursor-help underline decoration-dotted">
                          {r.waf}
                        </span>
                      ) : r.waf_inconclusive ? (
                        <span title={r.waf_reason || ''} className="cursor-help text-amber-700 dark:text-amber-300">
                          inconclusive
                        </span>
                      ) : (
                        'Not detected'
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{r.ok ? 'OK' : 'Error'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SslUrlChecker;
