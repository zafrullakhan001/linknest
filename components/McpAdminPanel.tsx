import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authService, AllUser } from '../services/authService';
import { mcpService, McpToken } from '../services/mcpService';
import { getAppBasePath } from '../services/apiHelpers';
import { MCP_EXAMPLE_NEED_LABEL, MCP_EXAMPLE_PROMPTS } from '../constants/mcpExamplePrompts';

type McpAdminTab = 'tokens' | 'examples';

const ADMIN_SECTION_CARD =
  'bg-white dark:bg-slate-800 border border-sky-200/70 dark:border-sky-800/40 rounded-xl overflow-hidden shadow-sm shadow-sky-500/5';
const ADMIN_SECTION_HEADER =
  'bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-800/40 px-6 py-5';
const ADMIN_SECTION_TITLE =
  'text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2';
const ADMIN_SECTION_SUBTITLE = 'text-sm text-sky-800/70 dark:text-sky-200/70 mt-0.5';
const ADMIN_FIELD =
  'w-full bg-slate-50 dark:bg-slate-900/50 border border-sky-200/70 dark:border-sky-800/40 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-400';
const ADMIN_PRIMARY_BTN =
  'bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-sky-500/20';

function mcpEndpointUrl(): string {
  if (typeof window === 'undefined') return '/api/mcp';
  const base = getAppBasePath();
  return `${window.location.origin}${base}/api/mcp`;
}

function formatWhen(unix: number | null | undefined): string {
  if (!unix) return '—';
  try {
    return new Date(unix * 1000).toLocaleString();
  } catch {
    return String(unix);
  }
}

function cursorHttpConfig(endpoint: string, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        linknest: {
          url: endpoint,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    },
    null,
    2
  );
}

function claudeStdioConfig(endpoint: string, token: string): string {
  const origin = endpoint.replace(/\/api\/mcp\/?$/, '');
  return JSON.stringify(
    {
      mcpServers: {
        linknest: {
          command: 'node',
          args: ['mcp/server.mjs'],
          env: {
            LINKNEST_URL: origin,
            LINKNEST_TOKEN: token,
          },
        },
      },
    },
    null,
    2
  );
}

