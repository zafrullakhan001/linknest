// Add this at the top of your file
const searchConfig = {
  youtube: true,
  google: true,
  duckduckgo: true,
  perplexity: true,
  chatgpt: true,
  amazon: true,
  googlemaps: true
};

// License management constants
const TRIAL_PERIOD_DAYS = 60; // Add this constant for trial period duration
const LICENSE_STATUS = {
  TRIAL: 'trial',
  LICENSED: 'licensed',
  EXPIRED: 'expired'
};

// Function to determine if the command is for WSL
const isWSLCommand = (command) => {
  return command.startsWith('/usr/bin/') || command.startsWith('/snap/bin/') || command.includes('google-chrome') || command.includes('microsoft-edge');
};

// Function to create the proper command for WSL
const prepareWSLCommand = async (command) => {
  const wslInstance = await new Promise((resolve) => {
    chrome.storage.local.get(['wslInstance', 'wslUsername'], function (result) {
      const instance = result['wslInstance'] || 'ubuntu';
      const username = result['wslUsername'] || '';
      resolve({ instance, username });
    });
  });

  const userParam = wslInstance.username ? `-u ${wslInstance.username}` : '';
  const sandboxParam = wslInstance.username ? '' : '--no-sandbox';
  return `wsl -d ${wslInstance.instance} ${userParam} ${command} ${sandboxParam}`.trim();
};

// Function to get browser version using reg command
const getBrowserVersion = async (registryKey) => {
  return new Promise((resolve) => {
    chrome.runtime.sendNativeMessage('com.example.browserlauncher', {
      action: 'getBrowserVersion',
      registryKey: registryKey
    }, (response) => {
      // Debug log removed to reduce console noise
      // console.log('Received response:', response);
      
      if (chrome.runtime.lastError) {
        // Suppress error logging for registry errors (usually means browser not installed)
        // console.error(`Native messaging error: ${chrome.runtime.lastError.message}`);
        resolve(null);
        return;
      }
      
      if (!response) {
        // Suppress error logging for no response
        // console.error('No response received from native messaging host');
        resolve(null);
        return;
      }
      
      // Check if response contains version directly
      if (typeof response === 'string') {
        if (response.startsWith('Error:')) {
          // Suppress error logging for registry errors
          // console.error(`Error in response: ${response}`);
          resolve(null);
        } else {
          resolve(response);
        }
        return;
      }
      
      // Check if response is an object with version property
      if (response && response.version) {
        if (response.version.startsWith('Error:')) {
          // Suppress error logging for registry errors
          // console.error(`Error in version: ${response.version}`);
          resolve(null);
        } else {
          resolve(response.version);
        }
        return;
      }
      
      // Suppress error logging for invalid response format
      // console.error('Invalid response format:', response);
      resolve(null);
    });
  });
};

// Function to show browser update notifications
const showNotification = (browserName, oldVersion, newVersion) => {
  let detailsUrl;
  if (browserName.includes('Edge')) {
    detailsUrl = "https://learn.microsoft.com/en-us/deployedge/microsoft-edge-relnote-stable-channel";
  } else if (browserName.includes('Chrome')) {
    detailsUrl = "https://chromereleases.googleblog.com/";
  }

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: `Detected ${browserName} Update`,
    message: `${browserName} updated from version ${oldVersion} to ${newVersion}.`,
    priority: 2,
    buttons: [
      { title: 'OK' },
      { title: 'More Details' }
    ]
  }, (createdNotificationId) => {
    chrome.notifications.onButtonClicked.addListener((notifId, buttonIndex) => {
      if (notifId === createdNotificationId) {
        if (buttonIndex === 0) {
          chrome.notifications.clear(createdNotificationId);
        } else if (buttonIndex === 1) {
          chrome.tabs.query({ url: detailsUrl }, (tabs) => {
            if (tabs.length === 0) {
              chrome.windows.create({ url: detailsUrl, focused: true });
            } else {
              chrome.tabs.update(tabs[0].id, { active: true });
            }
          });
        }
      }
    });

    // Add a timeout to automatically close the notification after 10 seconds
    setTimeout(() => {
      chrome.notifications.clear(createdNotificationId);
    }, 10000);
  });
};

// Listener for reminder alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('remindUpdate_')) {
    const browserName = alarm.name.replace('remindUpdate_', '');
    chrome.storage.local.get([`${browserName}Version`], (result) => {
      const newVersion = result[`${browserName}Version`];
      if (newVersion) {
        showNotification(browserName, 'previous version', newVersion);
      }
    });
  }
});

// Function to check and update browser versions on extension load
const isValidVersion = (version) => {
  const versionPattern = /^\d+\.\d+\.\d+\.\d+$/;
  return versionPattern.test(version);
};

const checkAndUpdateBrowserVersions = async () => {
  const browsers = [
    // Edge paths for both architectures
    { 
      id: 'edgeStableCheckbox', 
      registryKey: [
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Edge\\BLBeacon',
        'HKEY_CURRENT_USER\\Software\\WOW6432Node\\Microsoft\\Edge\\BLBeacon'
      ], 
      name: 'Edge Stable' 
    },
    { 
      id: 'edgeBetaCheckbox', 
      registryKey: [
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Edge Beta\\BLBeacon',
        'HKEY_CURRENT_USER\\Software\\WOW6432Node\\Microsoft\\Edge Beta\\BLBeacon'
      ], 
      name: 'Edge Beta' 
    },
    { 
      id: 'edgeDevCheckbox', 
      registryKey: [
        'HKEY_CURRENT_USER\\Software\\Microsoft\\Edge Dev\\BLBeacon',
        'HKEY_CURRENT_USER\\Software\\WOW6432Node\\Microsoft\\Edge Dev\\BLBeacon'
      ], 
      name: 'Edge Dev' 
    },
    // Chrome paths for both architectures
    { 
      id: 'chromeStableCheckbox', 
      registryKey: [
        'HKEY_CURRENT_USER\\Software\\Google\\Chrome\\BLBeacon',
        'HKEY_CURRENT_USER\\Software\\WOW6432Node\\Google\\Chrome\\BLBeacon'
      ], 
      name: 'Chrome Stable' 
    },
    { 
      id: 'chromeBetaCheckbox', 
      registryKey: [
        'HKEY_CURRENT_USER\\Software\\Google\\Chrome Beta\\BLBeacon',
        'HKEY_CURRENT_USER\\Software\\WOW6432Node\\Google\\Chrome Beta\\BLBeacon'
      ], 
      name: 'Chrome Beta' 
    },
    { 
      id: 'chromeDevCheckbox', 
      registryKey: [
        'HKEY_CURRENT_USER\\Software\\Google\\Chrome Dev\\BLBeacon',
        'HKEY_CURRENT_USER\\Software\\WOW6432Node\\Google\\Chrome Dev\\BLBeacon'
      ], 
      name: 'Chrome Dev' 
    }
  ];

  for (const browser of browsers) {
    try {
      console.log(`Checking version for ${browser.name}`);
      let newVersion = null;

      // Try each registry key path until we get a valid version
      for (const regKey of browser.registryKey) {
        if (!newVersion) {
          newVersion = await getBrowserVersion(regKey);
          if (newVersion && isValidVersion(newVersion)) {
            console.log(`Found valid version in registry key: ${regKey}`);
            break;
          }
        }
      }

      const dateTime = new Date().toLocaleString();

      if (newVersion && isValidVersion(newVersion)) {
        console.log(`Fetched valid version for ${browser.name}: ${newVersion}`);

        chrome.storage.local.get([`${browser.id}Version`, 'versionUpdateLog'], (versionResult) => {
          const currentVersion = versionResult[`${browser.id}Version`] || '0.0.0.0';
          console.log(`Current stored version for ${browser.name}: ${currentVersion}`);
          const versionUpdateLog = versionResult.versionUpdateLog || [];

          if (newVersion !== currentVersion) {
            // Log the version update
            versionUpdateLog.push({
              browserName: browser.name,
              oldVersion: currentVersion,
              newVersion: newVersion,
              dateTime: dateTime
            });

            // First check if the checkbox for this browser is checked
            chrome.storage.local.get([browser.id], function(checkboxResult) {
              console.log(`Checkbox state for ${browser.name} (${browser.id}): `, checkboxResult[browser.id]);
              
              // Save the new version regardless of checkbox state
              chrome.storage.local.set({ [`${browser.id}Version`]: newVersion, versionUpdateLog }, () => {
                console.log(`[${dateTime}] ${browser.name} version changed from ${currentVersion} to ${newVersion}`);
                
                // Only show notification if the checkbox is checked and it's not the initial set
                if (checkboxResult[browser.id] === true && currentVersion !== '0.0.0.0') {
                  console.log(`Showing notification for ${browser.name} - checkbox is checked`);
                  showNotification(browser.name, currentVersion, newVersion);
                } else {
                  console.log(`Skipping notification for ${browser.name} - checkbox is ${checkboxResult[browser.id]}, initial set: ${currentVersion === '0.0.0.0'}`);
                }
              });
            });
          } else {
            console.log(`[${dateTime}] No changes detected for ${browser.name}`);
          }
        });
      } else {
        // Suppress warning logs for browsers that aren't installed
        // console.warn(`[${dateTime}] Invalid or failed to fetch version for ${browser.name}.`);
      }
    } catch (error) {
      // Suppress error logging for browser version checks
      // console.error(`Error checking version for ${browser.name}:`, error);
    }
  }
};

