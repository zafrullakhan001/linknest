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

function ln_email_base_layout(string $title, string $subtitle, string $accentHex, string $innerHtml, string $preheader = ''): string {
    $safeTitle = ln_html_escape($title);
    $safeSubtitle = ln_html_escape($subtitle);
    $safePreheader = ln_html_escape($preheader);
    $accent = preg_match('/^#[0-9a-fA-F]{6}$/', $accentHex) ? $accentHex : '#4f46e5';

    // Table-based layout for wide email client support
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
                Sent by LinkNest Monitoring • ' . ln_html_escape(ln_format_datetime()) . '
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

function ln_render_smtp_test_email_html(?string $toEmail = null): string {
    $who = $toEmail ? ln_html_escape($toEmail) : 'your inbox';
    $inner = '
      <div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
        <div style="font-size:22px;font-weight:900;margin:0 0 10px 0;">Congratulations!</div>
        <div style="font-size:14px;line-height:1.6;color:#334155;">
          Your SMTP email configuration is working correctly. This test message confirms that LinkNest can connect and send mail.
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
    return ln_email_base_layout('SMTP Configuration Test', 'LinkNest email delivery check', '#6d28d9', $inner, 'SMTP configuration test: success');
}

function ln_render_monitor_status_email_html(string $monitorName, string $target, string $status, string $details, $responseTimeMs, ?int $ts = null, ?string $customMessageText = null): string {
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
    return ln_email_base_layout('Monitor Status Update', 'Real-time status change notification', $accent, $inner, $pre);
}

function ln_render_smtp_test_email_text(?string $toEmail = null): string {
    $who = $toEmail ?: 'your inbox';
    return "SMTP Configuration Test\n\n" .
        "Status: SUCCESS\n" .
        "Recipient: {$who}\n" .
        "Time: " . ln_format_datetime() . "\n\n" .
        "Your SMTP email configuration is working correctly.\n";
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

