<?php
/**
 * Simple SMTP Mailer for LinkNest
 * Does not depend on external libraries (PHPMailer etc)
 */

 function sendEmail($to, $subject, $body, $config = null) {
    // If config not provided, load from DB
    if ($config === null) {
        $db = getDB();
        $stmt = $db->prepare("SELECT key, value FROM settings WHERE key LIKE 'smtp_%'");
        $stmt->execute();
        $rows = $stmt->fetchAll();
        
        $config = [];
        foreach ($rows as $row) {
            $key = str_replace('smtp_', '', $row['key']);
            $config[$key] = $row['value'];
        }
        
        // Decoding password
        if (isset($config['password'])) {
            $config['password'] = base64_decode($config['password']);
        }
        
        // Check if enabled
        if (empty($config['enabled']) || ($config['enabled'] !== '1' && $config['enabled'] !== 'true')) {
            // SMTP disabled, fall back to mail()
            $headers = "From: noreply@linknest.local\r\n";
            $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
            return @mail($to, $subject, $body, $headers) ? true : "PHP mail() failed";
        }
    }

    $host = $config['host'];
    $port = $config['port'] ?? 587;
    $username = $config['username'];
    $password = $config['password'];
    $fromEmail = $config['from_email'];
    $fromName = $config['from_name'] ?? 'LinkNest Monitor';
    $encryption = $config['encryption'] ?? 'tls'; // ssl, tls, none

    if (empty($host) || empty($fromEmail)) {
        return "Missing SMTP configuration (host or from_email)";
    }

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
        return "Connection failed: $errno $errstr";
    }

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

    $write('EHLO ' . $_SERVER['SERVER_NAME']);
    $read();

    if ($encryption === 'tls') {
        $write('STARTTLS');
        $response = $read();
        if (substr($response, 0, 3) != '220') {
            return "STARTTLS failed: $response";
        }
        stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        $write('EHLO ' . $_SERVER['SERVER_NAME']);
        $read();
    }

    if (!empty($username) && !empty($password)) {
        $write('AUTH LOGIN');
        $read();
        $write(base64_encode($username));
        $read();
        $write(base64_encode($password));
        $response = $read();
        if (substr($response, 0, 3) != '235') {
            return "Auth failed: $response";
        }
    }

    $write("MAIL FROM: <$fromEmail>");
    $response = $read();
    if (substr($response, 0, 3) != '250') return "MAIL FROM failed: $response";

    $write("RCPT TO: <$to>");
    $response = $read();
    if (substr($response, 0, 3) != '250' && substr($response, 0, 3) != '251') return "RCPT TO failed: $response";

    $write('DATA');
    $response = $read();
    if (substr($response, 0, 3) != '354') return "DATA failed: $response";

    $message  = "Date: " . date('r') . "\r\n";
    $message .= "To: <$to>\r\n";
    $message .= "From: $fromName <$fromEmail>\r\n";
    $message .= "Subject: $subject\r\n";
    $message .= "MIME-Version: 1.0\r\n";
    $message .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $message .= "\r\n";
    $message .= $body;
    $message .= "\r\n.";

    $write($message);
    $response = $read();
    if (substr($response, 0, 3) != '250') return "Message sending failed: $response";

    $write('QUIT');
    fclose($socket);

    return true;
}
