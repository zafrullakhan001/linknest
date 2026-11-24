/** Types for the LinkNest SSL URL checker / cert decoder (ported from SSL Forge). */

export type CertificatePurpose = 'server' | 'client' | 'code_signing' | 'email' | 'custom';

export interface KeyUsageOptions {
  digitalSignature: boolean;
  nonRepudiation: boolean;
  keyEncipherment: boolean;
  dataEncipherment: boolean;
  keyAgreement: boolean;
  keyCertSign: boolean;
  cRLSign: boolean;
  encipherOnly: boolean;
  decipherOnly: boolean;
}

export interface ExtendedKeyUsageOptions {
  serverAuth: boolean;
  clientAuth: boolean;
  codeSigning: boolean;
  emailProtection: boolean;
  timeStamping: boolean;
}

export interface BasicConstraintsOptions {
  ca: boolean;
  pathLenConstraint?: number;
}

export interface CSRDetails {
  commonName: string;
  organization: string;
  organizationalUnit: string;
  country: string;
  state: string;
  locality: string;
  email: string;
  san: string;
  keySize: number;
  purpose: CertificatePurpose;
  keyUsage?: KeyUsageOptions;
  extKeyUsage?: ExtendedKeyUsageOptions;
  basicConstraints?: BasicConstraintsOptions;
}

export interface GeneratedKeyPair {
  privateKey: string;
  publicKey: string;
  csr: string;
}

export interface CertInfo {
  id: string;
  subject: Record<string, string>;
  issuer: Record<string, string>;
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
  fingerprint: string;
  fingerprintSha256?: string;
  spkiSha256?: string;
  embeddedSctCount?: number;
  keyAlgorithm?: string;
  keyBitSize?: number;
  keyUsage?: string[];
  extKeyUsage?: string[];
  subjectAltNames?: string[];
  signatureAlgorithm?: string;
  basicConstraints?: { ca: boolean; pathLenConstraint?: number | null };
  extensionOids?: string[];
  certificatePolicyOids?: string[];
  isSelfSigned: boolean;
  rawPem?: string;
}

export interface CSRDecodedInfo {
  subject: Record<string, string>;
  publicKey: {
    algorithm: string;
    bitSize: number;
    fingerprint: string;
  };
  signature: {
    algorithm: string;
    valid: boolean;
  };
  extensions: {
    san?: string[];
    basicConstraints?: {
      cA?: boolean;
      pathLenConstraint?: number | string;
    };
    keyUsage?: string[];
    extKeyUsage?: string[];
  };
  validationMessages: {
    type: 'success' | 'warning' | 'error';
    message: string;
  }[];
}

export interface DecoderPopupRequest {
  prefillPem?: string;
  host?: string;
}

/** Stub enum so optional navigation props type-check without other SSL Forge tools. */
export enum ToolMode {
  CERT_DECODER = 'CERT_DECODER',
  CERT_CHAIN_VALIDATOR = 'CERT_CHAIN_VALIDATOR',
  CERT_DIFF = 'CERT_DIFF',
}
