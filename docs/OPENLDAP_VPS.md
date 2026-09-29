# OpenLDAP on the LinkNest VPS

Local **OpenLDAP (slapd)** instance that LinkNest authenticates against on
`https://linknest.198-251-72-41.nip.io` (VPS `198.251.72.41`).

This replaces the previous setup where LinkNest pointed at the corporate Active
Directory (`ldap_server = 192.168.5.173`), which the VPS cannot reach — every login
used to stall ~3 s on that timeout before falling back to local auth.

---

## 1. What is installed

| Item | Value |
|------|-------|
| Packages | `slapd 2.6.10`, `ldap-utils` (Ubuntu 26.04) |
| Service | `slapd.service` (enabled at boot, `systemctl restart slapd`) |
| Listener | **`127.0.0.1:389` only** (`ldap://127.0.0.1:389/ ldapi:///` in `/etc/default/slapd`) — *not* reachable from the internet |
| Base DN / suffix | `dc=oneflorida,dc=org` |
| Root DN | `cn=admin,dc=oneflorida,dc=org` |
| LinkNest bind DN | `cn=linknest,ou=services,dc=oneflorida,dc=org` (read-only service account) |
| Overlay | `memberof` (so entries expose AD-style `memberOf`) |
| ACLs | anonymous denied; only the LinkNest service account may read (`cn=admin` bypasses ACLs as root DN) |

Directory layout:

```
dc=oneflorida,dc=org
├── ou=people      inetOrgPerson users  (uid = login id, cn/displayName, sn, mail)
├── ou=groups      groupOfNames         (linknest-users, linknest-admins, ...)
└── ou=services    cn=linknest          (LinkNest service bind account)
```

Accepted credentials are the same login id used to sign in — `uid`, or the
UPN form `uid@oneflorida.org` (LinkNest strips the domain because
`ldap_login_domain = oneflorida.org`).

---

## 2. Service management

```bash
systemctl status slapd            # state
systemctl restart slapd           # apply config changes
journalctl -u slapd -n 50 --no-pager
```

Config lives in `/etc/ldap/slapd.d/` (cn=config) — edit with `ldapmodify -Y EXTERNAL -H ldapi:///`,
never by hand. The listening addresses are set in `/etc/default/slapd`
(`SLAPD_SERVICES`), because this build's config schema does not expose
`olcListenAddress`.

---

## 3. Credentials

Secrets are **not** stored in this repository. On the VPS they live in
root-only files (`chmod 600`):

