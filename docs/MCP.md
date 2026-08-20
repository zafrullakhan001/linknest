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

## 2. Configure Cursor (HTTP MCP)

Cursor talks to LinkNest over **Streamable HTTP**. You do **not** run `node mcp/server.mjs` for Cursor.

### Option A — Settings UI (easiest)

1. Keep Apache / XAMPP (or Docker) running so `http://localhost/linknest` loads
2. In Cursor: **Settings → MCP** (or **Cursor Settings → Tools & MCP**)
3. Click **Add new MCP server** / **Open mcp.json**
4. Paste the JSON below (replace `lnmcp_YOUR_TOKEN` with the token from Admin → MCP / AI)
5. Save. Toggle **linknest** on if it is off
6. Wait for a **green** status (tools loaded). If it stays red, reload the window (**Developer: Reload Window**)
7. Open a **new Agent chat** (existing chats started before the server was added will not see the tools)

### Option B — Edit the config files

| Scope | Windows path |
|-------|----------------|
| **Global** (all projects) | `C:\Users\<you>\.cursor\mcp.json` |
| **This project only** | `<repo>\.cursor\mcp.json` (gitignored — do not commit the token) |

If the file already has other servers (`MCP_DOCKER`, `headroom`, …), **add** `linknest` next to them. Do not replace the whole `mcpServers` object.

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

Use your real origin and folder (`http://localhost/ArchLinks/api/mcp`, `http://localhost/ERP3/api/mcp`, Docker `http://localhost:8090/api/mcp`, and so on). **Admin → MCP / AI** copies a ready-to-paste snippet after you create a token.

Repo example: `mcp/cursor.mcp.json.example`

### Check that Cursor can see LinkNest

In a **new Agent chat**, ask:

> Use the LinkNest MCP. Call whoami, then list_spaces.

You should see the token user (for example `admin`) and your spaces. Then try the create-space prompt in section 4.

---

## 3. Configure Claude Desktop (stdio MCP)

Claude Desktop prefers a **local process**. Cursor’s HTTP JSON will not work there. Point Claude at `mcp/server.mjs`, which forwards JSON-RPC to `POST /api/mcp`.

### Steps

1. Install [Claude Desktop](https://claude.ai/download) and Node.js 20+
2. Create a write-enabled token in **Admin → MCP / AI**
3. Open Claude’s config file (create it if missing):

| OS | Path |
|----|------|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` (`C:\Users\<you>\AppData\Roaming\Claude\claude_desktop_config.json`) |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |

4. Paste this JSON. Fix the `args` path if LinkNest is not at `C:\xampp\htdocs\linknest`, and replace the token:

```json
{
  "mcpServers": {
    "linknest": {
      "command": "node",
      "args": ["C:/xampp/htdocs/linknest/mcp/server.mjs"],
      "env": {
        "LINKNEST_URL": "http://localhost/linknest",
        "LINKNEST_TOKEN": "lnmcp_YOUR_TOKEN"
      }
    }
  }
}
```

5. Fully quit Claude Desktop (tray icon too) and reopen it
6. In a chat, click the **tools / MCP** indicator and confirm **linknest** is connected
7. Ask Claude the same prompts as in section 4

| Variable | Required | Meaning |
|----------|----------|---------|
| `LINKNEST_URL` | yes | App origin **including folder**, no trailing slash — e.g. `http://localhost/linknest` |
| `LINKNEST_TOKEN` | yes | Token from Admin → MCP / AI (`lnmcp_…`) |
| `LINKNEST_INSECURE_TLS` | no | Set to `1` only for self-signed HTTPS |

From the repo you can also run `node mcp/server.mjs` or `npm run mcp` (same env vars) to test the adapter.

Repo example: `mcp/claude_desktop_config.example.json`

---

## 4. Example: create a space with a bunch of links

In **Cursor Agent** or **Claude Desktop**, paste a prompt like this (after MCP is green):

```
Create a LinkNest space titled Helpdesk Tools in category BUSINESS IT SERVICES, visibility public, emoji 🎫.

Add these links:
- ServiceNow — https://servicenow.adventhealth.com/now/sdw/home (tab Production, section Portals)
- Hub — https://hub.adventhealth.com/ (tab Production, section Portals)
- PAM — https://pam.adventhealth.com/webconsole/login (tab Production, section Security)
```

The model should call `create_space` with a `links` array. If you omit tab/section, new links go in **General / Links**.

What the tool call looks like:

```json
{
  "name": "create_space",
  "arguments": {
    "title": "Helpdesk Tools",
    "emoji": "🎫",
    "group": "BUSINESS IT SERVICES",
    "visibility": "public",
    "links": [
      {
        "label": "ServiceNow",
        "url": "https://servicenow.adventhealth.com/now/sdw/home",
        "tab": "Production",
        "section": "Portals"
      },
      {
        "label": "Hub",
        "url": "https://hub.adventhealth.com/",
        "tab": "Production",
        "section": "Portals"
      },
      {
        "label": "PAM",
        "url": "https://pam.adventhealth.com/webconsole/login",
        "tab": "Production",
        "section": "Security"
      }
    ]
  }
}
```

Refresh the LinkNest home grid (or reload the page) to see the new tile.

### Follow-up prompts

- “Add this URL to Helpdesk Tools under tab Production, section Portals.”
- “Search my spaces for Workday, then add this QA URL to that space.”
- “Summarize the links in PeopleSoft ERP.”
- “List categories, then list spaces in BUSINESS IT SERVICES.”

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
