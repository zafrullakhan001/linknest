<?php
/**
 * Server-Side URL Link Checker
 * Measures latency from the server's perspective for comparison with client-side measurements
 */

require_once __DIR__ . '/api/config_analytics.php';

class ServerLinkChecker {
    private $db;
    private $analyticsDB;
    
    public function __construct() {
        $this->db = getDB(); // Main SQLite DB
        $this->analyticsDB = getAnalyticsPDO(); // PostgreSQL analytics DB
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
            curl_close($ch);
            
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
     * Store server-side measurement result
     * 
     * @param array $result
     * @return void
     */
    private function storeResult(array $result): void {
        try {
            // Insert directly into performance_metrics table
            $stmt = $this->analyticsDB->prepare("
                INSERT INTO performance_metrics (
                    time, link_url, measurement_type,
                    dns_lookup_time, tcp_connection_time, tls_handshake_time,
                    time_to_first_byte, full_response_time,
                    http_status_code, error_message,
                    country_code, country_name, region_name
                ) VALUES (
                    NOW(), :link_url, 'server',
                    :dns_lookup_time, :tcp_connection_time, :tls_handshake_time,
                    :time_to_first_byte, :full_response_time,
                    :http_status_code, :error_message,
                    'SV', 'Server', 'Data Center'
                )
            ");
            
            $stmt->execute([
                'link_url' => $result['url'],
                'dns_lookup_time' => $result['dns_time'] ?? null,
                'tcp_connection_time' => $result['tcp_time'] ?? null,
                'tls_handshake_time' => $result['tls_time'] ?? null,
                'time_to_first_byte' => $result['ttfb'] ?? null,
                'full_response_time' => $result['total_time'] ?? 0,
                'http_status_code' => $result['http_status'] ?? null,
                'error_message' => $result['error'] ?? null
            ]);
            
        } catch (Exception $e) {
            error_log("Failed to store server measurement: " . $e->getMessage());
        }
    }
}
