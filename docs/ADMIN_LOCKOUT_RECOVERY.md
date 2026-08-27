# Admin Password & Lockout Recovery

Use this when you cannot sign in to LinkNest as a local administrator — for example the password was forgotten, or **Local authentication** was turned off under **Admin → Settings → Access → Sign-in**.

Also use the fingerprint unlock script when **Fingerprint-only access** is on and the browser hash changed (or you cannot reach Admin to turn the lock off). Administrators can always sign in with their credentials even when the fingerprint hash does not match.

Also in-app: **Help & About → Help → Admin password & lockout recovery**, and the same steps on **Admin → Settings → Access → Sign-in → Lockout recovery**.

**Who:** Anyone with filesystem / SSH / RDP access to the server that hosts LinkNest.  
**Scope:** Local admin accounts only (`auth_source` = local or empty). LDAP and SAML passwords must be changed in your directory or identity provider.

---

## When you need this

| Situation | What happens | Recovery |
|-----------|--------------|----------|
| Forgot local admin password | Login fails with wrong password | Run the recovery script to set a new password |
| Local authentication toggle is **Off** | Local username/password form is hidden / rejected | Script turns Local auth **On**, then resets the password |
| LDAP/SAML misconfigured and Local was disabled | No working sign-in method | Script re-enables Local + resets password so you can fix LDAP/SAML from Admin |
| Only LDAP/SAML admin (no local account) | Script cannot reset IdP passwords | Fix credentials in AD / IdP, or create a local admin from DB/ops tooling |
| Fingerprint-only access on; hash changed | Guests / non-admins see fingerprint lock page | **Admin signs in with credentials** (hash ignored for admins), or run `unlock_fingerprint_lock.php` |

The app also refuses to disable the **last** enabled sign-in method (Local / LDAP / SAML) so a single toggle cannot wipe every login path from the UI. Server-side recovery still covers cases where Local was already off.

---

## Fingerprint-only access unlock

**Prefer:** On the lock page, click **Administrator sign in** and use your admin username/password. Admins bypass the fingerprint allowlist even when the browser hash is wrong or changed. Then open **Admin → Settings → Access → Guest & UI** to update hashes or turn the lock off.

**Server script:** `scripts/unlock_fingerprint_lock.php`

```bat
cd C:\xampp\htdocs\linknest
php scripts\unlock_fingerprint_lock.php --yes
```

```bash
php scripts/unlock_fingerprint_lock.php --yes
# Also clear the allowlist:
php scripts/unlock_fingerprint_lock.php --clear-hashes --yes
```

Inside Docker:

```bash
docker exec -it <container> php /var/www/html/scripts/unlock_fingerprint_lock.php --yes
```

This turns `fingerprint_lock_enabled` off and clears the public settings cache. Restrict or remove the script on production after use.

---

## Password / Local auth recovery script

**Path:** `scripts/reset_admin_password.php`

In one run the script:

1. Sets `local_auth_enabled = 1` in the SQLite `settings` table (turns Local authentication back on if it was off)
2. Clears cached public settings under `data/cache/` so the login dialog shows Local auth again
3. Resets the chosen local admin user’s `password_hash`

### Windows / XAMPP example

```bat
cd C:\xampp\htdocs\linknest
php scripts\reset_admin_password.php admin "NewStrongPass1!"
```

Use your real install path if it differs (for example `D:\Apache\htdocs\ArchLinks`).

### Linux / Docker example

```bash
cd /var/www/linknest
php scripts/reset_admin_password.php admin 'NewStrongPass1!'
```

Inside Docker you may need:

```bash
docker exec -it <container> php /var/www/html/scripts/reset_admin_password.php admin 'NewStrongPass1!'
```

(Adjust the container path to match your image.)

### Interactive mode

Omit username and password to be prompted:

```bat
php scripts\reset_admin_password.php
```

### Optional browser form

On some installs you can open:

`/linknest/scripts/reset_admin_password.php`

Prefer the CLI. In production, block public web access to `scripts/` and remove or restrict this file after recovery.

---

## After recovery

1. Sign in with **Local authentication** and the new password (or as admin after fingerprint unlock).
2. Open **Admin → Settings → Access → Sign-in** and confirm Local / LDAP / SAML are set the way you want (keep at least one method on).
3. If you unlocked fingerprint lock, review **Access → Guest & UI → Fingerprint-only access** and update hashes before turning it back on.
4. Change the temporary password from the admin profile or Users tools.
5. Restrict or delete recovery scripts on production hosts when you no longer need them.

---

## Security notes

- Anyone who can run PHP against `data/linknest.db` can reset a local admin or disable fingerprint lock — treat server access as full control of the app.
- Do not leave these scripts world-readable on a public URL.
- LDAP/SAML lockouts are not fixed by the password script; restore Local temporarily if you need Admin UI access to repair SSO.

---

## Related UI

- **Admin → Settings → Access → Guest & UI** — guest access, fingerprint-only lock, Sign In button, local sign-up
- **Admin → Settings → Access → Sign-in** — Local / LDAP / SAML toggles + lockout recovery card
- **Help & About → Guides → Admin Password & Lockout Recovery** (this document)
