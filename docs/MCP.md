# LinkNest MCP interface

LinkNest exposes a [Model Context Protocol](https://modelcontextprotocol.io/) server so LLMs (Cursor, Claude Desktop, Claude Code, and other MCP clients) can list spaces, search links, and optionally create or edit bookmarks using the same permissions as the token’s user.

## Endpoint

```
POST /api/mcp
Authorization: Bearer lnmcp_…
Accept: application/json, text/event-stream
Content-Type: application/json
```

Transport is **Streamable HTTP** (JSON-RPC 2.0). GET SSE streams are not used; clients POST each message and receive a JSON result.

Create tokens in **Admin → MCP / AI**. The secret is shown once. Tokens are stored as SHA-256 hashes.

## Cursor (remote / HTTP)

Add to your MCP config (Cursor Settings → MCP):

```json
{
  "mcpServers": {
    "linknest": {
      "url": "http://localhost/linknest/api/mcp",
      "headers": {
        "Authorization": "Bearer lnmcp_YOUR_TOKEN"
      }
    }
  }
}
```

Use your real origin and folder (`/ArchLinks`, `/ERP3`, etc.). The Admin page copies a ready-to-paste snippet after you create a token.

Example file: [`mcp/cursor.mcp.json.example`](../mcp/cursor.mcp.json.example)

## Claude Desktop / local stdio

Claude Desktop still prefers a local process. From the repo root:

```bash
node mcp/server.mjs
```

Env:

| Variable | Required | Meaning |
|----------|----------|---------|
| `LINKNEST_URL` | yes | App origin including folder, e.g. `http://localhost/linknest` |
| `LINKNEST_TOKEN` | yes | Token from Admin → MCP / AI |
| `LINKNEST_INSECURE_TLS` | no | Set to `1` for self-signed HTTPS |

Example: [`mcp/claude_desktop_config.example.json`](../mcp/claude_desktop_config.example.json)

`npm run mcp` runs the same adapter (still needs the env vars).

## Tools

**Read** (every token)

| Tool | Purpose |
|------|---------|
| `whoami` | Token user and scopes |
| `list_spaces` | Spaces the user can see |
| `get_space` | Tabs, sections, and links for one space |
| `search_links` | Find links by label, URL, notes, or space title |
| `list_categories` | Category names |
| `list_notes` | Personal notes widget |

**Write** (token must include the `write` scope)

| Tool | Purpose |
|------|---------|
| `create_space` | New space, optional seed links |
| `update_space` | Title, description, emoji, category, visibility |
| `delete_space` | Soft-delete to the recycle bin |
| `add_link` | Add a link (creates tab/section if needed) |
| `update_link` | Label, URL, notes |
| `delete_link` | Remove a link |
| `create_note` / `update_note` | Personal notes |

Resources: `linknest://catalog`, `linknest://space/{id}`.

Prompts: `find_a_link`, `add_bookmark`, `summarize_space`.

## Auth and permissions

- Tokens act as the selected LinkNest user (not a separate “bot” role).
- Listing and search honor space visibility, staging, unpublished content, shares, and role assignments.
- Write tools require owner, admin, or explicit edit permission — not “any logged-in user”.
- `javascript:` and `data:` URLs are rejected.
- Revoking a token takes effect immediately.

## Smoke test

```bash
curl -sS -X POST "http://localhost/linknest/api/mcp" ^
  -H "Authorization: Bearer lnmcp_YOUR_TOKEN" ^
  -H "Content-Type: application/json" ^
  -H "Accept: application/json, text/event-stream" ^
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-03-26\",\"capabilities\":{},\"clientInfo\":{\"name\":\"curl\",\"version\":\"1.0\"}}}"
```

Then call `tools/list` and `tools/call` with `{"name":"whoami","arguments":{}}`.

## Files

| Path | Role |
|------|------|
| `api/mcp.php` | HTTP transport |
| `api/mcp_lib.php` | JSON-RPC methods and tools |
| `api/mcp_tokens.php` | Admin token CRUD |
| `mcp/server.mjs` | stdio → HTTP adapter |
| `components/McpAdminPanel.tsx` | Admin UI |
