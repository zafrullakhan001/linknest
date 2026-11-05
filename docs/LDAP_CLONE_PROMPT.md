# LDAP clone prompt

Copy everything under **Prompt** into a new AI chat when you need to rebuild this application's LDAP sign-in and directory admin in another project. The prompt is a behavior specification. It does not include source code.

---

## Prompt

You are implementing LDAP / Active Directory authentication and directory administration. Match the behavior in this specification. Do not copy another application's source, UI chrome, or file layout.

Before writing code, ask for:

- target language, framework, and PHP version if applicable
- database and how settings are stored
- existing session and sign-in model (local accounts, approval, admin role, TOTP)
- whether an admin UI already exists

Then implement this behavior in that project's patterns. The reference stack is PHP 8 or newer with the `ldap` extension, prepared statements, and AES-256-GCM for service-account bind passwords. End-user directory passwords are never stored.

If the target app has no Local sign-in, still keep the LDAP path self-contained and leave a clear seam where Local would run. Do not build SAML, passkeys, or a background sync scheduler.

### Product rules

- One selected directory server per request. `ldap_server_index` picks it. Omit the index and use server 0. Connection retries stay on that server. Do not fail over to the next server.
- Admin directory actions require an authenticated administrator and `ldap_enabled = 1`. If the `ldap` extension is missing, return a clear 500.
- Login errors shown to the person signing in stay generic, except the explicit denial messages below. Admin test, search, group fetch, and user-detail responses may include `ldap_errno`, `ldap_error`, and the server diagnostic message. Never include the bind password or the user's password.
- Release the session lock before any LDAP network call so other requests are not blocked.
- Escape every value placed in an LDAP filter or DN before substitution. Prefer `ldap_escape` with filter or DN flags. If that function is missing, escape `\`, `*`, `(`, `)`, and NUL for filters, and RFC 4514 special characters for DNs.
- All database access uses prepared statements.

### Settings

Store a JSON array in `ldap_servers`. Each object has:

`name`, `server`, `port`, `protocol` (`ldap` or `ldaps`), `tls` (`0`/`1`), `timeout`, `bind_dn`, `bind_password`, `user_search_base`, `user_filter`, `user_attributes`, `group_search_base`, `group_filter`, `group_attributes`, `require_group_membership`, `required_groups`, `denied_groups`, `search_scope` (`base`, `one`, or `sub`), `user_dn_template`, `nested_groups`, `case_sensitive`, `ssl_verify`, `connection_retry`, `retry_delay`, `email_attribute`, `display_name_attribute`, `referrals`, `login_domain`.

Defaults when a field is missing:

- port `389`, protocol `ldap`, timeout `30`, retries `3`, retry delay `1` second
- user filter `(sAMAccountName={username})`
- user attributes `sAMAccountName,mail,displayName`
- group filter `(objectClass=group)`
- group attributes `cn,distinguishedName,member`
- search scope `sub`
- `ssl_verify` on

Also keep these global keys:

- `ldap_enabled` (`0`/`1`)
- `ldap_dropdown_show_host` (`0`/`1`) — show `host:port` in server dropdowns
- `ldap_mail_domains` — JSON array of lowercase mail domains learned from the directory
- `ldap_base_dn` — optional; used only when guessing a user's auth source, not as the search base
- `login_allowlist_enabled`, `login_allowed_user_ids` (JSON array of user ids), `login_allowed_ldap_groups` (newline-separated patterns)
- `local_auth_enabled`, `saml_enabled`, `maintenance_enabled` if those features exist

On save of a non-empty `ldap_servers` array, mirror server 0 into the legacy flat keys `ldap_server`, `ldap_port`, `ldap_protocol`, `ldap_tls`, `ldap_timeout`, `ldap_bind_dn`, `ldap_bind_password`, `ldap_user_search_base`, `ldap_user_filter`, `ldap_user_attributes`, `ldap_group_search_base`, `ldap_group_filter`, `ldap_group_attributes`, `ldap_require_group_membership`, `ldap_required_groups`, `ldap_denied_groups`, `ldap_search_scope`, `ldap_user_dn_template`, `ldap_nested_groups`, `ldap_case_sensitive`, `ldap_ssl_verify`, `ldap_connection_retry`, `ldap_retry_delay`, `ldap_email_attribute`, `ldap_display_name_attribute`, `ldap_referrals`, `ldap_login_domain`. If only those flat keys exist, treat them as a one-element `ldap_servers` array.

Saving an empty server list purges LDAP settings (same as the purge action below). Reject a save that would turn Local, LDAP, and SAML all off. At least one sign-in method stays enabled.

`ldap_auto_create_users`, `ldap_auto_update_users`, and `ldap_sync_interval` may be stored for export compatibility. Do not read them at login and do not invent a scheduler. Login provisions a directory user when the bind and the gates below succeed.

### Bind-password encryption

- Encrypt service-account bind passwords with AES-256-GCM before they are written.
- Wire format: `base64(iv).base64(tag).base64(ciphertext)`. Exactly two dots. Do not treat an ordinary password that happens to contain dots as ciphertext unless it matches this shape.
- Key material lives in a file next to the database (`data/.encryption_key`), mode `0600`. The AES key is SHA-256 of that file's contents. On decrypt, try the current key and any legacy key so existing ciphertext still opens.
- If decrypt fails, do not fall back to using the ciphertext as the bind password. Anonymous bind may follow only when both bind DN and password are empty.
- Admin settings reads may return the plaintext to the admin UI so the form can be edited, then re-encrypt on save. Every other API, log, export-to-chat, and machine-client response returns `has_bind_password` only.
- Auto-encrypt a plaintext value found in storage.

### Sign-in

`POST` login body: `username`, `password`, optional `auth_method` (`local`, `ldap`, or `auto`/empty), optional `remember_me`, optional `ldap_server_index`.

`auth_method` behavior:

- `local` — skip LDAP.
- `ldap` — LDAP only. If LDAP is disabled, return 400 `LDAP authentication is not enabled`. On failure return 401. Do not try the local password.
- `auto` or omitted — try LDAP first, then local. Cap the LDAP timeout at 1–3 seconds and force connection retries to 0 so an unreachable directory does not block local sign-in. If the username contains `@localhost`, skip LDAP.

Username handling:

- Trim the input. Unless `case_sensitive` is `1`, lowercase it before filter and DN substitution.
- The only placeholder is `{username}`.
- `DOMAIN\user` is not parsed. Pass it through as typed.
- If the input contains `@` and the part after `@` matches `login_domain`, a `DC=` domain from the search base, or the domain labels of the server hostname, substitute only the local part. Otherwise substitute the full string, which works when `user_filter` is something like `(userPrincipalName={username})`.

Connection, per selected server:

- URI is `ldaps://host:port` when protocol is `ldaps`, otherwise `ldap://host:port`.
- When protocol is not `ldaps` and `tls` is `1`, call StartTLS.
- When protocol is `ldaps` and `ssl_verify` is `0`, disable certificate verification. Default is verify on.
- `referrals = 1` follows referrals.
- Retry connect `connection_retry` times, sleeping `retry_delay` seconds between attempts. Auto mode uses 0 retries.

