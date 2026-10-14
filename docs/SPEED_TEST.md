# Internet speed test — Custom server (by IP) target

The **Internet speed test** widget (Monitoring dashboard, or the nav widget) measures three targets:

| Target | Path measured | Notes |
|--------|---------------|-------|
| **Internet** | this browser → Cloudflare | public internet path from the device |
| **This server** | this browser → *this* LinkNest host | LAN/VPN path to the LinkNest instance you are using |
| **Custom server** | browser-direct **or** *this* host → an endpoint you nominate by IP/host | measure *another* web server on the network |

## Custom server: two modes

Choose **Custom server** in the toolbar, type an address (`192.168.10.20`, `fileserver.local`,
`10.0.0.5:8080`, or paste a full `http(s)://…` URL), then pick a mode:

### Browser → endpoint (direct)
This browser connects to `<endpoint>/api/speedtest/*` itself and measures **this device's** path.

Requirements:
* The endpoint must expose the cross-origin speed-test probe. In practice that means **another
  LinkNest** that has `speedtest_public_probe_enabled = 1`. That setting makes `/info`, `/ping`,
  `/download` and `/upload` answer without a session, echo the caller's `Origin`, and rate-limit
  per IP.
* Mixed-content rules apply: an `https://` LinkNest page cannot probe a plain `http://` endpoint.

### Host → endpoint (server proxy)
This LinkNest host relays to the endpoint with cURL and streams the result back. It works for **any**
web server by IP (Apache, nginx, IIS, a static file server, …) and is not affected by CORS.

Requirements and safety:
* The address must be on the admin **proxy allow-list**: `speedtest_proxy_allow_hosts`
  (CSV of hostnames, IPs, or IPv4 CIDRs such as `10.20.0.0/16`). An empty list blocks every target.
* Private, loopback, link-local and reserved ranges are refused **unless** they appear on the
  allow-list — so the relay cannot be used to scan the LAN or cloud metadata endpoints.
* `http`/`https` only, no credentials in the URL; redirects are not followed by default
  (`speedtest_proxy_max_redirects`, 0–3).
* Self-signed TLS on the endpoint is allowed when `speedtest_proxy_allow_self_signed = 1`.

Because the proxy measures the **LinkNest host's** network — not the operator's PC — its results are
labelled `via LinkNest host` everywhere (result card, comparison, history, CSV, PNG).

## Where the settings live

Profile menu → **Internet speed test** → **Settings**:

* **Custom server** — scheme / host / port / path, the direct-vs-proxy mode, and *allow self-signed*
  for Browser-direct. Stored per device in `localStorage` (`linknest_speedtest_prefs_v1`).
* **Admin · proxy allow-list** — `speedtest_proxy_allow_hosts`, `speedtest_proxy_allow_self_signed`,
  `speedtest_proxy_max_redirects`, `speedtest_public_probe_enabled`. Saved through the normal settings
  API and whitelisted in `api/settings.php`.

## API

Session (authenticated) routes added to `api/speedtest.php`:

| Route | Purpose |
|-------|---------|
| `GET  /api/speedtest/proxy/info?target=…` | endpoint reachability + its reported IP |
| `GET  /api/speedtest/proxy/ping?target=…` | relayed RTT probe |
| `GET  /api/speedtest/proxy/download?target=…&bytes=…` | relayed octet stream |
| `POST /api/speedtest/proxy/upload?target=…` | relayed upload body |

Public probe routes (only when `speedtest_public_probe_enabled = 1`, no session, per-IP limited):
`/api/speedtest/info|ping|download|upload`.

Helpers live in `api/speedtest_proxy_lib.php`. Server-proxy requests are charged to a separate
per-user bucket (`user:<id>:proxy_hour`); the interactive budgets stay under
`speedtest_interactive_max_per_hour`.

## Scope notes

* Custom-server runs are **interactive only** — `speedtest_schedules.target` still accepts
  `internet|server`, so no schema migration is involved. Worker schedules are unchanged.
* A failed **Browser → endpoint** run never silently falls back: the widget offers an explicit
  **“Try via server (proxy)”** button so the two paths can never be confused.
* History, “vs last” and the trend chart are keyed by target **and** endpoint host **and** mode, so
  two different IPs (or direct vs proxy) are never compared to each other.
