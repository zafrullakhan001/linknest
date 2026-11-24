import forge from 'node-forge';
import { CSRDetails, GeneratedKeyPair, CertInfo, CSRDecodedInfo } from '../../components/ssl/sslTypes';

const DN_DISPLAY_ORDER = ['CN', 'OU', 'O', 'L', 'ST', 'C', 'emailAddress', 'E'] as const;

/** Human-readable DN from CertInfo subject/issuer map (typical field order first). */
export function formatDnFromRecord(rec: Record<string, string>): string {
    const used = new Set<string>();
    const parts: string[] = [];
    for (const k of DN_DISPLAY_ORDER) {
        if (rec[k]) {
            parts.push(`${k}=${rec[k]}`);
            used.add(k);
        }
    }
    for (const k of Object.keys(rec).sort()) {
        if (!used.has(k) && rec[k]) parts.push(`${k}=${rec[k]}`);
    }
    return parts.length ? parts.join(', ') : '(empty)';
}

type ForgeName = { attributes: Array<{ shortName?: string; name?: string; type?: string; value: string }> };

function forgeDnPairs(dn: ForgeName): [string, string][] {
    return dn.attributes
        .map((attr): [string, string] => [String(attr.shortName || attr.name || attr.type || ''), String(attr.value)])
        .sort((x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]));
}

export function distinguishedNamesEqualForge(dn1: ForgeName, dn2: ForgeName): boolean {
    const a = forgeDnPairs(dn1);
    const b = forgeDnPairs(dn2);
    if (a.length !== b.length) return false;
    return a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);
}

/** Compare subject/issuer maps from CertInfo (same keys/values). */
export function distinguishedNameRecordsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
        const va = (a[k] ?? '').trim();
        const vb = (b[k] ?? '').trim();
        if (va !== vb) return false;
    }
    return true;
}

/** PKCS#7 / P7B DER bytes → concatenated PEM certificates. */
export function extractFromP7BDer(derBinary: string): string | null {
    try {
        const p7 = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(derBinary)) as forge.pkcs7.PkcsEnvelopedData | forge.pkcs7.PkcsSignedData | { certificates?: forge.pki.Certificate[] };
        const certs = (p7 as { certificates?: forge.pki.Certificate[] }).certificates;
        if (!certs || certs.length === 0) return null;
        let out = '';
        certs.forEach((c) => {
            out += forge.pki.certificateToPem(c);
        });
        return out;
    } catch {
        return null;
    }
}

/** If input is PKCS#7 PEM, expand to PEM certs; otherwise return trimmed input. */
export function normalizeChainInput(raw: string): string {
    const t = raw.trim();
    if (!t) return t;
    if (/-----BEGIN\s+PKCS7-----/i.test(t)) {
        const extracted = extractFromP7B(t);
        if (extracted) return extracted;
    }
    return t;
}

function verifyChildSignedByParent(childPem: string, parentCert: forge.pki.Certificate): boolean {
    try {
        const caStore = forge.pki.createCaStore([parentCert]);
        const child = forge.pki.certificateFromPem(childPem);
        forge.pki.verifyCertificateChain(caStore, [child]);
        return true;
    } catch {
        return false;
    }
}

/**
 * Order certificates root → leaf (same traversal as legacy CertDecoder graph sort, with full DN matching).
 */
export function orderChainRootToLeaf(certs: CertInfo[]): CertInfo[] {
    if (certs.length <= 1) return [...certs];

    const parentMap = new Map<CertInfo, CertInfo>();

    certs.forEach((cert) => {
        if (!cert.isSelfSigned) {
            const parent = certs.find(
                (p) => p.id !== cert.id && distinguishedNameRecordsEqual(p.subject, cert.issuer)
            );
            if (parent) {
                parentMap.set(cert, parent);
            }
        }
    });

    const roots = certs.filter((c) => !parentMap.has(c));
    const ordered: CertInfo[] = [];
    const visited = new Set<string>();

    const visit = (c: CertInfo) => {
        if (visited.has(c.id)) return;
        visited.add(c.id);
        ordered.push(c);
        const children = certs.filter((child) => parentMap.get(child) === c);
        children.forEach(visit);
    };

    roots.sort((a, b) => (a.isSelfSigned === b.isSelfSigned ? 0 : a.isSelfSigned ? -1 : 1));
    roots.forEach(visit);

    certs.forEach((c) => {
        if (!visited.has(c.id)) ordered.push(c);
    });

    return ordered;
}

/**
 * Order certificates leaf → root (server fullchain order) using issuer/subject links in the bundle.
 */
export function orderChainLeafToRoot(certs: CertInfo[]): CertInfo[] {
    if (certs.length <= 1) return [...certs];

    const parentOf = (c: CertInfo): CertInfo | undefined =>
        certs.find((p) => p.id !== c.id && distinguishedNameRecordsEqual(p.subject, c.issuer));

    const isLeaf = (c: CertInfo) =>
        !certs.some(
            (child) => child.id !== c.id && distinguishedNameRecordsEqual(c.subject, child.issuer)
        );

    const leaves = certs.filter(isLeaf);
    if (leaves.length === 0) {
        return [...certs];
    }

    const ordered: CertInfo[] = [];
    const seen = new Set<string>();

    const walkFromLeaf = (start: CertInfo) => {
        const path: CertInfo[] = [];
        const local = new Set<string>();
        let cur: CertInfo | undefined = start;
        while (cur && !local.has(cur.id)) {
            local.add(cur.id);
            path.push(cur);
            if (cur.isSelfSigned && distinguishedNameRecordsEqual(cur.subject, cur.issuer)) {
                break;
            }
            const next = parentOf(cur);
            if (!next) break;
            cur = next;
        }
        for (const c of path) {
            if (!seen.has(c.id)) {
                seen.add(c.id);
                ordered.push(c);
            }
        }
    };

    leaves.forEach(walkFromLeaf);
    certs.forEach((c) => {
        if (!seen.has(c.id)) {
            seen.add(c.id);
            ordered.push(c);
        }
    });

    return ordered;
}

function normalizeHostnameForMatch(host: string): string {
    let h = host.trim().toLowerCase();
    if (!h) return h;
    try {
        const withProto = h.includes('://') ? h : `https://${h}`;
        const u = new URL(withProto);
        h = u.hostname || h;
    } catch {
        /* keep trimmed host */
    }
    if (h.startsWith('[') && h.endsWith(']')) {
        h = h.slice(1, -1);
    }
    return h;
}

