# MCP / AI

Let Cursor, Claude Desktop, Claude Code, and other [Model Context Protocol](https://modelcontextprotocol.io/) clients **list, search, and edit** LinkNest spaces and links with the same permissions as the token’s user.

In the app: **Help → Guides → MCP / AI**. Admins create tokens in **Admin → MCP / AI**.

---

## What you can do

Ask an LLM in plain language. With a **write** token it can:

- List spaces and categories you can see
- Search bookmarks by label, URL, notes, or space title
- Open one space (tabs, sections, links)
- **Create a space and seed it with a bunch of links** in one step
- Add, rename, or delete links
- Update space title, description, emoji, category, or visibility
- Soft-delete a space (recycle bin)
- Read and write personal Notes widget items

Without write scope, the client can only read.

---

## 1. Create a token

1. Sign in as an administrator
2. Open **Admin → MCP / AI**
3. Name the token (for example `Cursor on laptop`)
4. Choose which LinkNest **user** it acts as
5. Enable **write** if the LLM should create or edit spaces and links
6. Create the token and **copy it once** — the secret is not shown again
7. Copy the generated **Cursor (HTTP)** or **Claude Desktop** snippet

Tokens are stored as SHA-256 hashes. Revoking a token takes effect immediately.

---

## 2. Connect Cursor

Cursor Settings → **MCP** (or add the same JSON to `~/.cursor/mcp.json` and/or this project’s `.cursor/mcp.json`).

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

Use your real origin and folder (`/ArchLinks`, `/ERP3`, `/linknest`, and so on). The Admin page copies a ready-to-paste snippet after you create a token.

Then:

1. Keep Apache (or Docker) running so the URL is reachable
2. Confirm **linknest** is enabled and green in Cursor MCP settings
3. Start a **new Agent chat** so the tools load
4. Ask the model to use LinkNest (examples below)

Example file in the repo: `mcp/cursor.mcp.json.example`

---

## 3. Connect Claude Desktop (stdio)

Claude Desktop prefers a local process. From the repo root:

```bash
node mcp/server.mjs
```

| Variable | Required | Meaning |
|----------|----------|---------|
| `LINKNEST_URL` | yes | App origin including folder, e.g. `http://localhost/linknest` |
| `LINKNEST_TOKEN` | yes | Token from Admin → MCP / AI |
| `LINKNEST_INSECURE_TLS` | no | Set to `1` for self-signed HTTPS |

Example: `mcp/claude_desktop_config.example.json`

`npm run mcp` runs the same adapter (still needs the env vars).

---

## 4. Ask the LLM to create a space with links

In Cursor Agent or Claude, describe the space and list the URLs. Be specific about category, tabs, and sections.

Example prompt:

> Create a LinkNest space titled **Helpdesk Tools** in category **BUSINESS IT SERVICES**, visibility public.  
> Add these links:  
> - ServiceNow — https://servicenow.example.com (tab Production, section Portals)  
> - Hub — https://hub.example.com (tab Production, section Portals)  
> - PAM — https://pam.example.com (tab Production, section Security)

The model should call `create_space` with a `links` array. If you omit tab/section, new links go in **General / Links**.

Follow-ups:

- “Add this URL to Helpdesk Tools under tab Production, section Portals.”
- “Search my spaces for Workday, then add this QA URL to that space.”
- “Summarize the links in PeopleSoft ERP.”

Refresh the LinkNest home grid (or reload the page) to see the new tile.

---

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
| `create_space` | New space, optional seed links (`label` + `url`, optional `tab` / `section` / `notes`) |
| `update_space` | Title, description, emoji, category, visibility |
| `delete_space` | Soft-delete to the recycle bin |
| `add_link` | Add a link (creates tab/section if needed) |
| `update_link` | Label, URL, notes |
| `delete_link` | Remove a link |
| `create_note` / `update_note` | Personal notes |

Resources: `linknest://catalog`, `linknest://space/{id}`.

Prompts: `find_a_link`, `add_bookmark`, `summarize_space`.

### `create_space` fields

| Field | Required | Notes |
|-------|----------|--------|
| `title` | yes | Space name |
| `description` | no | Shown on the tile |
| `emoji` | no | Tile emoji |
| `group` | no | Category name (default General) |
| `visibility` | no | `public`, `authenticated`, or `private` |
| `theme_color` | no | e.g. `blue`, `cyan` |
| `links` | no | Array of `{ label, url, notes?, tab?, section? }` |

---

## Auth and permissions

- Tokens act as the selected LinkNest user (not a separate “bot” role).
- Listing and search honor space visibility, staging, unpublished content, shares, and role assignments.
- Write tools require owner, admin, or explicit edit permission — not “any logged-in user”.
- `javascript:` and `data:` URLs are rejected.
- Revoking a token takes effect immediately.

Treat MCP tokens like passwords. Do not commit them to git. Prefer `~/.cursor/mcp.json` (user config) or a gitignored `.cursor/mcp.json` in the project.

---

## Endpoint (technical)

```
POST /api/mcp
Authorization: Bearer lnmcp_…
Accept: application/json, text/event-stream
Content-Type: application/json
```

Transport is **Streamable HTTP** (JSON-RPC 2.0). GET SSE streams are not used; clients POST each message and receive a JSON result.

### Smoke test

```bash
curl -sS -X POST "http://localhost/linknest/api/mcp" ^
  -H "Authorization: Bearer lnmcp_YOUR_TOKEN" ^
  -H "Content-Type: application/json" ^
  -H "Accept: application/json, text/event-stream" ^
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-03-26\",\"capabilities\":{},\"clientInfo\":{\"name\":\"curl\",\"version\":\"1.0\"}}}"
```

Then call `tools/list` and `tools/call` with `{"name":"whoami","arguments":{}}`.

---

## Files

| Path | Role |
|------|------|
| `api/mcp.php` | HTTP transport |
| `api/mcp_lib.php` | JSON-RPC methods and tools |
| `api/mcp_tokens.php` | Admin token CRUD |
| `mcp/server.mjs` | stdio → HTTP adapter |
| `components/McpAdminPanel.tsx` | Admin UI |
