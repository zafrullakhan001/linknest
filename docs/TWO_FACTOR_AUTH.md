# Two-Factor Authentication (TOTP for Local and LDAP sign-in)

Per-user, opt-in second factor for accounts that sign in with a **username + password**
(Local) or an **LDAP bind**. After the credentials are accepted the session is *not*
created: the user must present a 6-digit TOTP code from an authenticator app (or a
one-time recovery code). Managed from the profile menu and gated by an administrator
toggle in Admin → Sign-in settings.

- Schema: **v110** (`user_two_factor`, `user_two_factor_devices`)
- Library: `api/two_factor_lib.php` (RFC 6238, HMAC-SHA1, 30 s step, 6 digits, ±1 step skew)
- Endpoints: `api/auth.php` (`/api/auth/2fa/*`)
- UI: `components/TwoFactorDialog.tsx` (profile), `components/AuthModal.tsx` (code prompt),
  `components/AdminPanel.tsx` (availability toggle + admin reset)

## Not gated (by design)

| Sign-in path | Second factor |
|--------------|---------------|
| Local / LDAP username + password | **Yes** — code required after the password check |
| Passkey (WebAuthn) | No — possession + biometric already, and it can itself be a second factor |
| SAML | No — managed by the identity provider |
| Administrators impersonating a user | No — the admin already authenticated with their own factors |
| MCP / system bearer tokens | No — non-interactive credentials, and management endpoints refuse them |

## Data model (schema v110)

| Table | Purpose |
|-------|---------|
| `user_two_factor` | One row per enrolled user: `secret` (AES-256-GCM payload prefixed `ln2fa:`), `pending_secret` (enrolment in progress), `enabled`, `recovery_codes` (JSON array of `password_hash()` values), `confirmed_at`, `last_used_at`, `last_counter` (replay guard), `failed_attempts`, `locked_until`, `clock_offset_steps` (learned device clock offset) |
| `user_two_factor_devices` | Trusted browsers for “trust this device for 30 days”: `selector` + `validator_hash` (`password_hash`), `user_agent`, `expires_at` |

Notes:

- The TOTP secret is encrypted with the existing AES-256-GCM helper (`encryptPassword()` /
  `decryptPassword()`, key material in `data/`). Recovery codes are stored hashed, never in clear.
- SQLite foreign keys are disabled app-wide (`api/config.php`), so user deletion calls
  `twoFactorDeleteForUser()` explicitly (`api/auth.php` reject/delete, `api/mcp_admin_lib.php`,
  `api/mcp_user_lib.php`, `api/clone_service.php`).
- `user_two_factor` / `user_two_factor_devices` are part of the Admin → Database JSON export and
  import lists (`api/database_transfer_lib.php`). Because the encryption key is **not** in the
  export, a database restored onto a different host cannot decrypt the stored secrets — the gate
  then **fails open** (audit `auth.two_factor_failed` reason `secret_unreadable`) and the user must
  enrol again instead of being locked out.

## Sign-in flow

1. `POST /api/auth/login` validates the credentials and every policy gate
   (`is_disabled`, approval, maintenance mode, login allowlist).
2. `twoFactorMaybeGate()` (`api/two_factor_lib.php`) runs **after** those gates and before the
   session is created:
   - feature off, user not enrolled, or a valid trusted-device cookie → normal login;
   - otherwise it stores `$_SESSION['two_factor_pending']` (challenge id, user id, method,
     `remember_me`, 5-minute expiry) and answers
     `{ success:false, two_factor_required:true, challenge_id, methods, expires_in, attempts_remaining, locked_until }`.
3. `POST /api/auth/2fa/verify` takes the code (or a recovery code) plus `trust_device` and, on
   success, finishes the login through the same `linknestCompleteInteractiveLogin()` used by
   password sign-in — identical `$_SESSION`, remember-me cookie, `trackUserLogin()` and
   `auth.login` audit entry.

Hardening:

- 5 wrong codes invalidate the challenge and lock 2FA for that user for 15 minutes
  (`locked_until`); the API answers `429` with `reason: locked`.
- A TOTP step is single-use: the matched counter is stored in `last_counter` and reused codes are
  rejected (`reason: replay`).
- Challenge state lives only in the session; the user id is never taken from the request body.
  A failure response uses HTTP 401 (or 429 when locked) and never sets `user_id`.
- Account state is re-checked after the code prompt (disabled/pending/maintenance) before the
  session is created. The login allowlist is only evaluated at the credential step because LDAP
  group membership is no longer available.

## Authenticator clock drift (why a code can be rejected)

TOTP only works when the authenticator device and the server agree on the time step. A device
whose clock is ~1 minute off used to be nearly unusable: the code was only accepted in the last
seconds of its 30-second display window. That is now handled:

- **Enrolment** (`POST /auth/2fa/enable`) accepts a code from any step within ±5 (≈±150 s) of the
  server and stores the difference in `user_two_factor.clock_offset_steps`. So the offset is known
  from the very first sign-in. If the code is valid but further away, the response explains exactly
  how far off the device clock is.
- **Sign-in** verifies ±1 step around `now + clock_offset_steps` — the three codes centred on the
  device's own clock, exactly as a normal ±1 implementation behaves for a synced device.
