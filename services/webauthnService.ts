import { resolveApiBase } from './apiHelpers';
import type { User } from './authService';

const API_BASE = resolveApiBase();

export interface PasskeyCredential {
  id: number;
  nickname: string;
  transports?: string[] | null;
  aaguid?: string | null;
  created_at: number;
  last_used_at?: number | null;
}

function bufferToBase64Url(buffer: ArrayBuffer | ArrayBufferView): string {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Recursively convert base64url strings in known WebAuthn binary fields to ArrayBuffer. */
function revivePublicKeyOptions<T extends Record<string, unknown>>(options: T): T {
  const clone = structuredClone(options) as Record<string, unknown>;

  const reviveBufferField = (obj: Record<string, unknown> | undefined, key: string) => {
    if (!obj || typeof obj[key] !== 'string') return;
    obj[key] = base64UrlToBuffer(obj[key] as string);
  };

  if (clone.challenge && typeof clone.challenge === 'string') {
    clone.challenge = base64UrlToBuffer(clone.challenge);
  }

  const user = clone.user as Record<string, unknown> | undefined;
  reviveBufferField(user, 'id');

  const exclude = clone.excludeCredentials as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(exclude)) {
    for (const cred of exclude) {
      reviveBufferField(cred, 'id');
    }
  }

  const allow = clone.allowCredentials as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(allow)) {
    for (const cred of allow) {
      reviveBufferField(cred, 'id');
    }
  }

  return clone as T;
}

export function isSecureContextForPasskeys(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export interface PasskeySupportStatus {
  supported: boolean;
  reason:
    | 'available'
    | 'server-rendering'
    | 'insecure-context'
    | 'public-key-credential-unavailable'
    | 'credentials-api-unavailable'
    | 'registration-api-unavailable'
    | 'authentication-api-unavailable';
  message: string;
}

/**
 * Return the first concrete reason passkeys cannot be used.
 * Secure context is checked first because browsers may hide WebAuthn APIs on HTTP.
 */
export function getPasskeySupportStatus(): PasskeySupportStatus {
  if (typeof window === 'undefined') {
    return {
      supported: false,
      reason: 'server-rendering',
      message: 'Passkey support can only be checked in a browser.',
    };
  }

  if (!isSecureContextForPasskeys()) {
    return {
      supported: false,
      reason: 'insecure-context',
      message: `Passkeys are unavailable because this page uses an insecure connection (${window.location.protocol}//${window.location.host}). Open LinkNest over HTTPS, or use localhost for local testing.`,
    };
  }

  if (typeof window.PublicKeyCredential === 'undefined') {
    return {
      supported: false,
      reason: 'public-key-credential-unavailable',
      message: 'The browser did not provide the WebAuthn API. Update the browser, open LinkNest in a full browser instead of an embedded webview, and check whether browser or device policy disables passkeys.',
    };
  }

  if (!navigator.credentials) {
    return {
      supported: false,
      reason: 'credentials-api-unavailable',
      message: 'The browser Credential Management API is unavailable. Update the browser or check whether browser or device policy disables credential access.',
    };
  }

  if (typeof navigator.credentials.create !== 'function') {
    return {
      supported: false,
      reason: 'registration-api-unavailable',
      message: 'This browser can’t create passkeys because the credential registration API is unavailable. Update the browser or try a full, non-embedded browser.',
    };
  }

  if (typeof navigator.credentials.get !== 'function') {
    return {
      supported: false,
      reason: 'authentication-api-unavailable',
      message: 'This browser can’t use passkeys because the credential authentication API is unavailable. Update the browser or try a full, non-embedded browser.',
    };
  }

  return {
    supported: true,
    reason: 'available',
    message: 'Passkeys are supported.',
  };
}

export function isWebAuthnSupported(): boolean {
  return getPasskeySupportStatus().supported;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data.error || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export const webauthnService = {
  async beginRegistration(): Promise<PublicKeyCredentialCreationOptions> {
    const response = await fetch(`${API_BASE}/webauthn/register/options`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to start passkey registration');
    }
    return revivePublicKeyOptions(data.publicKey as Record<string, unknown>) as unknown as PublicKeyCredentialCreationOptions;
  },

  async finishRegistration(
    credential: PublicKeyCredential,
    nickname?: string
  ): Promise<PasskeyCredential> {
    const attestation = credential.response as AuthenticatorAttestationResponse;
    const transports =
      typeof (attestation as AuthenticatorAttestationResponse & { getTransports?: () => string[] }).getTransports ===
      'function'
        ? (attestation as AuthenticatorAttestationResponse & { getTransports: () => string[] }).getTransports()
        : undefined;

    const response = await fetch(`${API_BASE}/webauthn/register/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientDataJSON: bufferToBase64Url(attestation.clientDataJSON),
        attestationObject: bufferToBase64Url(attestation.attestationObject),
        transports: transports || null,
        nickname: nickname || undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to register passkey');
    }
    return data.credential as PasskeyCredential;
  },

  async registerPasskey(nickname?: string): Promise<PasskeyCredential> {
    const support = getPasskeySupportStatus();
    if (!support.supported) {
      throw new Error(support.message);
    }
    const publicKey = await this.beginRegistration();
    const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
    if (!credential) {
      throw new Error('Passkey registration was cancelled');
    }
    return this.finishRegistration(credential, nickname);
  },

  async beginLogin(): Promise<PublicKeyCredentialRequestOptions> {
    const response = await fetch(`${API_BASE}/webauthn/login/options`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to start passkey sign-in');
    }
    return revivePublicKeyOptions(data.publicKey as Record<string, unknown>) as unknown as PublicKeyCredentialRequestOptions;
  },

  async finishLogin(credential: PublicKeyCredential, rememberMe = false): Promise<User> {
    const assertion = credential.response as AuthenticatorAssertionResponse;
    const response = await fetch(`${API_BASE}/webauthn/login/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: bufferToBase64Url(credential.rawId),
        rawId: bufferToBase64Url(credential.rawId),
        clientDataJSON: bufferToBase64Url(assertion.clientDataJSON),
        authenticatorData: bufferToBase64Url(assertion.authenticatorData),
        signature: bufferToBase64Url(assertion.signature),
        userHandle: assertion.userHandle ? bufferToBase64Url(assertion.userHandle) : null,
        remember_me: rememberMe,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Passkey sign-in failed');
    }
    return data.user as User;
  },

  async loginWithPasskey(rememberMe = false): Promise<User> {
    const support = getPasskeySupportStatus();
    if (!support.supported) {
      throw new Error(support.message);
    }
    const publicKey = await this.beginLogin();
    const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
    if (!credential) {
      throw new Error('Passkey sign-in was cancelled');
    }
    return this.finishLogin(credential, rememberMe);
  },

  async listCredentials(): Promise<PasskeyCredential[]> {
    const response = await fetch(`${API_BASE}/webauthn/credentials`, {
      method: 'GET',
      credentials: 'include',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || (await parseError(response)));
    }
    return (data.credentials || []) as PasskeyCredential[];
  },

  async renameCredential(id: number, nickname: string): Promise<void> {
    const response = await fetch(`${API_BASE}/webauthn/credentials/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || 'Failed to rename passkey');
    }
  },

  async deleteCredential(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/webauthn/credentials/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || 'Failed to remove passkey');
    }
  },
};