function dnsLabelMatch(pattern: string, host: string): boolean {
    const p = pattern.toLowerCase();
    const h = host.toLowerCase();
    if (!p.startsWith('*.')) {
        return p === h;
    }
    const rest = p.slice(2);
    if (h === rest) return true;
    if (!h.endsWith('.' + rest)) return false;
    const left = h.slice(0, -(rest.length + 1));
    return left.length > 0 && !left.includes('.');
}

/**
 * Check hostname against certificate CN and SAN (DNS). Wildcards: *.example.com does not match a.b.example.com.
 */
export function hostnameMatchesCert(
    hostname: string,
    cert: CertInfo
): { ok: boolean; matched: string[]; reason?: string } {
    const h = normalizeHostnameForMatch(hostname);
    if (!h) {
        return { ok: false, matched: [], reason: 'Empty hostname' };
    }
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.includes(':');
    const matched: string[] = [];
    const cn = (cert.subject['CN'] || '').trim();
    if (cn) {
        if (isIp) {
            if (cn === h) matched.push(`CN=${cn}`);
        } else if (dnsLabelMatch(cn, h) || cn.toLowerCase() === h) {
            matched.push(`CN=${cn}`);
        }
    }
    const sans = cert.subjectAltNames || [];
    for (const raw of sans) {
        const s = String(raw).trim();
        if (!s) continue;
        if (isIp) {
            if (s === h) matched.push(`SAN=${s}`);
        } else {
            if (dnsLabelMatch(s, h) || s.toLowerCase() === h) matched.push(`SAN=${s}`);
        }
    }
    if (matched.length) {
        return { ok: true, matched };
    }
    if (isIp && sans.length === 0 && !cn) {
        return { ok: false, matched: [], reason: 'No IP SAN or CN matches this host' };
    }
    if (!isIp && sans.length === 0 && !cn) {
        return { ok: false, matched: [], reason: 'No CN or Subject Alternative Name to match' };
    }
    return { ok: false, matched: [], reason: 'Hostname does not match CN or DNS SANs' };
}

// Helper to convert forge object to PEM string
const toPem = (obj: any, type: 'PRIVATE_KEY' | 'PUBLIC_KEY' | 'CSR' | 'CERTIFICATE'): string => {
    if (type === 'PRIVATE_KEY') return forge.pki.privateKeyToPem(obj);
    if (type === 'PUBLIC_KEY') return forge.pki.publicKeyToPem(obj);
    if (type === 'CSR') return forge.pki.certificationRequestToPem(obj);
    if (type === 'CERTIFICATE') return forge.pki.certificateToPem(obj);
    return '';
};

export const generateCSR = async (details: CSRDetails): Promise<GeneratedKeyPair> => {
    return new Promise((resolve, reject) => {
        try {
            // 1. Generate Key Pair
            const bits = details.keySize || 2048;
            forge.pki.rsa.generateKeyPair({ bits: bits, workers: -1 }, (err, keypair) => {
                if (err) return reject(err);

                // 2. Create CSR
                const csr = forge.pki.createCertificationRequest();
                csr.publicKey = keypair.publicKey;

                csr.setSubject([
                    { name: 'commonName', value: details.commonName },
                    { name: 'countryName', value: details.country },
                    { name: 'stateOrProvinceName', value: details.state },
                    { name: 'localityName', value: details.locality },
                    { name: 'organizationName', value: details.organization },
                    { name: 'organizationalUnitName', value: details.organizationalUnit },
                    { name: 'emailAddress', value: details.email },
                ]);

                // Build Extensions list
                const extensions: any[] = [];

                // SAN Extension
                if (details.san && details.san.trim()) {
                    const sans = details.san.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    if (sans.length > 0) {
                        const altNames = sans.map(s => {
                            // Basic check for IPv4
                            const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(s);
                            if (isIp) {
                                return { type: 7, ip: s };
                            }
                            return { type: 2, value: s };
                        });
                        extensions.push({
                            name: 'subjectAltName',
                            altNames: altNames
                        });
                    }
                }

                // Key Usage & Ext Key Usage Extensions based on Purpose
                if (details.purpose === 'server') {
                    extensions.push({
                        name: 'keyUsage',
                        digitalSignature: true,
                        keyEncipherment: true,
                        nonRepudiation: true
                    });
                    extensions.push({
                        name: 'extKeyUsage',
                        serverAuth: true,
                        clientAuth: true
                    });
                } else if (details.purpose === 'client') {
                    extensions.push({
                        name: 'keyUsage',
                        digitalSignature: true,
                        keyAgreement: true
                    });
                    extensions.push({
                        name: 'extKeyUsage',
                        clientAuth: true
                    });
                } else if (details.purpose === 'code_signing') {
                    extensions.push({
                        name: 'keyUsage',
                        digitalSignature: true
                    });
                    extensions.push({
                        name: 'extKeyUsage',
                        codeSigning: true
                    });
                } else if (details.purpose === 'email') {
                    extensions.push({
                        name: 'keyUsage',
                        digitalSignature: true,
                        keyEncipherment: true,
                        nonRepudiation: true
                    });
                    extensions.push({
                        name: 'extKeyUsage',
                        emailProtection: true
                    });
                } else if (details.purpose === 'custom') {
                    // Basic Constraints
                    if (details.basicConstraints) {
                        extensions.push({
                            name: 'basicConstraints',
                            cA: details.basicConstraints.ca,
                            pathLenConstraint: details.basicConstraints.pathLenConstraint
                        });
                    }

                    // Key Usage
                    if (details.keyUsage) {
                        extensions.push({
                            name: 'keyUsage',
                            ...details.keyUsage
                        });
                    }

                    // Extended Key Usage
                    if (details.extKeyUsage) {
                        extensions.push({
                            name: 'extKeyUsage',
                            ...details.extKeyUsage
                        });
                    }
                }

                // Apply extensions if any
                if (extensions.length > 0) {
                    csr.setAttributes([{
                        name: 'extensionRequest',
                        extensions: extensions
                    }]);
                }

                // Sign the CSR with the private key
                csr.sign(keypair.privateKey);

                resolve({
                    privateKey: toPem(keypair.privateKey, 'PRIVATE_KEY'),
                    publicKey: toPem(keypair.publicKey, 'PUBLIC_KEY'),
                    csr: toPem(csr, 'CSR'),
                });
            });
        } catch (e) {
            reject(e);
        }
    });
};

