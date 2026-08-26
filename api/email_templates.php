<?php
/**
 * LinkNest Email Templates (HTML + text helpers)
 * PHP 8+
 */

function ln_html_escape($v): string {
    return htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function ln_format_status_label(string $status): string {
    $s = strtoupper(trim($status));
    if ($s === '') return 'UNKNOWN';
    return $s;
}

function ln_format_response_time($ms): string {
    if ($ms === null || $ms === '') return 'N/A';
    if (!is_numeric($ms)) return 'N/A';
    return (string)(int)round((float)$ms) . ' ms';
}

function ln_format_datetime(?int $ts = null): string {
    $ts = $ts ?? time();
    return date('Y-m-d H:i:s', $ts);
}

/**
 * Resolve absolute public URL for branding assets and reset links.
 */
function ln_email_public_base_url(?string $override = null): string {
    $override = trim((string)($override ?? ''));
    if ($override === '') {
        try {
            $override = trim((string)getSetting('auth_email_public_url', ''));
        } catch (Throwable $e) {
            $override = '';
        }
    }
    if ($override !== '') {
        return rtrim($override, '/');
    }

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443)
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');
    $scheme = $https ? 'https' : 'http';
    $host = trim((string)($_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost'));
    if ($host === '') {
        $host = 'localhost';
    }
    $basePath = '';
    if (function_exists('getAppBasePath')) {
        $basePath = getAppBasePath();
    }
    return rtrim($scheme . '://' . $host . $basePath, '/');
}

/**
 * Absolute logo URL for email clients (optional).
 */
function ln_email_brand_logo_url(?string $publicBase = null): string {
    $logo = '';
    try {
        $logo = trim((string)getSetting('header_logo_image', ''));
        if ($logo === '') {
            $logo = trim((string)getSetting('logo_image', ''));
        }
        if ($logo === '') {
            $logo = trim((string)getSetting('favicon', ''));
        }
    } catch (Throwable $e) {
        $logo = '';
    }
    if ($logo === '') {
        return '';
    }
    if (preg_match('#^https?://#i', $logo) || str_starts_with($logo, 'data:')) {
        return $logo;
    }
    // Normalize to /uploads/... then make absolute
    $normalized = preg_replace('#^/[^/]+/uploads/#', '/uploads/', $logo);
    if (!is_string($normalized) || strpos($normalized, '/uploads/') !== 0) {
        if (strpos($logo, '/uploads/') === 0) {
            $normalized = $logo;
        } else {
            return '';
        }
    }
    // public base already includes install path (e.g. https://host/linknest)
    return ln_email_public_base_url($publicBase) . $normalized;
}

function ln_email_brand_accent(): string {
    $candidates = ['nav_bg_light', 'nav_icon_color_light', 'auth_wash_from', 'app_name_font_color'];
    foreach ($candidates as $key) {
        try {
            $v = trim((string)getSetting($key, ''));
        } catch (Throwable $e) {
            $v = '';
        }
        if (preg_match('/^#[0-9a-fA-F]{6}$/', $v)) {
            return $v;
        }
    }
    return '#4f46e5';
}

/**
 * Table-based layout for wide email client support.
 *
 * @param array{logo_url?:string,footer_label?:string,public_base?:string} $options
 */
function ln_email_base_layout(
    string $title,
    string $subtitle,
    string $accentHex,
    string $innerHtml,
    string $preheader = '',
    string $appName = 'LinkNest',
    array $options = []
): string {
    $safeTitle = ln_html_escape($title);
    $safeSubtitle = ln_html_escape($subtitle);
    $safePreheader = ln_html_escape($preheader);
    $accent = preg_match('/^#[0-9a-fA-F]{6}$/', $accentHex) ? $accentHex : '#4f46e5';
    $footerLabel = trim((string)($options['footer_label'] ?? ''));
    if ($footerLabel === '') {
        $footerLabel = 'Sent by ' . $appName;
    }
    $logoUrl = trim((string)($options['logo_url'] ?? ''));
    if ($logoUrl === '' && empty($options['skip_logo'])) {
        $logoUrl = ln_email_brand_logo_url($options['public_base'] ?? null);
    }
    $logoBlock = '';
    if ($logoUrl !== '') {
        $logoBlock = '<div style="margin-bottom:12px;">
              <img src="' . ln_html_escape($logoUrl) . '" alt="' . ln_html_escape($appName) . '" width="48" height="48" style="display:block;width:48px;height:48px;border-radius:12px;object-fit:contain;background:rgba(255,255,255,0.15);" />
            </div>';
    }

    return '<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>' . $safeTitle . '</title>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' . $safePreheader . '</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7fb;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 25px rgba(15,23,42,0.06);">
          <tr>
            <td style="background:' . $accent . ';padding:28px 28px 22px 28px;">
              ' . $logoBlock . '
              <div style="font-family:Segoe UI,Arial,sans-serif;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;margin-bottom:8px;">' . ln_html_escape($appName) . '</div>
              <div style="font-family:Segoe UI,Arial,sans-serif;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:0.2px;line-height:1.2;">' . $safeTitle . '</div>
              <div style="font-family:Segoe UI,Arial,sans-serif;color:rgba(255,255,255,0.9);font-size:13px;font-weight:600;margin-top:6px;line-height:1.4;">' . $safeSubtitle . '</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 10px 28px;">
              ' . $innerHtml . '
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 24px 28px;border-top:1px solid #eef2ff;">
              <div style="font-family:Segoe UI,Arial,sans-serif;color:#64748b;font-size:12px;line-height:1.4;">
                ' . ln_html_escape($footerLabel) . ' • ' . ln_html_escape(ln_format_datetime()) . '
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>';
}

function ln_email_cta_button(string $url, string $label, string $accentHex = '#4f46e5'): string {
    $accent = preg_match('/^#[0-9a-fA-F]{6}$/', $accentHex) ? $accentHex : '#4f46e5';
    return '<div style="margin:22px 0 8px 0;">
      <a href="' . ln_html_escape($url) . '" style="display:inline-block;background:' . $accent . ';color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:12px;">' . ln_html_escape($label) . '</a>
    </div>
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;line-height:1.5;color:#64748b;word-break:break-all;">
      Or copy this link: ' . ln_html_escape($url) . '
    </div>';
}

function ln_render_smtp_test_email_html(?string $toEmail = null, string $appName = 'LinkNest'): string {
    $who = $toEmail ? ln_html_escape($toEmail) : 'your inbox';
    $inner = '
      <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
        <div style="font-size:22px;font-weight:900;margin:0 0 10px 0;">Congratulations!</div>
        <div style="font-size:14px;line-height:1.6;color:#334155;">
          Your SMTP email configuration is working correctly. This test message confirms that ' . ln_html_escape($appName) . ' can connect and send mail.
        </div>
        <div style="margin-top:16px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;">
          <div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:8px;">Test details</div>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size:13px;color:#334155;padding:3px 0;"><strong>Status:</strong></td>
              <td style="font-size:13px;color:#334155;padding:3px 0;" align="right"><span style="display:inline-block;background:#10b981;color:#fff;padding:4px 10px;border-radius:999px;font-weight:800;font-size:12px;">SUCCESS</span></td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#334155;padding:3px 0;"><strong>Recipient:</strong></td>
              <td style="font-size:13px;color:#334155;padding:3px 0;" align="right">' . $who . '</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#334155;padding:3px 0;"><strong>Time:</strong></td>
              <td style="font-size:13px;color:#334155;padding:3px 0;" align="right">' . ln_html_escape(ln_format_datetime()) . '</td>
            </tr>
          </table>
        </div>
        <div style="margin-top:14px;font-size:13px;line-height:1.6;color:#475569;">
          Next steps: enable email notifications for your monitors and configure recipients/rules as needed.
        </div>
      </div>
    ';
    return ln_email_base_layout(
        'SMTP Configuration Test',
        $appName . ' email delivery check',
        '#6d28d9',
        $inner,
        'SMTP configuration test: success',
        $appName,
        ['footer_label' => 'Sent by ' . $appName . ' Monitoring']
    );
}

function ln_render_auth_smtp_test_email_html(?string $toEmail = null, string $appName = 'LinkNest'): string {
    $who = $toEmail ? ln_html_escape($toEmail) : 'your inbox';
    $accent = ln_email_brand_accent();
    $inner = '
      <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
        <div style="font-size:22px;font-weight:900;margin:0 0 10px 0;">System email is ready</div>
        <div style="font-size:14px;line-height:1.6;color:#334155;">
          This branded test message confirms that ' . ln_html_escape($appName) . ' can send registration, approval, and password recovery emails using your SMTP server.
        </div>
        <div style="margin-top:16px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;">
          <div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:8px;">Test details</div>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size:13px;color:#334155;padding:3px 0;"><strong>Status:</strong></td>
              <td style="font-size:13px;color:#334155;padding:3px 0;" align="right"><span style="display:inline-block;background:#10b981;color:#fff;padding:4px 10px;border-radius:999px;font-weight:800;font-size:12px;">SUCCESS</span></td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#334155;padding:3px 0;"><strong>Recipient:</strong></td>
              <td style="font-size:13px;color:#334155;padding:3px 0;" align="right">' . $who . '</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#334155;padding:3px 0;"><strong>Time:</strong></td>
              <td style="font-size:13px;color:#334155;padding:3px 0;" align="right">' . ln_html_escape(ln_format_datetime()) . '</td>
            </tr>
          </table>
        </div>
      </div>
    ';
    return ln_email_base_layout(
        'System Email Test',
        $appName . ' transactional mail check',
        $accent,
        $inner,
        'System email test: success',
        $appName,
        ['footer_label' => 'Sent by ' . $appName]
    );
}

function ln_render_auth_smtp_test_email_text(?string $toEmail = null, string $appName = 'LinkNest'): string {
    $who = $toEmail ?: 'your inbox';
    return "System Email Test\n\n" .
        "Status: SUCCESS\n" .
        "Recipient: {$who}\n" .
        "Time: " . ln_format_datetime() . "\n\n" .
        "This branded test message confirms that {$appName} can send registration, approval, and password recovery emails.\n";
}

function ln_render_user_registered_email_html(string $username, string $appName = 'LinkNest', ?string $loginUrl = null): string {
    $accent = ln_email_brand_accent();
    $loginUrl = $loginUrl ?: (ln_email_public_base_url() . '/#/signin');
    $inner = '
      <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
        <div style="font-size:18px;font-weight:900;margin:0 0 10px 0;">Welcome, ' . ln_html_escape($username) . '</div>
        <div style="font-size:14px;line-height:1.6;color:#334155;">
          Your ' . ln_html_escape($appName) . ' account was created successfully and is <strong>pending admin approval</strong>. You will receive another email when an administrator approves your account.
        </div>
        ' . ln_email_cta_button($loginUrl, 'Go to ' . $appName, $accent) . '
      </div>
    ';
    return ln_email_base_layout(
        'Registration received',
        'Your account is awaiting approval',
        $accent,
        $inner,
        'Your ' . $appName . ' account is pending approval',
        $appName
    );
}

function ln_render_user_registered_email_text(string $username, string $appName = 'LinkNest', ?string $loginUrl = null): string {
    $loginUrl = $loginUrl ?: (ln_email_public_base_url() . '/#/signin');
    return "Welcome, {$username}\n\n" .
        "Your {$appName} account was created successfully and is pending admin approval.\n" .
        "You will receive another email when an administrator approves your account.\n\n" .
        "Sign in: {$loginUrl}\n";
}

function ln_render_admin_new_registration_email_html(string $username, string $email, string $appName = 'LinkNest', ?string $adminUrl = null): string {
    $accent = ln_email_brand_accent();
    $adminUrl = $adminUrl ?: (ln_email_public_base_url() . '/#/admin');
    $inner = '
      <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
        <div style="font-size:18px;font-weight:900;margin:0 0 10px 0;">New user pending approval</div>
        <div style="font-size:14px;line-height:1.6;color:#334155;margin-bottom:14px;">
          A new local user registered on ' . ln_html_escape($appName) . ' and is waiting for approval.
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size:13px;color:#334155;padding:4px 0;"><strong>Username</strong></td>
              <td style="font-size:13px;color:#334155;padding:4px 0;" align="right">' . ln_html_escape($username) . '</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#334155;padding:4px 0;"><strong>Email</strong></td>
              <td style="font-size:13px;color:#334155;padding:4px 0;" align="right">' . ln_html_escape($email) . '</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#334155;padding:4px 0;"><strong>Time</strong></td>
              <td style="font-size:13px;color:#334155;padding:4px 0;" align="right">' . ln_html_escape(ln_format_datetime()) . '</td>
            </tr>
          </table>
        </div>
        ' . ln_email_cta_button($adminUrl, 'Review in Admin', $accent) . '
      </div>
    ';
    return ln_email_base_layout(
        'New registration',
        'Action required: approve or reject',
        $accent,
        $inner,
        'New user pending approval: ' . $username,
        $appName
    );
}

function ln_render_admin_new_registration_email_text(string $username, string $email, string $appName = 'LinkNest', ?string $adminUrl = null): string {
    $adminUrl = $adminUrl ?: (ln_email_public_base_url() . '/#/admin');
    return "New user pending approval\n\n" .
        "Username: {$username}\n" .
        "Email: {$email}\n" .
        "Time: " . ln_format_datetime() . "\n\n" .
        "Review in Admin: {$adminUrl}\n";
}

function ln_render_user_approved_email_html(string $username, string $appName = 'LinkNest', ?string $loginUrl = null): string {
    $accent = ln_email_brand_accent();
    $loginUrl = $loginUrl ?: (ln_email_public_base_url() . '/#/signin');
    $inner = '
      <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
        <div style="font-size:18px;font-weight:900;margin:0 0 10px 0;">You\'re approved, ' . ln_html_escape($username) . '</div>
        <div style="font-size:14px;line-height:1.6;color:#334155;">
          An administrator approved your ' . ln_html_escape($appName) . ' account. You can sign in now with your username and password.
        </div>
        ' . ln_email_cta_button($loginUrl, 'Sign in to ' . $appName, $accent) . '
      </div>
    ';
    return ln_email_base_layout(
        'Account approved',
        'You can sign in now',
        '#10b981',
        $inner,
        'Your ' . $appName . ' account was approved',
        $appName
    );
}

function ln_render_user_approved_email_text(string $username, string $appName = 'LinkNest', ?string $loginUrl = null): string {
    $loginUrl = $loginUrl ?: (ln_email_public_base_url() . '/#/signin');
    return "You're approved, {$username}\n\n" .
        "An administrator approved your {$appName} account. You can sign in now.\n\n" .
        "Sign in: {$loginUrl}\n";
}

function ln_render_password_reset_email_html(string $username, string $resetUrl, string $appName = 'LinkNest', int $expiresMinutes = 60): string {
    $accent = ln_email_brand_accent();
    $inner = '
      <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
        <div style="font-size:18px;font-weight:900;margin:0 0 10px 0;">Reset your password</div>
        <div style="font-size:14px;line-height:1.6;color:#334155;">
          Hi ' . ln_html_escape($username) . ', we received a request to reset your ' . ln_html_escape($appName) . ' password. This link expires in ' . (int)$expiresMinutes . ' minutes.
        </div>
        ' . ln_email_cta_button($resetUrl, 'Reset password', $accent) . '
        <div style="margin-top:16px;font-size:13px;line-height:1.6;color:#64748b;">
          If you did not request this, you can ignore this email. Your password will stay the same.
        </div>
      </div>
    ';
    return ln_email_base_layout(
        'Password recovery',
        'Secure link for your local account',
        $accent,
        $inner,
        'Reset your ' . $appName . ' password',
        $appName
    );
}

function ln_render_password_reset_email_text(string $username, string $resetUrl, string $appName = 'LinkNest', int $expiresMinutes = 60): string {
    return "Reset your password\n\n" .
        "Hi {$username}, we received a request to reset your {$appName} password.\n" .
        "This link expires in {$expiresMinutes} minutes:\n\n" .
        "{$resetUrl}\n\n" .
        "If you did not request this, ignore this email.\n";
}

function ln_render_monitor_status_email_html(string $monitorName, string $target, string $status, string $details, $responseTimeMs, ?int $ts = null, ?string $customMessageText = null, string $appName = 'LinkNest'): string {
    $ts = $ts ?? time();
    $statusLabel = ln_format_status_label($status);

    $accent = '#0ea5e9';
    $pillBg = '#64748b';
    if (strtolower($status) === 'up') {
        $accent = '#10b981';
        $pillBg = '#10b981';
    } elseif (strtolower($status) === 'down') {
        $accent = '#ef4444';
        $pillBg = '#ef4444';
    } elseif (strtolower($status) === 'warning') {
        $accent = '#f59e0b';
        $pillBg = '#f59e0b';
    }

    $safeDetails = nl2br(ln_html_escape($details));
    $safeCustom = $customMessageText !== null && trim($customMessageText) !== ''
        ? '<div style="margin-top:16px;">
             <div style="font-size:13px;font-weight:900;color:#0f172a;margin-bottom:8px;">Message</div>
             <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;font-size:12px;line-height:1.6;color:#0f172a;">' . nl2br(ln_html_escape($customMessageText)) . '</div>
           </div>'
        : '';

    $inner = '
      <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="font-size:18px;font-weight:900;margin:0;">' . ln_html_escape($monitorName) . '</div>
          <div>
            <span style="display:inline-block;background:' . $pillBg . ';color:#fff;padding:6px 12px;border-radius:999px;font-weight:900;font-size:12px;letter-spacing:0.6px;">' . ln_html_escape($statusLabel) . '</span>
          </div>
        </div>

        <div style="margin-top:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:14px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="font-size:13px;color:#334155;padding:4px 0;"><strong>Target</strong></td>
              <td style="font-size:13px;color:#334155;padding:4px 0;" align="right">' . ln_html_escape($target) . '</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#334155;padding:4px 0;"><strong>Response time</strong></td>
              <td style="font-size:13px;color:#334155;padding:4px 0;" align="right">' . ln_html_escape(ln_format_response_time($responseTimeMs)) . '</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#334155;padding:4px 0;"><strong>Time</strong></td>
              <td style="font-size:13px;color:#334155;padding:4px 0;" align="right">' . ln_html_escape(date('Y-m-d H:i:s', $ts)) . '</td>
            </tr>
          </table>
        </div>

        <div style="margin-top:16px;">
          <div style="font-size:13px;font-weight:900;color:#0f172a;margin-bottom:8px;">Details</div>
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-left:5px solid ' . $accent . ';border-radius:14px;padding:12px 14px;font-size:13px;line-height:1.6;color:#334155;">' . $safeDetails . '</div>
        </div>
        ' . $safeCustom . '
      </div>
    ';

    $pre = $statusLabel . ' - ' . $monitorName . ' (' . ln_format_response_time($responseTimeMs) . ')';
    return ln_email_base_layout(
        'Monitor Status Update',
        'Real-time status change notification',
        $accent,
        $inner,
        $pre,
        $appName,
        ['footer_label' => 'Sent by ' . $appName . ' Monitoring']
    );
}

function ln_render_smtp_test_email_text(?string $toEmail = null, string $appName = 'LinkNest'): string {
    $who = $toEmail ?: 'your inbox';
    return "SMTP Configuration Test\n\n" .
        "Status: SUCCESS\n" .
        "Recipient: {$who}\n" .
        "Time: " . ln_format_datetime() . "\n\n" .
        "Your SMTP email configuration is working correctly. This test message confirms that {$appName} can connect and send mail.\n";
}

function ln_render_monitor_status_email_text(string $monitorName, string $target, string $status, string $details, $responseTimeMs, ?int $ts = null, ?string $customMessageText = null): string {
    $ts = $ts ?? time();
    $lines = [];
    $lines[] = ln_format_status_label($status) . ': ' . $monitorName;
    $lines[] = 'Target: ' . $target;
    $lines[] = 'Response: ' . ln_format_response_time($responseTimeMs);
    $lines[] = 'Time: ' . date('Y-m-d H:i:s', $ts);
    $lines[] = '';
    $lines[] = 'Details:';
    $lines[] = (string)$details;
    if ($customMessageText !== null && trim($customMessageText) !== '') {
        $lines[] = '';
        $lines[] = 'Message:';
        $lines[] = $customMessageText;
    }
    $lines[] = '';
    return implode("\n", $lines);
}
