# In-app App Updates (GitHub commits + Releases)

LinkNest can check your GitHub repository for **new commits** on a tracked branch and for versioned **Releases**, then apply them from the Admin UI — without manually copying a deploy ZIP.

**Scope:** XAMPP / filesystem installs only (not Docker in-container updates).  
**Who:** Admins only.

---

## How updates work

| Source | When it appears | Apply |
|--------|-----------------|--------|
| **Commits** on track branch (default `main`) | Every new push ahead of the installed SHA | Checkout / zipball that commit + rebuild |
| **GitHub Releases** (`vX.Y.Z`) | Tag newer than installed `appVersion` | Tag checkout or `linknest-update-*.zip` |

Both **preserve** `data/` and `uploads/` (except when you explicitly restore a DB snapshot). Before each update, the current install is recorded in **rollback history** (last **10** entries).

| Install type | Mode |
|--------------|------|
| Git checkout with Node.js | **git** — `git fetch` + checkout commit/tag, then `npm ci` / `npm run build` |
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
5. Select a **commit** or **release** (nothing is applied until you confirm **Update**).
6. Leave **Back up database** checked (recommended), then **Update**.
7. When finished, **Reload app**.

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

### ZIP mode requirements

- PHP `ZipArchive` + cURL
- Prefer Releases with `linknest-update-vX.Y.Z.zip`; commit updates use source zipball + rebuild when Node exists

### Frontend / SSH & VNC widgets (important)

The browser loads the built UI from **`dist/`** (not raw `components/*.tsx`).

| Install | How widget UI updates arrive |
|---------|------------------------------|
| **git** mode + Node.js/npm | Apply a **commit** → updater runs `npm ci` + `npm run build` → new widgets appear |
| **zip** mode (typical office XAMPP, no Node) | Apply a **GitHub Release** built with `scripts/publish-update-release.ps1` (ZIP includes `dist/`). Applying a commit zipball alone **cannot** refresh the SSH widget UI. |

**Office checklist (SSH Copy ssh://, connection isolation, Help guides, etc.):**

1. On the build PC, checkout/push the branch you track (e.g. `updater`).
2. Set App Updates **Track branch** to that branch on the office server → Save → Check for updates.
3. Publish a release that includes `dist/`:

```powershell
cd C:\xampp\htdocs\linknest
$env:GITHUB_TOKEN = 'ghp_YOUR_TOKEN'
.\scripts\publish-update-release.ps1 -Version 2.3.0
```

4. In office App Updates, select the new **Release** (not only the commit) → Update → hard-refresh (Ctrl+F5).

If the update log says rebuild skipped/failed, the old `dist/` is still serving — that is why the SSH widget looked unchanged.

---

## Publisher: create a versioned release (required for office widgets)

Mini commit updates work for **API/PHP** on zip installs, but **widget UI** needs a Release that includes `dist/`.

```powershell
cd C:\xampp\htdocs\linknest
$env:GITHUB_TOKEN = 'ghp_YOUR_TOKEN'
.\scripts\publish-update-release.ps1 -Version 2.3.0
```

- Auto release notes from git commits since the previous tag  
- Uploads `linknest-update-v2.3.0.zip` (includes built frontend)  
- See script help for `-SkipPackage`, `-UpdateNotesOnly`, `-NotesFile`, `-DryRun`

---

## Settings (Admin → App Updates)

| Setting | Default | Notes |
|---------|---------|--------|
| GitHub repo | auto from `git remote` | `owner/name` |
| Track branch | `main` | Branch used for mini commit updates |
| Check interval (minutes) | `360` (UI often suggests `30`) | Cache TTL |
| GitHub token | _(empty)_ | Required for private repos; encrypted |

Env (optional): `GITHUB_TOKEN` / `GH_TOKEN`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `GitHub returned 404` | Save a `repo`-scoped PAT |
| No commits listed | Confirm track branch name; ensure installed `gitCommit` in `BUILD_INFO.json` is an ancestor of that branch |
| Stuck at 0% / “already in progress” | Wait ~45s for stale-job clear, or restart Apache; retry |
| Dubious ownership / hung fetch | Updater injects `safe.directory` + PAT; ensure token is saved |
| Rollback has no DB option | That snapshot was created with backup unchecked |
| UI still old after commit update | Zip mode without Node: apply a **Release** with `dist/` (`publish-update-release.ps1`), then Ctrl+F5 |
| UI still old | Ctrl+F5; check `BUILD_INFO.json` and that `dist/assets/*.js` timestamps changed |

---

## Related

- Packager: [`package-for-deployment.ps1`](../package-for-deployment.ps1) / [`package-for-deployment.bat`](../package-for-deployment.bat) — full options in [PACKAGE_FOR_DEPLOYMENT.md](PACKAGE_FOR_DEPLOYMENT.md)
- Publish script: [`../scripts/publish-update-release.ps1`](../scripts/publish-update-release.ps1)
- Production layout: [`PRODUCTION.md`](PRODUCTION.md)
