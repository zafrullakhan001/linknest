import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  Calendar,
  ExternalLink,
  Globe2,
  Loader2,
  RefreshCw,
  Server,
  ShieldAlert,
  X,
} from 'lucide-react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import {
  godaddyWhoisUrl,
  lookupWhois,
  type WhoisLookupResult,
  type WhoisParty,
} from '../../services/whoisService';

export interface WhoisDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Full URL or hostname from the link editor. */
  url: string;
}

function hostFromUrl(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withScheme).hostname || '';
  } catch {
    return trimmed.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
  }
}

/** Best registrable-looking domain for GoDaddy deep link (last 2 labels). */
function displayDomainHint(host: string): string {
  const labels = host.split('.').filter(Boolean);
  if (labels.length >= 2) return labels.slice(-2).join('.');
  return host;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PartyBlock({ title, party }: { title: string; party?: WhoisParty | null }) {
  if (
    !party ||
    (!party.name &&
      !party.organization &&
      !party.email &&
      !party.phone &&
      !party.handle &&
      !party.state &&
      !party.country &&
      !party.city &&
      !party.street)
  ) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">{title}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">Redacted or not published</p>
      </div>
    );
  }
  const location = [party.street, party.city, party.state, party.country].filter(Boolean).join(', ');
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 p-3 space-y-1">
      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{title}</p>
      {party.organization && (
        <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">{party.organization}</p>
      )}
      {party.name && party.name !== party.organization && (
        <p className="text-sm text-gray-800 dark:text-gray-200">{party.name}</p>
      )}
      {location && <p className="text-xs text-gray-600 dark:text-gray-300">{location}</p>}
      {party.email && (
        <p className="text-xs text-indigo-600 dark:text-indigo-300 break-all">{party.email}</p>
      )}
      {party.phone && <p className="text-xs text-gray-600 dark:text-gray-300">{party.phone}</p>}
      {party.url && (
        <a
          href={party.url.startsWith('http') ? party.url : `https://${party.url}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-600 hover:underline break-all"
        >
          {party.url}
        </a>
      )}
      {party.handle && (
        <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400">IANA/Handle: {party.handle}</p>
      )}
    </div>
  );
}

/**
 * On-demand WHOIS dialog.
 * Uses classic WHOIS (port 43) for rich registrar data — the same fields GoDaddy shows —
 * and links to GoDaddy’s public WHOIS page (their site blocks server-side scraping).
 */
export const WhoisDialog: React.FC<WhoisDialogProps> = ({ isOpen, onClose, url }) => {
  const host = useMemo(() => hostFromUrl(url), [url]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WhoisLookupResult | null>(null);
  const [godaddyFallback, setGodaddyFallback] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ranForRef = useRef<string | null>(null);

  useEscapeToClose(isOpen, onClose);

  const godaddyHref = useMemo(() => {
    if (result?.godaddy_url) return result.godaddy_url;
    if (godaddyFallback) return godaddyFallback;
    if (!host || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
    const domain = result?.ownership?.domain || displayDomainHint(host);
    return godaddyWhoisUrl(domain);
  }, [result, godaddyFallback, host]);

  const runLookup = async (force = false) => {
    if (!host) {
      setError('Enter a valid URL or hostname first.');
      return;
    }
    if (!force && ranForRef.current === host && result?.ok) {
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const data = await lookupWhois({ host, signal: controller.signal });
      if (controller.signal.aborted) return;
      setResult(data);
      setGodaddyFallback(data.godaddy_url || null);
      ranForRef.current = host;
    } catch (e: unknown) {
      if (controller.signal.aborted) return;
      setResult(null);
      const err = e as Error & { godaddy_url?: string | null };
      setError(err.message || 'WHOIS lookup failed');
      if (err.godaddy_url) setGodaddyFallback(err.godaddy_url);
      else if (host) setGodaddyFallback(godaddyWhoisUrl(displayDomainHint(host)));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
      return;
    }
    void runLookup(false);
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when dialog opens / host changes
  }, [isOpen, host]);

  if (!isOpen) return null;

  const o = result?.ownership;
  const rawText = result?.raw_text || o?.raw_text || null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100075] flex items-center justify-center p-2 sm:p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close WHOIS dialog"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px] border-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whois-dialog-title"
        className="relative z-10 w-full max-w-3xl max-h-[94vh] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="min-w-0">
            <h2
              id="whois-dialog-title"
              className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"
            >
              <Building2 className="w-5 h-5 text-emerald-600" />
              Domain ownership (WHOIS)
            </h2>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-0.5 truncate">
              {host || '—'} ·{' '}
              {result?.source === 'whois'
                ? 'Classic WHOIS (GoDaddy-style record)'
                : result?.source === 'rdap'
                  ? 'RDAP'
                  : 'On-demand lookup'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {godaddyHref && (
              <a
                href={godaddyHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 px-3 py-1.5 text-xs font-medium text-orange-800 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900/50"
                title="Open the full public GoDaddy WHOIS page for this domain"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open on GoDaddy
              </a>
            )}
            <button
              type="button"
              onClick={() => void runLookup(true)}
              disabled={loading || !host}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {godaddyHref && (
            <div className="rounded-lg border border-orange-200 dark:border-orange-900/60 bg-orange-50/80 dark:bg-orange-950/25 px-3 py-2 text-xs text-orange-900 dark:text-orange-100">
              Full public WHOIS page:{' '}
              <a
                href={godaddyHref}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline break-all"
              >
                {godaddyHref}
              </a>
              <span className="block mt-1 text-orange-800/80 dark:text-orange-200/80">
                GoDaddy blocks server-side scraping, so LinkNest loads the same WHOIS record via port 43 and links you to their page for the full browser view.
              </span>
            </div>
          )}

          {loading && !result && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 py-8 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
              Looking up ownership…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 p-3 text-sm flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Lookup failed</p>
                <p className="mt-0.5">{error}</p>
                {godaddyHref && (
                  <a
                    href={godaddyHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-xs font-medium underline"
                  >
                    Try GoDaddy WHOIS instead <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          {o && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
                    <Globe2 className="w-3.5 h-3.5" />
                    {result?.lookup_kind === 'ip' ? 'Network' : 'Registered domain'}
                  </p>
                  <p className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                    {o.domain || o.network_name || o.queried || host}
                  </p>
                  {o.registry_domain_id && (
                    <p className="text-[11px] font-mono text-gray-500 mt-1">ID: {o.registry_domain_id}</p>
                  )}
                  {(o.country || o.state) && (
                    <p className="text-xs text-gray-500 mt-1">
                      {[o.state, o.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {o.dnssec && <p className="text-xs text-gray-500 mt-1">DNSSEC: {o.dnssec}</p>}
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Dates
                  </p>
                  <p className="text-xs text-gray-700 dark:text-gray-200">
                    Registered: <span className="font-medium">{formatDate(o.registered)}</span>
                  </p>
                  <p className="text-xs text-gray-700 dark:text-gray-200">
                    Updated: <span className="font-medium">{formatDate(o.updated)}</span>
                  </p>
                  <p className="text-xs text-gray-700 dark:text-gray-200">
                    Expires: <span className="font-medium">{formatDate(o.expires)}</span>
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <PartyBlock title="Registrant (owner)" party={o.registrant} />
                <PartyBlock title="Registrar" party={o.registrar} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {o.admin && <PartyBlock title="Admin contact" party={o.admin} />}
                {o.tech && <PartyBlock title="Tech contact" party={o.tech} />}
              </div>

              {o.abuse && (o.abuse.email || o.abuse.name || o.abuse.organization || o.abuse.phone) && (
                <PartyBlock title="Abuse contact" party={o.abuse} />
              )}

              {!!o.statuses?.length && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {o.statuses.map((s) => (
                      <span
                        key={s}
                        className="inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-600"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!!o.nameservers?.length && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-1">
                    <Server className="w-3.5 h-3.5" />
                    Nameservers
                  </p>
                  <ul className="text-xs font-mono text-gray-800 dark:text-gray-200 space-y-1">
                    {o.nameservers.map((ns) => (
                      <li key={ns}>{ns}</li>
                    ))}
                  </ul>
                </div>
              )}

              {rawText && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                    Full WHOIS record
                  </p>
                  <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words rounded-lg border border-gray-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-950/60 p-3 max-h-72 overflow-auto text-gray-800 dark:text-gray-200">
                    {rawText}
                  </pre>
                </div>
              )}

              {!!result?.whois_servers?.length && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Queried: {result.whois_servers.join(' → ')}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default WhoisDialog;
