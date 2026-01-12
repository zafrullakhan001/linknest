<?php
/**
 * Simple SMTP Mailer for LinkNest
 * Does not depend on external libraries (PHPMailer etc)
 */

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
        if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
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

function sendEmail($to, $subject, $body, $config = null, $cc = []) {
    $toList = normalizeEmailList($to);
    $ccList = normalizeEmailList($cc);
    return sendEmailMulti($toList, $ccList, $subject, $body, $config);
}

/**
 * Send email to multiple To recipients and CC recipients.
 * - For SMTP: issues RCPT TO for each recipient (to+cc), and adds "To:" and "Cc:" headers.
 * - For PHP mail(): passes combined To string and includes Cc header.
 */
function sendEmailMulti(array $toList, array $ccList, $subject, $body, $config = null) {
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
        $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'smtp_%'");
        $stmt->execute();
        $rows = $stmt->fetchAll();
        
        $config = [];
        foreach ($rows as $row) {
            $key = str_replace('smtp_', '', $row['key']);
            $config[$key] = $row['value'];
        }
        
        error_log("[EMAIL] SMTP config loaded - enabled: " . ($config['enabled'] ?? 'not set') . ", host: " . ($config['host'] ?? 'not set'));
        
        // Decoding password
        if (isset($config['password'])) {
            $config['password'] = base64_decode($config['password']);
        }
        
        // Check if enabled
        if (empty($config['enabled']) || ($config['enabled'] !== '1' && $config['enabled'] !== 'true')) {
            error_log("[EMAIL] SMTP disabled, falling back to PHP mail()");
            // SMTP disabled, fall back to mail()
            $headers = "From: noreply@linknest.local\r\n";
            if (!empty($ccHeader)) {
                $headers .= "Cc: $ccHeader\r\n";
            }
            $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
            $mailResult = @mail($toHeader, $subject, $body, $headers);
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

    $write('EHLO ' . $_SERVER['SERVER_NAME']);
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
        $write('EHLO ' . $_SERVER['SERVER_NAME']);
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

    $message  = "Date: " . date('r') . "\r\n";
    $message .= "To: $toHeader\r\n";
    if (!empty($ccHeader)) {
        $message .= "Cc: $ccHeader\r\n";
    }
    $message .= "From: $fromName <$fromEmail>\r\n";
    $message .= "Subject: $subject\r\n";
    $message .= "MIME-Version: 1.0\r\n";
    $message .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $message .= "\r\n";
    $message .= $body;
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
