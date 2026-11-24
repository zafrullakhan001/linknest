import React, { useState, useEffect } from 'react';
import {
    parseCertificateChain,
    parseCSR,
    generateCertificateChain,
    orderChainRootToLeaf,
    distinguishedNameRecordsEqual,
} from '../../services/ssl/cryptoUtils';
import { SSL_FORGE_PREFILL_PEM_KEY } from './sessionKeys';
import { CertInfo, CSRDecodedInfo } from './sslTypes';
import { Search, ShieldCheck, AlertTriangle, Calendar, Globe, Building, FileKey, Info, List, ArrowDown, Layers, Link as LinkIcon, BadgeCheck, Box, Activity, CheckCircle, XCircle, AlertCircle, FileDown, Sparkles } from 'lucide-react';
import CommandSnippet from './CommandSnippet';
import CertTrustPanel from './CertTrustPanel';
import { opensslDecodeCertificate, opensslDecodeCsr, opensslVerifyChain } from '../../services/ssl/opensslCommands';
import { buildReportHtmlDocument, downloadHtmlReport, openPrintReport } from '../../services/ssl/reportExport';
import { runSslCheck } from '../../services/sslCheckService';

type DecodedData = { type: 'CERT_CHAIN', data: CertInfo[] } | { type: 'CSR', data: CSRDecodedInfo } | null;

export interface CertDecoderProps {
    initialPem?: string;
    initialHost?: string;
    embedded?: boolean;
    onRequestClose?: () => void;
}

