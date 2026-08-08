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

Both **preserve** `data/` and `uploads/`. Before each update, the current install is pushed onto a **rollback history** stack (last 20 snapshots).

| Install type | Mode |
|--------------|------|
| Git checkout with Node.js | **git** — `git fetch` + checkout commit/tag, then `npm ci` / `npm run build` |
| Packaged XAMPP (no `.git`) | **zip** — release asset if present, otherwise GitHub **zipball** of the commit/tag (rebuilds if Node is available) |

---

## Admin: apply an update

1. Sign in as an admin.
2. Open **App Updates** (nav bell, or **Admin → Tools → App Updates**).
3. If the repo is **private**, paste a GitHub [classic PAT](https://github.com/settings/tokens/new?scopes=repo&description=LinkNest%20Updater) with **`repo`** scope → **Save settings**.
4. Set **Track branch** (e.g. `main` or `updater`) → Save → **Check for updates**.
5. Select a **commit** (mini update) or a **release**, then **Update**.
6. When finished, **Reload app**.

### Rollback

1. Open App Updates.
2. Click **Rollback** (enabled when a previous snapshot exists).
3. Confirms restoring the previous SHA / version from local history (re-fetches that commit from GitHub).
4. Current state is saved so you can roll forward again if needed.

### Git mode requirements

- Clean working tree (uncommitted changes are refused)
- `git`, `node`, and `npm` on PATH

### ZIP mode requirements

- PHP `ZipArchive` + cURL
- Prefer Releases with `linknest-update-vX.Y.Z.zip`; commit updates use source zipball + rebuild when Node exists

---

## Publisher: create a versioned release (optional)

Mini commit updates do **not** require a Release — push to the tracked branch is enough.

For stable/semver packages (especially ZIP installs without Node):

```powershell
cd C:\xampp\htdocs\linknest
$env:GITHUB_TOKEN = 'ghp_YOUR_TOKEN'
.\scripts\publish-update-release.ps1 -Version 2.3.0
```

- Auto release notes from git commits since the previous tag  
- Uploads `linknest-update-v2.3.0.zip`  
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
| Dirty tree | Commit or stash before update/rollback |
| Rollback disabled | Apply at least one update first (creates a history snapshot) |
| UI still old | Ctrl+F5; check `BUILD_INFO.json` |

---

## Related

- Packager: [`package-for-deployment.ps1`](../package-for-deployment.ps1)
- Publish script: [`../scripts/publish-update-release.ps1`](../scripts/publish-update-release.ps1)
- Production layout: [`PRODUCTION.md`](PRODUCTION.md)
