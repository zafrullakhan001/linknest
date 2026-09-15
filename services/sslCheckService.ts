import { resolveApiBase } from './apiHelpers';

function apiPath(suffix: string): string {
  const base = resolveApiBase().replace(/\/$/, '');
  return `${base}/${suffix.replace(/^\//, '')}`;
}

export type SslCheckRequest = {
  host: string;
  port?: number;
  sni?: string;
  path?: string;
  dns_resolver?: string;
  custom_dns_server?: string;
  deep_scan?: boolean;
  signal?: AbortSignal;
};

/**
 * Run the server-side SSL URL probe (POST JSON preferred for Vite proxy safety).
 */
export async function runSslCheck(req: SslCheckRequest): Promise<Response> {
  const body: Record<string, string | number | boolean> = {
    host: req.host,
    port: req.port ?? 443,
  };
  if (req.sni?.trim()) body.sni = req.sni.trim();
  if (req.path?.trim()) {
    const p = req.path.trim();
    body.path = p.startsWith('/') ? p : `/${p}`;
  }
  if (req.dns_resolver) body.dns_resolver = req.dns_resolver;
  if (req.custom_dns_server?.trim()) body.custom_dns_server = req.custom_dns_server.trim();
  if (req.deep_scan) body.deep_scan = true;

  return fetch(apiPath('ssl-check'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    signal: req.signal,
    body: JSON.stringify(body),
  });
}

export async function lookupCertificateTransparency(params: {
  spkisha256?: string;
  sha256?: string;
  signal?: AbortSignal;
}): Promise<Response> {
  const url = new URL(apiPath('ct-lookup'), window.location.href);
  if (params.spkisha256) url.searchParams.set('spkisha256', params.spkisha256);
  if (params.sha256) url.searchParams.set('sha256', params.sha256);
  return fetch(url.toString(), {
    method: 'GET',
    credentials: 'include',
    signal: params.signal,
    headers: { Accept: 'application/json' },
  });
}

export async function checkOcspCrl(body: {
  cert_pem: string;
  issuer_pem?: string;
  signal?: AbortSignal;
}): Promise<Response> {
  return fetch(apiPath('ocsp-crl'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    signal: body.signal,
    body: JSON.stringify({
      cert_pem: body.cert_pem,
      issuer_pem: body.issuer_pem,
    }),
  });
}

/** Absolute URL helper for components that previously used ssl-forge apiAbsoluteUrl. */
export function sslApiAbsoluteUrl(suffix: string): string {
  return new URL(apiPath(suffix), window.location.href).href;
}