export const generateSelfSignedCert = async (): Promise<{ cert: string; key: string }> => {
    return new Promise((resolve, reject) => {
        try {
            // Use 1024 bits for speed in examples, standard is 2048
            forge.pki.rsa.generateKeyPair({ bits: 2048, workers: -1 }, (err, keypair) => {
                if (err) return reject(err);

                const cert = forge.pki.createCertificate();
                cert.publicKey = keypair.publicKey;
                cert.serialNumber = '01';
                cert.validity.notBefore = new Date();
                cert.validity.notAfter = new Date();
                cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

                const attrs = [
                    { name: 'commonName', value: 'example-generated.local' },
                    { name: 'countryName', value: 'US' },
                    { shortName: 'ST', value: 'ExampleState' },
                    { name: 'organizationName', value: 'Example Corp' }
                ];

                cert.setSubject(attrs);
                cert.setIssuer(attrs);
                cert.sign(keypair.privateKey);

                resolve({
                    cert: forge.pki.certificateToPem(cert),
                    key: forge.pki.privateKeyToPem(keypair.privateKey)
                });
            });
        } catch (e) {
            reject(e);
        }
    });
};

export const generateCertificateChain = async (): Promise<{ certChain: string; key: string }> => {
    return new Promise((resolve, reject) => {
        try {
            // Generate Root CA key pair
            forge.pki.rsa.generateKeyPair({ bits: 2048, workers: -1 }, (err, rootKeypair) => {
                if (err) return reject(err);

                // Create Root CA certificate
                const rootCert = forge.pki.createCertificate();
                rootCert.publicKey = rootKeypair.publicKey;
                rootCert.serialNumber = '01';
                rootCert.validity.notBefore = new Date();
                rootCert.validity.notAfter = new Date();
                rootCert.validity.notAfter.setFullYear(rootCert.validity.notBefore.getFullYear() + 1);

                const rootAttrs = [
                    { name: 'commonName', value: 'Example Root CA' },
                    { name: 'countryName', value: 'US' },
                    { shortName: 'ST', value: 'ExampleState' },
                    { name: 'organizationName', value: 'Example CA Corp' }
                ];

                rootCert.setSubject(rootAttrs);
                rootCert.setIssuer(rootAttrs);

                // Add CA extensions
                rootCert.setExtensions([
                    {
                        name: 'basicConstraints',
                        cA: true
                    },
                    {
                        name: 'keyUsage',
                        keyCertSign: true,
                        digitalSignature: true,
                        keyEncipherment: true
                    }
                ]);

                rootCert.sign(rootKeypair.privateKey);

                // Generate Intermediate/Leaf key pair
                forge.pki.rsa.generateKeyPair({ bits: 2048, workers: -1 }, (err, leafKeypair) => {
                    if (err) return reject(err);

                    // Create Leaf certificate signed by Root CA
                    const leafCert = forge.pki.createCertificate();
                    leafCert.publicKey = leafKeypair.publicKey;
                    leafCert.serialNumber = '02';
                    leafCert.validity.notBefore = new Date();
                    leafCert.validity.notAfter = new Date();
                    leafCert.validity.notAfter.setFullYear(leafCert.validity.notBefore.getFullYear() + 1);

                    const leafAttrs = [
                        { name: 'commonName', value: 'example-generated.local' },
                        { name: 'countryName', value: 'US' },
                        { shortName: 'ST', value: 'ExampleState' },
                        { name: 'organizationName', value: 'Example Corp' }
                    ];

                    leafCert.setSubject(leafAttrs);
                    leafCert.setIssuer(rootAttrs); // Issued by Root CA

                    // Add extensions
                    leafCert.setExtensions([
                        {
                            name: 'keyUsage',
                            digitalSignature: true,
                            keyEncipherment: true
                        },
                        {
                            name: 'extKeyUsage',
                            serverAuth: true
                        }
                    ]);

                    leafCert.sign(rootKeypair.privateKey);

                    // Combine certificates into a chain (leaf first, then root)
                    const certChain = forge.pki.certificateToPem(leafCert) + '\n' + forge.pki.certificateToPem(rootCert);

                    resolve({
                        certChain: certChain,
                        key: forge.pki.privateKeyToPem(leafKeypair.privateKey)
                    });
                });
            });
        } catch (e) {
            reject(e);
        }
    });
};