- **Drift after enrolment** (NTP catches up, phone replaced, DST bug): if the ±1 window misses, a
  code that is valid up to ±2 steps away is accepted and the new offset is remembered
  (`auth.two_factor_clock_resynced` in the audit log). The next sign-in matches immediately.
- **Beyond the tolerance** (> ±90 s): the code is *recognised*, not rejected as wrong — the
  response is `reason: "clock_skew"` with `clock_skew_seconds`, the sign-in modal shows an orange
  “Authenticator clock is out of sync … about N seconds ahead/behind” hint, and the failed attempt
  is **not** counted against the 5-attempt lockout (the user did enter a valid code).
- Profile → Two-factor authentication shows the learned offset (“Device clock: +60s”) so users and
  admins can see — and fix — a device whose time sync is broken.

Nothing here is a substitute for working clocks: the messages tell the user/administrator to switch
the device (or server) to automatic time sync.

Also, the code that confirms enrolment is not marked as “used”, so the very first sign-in right
after enabling 2FA works with the same visible code instead of failing as a replay.

## Profile management (`/api/auth/2fa/*`)

| Method + path | Purpose |
|---------------|---------|
| `GET /auth/2fa/status` | `available`, `enabled`, `required`, `confirmed_at`, `last_used_at`, `locked_until`, `recovery_codes_remaining`, `trusted_devices[]` |
| `POST /auth/2fa/setup` | New Base32 secret (stored encrypted as `pending_secret`) + `otpauth://` URI for the QR code |
| `POST /auth/2fa/enable` | Confirms the first code, promotes the secret, returns 10 recovery codes **once** |
| `POST /auth/2fa/disable` | Local accounts confirm with the **password**; LDAP/SAML accounts with a **current code**. Clears secret, recovery codes and trusted devices |
| `POST /auth/2fa/recovery-codes` | Regenerates 10 recovery codes (a current code is required) |
| `POST /auth/2fa/devices/revoke` | Revokes one trusted browser (`device_id`) or all of them |
| `POST /auth/2fa/verify` / `POST /auth/2fa/cancel` | Public: finish or abandon a pending challenge |
| `PUT /auth/2fa/reset/{userId}` | Admin only: clears a user's 2FA (lost device), audit `user.two_factor_reset` |

Management endpoints require an interactive, non-impersonated browser session
(`twoFactorRequireBrowserSessionUser()`), mirroring passkey management.

## Administrators

Admin → Sign-in settings → **Two-factor authentication**:

- **availability** (`two_factor_enabled`, default `0`) — when off, the profile entry and all
  `/auth/2fa/*` management endpoints are unavailable; existing enrollments are ignored at sign-in.
- **“Ask every Local / LDAP user to enrol”** (`two_factor_required`) — surfaces a “required by your
  administrator” notice in the profile dialog. Nothing blocks sign-in yet: enforcement is a
  deliberate follow-up, so enabling the policy never locks anyone out.

Admin → Users → user actions → **Reset Two-Factor Authentication** clears a user's secret, recovery
codes and trusted browsers when they lose their device.

## Audit events

`auth.two_factor_challenged`, `auth.two_factor_verified`, `auth.two_factor_failed`,
`auth.two_factor_device_trusted`, `auth.two_factor_setup_started`, `auth.two_factor_setup_failed`,
`auth.two_factor_enabled`, `auth.two_factor_disabled`, `auth.two_factor_disable_failed`,
`auth.two_factor_recovery_codes_regenerated`, `auth.two_factor_device_revoked`,
`auth.two_factor_devices_revoked`, `auth.two_factor_clock_resynced`, `user.two_factor_reset` — all
labelled in `components/UserAuditLog.tsx` (Admin → Audit log).

## Testing / troubleshooting

1. Admin → Sign-in settings → turn **Two-factor authentication** on, then Save.
2. Sign in, open the profile menu → **Two-factor authentication** → *Enable two-factor
   authentication*; scan the QR (or paste the setup key) and confirm a code.
3. Save the recovery codes, sign out, sign in again — the modal asks for the code; “Trust this
   browser for 30 days” skips it next time (revoke from the same dialog).
4. Lost device: sign in with a recovery code, or have an administrator reset the enrolment.

| Symptom | Cause / fix |
|---------|-------------|
| Profile entry missing | `two_factor_enabled` is `0` (Admin → Sign-in settings) |
| “Incorrect code. N attempts remaining.” | Wrong code, or a code that was already used in this step — wait for the next 6-digit code |
| Code only works in the last few seconds of the window / “Authenticator clock is out of sync” | The authenticator device's clock differs from the server's. Turn on automatic time sync on the device (or fix the server clock). The server stores the measured offset, so codes work while it is within ±90 s |
| Device clock shown as “+60s” in the profile dialog | The server learned this drift and compensates. Codes work; fixing the device clock is still recommended |
| “Too many incorrect codes…” (429) | 15-minute lock after 5 failures |
| “Two-factor authentication needs to be set up again” | Secret could not be decrypted (e.g. database restored from another host) — 2FA was cleared, enrol again |
| Code always rejected | Check the device clock (NTP); the server allows ±30 s |
| Locked out with no codes and no admin | Clear the row directly: `DELETE FROM user_two_factor WHERE user_id = <id>;` then sign in again |