// Add this at the beginning of your file (replacing your current declaration)
const defaultSearchConfig = {
  youtube: true,
  google: true,
  duckduckgo: true,
  perplexity: true,
  chatgpt: true,
  amazon: true,
  sandbox: true,  // Add sandbox option
  googlemaps: true
};

// Function to set default values in the web store after extension installation
function setDefaultValues() {
  const defaultValues = {
    chromeBetaPath: 'C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe',
    chromeDevPath: 'C:\\Program Files\\Google\\Chrome Dev\\Application\\chrome.exe',
    chromeStablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    edgeBetaPath: 'C:\\Program Files (x86)\\Microsoft\\Edge Beta\\Application\\msedge.exe',
    edgeDevPath: 'C:\\Program Files (x86)\\Microsoft\\Edge Dev\\Application\\msedge.exe',
    edgeStablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    versionCheckbox: true,
    wslBravePath: '/usr/bin/brave-browser',
    wslChromeBetaPath: 'google-chrome-beta',
    wslChromeDevPath: '/usr/bin/google-chrome-unstable',
    wslChromeStablePath: 'google-chrome-stable',
    wslEdgeBetaPath: 'microsoft-edge-beta',
    wslEdgeDevPath: 'microsoft-edge-dev',
    wslEdgeStablePath: 'microsoft-edge-stable',
    wslFirefoxPath: '/usr/bin/firefox',
    wslInstance: 'ubuntu',
    wslOperaPath: '/usr/bin/opera',
    edgeStableCheckbox: true,
    edgeBetaCheckbox: true,
    edgeDevCheckbox: true,
    chromeStableCheckbox: true,
    chromeBetaCheckbox: true,
    chromeDevCheckbox: true,
    wslFirefoxCheckbox: true,
    wslOperaCheckbox: true,
    wslBraveCheckbox: true,
    checkInterval: 60,   // Set the default check interval to 60 minutes
    showWSL: false,      // Explicitly set showWSL to false for first install
    contextMenuEnabled: true,     // Enable context menu by default
    sandboxContextEnabled: true  // Enable the sandbox context menu by default
  };

  chrome.storage.local.get(Object.keys(defaultValues), function (result) {
    const valuesToSet = {};
    for (const [key, value] of Object.entries(defaultValues)) {
      if (!result.hasOwnProperty(key)) {
        valuesToSet[key] = value;
      }
    }
    if (Object.keys(valuesToSet).length > 0) {
      chrome.storage.local.set(valuesToSet, function () {
        console.log('Default values have been set in the web store.');
      });
    } else {
      console.log('All default values are already set, no changes made.');
    }
  });
}

// Function to check if the user has accepted the EULA
const checkEULAAgreement = () => {
  return new Promise((resolve) => {
    chrome.storage.local.get('eulaAccepted', function (result) {
      resolve(result.eulaAccepted === true);
    });
  });
};

// Function to check the license status
const checkLicenseStatus = async () => {
  try {
    const data = await chrome.storage.local.get([
      'licenseKey',
      'licenseStatus',
      'installDate'
    ]);
    
    // If already licensed and has a key, validate it's still good
    if (data.licenseStatus === LICENSE_STATUS.LICENSED && data.licenseKey) {
      // In a real implementation, you might want to verify with the server periodically
      // For now, we'll just check if the key has the right format
      const parts = data.licenseKey.split('#');
      if (parts.length !== 2) {
        // Invalid key format, reset to trial
        await deactivateLicense();
        return await checkTrialStatus();
      }
      
      return LICENSE_STATUS.LICENSED;
    }
    
    // Check trial status
    return await checkTrialStatus();
  } catch (error) {
    console.error('Error checking license status:', error);
    return LICENSE_STATUS.TRIAL; // Default to trial on error
  }
};

// Function to check if trial has expired and update status
const checkTrialStatus = async () => {
  const data = await chrome.storage.local.get(['installDate', 'licenseStatus']);
  
  // If already marked as expired, keep it that way
  if (data.licenseStatus === LICENSE_STATUS.EXPIRED) {
    return LICENSE_STATUS.EXPIRED;
  }
  
  // Check install date to determine if trial expired
  if (data.installDate) {
    const installTime = new Date(data.installDate).getTime();
    const currentTime = new Date().getTime();
    const daysSinceInstall = Math.floor((currentTime - installTime) / (1000 * 60 * 60 * 24));
    
    if (daysSinceInstall > TRIAL_PERIOD_DAYS) {
      // Trial has expired, update status
      await chrome.storage.local.set({ licenseStatus: LICENSE_STATUS.EXPIRED });
      // Disable functionality (remove context menus, etc.)
      disableExtensionFunctionality();
      return LICENSE_STATUS.EXPIRED;
    } else {
      return LICENSE_STATUS.TRIAL;
    }
  } else {
    // No install date, set it now
    const now = new Date().toISOString();
    await chrome.storage.local.set({ 
      installDate: now,
      licenseStatus: LICENSE_STATUS.TRIAL 
    });
    return LICENSE_STATUS.TRIAL;
  }
};

// Function to disable extension functionality when trial expires
const disableExtensionFunctionality = async () => {
  console.log("Disabling extension functionality - trial expired");
  
  try {
    // First remove all existing menus
    await new Promise(resolve => {
      chrome.contextMenus.removeAll(() => {
        console.log("Removed all existing context menus");
        resolve();
      });
    });
    
    // Wait a short time before creating the new menu to prevent race conditions
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Create a single context menu item to purchase
    await new Promise(resolve => {
      chrome.contextMenus.create({
        id: 'purchase-license',
        title: 'Purchase Browser Launcher Pro License',
        contexts: ['all']
      }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.log(`Context menu creation error: ${err.message}`);
        } else {
          console.log("Created purchase license menu item");
        }
        resolve();
      });
    });
    
    // Clear any active alarms to stop background tasks
    chrome.alarms.clear('checkBrowserVersions');
    chrome.alarms.clear('checkLicense');
    
    // Show expiration notification if not shown recently
    chrome.storage.local.get(['lastExpiryNotification'], function(data) {
      const now = Date.now();
      // Only show once per day
      if (!data.lastExpiryNotification || (now - data.lastExpiryNotification > 24 * 60 * 60 * 1000)) {
        chrome.storage.local.set({ lastExpiryNotification: now });
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Trial Period Expired',
          message: 'Your Browser Launcher Pro trial has expired. Please activate a license to continue using the extension.',
          priority: 2,
          buttons: [
            { title: 'Activate License' }
          ]
        }, (notificationId) => {
          chrome.notifications.onButtonClicked.addListener((nId, buttonIndex) => {
            if (nId === notificationId && buttonIndex === 0) {
              chrome.tabs.create({ url: chrome.runtime.getURL("license.html") });
            }
          });
        });
      }
    });
  } catch (error) {
    console.error("Error in disableExtensionFunctionality:", error);
  }
};

