<?php
/**
 * Simple SMTP Mailer for LinkNest
 * Does not depend on external libraries (PHPMailer etc)
 */

function isValidEmailLocal($email) {
    $email = trim((string)$email);
    if ($email === '') return false;
    if (filter_var($email, FILTER_VALIDATE_EMAIL)) return true;
    // Allow localhost / loopback for local testing
    return (bool)preg_match('/^[^\s@]+@([^\s@]+\.[^\s@]+|localhost|127\.0\.0\.1|::1)$/i', $email);
}

function normalizeEmailList($emails) {
    $list = [];
    if ($emails === null) return $list;
    if (is_string($emails)) {
        $emails = preg_split('/[,\n]+/', $emails);
    }
    if (!is_array($emails)) return $list;

    foreach ($emails as $email) {
        $email = trim((string)$email);
        if ($email === '') continue;
        if (isValidEmailLocal($email)) {
            $list[] = $email;
        }
    }

    // de-dupe (case-insensitive)
    $deduped = [];
    $seen = [];
    foreach ($list as $e) {
        $k = strtolower($e);
        if (isset($seen[$k])) continue;
        $seen[$k] = true;
        $deduped[] = $e;
    }
    return $deduped;
}

function sendEmail($to, $subject, $body, $config = null, $cc = [], $options = []) {
    $toList = normalizeEmailList($to);
    $ccList = normalizeEmailList($cc);
    return sendEmailMulti($toList, $ccList, $subject, $body, $config, $options);
}

/**
 * Send email to multiple To recipients and CC recipients.
 * - For SMTP: issues RCPT TO for each recipient (to+cc), and adds "To:" and "Cc:" headers.
 * - For PHP mail(): passes combined To string and includes Cc header.
 */
