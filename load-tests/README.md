# LinkNest Load Tests (k6)

Simulate concurrent users browsing LinkNest: home → spaces → links.

## Prerequisites

1. [k6](https://k6.io/docs/get-started/installation/) installed  
   Windows: `winget install GrafanaLabs.k6`
2. App reachable (XAMPP Apache running), default: `http://localhost/linknest`

## Quick start (100 concurrent users)

From the repo root:

```powershell
.\load-tests\run.ps1
```

Or directly:

```powershell
k6 run -e BASE_URL=http://localhost/linknest -e VUS=100 -e DURATION=5m .\load-tests\browse-spaces.js
```

## What each virtual user does

1. Optional login (`LOGIN=1`)
2. Load home in parallel: `/auth/me`, `/settings`, `/styles`, `/tiles`, `/arrangements`
3. Open 3 random spaces (`GET /tiles/{id}`)
4. Simulate link clicks (analytics collect by default; external HTTP off by default)
5. Navigate back to the tile list between spaces
6. Think time 1–3s between steps

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost/linknest` | App root (no trailing slash) |
| `VUS` | `100` | Concurrent virtual users |
| `DURATION` | `5m` | Steady-state duration |
| `RAMP` | `30s` | Ramp-up to VUS |
| `THINK_MIN` / `THINK_MAX` | `1` / `3` | Think time (seconds) |
| `SPACES_PER_USER` | `3` | Spaces opened per iteration |
| `LINKS_PER_SPACE` | `2` | Links “clicked” per space |
| `LOGIN` | `0` | Set `1` to login first |
| `USERNAME` / `PASSWORD` | `admin` / `admin123` | Credentials when `LOGIN=1` |
| `HIT_ANALYTICS` | `1` | POST `/analytics/collect` on link click |
| `HIT_EXTERNAL_LINKS` | `0` | Real HEAD requests to link URLs (usually leave off) |
| `SUMMARY_JSON` | `load-tests/results/last-summary.json` | Summary output path |

## Examples

Smoke (10 users, 1 minute):

```powershell
.\load-tests\run.ps1 -Vus 10 -Duration 1m
```

Authenticated browse (defaults to **10 VUs** — typical office concurrency):

```powershell
.\load-tests\run.ps1 -Login -Username admin -Password admin123
```

Or smoke + login (10 VUs, 1 minute):

```powershell
.\load-tests\run.ps1 -Smoke -Login -Username admin -Password admin123
```

Against Docker (port 8090):

```powershell
.\load-tests\run.ps1 -BaseUrl http://localhost:8090
```

## Pass / fail thresholds

- HTTP failure rate &lt; 5%
- API success rate &gt; 95%
- p95 request duration &lt; 2s
- p99 request duration &lt; 5s
- p95 home / space latency &lt; 2s

Adjust thresholds in `browse-spaces.js` → `options.thresholds` if needed for slower hosts.

## HTML report (in-app)

After a run (or from an existing summary):

```powershell
node .\load-tests\generate-report.js
```

Opens as `load-tests/results/report.html` with branding from **Settings → App name** (for example **ZLinks Load Test Report**), the **test run date**, KPI cards, charts, thresholds, solutions, metric glossary, and step-by-step re-run instructions.

In the app (admin only): **Admin → Load Test** embeds the same report and shows the run date.  
`run.ps1` regenerates this report automatically when a test finishes.

## Notes

- This is **API-level** load (what the React SPA calls), not 100 real browsers.
- SQLite handles concurrent **reads** well with WAL; heavy concurrent **writes** are a different test.
- Leave `HIT_EXTERNAL_LINKS=0` so you do not flood third-party sites.
- Results JSON is written under `load-tests/results/`.
