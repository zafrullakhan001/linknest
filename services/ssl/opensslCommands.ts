import type { CSRDetails } from '../../components/ssl/sslTypes';

export type OpenSslCommandPair = { linux: string; windows: string };

function escForShell(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** CSR subject string for openssl -subj (RFC-ish; avoid special chars in input) */
export function opensslReqSubjFromDetails(d: CSRDetails): string {
  const cn = escForShell(d.commonName.trim());
  const o = escForShell(d.organization.trim());
  const ou = escForShell(d.organizationalUnit.trim());
  const c = escForShell(d.country.trim().toUpperCase());
  const st = escForShell(d.state.trim());
  const l = escForShell(d.locality.trim());
  const em = escForShell(d.email.trim());
  return `/CN=${cn}/O=${o}/OU=${ou}/C=${c}/ST=${st}/L=${l}/emailAddress=${em}`;
}

export function opensslGenCsrMatchingDetails(d: CSRDetails): OpenSslCommandPair {
  const subj = opensslReqSubjFromDetails(d);
  const bits = d.keySize || 2048;
  const cmd = `openssl req -new -newkey rsa:${bits} -nodes -keyout private-key.pem -out csr.pem -subj "${subj}"`;
  return { linux: cmd, windows: cmd };
}

export function opensslDecodeCertificate(): OpenSslCommandPair {
  const c = 'openssl x509 -in cert.pem -text -noout';
  return { linux: c, windows: c };
}

export function opensslDecodeCsr(): OpenSslCommandPair {
  const c = 'openssl req -in request.csr -text -noout -verify';
  return { linux: c, windows: c };
}

export function opensslVerifyChain(): OpenSslCommandPair {
  const c = 'openssl verify -CAfile chain.pem -untrusted intermediates.pem leaf.pem';
  return { linux: c, windows: c };
}

export function opensslPemToDer(): OpenSslCommandPair {
  const c = 'openssl x509 -in cert.pem -outform DER -out cert.der';
  return { linux: c, windows: c };
}

export function opensslDerToPem(): OpenSslCommandPair {
  const c = 'openssl x509 -inform DER -in cert.der -out cert.pem';
  return { linux: c, windows: c };
}

export function opensslPfxToPem(): OpenSslCommandPair {
  const c = 'openssl pkcs12 -in bundle.pfx -nodes -out bundle.pem';
  return { linux: c, windows: c };
}

export function opensslGenRsaPrivateKey(bits: number): OpenSslCommandPair {
  const c = `openssl genrsa -out private-key.pem ${bits}`;
  return { linux: c, windows: c };
}

export function opensslRsaPublicFromPrivate(): OpenSslCommandPair {
  const c = 'openssl rsa -in private-key.pem -pubout -out public.pem';
  return { linux: c, windows: c };
}

export function opensslOcspQuery(): OpenSslCommandPair {
  const c =
    'openssl ocsp -issuer issuer.pem -cert leaf.pem -url https://ocsp.example.com -text -noverify';
  return { linux: c, windows: c };
}

/** openssl req with -addext subjectAltName matching CSR form (OpenSSL 1.1.1+). */
export function opensslSelfSignedCommand(d: {
  commonName: string;
  organization: string;
  organizationalUnit: string;
  country: string;
  state: string;
  locality: string;
  email: string;
  san: string;
  keySize: number;
  validityDays: number;
}): OpenSslCommandPair {
  const csrLike: CSRDetails = {
    commonName: d.commonName,
    organization: d.organization,
    organizationalUnit: d.organizationalUnit,
    country: d.country,
    state: d.state,
    locality: d.locality,
    email: d.email,
    san: d.san,
    keySize: d.keySize,
    purpose: 'server',
  };
  const subj = opensslReqSubjFromDetails(csrLike);
  const sanParts = d.san
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const sanStr =
    sanParts.length > 0
      ? sanParts.map((s) => (/^(\d{1,3}\.){3}\d{1,3}$/.test(s) ? `IP:${s}` : `DNS:${s}`)).join(',')
      : `DNS:${d.commonName.trim() || 'localhost'}`;
  const linux = `openssl req -x509 -newkey rsa:${d.keySize} -nodes -keyout key.pem -out cert.pem -days ${d.validityDays} \\
  -subj "${subj}" \\
  -addext "subjectAltName=${sanStr}"`;
  const windows = `openssl req -x509 -newkey rsa:${d.keySize} -nodes -keyout key.pem -out cert.pem -days ${d.validityDays} ^\n  -subj "${subj}" ^\n  -addext "subjectAltName=${sanStr}"`;
  return { linux, windows };
}

export function opensslReqWithSan(d: CSRDetails): OpenSslCommandPair {
  const subj = opensslReqSubjFromDetails(d);
  const bits = d.keySize || 2048;
  const sanParts = d.san
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const sanStr =
    sanParts.length > 0
      ? sanParts
          .map((s) => (/^(\d{1,3}\.){3}\d{1,3}$/.test(s) ? `IP:${s}` : `DNS:${s}`))
          .join(',')
      : `DNS:${d.commonName.trim() || 'example.com'}`;
  const linux = `openssl req -newkey rsa:${bits} -nodes -keyout private.key -out request.csr \\
  -subj "${subj}" \\
  -addext "subjectAltName=${sanStr}"`;
  const windows = `openssl req -newkey rsa:${bits} -nodes -keyout private.key -out request.csr ^\n  -subj "${subj}" ^\n  -addext "subjectAltName=${sanStr}"`;
  return { linux, windows };
}