// Function to initialize the extension and ensure that default values are set
const initializeExtension = async () => {
  chrome.storage.local.get(['extensionReloaded', 'checkInterval', 'searchConfig', 'installDate'], async function (result) {
    const checkInterval = parseInt(result.checkInterval, 10) || 60; // Default to 60 minutes if not set
    
    // Initialize searchConfig if it doesn't exist
    if (!result.searchConfig) {
      chrome.storage.local.set({ searchConfig: defaultSearchConfig });
    }
    
    // Set install date for trial if not already set
    if (!result.installDate) {
      const installDate = new Date().toISOString();
      chrome.storage.local.set({ 
        installDate: installDate,
        licenseStatus: LICENSE_STATUS.TRIAL 
      });
      console.log(`Trial period started on ${installDate}`);
    }
    
    // Check license status immediately on startup
    const licenseStatus = await checkLicenseStatus();
    
    // If license is expired, disable functionality immediately
    if (licenseStatus === LICENSE_STATUS.EXPIRED) {
      console.log("License expired - disabling extension functionality");
      disableExtensionFunctionality();
    }

    if (!result.extensionReloaded) {
      setDefaultValues();

      const eulaAccepted = await checkEULAAgreement();

      if (!eulaAccepted) {
        chrome.tabs.create({ url: chrome.runtime.getURL("eula.html") });

        chrome.storage.onChanged.addListener(function (changes, areaName) {
          if (areaName === 'local' && changes.eulaAccepted?.newValue === true) {
            chrome.storage.local.set({ extensionReloaded: true }, () => {
              chrome.runtime.reload();
            });
          }
        });
      } else {
        // Only set up context menus and alarms if license is not expired
        if (licenseStatus !== LICENSE_STATUS.EXPIRED) {
          chrome.storage.local.get(['showWSL'], function (result) {
            const showWSL = result.showWSL || false;
            createContextMenus(showWSL);
            
            // Set the alarm with the current checkInterval
            chrome.alarms.create('checkBrowserVersions', { periodInMinutes: checkInterval });
            checkAndUpdateBrowserVersions();
          });
        } else {
          // If expired, open license page
          chrome.tabs.create({ url: chrome.runtime.getURL("license.html") });
        }

        chrome.storage.local.set({ extensionReloaded: true });
      }
    } else {
      // Only proceed if license is not expired
      if (licenseStatus !== LICENSE_STATUS.EXPIRED) {
        chrome.storage.local.get('showWSL', function (result) {
          const showWSL = result.showWSL || false;
          createContextMenus(showWSL);
          
          // Update the alarm when the extension is initialized
          chrome.alarms.create('checkBrowserVersions', { periodInMinutes: checkInterval });
        });
      }
    }
    
    // Always create the license check alarm
    chrome.alarms.create('checkLicense', { periodInMinutes: 60 }); // Check license status hourly
  });
};

let menuCreationInProgress = false;

