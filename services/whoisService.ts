import { resolveApiBase } from './apiHelpers';

function apiPath(suffix: string): string {
  const base = resolveApiBase().replace(/\/$/, '');
  return `${base}/${suffix.replace(/^\//, '')}`;
}

export type WhoisParty = {
  name?: string | null;
  organization?: string | null;
  email?: string | null;
  phone?: string | null;
  handle?: string | null;
  url?: string | null;
  state?: string | null;
  country?: string | null;
  city?: string | null;
  street?: string | null;
};

export type WhoisOwnership = {
  queried?: string;
  object_class?: string | null;
  domain?: string | null;
  network_name?: string | null;
  start_address?: string | null;
  end_address?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  street?: string | null;
  phone?: string | null;
  dnssec?: string | null;
  registry_domain_id?: string | null;
  registrar_iana_id?: string | null;
  registrar_url?: string | null;
  whois_server?: string | null;
  registrar?: WhoisParty | null;
  registrant?: WhoisParty | null;
  admin?: WhoisParty | null;
  tech?: WhoisParty | null;
  abuse?: WhoisParty | null;
  registered?: string | null;
  updated?: string | null;
  expires?: string | null;
  statuses?: string[];
  nameservers?: string[];
  fields?: Record<string, string | string[]>;
  raw_text?: string | null;
};

export type WhoisLookupResult = {
  ok: boolean;
  message?: string;
  host?: string;
  lookup_kind?: 'domain' | 'ip' | string;
  source?: string;
  source_url?: string | null;
  godaddy_url?: string | null;
  whois_servers?: string[];
  ownership?: WhoisOwnership;
  raw_text?: string | null;
  error?: string;
};

/** Public GoDaddy WHOIS results page for a domain (browser-only; server cannot scrape it). */
export function godaddyWhoisUrl(domain: string): string {
  const d = domain.trim().toLowerCase().replace(/\.$/, '');
  return `https://www.godaddy.com/whois/results.aspx?itc=dlp_domain_whois&domainName=${encodeURIComponent(d)}`;
}

export async function lookupWhois(params: {
  host?: string;
  url?: string;
  signal?: AbortSignal;
}): Promise<WhoisLookupResult> {
  const body: Record<string, string> = {};
  if (params.host?.trim()) body.host = params.host.trim();
  if (params.url?.trim()) body.url = params.url.trim();

  const resp = await fetch(apiPath('whois-lookup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    signal: params.signal,
    body: JSON.stringify(body),
  });

  let json: WhoisLookupResult;
  try {
    json = (await resp.json()) as WhoisLookupResult;
  } catch {
    throw new Error(`Invalid WHOIS response (HTTP ${resp.status})`);
  }

  if (!resp.ok || !json.ok) {
    // Still attach GoDaddy link when present on error payloads
    const err = new Error(json.message || `WHOIS lookup failed (HTTP ${resp.status})`) as Error & {
      godaddy_url?: string | null;
      payload?: WhoisLookupResult;
    };
    err.godaddy_url = json.godaddy_url;
    err.payload = json;
    throw err;
  }
  return json;
}
