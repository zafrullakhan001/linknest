# Deploy LinkNest to a Linux VPS (nginx + PHP-FPM + OpenLDAP)

One command builds the app on this PC and installs/updates it on a Debian/Ubuntu VPS,
including a private **OpenLDAP** directory that LinkNest authenticates against.

**Launcher:** [`deploy-vps-linknest.bat`](../deploy-vps-linknest.bat)
**Engine:** [`scripts/deploy-vps-linknest.ps1`](../scripts/deploy-vps-linknest.ps1)
**Server-side steps:** [`scripts/vps/`](../scripts/vps/)

---

## 1. Quick start

Put the server right next to the script:

```bat
deploy-vps-linknest.bat root@198.251.72.41
```

That is all that is normally needed. The deployer:

1. checks local tools (`node`, `npm`, `ssh`, `scp`, `tar`, `php`), the SSH connection and the remote host,
2. detects whether LinkNest is already installed and picks **Update** (keeps data) or **Fresh**,
3. builds the SPA for a domain-root deploy (`VITE_BASE_PATH=/`, `VITE_API_BASE=/api`) into `dist-vps/`,
4. (fresh only) snapshots the local SQLite database with `VACUUM INTO` and ships `data/.encryption_key`,
5. stages and tars a bundle, uploads it, and writes `deploy.env` on the server,
6. runs the remote steps - app/user -> php-fpm -> nginx+TLS -> OpenLDAP -> wire LDAP -> verify,
7. prints a summary (URL, credential locations, how to add users).

The hostname defaults to `linknest.<ip-with-dashes>.nip.io` (for example
`linknest.198-251-72-41.nip.io`), which resolves publicly without any DNS work; a Let's Encrypt
certificate is issued automatically.

---

## 2. Requirements

**On this PC (Windows):** Node.js 20+, `npm install` run once, the OpenSSH client (`ssh`/`scp`),
`tar` (bundled with Windows 10+) and PHP in `PATH` when a fresh deploy imports the local database.

**On the VPS:** Ubuntu/Debian with **nginx**, **PHP-FPM** (`phpX.Y-fpm`) and **certbot**, plus
passwordless `root` SSH access. `pm.max_children` defaults to 3; raise it with `-MaxChildren` after
checking `free -m` and per-worker RSS.

---

## 3. Options

```bat
deploy-vps-linknest.bat <user@host> [options]
```

| Option | Default | Meaning |
|---|---|---|
| *(positional)* | `root@198.251.72.41` | VPS target (`user@host`) |
| `-Domain` | `linknest.<ip>.nip.io` | public hostname; the certificate is issued for it |
| `-AppUser` | `linknest` | Linux service account that owns and executes the app |
| `-AppRoot` | `/home/<AppUser>/htdocs` | install directory |
| `-Mode` | `Auto` | `Auto` (detect), `Fresh` (install), `Update` (code only) |
| `-Force` | off | allow `-Mode Fresh` over an existing install |
| `-ExcludeDatabase` | off | a fresh deploy starts with an empty database |
| `-SkipBuild` | off | reuse the existing `dist-vps/` |
| `-SkipUpload` | off | reuse the already uploaded tarball |
| `-SkipVerify` | off | skip step 90 |
| `-SkipOpenLdap` | off | do not install/configure OpenLDAP |

---

## 4. Fresh vs Update

| | Fresh | Update |
|---|---|---|
| Trigger | app not installed at `-AppRoot` | `-AppRoot/api/index.php` exists (`-Mode Auto`) |
| Ships | full tree | code only |
| `data/` (SQLite DB, snapshots, cache) | local snapshot + `data/.encryption_key` | **kept on the server** |
| `uploads/` | shipped | **kept on the server** |
| Use for | first install, new server, migrating data | shipping code changes |

`-Mode Fresh` against an existing install is refused unless `-Force` is passed, so a re-run can never
silently wipe a production database.

**Important:** a fresh deploy copies `data/linknest.db` and `data/.encryption_key` together. The key
decrypts stored secrets (SMTP, SAML, LDAP bind password) - never ship the database without it.

---

## 5. What is created on the server