async function createContextMenus(showWSL) {
  if (menuCreationInProgress) {
    console.log('Menu creation already in progress, skipping...');
    return;
  }

  menuCreationInProgress = true;

  try {
    // Remove all existing menus first
    await new Promise(resolve => chrome.contextMenus.removeAll(resolve));
    
    // Check license status first
    const { licenseStatus } = await chrome.storage.local.get('licenseStatus');
    
    // If license is expired, only create the purchase license menu item
    if (licenseStatus === LICENSE_STATUS.EXPIRED) {
      console.log("License expired - only creating purchase menu item");
      chrome.contextMenus.create({
        id: 'purchase-license',
        title: '🔑 Purchase Browser Launcher Pro License',
        contexts: ['all']
      }, () => {
        if (chrome.runtime.lastError) {
          console.log(`Note: ${chrome.runtime.lastError.message}`);
        }
      });
      menuCreationInProgress = false;
      return;
    }

    // Check if context menu is enabled
    const { contextMenuEnabled = true } = await chrome.storage.local.get('contextMenuEnabled');
    if (!contextMenuEnabled) {
      console.log('Context menu is disabled, skipping menu creation');
      menuCreationInProgress = false;
      return;
    }

    const contexts = ["all"];
    const createdIds = new Set();

    // Get both built-in search config and custom search engines
    const { searchConfig, customSearchEngines = [] } = await chrome.storage.local.get(['searchConfig', 'customSearchEngines']);
    
    // Create built-in search engine menus
    const searchEngines = {
      general: [
        { type: "google", icon: "🔍", name: "Google" },
        { type: "duckduckgo", icon: "🦆", name: "DuckDuckGo" }
      ],
      video: [
        { type: "youtube", icon: "▶️", name: "YouTube" }
      ],
      ai: [
        { type: "perplexity", icon: "🤖", name: "Perplexity.ai" },
        { type: "chatgpt", icon: "💡", name: "ChatGPT" }
      ],
      shopping: [
        { type: "amazon", icon: "🛒", name: "Amazon" }
      ],
      maps: [
        { type: "googlemaps", icon: "🗺️", name: "Google Maps" }
      ]
    };

    // Create search engine menus by category
    for (const [category, engines] of Object.entries(searchEngines)) {
      let hasEnabledEngines = false;
      
      // Check if any engine in this category is enabled
      for (const engine of engines) {
        if (searchConfig && searchConfig[engine.type]) {
          hasEnabledEngines = true;
          break;
        }
      }
      
      if (!hasEnabledEngines) continue;
      
      // Create category separator
      const categoryId = `${category}-separator`;
      if (!createdIds.has(categoryId)) {
        await new Promise((resolve) => {
          chrome.contextMenus.create({
            id: categoryId,
            type: "separator",
            contexts: ["selection"]
          }, () => {
            if (chrome.runtime.lastError) {
              console.log(`Note: ${chrome.runtime.lastError.message}`);
            }
            createdIds.add(categoryId);
            resolve();
          });
        });
      }

      // Create menu items for each enabled engine in the category
      for (const engine of engines) {
        if (!searchConfig || !searchConfig[engine.type]) continue;
        
        const parentId = `${engine.type}-search-parent`;
        if (!createdIds.has(parentId)) {
          await new Promise((resolve) => {
            chrome.contextMenus.create({
              id: parentId,
              title: `${engine.icon} ${engine.name} Search`,
              contexts: ["selection"]
            }, () => {
              if (chrome.runtime.lastError) {
                console.log(`Note: ${chrome.runtime.lastError.message}`);
              }
              createdIds.add(parentId);
              resolve();
            });
          });
        }

        // Define the menu items for this search type
        const menuItems = [
          {
            id: `${engine.type}-search-tab`,
            title: "📑 Search in New Tab"
          },
          {
            id: `${engine.type}-search-window`,
            title: "🖥️ Search in New Window"
          },
          {
            id: `${engine.type}-search-incognito`,
            title: "🔒 Search in Incognito Window"
          }
        ];

        for (const item of menuItems) {
          if (!createdIds.has(item.id)) {
            await new Promise((resolve) => {
              chrome.contextMenus.create({
                ...item,
                parentId: parentId,
                contexts: ["selection"]
              }, () => {
                if (chrome.runtime.lastError) {
                  console.log(`Note: ${chrome.runtime.lastError.message}`);
                }
                createdIds.add(item.id);
                resolve();
              });
            });
          }
        }
      }
    }

    // Add separator before custom search engines if any exist
    const enabledCustomEngines = customSearchEngines.filter(engine => engine.enabled);
    if (enabledCustomEngines.length > 0) {
      await new Promise((resolve) => {
        chrome.contextMenus.create({
          id: 'custom-engines-separator',
          type: 'separator',
          contexts: ['selection']
        }, () => {
          if (chrome.runtime.lastError) {
            console.log(`Note: ${chrome.runtime.lastError.message}`);
          }
          resolve();
        });
      });

      // Create menu items for custom search engines
      for (const engine of enabledCustomEngines) {
        const engineId = `custom-${engine.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        
        // Create parent menu item
        await new Promise((resolve) => {
          chrome.contextMenus.create({
            id: engineId,
            title: `${engine.icon || '🔍'} ${engine.name}`,
            contexts: ['selection']
          }, () => {
            if (chrome.runtime.lastError) {
              console.log(`Note: ${chrome.runtime.lastError.message}`);
            }
            resolve();
          });
        });

        // Create sub-menu items
        const menuItems = [
          {
            id: `${engineId}-tab`,
            title: "📑 Search in New Tab"
          },
          {
            id: `${engineId}-window`,
            title: "🖥️ Search in New Window"
          },
          {
            id: `${engineId}-incognito`,
            title: "🔒 Search in Incognito Window"
          }
        ];

        for (const item of menuItems) {
          await new Promise((resolve) => {
            chrome.contextMenus.create({
              ...item,
              parentId: engineId,
              contexts: ['selection']
            }, () => {
              if (chrome.runtime.lastError) {
                console.log(`Note: ${chrome.runtime.lastError.message}`);
              }
              resolve();
            });
          });
        }
      }
    }

    // Create browser menus with improved organization
    const browsers = [
      { id: "separator-browsers", type: "separator" },
      { id: "edge-stable-local", title: "🟦 Edge Stable (Windows)", command: "edgeStablePath" },
      { id: "edge-beta-local", title: "🟦 Edge Beta (Windows)", command: "edgeBetaPath" },
      { id: "edge-dev-local", title: "🟦 Edge Dev (Windows)", command: "edgeDevPath" },
      { id: "separator-chrome", type: "separator" },
      { id: "chrome-stable-local", title: "🟩 Chrome Stable (Windows)", command: "chromeStablePath" },
      { id: "chrome-beta-local", title: "🟩 Chrome Beta (Windows)", command: "chromeBetaPath" },
      { id: "chrome-dev-local", title: "🟩 Chrome Dev (Windows)", command: "chromeDevPath" },
      { id: "separator-edge-settings", type: "separator" },
      { id: "edge-settings", title: "⚙️ Edge Settings", command: "edge://settings" },
      { id: "edge-extensions", title: "🧩 Edge Extensions", command: "edge://extensions" }
    ];

    const wslBrowsers = [
      { id: "separator-wsl", type: "separator" },
      { id: "edge-stable", title: "🟦 Edge Stable (WSL)", command: "wslEdgeStablePath" },
      { id: "edge-beta", title: "🟦 Edge Beta (WSL)", command: "wslEdgeBetaPath" },
      { id: "edge-dev", title: "🟦 Edge Dev (WSL)", command: "wslEdgeDevPath" },
      { id: "separator-wsl-chrome", type: "separator" },
      { id: "chrome-stable", title: "🟩 Chrome Stable (WSL)", command: "wslChromeStablePath" },
      { id: "chrome-beta", title: "🟩 Chrome Beta (WSL)", command: "wslChromeBetaPath" },
      { id: "chrome-dev", title: "🟩 Chrome Dev (WSL)", command: "wslChromeDevPath" },
      { id: "separator-wsl-other", type: "separator" },
      { id: "firefox", title: "🦊 Firefox (WSL)", command: "wslFirefoxPath" },
      { id: "opera", title: "🎭 Opera (WSL)", command: "wslOperaPath" },
      { id: "brave", title: "🦁 Brave (WSL)", command: "wslBravePath" }
    ];

    // Get browser commands
    const commands = browsers.concat(wslBrowsers)
      .filter(browser => browser.command)
      .map(browser => browser.command);

    // Create browser menu items
    await new Promise((resolve) => {
      chrome.storage.local.get(commands, function(result) {
        const filteredBrowsers = browsers.filter(browser => 
          result[browser.command] !== 'NA' || browser.command.startsWith('edge://'));
        const filteredWslBrowsers = wslBrowsers.filter(browser => 
          result[browser.command] !== 'NA');

        const createMenuItems = async (menuItems) => {
          for (const browser of menuItems) {
            if (!createdIds.has(browser.id)) {
              await new Promise((resolve) => {
                chrome.contextMenus.create({
                  id: browser.id,
                  title: browser.title,
                  type: browser.type || 'normal',
                  contexts: ["all", "link"]
                }, () => {
                  if (chrome.runtime.lastError) {
                    console.log(`Note: ${chrome.runtime.lastError.message}`);
                  }
                  createdIds.add(browser.id);
                  resolve();
                });
              });

              // Add sub-menu items for Beta, Dev, and Stable browsers
              if (browser.id.includes('-beta') || browser.id.includes('-dev') || 
                  browser.id.includes('-stable') && !browser.id.includes('-local')) {
                // Add normal window option
                const normalId = `${browser.id}-normal`;
                if (!createdIds.has(normalId)) {
                  await new Promise((resolve) => {
                    chrome.contextMenus.create({
                      id: normalId,
                      title: "📑 Open in Normal Window",
                      parentId: browser.id,
                      contexts: ["all", "link"]
                    }, () => {
                      if (chrome.runtime.lastError) {
                        console.log(`Note: ${chrome.runtime.lastError.message}`);
                      }
                      createdIds.add(normalId);
                      resolve();
                    });
                  });
                }

                // Add inprivate window option
                const inprivateId = `${browser.id}-inprivate`;
                if (!createdIds.has(inprivateId)) {
                  await new Promise((resolve) => {
                    chrome.contextMenus.create({
                      id: inprivateId,
                      title: "🔒 Open in InPrivate Window",
                      parentId: browser.id,
                      contexts: ["all", "link"]
                    }, () => {
                      if (chrome.runtime.lastError) {
                        console.log(`Note: ${chrome.runtime.lastError.message}`);
                      }
                      createdIds.add(inprivateId);
                      resolve();
                    });
                  });
                }
              }
            }
          }
        };

        // Create menus sequentially
        (async () => {
          await createMenuItems(filteredBrowsers);
          if (showWSL) {
            await createMenuItems(filteredWslBrowsers);
          }
          resolve();
        })();
      });
    });

    // Get sandboxContextEnabled setting
    const { sandboxContextEnabled = true } = await chrome.storage.local.get('sandboxContextEnabled');

    // Create sandbox menu item if enabled in settings
    if (sandboxContextEnabled && !createdIds.has("open-in-sandbox")) {
      await new Promise((resolve) => {
        chrome.contextMenus.create({
          id: "open-in-sandbox",
          title: "🔒 Open in Windows Sandbox",
          contexts: ["link"]
        }, () => {
          if (chrome.runtime.lastError) {
            console.log(`Note: ${chrome.runtime.lastError.message}`);
          }
          createdIds.add("open-in-sandbox");
          resolve();
        });
      });
    }

  } catch (error) {
    console.error('Error creating context menus:', error);
  } finally {
    menuCreationInProgress = false;
  }
}

// Handle context menu click events
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // Handle custom search engines
  if (info.menuItemId.startsWith('custom-')) {
    const { customSearchEngines = [] } = await chrome.storage.local.get('customSearchEngines');
    
    // Extract the engine name from the ID
    const engineId = info.menuItemId.split('-')[1];
    const engine = customSearchEngines.find(e => 
      e.name.toLowerCase().replace(/[^a-z0-9]/g, '-') === engineId
    );

    if (engine) {
      const searchUrl = engine.url.replace('{searchTerms}', encodeURIComponent(info.selectionText));
      
      // Determine how to open the search
      if (info.menuItemId.endsWith('-tab')) {
        chrome.tabs.create({ url: searchUrl });
      } else if (info.menuItemId.endsWith('-window')) {
        chrome.windows.create({ url: searchUrl, type: 'normal', width: 1024, height: 768 });
      } else if (info.menuItemId.endsWith('-incognito')) {
        chrome.windows.create({ url: searchUrl, incognito: true, width: 1024, height: 768 });
      }
    }
    return;
  }

  // Handle purchase license item click
  if (info.menuItemId === 'purchase-license') {
    chrome.tabs.create({ url: chrome.runtime.getURL("license.html") });
    return;
  }

  const browsers = [
    { id: "edge-stable-local", command: "edgeStablePath" },
    { id: "edge-beta-local", command: "edgeBetaPath" },
    { id: "edge-dev-local", command: "edgeDevPath" },
    { id: "chrome-stable-local", command: "chromeStablePath" },
    { id: "chrome-beta-local", command: "chromeBetaPath" },
    { id: "chrome-dev-local", command: "chromeDevPath" },
    { id: "edge-stable", command: "wslEdgeStablePath" },
    { id: "edge-beta", command: "wslEdgeBetaPath" },
    { id: "edge-dev", command: "wslEdgeDevPath" },
    { id: "chrome-stable", command: "wslChromeStablePath" },
    { id: "chrome-beta", command: "wslChromeBetaPath" },
    { id: "chrome-dev", command: "wslChromeDevPath" },
    { id: "firefox", command: "wslFirefoxPath" },
    { id: "opera", command: "wslOperaPath" },
    { id: "brave", command: "wslBravePath" }
  ];

  // Check if this is a sub-menu item (normal or inprivate)
  if (info.menuItemId.endsWith('-normal') || info.menuItemId.endsWith('-inprivate')) {
    const baseId = info.menuItemId.replace(/-normal|-inprivate/g, '');
    const browser = browsers.find(b => b.id === baseId);
    if (browser) {
      chrome.storage.local.get([browser.command], async function (result) {
        let command = result[browser.command];

        if (command) {
          // Determine the URL to open - prioritize linkUrl over pageUrl
          let urlToOpen = info.linkUrl || info.pageUrl || (tab && tab.url) || 
                         (browser.id.includes('edge') ? 'edge://newtab' : 'chrome://newtab');

          // Check if this is a WSL command
          if (browser.command.startsWith('wsl')) {
            // For WSL commands, we need to prepare the command differently
            command = await prepareWSLCommand(command);
            
            // Format the command with quotes and private mode flags if needed
            if (info.menuItemId.endsWith('-inprivate')) {
              if (browser.id.includes('chrome')) {
                command = `${command} --incognito "${urlToOpen}"`;
              } else if (browser.id.includes('edge')) {
                command = `${command} --inprivate "${urlToOpen}"`;
              }
            } else {
              command = `${command} "${urlToOpen}"`;
            }
          } else {
            // For local Windows commands
            if (info.menuItemId.endsWith('-inprivate')) {
              if (browser.id.includes('chrome')) {
                command = `"${command}" --incognito "${urlToOpen}"`;
              } else if (browser.id.includes('edge')) {
                command = `"${command}" --inprivate "${urlToOpen}"`;
              }
            } else {
              command = `"${command}" "${urlToOpen}"`;
            }
          }

          console.log('Executing command:', command);

          // Only send the command to the native messaging host
          chrome.runtime.sendNativeMessage('com.example.browserlauncher', {
            command: command
          }, (response) => {
            if (chrome.runtime.lastError || (response && response.result.startsWith("Error:"))) {
              const errorMessage = chrome.runtime.lastError ? chrome.runtime.lastError.message : response.result;
              alert(`Error: ${errorMessage}`);
            } else {
              console.log('Received response:', response);
            }
          });
        } else {
          alert(`Error: Path not set for ${browser.id.replace(/-/g, ' ')} in settings.`);
        }
      });
    }
    return;
  }

  const browser = browsers.find(b => b.id === info.menuItemId);
  if (browser) {
    chrome.storage.local.get([browser.command], async function (result) {
      let command = result[browser.command];

      if (command) {
        // Determine the URL to open - prioritize linkUrl over pageUrl
        let urlToOpen = info.linkUrl || info.pageUrl || (tab && tab.url) || 
                       (browser.id.includes('edge') ? 'edge://newtab' : 'chrome://newtab');

        // Check if this is a WSL command
        if (browser.command.startsWith('wsl')) {
          command = await prepareWSLCommand(command);
          command = `${command} "${urlToOpen}"`;
        } else {
          command = `"${command}" "${urlToOpen}"`;
        }

        console.log('Executing command:', command);

        // Only send the command to the native messaging host
        chrome.runtime.sendNativeMessage('com.example.browserlauncher', {
          command: command
        }, (response) => {
          if (chrome.runtime.lastError || (response && response.result.startsWith("Error:"))) {
            const errorMessage = chrome.runtime.lastError ? chrome.runtime.lastError.message : response.result;
            alert(`Error: ${errorMessage}`);
          } else {
            console.log('Received response:', response);
          }
        });
      } else {
        alert(`Error: Path not set for ${browser.id.replace(/-/g, ' ')} in settings.`);
      }
    });
  } else if (info.parentMenuItemId === "youtube-search-parent" || 
             info.parentMenuItemId === "google-search-parent" || 
             info.parentMenuItemId === "duckduckgo-search-parent" || 
             info.parentMenuItemId === "perplexity-search-parent" || 
             info.parentMenuItemId === "chatgpt-search-parent" ||
             info.parentMenuItemId === "amazon-search-parent" ||
             info.parentMenuItemId === "googlemaps-search-parent") {
    const searchQuery = encodeURIComponent(info.selectionText);
    let searchUrl, searchType;

    switch (info.parentMenuItemId) {
      case "youtube-search-parent":
        searchUrl = `https://www.youtube.com/results?search_query=${searchQuery}`;
        searchType = "YouTube";
        break;
      case "google-search-parent":
        searchUrl = `https://www.google.com/search?q=${searchQuery}`;
        searchType = "Google";
        break;
      case "duckduckgo-search-parent":
        searchUrl = `https://duckduckgo.com/?q=${searchQuery}`;
        searchType = "DuckDuckGo";
        break;
      case "perplexity-search-parent":
        searchUrl = `https://www.perplexity.ai/?q=${searchQuery}`;
        searchType = "Perplexity.ai";
        break;
      case "chatgpt-search-parent":
        searchUrl = `https://chat.openai.com/?q=${searchQuery}`;
        searchType = "ChatGPT";
        break;
      case "amazon-search-parent":
        searchUrl = `https://www.amazon.com/s?k=${searchQuery}`;
        searchType = "Amazon";
        break;
      case "googlemaps-search-parent":
        searchUrl = `https://www.google.com/maps/search/${searchQuery}`;
        searchType = "Google Maps";
        break;
    }
    
    switch (info.menuItemId.split('-')[2]) {
      case "tab":
        chrome.tabs.create({ url: searchUrl });
        break;
      case "window":
        chrome.windows.create({ url: searchUrl, type: 'normal', width: 1024, height: 768 });
        break;
      case "incognito":
        chrome.windows.create({ url: searchUrl, incognito: true, width: 1024, height: 768 });
        break;
    }

    console.log(`${searchType} search performed: ${info.selectionText}`);
  } else if (info.menuItemId.startsWith('edge-')) {
    chrome.tabs.create({ url: info.menuItemId.replace('edge-', 'edge://') });
  } else if (info.menuItemId === "open-in-sandbox") {
    const shortenedUrl = shortenUrl(info.linkUrl);
    chrome.runtime.sendNativeMessage('com.example.browserlauncher', {
      action: 'openInSandbox',
      url: shortenedUrl
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error opening in sandbox:', chrome.runtime.lastError);
        alert('Failed to open Windows Sandbox: ' + chrome.runtime.lastError.message);
      } else if (response && response.result && response.result.startsWith("Error:")) {
        console.error('Error from native messaging:', response.result);
        alert(response.result);
      } else {
        console.log('Received response:', response);
      }
    });
  }
});

