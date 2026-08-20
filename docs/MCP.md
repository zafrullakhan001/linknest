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

With an **admin** token (bound user is an administrator **and** the token has the `admin` scope), the client can also:

- Read LDAP/SAML status (no bind passwords; IdP cert as fingerprint only)
- Test LDAP and SAML
- List and update users (approve / disable / enable / reject pending). Not included: password reset, delete approved users, promote/demote admin, transfer ownership, LDAP purge
- Manage Access Manager roles, widgets, nav tabs, teams, and space editors

Assign tools default to `mode: add` (merge). Use `replace` or `remove` only when you intend to.

---

## 1. Create a token

1. Sign in as an administrator
2. Open **Admin → MCP / AI**
3. Name the token (for example `Cursor on laptop`)
4. Choose which LinkNest **user** it acts as
5. Enable **write** if the LLM should create or edit spaces and links
6. Enable **Admin (users, roles, LDAP / SAML)** only if the bound user is an administrator and you want Access Manager / auth setup tools
7. Create the token and **copy it once** — the secret is not shown again
8. Copy the generated **Cursor (HTTP)** or **Claude Desktop** snippet

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

In **Cursor Agent** or **Claude Desktop**, paste a prompt like this (after MCP is green). Admins can also copy the same statements from **Admin → MCP / AI → Example prompts**.

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

### Admin prompts (admin user + admin scope)

Start with `whoami` (check `hasAdminTools` and `scopes`). Then:

- “Show LDAP/SAML status and whether the PHP LDAP extension is loaded.”
- “Set LDAP host to `dc.corp.example.com` port 389, bind DN `CN=svc,OU=…`, search base `DC=corp,DC=example,DC=com`, then test the connection. Do not print the bind password.”
- “List pending users and approve jane.doe.”
- “Create role Helpdesk, assign nav tabs public and favorites, widgets clock and notes, and spaces PeopleSoft ERP and PAM. Then assign that role to user jsmith.”

LDAP bind passwords and SAML IdP certificates are write-only. Status returns `has_bind_password` and `idp_cert_present` plus a fingerprint — never the secret.

---

## 5. Cloned instances (new folder name)

The MCP **feature is copied** with every clone (`api/mcp.php`, Admin → MCP / AI). It does **not** keep working against the clone until you change the **URL** (and usually the **token**) in Cursor / Claude.

The endpoint always includes the install folder:

| Instance | MCP URL |
|----------|---------|
| Source | `http://localhost/linknest/api/mcp` |
| Clone named `ERP3` | `http://localhost/ERP3/api/mcp` |
| Clone named `ArchLinks` | `http://localhost/ArchLinks/api/mcp` |

Open the **clone** in the browser, then **Admin → MCP / AI**. The page shows the correct URL for that folder. Do not keep pointing Cursor at `/linknest/api/mcp` if you mean to edit the clone — that still talks to the original instance.

### Tokens vs clone preset

| Preset | Database | MCP tokens |
|--------|----------|------------|
| **full** (mirror) | Copied | Token **hashes** copy. The same `lnmcp_…` secret can work on the clone **if** you change the URL. It also still works on the source. Prefer a **new token on the clone** so you can revoke them independently. |
| **structure** | Tiles copied; users reset to `admin` / `admin123` | Do **not** reuse the source token. Create a new token on the clone. |
| **empty** / **demo** | Fresh (or demo) DB | No source tokens. Create a new token on the clone. |

### Cursor (clone)

Keep a **separate** server id per instance (recommended):

```json
{
  "mcpServers": {
    "linknest": {
      "url": "http://localhost/linknest/api/mcp",
      "headers": {
        "Authorization": "Bearer lnmcp_SOURCE_TOKEN"
      }
    },
    "linknest-erp3": {
      "url": "http://localhost/ERP3/api/mcp",
      "headers": {
        "Authorization": "Bearer lnmcp_CLONE_TOKEN"
      }
    }
  }
}
```

### Claude Desktop (clone)

Point `LINKNEST_URL` at the clone origin (no `/api/mcp` suffix). `args` can stay the source `mcp/server.mjs` or the clone’s copy — the adapter only uses the env URL:

```json
{
  "mcpServers": {
    "linknest-erp3": {
      "command": "node",
      "args": ["C:/xampp/htdocs/ERP3/mcp/server.mjs"],
      "env": {
        "LINKNEST_URL": "http://localhost/ERP3",
        "LINKNEST_TOKEN": "lnmcp_CLONE_TOKEN"
      }
    }
  }
}
```

Renaming the folder later means updating `url` / `LINKNEST_URL` again. The MCP tools themselves do not store the instance name.

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

**Admin read** (bound user `is_admin` **and** token `admin` scope). Non-admin tokens never see these in `tools/list`.

| Tool | Purpose |
|------|---------|
| `get_auth_status` | LDAP/SAML flags, hosts/DNs/filters, cert fingerprint; no secrets |
| `test_ldap` | Connect/bind test (optional user bind). Passwords never echoed |
| `test_saml` | `test_configuration`, `test_metadata`, `test_idp_connectivity`, `validate_certificate` |
| `list_users` / `get_user` | Users and role assignments; no password hashes |
| `list_roles` / `get_role` | Roles plus assigned spaces, widgets, nav tabs |
| `list_teams` | Access Manager teams (user groups) |
| `list_space_editors` | Per-space editor grants |

**Admin write** (`admin` + `write`)

| Tool | Purpose |
|------|---------|
| `update_ldap` / `update_saml` | Guarded auth setup. Blank bind password / cert keeps the stored value |
| `update_user` | Username, email, notes, `auth_source` |
| `set_user_status` | `approve` / `disable` / `enable` / `reject` |
| `create_role` / `update_role` | Role name, description, guest flag |
| `assign_user_roles` | `mode`: `add` (default), `replace`, `remove` |
| `set_role_spaces` / `set_role_widgets` / `set_role_tabs` | Same merge modes. Tabs are app nav tabs, not space content tabs |
| `assign_team_roles` / `add_team_members` | Teams |
| `set_space_editor` | Grant or revoke editor access (`can_edit: false` removes) |

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
- Admin tools require an administrator bound user **and** the `admin` token scope. Write admin tools also need `write`.
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
| `api/mcp_lib.php` | JSON-RPC methods and space/link/note tools |
| `api/mcp_admin_lib.php` | Admin LDAP/SAML, users, Access Manager tools |
| `api/mcp_tokens.php` | Admin token CRUD |
| `mcp/server.mjs` | stdio → HTTP adapter |
| `components/McpAdminPanel.tsx` | Admin UI |