```
/home/<user>/htdocs                     app (dist/, api/, data/, uploads/, docs/, vendor/, ...)
/home/<user>/sessions                   PHP session files for this pool
/etc/php/<ver>/fpm/pool.d/<user>.conf   dedicated FPM pool + socket
/etc/nginx/sites-available/linknest     vhost (HTTP->HTTPS, ACME, SPA + API routing, deny rules)
/etc/nginx/sites-enabled/linknest       symlink
/etc/letsencrypt/live/<domain>/         Let's Encrypt certificate (auto-renewed)
/var/log/nginx/linknest.{access,error}.log
/root/linknest-deploy/                  deploy.env, steps, credentials, uploaded tarball
```

The vhost denies `/data/`, `/config/`, `/scripts/`, `/logs/`, `/vendor/`, `/analytics/`,
`/migrations/`, `/monitorv2/` and dotfiles, never executes PHP inside `uploads/`, serves the SPA from
`dist/`, routes `/api/*` to the PHP front controller, resolves `/s/<code>` short links, and keeps the
legacy `/linknest/uploads/...` paths that exist inside imported databases working.

Nothing else on the host is modified: the deployer only adds a system user, one FPM pool file and one
nginx site file, and validates `nginx -t` before every reload.

---

## 6. OpenLDAP

Enabled by default. On the VPS it:

1. installs `slapd` + `ldap-utils` non-interactively (debconf preseed, suffix `-LdapBaseDn`),
2. restricts the listener to **loopback only** (`SLAPD_SERVICES="ldap://127.0.0.1:389/ ldapi:///"`),
3. loads the `memberof` overlay so entries expose AD-style `memberOf`,
4. tightens ACLs: anonymous denied, only the LinkNest service account may read,
5. creates `ou=people`, `ou=groups`, `ou=services` and the bind account `cn=linknest,ou=services,...`,
6. points LinkNest at it (`ldap_server=127.0.0.1`, filter `(uid={username})`, `mail` / `displayName`
   attribute mapping, 5 s timeout - both the flat `ldap_*` keys and the `ldap_servers` JSON) with the
   bind password encrypted by the app itself (AES-256-GCM).

Credentials on the server (root-only, `chmod 600`):

| File | Contents |

---

## 7. After a deploy

* open `https://<domain>/` and sign in (imported users keep their existing credentials),
* for LDAP-only accounts: hand out the passwords from `openldap-user-passwords.csv` and approve them,
* point `smtp_host` at a real relay (the imported `localhost:1025` only exists on a dev machine),
* the Python monitor/email workers in `scripts/` need a systemd timer or cron if you want scheduled
  link checks; the in-app updater (Admin -> App Updates) is Windows-oriented, so ship updates with this
  deployer instead,