// Function to shorten URL
function shortenUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch (error) {
    console.error('Error parsing URL:', error);
    return url;
  }
}

// Initialize context menus when extension loads
chrome.runtime.onInstalled.addListener(async () => {
  // Set default values first
  const defaults = {
    contextMenuEnabled: true,
    sandboxContextEnabled: true,
    showWSL: false
  };

  // Get current values and merge with defaults
  const current = await chrome.storage.local.get(Object.keys(defaults));
  const settings = { ...defaults, ...current };

  // Save merged settings
  await chrome.storage.local.set(settings);

  // Check license status
  const { licenseStatus } = await chrome.storage.local.get('licenseStatus');
  
  // If license is expired, call disableExtensionFunctionality
  if (licenseStatus === LICENSE_STATUS.EXPIRED) {
    console.log("License expired detected during installation - disabling functionality");
    await disableExtensionFunctionality();
    return;
  }
  
  // Create context menus based on settings
  await createContextMenus(settings.showWSL);
});

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
  // Check license status first
  const { licenseStatus } = await chrome.storage.local.get('licenseStatus');
  
  // If license is expired, call disableExtensionFunctionality
  if (licenseStatus === LICENSE_STATUS.EXPIRED) {
    console.log("License expired detected during startup - disabling functionality");
    await disableExtensionFunctionality();
    return;
  }
  
  // Otherwise proceed with normal context menu creation
  const { showWSL = false } = await chrome.storage.local.get('showWSL');
  await createContextMenus(showWSL);
});

