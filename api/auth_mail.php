<?php
/**
 * Auth / system transactional email helpers for LinkNest.
 * Uses existing smtp_servers + mailer.php. Failures are logged and never thrown to callers.
 */

require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/email_templates.php';

function auth_email_flag(string $key, string $default = '1'): bool {
    try {
        $v = (string)getSetting($key, $default);
    } catch (Throwable $e) {
        $v = $default;
    }
    return $v === '1' || $v === 'true';
}

function auth_email_addon_enabled(): bool {
    return auth_email_flag('auth_email_enabled', '0');
}

function auth_email_smtp_ready(): bool {
    $config = getSMTPConfig();
    if (empty($config['host'])) {
        return false;
    }
    $enabled = $config['enabled'] ?? '0';
    return $enabled === '1' || $enabled === 'true' || $enabled === true || $enabled === 1;
}

/**
 * Feature gate: add-on on + SMTP enabled + optional per-feature toggle.
 */
function auth_email_is_enabled(?string $featureKey = null): bool {
    if (!auth_email_addon_enabled() || !auth_email_smtp_ready()) {
        return false;
    }
    if ($featureKey !== null && $featureKey !== '') {
        return auth_email_flag($featureKey, '1');
    }
    return true;
}

/**
 * @return true|string true on success, error string on failure
 */
function auth_send_mail($to, string $subject, string $textBody, string $htmlBody) {
    try {
        $result = sendEmail(
            $to,
            $subject,
            $textBody,
            null,
            [],
            ['html' => $htmlBody, 'text' => $textBody]
        );
        if ($result === true) {
            return true;
        }
        error_log('[AUTH_EMAIL] send failed: ' . (is_string($result) ? $result : 'unknown'));
        return is_string($result) ? $result : 'Send failed';
    } catch (Throwable $e) {
        error_log('[AUTH_EMAIL] exception: ' . $e->getMessage());
        return $e->getMessage();
    }
}

/**
 * @return string[]
 */
function auth_email_admin_recipients(): array {
    $out = [];
    try {
        $db = getDB();
        $stmt = $db->query('SELECT email FROM users WHERE is_admin = 1 AND COALESCE(is_disabled, 0) = 0');
        $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_COLUMN) : [];
        foreach ($rows as $email) {
            $email = trim((string)$email);
            if ($email !== '' && function_exists('isValidEmailLocal') && isValidEmailLocal($email)) {
                $out[] = $email;
            }
        }
    } catch (Throwable $e) {
        error_log('[AUTH_EMAIL] admin recipients: ' . $e->getMessage());
    }
    return array_values(array_unique($out));
}

function auth_email_app_name(): string {
    return getAppName() ?: 'LinkNest';
}

function auth_email_login_url(): string {
    return ln_email_public_base_url() . '/#/signin';
}

function auth_email_admin_url(): string {
    return ln_email_public_base_url() . '/#/admin';
}

function auth_email_notify_registration(string $username, string $email): void {
    if (!auth_email_is_enabled('auth_email_notify_registration')) {
        return;
    }
    $appName = auth_email_app_name();
    $loginUrl = auth_email_login_url();

    if ($email !== '' && isValidEmailLocal($email)) {
        auth_send_mail(
            $email,
            $appName . ' — registration received',
            ln_render_user_registered_email_text($username, $appName, $loginUrl),
            ln_render_user_registered_email_html($username, $appName, $loginUrl)
        );
    }

    $admins = auth_email_admin_recipients();
    if (!empty($admins)) {
        auth_send_mail(
            $admins,
            $appName . ' — new user pending approval',
            ln_render_admin_new_registration_email_text($username, $email, $appName, auth_email_admin_url()),
            ln_render_admin_new_registration_email_html($username, $email, $appName, auth_email_admin_url())
        );
    }
}

function auth_email_notify_approved(string $username, string $email): void {
    if (!auth_email_is_enabled('auth_email_notify_approval')) {
        return;
    }
    if ($email === '' || !isValidEmailLocal($email)) {
        return;
    }
    $appName = auth_email_app_name();
    $loginUrl = auth_email_login_url();
    auth_send_mail(
        $email,
        $appName . ' — account approved',
        ln_render_user_approved_email_text($username, $appName, $loginUrl),
        ln_render_user_approved_email_html($username, $appName, $loginUrl)
    );
}

/**
 * Send password reset for a local user. Returns true if mail attempted successfully.
 */
function auth_email_send_password_reset(string $username, string $email, string $resetUrl, int $expiresMinutes = 60): bool {
    if (!auth_email_is_enabled('auth_email_password_recovery')) {
        return false;
    }
    if ($email === '' || !isValidEmailLocal($email)) {
        return false;
    }
    $appName = auth_email_app_name();
    $result = auth_send_mail(
        $email,
        $appName . ' — password reset',
        ln_render_password_reset_email_text($username, $resetUrl, $appName, $expiresMinutes),
        ln_render_password_reset_email_html($username, $resetUrl, $appName, $expiresMinutes)
    );
    return $result === true;
}