Authentication:

1. If `bind_dn` and a decrypted bind password are both non-empty, bind as that service account. Otherwise anonymous bind.
2. If `user_dn_template` is non-empty, bind the user directly at that DN (`{username}` already escaped for a DN), then read attributes with a base-scope read.
3. Otherwise search `user_search_base` with `user_filter` after filter-escaping `{username}`. Scope `base` is a read, `one` is one level, anything else is subtree. Then bind as the found user DN with the submitted password.
4. A failed user bind is the lockout check. Do not read `userAccountControl` during sign-in. Disabled, locked, or wrong-password accounts fail the bind.

Attributes to request: configured `user_attributes`, plus `memberOf` when group checks or the login allowlist need it, plus `mail`, `userPrincipalName`, `displayName`, `cn`, and any custom email or display-name attribute.

Email, in order: custom `email_attribute`, then `mail`, then `userPrincipalName` when it looks like an email. If still empty, synthesize `username@domain` using the first available of: `DC=` labels in the user search base joined with dots, the server hostname without its first label, `login_domain`, then `ldap.local`. On insert, if that email is already taken, store `duplicate_{unix_time}_{email}`.

Display name, in order: custom `display_name_attribute`, then `displayName`, then `cn`. Update it on every successful LDAP login when the directory value is non-empty.

