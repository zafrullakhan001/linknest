# In-app App Updates (GitHub commits + Releases)

LinkNest can check your GitHub repository for **new commits** on a tracked branch and for versioned **Releases**, then apply them from the Admin UI — without manually copying a deploy ZIP.

Also in-app: **Help & About → Help → In-app App Updates** and **Guides → App Updates**.

The App Updates dialog is **movable and resizable** on desktop (drag the header; resize from the bottom-right corner). While an update runs, **progress stays sticky at the top** of the panel so you do not need to scroll to monitor it.

**Scope:** XAMPP / filesystem installs, and Docker when the image includes Node.js (in-container commit apply rebuilds `dist/`). Office hosts without Node should apply a **Release** ZIP.  
**Who:** Admins only.

---

## Office playbook (ArchLinks + ERP3 + any folder) — recommended

Use this when you have **more than one** install on the same server (e.g. `D:\Apache\htdocs\ArchLinks` and `D:\Apache\htdocs\ERP3`). One portable Release updates both without baking `/linknest` or `/ArchLinks` into the JS bundle.

### Why Releases (not only commits)

| Piece | Commit zipball | Release (`linknest-update-vX.Y.Z.zip`) |
|-------|----------------|----------------------------------------|
| PHP / `api/` | Yes | Yes |
| `utils/`, `components/`, `constants/` | Yes (allow-list) | Yes |
| Built UI (`dist/`) | **No** (`dist/` is gitignored) | **Yes** (built on publish) |
| `bin/` ttyd + OpenSSH + Python | **No** | **Yes** (ttyd, portable OpenSSH, embeddable CPython + websockify) |
| Works without Node on office | API only; **widgets stay old** | Full UI + widgets |

The browser loads **`dist/`**, not raw `.tsx`. Zip-mode office hosts usually have **no Node**, so applying a commit alone leaves the old SSH/VNC widget UI.

### A. On the build PC (once per version)

**Easiest:** double-click [`publish-base-release.bat`](../publish-base-release.bat) in the repo root. It bumps the patch version, pushes the current branch, and publishes a **portable** Release (Vite base `./`).

```bat
publish-base-release.bat
publish-base-release.bat -Yes
publish-base-release.bat -Bump minor
publish-base-release.bat -Version 2.4.0
```

Auth uses `GITHUB_TOKEN` / `GH_TOKEN`, `gh auth login`, or Git Credential Manager (the same login as `git push`).

Manual equivalent (do **not** pass `-BasePath "/linknest"`):

```powershell
cd C:\xampp\htdocs\linknest
$env:GITHUB_TOKEN = 'ghp_YOUR_TOKEN'   # classic PAT, repo scope
.\scripts\publish-update-release.ps1 -Version 2.3.2
```

That builds `dist/` with Vite base `./` so the same ZIP works under `/ArchLinks`, `/ERP3`, `/linknest`, etc. API calls resolve at runtime from the browser path.

**Avoid** unless you truly have a single folder forever:

```powershell
.\scripts\publish-update-release.ps1 -Version 2.3.2 -BasePath "/ArchLinks"   # breaks ERP3 if reused
.\scripts\publish-update-release.ps1 -Version 2.3.2 -BasePath "/linknest"     # breaks ArchLinks/ERP3
```

### B. On each office instance (ArchLinks, then ERP3, …)

1. Sign in as admin → **App Updates** (nav bell or **Admin → Tools → App Updates**).
2. Settings: GitHub repo + PAT if private; **Track branch** = `updater` (or your branch) → **Save**.
3. **Check for updates**.
4. Select the new **Release** `v2.3.2` (not only a commit) → leave **Back up database** on → **Update**.
5. When finished: **Ctrl+F5** (hard refresh).

Repeat step B on the other folder (`ERP3`, etc.) with the **same** Release.

### C. Optional: rebuild on the server with Node

Only if you must apply a commit without a Release, or to repair a wrong base path:

```powershell
cd D:\Apache\htdocs\ArchLinks   # or ERP3
$env:VITE_BASE_PATH = "./"
$env:VITE_API_BASE = "./api"
npm ci
npm run build:prod
```

Then Ctrl+F5. Do **not** set `VITE_BASE_PATH=/linknest` on ArchLinks/ERP3.

### Quick decision

| Goal | Do this |
|------|---------|
| Update widgets/UI on office zip installs | Publish portable Release → apply **Release** on each instance |
| Update PHP/API only | Commit apply can work; UI may stay old |
| ArchLinks **and** ERP3 | One portable Release, apply twice (once per folder) |
| Fix 404 `/linknest/assets/...` under ArchLinks | Wrong bake — rebuild with `./` or apply a portable Release |

---

## How updates work