export const parseCertificate = (pem: string): CertInfo | null => {
    try {
        const cert = forge.pki.certificateFromPem(pem);

        const getAttributes = (attrs: any[]) => {
            const res: Record<string, string> = {};
            attrs.forEach(attr => {
                if (attr.shortName) {
                    res[attr.shortName] = attr.value;
                } else if (attr.name) {
                    res[attr.name] = attr.value;
                }
            });
            return res;
        };

        const subject = getAttributes(cert.subject.attributes);
        const issuer = getAttributes(cert.issuer.attributes);

        // Calculate Fingerprint (SHA1)
        const md = forge.md.sha1.create();
        const certDerBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
        md.update(certDerBytes);
        const fingerprint = md.digest().toHex().toUpperCase().match(/.{1,2}/g)?.join(':') || '';

        const md256 = forge.md.sha256.create();
        md256.update(certDerBytes);
        const fingerprintSha256 = md256.digest().toHex().toUpperCase().match(/.{1,2}/g)?.join(':') || '';

        // SPKI SHA-256 (SubjectPublicKeyInfo DER) — crt.sh enables JSON for ?spkisha256=, not for cert fingerprint + json.
        const spkiAsn1 = forge.pki.publicKeyToAsn1(cert.publicKey);
        const spkiDerBytes = forge.asn1.toDer(spkiAsn1).getBytes();
        const mdSpki = forge.md.sha256.create();
        mdSpki.update(spkiDerBytes);
        const spkiSha256 = mdSpki.digest().toHex().toUpperCase().match(/.{1,2}/g)?.join(':') || '';

        const pk = cert.publicKey as { n?: { bitLength(): number }; curve?: string };
        let keyAlgorithm = 'Unknown';
        let keyBitSize = 0;
        if (pk.n) {
            keyAlgorithm = 'RSA';
            keyBitSize = pk.n.bitLength();
        } else if (pk.curve) {
            keyAlgorithm = 'EC';
            keyBitSize = (cert.publicKey as any).q ? ((cert.publicKey as any).q.bitLength?.() ?? 256) : 256;
        }

        let embeddedSctCount = 0;
        if (cert.extensions && Array.isArray(cert.extensions)) {
            for (const ext of cert.extensions) {
                const id = (ext as { id?: string; name?: string }).id || (ext as { name?: string }).name || '';
                if (
                    id === '1.3.6.1.4.1.11129.2.4.2' ||
                    id === 'timestampList' ||
                    (typeof id === 'string' && id.includes('11129.2.4.2'))
                ) {
                    embeddedSctCount += 1;
                }
            }
        }

        let keyUsage: string[] | undefined;
        let extKeyUsage: string[] | undefined;
        try {
            const ku = cert.getExtension('keyUsage') as { digitalSignature?: boolean; keyEncipherment?: boolean; keyCertSign?: boolean; cRLSign?: boolean; [k: string]: unknown } | null;
            if (ku) {
                const labels: string[] = [];
                const map: [string, boolean | undefined][] = [
                    ['digitalSignature', ku.digitalSignature],
                    ['keyEncipherment', ku.keyEncipherment],
                    ['keyCertSign', ku.keyCertSign],
                    ['cRLSign', ku.cRLSign],
                    ['keyAgreement', ku.keyAgreement as boolean | undefined],
                    ['dataEncipherment', ku.dataEncipherment as boolean | undefined],
                ];
                for (const [name, v] of map) {
                    if (v) labels.push(name);
                }
                if (labels.length) keyUsage = labels;
            }
        } catch {
            /* ignore */
        }
        try {
            const eku = cert.getExtension('extKeyUsage') as Record<string, boolean> | null;
            if (eku) {
                const labels: string[] = [];
                for (const [k, v] of Object.entries(eku)) {
                    if (v === true && k !== 'name' && k !== 'id') labels.push(k);
                }
                if (labels.length) extKeyUsage = labels;
            }
        } catch {
            /* ignore */
        }

        let subjectAltNames: string[] | undefined;
        try {
            const san = cert.getExtension('subjectAltName') as { altNames?: Array<{ value?: string; ip?: string }> } | null;
            if (san?.altNames?.length) {
                const names = san.altNames
                    .map((an) => (an.value ?? an.ip ?? '') as string)
                    .filter((s) => s.length > 0);
                if (names.length) subjectAltNames = names;
            }
        } catch {
            /* ignore */
        }

        let signatureAlgorithm: string | undefined;
        try {
            const oid = (cert as { signatureOid?: string }).signatureOid;
            if (oid) {
                signatureAlgorithm = forge.pki.oids[oid] || oid;
            }
        } catch {
            /* ignore */
        }

        let basicConstraints: CertInfo['basicConstraints'];
        try {
            const bc = cert.getExtension('basicConstraints') as { cA?: boolean; pathLenConstraint?: number } | null;
            if (bc) {
                basicConstraints = {
                    ca: !!bc.cA,
                    pathLenConstraint: bc.pathLenConstraint ?? null,
                };
            }
        } catch {
            /* ignore */
        }

        let extensionOids: string[] | undefined;
        if (cert.extensions && Array.isArray(cert.extensions)) {
            const oids = new Set<string>();
            for (const ext of cert.extensions) {
                const id = (ext as { id?: string }).id;
                if (id && typeof id === 'string') oids.add(id);
            }
            if (oids.size) extensionOids = [...oids].sort();
        }

        let certificatePolicyOids: string[] | undefined;
        const readPolicyOids = (cpExt: { policies?: Array<{ policyId?: string }> } | null | undefined) => {
            if (!cpExt?.policies?.length) return;
            const ids = cpExt.policies.map((p) => p.policyId).filter((x): x is string => typeof x === 'string' && x.length > 0);
            if (ids.length) certificatePolicyOids = [...new Set(ids)].sort();
        };
        try {
            readPolicyOids(cert.getExtension('certificatePolicies') as { policies?: Array<{ policyId?: string }> } | null);
        } catch {
            /* ignore */
        }
        if (!certificatePolicyOids?.length) {
            try {
                readPolicyOids(cert.getExtension({ name: 'certificatePolicies' } as { name: string }) as { policies?: Array<{ policyId?: string }> } | null);
            } catch {
                /* ignore */
            }
        }

        const isSelfSigned = distinguishedNamesEqualForge(cert.subject as ForgeName, cert.issuer as ForgeName);

        return {
            id: Math.random().toString(36).substr(2, 9),
            subject: subject,
            issuer: issuer,
            validFrom: cert.validity.notBefore,
            validTo: cert.validity.notAfter,
            serialNumber: cert.serialNumber,
            fingerprint: fingerprint,
            fingerprintSha256: fingerprintSha256 || undefined,
            spkiSha256: spkiSha256 || undefined,
            embeddedSctCount: embeddedSctCount > 0 ? embeddedSctCount : undefined,
            keyAlgorithm,
            keyBitSize: keyBitSize || undefined,
            keyUsage,
            extKeyUsage,
            subjectAltNames,
            signatureAlgorithm,
            basicConstraints,
            extensionOids,
            certificatePolicyOids,
            isSelfSigned: isSelfSigned,
            rawPem: pem
        };
    } catch (error) {
        console.error("Failed to parse certificate", error);
        return null;
    }
};

export const parseCertificateChain = (pem: string): CertInfo[] => {
    // Regex to capture multiple PEM blocks
    const regex = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
    const matches = pem.match(regex);

    if (!matches) return [];

    return matches.map(m => parseCertificate(m)).filter((c): c is CertInfo => c !== null);
};

