import { resolveApiBase } from './apiHelpers';

const API_BASE = resolveApiBase();

export type McpTokenScope = 'read' | 'write' | 'admin';

export interface McpToken {
  id: number;
  userId: number;
  username?: string | null;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  lastUsedAt: number | null;
  expiresAt: number | null;
  createdAt: number;
  revokedAt: number | null;
  /** Present only on create. */
  token?: string;
}

export interface CreateMcpTokenRequest {
  name: string;
  scopes: McpTokenScope[];
  userId?: number;
  expiresInDays?: number | null;
}

async function parseJson(response: Response): Promise<any> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export const mcpService = {
  async listTokens(includeRevoked = false): Promise<McpToken[]> {
    const qs = includeRevoked ? '?include_revoked=1' : '';
    const response = await fetch(`${API_BASE}/mcp-tokens${qs}`, {
      method: 'GET',
      credentials: 'include',
    });
    const data = await parseJson(response);
    return Array.isArray(data.data) ? data.data : [];
  },

  async createToken(payload: CreateMcpTokenRequest): Promise<McpToken> {
    const response = await fetch(`${API_BASE}/mcp-tokens`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await parseJson(response);
    return data.data as McpToken;
  },

  async revokeToken(id: number): Promise<McpToken> {
    const response = await fetch(`${API_BASE}/mcp-tokens/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await parseJson(response);
    return data.data as McpToken;
  },
};