| Source | When it appears | Apply |
|--------|-----------------|--------|
| **Commits** on track branch (default `main`) | Pushes **after** the applied Release tag / git HEAD — not the stale SHA inside `BUILD_INFO.json` | Checkout / zipball that commit + rebuild |
| **GitHub Releases** (`vX.Y.Z`) | Tag newer than installed `appVersion` | Tag checkout or `linknest-update-*.zip` |

Both **preserve** `data/` and `uploads/` (except when you explicitly restore a DB snapshot). Before each update, the current install is recorded in **rollback history** (last **10** entries).

| Install type | Mode |
|--------------|------|
| Git checkout with Node.js | **git** — `git fetch` + checkout commit/tag, then `npm ci` / `npm run build:prod` (portable `./` base by default) |
| Packaged XAMPP (no `.git`) | **zip** — release asset if present, otherwise GitHub **zipball** of the commit/tag (rebuilds if Node is available) |

On Windows/XAMPP, apply/rollback usually runs **inline** under Apache (more reliable than detached SYSTEM workers).

---

## Change preview

When you select a commit or release, App Updates loads a **change preview**:

| Field | Meaning |
|-------|---------|
| Files | Paths + status (`A` add, `M` modify, `D` delete, `R` rename) |
| Size | Approximate payload from line deltas (estimate) |
| ETA | Heuristic duration (fetch + checkout + optional frontend rebuild) |
| Rebuild | Whether frontend rebuild is expected |

API: `GET /api/updater/preview?sha=…` or `?tag=…`  
ETA and size are **estimates**, not guarantees.

---

## Database snapshots

Before apply, a checkbox **Back up database before updating** is **on by default**.

- Copies `data/linknest.db` (after WAL checkpoint) into `data/updater-snapshots/<id>/`
- Meta: `meta.json` (created time, commit, version, size)
- Retention: last **10** snapshots (older ones pruned)

Snapshots are linked on the history entry (`dbSnapshotId`) so you can restore **code + data** together.

---

## Admin: apply an update

