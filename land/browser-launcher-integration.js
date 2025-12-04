/**
 * Browser Launcher Pro Integration Script
 * 
 * This script allows third-party landing pages to open links in specific browsers
 * using the Browser Launcher Pro extension.
 * 
 * Usage:
 * 1. Include this script in your landing page HTML
 * 2. Add data-browser attribute to links: <a href="..." data-browser="chrome-stable">
 * 3. Or use the JavaScript API: BrowserLauncher.open(url, browserId)
 * 
 * @version 1.0
 * @author Browser Launcher Pro
 */

(function() {
  'use strict';

  // Extension ID - Users need to provide this or it will be auto-detected
  // Users can find it in chrome://extensions (Developer mode enabled)
  let EXTENSION_ID = 'ifllnbjkoabnnbcodbocddplnhmbobim'; // Browser Launcher Pro Extension ID

  // Browser IDs mapping - maps friendly names to extension browser IDs
  const BROWSER_IDS = {
    // Windows Local Browsers
    'edge-stable': 'edge-stable-local',
    'edge-beta': 'edge-beta-local',
    'edge-dev': 'edge-dev-local',
    'chrome-stable': 'chrome-stable-local',
    'chrome-beta': 'chrome-beta-local',
    'chrome-dev': 'chrome-dev-local',
    
    // WSL Browsers
    'edge-stable-wsl': 'edge-stable',
    'edge-beta-wsl': 'edge-beta',
    'edge-dev-wsl': 'edge-dev',
    'chrome-stable-wsl': 'chrome-stable',
    'chrome-beta-wsl': 'chrome-beta',
    'chrome-dev-wsl': 'chrome-dev',
    'firefox-wsl': 'firefox',
    'opera-wsl': 'opera',
    'brave-wsl': 'brave',
    
    // Aliases for convenience
    'edge': 'edge-stable-local',
    'chrome': 'chrome-stable-local',
    'firefox': 'firefox-wsl',
    'opera': 'opera-wsl',
    'brave': 'brave-wsl'
  };

  // Configuration
  const config = {
    // Timeout for extension response (milliseconds)
    // Increased to 15 seconds to allow for browser launch time
    responseTimeout: 15000,
    
    // Whether to show console logs
    debug: false,
    
    // Fallback behavior when extension is not available
    fallbackToNormalNavigation: true,
    
    // Prevent fallback if we got a successful response (even if delayed)
    preventFallbackOnSuccess: true
  };

  /**
   * Log debug messages
   */
  function log(message, ...args) {
    if (config.debug) {
      console.log('[BrowserLauncher]', message, ...args);
    }
  }

  /**
   * Log error messages
   */
  function logError(message, ...args) {
    console.error('[BrowserLauncher]', message, ...args);
  }

  /**
   * Try to auto-detect extension ID
   * This attempts to find the Browser Launcher Pro extension
   */
  function detectExtensionId() {
    // Method 1: Try chrome.management API (requires permission)
    if (typeof chrome !== 'undefined' && chrome.management) {
      chrome.management.getAll(function(extensions) {
        const browserLauncher = extensions.find(ext => 
          ext.name === 'Browser Launcher Pro' || 
          ext.name.includes('Browser Launcher')
        );
        if (browserLauncher) {
          EXTENSION_ID = browserLauncher.id;
          log('Extension ID detected:', EXTENSION_ID);
        }
      });
    }
    
    // Method 2: Try common extension IDs (if you know them)
    // You can add known extension IDs here
    
    return EXTENSION_ID;
  }

  /**
   * Validate URL format
   */
  function isValidUrl(url) {
    try {
      const urlObj = new URL(url);
      // Reject javascript:, data:, and other non-http protocols
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch (e) {
      return false;
    }
  }

  /**
   * Normalize browser ID (handle aliases and variations)
   */
  function normalizeBrowserId(browserId) {
    if (!browserId) return null;
    
    const normalized = browserId.toLowerCase().trim();
    
    // Check direct mapping
    if (BROWSER_IDS[normalized]) {
      return BROWSER_IDS[normalized];
    }
    
    // Return as-is if already in correct format
    return normalized;
  }

  /**
   * Open a URL in a specific browser via the extension
   * 
   * @param {string} url - The URL to open
   * @param {string} browserId - Browser ID (e.g., 'chrome-stable', 'edge-beta')
   * @param {Object} options - Optional settings
   * @param {function} callback - Optional callback function
   * @returns {Promise} Promise that resolves when the operation completes
   */
  function openInBrowser(url, browserId, options = {}, callback) {
    return new Promise((resolve, reject) => {
      // Validate URL
      if (!isValidUrl(url)) {
        const error = 'Invalid URL. Only http:// and https:// URLs are supported.';
        logError(error, url);
        if (callback) callback({ success: false, error: error });
        reject(new Error(error));
        return;
      }

      // Normalize browser ID
      const normalizedBrowserId = normalizeBrowserId(browserId);
      if (!normalizedBrowserId) {
        const error = 'Invalid browser ID: ' + browserId;
        logError(error);
        if (callback) callback({ success: false, error: error });
        reject(new Error(error));
        return;
      }

      log('Opening URL in browser:', url, '->', normalizedBrowserId);

      // Always try to send the message first - the content script might be available
      // even if the marker isn't set yet (race condition)
      sendPostMessage(url, normalizedBrowserId, options, callback, resolve, reject);
    });
  }

  /**
   * Send message via postMessage (for cross-domain communication)
   */
  function sendPostMessage(url, browserId, options, callback, resolve, reject) {
    const timestamp = Date.now();
    const message = {
      type: 'BROWSER_LAUNCHER_OPEN',
      url: url,
      browserId: browserId,
      timestamp: timestamp,
      options: options
    };

    log('Sending postMessage:', message);

    // Send message to window (content script will listen)
    window.postMessage(message, '*');

    let hasResponded = false;
    let shouldFallback = options.fallback !== false && config.fallbackToNormalNavigation;
    let timeoutId = null;
    let gracePeriodId = null;
    let navigationPrevented = false;

    // Set up listener for response
    const responseListener = function(event) {
      // Security: Only accept responses to our messages
      if (event.data && 
          event.data.type === 'BROWSER_LAUNCHER_RESPONSE' && 
          event.data.timestamp === timestamp) {
        window.removeEventListener('message', responseListener);
        hasResponded = true;
        
        // Clear any pending timeouts
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (gracePeriodId) {
          clearTimeout(gracePeriodId);
          gracePeriodId = null;
        }
        
        const result = event.data;
        log('Received response:', result);
        
        if (callback) callback(result);
        
        if (result.success !== false) {
          // Success - don't fallback, resolve immediately
          log('Success response received, preventing any fallback navigation');
          navigationPrevented = true; // Mark that we should not navigate
          resolve(result);
          return; // Exit early to prevent any further execution
        } else {
          // Failure - fallback only if enabled
          if (shouldFallback && result.error) {
            log('Extension failed, falling back to normal navigation');
            // Small delay to ensure we're not in a race condition
            setTimeout(() => {
              if (!hasResponded || result.success === false) {
                window.location.href = url;
              }
            }, 100);
          }
          reject(new Error(result.error || 'Failed to open in browser'));
        }
      }
    };

    window.addEventListener('message', responseListener);

    // Timeout handling
    // Check if extension marker exists (but don't rely on it exclusively due to race conditions)
    const extensionMarkerExists = typeof window !== 'undefined' && window.BrowserLauncherProExtension;
    // Use shorter timeout if marker doesn't exist (extension likely not available)
    const timeoutDuration = extensionMarkerExists ? config.responseTimeout : 3000; // 3 seconds if marker not found
    
    timeoutId = setTimeout(() => {
      // Only proceed if we haven't received a response
      if (!hasResponded) {
        window.removeEventListener('message', responseListener);
        
        // Only fallback if we haven't received a response AND fallback is enabled
        if (shouldFallback) {
          const error = 'Timeout waiting for extension response';
          logError(error);
          
          // If extension marker wasn't found, fallback faster
          if (!extensionMarkerExists) {
            log('Extension marker not found and no response, falling back to normal navigation');
            window.location.href = url;
            if (callback) callback({ success: false, error: 'Extension not available - using fallback' });
            reject(new Error('Extension not available'));
            return;
          }
          
          // Extension marker exists but no response - give it a grace period
          log('Timeout occurred, but browser may have opened. Waiting briefly before fallback...');
          gracePeriodId = setTimeout(() => {
            // Double-check we still haven't responded
            if (!hasResponded && !navigationPrevented) {
              log('No response received after grace period, falling back to normal navigation');
              // Final check before navigation
              setTimeout(() => {
                if (!hasResponded && !navigationPrevented) {
                  log('Executing fallback navigation');
                  window.location.href = url;
                } else {
                  log('Navigation prevented - response received or navigation already prevented');
                }
              }, 100);
            } else {
              log('Response received during grace period, skipping fallback');
            }
          }, 1000); // 1 second grace period
        } else {
          const error = 'Timeout waiting for extension response';
          logError(error);
          if (callback) callback({ success: false, error: error });
          reject(new Error(error));
        }
      } else {
        // Response received, just clean up
        window.removeEventListener('message', responseListener);
      }
    }, timeoutDuration);
  }

  /**
   * Auto-configure links with data attributes
   * Usage: <a href="..." data-browser="chrome-stable">Link</a>
   */
  function initializeAutoLinks() {
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a[data-browser]');
      if (!link || !link.href) return;

      const browserId = link.getAttribute('data-browser');
      if (browserId) {
        e.preventDefault();
        e.stopPropagation();
        
        // Get optional data attributes
        const options = {
          fallback: link.getAttribute('data-fallback') !== 'false',
          noFallback: link.getAttribute('data-no-fallback') === 'true' // Explicitly disable fallback
        };
        
        // If no-fallback is set, override fallback setting
        if (options.noFallback) {
          options.fallback = false;
        }
        
        openInBrowser(link.href, browserId, options, function(response) {
          if (!response || !response.success) {
            logError('Failed to open link in browser:', response);
            // Fallback handled by openInBrowser if enabled
          }
        });
      }
    }, true); // Use capture phase
  }

  /**
   * Initialize the integration
   */
  function initialize() {
    // Try to detect extension ID
    if (typeof chrome !== 'undefined') {
      detectExtensionId();
    }

    // Initialize auto-link handling
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeAutoLinks);
    } else {
      initializeAutoLinks();
    }

    log('Browser Launcher Pro integration initialized');
  }

  /**
   * Set extension ID manually
   */
  function setExtensionId(extensionId) {
    EXTENSION_ID = extensionId;
    log('Extension ID set:', extensionId);
  }

  /**
   * Update configuration
   */
  function configure(newConfig) {
    Object.assign(config, newConfig);
    log('Configuration updated:', config);
  }

  /**
   * Check if extension is available
   * Checks for content script marker and extension runtime
   */
  function isExtensionAvailable() {
    // Check if content script has injected the marker
    if (typeof window !== 'undefined' && window.BrowserLauncherProExtension) {
      return true;
    }
    
    // Fallback: Check if chrome.runtime is available (for direct messaging)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check extension availability with callback (more reliable)
   */
  function checkExtensionAvailability(callback, retries = 3, delay = 500) {
    // First check for content script marker (immediate check)
    if (typeof window !== 'undefined' && window.BrowserLauncherProExtension) {
      callback(true, 'Content script detected');
      return;
    }
    
    // If marker not found, wait a bit and check again (content script might load after page script)
    let attempt = 0;
    const checkWithRetry = function() {
      attempt++;
      
      // Check for marker again
      if (typeof window !== 'undefined' && window.BrowserLauncherProExtension) {
        callback(true, 'Content script detected (after retry)');
        return;
      }
      
      // Try to ping the extension via postMessage
      const timestamp = Date.now();
      const checkMessage = {
        type: 'BROWSER_LAUNCHER_CHECK',
        timestamp: timestamp
      };
      
      let responded = false;
      const responseListener = function(event) {
        if (event.data && 
            event.data.type === 'BROWSER_LAUNCHER_CHECK_RESPONSE' && 
            event.data.timestamp === timestamp) {
          window.removeEventListener('message', responseListener);
          if (!responded) {
            responded = true;
            callback(true, 'Extension responded');
          }
        }
      };
      
      window.addEventListener('message', responseListener);
      window.postMessage(checkMessage, '*');
      
      // Timeout for this attempt
      setTimeout(() => {
        window.removeEventListener('message', responseListener);
        if (!responded) {
          // Retry if we have attempts left
          if (attempt < retries) {
            setTimeout(checkWithRetry, delay);
          } else {
            // All retries exhausted
            callback(false, 'No response from extension after ' + retries + ' attempts. Make sure extension is installed and reloaded.');
          }
        }
      }, delay);
    };
    
    // Start checking
    checkWithRetry();
  }

  /**
   * Get available browser IDs
   */
  function getAvailableBrowsers() {
    return Object.keys(BROWSER_IDS);
  }

  // Initialize when script loads
  initialize();

  // Expose API globally
  window.BrowserLauncher = {
    // Main function to open URL in browser
    open: openInBrowser,
    
    // Configuration
    configure: configure,
    setExtensionId: setExtensionId,
    
    // Utility functions
    isAvailable: isExtensionAvailable,
    checkAvailability: checkExtensionAvailability,
    getBrowsers: getAvailableBrowsers,
    
    // Browser ID constants
    BROWSERS: BROWSER_IDS,
    
    // Extension ID
    extensionId: EXTENSION_ID,
    
    // Version
    version: '1.0.0'
  };

  // Also expose as BrowserLauncherPro for compatibility
  window.BrowserLauncherPro = window.BrowserLauncher;

  log('Browser Launcher Pro API exposed');
})();