When mail or UPN produced an address, remember the domain (must contain `.`, never `localhost`) in `ldap_mail_domains`.

Group checks use `memberOf` values only:

- Parse `required_groups` and `denied_groups` as one pattern per line. Semicolons are line breaks. Commas split the list only when the whole value has no newline and no `=`.
- A pattern matches a group DN or CN when they are equal ignoring case, or when the group string contains the pattern ignoring case.
- Denied groups are checked first. Message: `Access denied: User is a member of a denied group`.
- If `require_group_membership` is `1` and `required_groups` is non-empty, the user must match at least one. Message: `Access denied: User must be a member of one of the allowed groups`.
- When `nested_groups` is `1`, do not trust `memberOf` alone. The original sign-in path left nested group checks as a TODO and only read direct `memberOf`. Do not copy that gap. Expand nested membership with the Active Directory matching rule `1.2.840.113556.1.4.1941` (or an equivalent recursive group walk, depth at most 5, cycle-safe) before the allow and deny checks.

Login allowlist, evaluated after the directory bind and the per-server group checks:

- Inactive when `login_allowlist_enabled` is off.
- Active and both the user-id list and the LDAP group list are empty: administrators may sign in; everyone else gets 403 `You are not authorized to sign in. Contact your administrator.`
- Administrators always bypass a non-empty allowlist.
- A known user is allowed when their id is listed or their `memberOf` matches `login_allowed_ldap_groups` with the same pattern rules as above.
- A person not yet in the database may be created only when the allowlist is off, or when their groups match `login_allowed_ldap_groups`. An empty group list does not allow provisioning.
- Fetch `memberOf` during login when the allowlist is on and has group patterns.

Account gates for non-administrators, after a successful bind:

- `is_disabled` → 403.
- Maintenance mode → 503.
- New LDAP users are inserted with `is_approved = 0` and cannot finish sign-in until an admin approves them. Message tells them the account is pending admin approval. Administrators are not blocked by pending approval.

Local user row on success:

- `username` is the login id after any email-domain strip. Look up existing rows with a case-insensitive username compare.
- `auth_source` is set to `ldap` on every successful LDAP login.
- `password_hash` is a random value from a normal password hash of 16 random bytes. Never store or update it from the directory password.
- `is_admin` is 0 on create.
- Do not persist the DN or the group list.
- A later local login must not clear an existing `auth_source` of `ldap`.

Group denial and allowlist denial are final. Do not continue to local sign-in in auto mode when the directory account was found and then rejected for groups or the allowlist. Do not decide that by searching the error string. Wrong password, unreachable server, and unknown user may fall through to local in auto mode only.

If the target app has TOTP: run it only after the LDAP bind and every gate above (disabled, approval, maintenance, allowlist). Issue a short-lived challenge and do not create the session until the code or a recovery code succeeds. Do not ask the client to supply the user id. Do not re-check LDAP groups at TOTP verify time, because the directory bind is already finished.

Audit failed sign-in with method and reason. Do not write passwords to the audit row. A debug log of usernames and filters is optional and off by default.

### Admin directory

All of these require an administrator and `ldap_enabled = 1`.