1. Sign in as an admin.
2. Open **App Updates** (nav bell, or **Admin → Tools → App Updates**).
3. If the repo is **private**, paste a GitHub [classic PAT](https://github.com/settings/tokens/new?scopes=repo&description=LinkNest%20Updater) with **`repo`** scope → **Save settings**.
4. Set **Track branch** (e.g. `main` or `updater`) → Save → **Check for updates**.
5. Select a **commit** or **release** (nothing is applied until you confirm **Update**). Prefer a **Release** for office UI/widgets.
6. Leave **Back up database** checked (recommended), then **Update**.
7. When finished, **Reload app** (Ctrl+F5).

**Local-only commits:** If you committed on this XAMPP machine but have not pushed to `origin/<track-branch>`, App Updates still lists them with a **local only** badge and a warning to push (`git push origin HEAD:updater`). Remote compares alone will show “up to date” until you push.

---

## Rollback (selectable snapshots)

1. Open App Updates → **Rollback snapshots**.
2. Each row shows **date/time**, version, short SHA, and whether a **DB backup** exists.
3. Select the snapshot to restore.
4. Optionally check **Also restore database** (only if that entry has a DB backup).
5. Confirm **Restore this snapshot**.

- Current state is pushed onto history before the restore (so you can reverse the rollback).
- History entries are kept for audit (not popped); pruned to **10**.

API: `POST /api/updater/rollback` with `{ "historyId": "…", "restoreDatabase": true }`.

---

### Git mode notes

- Local uncommitted changes are overwritten via `git checkout --force` (prefer a clean tree when possible)
- `git`, `node`, and `npm` on PATH
- Private remotes use the saved PAT (HTTP Basic) so SYSTEM/Apache does not hang on credential prompts
- Rebuild uses portable Vite base `./` unless `.env` sets an absolute `/FolderName`

### ZIP mode requirements

- PHP `ZipArchive` + cURL
- Prefer Releases with `linknest-update-vX.Y.Z.zip`
- Commit zipballs do not include `dist/`; without Node the UI stays old
- Extract allow-list includes `api/`, `dist/`, `components/`, `services/`, `utils/`, `constants/`, `styles/`, `App.tsx`, `types.ts`, `index.css`, etc. (not `data/` / `uploads/`)

### Frontend / SSH & VNC widgets

The browser loads the built UI from **`dist/`** (not raw `components/*.tsx`).

| Install | How widget UI updates arrive |
|---------|------------------------------|
| **git** mode + Node.js/npm | Apply a **commit** → updater runs `npm ci` + `npm run build:prod` → new widgets appear |
| **zip** mode (typical office XAMPP, no Node) | Apply a **GitHub Release** from `publish-update-release.ps1` (includes `dist/`) |

If a commit apply rebuild fails with a **Browserslist / caniuse-lite is N months old** message, that text is usually a stderr warning, not the real failure. Prefer applying a **Release** (prebuilt `dist/`) instead of a bare commit. Updater rebuilds also set `BROWSERSLIST_IGNORE_OLD_DATA=1` so that warning does not mask success.

---

## Publisher: create a versioned release

Double-click **`publish-base-release.bat`** in the repo root (portable `./` base, auto patch bump). Extra flags go to [`scripts/publish-base-release.ps1`](../scripts/publish-base-release.ps1).

```powershell
cd C:\xampp\htdocs\linknest
.\scripts\publish-base-release.ps1 -Yes
# or, if you already set the version and only want to package + tag:
$env:GITHUB_TOKEN = 'ghp_YOUR_TOKEN'
.\scripts\publish-update-release.ps1 -Version 2.3.2
# default -BasePath relative  → portable for ArchLinks / ERP3 / any folder
```

- Auto release notes from git commits since the previous tag  
- Uploads `linknest-update-vX.Y.Z.zip` (includes built frontend)  
- See script help for `-SkipPackage`, `-UpdateNotesOnly`, `-NotesFile`, `-DryRun`, `-BasePath`

---

## Settings (Admin → App Updates)

| Setting | Default | Notes |
|---------|---------|--------|
| GitHub repo | auto from `git remote` | `owner/name` |
| Track branch | `main` | Use `updater` if that is where you push office features |
| Check interval (minutes) | `360` (UI often suggests `30`) | Cache TTL |
| GitHub token | _(empty)_ | Required for private repos; encrypted |

Env (optional): `GITHUB_TOKEN` / `GH_TOKEN`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `GitHub returned 404` | Save a `repo`-scoped PAT |
| No commits listed | Confirm track branch; ensure installed `gitCommit` is an ancestor of that branch |
| Shows 100+ commits after applying the latest Release | Stale `BUILD_INFO.gitCommit` from the zipball. Check for updates again (compares against the Release tag). Apply this updater fix, then **Check for updates**. |
| Stuck at 0% / “already in progress” | Wait ~45s for stale-job clear, or restart Apache; retry |
| Dubious ownership / hung fetch | Updater injects `safe.directory` + PAT; ensure token is saved |
| Rollback has no DB option | That snapshot was created with backup unchecked |
| UI / SSH widget still old after commit | Zip mode: apply a **portable Release**, not only a commit; Ctrl+F5 |
| 404 `/linknest/assets/...` under ArchLinks or ERP3 | Release baked wrong base — publish with default `relative`, or rebuild with `VITE_BASE_PATH=./` |
| Build fails: `buildSshLinkUrl` is not exported | Old bug: zip skipped `utils/` — fixed in updater allow-list; re-apply a Release that includes `utils/sshLink.ts` |
| Build fails: `Could not resolve "./styles/tinymce-wysiwyg.css"` | Zip allow-list omitted `styles/`; TinyMCE display CSS now lives in `index.css`. Re-apply this update (or a Release). |
| Build fails: `Could not resolve "../constants/mcpExamplePrompts"` | Zip allow-list omitted `constants/`. MCP example prompts now live in `utils/mcpExamplePrompts.ts` (already allowed). Re-apply this update (or a Release). |
| Update failed: could not rebuild dist | Expected without Node on office XAMPP — publish/apply a Release instead. In Docker this no longer aborts; run `redeploy-docker.bat` to refresh the UI. |
| `Failed writing scripts/data/` | Empty ZIP folder entry on Windows; fixed in **v2.3.5**. Do not retry v2.3.4 — apply **Release v2.3.5** |
| `Failed writing scripts/__pycache__/*.pyc` | Python bytecode in the zip, often root-owned in Docker. Updater now skips `__pycache__`; retry the update. |
| UI still old | Ctrl+F5; check `BUILD_INFO.json` and that `dist/assets/*.js` timestamps changed |

---

## Related

- Packager: [`package-for-deployment.ps1`](../package-for-deployment.ps1) / [`package-for-deployment.bat`](../package-for-deployment.bat) — [PACKAGE_FOR_DEPLOYMENT.md](PACKAGE_FOR_DEPLOYMENT.md)
- Windows new-host bundles (Apache + PHP runtime + app ZIP, GitHub tag `apache-php85-runtime`): [`publish-windows-bootstrap-bundles.bat`](../publish-windows-bootstrap-bundles.bat) — [WINDOWS_BOOTSTRAP_BUNDLES.md](WINDOWS_BOOTSTRAP_BUNDLES.md)
- Publish script: [`publish-base-release.bat`](../publish-base-release.bat) / [`../scripts/publish-base-release.ps1`](../scripts/publish-base-release.ps1) / [`../scripts/publish-update-release.ps1`](../scripts/publish-update-release.ps1)
- SSH / VNC deploy: [`REMOTE_WIDGETS_MANUAL_DEPLOY.md`](REMOTE_WIDGETS_MANUAL_DEPLOY.md)
- Production layout: [`PRODUCTION.md`](PRODUCTION.md)