export const CertDecoderContent: React.FC<CertDecoderProps> = ({
    initialPem = '',
    initialHost = '',
    embedded = false,
    onRequestClose,
}) => {
    const [pemInput, setPemInput] = useState('');
    const [publicHostInput, setPublicHostInput] = useState(initialHost);
    const [publicHostLoading, setPublicHostLoading] = useState(false);
    const [decoded, setDecoded] = useState<DecodedData>(null);
    const [error, setError] = useState<string | null>(null);
    const [demoLoading, setDemoLoading] = useState(false);

    useEffect(() => {
        if (!initialPem.trim()) return;
        setPemInput(initialPem);
    }, [initialPem]);

    useEffect(() => {
        if (!initialHost.trim()) return;
        setPublicHostInput(initialHost);
    }, [initialHost]);

    useEffect(() => {
        try {
            const prefill = sessionStorage.getItem(SSL_FORGE_PREFILL_PEM_KEY);
            if (prefill) {
                sessionStorage.removeItem(SSL_FORGE_PREFILL_PEM_KEY);
                setPemInput(prefill);
            }
        } catch {
            /* ignore */
        }
    }, []);

    const fetchPublicCertChain = async () => {
        const host = publicHostInput.trim();
        if (!host) {
            setError('Enter a hostname to fetch its public certificate chain.');
            return;
        }
        setPublicHostLoading(true);
        setError(null);
        try {
            const response = await runSslCheck({ host, port: 443 });
            const payload = await response.json();
            if (!response.ok || !payload?.ok) {
                setError(payload?.message || 'Unable to fetch public certificate chain for that host.');
                return;
            }
            const pems: string[] = Array.isArray(payload.chain_pems) ? payload.chain_pems.filter(Boolean) : [];
            const mergedPem = pems.length > 0 ? pems.join('\n\n') : (payload.peer_certificate_pem || '');
            if (!mergedPem.trim()) {
                setError('No public certificate chain was returned by that host.');
                return;
            }
            setPemInput(mergedPem);
        } catch {
            setError('Network error while fetching public certificate chain.');
        } finally {
            setPublicHostLoading(false);
        }
    };

    const handleDemoFill = async () => {
        setDemoLoading(true);
        try {
            const { certChain } = await generateCertificateChain();
            setPemInput(certChain);
        } catch (e) {
            console.error('Demo chain generation failed', e);
        } finally {
            setDemoLoading(false);
        }
    };

    useEffect(() => {
        const trimmed = pemInput.trim();
        if (!trimmed) {
            setDecoded(null);
            setError(null);
            return;
        }

        // Check for CSR first
        if (trimmed.includes('-----BEGIN CERTIFICATE REQUEST-----') || trimmed.includes('-----BEGIN NEW CERTIFICATE REQUEST-----')) {
            const info = parseCSR(trimmed);
            if (info) {
                setDecoded({ type: 'CSR', data: info });
                setError(null);
            } else {
                setDecoded(null);
                setError("Invalid CSR format. Ensure it matches standard PEM format.");
            }
            return;
        }

        // Check for Certificates (Single or Chain)
        if (trimmed.includes('-----BEGIN CERTIFICATE-----')) {
            const certs = parseCertificateChain(trimmed);
            if (certs.length > 0) {
                const sorted = orderChainRootToLeaf(certs);
                setDecoded({ type: 'CERT_CHAIN', data: sorted });
                setError(null);
            } else {
                setDecoded(null);
                setError("Invalid certificate format. No valid certificates found.");
            }
        } else {
            // Just reset if it doesn't look like either yet (user might be typing)
            if (trimmed.length > 50 && !trimmed.includes('-----')) {
                setError("Unknown format. Input must start with -----BEGIN CERTIFICATE----- or -----BEGIN CERTIFICATE REQUEST-----");
            } else {
                setDecoded(null);
                setError(null);
            }
        }
    }, [pemInput]);

    const findIssuerPem = (chain: CertInfo[], cert: CertInfo): string | null => {
        const issuer = chain.find((c) => c.id !== cert.id && distinguishedNameRecordsEqual(c.subject, cert.issuer));
        return issuer?.rawPem ?? null;
    };

    const CertCard: React.FC<{ cert: CertInfo; isRoot: boolean; isLeaf: boolean; issuerPem: string | null }> = ({
        cert,
        isRoot,
        isLeaf,
        issuerPem,
    }) => {
        const isValid = new Date() >= cert.validFrom && new Date() <= cert.validTo;

        return (
            <div className="bg-white dark:bg-gray-800/95 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-2">
                <div className="bg-gray-50 dark:bg-gray-900/45 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        {cert.isSelfSigned ? <ShieldCheck className="w-5 h-5 shrink-0 text-indigo-600" /> : <ShieldCheck className="w-5 h-5 shrink-0 text-gray-500 dark:text-gray-400" />}
                        <h3 className="min-w-0 font-semibold text-gray-800 dark:text-gray-200 text-sm truncate">
                            {cert.subject['CN'] || 'Unknown Subject'}
                        </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {isRoot && <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">Root CA</span>}
                        {!isRoot && !isLeaf && <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">Intermediate</span>}
                        {isLeaf && !isRoot && <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200">Leaf</span>}
                    </div>
                </div>
                <div className="p-4 grid grid-cols-1 gap-3">
                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                        <span className="text-gray-500 dark:text-gray-400">Organization</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100 sm:col-span-2 truncate">{cert.subject['O'] || 'N/A'}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                        <span className="text-gray-500 dark:text-gray-400">Issued By</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100 sm:col-span-2 truncate">{cert.issuer['CN']} ({cert.issuer['O']})</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                        <span className="text-gray-500 dark:text-gray-400">Validity</span>
                        <span className={`font-medium sm:col-span-2 ${isValid ? 'text-green-700' : 'text-red-700'}`}>
                            {cert.validFrom.toLocaleDateString()} – {cert.validTo.toLocaleDateString()}
                        </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                        <span className="text-gray-500 dark:text-gray-400">Fingerprint (SHA-1)</span>
                        <span className="font-mono text-gray-600 dark:text-gray-300 sm:col-span-2 break-all">{cert.fingerprint}</span>
                    </div>
                    {cert.fingerprintSha256 && (
                        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                            <span className="text-gray-500 dark:text-gray-400">Fingerprint (SHA-256)</span>
                            <span className="font-mono text-gray-600 dark:text-gray-300 sm:col-span-2 break-all">{cert.fingerprintSha256}</span>
                        </div>
                    )}
                    {(cert.keyAlgorithm || cert.keyBitSize) && (
                        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                            <span className="text-gray-500 dark:text-gray-400">Public key</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100 sm:col-span-2">
                                {cert.keyAlgorithm}
                                {cert.keyBitSize ? ` ${cert.keyBitSize} bit` : ''}
                            </span>
                        </div>
                    )}
                    {cert.keyUsage && cert.keyUsage.length > 0 && (
                        <div className="col-span-full flex flex-wrap gap-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-full">Key usage</span>
                            {cert.keyUsage.map((u) => (
                                <span key={u} className="px-2 py-0.5 bg-blue-50 text-blue-800 text-[10px] rounded border border-blue-100">
                                    {u}
                                </span>
                            ))}
                        </div>
                    )}
                    {cert.extKeyUsage && cert.extKeyUsage.length > 0 && (
                        <div className="col-span-full flex flex-wrap gap-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-full">Extended key usage</span>
                            {cert.extKeyUsage.map((u) => (
                                <span key={u} className="px-2 py-0.5 bg-purple-50 text-purple-800 text-[10px] rounded border border-purple-100">
                                    {u}
                                </span>
                            ))}
                        </div>
                    )}
                    <CertTrustPanel cert={cert} issuerPem={issuerPem} showRevocation={isLeaf} />
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:min-h-0 lg:h-[min(42rem,calc(100dvh-10rem))]">
                <div className="bg-white dark:bg-gray-800/95 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col lg:h-full lg:min-h-0">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-800 dark:text-gray-200">
                    <Search className="w-5 h-5 text-blue-600" />
                    Input Payload
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Paste a Certificate, a Certificate Chain, or a CSR.</p>
                <a
                    href="https://certlogik.com/decoder/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-3 transition-colors underline"
                >
                    <LinkIcon className="w-4 h-4" />
                    Try CertLogik Decoder
                </a>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                    <button
                        type="button"
                        onClick={handleDemoFill}
                        disabled={demoLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800/55 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                    >
                        <Sparkles className="w-4 h-4" />
                        {demoLoading ? 'Generating…' : 'Demo fill'}
                    </button>
                    {embedded && onRequestClose && (
                        <button
                            type="button"
                            onClick={onRequestClose}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800/55 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                        >
                            Close popup
                        </button>
                    )}
                </div>
                <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900/60 p-3">
                    <label className="block text-xs font-semibold text-blue-900 dark:text-blue-200 mb-2">Fetch Public Cert by Host</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input
                            type="text"
                            value={publicHostInput}
                            onChange={(e) => setPublicHostInput(e.target.value)}
                            className="flex-1 px-3 py-2 text-sm border border-blue-200 dark:border-blue-700 rounded-md focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-900"
                            placeholder="example.com"
                        />
                        <button
                            type="button"
                            onClick={() => void fetchPublicCertChain()}
                            disabled={publicHostLoading}
                            className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                            {publicHostLoading ? 'Fetching…' : 'Fetch'}
                        </button>
                    </div>
                    <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
                        Use this for public endpoints. For private/internal certs or CSRs, paste PEM directly below.
                    </p>
                </div>
                <textarea
                    value={pemInput}
                    onChange={(e) => setPemInput(e.target.value)}
                    className="w-full min-h-[240px] grow-0 p-4 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none lg:min-h-0 lg:flex-1"
                    placeholder={`-----BEGIN CERTIFICATE-----\n(Root CA)...\n-----END CERTIFICATE-----\n\n-----BEGIN CERTIFICATE-----\n(Intermediate)...\n-----END CERTIFICATE-----\n...`}
                />
                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </div>

            <div className="max-lg:min-h-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-2">
                {decoded ? (
                    <div className="space-y-6">

                        {/* Header Badge */}
                        <div className="flex items-center gap-2 mb-4">
                            {decoded.type === 'CERT_CHAIN' ? (
                                <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 border border-indigo-100">
                                    <Layers className="w-4 h-4" />
                                    {decoded.data.length > 1 ? `Certificate Chain (${decoded.data.length} certs)` : 'Single Certificate'}
                                </div>
                            ) : (
                                <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 border border-blue-100">
                                    <FileKey className="w-4 h-4" /> Certificate Signing Request
                                </div>
                            )}
                        </div>

                        {decoded.type === 'CERT_CHAIN' && (
                            <div className="flex flex-wrap gap-2 mb-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const sections = decoded.data.map((c, i) => ({
                                            title: `Certificate ${i + 1}: ${c.subject['CN'] || 'unknown'}`,
                                            rows: [
                                                { label: 'Subject CN', value: c.subject['CN'] || '' },
                                                { label: 'Subject O', value: c.subject['O'] || '' },
                                                { label: 'Issuer CN', value: c.issuer['CN'] || '' },
                                                { label: 'Issuer O', value: c.issuer['O'] || '' },
                                                { label: 'Valid from (UTC)', value: c.validFrom.toISOString() },
                                                { label: 'Valid to (UTC)', value: c.validTo.toISOString() },
                                                { label: 'Serial', value: c.serialNumber },
                                                { label: 'SHA-1 fingerprint', value: c.fingerprint },
                                                { label: 'SHA-256 fingerprint', value: c.fingerprintSha256 || '' },
                                                {
                                                    label: 'Public key',
                                                    value: `${c.keyAlgorithm || ''} ${c.keyBitSize || ''}`.trim(),
                                                },
                                                { label: 'Key usage', value: (c.keyUsage || []).join(', ') },
                                                { label: 'Extended key usage', value: (c.extKeyUsage || []).join(', ') },
                                                {
                                                    label: 'Embedded SCT extensions',
                                                    value: c.embeddedSctCount ? String(c.embeddedSctCount) : '0',
                                                },
                                            ],
                                        }));
                                        const html = buildReportHtmlDocument(
                                            'SSL Forge — certificate decode report',
                                            sections,
                                            `Generated ${new Date().toISOString()} — public metadata only.`
                                        );
                                        downloadHtmlReport('ssl-forge-decode-report.html', html);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-gray-800/95 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                >
                                    <FileDown className="w-3.5 h-3.5" />
                                    Download HTML report
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const sections = decoded.data.map((c, i) => ({
                                            title: `Certificate ${i + 1}: ${c.subject['CN'] || 'unknown'}`,
                                            rows: [
                                                { label: 'Subject CN', value: c.subject['CN'] || '' },
                                                { label: 'Issuer CN', value: c.issuer['CN'] || '' },
                                                { label: 'Valid to (UTC)', value: c.validTo.toISOString() },
                                                { label: 'SHA-256 fingerprint', value: c.fingerprintSha256 || '' },
                                            ],
                                        }));
                                        const html = buildReportHtmlDocument(
                                            'SSL Forge — certificate decode report',
                                            sections,
                                            new Date().toISOString()
                                        );
                                        openPrintReport(html);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                                >
                                    Print / Save as PDF
                                </button>
                            </div>
                        )}

                        {decoded.type === 'CERT_CHAIN' && (
                            <div className="relative pl-4 border-l-2 border-indigo-100 space-y-0">
                                {decoded.data.map((cert, idx) => {
                                    const isRoot = idx === 0; // Based on our sort, first is root/top
                                    const isLeaf = idx === decoded.data.length - 1;

                                    // Visual logic might differ if sort failed or we have disjoint sets,
                                    // but for a standard chain, index 0 is root.
                                    // More robust check:
                                    const realIsRoot = cert.isSelfSigned || !decoded.data.some(c => c.subject['CN'] === cert.issuer['CN'] && c.id !== cert.id);
                                    // Leaf is one that no one else issuers
                                    const realIsLeaf = !decoded.data.some(c => c.issuer['CN'] === cert.subject['CN'] && c.id !== cert.id);

                                    const issuerPem = findIssuerPem(decoded.data, cert);

                                    return (
                                        <div key={cert.id} className="relative pb-6 last:pb-0">
                                            {/* Connector Dot */}
                                            <div className="absolute -left-[21px] top-6 w-3 h-3 rounded-full bg-indigo-200 border-2 border-white ring-1 ring-indigo-500"></div>

                                            <CertCard cert={cert} isRoot={realIsRoot} isLeaf={realIsLeaf} issuerPem={issuerPem} />

                                            {idx < decoded.data.length - 1 && (
                                                <div className="flex justify-center py-2 text-indigo-300">
                                                    <ArrowDown className="w-5 h-5" />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* CSR Decoder View */}
                        {decoded.type === 'CSR' && (
                            <div className="space-y-6">

                                {/* Validation Summary Card */}
                                <div className={`rounded-xl shadow-sm border overflow-hidden ${decoded.data.signature.valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                    <div className="px-6 py-4 flex items-center gap-3">
                                        {decoded.data.signature.valid
                                            ? <CheckCircle className="w-6 h-6 text-green-600" />
                                            : <XCircle className="w-6 h-6 text-red-600" />
                                        }
                                        <div>
                                            <h3 className={`font-semibold ${decoded.data.signature.valid ? 'text-green-800' : 'text-red-800'}`}>
                                                {decoded.data.signature.valid ? 'CSR Validation Passed' : 'CSR Verification Failed'}
                                            </h3>
                                            <p className={`text-xs ${decoded.data.signature.valid ? 'text-green-700' : 'text-red-700'}`}>
                                                {decoded.data.signature.valid
                                                    ? 'The signature matches the public key provided in the request.'
                                                    : 'The signature does not match the public key. This CSR is invalid.'
                                                }
                                            </p>
                                        </div>
                                    </div>
                                    {/* Detailed Validation Messages */}
                                    <div className="px-6 pb-4 space-y-1.5">
                                        {decoded.data.validationMessages.map((msg, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-xs">
                                                {msg.type === 'success' && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                                                {msg.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />}
                                                {msg.type === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                                                <span className={`${msg.type === 'success' ? 'text-green-700' : msg.type === 'warning' ? 'text-yellow-700' : 'text-red-700'}`}>
                                                    {msg.message}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* General Info */}
                                <div className="bg-white dark:bg-gray-800/95 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="bg-gray-50 dark:bg-gray-900/45 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                        <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                            <Globe className="w-4 h-4" /> Subject Details
                                        </h3>
                                    </div>
                                    <div className="p-6 grid grid-cols-1 gap-4">
                                        <div className="grid grid-cols-1 gap-2 border-b border-gray-100 dark:border-gray-700/90 pb-2 sm:grid-cols-3 sm:gap-4">
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Common Name</span>
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 sm:col-span-2">{decoded.data.subject['CN'] || 'N/A'}</span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 border-b border-gray-100 dark:border-gray-700/90 pb-2 sm:grid-cols-3 sm:gap-4">
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Organization</span>
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 sm:col-span-2">{decoded.data.subject['O'] || 'N/A'}</span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 border-b border-gray-100 dark:border-gray-700/90 pb-2 sm:grid-cols-3 sm:gap-4">
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Org Unit (OU)</span>
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 sm:col-span-2">{decoded.data.subject['OU'] || 'N/A'}</span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 border-b border-gray-100 dark:border-gray-700/90 pb-2 sm:grid-cols-3 sm:gap-4">
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Location</span>
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 sm:col-span-2">
                                                {[decoded.data.subject['L'], decoded.data.subject['ST'], decoded.data.subject['C']].filter(Boolean).join(', ')}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Public Key & Signature Info */}
                                <div className="bg-white dark:bg-gray-800/95 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="bg-gray-50 dark:bg-gray-900/45 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                        <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                            <Activity className="w-4 h-4" /> Cryptographic Details
                                        </h3>
                                    </div>
                                    <div className="p-6 grid grid-cols-1 gap-4">
                                        <div className="grid grid-cols-1 gap-2 border-b border-gray-100 dark:border-gray-700/90 pb-2 sm:grid-cols-3 sm:gap-4">
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Key Size</span>
                                            <span className={`text-sm font-medium sm:col-span-2 ${decoded.data.publicKey.bitSize >= 2048 ? 'text-green-700' : 'text-red-600'}`}>
                                                {decoded.data.publicKey.bitSize} bits ({decoded.data.publicKey.algorithm})
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 border-b border-gray-100 dark:border-gray-700/90 pb-2 sm:grid-cols-3 sm:gap-4">
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Signature Algorithm</span>
                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono text-xs sm:col-span-2">{decoded.data.signature.algorithm}</span>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 pb-2 sm:grid-cols-3 sm:gap-4">
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Public Key SHA-256</span>
                                            <span className="text-xs font-mono text-gray-600 dark:text-gray-300 break-all bg-gray-50 dark:bg-gray-900/45 p-2 rounded sm:col-span-2">
                                                {decoded.data.publicKey.fingerprint}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Extensions Section */}
                                {(decoded.data.extensions.san || decoded.data.extensions.basicConstraints || decoded.data.extensions.keyUsage || decoded.data.extensions.extKeyUsage) && (
                                    <div className="bg-white dark:bg-gray-800/95 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                                        <div className="bg-gray-50 dark:bg-gray-900/45 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                            <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                                <Box className="w-4 h-4 text-indigo-600" /> Requested Extensions
                                            </h3>
                                        </div>
                                        <div className="p-6">
                                            <div className="space-y-4">
                                                {/* SANs */}
                                                {decoded.data.extensions.san && (
                                                    <div>
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium block mb-1.5">Subject Alternative Names</span>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {decoded.data.extensions.san.map((s, i) => (
                                                                <span key={i} className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800/55 text-xs font-medium text-gray-700 dark:text-gray-200 rounded-md border border-gray-200 dark:border-gray-700">
                                                                    {s}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Basic Constraints */}
                                                {decoded.data.extensions.basicConstraints && (
                                                    <div>
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium block mb-1.5">Basic Constraints</span>
                                                        <div className="flex gap-2">
                                                            <span className={`px-2.5 py-1 text-xs font-medium rounded-md border ${decoded.data.extensions.basicConstraints.cA ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-gray-50 dark:bg-gray-900/45 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
                                                                CA: {decoded.data.extensions.basicConstraints.cA ? 'TRUE' : 'FALSE'}
                                                            </span>
                                                            {decoded.data.extensions.basicConstraints.pathLenConstraint !== undefined && (
                                                                <span className="px-2.5 py-1 bg-gray-50 dark:bg-gray-900/45 text-xs font-medium text-gray-700 dark:text-gray-200 rounded-md border border-gray-200 dark:border-gray-700">
                                                                    Path Length: {decoded.data.extensions.basicConstraints.pathLenConstraint}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Key Usage */}
                                                {decoded.data.extensions.keyUsage && decoded.data.extensions.keyUsage.length > 0 && (
                                                    <div>
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium block mb-1.5">Key Usage</span>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {decoded.data.extensions.keyUsage.map((u, i) => (
                                                                <span key={i} className="px-2.5 py-1 bg-blue-50 text-xs font-medium text-blue-700 rounded-md border border-blue-200">
                                                                    {u}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Extended Key Usage */}
                                                {decoded.data.extensions.extKeyUsage && decoded.data.extensions.extKeyUsage.length > 0 && (
                                                    <div>
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium block mb-1.5">Extended Key Usage</span>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {decoded.data.extensions.extKeyUsage.map((u, i) => (
                                                                <span key={i} className="px-2.5 py-1 bg-purple-50 text-xs font-medium text-purple-700 rounded-md border border-purple-200">
                                                                    {u}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-400 dark:text-gray-500 p-12">
                        <div className="text-center">
                            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>Decoded details will appear here</p>
                            <p className="text-xs mt-2">Supports Certificate Chains (.pem, .cer) and CSRs</p>
                            <a
                                href="https://certlogik.com/decoder/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:text-blue-700 flex items-center justify-center gap-1 mt-4 transition-colors hover:underline"
                            >
                                Verification failing? Try CertLogik Decoder
                                <LinkIcon className="w-3 h-3" />
                            </a>
                        </div>
                    </div>
                )}
                </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-indigo-900">Command-line equivalent (OpenSSL)</h3>
                        <p className="text-xs text-indigo-800 mt-1">Quick commands to inspect CSRs or certificates locally.</p>
                    </div>
                </div>
                <div className="space-y-3">
                    {(() => {
                        const dec = opensslDecodeCertificate();
                        const csr = opensslDecodeCsr();
                        const ver = opensslVerifyChain();
                        return (
                            <>
                                <CommandSnippet
                                    title="Decode a certificate (PEM or DER)"
                                    description="Print readable details for any certificate file."
                                    linuxCommand={dec.linux}
                                    windowsCommand={dec.windows}
                                />
                                <CommandSnippet
                                    title="Inspect and verify a CSR"
                                    description="View CSR subject, SANs, and verify the signature."
                                    linuxCommand={csr.linux}
                                    windowsCommand={csr.windows}
                                />
                                <CommandSnippet
                                    title="Check a certificate chain"
                                    description="Verify a leaf certificate against an intermediate/root bundle."
                                    linuxCommand={ver.linux}
                                    windowsCommand={ver.windows}
                                />
                            </>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};

const CertDecoder: React.FC = () => {
    return <CertDecoderContent />;
};

export default CertDecoder;