function sendEmailMulti(array $toList, array $ccList, $subject, $body, $config = null, $options = []) {
    $toHeader = implode(', ', $toList);
    $ccHeader = implode(', ', $ccList);
    $allRecipients = array_values(array_unique(array_merge($toList, $ccList)));

    error_log("[EMAIL] sendEmailMulti called - to: $toHeader, cc: $ccHeader, subject: $subject");
    if (empty($allRecipients)) {
        return "No valid recipients (To/CC)";
    }
    
    // If config not provided, load from DB
    if ($config === null) {
        error_log("[EMAIL] Loading SMTP config from database");
        $db = getDB();
        
        // Try to load from new smtp_servers table first
        $stmt = $db->prepare("SELECT * FROM smtp_servers WHERE is_active = 1 LIMIT 1");
        $stmt->execute();
        $server = $stmt->fetch();
        
        if ($server) {
            // Use the active SMTP server from smtp_servers table
            $config = [
                'host' => $server['host'],
                'port' => $server['port'],
                'username' => $server['username'],
                'password' => base64_decode($server['password']),
                'from_email' => $server['from_email'],
                'from_name' => $server['from_name'],
                'encryption' => $server['encryption'],
                'enabled' => $server['is_enabled'] ? '1' : '0',
                'pause_start' => $server['pause_start'],
                'pause_end' => $server['pause_end']
            ];
            
            error_log("[EMAIL] SMTP config loaded from smtp_servers - enabled: " . $config['enabled'] . ", host: " . $config['host']);
        } else {
            // Fallback to legacy settings table (for backward compatibility during migration)
            error_log("[EMAIL] No active SMTP server found in smtp_servers table, checking legacy settings");
            $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'smtp_%'");
            $stmt->execute();
            $rows = $stmt->fetchAll();
            
            $config = [];
            foreach ($rows as $row) {
                $key = str_replace('smtp_', '', $row['key']);
                $config[$key] = $row['value'];
            }
            
            error_log("[EMAIL] SMTP config loaded from legacy settings - enabled: " . ($config['enabled'] ?? 'not set') . ", host: " . ($config['host'] ?? 'not set'));
            
            // Decoding password
            if (isset($config['password'])) {
                $config['password'] = base64_decode($config['password']);
            }
        }
        
        // Check if enabled
        if (empty($config['enabled']) || ($config['enabled'] !== '1' && $config['enabled'] !== 'true')) {
            error_log("[EMAIL] SMTP disabled, falling back to PHP mail()");
            // SMTP disabled, fall back to mail()
            $headers = "MIME-Version: 1.0\r\n";
            $headers .= "From: noreply@linknest.local\r\n";
            if (!empty($ccHeader)) {
                $headers .= "Cc: $ccHeader\r\n";
            }

            $contentType = "text/plain; charset=UTF-8";
            $mailBody = (string)$body;
            if (is_array($options)) {
                if (!empty($options['html'])) {
                    $boundary = 'ln_' . bin2hex(random_bytes(8));
                    $contentType = 'multipart/alternative; boundary="' . $boundary . '"';
                    $textPart = (string)($options['text'] ?? $body);
                    $htmlPart = (string)$options['html'];
                    $mailBody =
                        "--{$boundary}\r\n" .
                        "Content-Type: text/plain; charset=UTF-8\r\n\r\n" .
                        $textPart . "\r\n" .
                        "--{$boundary}\r\n" .
                        "Content-Type: text/html; charset=UTF-8\r\n\r\n" .
                        $htmlPart . "\r\n" .
                        "--{$boundary}--\r\n";
                } elseif (!empty($options['is_html'])) {
                    $contentType = "text/html; charset=UTF-8";
                }
            }

            $headers .= "Content-Type: {$contentType}\r\n";
            $mailResult = @mail($toHeader, $subject, $mailBody, $headers);
            error_log("[EMAIL] PHP mail() result: " . ($mailResult ? "SUCCESS" : "FAILED"));
            return $mailResult ? true : "PHP mail() failed";
        }
    }

    $host = $config['host'];
    $port = $config['port'] ?? 587;
    $username = $config['username'];
    $password = $config['password'];
    $fromEmail = $config['from_email'];
    $fromName = $config['from_name'] ?? 'LinkNest Monitor';
    $encryption = $config['encryption'] ?? 'tls'; // ssl, tls, none

    error_log("[EMAIL] SMTP config - host: $host, port: $port, encryption: $encryption, from: $fromEmail");

    if (empty($host) || empty($fromEmail)) {
        error_log("[EMAIL] ERROR: Missing SMTP configuration (host or from_email)");
        return "Missing SMTP configuration (host or from_email)";
    }

    error_log("[EMAIL] Attempting to connect to SMTP server: $host:$port");
    $timeout = 30;
    $socketContext = stream_context_create([
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
            'allow_self_signed' => true
        ]
    ]);

    $protocol = '';
    if ($encryption === 'ssl') {
        $protocol = 'ssl://';
    }

    $socket = stream_socket_client($protocol . $host . ':' . $port, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT, $socketContext);

    if (!$socket) {
        error_log("[EMAIL] ERROR: Connection failed - $errno $errstr");
        return "Connection failed: $errno $errstr";
    }
    
    error_log("[EMAIL] Connected to SMTP server successfully");

    // Helper to read server response
    $read = function() use ($socket) {
        $response = '';
        while ($str = fgets($socket, 515)) {
            $response .= $str;
            if (substr($str, 3, 1) == ' ') break;
        }
        return $response;
    };

    // Helper to write command
    $write = function($cmd) use ($socket) {
        fputs($socket, $cmd . "\r\n");
    };

    $read(); // Read greeting
    error_log("[EMAIL] Received SMTP greeting");

    $ehloHost = $_SERVER['SERVER_NAME'] ?? 'localhost';
    $write('EHLO ' . $ehloHost);
    $read();
    error_log("[EMAIL] Sent EHLO command");

    if ($encryption === 'tls') {
        error_log("[EMAIL] Starting TLS encryption");
        $write('STARTTLS');
        $response = $read();
        if (substr($response, 0, 3) != '220') {
            error_log("[EMAIL] ERROR: STARTTLS failed: $response");
            return "STARTTLS failed: $response";
        }
        stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        error_log("[EMAIL] TLS encryption enabled");
        $write('EHLO ' . $ehloHost);
        $read();
    }

    if (!empty($username) && !empty($password)) {
        error_log("[EMAIL] Attempting SMTP authentication");
        $write('AUTH LOGIN');
        $read();
        $write(base64_encode($username));
        $read();
        $write(base64_encode($password));
        $response = $read();
        if (substr($response, 0, 3) != '235') {
            error_log("[EMAIL] ERROR: Auth failed: $response");
            return "Auth failed: $response";
        }
        error_log("[EMAIL] SMTP authentication successful");
    } else {
        error_log("[EMAIL] No authentication credentials provided");
    }

    error_log("[EMAIL] Setting MAIL FROM: $fromEmail");
    $write("MAIL FROM: <$fromEmail>");
    $response = $read();
    if (substr($response, 0, 3) != '250') {
        error_log("[EMAIL] ERROR: MAIL FROM failed: $response");
        return "MAIL FROM failed: $response";
    }

    foreach ($allRecipients as $rcpt) {
        error_log("[EMAIL] Setting RCPT TO: $rcpt");
        $write("RCPT TO: <$rcpt>");
        $response = $read();
        if (substr($response, 0, 3) != '250' && substr($response, 0, 3) != '251') {
            error_log("[EMAIL] ERROR: RCPT TO failed for $rcpt: $response");
            return "RCPT TO failed for $rcpt: $response";
        }
    }

    error_log("[EMAIL] Sending DATA command");
    $write('DATA');
    $response = $read();
    if (substr($response, 0, 3) != '354') {
        error_log("[EMAIL] ERROR: DATA failed: $response");
        return "DATA failed: $response";
    }

    $contentType = "text/plain; charset=UTF-8";
    $smtpBody = (string)$body;

    if (is_array($options)) {
        if (!empty($options['html'])) {
            $boundary = 'ln_' . bin2hex(random_bytes(8));
            $contentType = 'multipart/alternative; boundary="' . $boundary . '"';
            $textPart = (string)($options['text'] ?? $body);
            $htmlPart = (string)$options['html'];
            $smtpBody =
                "--{$boundary}\r\n" .
                "Content-Type: text/plain; charset=UTF-8\r\n\r\n" .
                $textPart . "\r\n" .
                "--{$boundary}\r\n" .
                "Content-Type: text/html; charset=UTF-8\r\n\r\n" .
                $htmlPart . "\r\n" .
                "--{$boundary}--\r\n";
        } elseif (!empty($options['is_html'])) {
            $contentType = "text/html; charset=UTF-8";
        }
    }

    // Dot-stuffing (SMTP transparency)
    $smtpBody = preg_replace("/(^|\\r\\n)\\./", "$1..", $smtpBody);

    $message  = "Date: " . date('r') . "\r\n";
    $message .= "To: $toHeader\r\n";
    if (!empty($ccHeader)) {
        $message .= "Cc: $ccHeader\r\n";
    }
    $message .= "From: $fromName <$fromEmail>\r\n";
    $message .= "Subject: $subject\r\n";
    $message .= "MIME-Version: 1.0\r\n";
    $message .= "Content-Type: {$contentType}\r\n";
    $message .= "\r\n";
    $message .= $smtpBody;
    $message .= "\r\n.";

    error_log("[EMAIL] Sending email message body");
    $write($message);
    $response = $read();
    if (substr($response, 0, 3) != '250') {
        error_log("[EMAIL] ERROR: Message sending failed: $response");
        return "Message sending failed: $response";
    }
    error_log("[EMAIL] Email message sent successfully");

    $write('QUIT');
    fclose($socket);
    error_log("[EMAIL] SMTP connection closed, email sent successfully");

    return true;
}