// Listen to changes in search config
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    // Check if license status changed to expired
    if (changes.licenseStatus && changes.licenseStatus.newValue === LICENSE_STATUS.EXPIRED) {
      console.log("License status changed to expired - disabling functionality");
      // Use setTimeout to prevent possible race conditions with other listeners
      setTimeout(() => {
        disableExtensionFunctionality();
      }, 100);
      return;
    }
    
    const pathsChanged = Object.keys(changes).some(key => key.includes('Path'));
    if (changes.showWSL || pathsChanged || changes.searchConfig || changes.contextMenuEnabled) {
      // Check the current license status first before recreating menus
      chrome.storage.local.get(['showWSL', 'searchConfig', 'licenseStatus'], async (result) => {
        // Check if license is expired before recreating menus
        if (result.licenseStatus === LICENSE_STATUS.EXPIRED) {
          console.log("License expired - only creating purchase menu item");
          // We only call disableExtensionFunctionality if we're not already in a license status change handler
          if (!changes.licenseStatus || changes.licenseStatus.newValue !== LICENSE_STATUS.EXPIRED) {
            setTimeout(() => {
              disableExtensionFunctionality();
            }, 100);
          }
          return;
        }
        
        const showWSL = result.showWSL || false;
        await createContextMenus(showWSL);
      });
    }
    
    if (changes.checkInterval) {
      const checkInterval = parseInt(changes.checkInterval.newValue, 10) || 60;
      chrome.alarms.clear('checkBrowserVersions', () => {
        chrome.alarms.create('checkBrowserVersions', { periodInMinutes: checkInterval });
      });
    }
  }
});

// Add message listener for context menu refresh requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'refreshContextMenus') {
    chrome.storage.local.get(['showWSL', 'sandboxContextEnabled'], async (result) => {
      const showWSL = result.showWSL || false;
      await createContextMenus(showWSL);
    });
  }
  
  // Handle PowerShell script execution request
  if (request.action === 'executePowerShellScript') {
    executePowerShellScript(request.scriptPath)
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('Error executing PowerShell script:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we'll send a response asynchronously
    return true;
  }
  
  // Listen for messages from popup.js or content scripts
  if (request.action === 'activateLicense') {
    if (request.licenseKey) {
      validateLicense(request.licenseKey).then(sendResponse);
    } else {
      sendResponse({ valid: false, message: 'No license key provided' });
    }
    return true; // Indicate we will respond asynchronously
  } 
  else if (request.action === 'deactivateLicense') {
    deactivateLicense().then(result => {
      sendResponse(result);
    });
    return true; // Indicate we will respond asynchronously
  }
  else if (request.action === 'regenerateHardwareId') {
    // Call the native host to get hardware info
    console.log("Attempting to regenerate hardware ID...");
    chrome.runtime.sendNativeMessage('com.example.browserlauncher', {
      action: 'getHardwareInfo'
    }, async (response) => {
      try {
        if (chrome.runtime.lastError) {
          console.error('Native messaging error:', chrome.runtime.lastError);
          sendResponse({ 
            success: false, 
            error: chrome.runtime.lastError.message 
          });
          return;
        }
        
        console.log("Received response from native messaging host:", response);
        
        // Handle different response formats
        if (!response) {
          console.error('Empty response from native messaging host');
          sendResponse({ 
            success: false, 
            error: 'Empty response from native messaging host'
          });
          return;
        }
        
        if (response.error) {
          console.error('Error from native messaging host:', response.error);
          sendResponse({ 
            success: false, 
            error: response.error || 'Error from native messaging host'
          });
          return;
        }
        
        // The response may be the hardware info directly
        let hardwareInfo = null;
        
        // Look for typical hardware info properties to determine if this is hardware info
        const hardwareInfoProps = ['platform', 'machine', 'processor', 'mac', 'volume_serial', 
                                   'bios_serial', 'cpu_id', 'hostname', 'machine_id'];
        
        // Check if response itself has hardware info properties
        const directMatchCount = hardwareInfoProps.filter(prop => typeof response[prop] !== 'undefined').length;
        
        if (directMatchCount >= 2) {
          console.log("Response appears to be direct hardware info");
          hardwareInfo = response;
        }
        // Also check if it's in the hardwareInfo property (legacy format)
        else if (response.hardwareInfo) {
          console.log("Found hardware info in hardwareInfo property");
          hardwareInfo = response.hardwareInfo;
        }
        // Try to find hardware info in any other property
        else {
          for (const key of Object.keys(response)) {
            const value = response[key];
            if (typeof value === 'object' && value !== null) {
              const matchCount = hardwareInfoProps.filter(prop => typeof value[prop] !== 'undefined').length;
              
              if (matchCount >= 2) {
                console.log(`Found hardware info in property "${key}"`);
                hardwareInfo = value;
                break;
              }
            }
          }
        }
        
        // If we still couldn't find hardware info, return an error
        if (!hardwareInfo) {
          console.error('Could not find hardware info in response:', response);
          sendResponse({ 
            success: false, 
            error: 'Invalid response from native messaging host: missing hardware info'
          });
          return;
        }
        
        // Generate a hardware ID from the received info
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(hardwareInfo));
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Save the generated hardware ID
        await chrome.storage.local.set({ 
          hardwareId: hashHex,
          hardwareIdError: null,
          usingFallbackId: false
        });
        
        sendResponse({ 
          success: true, 
          hardwareId: hashHex 
        });
      } catch (error) {
        console.error('Error regenerating hardware ID:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Unknown error'
        });
      }
    });
    
    return true; // Indicate we will respond asynchronously
  }
  else if (request.action === 'licenseUpdated') {
    // No longer reload extension - we're manually updating context menus
    checkLicenseStatus()
      .then(async (licenseStatus) => {
        console.log(`License status updated to: ${licenseStatus} - updating UI`);
        const { showWSL = false } = await chrome.storage.local.get('showWSL');
        
        if (licenseStatus === LICENSE_STATUS.EXPIRED) {
          await disableExtensionFunctionality();
        } else {
          await createContextMenus(showWSL);
        }
        
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error in licenseUpdated handler:', error);
        sendResponse({ success: false });
      });
    return true; // Keep channel open for async response
  }

  // Listen for messages from the popup
  if (request.action === 'updateContextMenu') {
    // Update context menu enabled state
    chrome.storage.local.set({ 'contextMenuEnabled': request.enabled }, () => {
      createContextMenus();
    });
  }
  
  if (request.action === 'updateSandboxContextMenu') {
    // Update sandbox context menu enabled state
    chrome.storage.local.set({ 'sandboxContextEnabled': request.enabled }, () => {
      createContextMenus();
    });
  }

  if (request.action === 'executeCommand') {
    // Implement the logic to execute a command
    // This is a placeholder and should be replaced with the actual implementation
    console.log('Executing command:', request.command);
    sendResponse({ success: true });
  }

  // Handle link opening from third-party landing pages
  if (request.action === 'openLinkInBrowser') {
    const { url, browserId } = request;
    
    // Map browserId to command setting
    const browserMap = {
      'edge-stable-local': 'edgeStablePath',
      'edge-beta-local': 'edgeBetaPath',
      'edge-dev-local': 'edgeDevPath',
      'chrome-stable-local': 'chromeStablePath',
      'chrome-beta-local': 'chromeBetaPath',
      'chrome-dev-local': 'chromeDevPath',
      'edge-stable': 'wslEdgeStablePath',
      'edge-beta': 'wslEdgeBetaPath',
      'edge-dev': 'wslEdgeDevPath',
      'chrome-stable': 'wslChromeStablePath',
      'chrome-beta': 'wslChromeBetaPath',
      'chrome-dev': 'wslChromeDevPath',
      'firefox': 'wslFirefoxPath',
      'opera': 'wslOperaPath',
      'brave': 'wslBravePath'
    };
    
    const commandSetting = browserMap[browserId];
    if (!commandSetting) {
      sendResponse({ 
        success: false, 
        error: 'Invalid browser ID: ' + browserId 
      });
      return true;
    }
    
    chrome.storage.local.get([commandSetting], async function (result) {
      let command = result[commandSetting];
      
      if (!command || command === 'NA') {
        sendResponse({ 
          success: false, 
          error: 'Browser path not configured for ' + browserId 
        });
        return;
      }
      
      // Prepare command based on WSL or local
      if (commandSetting.startsWith('wsl')) {
        command = await prepareWSLCommand(command);
        command = `${command} "${url}"`;
      } else {
        command = `"${command}" "${url}"`;
      }
      
      console.log('Opening link in browser:', command);
      
      // Send immediate response to prevent timeout
      // The browser launch is asynchronous, so we respond immediately
      sendResponse({ success: true, message: 'Browser launch initiated' });
      
      // Send to native messaging host (fire and forget for faster response)
      chrome.runtime.sendNativeMessage('com.example.browserlauncher', {
        command: command
      }, (response) => {
        // Log result but don't block the response
        if (chrome.runtime.lastError) {
          console.error('Native messaging error:', chrome.runtime.lastError.message);
        } else if (response && response.result && response.result.startsWith("Error:")) {
          console.error('Browser launch error:', response.result);
        } else {
          console.log('Browser launched successfully');
        }
      });
    });
    
    return true; // Keep channel open for async response
  }
});