export const parseCSR = (pem: string): CSRDecodedInfo | null => {
    try {
        const csr = forge.pki.certificationRequestFromPem(pem);

        // Verify Signature
        const verified = csr.verify();

        // Subject Attributes
        const getAttributes = (attrs: any[]) => {
            const res: Record<string, string> = {};
            attrs.forEach(attr => {
                if (attr.shortName) {
                    res[attr.shortName] = attr.value;
                } else if (attr.name) {
                    res[attr.name] = attr.value;
                }
            });
            return res;
        };

        const subject = getAttributes(csr.subject.attributes);

        // Public Key Info
        const key = csr.publicKey as any;
        const bitSize = key.n ? key.n.bitLength() : 0;
        const algorithm = key.n ? 'RSA' : 'Unknown';

        // Fingerprint (SPKI SHA-256)
        const pubKeyAsn1 = forge.pki.publicKeyToAsn1(csr.publicKey);
        const pubKeyDer = forge.asn1.toDer(pubKeyAsn1).getBytes();
        const fingerprint = forge.md.sha256.create().update(pubKeyDer).digest().toHex().toUpperCase().match(/.{1,2}/g)?.join(':') || '';

        // Signature Algorithm
        let sigAlg = csr.siginfo.algorithmOid;
        if (forge.pki.oids[sigAlg]) {
            sigAlg = forge.pki.oids[sigAlg];
        }

        // Extensions
        const extensions: CSRDecodedInfo['extensions'] = {};
        const extReq = csr.getAttribute({ name: 'extensionRequest' });
        if (extReq && (extReq as any).extensions) {
            (extReq as any).extensions.forEach((ext: any) => {
                if (ext.name === 'subjectAltName' && ext.altNames) {
                    extensions.san = ext.altNames.map((a: any) => a.value || a.ip);
                }
                if (ext.name === 'basicConstraints') {
                    extensions.basicConstraints = {
                        cA: ext.cA,
                        pathLenConstraint: ext.pathLenConstraint
                    };
                }
                if (ext.name === 'keyUsage') {
                    const usages = [];
                    if (ext.digitalSignature) usages.push('Digital Signature');
                    if (ext.nonRepudiation) usages.push('Non Repudiation');
                    if (ext.keyEncipherment) usages.push('Key Encipherment');
                    if (ext.dataEncipherment) usages.push('Data Encipherment');
                    if (ext.keyAgreement) usages.push('Key Agreement');
                    if (ext.keyCertSign) usages.push('Key Cert Sign');
                    if (ext.cRLSign) usages.push('CRL Sign');
                    if (ext.encipherOnly) usages.push('Encipher Only');
                    if (ext.decipherOnly) usages.push('Decipher Only');
                    extensions.keyUsage = usages;
                }
                if (ext.name === 'extKeyUsage') {
                    const usages = [];
                    if (ext.serverAuth) usages.push('Server Authentication');
                    if (ext.clientAuth) usages.push('Client Authentication');
                    if (ext.codeSigning) usages.push('Code Signing');
                    if (ext.emailProtection) usages.push('Email Protection');
                    if (ext.timeStamping) usages.push('Time Stamping');
                    extensions.extKeyUsage = usages;
                }
            });
        }

        // Validation Messages
        const validationMessages: CSRDecodedInfo['validationMessages'] = [];

        if (verified) {
            validationMessages.push({ type: 'success', message: 'CSR Signature Verification Passed.' });
        } else {
            validationMessages.push({ type: 'error', message: 'CSR Signature Verification FAILED. The file may be corrupted or tampered with.' });
        }

        if (bitSize >= 2048) {
            validationMessages.push({ type: 'success', message: `Key Size (${bitSize} bits) is compliant with current security standards.` });
        } else {
            validationMessages.push({ type: 'warning', message: `Key Size (${bitSize} bits) is weak. 2048 bits or higher is recommended.` });
        }

        if (algorithm === 'RSA') {
            validationMessages.push({ type: 'success', message: 'Public Key Algorithm is RSA.' });
        } else {
            validationMessages.push({ type: 'warning', message: `Public Key Algorithm is ${algorithm}.` });
        }

        if (!extensions.san || extensions.san.length === 0) {
            validationMessages.push({ type: 'warning', message: 'No Subject Alternative Names (SAN) found. Most modern browsers require SANs.' });
        }

        return {
            subject,
            publicKey: { algorithm, bitSize, fingerprint },
            signature: { algorithm: sigAlg, valid: verified },
            extensions,
            validationMessages
        };
    } catch (error) {
        console.error("Failed to parse CSR", error);
        return null;
    }
};

export const createPFX = (
    certPem: string,
    privateKeyPem: string,
    password: string
): string | null => {
    try {
        const cert = forge.pki.certificateFromPem(certPem);
        const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

        const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
            privateKey,
            [cert],
            password,
            { algorithm: '3des' } // standard compatibility
        );

        const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
        // Return as base64 for easy handling/downloading
        return forge.util.encode64(p12Der);
    } catch (error) {
        console.error("Failed to create PFX", error);
        return null;
    }
};

export const extractFromPFX = (pfxBase64: string, password: string): { cert: string; key: string } | null => {
    try {
        const pfxDer = forge.util.decode64(pfxBase64);
        const p12Asn1 = forge.asn1.fromDer(pfxDer);
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password || '');

        // Get bags by type
        const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
        const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
        // Also check standard key bag just in case
        const keyBags2 = p12.getBags({ bagType: forge.pki.oids.keyBag });

        let certPem = '';
        let keyPem = '';

        // Extract all certificates found
        if (certBags && certBags[forge.pki.oids.certBag]) {
            certBags[forge.pki.oids.certBag].forEach(bag => {
                if (bag.cert) {
                    certPem += forge.pki.certificateToPem(bag.cert);
                }
            });
        }

        // Try to find key
        let keyBag = null;
        if (keyBags && keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] && keyBags[forge.pki.oids.pkcs8ShroudedKeyBag].length > 0) {
            keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0];
        } else if (keyBags2 && keyBags2[forge.pki.oids.keyBag] && keyBags2[forge.pki.oids.keyBag].length > 0) {
            keyBag = keyBags2[forge.pki.oids.keyBag][0];
        }

        if (keyBag && keyBag.key) {
            keyPem = forge.pki.privateKeyToPem(keyBag.key);
        }

        return { cert: certPem, key: keyPem };
    } catch (error) {
        console.error("Failed to extract PFX", error);
        return null;
    }
};

export const createP7B = (certPem: string): Promise<string | null> => {
    return new Promise((resolve) => {
        try {
            const certInfos = parseCertificateChain(certPem);
            if (certInfos.length === 0) {
                resolve(null);
                return;
            }

            // Create signed data container
            const p7 = forge.pkcs7.createSignedData();

            // Add all certificates to the container
            certInfos.forEach(certInfo => {
                if (certInfo.rawPem) {
                    const cert = forge.pki.certificateFromPem(certInfo.rawPem);
                    p7.addCertificate(cert);
                }
            });

            // For P7B (certificate-only container), create a degenerate PKCS#7 structure
            // We need a minimal signer to satisfy the structure requirements
            p7.content = forge.util.createBuffer('');

            if (p7.certificates.length > 0) {
                const firstCert = p7.certificates[0];
                // Generate a minimal key pair for signing (structure only, not validated)
                forge.pki.rsa.generateKeyPair({ bits: 512, workers: -1 }, (err, keypair) => {
                    if (err) {
                        console.error("Failed to generate key for P7B", err);
                        resolve(null);
                        return;
                    }

                    try {
                        p7.addSigner({
                            certificate: firstCert,
                            key: keypair.privateKey,
                            digestAlgorithm: forge.pki.oids.sha256
                        });
                        p7.sign();
                        resolve(forge.pkcs7.messageToPem(p7));
                    } catch (e) {
                        console.error("Failed to create P7B", e);
                        resolve(null);
                    }
                });
            } else {
                resolve(null);
            }
        } catch (e) {
            console.error("Failed to create P7B", e);
            resolve(null);
        }
    });
};

