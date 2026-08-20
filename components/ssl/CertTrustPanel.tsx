import React, { useState } from 'react';
import { Activity, ExternalLink, Loader2 } from 'lucide-react';
import type { CertInfo } from './sslTypes';
import { checkOcspCrl, lookupCertificateTransparency } from '../../services/sslCheckService';

type OcspCrlResponse = {
  ok: boolean;
  serial_hex?: string;
  ocsp_urls?: string[];
  crl_urls?: string[];
  ocsp?: {
    attempted: boolean;
    status: string;
    detail: string;
    url?: string | null;
    raw_excerpt?: string;
  };
  crl?: {
    attempted: boolean;
    status: string;
    detail: string;
    url?: string | null;
  };
};

type CtResponse = {
  ok: boolean;
  lookup_kind?: 'spki' | 'cert';
  count_returned?: number;
  entries?: { issuer_name?: string; name_value?: string; not_before?: string; not_after?: string }[];
  crt_sh_query_url?: string;
  message?: string;
  /** Present when crt.sh returned HTML or no JSON rows; use Open crt.sh for details */
  note?: string;
};

function hexFlat(colonHex: string | undefined): string | null {
  if (!colonHex) return null;
  const t = colonHex.replace(/:/g, '').toLowerCase();
  return t.length === 64 ? t : null;
}

function sha256Flat(cert: CertInfo): string | null {
  return hexFlat(cert.fingerprintSha256);
}

function spkiSha256Flat(cert: CertInfo): string | null {
  return hexFlat(cert.spkiSha256);
}

const CertTrustPanel: React.FC<{ cert: CertInfo; issuerPem: string | null; showRevocation: boolean }> = ({
  cert,
  issuerPem,
  showRevocation,
}) => {
  const [revLoading, setRevLoading] = useState(false);
  const [revError, setRevError] = useState<string | null>(null);
  const [revData, setRevData] = useState<OcspCrlResponse | null>(null);

  const [ctLoading, setCtLoading] = useState(false);
  const [ctError, setCtError] = useState<string | null>(null);
  const [ctData, setCtData] = useState<CtResponse | null>(null);

  const flat = sha256Flat(cert);
  const spkiFlat = spkiSha256Flat(cert);

  const runRevocation = async () => {
    if (!cert.rawPem) return;
    setRevLoading(true);
    setRevError(null);
    setRevData(null);
    try {
      const resp = await checkOcspCrl({
        cert_pem: cert.rawPem,
        issuer_pem: issuerPem || undefined,
      });
      const json = (await resp.json()) as OcspCrlResponse;
      if (!resp.ok || !json.ok) {
        throw new Error((json as { message?: string }).message || 'Request failed');
      }
      setRevData(json);
    } catch (e: unknown) {
      setRevError(e instanceof Error ? e.message : 'Revocation check failed');
    } finally {
      setRevLoading(false);
    }
  };

  const runCtLookup = async () => {
    if (!spkiFlat && !flat) return;
    setCtLoading(true);
    setCtError(null);
    setCtData(null);
    try {
      const resp = await lookupCertificateTransparency(
        spkiFlat ? { spkisha256: spkiFlat } : { sha256: flat! }
      );
      const json = (await resp.json()) as CtResponse;
      if (!resp.ok || !json.ok) {
        throw new Error(json.message || 'CT lookup failed');
      }
      setCtData(json);
    } catch (e: unknown) {
      setCtError(e instanceof Error ? e.message : 'CT lookup failed');
    } finally {
      setCtLoading(false);
    }
  };

  const sctNote =
    cert.embeddedSctCount && cert.embeddedSctCount > 0
      ? `${cert.embeddedSctCount} embedded SCT extension(s) present (Certificate Transparency).`
      : 'No embedded SCT list extension detected in this parse (cert may still appear in public CT logs).';

  return (
    <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-slate-50/80 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
        <Activity className="w-3.5 h-3.5" />
        Trust &amp; transparency
      </div>

      {cert.fingerprintSha256 && (
        <div className="text-[10px] font-mono text-gray-600 dark:text-gray-300 break-all">
          <span className="text-gray-500 dark:text-gray-400">SHA-256:</span> {cert.fingerprintSha256}
        </div>
      )}

      <p className="text-xs text-gray-600 dark:text-gray-300">{sctNote}</p>

      {(spkiFlat || flat) && (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={runCtLookup}
            disabled={ctLoading}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-white dark:bg-gray-800/95 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50 disabled:opacity-50"
          >
            {ctLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            CT log lookup (crt.sh)
          </button>
          <a
            href={
              spkiFlat
                ? `https://crt.sh/?spkisha256=${encodeURIComponent(spkiFlat)}`
                : `https://crt.sh/?sha256=${encodeURIComponent(flat!)}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
          >
            Open crt.sh <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {ctError && <p className="text-xs text-red-600">{ctError}</p>}

      {ctData?.note && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">{ctData.note}</p>
      )}

      {ctData?.entries && ctData.entries.length > 0 && (
        <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
          {ctData.entries.slice(0, 8).map((e, i) => (
            <div key={i} className="border-b border-gray-200 dark:border-gray-700 pb-1 last:border-0">
              <span className="text-gray-500 dark:text-gray-400">{e.name_value}</span>
              {e.issuer_name && <span className="text-gray-600 dark:text-gray-300"> · {e.issuer_name}</span>}
            </div>
          ))}
        </div>
      )}

      {ctData &&
        !ctData.note &&
        (ctData.count_returned === 0 || !ctData.entries?.length) && (
          <p className="text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded px-2 py-1.5">
            No Certificate Transparency log entries were found for this public key (SPKI). That is common for private,
            self-signed, or newly generated certificates that were never submitted to public CT logs. Use{' '}
            <span className="font-medium">Open crt.sh</span> to confirm the same result on the live site.
          </p>
        )}

      {showRevocation && cert.rawPem && (
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            OCSP/CRL uses URLs from the certificate only. Paste the issuing CA certificate below the chain when prompted
            (or include intermediates in the same PEM) so the server can find the issuer.
          </p>
          {!issuerPem && (
            <p className="text-xs text-amber-700">
              Issuer certificate not found in pasted chain—OCSP may require you to add the intermediate PEM.
            </p>
          )}
          <button
            type="button"
            onClick={runRevocation}
            disabled={revLoading}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {revLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Check OCSP / CRL
          </button>
          {revError && <p className="text-xs text-red-600">{revError}</p>}
          {revData && (
            <div className="text-xs space-y-1 text-gray-800 dark:text-gray-200">
              <p>
                <span className="font-medium">OCSP:</span> {revData.ocsp?.status} — {revData.ocsp?.detail}
              </p>
              <p>
                <span className="font-medium">CRL:</span> {revData.crl?.status} — {revData.crl?.detail}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CertTrustPanel;