// Function to execute PowerShell script
async function executePowerShellScript(scriptPath) {
    console.log(`Attempting to execute PowerShell script: ${scriptPath}`);
    
    try {
        // Send message to native messaging host
        const response = await chrome.runtime.sendNativeMessage(
            'com.example.browserlauncher',
            {
                action: 'executePowerShellScript',
                scriptPath: scriptPath
            }
        );
        
        if (!response) {
            const errorMsg = 'No response received from native messaging host';
            console.error(errorMsg);
            return { success: false, error: errorMsg };
        }
        
        // Check if the response contains an error
        if (response.error) {
            console.error(`Native messaging host returned error: ${response.error}`);
            return { success: false, error: response.error };
        }
        
        // Check if the response contains a result
        if (response.result) {
            console.log('PowerShell script executed successfully');
            return { success: true, result: response.result };
        } else {
            const errorMsg = 'No result returned from native messaging host';
            console.error(errorMsg);
            return { success: false, error: errorMsg };
        }
    } catch (error) {
        const errorMsg = `Native messaging error: ${error.message}`;
        console.error(errorMsg);
        return { success: false, error: errorMsg };
    }
}

// Listen for the alarm event to check browser versions
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkBrowserVersions') {
    checkAndUpdateBrowserVersions();
  }
});

// Start the periodic version check with notification flag
checkAndUpdateBrowserVersions();

// Add this function to handle the keyboard shortcut
// Update the handleShortcut function
function handleShortcut(command) {
  if (command === "open-youtube-search" || command === "open-youtube-incognito") {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length === 0) {
        console.log("No active tab found");
        return;
      }
      
      chrome.tabs.sendMessage(tabs[0].id, {action: "getSelectedText"}, function(response) {
        if (chrome.runtime.lastError) {
          console.log("Error sending message:", chrome.runtime.lastError.message);
          // Fallback: Open YouTube search without selected text
          openYouTubeSearch("", command === "open-youtube-incognito");
          return;
        }
        
        const searchQuery = response && response.selectedText ? response.selectedText : "";
        openYouTubeSearch(searchQuery, command === "open-youtube-incognito");
      });
    });
  }
}

function openYouTubeSearch(searchQuery, isIncognito) {
  const encodedQuery = encodeURIComponent(searchQuery);
  const searchUrl = searchQuery 
    ? `https://www.youtube.com/results?search_query=${encodedQuery}`
    : "https://www.youtube.com";

  if (isIncognito) {
    chrome.windows.create({ url: searchUrl, incognito: true });
  } else {
    chrome.tabs.create({ url: searchUrl });
  }
}

// Add a listener for the keyboard shortcut
chrome.commands.onCommand.addListener(handleShortcut);

// Add this line at the end of the file
initializeExtension();

// Test function to verify checkbox-based notification behavior
function testBrowserNotification(browserId, browserName) {
  console.log(`Testing notification for ${browserName} with checkbox ID ${browserId}`);
  chrome.storage.local.get([browserId], function(result) {
    console.log(`Current checkbox state for ${browserId}: ${result[browserId]}`);
    // Simulate a version update notification
    const oldVersion = "100.0.0.0";
    const newVersion = "101.0.0.0";
    
    if (result[browserId] === true) {
      console.log(`Showing notification for ${browserName} - checkbox is checked`);
      showNotification(browserName, oldVersion, newVersion);
    } else {
      console.log(`Skipping notification for ${browserName} - checkbox is not checked`);
    }
  });
}

// Example: 
// You can test this by opening the console and running:
// testBrowserNotification('edgeDevCheckbox', 'Edge Dev');

// Add a periodic check for license expiration
chrome.alarms.create('checkLicense', { periodInMinutes: 60 }); // Check license hourly

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkLicense') {
    checkLicenseStatus().then(status => {
      // If license has expired, show notification
      if (status === LICENSE_STATUS.EXPIRED) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Trial Period Expired',
          message: 'Your Browser Launcher Pro trial has expired. Please activate a license to continue using the extension.',
          priority: 2,
          buttons: [
            { title: 'Activate License' }
          ]
        }, (notificationId) => {
          chrome.notifications.onButtonClicked.addListener((nId, buttonIndex) => {
            if (nId === notificationId && buttonIndex === 0) {
              chrome.tabs.create({ url: chrome.runtime.getURL("license.html") });
            }
          });
        });
      }
    });
  }
});

// Listen for message from license page
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'licenseUpdated') {
    // Refresh the extension after license update
    chrome.runtime.reload();
  }
});

// Add a license check before executing commands
async function executeCommand(command) {
  // Check license status before execution
  const licenseStatus = await checkLicenseStatus();
  
  // Only allow commands if license is valid or in trial
  if (licenseStatus === LICENSE_STATUS.EXPIRED) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Trial Period Expired',
      message: 'Your Browser Launcher Pro trial has expired. Please activate a license to continue.',
      priority: 2,
      buttons: [
        { title: 'Activate License' }
      ]
    }, (notificationId) => {
      chrome.notifications.onButtonClicked.addListener((nId, buttonIndex) => {
        if (nId === notificationId && buttonIndex === 0) {
          chrome.tabs.create({ url: chrome.runtime.getURL("license.html") });
        }
      });
    });
    return;
  }
  
  // Continue with original execution logic
  // ... existing command execution logic would go here ...
  
  chrome.storage.local.get('eulaAccepted', function (result) {
    if (result.eulaAccepted) {
      // Execute command logic here
      // This is where you would add your existing command execution code
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL("eula.html") });
    }
  });
}