export const extractFromP7B = (p7bPem: string): string | null => {
    try {
        const p7 = forge.pkcs7.messageFromPem(p7bPem) as { certificates?: forge.pki.Certificate[] };
        const certs = p7.certificates;
        if (!certs || certs.length === 0) return null;

        let out = '';
        certs.forEach(c => out += forge.pki.certificateToPem(c));
        return out;
    } catch (e) {
        console.error("Failed to extract P7B", e);
        return null;
    }
};

export const encryptPrivateKey = (keyPem: string, password: string): string | null => {
    try {
        const privateKey = forge.pki.privateKeyFromPem(keyPem);
        const encryptedPem = forge.pki.encryptRsaPrivateKey(privateKey, password, { algorithm: 'aes256' });
        return encryptedPem;
    } catch (e) {
        console.error("Failed to encrypt private key", e);
        return null;
    }
};

export const decryptPrivateKey = (keyPem: string, password: string): string | null => {
    try {
        const privateKey = forge.pki.decryptRsaPrivateKey(keyPem, password);
        if (!privateKey) return null;
        return forge.pki.privateKeyToPem(privateKey);
    } catch (e) {
        console.error("Failed to decrypt private key", e);
        return null;
    }
};

export const certPemToDer = (pem: string): string | null => {
    try {
        const cert = forge.pki.certificateFromPem(pem);
        const asn1 = forge.pki.certificateToAsn1(cert);
        const der = forge.asn1.toDer(asn1).getBytes();
        return forge.util.encode64(der);
    } catch (e) {
        console.error("PEM to DER failed", e);
        return null;
    }
}

export const certDerToPem = (derBase64: string): string | null => {
    try {
        const der = forge.util.decode64(derBase64);
        const asn1 = forge.asn1.fromDer(der);
        const cert = forge.pki.certificateFromAsn1(asn1);
        return forge.pki.certificateToPem(cert);
    } catch (e) {
        console.error("DER to PEM failed", e);
        return null;
    }
}

export const privateKeyDerToPem = (derBase64: string): string | null => {
    try {
        const der = forge.util.decode64(derBase64);
        const asn1 = forge.asn1.fromDer(der);
        const key = forge.pki.privateKeyFromAsn1(asn1);
        return forge.pki.privateKeyToPem(key);
    } catch (e) {
        console.error("Key DER to PEM failed", e);
        return null;
    }
}

export const normalizeToPem = (base64Content: string, type: 'CERT' | 'KEY'): string | null => {
    try {
        // 1. Try decoding as UTF-8 text to see if it's already PEM
        const decoded = window.atob(base64Content);
        if (decoded.includes('-----BEGIN')) {
            return decoded;
        }

        // 2. If not, try to parse as DER
        if (type === 'CERT') return certDerToPem(base64Content);
        if (type === 'KEY') return privateKeyDerToPem(base64Content);

        return null;
    } catch (e) {
        // If atob failed, it might be weird binary, but we expect base64 input here.
        return null;
    }
}

export const verifyKeyPair = (certPem: string, keyPem: string): boolean => {
    try {
        const cert = forge.pki.certificateFromPem(certPem);
        const key = forge.pki.privateKeyFromPem(keyPem);

        const certKey = cert.publicKey as any;
        const privateKey = key as any;

        // Check RSA Modulus
        if (certKey.n && privateKey.n) {
            return certKey.n.toString(16) === privateKey.n.toString(16);
        }

        return false;
    } catch (e) {
        console.error("KeyPair Verification Failed:", e);
        return false;
    }
}

// Generate RSA Private Key
export const generateRSAPrivateKey = async (keySize: 2048 | 4096): Promise<{ privateKey: string; publicKey: string }> => {
    return new Promise((resolve, reject) => {
        forge.pki.rsa.generateKeyPair({ bits: keySize, workers: -1 }, (err, keypair) => {
            if (err) return reject(err);
            resolve({
                privateKey: forge.pki.privateKeyToPem(keypair.privateKey),
                publicKey: forge.pki.publicKeyToPem(keypair.publicKey)
            });
        });
    });
}

// Generate ECC Private Key using Web Crypto API
export const generateECCPrivateKey = async (namedCurve: 'P-256' | 'P-384' | 'P-521'): Promise<{ privateKey: string; publicKey: string }> => {
    return new Promise(async (resolve, reject) => {
        try {
            // Map to Web Crypto API curve names
            const curveMap: Record<string, string> = {
                'P-256': 'P-256',
                'P-384': 'P-384',
                'P-521': 'P-521'
            };
            const curveName = curveMap[namedCurve];
            if (!curveName) {
                return reject(new Error(`Unsupported curve: ${namedCurve}`));
            }

            // Use Web Crypto API for ECC key generation
            if (!window.crypto || !window.crypto.subtle) {
                return reject(new Error('Web Crypto API is not available in this browser'));
            }

            // Generate key pair using Web Crypto API
            const keyPair = await window.crypto.subtle.generateKey(
                {
                    name: 'ECDSA',
                    namedCurve: curveName
                },
                true, // extractable
                ['sign', 'verify']
            );

            // Export private key in PKCS#8 format
            const privateKeyDer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
            const privateKeyPem = derToPem(privateKeyDer, 'PRIVATE KEY');

            // Export public key in SPKI format
            const publicKeyDer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
            const publicKeyPem = derToPem(publicKeyDer, 'PUBLIC KEY');

            resolve({
                privateKey: privateKeyPem,
                publicKey: publicKeyPem
            });
        } catch (e: any) {
            reject(new Error(`Failed to generate ECC key: ${e.message || 'Unknown error'}`));
        }
    });
}

// Helper function to convert DER (ArrayBuffer) to PEM
function derToPem(derBuffer: ArrayBuffer, type: 'PRIVATE KEY' | 'PUBLIC KEY'): string {
    const derBytes = new Uint8Array(derBuffer);
    // Convert to base64 in chunks to avoid call stack overflow
    let binary = '';
    for (let i = 0; i < derBytes.length; i++) {
        binary += String.fromCharCode(derBytes[i]);
    }
    const base64 = btoa(binary);
    const base64Lines = base64.match(/.{1,64}/g) || [];
    return `-----BEGIN ${type}-----\n${base64Lines.join('\n')}\n-----END ${type}-----\n`;
}

