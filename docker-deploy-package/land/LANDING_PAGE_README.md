# Browser Launcher Pro - Landing Page Integration

This guide explains how to use the Browser Launcher Pro integration script on your landing page to open links in specific browsers.

## Files Included

1. **browser-launcher-integration.js** - The integration script for your landing page
2. **sample-landing-page.html** - A complete example landing page demonstrating all features

## Quick Start

### Step 1: Include the Script

Add the integration script to your HTML page:

```html
<script src="browser-launcher-integration.js"></script>
```

### Step 2: Use Data Attributes (Easiest Method)

Simply add a `data-browser` attribute to any link:

```html
<a href="https://github.com" data-browser="chrome-stable">
    Open GitHub in Chrome
</a>

<a href="https://microsoft.com" data-browser="edge-stable">
    Open Microsoft in Edge
</a>
```

That's it! When users click these links, they'll automatically open in the specified browser.

### Step 3: Or Use JavaScript API

For programmatic control:

```javascript
// Simple usage
BrowserLauncher.open('https://github.com', 'chrome-stable');

// With callback
BrowserLauncher.open('https://example.com', 'edge-stable', {}, function(response) {
    if (response.success) {
        console.log('Opened successfully!');
    } else {
        console.error('Error:', response.error);
    }
});

// Using Promises
BrowserLauncher.open('https://example.com', 'chrome-stable')
    .then(response => console.log('Success:', response))
    .catch(error => console.error('Error:', error));
```

## Available Browser IDs

### Windows Local Browsers
- `chrome-stable` - Chrome Stable
- `chrome-beta` - Chrome Beta
- `chrome-dev` - Chrome Dev
- `edge-stable` - Edge Stable
- `edge-beta` - Edge Beta
- `edge-dev` - Edge Dev
- `chrome` - Alias for chrome-stable
- `edge` - Alias for edge-stable

### WSL Browsers
- `chrome-stable-wsl` - Chrome Stable (WSL)
- `chrome-beta-wsl` - Chrome Beta (WSL)
- `chrome-dev-wsl` - Chrome Dev (WSL)
- `edge-stable-wsl` - Edge Stable (WSL)
- `edge-beta-wsl` - Edge Beta (WSL)
- `edge-dev-wsl` - Edge Dev (WSL)
- `firefox-wsl` - Firefox (WSL)
- `opera-wsl` - Opera (WSL)
- `brave-wsl` - Brave (WSL)

## Testing the Sample Landing Page

1. **Open the sample page:**
   - Open `sample-landing-page.html` in your browser
   - Make sure the Browser Launcher Pro extension is installed and enabled

2. **Test the features:**
   - Click any link with a `data-browser` attribute
   - Try the JavaScript API buttons
   - Use the interactive test area

3. **Check the console:**
   - Open browser DevTools (F12)
   - Enable debug mode: `BrowserLauncher.configure({ debug: true })`
   - Watch for integration messages

## API Reference

### BrowserLauncher.open(url, browserId, options, callback)

Opens a URL in a specific browser.

**Parameters:**
- `url` (string) - The URL to open (must be http:// or https://)
- `browserId` (string) - Browser ID (see Available Browser IDs above)
- `options` (object, optional) - Configuration options
  - `fallback` (boolean) - Whether to fallback to normal navigation if extension fails (default: true)
- `callback` (function, optional) - Callback function with response object

**Returns:** Promise

**Example:**
```javascript
BrowserLauncher.open('https://github.com', 'chrome-stable', {}, function(response) {
    console.log(response);
});
```

### BrowserLauncher.configure(options)

Updates the configuration.

**Parameters:**
- `options` (object)
  - `debug` (boolean) - Enable debug logging (default: false)
  - `responseTimeout` (number) - Timeout in milliseconds (default: 5000)
  - `fallbackToNormalNavigation` (boolean) - Fallback behavior (default: true)

**Example:**
```javascript
BrowserLauncher.configure({
    debug: true,
    responseTimeout: 10000
});
```

### BrowserLauncher.setExtensionId(extensionId)

Manually set the extension ID (usually auto-detected).

**Parameters:**
- `extensionId` (string) - The extension ID

**Example:**
```javascript
BrowserLauncher.setExtensionId('abcdefghijklmnopqrstuvwxyz123456');
```

### BrowserLauncher.isAvailable()

Checks if the extension is available.

**Returns:** boolean

**Example:**
```javascript
if (BrowserLauncher.isAvailable()) {
    // Extension is ready
}
```

### BrowserLauncher.getBrowsers()

Gets a list of all available browser IDs.

**Returns:** Array of strings

**Example:**
```javascript
const browsers = BrowserLauncher.getBrowsers();
console.log(browsers); // ['chrome-stable', 'edge-stable', ...]
```

## How It Works

1. **User clicks a link** with `data-browser` attribute
2. **Script intercepts** the click event
3. **Message sent** to the Browser Launcher Pro extension via `postMessage`
4. **Extension's content script** receives the message
5. **Background script** launches the specified browser with the URL
6. **Response sent back** to the landing page

## Requirements

- Browser Launcher Pro extension must be installed and enabled
- Extension must have the updated `content.js` and `background.js` files
- Links must use `http://` or `https://` protocols (not `javascript:`, `mailto:`, etc.)

## Troubleshooting

### Links open normally instead of in specified browser

- Check that the Browser Launcher Pro extension is installed and enabled
- Verify the browser path is configured in extension settings
- Check browser console for error messages
- Enable debug mode: `BrowserLauncher.configure({ debug: true })`

### Extension not detected

- The script will automatically fallback to normal navigation
- You can manually set the extension ID if needed
- Check `chrome://extensions` to find your extension ID

### Invalid browser ID error

- Check the browser ID spelling (case-insensitive)
- Use one of the available browser IDs listed above
- Check that the browser is configured in extension settings

## Examples

See `sample-landing-page.html` for complete working examples including:
- Data attribute usage
- JavaScript API examples
- Interactive test area
- Code snippets
- Browser ID reference

## Support

For issues or questions:
- Check the extension settings
- Review browser console for errors
- Ensure extension is up to date
- Contact support: support@browserlauncherpro.com