// Add message listener to handle license validation with metadata extraction
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'validateLicense') {
    validateLicense(message.licenseKey)
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('License validation error:', error);
        sendResponse({ 
          valid: false, 
          errorCode: 'unknown_error',
          message: 'Error validating license' 
        });
      });
    return true; // Keep message channel open for async response
  }
  
  if (message.action === 'deactivateLicense') {
    deactivateLicense()
      .then(result => sendResponse(result))
      .catch(error => {
        console.error('License deactivation error:', error);
        sendResponse({ success: false, message: 'Error deactivating license' });
      });
    return true; // Keep message channel open for async response
  }
  
  if (message.action === 'licenseUpdated') {
    // No longer reload extension - we're manually updating context menus
    checkLicenseStatus()
      .then(async (licenseStatus) => {
        console.log(`License status updated to: ${licenseStatus} - updating UI`);
        const { showWSL = false } = await chrome.storage.local.get('showWSL');
        
        if (licenseStatus === LICENSE_STATUS.EXPIRED) {
          await disableExtensionFunctionality();
        } else {
          await createContextMenus(showWSL);
        }
        
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error in licenseUpdated handler:', error);
        sendResponse({ success: false });
      });
    return true; // Keep channel open for async response
  }
});

/**
 * Extracts and verifies license metadata from the license key
 * @param {string} licenseKey - The license key containing encrypted metadata
 * @returns {Object} Result with validation status and metadata if successful
 */
async function extractAndVerifyLicenseMetadata(licenseKey) {
  try {
    // Check basic format first
    const parts = licenseKey.split('#');
    if (parts.length !== 2) {
      return { 
        valid: false, 
        errorCode: 'invalid_format',
        message: 'Invalid license key format'
      };
    }
    
    // Get current hardware ID
    const data = await chrome.storage.local.get('hardwareId');
    const hardwareId = data.hardwareId;
    
    if (!hardwareId) {
      return { 
        valid: false, 
        errorCode: 'unknown_error',
        message: 'Hardware ID not found'
      };
    }
    
    // Extract parts of the key
    const keyPart = parts[0];
    const metadataBase64 = parts[1];
    
    // Decode and parse the metadata
    try {
      // Decode base64 string to JSON
      const decodedData = atob(metadataBase64);
      const metadata = JSON.parse(decodedData);
      
      // Verify the license key matches the hardware ID
      const targetHardwareId = metadata.hardwareId;
      if (!targetHardwareId || targetHardwareId !== hardwareId) {
        return { 
          valid: false, 
          errorCode: 'hardware_mismatch',
          message: 'This license key is bound to a different device'
        };
      }
      
      // Check if the license has expired (for subscription licenses)
      if (metadata.expiryDate) {
        const expiryDate = new Date(metadata.expiryDate);
        const now = new Date();
        
        if (now > expiryDate) {
          return { 
            valid: false, 
            errorCode: 'expired_key',
            message: 'This license key has expired'
          };
        }
      }
      
      // Verify key integrity
      // Production implementation would use proper cryptographic validation here
      const expectedKeyPart = generateKeyFromHardwareId(hardwareId, metadata.salt || '');
      const formattedKeyPart = keyPart.replace(/-/g, '');
      
      if (formattedKeyPart.substr(5, 8) !== hardwareId.substr(0, 8)) {
        return { 
          valid: false,
          errorCode: 'tampered_key',
          message: 'Invalid license key for this device'
        };
      }
      
      // All verification passed
      return {
        valid: true,
        metadata: {
          name: metadata.name,
          email: metadata.email,
          hardwareId: metadata.hardwareId,
          purchaseDate: metadata.purchaseDate,
          expiryDate: metadata.expiryDate,
          licenseType: metadata.licenseType || 'lifetime',
          salt: metadata.salt
        }
      };
    } catch (e) {
      console.error('Error decoding license metadata:', e);
      return { 
        valid: false, 
        errorCode: 'extraction_failed',
        message: 'Could not decode license key data'
      };
    }
  } catch (error) {
    console.error('Error extracting license metadata:', error);
    return { 
      valid: false, 
      errorCode: 'unknown_error',
      message: 'An unexpected error occurred' 
    };
  }
}

/**
 * Helper function to generate key part from hardware ID
 */
function generateKeyFromHardwareId(hardwareId, salt = '') {
  // This should match the algorithm in license_generator.py
  if (!salt) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    salt = Array.from({length: 5}, () => 
      chars.charAt(Math.floor(Math.random() * chars.length))).join('');
  }
  
  // Take first 8 chars of hardware ID
  const hwPrefix = hardwareId.substring(0, 8);
  
  // Generate a key using salt and hardware ID
  return salt + hwPrefix;
}

/**
 * Validates a license key and activates the license if valid
 */
async function validateLicense(licenseKey) {
  try {
    if (!licenseKey || licenseKey.length < 20) {
      return { 
        valid: false,
        errorCode: 'invalid_format',
        message: 'Invalid license key format'
      };
    }
    
    // Extract and verify the license metadata
    const result = await extractAndVerifyLicenseMetadata(licenseKey);
    
    if (result.valid) {
      const metadata = result.metadata;
      
      // Save license information to storage - preserve the full name exactly as it appears in the license
      const licenseData = {
        licenseKey: licenseKey,
        licenseStatus: 'licensed',
        licenseeName: metadata.name, // Ensure this gets the complete name without modification
        licenseeEmail: metadata.email || '',
        purchaseDate: metadata.purchaseDate || new Date().toISOString(),
        licenseType: metadata.licenseType || 'lifetime'
      };
      
      // Add expiry date if present (for subscription licenses)
      if (metadata.expiryDate) {
        licenseData.expiryDate = metadata.expiryDate;
      }
      
      // Set the license data in storage
      await chrome.storage.local.set(licenseData);
      
      // Force context menu recreation when license is activated
      console.log("License activated - recreating context menus");
      const { showWSL = false } = await chrome.storage.local.get('showWSL');
      await createContextMenus(showWSL);
      
      return { 
        valid: true, 
        message: 'License activated successfully',
        metadata: metadata
      };
    }
    
    // Return the error from the extraction function
    return result;
  } catch (error) {
    console.error('License validation error:', error);
    return { 
      valid: false,
      errorCode: 'unknown_error',
      message: 'Error validating license: ' + (error.message || 'Unknown error')
    };
  }
}

/**
 * Deactivates the current license
 */
async function deactivateLicense() {
  try {
    const licenseKeys = [
      'licenseKey', 
      'licenseeName', 
      'licenseeEmail', 
      'purchaseDate', 
      'expiryDate', 
      'licenseType'
    ];
    
    // Remove license data
    for (const key of licenseKeys) {
      await chrome.storage.local.remove(key);
    }
    
    // Check if trial is still valid or expired
    const trialStatus = await checkTrialStatus();
    
    // Update license status
    await chrome.storage.local.set({ licenseStatus: trialStatus });
    
    // Force context menu recreation based on the new status
    console.log(`License deactivated - recreating context menus with status: ${trialStatus}`);
    const { showWSL = false } = await chrome.storage.local.get('showWSL');
    
    if (trialStatus === LICENSE_STATUS.EXPIRED) {
      await disableExtensionFunctionality();
    } else {
      await createContextMenus(showWSL);
    }
    
    return { 
      success: true, 
      message: 'License deactivated successfully',
      trialStatus: trialStatus
    };
  } catch (error) {
    console.error('License deactivation error:', error);
    return { success: false, message: 'Error deactivating license' };
  }
}