**Test connection.** Optional service bind, plus optional `test_username` and `test_password` for a user bind. Accept the same connection fields as a server object, or `ldap_server_index` to test a saved server. Return structured diagnostics and, on user-auth success, any newly learned `ldap_mail_domains`. Map common Active Directory bind `data` codes to a short hint (wrong password, account disabled, locked, expired, logon hours, workstation restriction) without echoing the password.

**Search users.** Body `{ "search": "...", "ldap_server_index"?: n }`. Reject fewer than 2 characters. Search only the selected server. Try these filters in order and stop at the first query that returns entries. Size-limit errors try the next filter. Cap at 20.

1. `(&(objectCategory=person)(objectClass=user)(|(anr=TERM)(sAMAccountName=TERM*)(mail=TERM*)(userPrincipalName=TERM*)))`
2. `(sAMAccountName=TERM*)`
3. `(sAMAccountName=TERM)`
4. `(|(mail=TERM*)(userPrincipalName=TERM*)(cn=TERM*)(displayName=TERM*))`
5. The configured `user_filter` with `{username}` replaced by the escaped term, only when the template contains `{username}`

Always request `sAMAccountName`, `mail`, `displayName`, `userPrincipalName`, `cn`, plus custom email and display-name attributes. Username is `sAMAccountName`, or the local part of `userPrincipalName`. Email and display name use the same fallback order as login. Sort an exact username match first. The UI selects the result automatically when the username matches exactly (case-insensitive) or when there is exactly one result. If several match and none is exact, do not add a user; ask the admin to pick one.

**Add one user.** Body: `username`, `dn` (both required), optional `email`, `displayName`, `notes`, `auto_approve`, `ldap_server_index`. Read that DN on the selected server and refuse the insert if the read fails. Insert `auth_source=ldap`, random `password_hash`, `is_admin=0`, `is_approved` from `auto_approve` (default not approved), `notes`, and `display_name` when non-empty. Do not store the DN. Empty email becomes `username@login_domain`, then `ldap.local`.

**Bulk import.** Body `{ "users": [...], "auto_approve": bool, "ldap_server_index"?: n }`. Each user needs `username`, `email`, and `dn`. `displayName` is optional. Verify each DN. Fill an empty display name from directory `displayName`, then `cn`. Skip usernames that already exist and report them. Same insert rules as add-one, without notes. CSV columns are `username,email,dn,displayName`.

**Group members.** Body `{ "group_dn", "ldap_server_index"?: n, "include_nested"?: bool }`. `include_nested` defaults to the server's `nested_groups` flag. Confirm the group DN is readable. Search users under `user_search_base`:

- nested: `(&(objectCategory=person)(objectClass=user)(memberOf:1.2.840.113556.1.4.1941:=ESCAPED_DN))`
- direct: `(&(objectCategory=person)(objectClass=user)(memberOf=ESCAPED_DN))`

If that returns nobody, read the group's `member` attribute. For large Active Directory groups, also read `member;range=start-end` in pages of 1500. When nested and the member entry is itself a group (`group`, `groupOfNames`, `groupOfUniqueNames`), walk members up to depth 5, skipping DNs already visited. Cap the user list at 500 and set `truncated` when the cap is hit. Synthesize missing emails the same way as add-user. Return `username`, `email`, `displayName`, `dn` so the admin can import the selection through bulk import.

**Directory detail** for an existing `auth_source=ldap` user, loaded when the admin expands the user. Return CN, DN, mail, UPN, display name, and the group list. Decode `userAccountControl` into flags and booleans for disabled (`0x0002`), lockout (`0x0010`), password never expires (`0x10000`), and password expired (`0x800000`). The group list can be filtered in the UI by name or DN. This endpoint is not used during sign-in.

**Sync display names.** For users with `auth_source=ldap` and an empty display name, search the directory and set `display_name` from the custom attribute, then `displayName`, then `cn`. Skip users the directory does not name. Audit the run.

