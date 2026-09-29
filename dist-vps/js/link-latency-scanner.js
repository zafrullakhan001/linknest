/**
 * Link Latency Scanner
 * Automatically scans all links on the page and measures latency from client's browser
 * Displays "98ms | 122ms" badges showing client vs server latency
 */

(function() {
    'use strict';
    
    console.log('[Analytics] link-latency-scanner.js script loaded');
    
    // Check if analytics is enabled
    if (!window.ANALYTICS_CONFIG || !window.ANALYTICS_CONFIG.enabled) {
        console.log('[Analytics] Analytics not enabled, exiting');
        return;
    }
    
    console.log('[Analytics] Analytics enabled, initializing scanner');
    const config = window.ANALYTICS_CONFIG;
    
    /**
     * LinkLatencyScanner class
     */
    class LinkLatencyScanner {
        constructor(config) {
            this.config = config;
            this.results = new Map();
            this.batchSize = 5; // Test 5 links at a time
            this.delayBetweenBatches = 500; // ms
            this.stats = {
                totalLinks: 0,
                urlsSent: 0,
                urlsFailed: 0,
                status: 'idle', // idle, scanning, complete, error
                lastUpdate: null
            };
        }

        /**
         * Normalize URL for grouping (avoid query/fragment cardinality explosion)
         */
        normalizeUrl(url) {
            try {
                const u = new URL(String(url || '').trim());
                u.hash = '';
                u.search = '';
                u.hostname = u.hostname.toLowerCase();
                if (u.pathname && u.pathname.length > 1) {
                    u.pathname = u.pathname.replace(/\/+$/, '');
                }
                return u.toString();
            } catch {
                return String(url || '').trim();
            }
        }
        
        /**
         * Find all links on the page to test
         */
        findLinks() {
            const links = document.querySelectorAll('a[href^="http"]');
            const uniqueUrls = new Set();
            
            console.log('[Analytics] Found ' + links.length + ' external links on page');
            
            Array.from(links).forEach(function(el) {
                if (el.href && !el.href.includes('#') && !el.classList.contains('no-scan')) {
                    uniqueUrls.add(el.href);
                }
            });
            
            const filtered = Array.from(uniqueUrls).filter(url => this.shouldTest(url));
            console.log('[Analytics] After filtering: ' + filtered.length + ' links to test');
            console.log('[Analytics] URLs to test:', filtered);
            
            return filtered;
        }
        
        /**
         * Test a single URL from client browser
         */
        async testLink(url) {
            const start = performance.now();
            const attemptedAt = Date.now();
            const method = 'HEAD';
            const cacheMode = 'no-cache';
            const timeoutMs = 5000;
            
            try {
                // Use fetch with abort controller for timeout
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), timeoutMs);
                
                const fetchStart = performance.now();
                
                // Try HEAD request first (faster)
                const response = await fetch(url, {
                    method: method,
                    mode: 'no-cors', // Allow cross-origin requests
                    signal: controller.signal,
                    cache: cacheMode
                });
                
                clearTimeout(timeout);
                
                const fetchEnd = performance.now();
                const totalTime = Math.round(fetchEnd - fetchStart);
                
                // Try to get detailed timing from Resource Timing API
                let dns = 0, tcp = 0, tls = 0, ttfb = 0;
                
                const resourceTiming = performance.getEntriesByName(url, 'resource').slice(-1)[0];
                if (resourceTiming) {
                    dns = Math.round(resourceTiming.domainLookupEnd - resourceTiming.domainLookupStart);
                    tcp = Math.round(resourceTiming.connectEnd - resourceTiming.connectStart);
                    tls = resourceTiming.secureConnectionStart > 0 
                        ? Math.round(resourceTiming.connectEnd - resourceTiming.secureConnectionStart) 
                        : 0;
                    ttfb = Math.round(resourceTiming.responseStart - resourceTiming.requestStart);
                }
                
                return {
                    url: url,
                    success: true,
                    ok: true,
                    total_time: totalTime,
                    dns_time: dns,
                    tcp_time: tcp,
                    tls_time: tls,
                    ttfb: ttfb,
                    http_status: (typeof response.status === 'number' ? response.status : 0),
                    response_type: response && response.type ? String(response.type) : null,
                    redirected: !!(response && response.redirected),
                    final_url: response && response.url ? String(response.url) : null,
                    error_category: (response && response.type === 'opaque') ? 'cors_opaque' : null,
                    method: method,
                    cache_mode: cacheMode,
                    timeout_ms: timeoutMs,
                    attempted_at: attemptedAt,
                    timestamp: Math.floor(Date.now() / 1000)
                };
                
            } catch (error) {
                const name = String(error && error.name ? error.name : '');
                const errorCategory = (name === 'AbortError') ? 'timeout' : 'network';
                return {
                    url: url,
                    success: false,
                    ok: false,
                    error: (error && error.message) ? String(error.message) : 'Request failed',
                    error_category: errorCategory,
                    total_time: Math.round(performance.now() - start),
                    method: method,
                    cache_mode: cacheMode,
                    timeout_ms: timeoutMs,
                    attempted_at: attemptedAt,
                    timestamp: Math.floor(Date.now() / 1000)
                };
            }
        }
        
        /**
         * Scan all links on page and send results
         */
        async scanAllLinks() {
            const links = this.findLinks();
            
            // Update stats
            this.stats.totalLinks = links.length;
            this.stats.status = 'scanning';
            this.stats.urlsSent = 0;
            this.stats.urlsFailed = 0;
            this.updateStats();
            
            if (links.length === 0) {
                console.log('[Analytics] No links to scan');
                this.stats.status = 'complete';
                this.updateStats();
                return;
            }
            
            console.log('[Analytics] Scanning ' + links.length + ' links...');
            
            // Test links in batches to avoid overwhelming browser
            for (let i = 0; i < links.length; i += this.batchSize) {
                const batch = links.slice(i, i + this.batchSize);
                const results = await Promise.all(
                    batch.map(url => this.testLink(url))
                );
                
                // Send results to analytics
                this.sendResults(results);
                
                // Update UI with latency values
                await this.updateUI(results);
                
                // Small delay between batches
                if (i + this.batchSize < links.length) {
                    await this.sleep(this.delayBetweenBatches);
                }
            }
            
            this.stats.status = 'complete';
            this.updateStats();
            console.log('[Analytics] Link scan complete');
        }
        
        /**
         * Send results to collection API (one metric per link)
         */
        sendResults(results) {
            let sent = 0;
            let failed = 0;
            
            // Send each result as a separate metric
            for (const result of results) {
                // Detect browser and device info
                const ua = navigator.userAgent;
                const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
                const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/(\d+)/);
                const osMatch = ua.match(/(Windows|Mac|Linux|Android|iOS)/);
                
                const payload = {
                    url: result.url,
                    measurement_type: 'client',
                    full_response_time: result.total_time || 0,
                    dns_lookup_time: result.dns_time || 0,
                    tcp_connection_time: result.tcp_time || 0,
                    tls_handshake_time: result.tls_time || 0,
                    time_to_first_byte: result.ttfb || 0,
                    download_time: 0, // Not available from HEAD request
                    http_status_code: (typeof result.http_status === 'number' ? result.http_status : 0),
                    error_message: result.success ? null : (result.error || 'Request failed'),
                    page_url: (window && window.location) ? window.location.href : null,

                    // New link-level fields for dashboards
                    ok: (typeof result.ok === 'boolean') ? result.ok : !!result.success,
                    error_category: result.error_category || null,
                    response_type: result.response_type || null,
                    redirected: (typeof result.redirected === 'boolean') ? result.redirected : null,
                    final_url: result.final_url || null,
                    method: result.method || 'HEAD',
                    cache_mode: result.cache_mode || 'no-cache',
                    timeout_ms: (typeof result.timeout_ms === 'number') ? result.timeout_ms : 5000,
                    attempted_at: (typeof result.attempted_at === 'number') ? result.attempted_at : Date.now(),
                    link_url_normalized: this.normalizeUrl(result.url),

                    device_type: isMobile ? 'mobile' : 'desktop',
                    browser_name: browserMatch ? browserMatch[1] : 'Unknown',
                    browser_version: browserMatch ? browserMatch[2] : '',
                    os_name: osMatch ? osMatch[1] : 'Unknown',
                    screen_resolution: screen.width + 'x' + screen.height,
                    connection_type: navigator.connection ? (navigator.connection.effectiveType || 'unknown') : 'unknown',
                    user_id: this.config.userId || null,
                    username: this.config.username || null,
                    session_id: this.config.sessionId || '',
                    // Include location data from config
                    country_code: this.config.countryCode || 'XX',
                    region: this.config.region || 'Unknown',
                    city: this.config.city || 'Unknown',
                    latitude: this.config.latitude || 0,
                    longitude: this.config.longitude || 0
                };
                
                const blob = new Blob([JSON.stringify(payload)], {type: 'application/json'});
                
                if (navigator.sendBeacon) {
                    const success = navigator.sendBeacon(this.config.collectUrl, blob);
                    if (success) {
                        sent++;
                    } else {
                        failed++;
                    }
                } else {
                    // Fallback to fetch
                    fetch(this.config.collectUrl, {
                        method: 'POST',
                        body: blob,
                        keepalive: true,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }).then(() => {
                        this.stats.urlsSent++;
                        this.stats.lastUpdate = new Date();
                        this.updateStats();
                    }).catch(e => {
                        this.stats.urlsFailed++;
                        this.stats.lastUpdate = new Date();
                        this.updateStats();
                        console.warn('[Analytics] Failed to send metric for ' + result.url + ':', e);
                    });
                }
            }
            
            // Update stats for beacon (synchronous)
            this.stats.urlsSent += sent;
            this.stats.urlsFailed += failed;
            this.stats.lastUpdate = new Date();
            this.updateStats();
            
            console.log('[Analytics] Sent ' + sent + ' metrics, ' + failed + ' failed');
        }
        
        /**
         * Update stats display widget
         */
        updateStats() {
            // Dispatch custom event for UI to listen to
            window.dispatchEvent(new CustomEvent('analyticsStatsUpdate', {
                detail: { ...this.stats }
            }));
        }
        
        /**
         * Get current stats
         */
        getStats() {
            return { ...this.stats };
        }
        
        /**
         * Update UI to show latency next to links
         */
        async updateUI(results) {
            for (const result of results) {
                const linkElements = document.querySelectorAll('a[href="' + result.url + '"]');
                
                for (const el of linkElements) {
                    // Find or create latency display element
                    let latencyEl = el.querySelector('.link-latency');
                    if (!latencyEl) {
                        latencyEl = document.createElement('span');
                        latencyEl.className = 'link-latency';
                        el.appendChild(latencyEl);
                    }
                    
                    if (result.success) {
                        // Fetch server-side latency for comparison
                        const serverLatency = await this.fetchServerLatency(result.url);
                        
                        const clientMs = result.total_time;
                        const serverMs = serverLatency || '...';
                        const healthClass = this.getHealthClass(clientMs, serverLatency);
                        
                        latencyEl.innerHTML = 
                            '<span class="client-latency">' + clientMs + 'ms</span>' +
                            '<span class="separator"> | </span>' +
                            '<span class="server-latency">' + serverMs + 'ms</span>';
                        
                        latencyEl.className = 'link-latency ' + healthClass;
                        
                        const delta = serverLatency ? (clientMs - serverLatency) : 0;
                        latencyEl.title = 'Client: ' + clientMs + 'ms, Server: ' + serverMs + 'ms, Delta: ' + delta + 'ms';
                    } else {
                        latencyEl.innerHTML = '<span class="error">✗</span>';
                        latencyEl.className = 'link-latency error';
                        latencyEl.title = result.error || 'Check failed';
                    }
                }
            }
        }
        
        /**
         * Fetch server-side latency for comparison
         */
        async fetchServerLatency(url) {
            try {
                const apiUrl = (this.config.apiUrl || '') + '/performance/link-latency?url=' + encodeURIComponent(url);
                const response = await fetch(apiUrl);
                if (!response.ok) return null;
                
                const data = await response.json();
                return data.server_avg_latency || null;
            } catch (e) {
                return null;
            }
        }
        
        /**
         * Determine health status based on client vs server latency
         */
        getHealthClass(clientMs, serverMs) {
            if (!serverMs || serverMs === '...') return 'unknown';
            
            const ratio = clientMs / serverMs;
            
            if (ratio < 1.5) return 'good';      // Client within 50% of server
            if (ratio < 3) return 'degraded';    // Client 2-3x server latency
            return 'poor';                       // Client >3x server latency
        }
        
        /**
         * Sleep helper
         */
        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        
        /**
         * Check if URL should be tested
         */
        shouldTest(url) {
            // If specific URLs are configured, only test those
            if (this.config.beaconUrls && this.config.beaconUrls.length > 0) {
                return this.config.beaconUrls.some(pattern => url.includes(pattern));
            }
            
            // Test all external links by default
            return true;
        }
    }
    
    // Expose class globally for testing and manual initialization
    window.LinkLatencyScanner = LinkLatencyScanner;
    console.log('[Analytics] LinkLatencyScanner class exposed globally');
    
    // Auto-initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScanner);
    } else {
        // DOM already loaded
        initScanner();
    }
    
    function initScanner() {
        // Wait a bit for page to settle and links to render
        setTimeout(function() {
            console.log('[Analytics] Initializing link latency scanner...');
            console.log('[Analytics] Config:', config);
            
            const scanner = new LinkLatencyScanner(config);
            // Store globally for status widget access
            window.analyticsScanner = scanner;
            scanner.scanAllLinks();
            
            // Optionally rescan periodically (every 5 minutes)
            // setInterval(() => scanner.scanAllLinks(), 5 * 60 * 1000);
        }, 2000); // 2 second delay after page load
    }
    
    // Add default styles for latency badges
    const style = document.createElement('style');
    style.textContent = `
        .link-latency {
            display: inline-flex;
            align-items: center;
            gap: 2px;
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 4px;
            margin-left: 8px;
            font-family: monospace;
        }
        
        .link-latency.good {
            background: #e8f5e9;
            color: #2e7d32;
        }
        
        .link-latency.degraded {
            background: #fff3e0;
            color: #ef6c00;
        }
        
        .link-latency.poor {
            background: #ffebee;
            color: #c62828;
        }
        
        .link-latency.unknown {
            background: #f5f5f5;
            color: #666;
        }
        
        .link-latency.error {
            background: #ffebee;
            color: #c62828;
        }
        
        .link-latency .client-latency {
            font-weight: 600;
        }
        
        .link-latency .separator {
            color: #999;
            font-weight: 400;
        }
        
        .link-latency .server-latency {
            font-weight: 400;
        }
        
        .link-latency .error {
            font-weight: 600;
        }
    `;
    document.head.appendChild(style);
    
})();
