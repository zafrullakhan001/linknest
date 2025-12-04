chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "getSelectedText") {
    sendResponse({selectedText: window.getSelection().toString()});
  }
});

// Signal to the page that the extension content script is loaded
(function() {
  // Inject a marker that the integration script can detect
  if (typeof window !== 'undefined') {
    window.BrowserLauncherProExtension = {
      available: true,
      version: '3.0'
    };
    
    // Also dispatch a custom event
    window.dispatchEvent(new CustomEvent('BrowserLauncherProReady', {
      detail: { version: '3.0' }
    }));
  }
})();

// Listen for messages from third-party landing pages
window.addEventListener('message', function(event) {
  // Security: Only accept messages with the expected type
  if (event.data && event.data.type === 'BROWSER_LAUNCHER_OPEN') {
    const { url, browserId, timestamp } = event.data;

    // Validate URL
    try {
      new URL(url);
    } catch (e) {
      console.error('Invalid URL received:', url);
      sendResponseToPage({ 
        success: false, 
        error: 'Invalid URL',
        timestamp: timestamp 
      });
      return;
    }

    // Send immediate response to page (don't wait for background script)
    // This prevents timeout issues
    sendResponseToPage({
      success: true,
      message: 'Browser launch initiated',
      timestamp: timestamp
    });

    // Forward to background script asynchronously (fire and forget from page's perspective)
    chrome.runtime.sendMessage({
      action: 'openLinkInBrowser',
      url: url,
      browserId: browserId
    }, (response) => {
      // Log the result but don't send another response to page
      // (we already sent an immediate response above)
      if (response) {
        if (response.success === false) {
          console.error('Browser launch failed:', response.error);
          // Optionally send an error update to the page if needed
          // But for now, we'll just log it since browser may have already opened
        } else {
          console.log('Browser launch confirmed:', response.message || 'Success');
        }
      }
    });
  }
  
  // Handle extension availability check
  if (event.data && event.data.type === 'BROWSER_LAUNCHER_CHECK') {
    window.postMessage({
      type: 'BROWSER_LAUNCHER_CHECK_RESPONSE',
      available: true,
      version: '3.0',
      timestamp: event.data.timestamp
    }, '*');
  }
});

// Send response back to the page
function sendResponseToPage(data) {
  window.postMessage({
    type: 'BROWSER_LAUNCHER_RESPONSE',
    ...data
  }, '*');
}