**Auth-source detection** (admin action, not login): label a user `ldap` when their email domain matches candidates gathered from `login_domain`, `DC=` labels, server hostnames, `ldap_base_dn`, and `ldap_mail_domains`, or when a directory lookup finds them. Do not overwrite a user who is already `ldap` during an ordinary local login.

**Purge.** Require an explicit confirm flag. Delete every setting whose key starts with `ldap_`, then set `ldap_servers` to `[]` and `ldap_enabled` to `0`.

**Export / import of LDAP settings.** JSON may include `ldap_enabled`, `ldap_dropdown_show_host`, `ldap_servers`, and a marker that bind passwords are encrypted. Import encrypts any plaintext bind password before save. Do not log the exported secret.

### Suggested HTTP shape

Adapt paths to the target router. Keep admin authorization on every directory route.

- `POST /api/auth/login`
- `POST /api/ldap/test`
- `POST /api/auth/search-ldap-users`
- `POST /api/auth/ldap-user-detail`
- `POST /api/auth/add-ldap-user`
- `POST /api/auth/ldap-group-members`
- `POST /api/auth/bulk-import-ldap`
- `POST /api/auth/sync-ldap-display-names`
- `POST /api/auth/auto-detect-auth-sources`
- `PUT /api/settings` for `ldap_enabled` and `ldap_servers`
- `POST /api/settings/purge-ldap` with `confirm: true`

If the target app exposes an admin machine API, the same actions may exist there. Bind passwords stay write-only. Purge requires `confirm: true`.

### Security checklist

- Filter and DN escaping on every substituted value, including group DNs.
- Prepared statements only.
- Administrator gate on search, test, import, group fetch, detail, sync, detect, and purge.
- Service bind password encrypted at rest. Responses outside the admin settings form expose only `has_bind_password`.
- Directory user passwords verified by bind and then discarded.
- Session lock released before LDAP I/O.
- Login diagnostics for end users do not include errno, filter, or bind DN. Admin diagnostics never include secrets.
- Debug logging of usernames and filters is off unless an operator turns it on. It never logs passwords.
- Group and allowlist denials do not fall through to another password check.
- Nested group checks are cycle-safe and depth-limited.

### Acceptance checklist

1. Test connection succeeds with a service account, and a wrong bind password returns a diagnostic without the password.
2. A directory user can sign in with `sAMAccountName`. `user@known-domain` strips to the local part. An unknown user on forced LDAP gets 401 and is not created.
3. Auto mode tries LDAP with a short timeout, then local. `@localhost` skips LDAP. Group or allowlist denial does not try local.
4. First successful LDAP sign-in creates `auth_source=ldap`, a random local password hash, no stored DN, and `is_approved=0`. The pending user cannot finish sign-in. An approved later login updates `display_name`.
5. A user in `denied_groups` is rejected even if they are also in `required_groups`. With `nested_groups` on, a user only in a nested group counts as a member.
6. With the allowlist on and only an LDAP group listed, a new user in that group is created and a user outside it gets 403. An administrator still signs in. An enabled allowlist with both lists empty blocks non-admins.
7. Admin search of two or more characters returns at most 20 users and auto-selects an exact or single match. One character is rejected.
8. Add and bulk import refuse a DN the service account cannot read. Group import returns nested members up to 500 and can feed bulk import.
9. Sync fills empty display names from `displayName` or `cn` and leaves other users unchanged.
10. Purge with confirm removes `ldap_*` settings and disables LDAP. A following login does not attempt LDAP. Export/import round-trips an encrypted bind password.

### Out of scope

- SAML, passkeys, and local-password reset tooling.
- A scheduler, periodic sync, or any runtime use of `ldap_auto_create_users`, `ldap_auto_update_users`, or `ldap_sync_interval`.
- Storing directory DNs or group membership on the user row.
- Reading `userAccountControl` to allow or deny sign-in.
- Cross-server failover on login or search.
- Copying source from the original application. Reimplement the behavior above.