// Validate Private Key
export const validatePrivateKey = async (keyPem: string): Promise<{ valid: boolean; algorithm?: string; bitSize?: number; error?: string }> => {
    try {
        // First try to parse with node-forge (for RSA and some ECC keys)
        try {
            const key = forge.pki.privateKeyFromPem(keyPem);

            if ((key as any).n) {
                const rsaKey = key as any;
                return {
                    valid: true,
                    algorithm: 'RSA',
                    bitSize: rsaKey.n.bitLength()
                };
            } else if ((key as any).curve) {
                const ecKey = key as any;
                return {
                    valid: true,
                    algorithm: 'ECDSA',
                    bitSize: ecKey.curve.keySize
                };
            }
        } catch (forgeError) {
            // If forge can't parse it, try Web Crypto API for PKCS#8 format
            if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle && keyPem.includes('BEGIN PRIVATE KEY')) {
                try {
                    // Convert PEM to ArrayBuffer
                    const pemHeader = '-----BEGIN PRIVATE KEY-----';
                    const pemFooter = '-----END PRIVATE KEY-----';
                    const pemContents = keyPem
                        .replace(pemHeader, '')
                        .replace(pemFooter, '')
                        .replace(/\s/g, '');
                    const binaryDer = atob(pemContents);
                    const derBytes = new Uint8Array(binaryDer.length);
                    for (let i = 0; i < binaryDer.length; i++) {
                        derBytes[i] = binaryDer.charCodeAt(i);
                    }

                    // Detect curve from DER bytes
                    const curveName = detectECCCurve(derBytes.buffer);

                    // Try to import with detected curve to validate
                    const privateKey = await window.crypto.subtle.importKey(
                        'pkcs8',
                        derBytes.buffer,
                        {
                            name: 'ECDSA',
                            namedCurve: curveName
                        } as any,
                        false,
                        ['sign']
                    );

                    const curveSizeMap: Record<string, number> = {
                        'P-256': 256,
                        'P-384': 384,
                        'P-521': 521
                    };

                    return {
                        valid: true,
                        algorithm: 'ECDSA',
                        bitSize: curveSizeMap[curveName] || 256
                    };
                } catch (webCryptoError: any) {
                    // If curve detection failed, try each curve
                    const pemHeader = '-----BEGIN PRIVATE KEY-----';
                    const pemFooter = '-----END PRIVATE KEY-----';
                    const pemContents = keyPem
                        .replace(pemHeader, '')
                        .replace(pemFooter, '')
                        .replace(/\s/g, '');
                    const binaryDer = atob(pemContents);
                    const derBytes = new Uint8Array(binaryDer.length);
                    for (let i = 0; i < binaryDer.length; i++) {
                        derBytes[i] = binaryDer.charCodeAt(i);
                    }

                    const curves = ['P-256', 'P-384', 'P-521'];
                    for (const curve of curves) {
                        try {
                            await window.crypto.subtle.importKey(
                                'pkcs8',
                                derBytes.buffer,
                                {
                                    name: 'ECDSA',
                                    namedCurve: curve
                                } as any,
                                false,
                                ['sign']
                            );

                            const curveSizeMap: Record<string, number> = {
                                'P-256': 256,
                                'P-384': 384,
                                'P-521': 521
                            };

                            return {
                                valid: true,
                                algorithm: 'ECDSA',
                                bitSize: curveSizeMap[curve]
                            };
                        } catch (e) {
                            continue;
                        }
                    }
                    throw webCryptoError;
                }
            }
            throw forgeError;
        }

        return { valid: false, error: 'Unknown key type' };
    } catch (e: any) {
        return { valid: false, error: e.message || 'Invalid private key format' };
    }
}

// Helper to detect ECC curve from PKCS#8 format
function detectECCCurve(keyData: ArrayBuffer): string {
    // Parse the ASN.1 structure to find the curve OID
    // OIDs: P-256: 1.2.840.10045.3.1.7, P-384: 1.3.132.0.34, P-521: 1.3.132.0.35
    try {
        const bytes = new Uint8Array(keyData);
        const oid256 = [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]; // 1.2.840.10045.3.1.7
        const oid384 = [0x2b, 0x81, 0x04, 0x00, 0x22]; // 1.3.132.0.34
        const oid521 = [0x2b, 0x81, 0x04, 0x00, 0x23]; // 1.3.132.0.35

        for (let i = 0; i < bytes.length - oid521.length; i++) {
            // Check for P-521
            let match = true;
            for (let j = 0; j < oid521.length; j++) {
                if (bytes[i + j] !== oid521[j]) {
                    match = false;
                    break;
                }
            }
            if (match) return 'P-521';

            // Check for P-384
            match = true;
            for (let j = 0; j < oid384.length; j++) {
                if (bytes[i + j] !== oid384[j]) {
                    match = false;
                    break;
                }
            }
            if (match) return 'P-384';

            // Check for P-256
            match = true;
            for (let j = 0; j < oid256.length; j++) {
                if (bytes[i + j] !== oid256[j]) {
                    match = false;
                    break;
                }
            }
            if (match) return 'P-256';
        }
    } catch (e) {
        // Fallback
    }
    return 'P-256'; // Default
}

// Convert Private Key to DER
export const privateKeyToDer = (keyPem: string): string | null => {
    try {
        const key = forge.pki.privateKeyFromPem(keyPem);
        const derBytes = forge.asn1.toDer(forge.pki.privateKeyToAsn1(key)).getBytes();
        return forge.util.encode64(derBytes);
    } catch (e) {
        console.error("Failed to convert key to DER", e);
        return null;
    }
}

// Enhanced Self-Signed Certificate Generator
export interface SelfSignedCertDetails {
    commonName: string;
    organization?: string;
    organizationalUnit?: string;
    country?: string;
    state?: string;
    locality?: string;
    email?: string;
    san?: string;
    keySize?: 2048 | 4096;
    validityDays?: number;
    purpose?: 'server' | 'client' | 'localhost' | 'development';
}

