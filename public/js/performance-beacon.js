/**
 * Performance Beacon
 * Captures full page performance metrics and sends to analytics
 */

(function() {
    'use strict';
    
    console.log('[Analytics] Performance beacon script loaded');
    
    // Check if analytics is enabled and configured
    if (!window.ANALYTICS_CONFIG || !window.ANALYTICS_CONFIG.enabled) {
        console.log('[Analytics] Performance beacon: Analytics not enabled, exiting');
        return; // Exit early if disabled
    }
    
    const config = window.ANALYTICS_CONFIG;
    console.log('[Analytics] Performance beacon: Analytics enabled, config:', {
        collectUrl: config.collectUrl,
        sampleRate: config.sampleRate,
        userId: config.userId,
        location: {
            country: config.countryCode,
            region: config.region,
            city: config.city
        }
    });
    
    // Check sample rate (implement sampling to reduce load)
    const sampleRate = config.sampleRate || 0.1;
    if (Math.random() > sampleRate) {
        console.log('[Analytics] Performance beacon: Skipped due to sample rate (' + (sampleRate * 100) + '%)');
        return; // Skip this user based on sample rate
    }
    console.log('[Analytics] Performance beacon: Sample rate check passed (' + (sampleRate * 100) + '%)');
    
    // Wait for page to fully load
    window.addEventListener('load', function() {
        console.log('[Analytics] Performance beacon: Page loaded, collecting metrics...');
        // Small delay to ensure all metrics are captured
        setTimeout(function() {
            collectAndSendMetrics();
        }, 100);
    });
    
    /**
     * Collect performance metrics and send to analytics
     */
    function collectAndSendMetrics() {
        if (!window.performance || !window.performance.timing) {
            console.warn('[Analytics] Performance beacon: Performance API not available');
            return; // Performance API not available
        }
        
        console.log('[Analytics] Performance beacon: Collecting metrics...');
        
        const timing = performance.timing;
        const navigation = performance.navigation;
        
        // Calculate timing metrics (all in milliseconds)
        const metrics = {
            type: 'page_performance',
            url: window.location.href,
            time: new Date().toISOString(),
            
            // User context
            user_id: config.userId || null,
            session_id: config.sessionId || getSessionId(),
            is_authenticated: !!config.userId,
            
            // Performance timing breakdown
            dns_time: timing.domainLookupEnd - timing.domainLookupStart,
            tcp_time: timing.connectEnd - timing.connectStart,
            tls_time: timing.secureConnectionStart > 0 
                ? timing.connectEnd - timing.secureConnectionStart 
                : 0,
            ttfb: timing.responseStart - timing.requestStart,
            dom_load: timing.domContentLoadedEventEnd - timing.navigationStart,
            full_load: timing.loadEventEnd - timing.navigationStart,
            
            // Page context
            page_size: getPageSize(),
            
            // Connection info (if available)
            connection_type: getConnectionType(),
            
            // Device/browser info
            device_type: getDeviceType(),
            browser: getBrowserInfo(),
            screen_resolution: window.screen.width + 'x' + window.screen.height,
            
            // Navigation type
            nav_type: navigation.type, // 0=navigate, 1=reload, 2=back_forward
            
            // Location data (from ANALYTICS_CONFIG)
            country_code: config.countryCode || 'XX',
            region: config.region || 'Unknown',
            city: config.city || 'Unknown',
            latitude: config.latitude || 0,
            longitude: config.longitude || 0,
            
            // Timestamp
            timestamp: Math.floor(Date.now() / 1000)
        };
        
        // Send using beacon API (guaranteed delivery even if user navigates away)
        sendBeacon(metrics);
    }
    
    /**
     * Send metrics via beacon
     */
    function sendBeacon(data) {
        if (!navigator.sendBeacon) {
            // Fallback to fetch if beacon not available
            sendViaFetch(data);
            return;
        }
        
        const url = config.collectUrl || '/api/metrics/collect';
        const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
        
        try {
            const success = navigator.sendBeacon(url, blob);
            if (success) {
                console.log('[Analytics] Performance beacon: Metrics sent successfully via beacon API');
            } else {
                console.warn('[Analytics] Performance beacon: Beacon API returned false, trying fetch');
                sendViaFetch(data);
            }
        } catch (e) {
            console.warn('[Analytics] Performance beacon: Beacon failed, trying fetch:', e);
            sendViaFetch(data);
        }
    }
    
    /**
     * Fallback: send via fetch
     */
    function sendViaFetch(data) {
        fetch(config.collectUrl || '/api/metrics/collect', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data),
            keepalive: true
        }).then(function(response) {
            if (response.ok) {
                console.log('[Analytics] Performance beacon: Metrics sent successfully via fetch');
            } else {
                console.warn('[Analytics] Performance beacon: Failed to send metrics, status:', response.status);
            }
        }).catch(function(e) {
            console.warn('[Analytics] Performance beacon: Failed to send performance metrics:', e);
        });
    }
    
    /**
     * Get or generate session ID
     */
    function getSessionId() {
        let sid = sessionStorage.getItem('perf_session_id');
        if (!sid) {
            sid = generateUUID();
            sessionStorage.setItem('perf_session_id', sid);
        }
        return sid;
    }
    
    /**
     * Get page size from Resource Timing API
     */
    function getPageSize() {
        try {
            const navEntry = performance.getEntriesByType('navigation')[0];
            return navEntry ? navEntry.encodedBodySize || 0 : 0;
        } catch (e) {
            return 0;
        }
    }
    
    /**
     * Get connection type (if available)
     */
    function getConnectionType() {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conn) {
            return conn.effectiveType || conn.type || 'unknown';
        }
        return 'unknown';
    }
    
    /**
     * Detect device type
     */
    function getDeviceType() {
        const ua = navigator.userAgent;
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
            return 'tablet';
        }
        if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
            return 'mobile';
        }
        return 'desktop';
    }
    
    /**
     * Detect browser
     */
    function getBrowserInfo() {
        const ua = navigator.userAgent;
        let browser = 'unknown';
        
        if (ua.indexOf('Firefox') > -1) {
            browser = 'Firefox';
        } else if (ua.indexOf('Chrome') > -1) {
            browser = 'Chrome';
        } else if (ua.indexOf('Safari') > -1) {
            browser = 'Safari';
        } else if (ua.indexOf('Edge') > -1) {
            browser = 'Edge';
        } else if (ua.indexOf('MSIE') > -1 || ua.indexOf('Trident/') > -1) {
            browser = 'IE';
        }
        
        return browser;
    }
    
    /**
     * Generate UUID for session tracking
     */
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
})();