| File | Contents |
|------|----------|
| `/root/linknest-deploy/openldap-admin-password.txt` | password for `cn=admin,dc=oneflorida,dc=org` |
| `/root/linknest-deploy/openldap-linknest-service-password.txt` | password for the LinkNest service bind account (already stored encrypted in LinkNest's settings) |
| `/root/linknest-deploy/openldap-user-passwords.csv` | `username,password,dn` for every account created by the helper script |

Read one with:

```bash
cat /root/linknest-deploy/openldap-admin-password.txt
```

Change a user's password (do this for any account you are going to hand out):

```bash
ldappasswd -x -H ldap://127.0.0.1:389 \
  -D "cn=admin,dc=oneflorida,dc=org" -w "$(cat /root/linknest-deploy/openldap-admin-password.txt)" \
  -s 'NewPasswordHere' "uid=jdoe,ou=people,dc=oneflorida,dc=org"
```

Then keep `openldap-user-passwords.csv` in sync (it is a convenience record only).

---

## 4. Adding users

Use the helper (installed at `/root/linknest-deploy/openldap-add-user.sh`;
source copy: `scripts/openldap-add-user.sh`):

```bash
/root/linknest-deploy/openldap-add-user.sh <username> "<Display Name>" [email] [password]
```

```bash
# generate a password and print it
/root/linknest-deploy/openldap-add-user.sh jdoe "John Doe"

# explicit e-mail
/root/linknest-deploy/openldap-add-user.sh jdoe "John Doe" john.doe@oneflorida.org

# explicit password
/root/linknest-deploy/openldap-add-user.sh jdoe "John Doe" john.doe@oneflorida.org 'S3cret!'

# re-running the same username resets the password / display name / e-mail
```

The script:

1. hashes the password with `slappasswd` (SSHA — never stores clear text),
2. creates `uid=<username>,ou=people,dc=oneflorida,dc=org` (`inetOrgPerson` with
   `uid`, `cn`, `sn`, `displayName`, `mail`),
3. adds the entry to `cn=linknest-users,ou=groups,…` (creating the group if missing),
4. appends the credentials to `openldap-user-passwords.csv`,
5. verifies the new credentials with `ldapwhoami` (prints `bind test: OK`).


---

## 5. How LinkNest is wired to it

Stored in the app's `settings` table (`data/linknest.db`); the **multi-server JSON
`ldap_servers` matters most**, because `getLdapServers()` prefers it over the flat
`ldap_*` keys — both were updated.

| Setting | Value |
|---|---|
| `ldap_enabled` | `1` |
| `ldap_server` / `ldap_port` / `ldap_protocol` | `127.0.0.1` / `389` / `ldap` (no TLS needed on loopback) |
| `ldap_base_dn` | `dc=oneflorida,dc=org` |
| `ldap_login_domain` / `ldap_mail_domains` | `oneflorida.org` / `["oneflorida.org"]` |
| `ldap_bind_dn` | `cn=linknest,ou=services,dc=oneflorida,dc=org` |
| `ldap_bind_password` | service password, encrypted (AES-256-GCM, key in `data/.encryption_key`) |
| `ldap_user_search_base` | `ou=people,dc=oneflorida,dc=org` |
| `ldap_user_filter` | `(uid={username})` (AD-style `sAMAccountName` filter replaced) |
| `ldap_user_attributes` | `uid,cn,mail,displayName,memberOf` |
| `ldap_group_search_base` / `_filter` / `_attributes` | `ou=groups,dc=oneflorida,dc=org` / `(objectClass=groupOfNames)` / `cn,member` |
| `ldap_email_attribute` / `ldap_display_name_attribute` | `mail` / `displayName` |
| `ldap_timeout` / `ldap_connection_retry` | `5` / `2` (was `30` / `3` for the unreachable AD) |
| `ldap_auto_create_users` / `ldap_auto_update_users` | `1` / `1` (directory is the source of truth for email + display name) |
| `ldap_dropdown_show_host` | `0` (single server → no host picker on the login form) |

Changes can also be made in **Admin → LDAP**. If you edit the bind password there,
use the same service password from
`/root/linknest-deploy/openldap-linknest-service-password.txt`.

The login flow per request is: `ldap_connect` → bind with the service account →
search `(uid=<username>)` → rebind as the user DN with the supplied password →
create/update the app user (email + display name) → session cookie.

---

## 6. Verifying

```bash
# service + listener
systemctl is-active slapd && ss -tlnp | grep 389      # expect 127.0.0.1:389

# service account can read (this is what LinkNest does)
ldapsearch -x -H ldap://127.0.0.1:389 \
  -D "cn=linknest,ou=services,dc=oneflorida,dc=org" \
  -w "$(cat /root/linknest-deploy/openldap-linknest-service-password.txt)" \
  -b "ou=people,dc=oneflorida,dc=org" "(uid=jdoe)" uid cn mail displayName memberOf

# a user's own password
ldapwhoami -x -H ldap://127.0.0.1:389 -D "uid=jdoe,ou=people,dc=oneflorida,dc=org" -w '<password>'

# end-to-end through the app (expect 200; 403 = pending approval, 401 = bad password)
curl -s -k -o /dev/null -w '%{http_code}\n' -X POST \
  https://linknest.198-251-72-41.nip.io/api/auth/login \
  -H 'Content-Type: application/json' \
  --data-binary '{"username":"jdoe","password":"<password>"}'
```

Admin UI equivalent: **Admin → LDAP → Test Connection** (posts to `/api/ldap_test.php`).

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Can't contact LDAP server` in `/var/log/nginx/linknest.error.log` | `slapd` down (`systemctl restart slapd`) or `LDAP_SERVER` not `127.0.0.1` |
| `Invalid credentials` for every user | service bind password out of sync — re-encrypt with `scripts/openldap-add-user.sh`-style reset, or re-run `/home/linknest/ldap-setup/linknest-ldap-settings.php` |
| `403 pending admin approval` | expected on first login — approve in **Admin → Users** |
| `Your account has been disabled` | app-side flag: `UPDATE users SET iss_disabled = 0 WHERE username = '…'` |
| User found but no display name | `ldap_display_name_attribute` must be `displayName` (or `cn`) |
| Logins slow again | check `ldap_timeout` and that `ldap_servers` JSON still points at `127.0.0.1` |
| Settings changes not visible | `rm -f /home/linknest/htdocs/data/cache/*.json && systemctl reload php8.5-fpm` |

---

## 8. Exposing LDAP beyond localhost (optional)

Not needed while LinkNest runs on the same host. To let other machines use this
directory, bind to the private interface and enable TLS first:

1. issue a certificate for the host and configure `olcTLSCertificateFile` /
   `olcTLSCertificateKeyFile` in `cn=config`,
2. set `SLAPD_SERVICES="ldap://127.0.0.1:389/ ldaps://<private-ip>:636/ ldapi:///"`,
3. open that port only to the allowed source addresses (firewall / nginx stream),
4. point clients at `ldaps://…:636` — never plain `ldap://` over the internet.

---

## 9. Rollback / disable

```bash
# point LinkNest back at another directory (or turn LDAP off)
php -r 'require "/home/linknest/htdocs/api/config.php"; setSetting("ldap_enabled","0");' # run as the linknest user, then:
rm -f /home/linknest/htdocs/data/cache/*.json && systemctl reload php8.5-fpm

# stop and remove OpenLDAP entirely
systemctl disable --now slapd
apt-get remove --purge -y slapd ldap-utils    # add --autoremove to drop the data too
cp /root/linknest-deploy/default-slapd.bak.* /etc/default/slapd   # restore the listener config
```

`LDAP` local accounts keep working regardless, because local auth is independent.

---

## 10. File reference

| Path | Purpose |
|---|---|
| `/etc/ldap/slapd.d/` | slapd config (cn=config) |
| `/var/lib/ldap/` | MDB database files |
| `/etc/default/slapd` | `SLAPD_SERVICES` (loopback-only listener) |
| `/root/linknest-deploy/openldap-*-password*.txt`, `openldap-user-passwords.csv` | credentials (root-only) |
| `/root/linknest-deploy/openldap-add-user.sh` | add / reset a user |
| `/root/linknest-deploy/openldap-provision-linknest.sh` | (re)create OUs + service bind account |
| `/home/linknest/ldap-setup/linknest-ldap-settings.php` | re-apply the LinkNest LDAP settings (bind password via STDIN) |
| `scripts/openldap-add-user.sh`, `scripts/openldap-provision-linknest.sh` | repository copies of the helpers |

Manual LDIF equivalent:

```ldif
dn: uid=jdoe,ou=people,dc=oneflorida,dc=org
objectClass: inetOrgPerson
uid: jdoe
cn: John Doe
sn: Doe
displayName: John Doe
mail: jdoe@oneflorida.org
userPassword: {SSHA}...        # slappasswd -s '<password>'
```

```bash
ldapadd -x -H ldap://127.0.0.1:389 -D "cn=admin,dc=oneflorida,dc=org" \
  -w "$(cat /root/linknest-deploy/openldap-admin-password.txt)" -f user.ldif
```

### First-login approval (important)

LinkNest auto-creates the app account on the first successful LDAP login
(`ldap_auto_create_users=1`) but leaves it **unapproved** — the user sees
*“Your account is pending admin approval.”* until an admin approves it in
**Admin → Users**. There is no auto-approve setting for LDAP; approval is a
one-time action per user.

### Deleting / disabling a user

```bash
# remove from LDAP (login stops working immediately)
ldapdelete -x -H ldap://127.0.0.1:389 -D "cn=admin,dc=oneflorida,dc=org" \
  -w "$(cat /root/linknest-deploy/openldap-admin-password.txt)" \
  "uid=jdoe,ou=people,dc=oneflorida,dc=org"

# keep the LDAP entry but block sign-in from LinkNest
sqlite3 /home/linknest/htdocs/data/linknest.db \
  "UPDATE users SET iss_disabled = 1 WHERE username = 'jdoe';"
```

(Column name is `iss_disabled` in the current schema.)