* Apache-only features (Apache monitor dashboard, `mod_status`) do not apply on nginx.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `cannot ssh into root@...` | check the SSH key; `ssh root@host` must work without a password |
| `no /etc/php/*/fpm found` | install PHP-FPM on the VPS (`apt-get install -y php8.5-fpm`) |
| `certbot is not installed` / certificate failed | `apt-get install -y certbot`; make sure the hostname resolves to this server (nip.io does automatically for its own IP) |
| `a LinkNest install already exists ... Use -Mode Update` | expected guard - use `-Mode Update`, or `-Force` to overwrite |
| `vite is not installed` | run `npm install` in the project root first |
| npm TLS errors (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`) | the deployer calls the local Vite binary directly and does not need the npm registry |
| deploy stops mid-way | every step is idempotent - fix the cause and re-run the same command |
| LDAP login returns 403 | the account is not approved yet (Admin -> Users) |
| LDAP login returns 401 | wrong password, or the bind password is out of sync - re-run the deployer (steps 40/50 rewrite the settings) |
| settings changes not visible | `rm -f /home/<user>/htdocs/data/cache/*.json && systemctl reload php8.5-fpm` |

Verify at any time:

```bat
ssh root@198.251.72.41 "bash /root/linknest-deploy/vps/step90-verify.sh"
```

---

## 9. Rollback

```bat
ssh root@198.251.72.41 "rm /etc/nginx/sites-enabled/linknest /etc/nginx/sites-available/linknest /etc/php/8.5/fpm/pool.d/linknest.conf && systemctl reload nginx php8.5-fpm"
ssh root@198.251.72.41 "certbot delete --cert-name <domain>"
ssh root@198.251.72.41 "userdel -r linknest"        :: also removes the app directory
```

OpenLDAP rollback (only if it is no longer needed):

```bash
systemctl disable --now slapd
apt-get remove --purge -y slapd ldap-utils
cp /root/linknest-deploy/default-slapd.bak.* /etc/default/slapd
```

The local `linknest-vps-<stamp>.tar.gz` is kept after every run as the redeploy/rollback artefact.

---

## 10. File reference

| Path | Purpose |
|---|---|
| `deploy-vps-linknest.bat` | Windows launcher (`deploy-vps-linknest.bat root@host [options]`) |
| `scripts/deploy-vps-linknest.ps1` | build + bundle + upload + orchestrate |
| `scripts/vps/env.sh` | shared variables/helpers for the remote steps |
| `scripts/vps/facts.sh` | remote host detection (OS, nginx, PHP, certbot, slapd, disk, RAM) |
| `scripts/vps/step10-app.sh` | service user, code tree, permissions |
| `scripts/vps/step20-php-fpm.sh` | FPM pool from `templates/linknest-fpm.conf` |
| `scripts/vps/step30-nginx.sh` | ACME/HTTP phase, certificate, HTTPS vhost from `templates/nginx-linknest.conf` |
| `scripts/vps/step40-openldap.sh` | slapd install/harden/overlay/ACL/provision |
| `scripts/vps/step50-wire-ldap.sh` | write the LinkNest LDAP settings (`linknest-ldap-settings.php`) |
| `scripts/vps/step90-verify.sh` | post-deploy verification |
| `scripts/openldap-add-user.sh` | add/reset an LDAP user (copied to the server) |
| `scripts/openldap-provision-linknest.sh` | create OUs + service account in an existing slapd |
| `docs/OPENLDAP_VPS.md` | OpenLDAP runbook (credentials, users, TLS, rollback) |

|---|---|
| `/root/linknest-deploy/openldap-admin-password.txt` | `cn=admin,<base>` |
| `/root/linknest-deploy/openldap-linknest-service-password.txt` | service bind account (also stored encrypted in the app) |
| `/root/linknest-deploy/openldap-user-passwords.csv` | `username,password,dn` for created users |

Add or reset a user:

```bat
ssh root@198.251.72.41 "/root/linknest-deploy/openldap-add-user.sh jdoe \"John Doe\""
ssh root@198.251.72.41 "/root/linknest-deploy/openldap-add-user.sh jdoe \"John Doe\" john.doe@oneflorida.org MyPassword"
```

The helper hashes the password with `slappasswd` (SSHA), creates the `inetOrgPerson`, adds it to
`cn=linknest-users` (creating the group when missing), records the password in the CSV and verifies the
credentials with `ldapwhoami`.

**First-login approval:** LinkNest auto-creates the app account on the first successful LDAP login but
leaves it unapproved - an admin must approve it once in **Admin -> Users**, otherwise the user sees
"pending admin approval". There is no auto-approve setting.

More detail (reset/delete users, exposing LDAP with TLS, troubleshooting): [OPENLDAP_VPS.md](OPENLDAP_VPS.md).

| `-LdapBaseDn` | `dc=oneflorida,dc=org` | LDAP suffix (must match an existing directory if one is present) |
| `-LdapDomain` | `oneflorida.org` | login/mail domain (`user@domain` logins are accepted) |
| `-LdapAdminPassword` | generated | `cn=admin,<base>` password (stored root-only on the server) |
| `-LdapServicePassword` | generated | bind account password used by the app |
| `-LeEmail` | ACME account | contact address for a brand-new ACME account |
| `-MaxChildren` / `-MemoryLimit` | `3` / `384M` | PHP-FPM pool sizing |
| `-DryRun` | off | print the plan and exit without touching anything |
| `-Yes` | off | skip the confirmation prompt |

Examples:

```bat
deploy-vps-linknest.bat root@198.251.72.41                          :: deploy or update
deploy-vps-linknest.bat root@198.251.72.41 -Mode Update              :: force an update
deploy-vps-linknest.bat root@198.251.72.41 -Domain links.acme.com    :: real domain
deploy-vps-linknest.bat root@198.251.72.41 -SkipOpenLdap -LeEmail me@acme.com
deploy-vps-linknest.bat root@198.251.72.41 -ExcludeDatabase -MaxChildren 6
deploy-vps-linknest.bat root@198.251.72.41 -DryRun
```
