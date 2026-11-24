import React, { useMemo } from 'react';
import type { CheckResult } from './SslUrlChecker';
import { parseCertificateChain, formatDnFromRecord } from '../../services/ssl/cryptoUtils';
import { buildServedChainPem } from '../../services/ssl/sslCheckChainTrust';

type Props = {
  result: CheckResult;
};

function sectionTitle(title: string) {
  return (
    <h3 className="text-sm font-bold text-white bg-indigo-700 dark:bg-indigo-800 px-3 py-2 rounded-t-lg">{title}</h3>
  );
}

const SslLabsReportSections: React.FC<Props> = ({ result }) => {
  const chainCerts = useMemo(() => {
    const pem = buildServedChainPem(result.peer_certificate_pem, result.chain_pems);
    if (!pem) return [];
    try {
      return parseCertificateChain(pem);
    } catch {
      return [];
    }
  }, [result.peer_certificate_pem, result.chain_pems]);

  const protocolRows = result.deep_tls?.rows ?? [];
  const hasProtocolMatrix = protocolRows.length > 0;

  return (
    <div className="space-y-4 text-sm">
      {/* Authentication */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {sectionTitle('Authentication')}
        <div className="p-4 space-y-4 bg-white dark:bg-gray-800/95">
          {result.certificate && (
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Server key and certificate</p>
              <table className="w-full text-xs border border-gray-100 dark:border-gray-700">
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  <tr>
                    <td className="px-2 py-1.5 text-gray-500 w-36">Subject</td>
                    <td className="px-2 py-1.5 font-mono break-all">{result.certificate.subject}</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1.5 text-gray-500">Issuer</td>
                    <td className="px-2 py-1.5 font-mono break-all">{result.certificate.issuer}</td>
                  </tr>
                  {result.certificate.validFrom && (
                    <tr>
                      <td className="px-2 py-1.5 text-gray-500">Valid from</td>
                      <td className="px-2 py-1.5">{new Date(result.certificate.validFrom).toLocaleString()}</td>
                    </tr>
                  )}
                  {result.certificate.validTo && (
                    <tr>
                      <td className="px-2 py-1.5 text-gray-500">Valid until</td>
                      <td className="px-2 py-1.5">
                        {new Date(result.certificate.validTo).toLocaleString()}
                        {result.certificate.validDays !== undefined && (
                          <span className="text-gray-500 ml-2">({result.certificate.validDays} days left)</span>
                        )}
                      </td>
                    </tr>
                  )}
                  {result.cert_meta?.key_type && (
                    <tr>
                      <td className="px-2 py-1.5 text-gray-500">Key</td>
                      <td className="px-2 py-1.5">
                        {result.cert_meta.key_type}
                        {result.cert_meta.key_bits ? ` ${result.cert_meta.key_bits} bits` : ''}
                      </td>
                    </tr>
                  )}
                  {result.cert_meta?.signature_algorithm && (
                    <tr>
                      <td className="px-2 py-1.5 text-gray-500">Signature</td>
                      <td className="px-2 py-1.5">{result.cert_meta.signature_algorithm}</td>
                    </tr>
                  )}
                  {result.certificate.protocol && (
                    <tr>
                      <td className="px-2 py-1.5 text-gray-500">Negotiated</td>
                      <td className="px-2 py-1.5">
                        {result.certificate.protocol}
                        {result.certificate.cipher ? ` / ${result.certificate.cipher}` : ''}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {result.certificate.san && result.certificate.san.length > 0 && (
                <p className="text-[11px] text-gray-500 mt-2">
                  SANs: {result.certificate.san.slice(0, 8).join(', ')}
                  {result.certificate.san.length > 8 ? ` (+${result.certificate.san.length - 8} more)` : ''}
                </p>
              )}
            </div>
          )}

          {chainCerts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                Additional certificates (chain)
              </p>
              <div className="space-y-2">
                {chainCerts.map((cert, i) => (
                  <div
                    key={cert.id}
                    className="rounded-md border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-2 text-xs"
                  >
                    <p className="font-semibold text-gray-800 dark:text-gray-100">
                      Certificate #{i + 1}
                      {i === 0 ? ' (leaf)' : cert.isSelfSigned ? ' (root)' : ' (intermediate)'}
                    </p>
                    <p className="font-mono mt-1 break-all">{formatDnFromRecord(cert.subject)}</p>
                    <p className="text-gray-500 mt-0.5">
                      Issued by: {formatDnFromRecord(cert.issuer)}
                    </p>
                    <p className="text-gray-500">
                      Expires: {cert.validTo.toLocaleDateString()}
                      {cert.isSelfSigned ? ' · Self-signed' : i === 0 ? ' · Sent by server' : ' · Sent by server'}
                    </p>
                  </div>
                ))}
              </div>
              {result.chain_trust?.browser_valid === true && (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-2">Path validation: chain links valid in browser</p>
              )}
              {result.chain_trust?.trusted === true && (
                <p className="text-xs text-emerald-700 dark:text-emerald-300">System CA trust: trusted</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Configuration */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {sectionTitle('Configuration')}
        <div className="p-4 bg-white dark:bg-gray-800/95 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Protocols</p>
            {hasProtocolMatrix ? (
              <table className="w-full text-xs border border-gray-100 dark:border-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Protocol</th>
                    <th className="px-2 py-1.5 text-left">Enabled</th>
                    <th className="px-2 py-1.5 text-left">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {protocolRows.map((row) => (
                    <tr key={row.version}>
                      <td className="px-2 py-1.5 font-mono">{row.version}</td>
                      <td className="px-2 py-1.5">
                        <span
                          className={
                            row.supported
                              ? row.severity === 'warn'
                                ? 'text-amber-700 dark:text-amber-400 font-medium'
                                : 'text-emerald-700 dark:text-emerald-400'
                              : 'text-gray-400'
                          }
                        >
                          {row.supported ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[11px] break-all">
                        {row.supported && row.cipher ? row.cipher : row.supported ? row.protocol || '—' : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-gray-500">
                {result.certificate?.protocol
                  ? `Negotiated: ${result.certificate.protocol}. Enable Deep TLS scan or install OpenSSL on the server for a full protocol matrix.`
                  : 'Protocol matrix unavailable (OpenSSL CLI required on server).'}
              </p>
            )}
            {result.deep_tls?.note && (
              <p className="text-[11px] text-gray-400 mt-1">{result.deep_tls.note}</p>
            )}
          </div>

          {result.certificate?.cipher && (
            <div>
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Negotiated cipher suite</p>
              <p className="font-mono text-xs break-all">{result.certificate.cipher}</p>
            </div>
          )}
        </div>
      </div>

      {/* Protocol details */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {sectionTitle('Protocol details')}
        <div className="p-4 bg-white dark:bg-gray-800/95">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              <tr>
                <td className="py-1.5 text-gray-500 w-44">OCSP stapling</td>
                <td className="py-1.5">
                  {result.ocsp_stapling?.stapled === true
                    ? 'Yes'
                    : result.ocsp_stapling?.stapled === false
                      ? 'No'
                      : 'Unknown'}
                  {result.ocsp_stapling?.detail ? ` — ${result.ocsp_stapling.detail}` : ''}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-gray-500">HSTS</td>
                <td className="py-1.5">
                  {result.hsts_preload?.hsts_header_present
                    ? `Yes${result.posture?.hsts_parsed?.max_age ? `, max-age=${result.posture.hsts_parsed.max_age}` : ''}`
                    : 'No'}
                  {result.hsts_preload?.preload_ready ? ' · Preload ready' : ''}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-gray-500">TLS session ticket</td>
                <td className="py-1.5 text-gray-400">Not probed</td>
              </tr>
              {result.dnssec && (
                <tr>
                  <td className="py-1.5 text-gray-500">DNSSEC</td>
                  <td className="py-1.5">{result.dnssec.note}</td>
                </tr>
              )}
              {result.dane && result.dane.records.length > 0 && (
                <tr>
                  <td className="py-1.5 text-gray-500">DANE TLSA</td>
                  <td className="py-1.5">
                    {result.dane.records.length} record(s)
                    {result.dane.spki_match === true ? ' · SPKI match' : result.dane.spki_match === false ? ' · mismatch' : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SslLabsReportSections;
