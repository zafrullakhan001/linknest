<?php
/**
 * Server-Side URL Link Checker
 * Measures latency from the server's perspective for comparison with client-side measurements
 */

require_once __DIR__ . '/api/config_analytics.php';

class ServerLinkChecker {
    private $db;
    private $analyticsDB;

    /** Cached server public IP for geolocation (resolved by queue processor) */
    private $serverPublicIp;

    public function __construct() {
        $this->db = getDB(); // Main SQLite DB
        $this->analyticsDB = getAnalyticsPDO(); // PostgreSQL analytics DB
    }

    /**
     * Get this server's public IP for geolocation in payloads.
     * Tries: (1) configured setting, (2) HTTP then HTTPS IP services. Cached per process.
     *
     * @return string|null Public IP or null if unable to resolve
     */
    private function getServerPublicIp(): ?string {
        if ($this->serverPublicIp !== null) {
            return $this->serverPublicIp ?: null;
        }
        // 1) Optional override from app settings (Settings â†’ Performance Analytics)
        try {
            $stmt = $this->db->prepare("SELECT value FROM settings WHERE key = 'performance_analytics_server_public_ip' LIMIT 1");
            $stmt->execute();
            $configured = $stmt->fetchColumn();
            if (is_string($configured)) {
                $configured = trim($configured);
                if ($configured !== '' && filter_var($configured, FILTER_VALIDATE_IP)) {
                    $this->serverPublicIp = $configured;
                    return $configured;
                }
            }
        } catch (Exception $e) {
            // ignore
        }
        // 2) Try HTTP first (avoids SSL/cacert issues on XAMPP/Windows), then HTTPS
        $urls = [
            'http://api.ipify.org',           // HTTP plain
            'http://api.ipify.org?format=json',
            'http://icanhazip.com',
            'https://api.ipify.org',
            'https://api.ipify.org?format=json',
            'https://icanhazip.com',
        ];
        $ip = $this->fetchIpWithCurl($urls);
        if ($ip === null && function_exists('file_get_contents') && ini_get('allow_url_fopen')) {
            $ip = $this->fetchIpWithFileGetContents([
                'http://api.ipify.org',
                'http://icanhazip.com',
            ]);
        }
        if ($ip !== null) {
            $this->serverPublicIp = $ip;
            return $ip;
        }
        $this->serverPublicIp = '';
        error_log('Server link checker: could not resolve server public IP for geolocation. Set settings key performance_analytics_server_public_ip to your server IP to fix.');
        return null;
    }