export const generateSelfSignedCertEnhanced = async (details: SelfSignedCertDetails): Promise<{ cert: string; key: string }> => {
    return new Promise((resolve, reject) => {
        try {
            const keySize = details.keySize || 2048;
            forge.pki.rsa.generateKeyPair({ bits: keySize, workers: -1 }, (err, keypair) => {
                if (err) return reject(err);

                const cert = forge.pki.createCertificate();
                cert.publicKey = keypair.publicKey;
                cert.serialNumber = Date.now().toString();

                const now = new Date();
                cert.validity.notBefore = new Date(now);
                cert.validity.notAfter = new Date(now);
                cert.validity.notAfter.setDate(cert.validity.notAfter.getDate() + (details.validityDays || 365));

                const attrs: any[] = [
                    { name: 'commonName', value: details.commonName }
                ];

                if (details.country) attrs.push({ name: 'countryName', value: details.country });
                if (details.state) attrs.push({ shortName: 'ST', value: details.state });
                if (details.locality) attrs.push({ name: 'localityName', value: details.locality });
                if (details.organization) attrs.push({ name: 'organizationName', value: details.organization });
                if (details.organizationalUnit) attrs.push({ name: 'organizationalUnitName', value: details.organizationalUnit });
                if (details.email) attrs.push({ name: 'emailAddress', value: details.email });

                cert.setSubject(attrs);
                cert.setIssuer(attrs);

                // Add extensions based on purpose
                const extensions: any[] = [];

                if (details.purpose === 'server' || details.purpose === 'localhost' || details.purpose === 'development') {
                    extensions.push({
                        name: 'keyUsage',
                        digitalSignature: true,
                        keyEncipherment: true
                    });
                    extensions.push({
                        name: 'extKeyUsage',
                        serverAuth: true
                    });
                } else if (details.purpose === 'client') {
                    extensions.push({
                        name: 'keyUsage',
                        digitalSignature: true
                    });
                    extensions.push({
                        name: 'extKeyUsage',
                        clientAuth: true
                    });
                }

                // Add SAN if provided
                if (details.san && details.san.trim()) {
                    const sans = details.san.split(',').map(s => s.trim()).filter(s => s.length > 0);
                    if (sans.length > 0) {
                        const altNames = sans.map(s => {
                            const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(s);
                            if (isIp) {
                                return { type: 7, ip: s };
                            }
                            return { type: 2, value: s };
                        });
                        extensions.push({
                            name: 'subjectAltName',
                            altNames: altNames
                        });
                    }
                }

                if (extensions.length > 0) {
                    cert.setExtensions(extensions);
                }

                cert.sign(keypair.privateKey);

                resolve({
                    cert: forge.pki.certificateToPem(cert),
                    key: forge.pki.privateKeyToPem(keypair.privateKey)
                });
            });
        } catch (e) {
            reject(e);
        }
    });
}

// Certificate Chain Validator
export interface ChainLinkValidated {
    cert: CertInfo;
    isValid: boolean;
    error?: string;
}

export interface ChainValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    /** Leaf → root order */
    chain: ChainLinkValidated[];
    orderedCerts: CertInfo[];
    missingIntermediates: string[];
    suggestions: string[];
}

export const validateCertificateChain = (chainPem: string): ChainValidationResult => {
    const result: ChainValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
        chain: [],
        orderedCerts: [],
        missingIntermediates: [],
        suggestions: [],
    };

    try {
        const normalized = normalizeChainInput(chainPem);
        const certs = parseCertificateChain(normalized);
        if (certs.length === 0) {
            result.valid = false;
            result.errors.push('No valid certificates found in chain');
            return result;
        }

        const sorted = orderChainLeafToRoot(certs);
        result.orderedCerts = sorted;

        const subjectLabel = (c: CertInfo) => c.subject['CN'] || formatDnFromRecord(c.subject);

        const now = new Date();

        for (let i = 0; i < sorted.length; i++) {
            const cert = sorted[i];
            const label = subjectLabel(cert);

            let isValid = true;
            let error: string | undefined;

            if (cert.validTo < now) {
                isValid = false;
                error = 'Certificate has expired';
                result.errors.push(`${label}: Certificate expired on ${cert.validTo.toLocaleDateString()}`);
            } else if (cert.validFrom > now) {
                isValid = false;
                error = 'Certificate not yet valid';
                result.errors.push(`${label}: Certificate not valid until ${cert.validFrom.toLocaleDateString()}`);
            }

            if (i < sorted.length - 1) {
                const parent = sorted[i + 1];
                if (!distinguishedNameRecordsEqual(parent.subject, cert.issuer)) {
                    isValid = false;
                    const msg = `Issuer/subject mismatch: certificate is not signed by the next certificate in the bundle (expected issuer ${formatDnFromRecord(cert.issuer)}, parent subject ${formatDnFromRecord(parent.subject)})`;
                    error = error ? `${error}; ${msg}` : msg;
                    result.errors.push(`${label}: ${msg}`);
                    result.missingIntermediates.push(
                        `Missing or wrong parent for "${label}" — need a certificate whose Subject matches Issuer: ${formatDnFromRecord(cert.issuer)}`
                    );
                } else if (cert.rawPem && parent.rawPem) {
                    const parentForge = forge.pki.certificateFromPem(parent.rawPem);
                    if (!verifyChildSignedByParent(cert.rawPem, parentForge)) {
                        isValid = false;
                        const msg = 'Cryptographic signature verification failed (certificate not signed by parent public key)';
                        error = error ? `${error}; ${msg}` : msg;
                        result.errors.push(`${label}: ${msg}`);
                    }
                }
            } else if (!cert.isSelfSigned) {
                result.warnings.push('Chain does not end with a self-signed root certificate in this bundle');
                result.suggestions.push('Add the root CA certificate to complete the chain, or rely on a system trust store when installing on a server');
            }

            result.chain.push({ cert, isValid, error });

            if (!isValid) {
                result.valid = false;
            }
        }

        if (sorted.length === 1 && !sorted[0].isSelfSigned) {
            result.warnings.push('Only one non-self-signed certificate provided. Intermediate certificates may be missing');
            result.suggestions.push('Include intermediate certificates in the PEM bundle (leaf first, then intermediates, then root)');
        }

        const leaves = sorted.filter(
            (c) => !sorted.some((child) => child.id !== c.id && distinguishedNameRecordsEqual(c.subject, child.issuer))
        );
        if (leaves.length > 1) {
            result.warnings.push(
                `Multiple leaf-like certificates detected (${leaves.length}). Ordering and validation assume one end-entity chain.`
            );
        }
    } catch (e: unknown) {
        result.valid = false;
        result.errors.push(`Validation failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    return result;
};