export const McpAdminPanel: React.FC = () => {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [users, setUsers] = useState<AllUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('Cursor');
  const [allowWrite, setAllowWrite] = useState(true);
  const [allowAdmin, setAllowAdmin] = useState(false);
  const [userId, setUserId] = useState<number>(user?.id ? Number(user.id) : 0);
  const [expiresInDays, setExpiresInDays] = useState<number>(0);
  const [createdToken, setCreatedToken] = useState<McpToken | null>(null);
  const [copied, setCopied] = useState('');
  const [showRevoked, setShowRevoked] = useState(false);
  const [mcpTab, setMcpTab] = useState<McpAdminTab>('tokens');

  const endpoint = useMemo(() => mcpEndpointUrl(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, allUsers] = await Promise.all([
        mcpService.listTokens(showRevoked),
        authService.getAllUsers(),
      ]);
      setTokens(list);
      setUsers(allUsers.filter((u) => u.is_approved && !u.is_disabled));
      if (!userId && user?.id) {
        setUserId(Number(user.id));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load MCP tokens');
    } finally {
      setLoading(false);
    }
  }, [showRevoked, user?.id, userId]);

  useEffect(() => {
    load();
  }, [load]);

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setError('Could not copy to clipboard');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const scopes: Array<'read' | 'write' | 'admin'> = ['read'];
      if (allowWrite) scopes.push('write');
      if (allowAdmin) scopes.push('admin');
      const created = await mcpService.createToken({
        name: name.trim() || 'MCP token',
        scopes,
        userId: userId || undefined,
        expiresInDays: expiresInDays > 0 ? expiresInDays : null,
      });
      setCreatedToken(created);
      setName('Cursor');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to create token');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (token: McpToken) => {
    if (!window.confirm(`Revoke token “${token.name}” (${token.tokenPrefix})? LLMs using it will lose access immediately.`)) {
      return;
    }
    try {
      await mcpService.revokeToken(token.id);
      if (createdToken?.id === token.id) {
        setCreatedToken(null);
      }
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke token');
    }
  };

  const sampleToken = createdToken?.token || 'lnmcp_YOUR_TOKEN';

  return (
    <div className="space-y-6">
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h3 className={ADMIN_SECTION_TITLE}><span aria-hidden>🤖</span> MCP / AI</h3>
          <p className={ADMIN_SECTION_SUBTITLE}>
            Let Cursor, Claude Desktop, and other MCP clients read and update LinkNest spaces through tools.
          </p>
        </div>
        <div className="p-6 space-y-4 text-sm text-slate-600 dark:text-slate-300">
          <p>
            MCP endpoint: <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200">{endpoint}</code>
          </p>
          <p>
            Create a token below, then paste the generated config into your LLM client. Tokens act as the selected user and obey the same space visibility and edit permissions as the web app.
            An <strong>administrator</strong> with <strong>write</strong> gets <code>admin_query</code> and <code>admin_manage</code> in Cursor (pass <code>action</code> such as <code>list_users</code> or <code>create_local_user</code>). Optional Admin scope is only needed for read-only admin tokens.
          </p>
          <p>
            Full walkthrough: <strong>Help → Guides → MCP / AI</strong>. Copy-ready chat statements are on the{' '}
            <strong>Example prompts</strong> tab.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-sky-200/70 dark:border-sky-800/40 rounded-xl p-1 shadow-sm shadow-sky-500/5">
        <div className="flex flex-wrap gap-1">
          {([
            { id: 'tokens' as const, label: 'Tokens', emoji: '🔑' },
            { id: 'examples' as const, label: 'Example prompts', emoji: '💬' },
          ]).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMcpTab(item.id)}
              className={`flex-1 min-w-[7rem] px-3 py-2 text-sm font-medium transition-colors rounded-lg ${
                mcpTab === item.id
                  ? 'bg-sky-600 text-white shadow-sm shadow-sky-500/25'
                  : 'text-sky-800/80 dark:text-sky-200/80 hover:bg-sky-50 dark:hover:bg-sky-950/40'
              }`}
            >
              <span aria-hidden className="mr-1">{item.emoji}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {mcpTab === 'tokens' && createdToken?.token && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-5 space-y-3">
          <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Copy this token now — it is shown only once</h4>
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 break-all text-xs bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100">
              {createdToken.token}
            </code>
            <button
              type="button"
              onClick={() => copyText('token', createdToken.token || '')}
              className={`px-4 py-2 ${ADMIN_PRIMARY_BTN}`}
            >
              {copied === 'token' ? 'Copied' : 'Copy token'}
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Cursor (HTTP)</span>
                <button type="button" className="text-xs text-sky-700 dark:text-sky-300" onClick={() => copyText('cursor', cursorHttpConfig(endpoint, createdToken.token || ''))}>
                  {copied === 'cursor' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="text-[11px] leading-relaxed overflow-x-auto rounded-lg bg-slate-900 text-slate-100 p-3">{cursorHttpConfig(endpoint, createdToken.token)}</pre>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Claude Desktop / stdio</span>
                <button type="button" className="text-xs text-sky-700 dark:text-sky-300" onClick={() => copyText('stdio', claudeStdioConfig(endpoint, createdToken.token || ''))}>
                  {copied === 'stdio' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="text-[11px] leading-relaxed overflow-x-auto rounded-lg bg-slate-900 text-slate-100 p-3">{claudeStdioConfig(endpoint, createdToken.token)}</pre>
            </div>
          </div>
        </div>
      )}

      {mcpTab === 'tokens' && (
        <>
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h3 className={ADMIN_SECTION_TITLE}><span aria-hidden>🔑</span> Create token</h3>
          <p className={ADMIN_SECTION_SUBTITLE}>Bind the token to a user. Write enables spaces/links and admin tools when the bound user is an administrator. Optional Admin scope grants admin read tools on read-only tokens.</p>
        </div>
        <form onSubmit={handleCreate} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Name</label>
            <input className={ADMIN_FIELD} value={name} onChange={(e) => setName(e.target.value)} placeholder="Cursor on laptop" maxLength={80} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Acts as user</label>
            <select className={ADMIN_FIELD} value={userId} onChange={(e) => setUserId(Number(e.target.value))}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}{u.is_admin ? ' (admin)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Expires</label>
            <select className={ADMIN_FIELD} value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))}>
              <option value={0}>Never</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={365}>1 year</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={allowWrite}
                onChange={(e) => setAllowWrite(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">Allow write (create / edit / delete spaces and links)</span>
            </label>
          </div>
          <div className="flex items-end md:col-span-2">
            <label className={`flex items-center gap-2 pb-2 ${users.find((u) => Number(u.id) === userId)?.is_admin ? 'cursor-pointer' : 'opacity-60'}`}>
              <input
                type="checkbox"
                checked={allowAdmin}
                disabled={!users.find((u) => Number(u.id) === userId)?.is_admin}
                onChange={(e) => setAllowAdmin(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Admin (users, roles, LDAP / SAML, database). Bound user must be an administrator. Device Presets do not need this checkbox.
              </span>
            </label>
          </div>
          <div className="md:col-span-2">
            <button type="submit" disabled={saving} className={`px-5 py-2.5 ${ADMIN_PRIMARY_BTN}`}>
              {saving ? 'Creating…' : 'Create token'}
            </button>
          </div>
        </form>
      </div>

      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className={ADMIN_SECTION_TITLE}><span aria-hidden>📋</span> Tokens</h3>
              <p className={ADMIN_SECTION_SUBTITLE}>Revoke unused tokens. Prefixes are shown; the secret is never stored in plain text.</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
              <input type="checkbox" checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)} className="rounded border-slate-300 text-sky-600" />
              Show revoked
            </label>
          </div>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
            </div>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No MCP tokens yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-sky-100 dark:border-sky-900/40">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Prefix</th>
                    <th className="py-2 pr-3">Scopes</th>
                    <th className="py-2 pr-3">Last used</th>
                    <th className="py-2 pr-3">Expires</th>
                    <th className="py-2"> </th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr key={token.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2.5 pr-3 font-medium text-slate-800 dark:text-slate-100">
                        {token.name}
                        {token.revokedAt ? <span className="ml-2 text-xs text-rose-500">revoked</span> : null}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">{token.username || token.userId}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{token.tokenPrefix}</td>
                      <td className="py-2.5 pr-3">{token.scopes.join(', ')}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">{formatWhen(token.lastUsedAt)}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">{formatWhen(token.expiresAt)}</td>
                      <td className="py-2.5 text-right">
                        {!token.revokedAt && (
                          <button type="button" onClick={() => handleRevoke(token)} className="text-xs font-semibold text-rose-600 hover:text-rose-500">
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h3 className={ADMIN_SECTION_TITLE}><span aria-hidden>🛠️</span> Tools</h3>
          <p className={ADMIN_SECTION_SUBTITLE}>Space tools for every token. Admin tools appear only when the bound user is an administrator and the token has the Admin scope.</p>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Read</h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
              <li><code>whoami</code>, <code>list_spaces</code>, <code>get_space</code></li>
              <li><code>search_links</code>, <code>list_categories</code>, <code>list_notes</code></li>
              <li><code>list_device_presets</code> (administrator user)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Write (if enabled)</h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
              <li><code>create_space</code>, <code>update_space</code>, <code>delete_space</code></li>
              <li><code>add_link</code>, <code>update_link</code>, <code>delete_link</code></li>
              <li><code>create_note</code>, <code>update_note</code></li>
              <li><code>manage_device_presets</code> (administrator user)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Admin (administrator + write)</h4>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
              <li><code>admin_query</code> — pass <code>tool</code>: list_users, get_auth_status, list_roles, export_database, …</li>
              <li><code>admin_manage</code> — pass <code>tool</code>: create_local_user, update_user, assign_user_roles, import_database, …</li>
              <li><code>list_device_presets</code>, <code>manage_device_presets</code></li>
            </ul>
          </div>
        </div>
        <div className="px-6 pb-6 text-xs text-slate-500 dark:text-slate-400">
          Sample HTTP config (replace the token):
          <pre className="mt-2 text-[11px] leading-relaxed overflow-x-auto rounded-lg bg-slate-900 text-slate-100 p-3">{cursorHttpConfig(endpoint, sampleToken)}</pre>
        </div>
      </div>
        </>
      )}

      {mcpTab === 'examples' && (
        <div className={ADMIN_SECTION_CARD}>
          <div className={ADMIN_SECTION_HEADER}>
            <h3 className={ADMIN_SECTION_TITLE}><span aria-hidden>💬</span> Example prompts</h3>
            <p className={ADMIN_SECTION_SUBTITLE}>
              Paste these into a new Cursor Agent or Claude chat after MCP is green. Admin statements need an administrator user plus the Admin checkbox on the token.
            </p>
          </div>
          <div className="p-6 grid grid-cols-1 gap-4">
            {MCP_EXAMPLE_PROMPTS.map((example) => (
              <div
                key={example.id}
                className="rounded-xl border border-sky-100 dark:border-sky-900/40 bg-slate-50 dark:bg-slate-900/40 p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{example.title}</h4>
                    <p className="text-xs text-sky-700 dark:text-sky-300 mt-0.5">{MCP_EXAMPLE_NEED_LABEL[example.need]}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText(example.id, example.prompt)}
                    className="text-xs font-semibold text-sky-700 dark:text-sky-300 hover:text-sky-500"
                  >
                    {copied === example.id ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="text-[11px] leading-relaxed whitespace-pre-wrap overflow-x-auto rounded-lg bg-slate-900 text-slate-100 p-3">{example.prompt}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