    /**
     * Try to fetch public IP via cURL (HTTP or HTTPS).
     * @param array $urls List of URLs returning IP (plain text or JSON with "ip" key)
     * @return string|null Valid IP or null
     */
    private function fetchIpWithCurl(array $urls): ?string {
        foreach ($urls as $url) {
            $ch = curl_init($url);
            if ($ch === false) {
                continue;
            }
            $opts = [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 5,
                CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_USERAGENT => 'LinkNest-Analytics/1.0 (Server Check)',
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 2,
            ];
            // Relax SSL for HTTPS if cacert is missing (common on XAMPP)
            if (stripos($url, 'https://') === 0) {
                $opts[CURLOPT_SSL_VERIFYPEER] = false;
                $opts[CURLOPT_SSL_VERIFYHOST] = 0;
            }
            curl_setopt_array($ch, $opts);
            $response = curl_exec($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            if ($code !== 200 || $response === false || $response === '') {
                continue;
            }
            $response = trim($response);
            if (strpos($url, 'format=json') !== false) {
                $data = json_decode($response, true);
                $ip = is_array($data) ? ($data['ip'] ?? null) : null;
            } else {
                $ip = $response;
            }
            if (is_string($ip) && $ip !== '' && filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
        return null;
    }

    /**
     * Fallback: fetch public IP via file_get_contents (when cURL fails or SSL broken).
     * @param array $urls HTTP URLs only (plain text IP)
     * @return string|null Valid IP or null
     */
    private function fetchIpWithFileGetContents(array $urls): ?string {
        $ctx = stream_context_create([
            'http' => [
                'timeout' => 4,
                'user_agent' => 'LinkNest-Analytics/1.0 (Server Check)',
            ],
        ]);
        foreach ($urls as $url) {
            try {
                $response = @file_get_contents($url, false, $ctx);
                if ($response === false || $response === '') {
                    continue;
                }
                $ip = trim($response);
                if ($ip !== '' && filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            } catch (Exception $e) {
                // next URL
            }
        }
        return null;
    }
    
    /**
     * Check a single URL from server side
     * 
     * @param string $url
     * @return array
     */
    public function checkUrl(string $url): array {
        $start = microtime(true);
        $result = [
            'url' => $url,
            'measurement_type' => 'server',
            'success' => false,
            'timestamp' => time()
        ];
        
        try {
            $ch = curl_init($url);
            
            // Configure curl for detailed timing
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 3,
                CURLOPT_TIMEOUT => 10,
                CURLOPT_CONNECTTIMEOUT => 5,
                CURLOPT_NOBODY => true,  // HEAD request only (faster)
                CURLOPT_SSL_VERIFYPEER => false, // Skip SSL verification for testing
                CURLOPT_SSL_VERIFYHOST => false,
                CURLOPT_USERAGENT => 'LinkNest-Analytics/1.0 (Server Check)',
                CURLOPT_ENCODING => '', // Accept all encodings
            ]);
            
            $response = curl_exec($ch);
            $info = curl_getinfo($ch);
            $error = curl_error($ch);
            if ($info['http_code'] > 0) {
                $result['success'] = true;
                $result['http_status'] = $info['http_code'];
                
                // Extract timing information (in seconds, convert to milliseconds)
                $result['dns_time'] = (int)($info['namelookup_time'] * 1000);
                $result['tcp_time'] = (int)(($info['connect_time'] - $info['namelookup_time']) * 1000);
                // appconnect_time may not exist for non-HTTPS connections
                $appconnectTime = $info['appconnect_time'] ?? 0;
                $result['tls_time'] = ($appconnectTime > 0 && isset($info['connect_time']))
                    ? (int)(($appconnectTime - $info['connect_time']) * 1000) 
                    : 0;
                // Calculate TTFB (time to first byte)
                $pretransferTime = $info['pretransfer_time'] ?? $info['connect_time'] ?? 0;
                $result['ttfb'] = isset($info['starttransfer_time']) && $pretransferTime > 0
                    ? (int)(($info['starttransfer_time'] - $pretransferTime) * 1000)
                    : 0;
                $result['total_time'] = (int)($info['total_time'] * 1000);
                $result['redirect_count'] = $info['redirect_count'];
                $result['size_download'] = $info['size_download'];
                $result['speed_download'] = $info['speed_download'];
            } else {
                $result['error'] = $error ?: 'Unknown error';
                $result['total_time'] = (int)((microtime(true) - $start) * 1000);
            }
            
        } catch (Exception $e) {
            $result['error'] = $e->getMessage();
            $result['total_time'] = (int)((microtime(true) - $start) * 1000);
        }
        
        // Store result
        $this->storeResult($result);
        
        return $result;
    }
    
    /**
     * Get all links that need checking from main database
     * 
     * @return array
     */
    public function getLinksToCheck(): array {
        try {
            // Get URLs from links table
            $stmt = $this->db->query("
                SELECT DISTINCT url 
                FROM links 
                WHERE url IS NOT NULL AND url != ''
                ORDER BY id DESC
                LIMIT 100
            ");
            return $stmt->fetchAll(PDO::FETCH_COLUMN);
        } catch (Exception $e) {
            error_log("Failed to get links to check: " . $e->getMessage());
            return [];
        }
    }
    
    /**
     * Check all configured links
     * 
     * @return array
     */
    public function checkAllLinks(): array {
        $links = $this->getLinksToCheck();
        $results = [];
        
        if (empty($links)) {
            echo "No links to check\n";
            return [];
        }
        
        foreach ($links as $url) {
            $results[] = $this->checkUrl($url);
            usleep(100000); // 100ms delay between checks to avoid overwhelming servers
        }
        
        return $results;
    }
    
    /**
     * Store server-side measurement result by enqueuing a payload for the metrics processor.
     * Payload shape matches client metrics so process-metrics-queue.php can insert into performance_metrics.
     *
     * @param array $result From checkUrl(): url, measurement_type, success, timestamp, total_time, dns_time, tcp_time, tls_time, ttfb, http_status, error, etc.
     * @return void
     */
    private function storeResult(array $result): void {
        $linkUrl = $result['url'] ?? '';
        if ($linkUrl === '') {
            return;
        }
        $timestamp = $result['timestamp'] ?? time();
        $payload = [
            'link_url' => $linkUrl,
            'measurement_type' => 'server',
            'user_id' => null,
            'username' => null,
            'session_id' => '',
            'ip_address' => $this->getServerPublicIp(),
            'time' => date('c', $timestamp),
            'full_response_time' => (int)($result['total_time'] ?? 0),
            'dns_lookup_time' => (int)($result['dns_time'] ?? 0),
            'tcp_connection_time' => (int)($result['tcp_time'] ?? 0),
            'tls_handshake_time' => (int)($result['tls_time'] ?? 0),
            'time_to_first_byte' => (int)($result['ttfb'] ?? 0),
            'http_status_code' => $result['success'] ? (int)($result['http_status'] ?? 200) : 0,
            'page_size_bytes' => isset($result['size_download']) ? (int)$result['size_download'] : null,
            'device_type' => 'server',
            'browser_name' => '',
            'browser_version' => '',
            'os_name' => '',
            'screen_resolution' => '',
            'connection_type' => '',
            'error_message' => $result['success'] ? null : (isset($result['error']) ? substr((string)$result['error'], 0, 500) : 'Check failed'),
            'link_id' => null,
            'page_url' => null,
        ];
        try {
            $stmt = $this->analyticsDB->prepare("
                INSERT INTO metrics_queue (payload, created_at)
                VALUES (:payload::jsonb, NOW())
            ");
            $stmt->execute(['payload' => json_encode($payload)]);
            $this->analyticsDB->exec('NOTIFY metrics_inserted');
        } catch (Exception $e) {
            error_log('Server link checker: failed to enqueue result: ' . $e->getMessage());
        }
    }
}
