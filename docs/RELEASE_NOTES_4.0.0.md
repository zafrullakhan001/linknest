# LinkNest 4.0.0 — Release Notes (major)

**Release:** `v4.0.0` · **Branch:** `linknest-enhancements2` · **Date:** 2026-11-02
**Database:** `LINKNEST_SCHEMA_VERSION` **106 → 114** (automatic, additive, idempotent)
**Frontend build:** portable Vite base `./` (works under `/linknest`, `/ArchLinks`, `/ERP3`, any folder)

This is the next **major** release after 3.0.0. No breaking changes: existing installs keep their
database, uploads, settings, and users. The first request after the update runs the idempotent
patch pass once (schema cache moves from `schema_patches_v106.ok` to `schema_patches_v114.ok`).

---

## 1. What ships in 4.0.0

Everything landed on `linknest-enhancements2` since `v3.0.0`:

| Area | Highlights |
|------|------------|
| **Message Board** | Per-tab messages, show on the space card, banner above or below the tabs, font family and size, marquee speed with a seamless loop |
| **Two-factor authentication** | Optional per-user TOTP after a Local or LDAP password, recovery codes, 30-day trusted browsers, admin reset |
| **Archive and Recycle Bin** | Archived-space banner (date and who archived it) and a read-only preview of soft-deleted spaces with Restore or Delete forever |
| **Space sync** | Pull an imported space from the instance it was exported from |
| **Link topics** | Information, Notes, and Maintenance topics on each link, with revision history |
| **System Runtime** | Read-only PHP, Node.js, web server, and SQLite versions plus vendor patch guidance (Admin → Tools → System Runtime) |
| **Speed test** | Internet, this server, or a custom server, with an allow-list for server-proxy probes |
| **Mobile** | Mobile widgets and a clearer space-page action bar for signed-in users |
| **Monitoring** | Recovery emails include downtime details; updater jobs are audited |
| **Sharing** | Share counts, email shown next to people in the share dialog |

See **Help & About → About → What’s New in 4.0.0** for the in-app summary.

---

## 2. Database changes (schema 107–114)

All of these are additive columns or tables in `api/config.php`. `schema_releases` records each
version the first time it is applied, with `LINKNEST_APP_VERSION` `4.0.0`.

| Schema | Change |
|--------|--------|
| 107 | Message Board tab scoping (`tile_messages.tab_ids`, `tile_messages.show_on_card`) |
| 108 | Banner placement (`tile_messages.placement`: above or below the tabs) |
| 109 | Message fonts and marquee speed (`font_family`, `font_size`, `marquee_seconds`) |
| 110 | Per-user TOTP (`user_two_factor`, `user_two_factor_devices`) |
| 111 | Archive banner actor (`tiles.archived_by`, `tiles.archived_by_username`) |
| 112 | Cross-instance space sync (`tiles.sync_source_*`, `sync_source_id` on tabs, sections, and links) |
| 113 | Per-link Information topics (`links.info_topics`, `link_info_revisions`) |
| 114 | Per-link Notes and Maintenance topics (`links.notes_topics`, `links.maintenance_topics`, revision `kind`) |

**Rollback:** restoring the pre-update database snapshot reverses the new tables and columns.
In-app App Updates snapshots the database before apply when **Back up database** is checked.

---

## 3. Apply on office instances (ArchLinks, ERP3, …)

1. Admin → **App Updates** → Settings: repo `zafrullakhan001/linknest`, GitHub PAT if private,
   **Track branch** `linknest-enhancements2`.
2. **Check for updates**.
3. Select Release **`v4.0.0`** (not only a commit) → leave **Back up database** checked → **Update**.
4. **Ctrl+F5** once the update finishes.
5. Repeat on each folder with the same Release.

Portable base means one ZIP updates every folder — see [APP_UPDATES.md](APP_UPDATES.md).

---

## 4. Upgrade / compatibility notes

* **No breaking changes.** Existing spaces, users, uploads, and settings are kept.
* One-time slower first request per install after the schema bump (patch pass), as with every prior bump.
* Docker installs: rebuild with `redeploy-docker.bat` (in-app commit apply does not refresh a Docker UI by itself).
* `BUILD_INFO.json` is stamped `4.0.0` / `v4.0.0` / `trackBranch: linknest-enhancements2`. The published ZIP is restamped at pack time.

---

## 5. Related

* [APP_UPDATES.md](APP_UPDATES.md) — in-app updates, portable Releases, rollback history
* [RELEASE_NOTES_3.0.0.md](RELEASE_NOTES_3.0.0.md) — previous major release
* [TWO_FACTOR_AUTH.md](TWO_FACTOR_AUTH.md) — TOTP enrolment, recovery codes, trusted browsers
* [SPACE_SYNC.md](SPACE_SYNC.md) — pull an imported space from its source instance
* [SPACE_LIFECYCLE_BANNERS.md](SPACE_LIFECYCLE_BANNERS.md) — Archive and Recycle Bin banners
* [MESSAGE_BOARD_TABS.md](MESSAGE_BOARD_TABS.md) — tab scoping, placement, fonts, marquee
* [RUNTIME_UPDATES.md](RUNTIME_UPDATES.md) — System Runtime panel
* [SPEED_TEST.md](SPEED_TEST.md) — custom server speed tests
