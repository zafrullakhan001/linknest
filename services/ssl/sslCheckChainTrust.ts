import {
  validateCertificateChain,
  type ChainValidationResult,
} from './cryptoUtils';
import type { CertInfo } from '../../components/ssl/sslTypes';

export type ServerChainTrust = {
  status: string;
  trusted: boolean | null;
  chain_complete: boolean | null;
  missing_intermediate: boolean;
  weak_signature: boolean;
  weak_key: boolean;
  leaf_is_ca?: boolean;
  messages: string[];
  remediation: string[];
};

export type EnrichedChainTrust = ServerChainTrust & {
  browser_valid?: boolean;
  browser_errors?: string[];
  browser_warnings?: string[];
  browser_chain_labels?: string[];
  openssl_skipped?: boolean;
};

const OPENSSL_SKIP_RE =
  /not recognized|skipped|unable to find openssl|openssl cli|no openssl binary|openssl verify skipped/i;

export function isOpensslCheckSkipped(messages: string[] | undefined): boolean {
  return (messages ?? []).some((m) => OPENSSL_SKIP_RE.test(m));
}

export function filterOpensslSkipMessages(messages: string[]): string[] {
  return messages.filter((m) => !OPENSSL_SKIP_RE.test(m));
}

/** Leaf PEM first, then any additional certs from the TLS handshake (deduped). */
export function buildServedChainPem(peerPem?: string | null, chainPems?: string[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const add = (pem: string) => {
    const t = pem.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    parts.push(t);
  };
  if (peerPem?.trim()) add(peerPem);
  (chainPems ?? []).forEach(add);
  return parts.join('\n');
}

function certLabel(c: CertInfo): string {
  const cn = c.subject['CN'];
  if (typeof cn === 'string' && cn.trim()) return cn;
  const o = c.subject['O'];
  if (typeof o === 'string' && o.trim()) return o;
  return 'Certificate';
}

/**
 * Run the same browser chain validation as Certificate Chain Validator on the served PEM bundle.
 * Merges results with the PHP/openssl chain_trust payload for display and scoring.
 */
export function enrichChainTrustWithBrowser(
  server: ServerChainTrust | undefined,
  peerPem: string | null | undefined,
  chainPems: string[] | undefined
): { chain_trust: EnrichedChainTrust | undefined; browser: ChainValidationResult | null } {
  const pem = buildServedChainPem(peerPem, chainPems);
  if (!pem) {
    return { chain_trust: server, browser: null };
  }

  const browser = validateCertificateChain(pem);
  const opensslSkipped = isOpensslCheckSkipped(server?.messages);

  const chain_trust: EnrichedChainTrust = {
    status: server?.status ?? (browser.valid ? 'browser_valid' : 'browser_invalid'),
    trusted: server?.trusted ?? null,
    chain_complete: server?.chain_complete ?? (browser.valid ? true : false),
    missing_intermediate:
      server?.missing_intermediate ?? browser.missingIntermediates.length > 0,
    weak_signature: server?.weak_signature ?? false,
    weak_key: server?.weak_key ?? false,
    leaf_is_ca: server?.leaf_is_ca,
    messages: [...(server?.messages ?? [])],
    remediation: [...(server?.remediation ?? [])],
    browser_valid: browser.valid,
    browser_errors: browser.errors,
    browser_warnings: browser.warnings,
    browser_chain_labels: browser.orderedCerts.map(certLabel),
    openssl_skipped: opensslSkipped,
  };

  if (opensslSkipped && browser.valid) {
    const filtered = filterOpensslSkipMessages(chain_trust.messages);
    chain_trust.messages = [
      ...filtered,
      'Chain structure validated in browser (same as Chain validator). System CA trust was not checked on the server.',
    ];
    if (chain_trust.trusted === null && !chain_trust.missing_intermediate) {
      chain_trust.status = 'presented_ok';
    }
  } else if (browser.valid && chain_trust.trusted === null) {
    const filtered = filterOpensslSkipMessages(chain_trust.messages);
    if (!filtered.some((m) => /browser|chain validator/i.test(m))) {
      chain_trust.messages = [
        ...filtered,
        'Presented chain links valid (browser check, same as Chain validator).',
      ];
    }
  }

  if (!browser.valid) {
    chain_trust.missing_intermediate =
      chain_trust.missing_intermediate || browser.missingIntermediates.length > 0;
  }

  return { chain_trust, browser };
}
