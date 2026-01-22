import React, { useState, useEffect, useCallback } from 'react';
import { createTile, getTiles } from '../services/storageService';
import { parseSpaceExportObject, normalizeImportedTiles } from '../services/spaceTransferService';
import { settingsService } from '../services/settingsService';
import { useAuth } from '../contexts/AuthContext';

interface Bookmark {
  title: string;
  url: string;
}

interface FavOrganizerWidgetProps {
  onClose?: () => void;
}

const OPENROUTER_API_KEY_STORAGE = 'linknest_openrouter_api_key';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_STORAGE = 'linknest_openrouter_model';
const CHUNK_SIZE_STORAGE = 'linknest_chunk_size';

// Popular OpenRouter models (including free ones)
const AVAILABLE_MODELS = [
  { id: 'openrouter/auto', name: 'Auto (Best Model)', cost: 'varies', free: false },
  { id: 'openai/gpt-4o', name: 'GPT-4o', cost: '$$', free: false },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', cost: '$', free: false },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', cost: '$$', free: false },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', cost: '$', free: false },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', cost: '$', free: false },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B (FREE)', cost: 'FREE', free: true },
  { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5 (FREE)', cost: 'FREE', free: true },
  { id: 'mistralai/mistral-7b-instruct', name: 'Mistral 7B (FREE)', cost: 'FREE', free: true },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B (FREE)', cost: 'FREE', free: true },
];

interface ProcessingStats {
  totalLinks: number;
  uniqueLinks: number;
  duplicateLinks: number;
  processedLinks: number;
  unprocessedLinks: number;
  totalTiles: number;
  totalSections: number;
  processingTime: number;
  chunksProcessed: number;
  totalCost: number;
}

interface ChunkProgress {
  current: number;
  total: number;
  chunkTime?: number;
  startTime?: number;
  processedCount?: number;
  unprocessedCount?: number;
  chunkCost?: number;
  totalCost?: number;
}

export const FavOrganizerWidget: React.FC<FavOrganizerWidgetProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'manual'>('manual');
  const [apiKey, setApiKey] = useState<string>('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [organizedJson, setOrganizedJson] = useState<string | null>(null);
  const [extractionMethod, setExtractionMethod] = useState<'html' | 'manual'>('html');
  const [progress, setProgress] = useState<ChunkProgress | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('openai/gpt-4o-mini');
  const [chunkSize, setChunkSize] = useState<number>(100);
  const [chunkSizeInput, setChunkSizeInput] = useState<string>('100');
  const [stats, setStats] = useState<ProcessingStats | null>(null);
  const [uniqueBookmarks, setUniqueBookmarks] = useState<Bookmark[]>([]);
  const [duplicateCount, setDuplicateCount] = useState<number>(0);
  const [processedLinks, setProcessedLinks] = useState<Bookmark[]>([]);
  const [unprocessedLinks, setUnprocessedLinks] = useState<Bookmark[]>([]);
  const [lastPrompt, setLastPrompt] = useState<string>('');
  const [chunkCosts, setChunkCosts] = useState<number[]>([]);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [isCancelled, setIsCancelled] = useState<boolean>(false);
  const [browserExtensionEnabled, setBrowserExtensionEnabled] = useState<boolean>(false);
  const [extensionStatus, setExtensionStatus] = useState<'checking' | 'found' | 'not-found' | 'error'>('checking');

  // Manual organization state
  const [manualTiles, setManualTiles] = useState<Array<{
    id: string;
    title: string;
    description: string;
    emoji: string;
    themeColor: string;
    links: Bookmark[];
  }>>([]);

  // Offline AI prompt state
  const [showOfflinePrompt, setShowOfflinePrompt] = useState(false);
  const [offlinePrompt, setOfflinePrompt] = useState<string>('');
  const [offlineResponse, setOfflineResponse] = useState<string>('');

  // Import to category state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [categoryName, setCategoryName] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [createNewCategory, setCreateNewCategory] = useState<boolean>(false);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [importCancelled, setImportCancelled] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    status: string;
    errors: string[];
  } | null>(null);

  // Auto-generate tiles from bookmarks by domain (for manual organization)
  const autoGenerateTilesByDomain = (bookmarkList: Bookmark[]) => {
    if (bookmarkList.length === 0) {
      setManualTiles([]);
      return;
    }

    const domainMap = new Map<string, Bookmark[]>();

    bookmarkList.forEach(bookmark => {
      try {
        const url = new URL(bookmark.url);
        const domain = url.hostname.replace('www.', '').replace(/^\.+/, '');
        const baseDomain = domain.split('.').slice(-2).join('.'); // Get main domain (e.g., google.com from mail.google.com)

        if (!domainMap.has(baseDomain)) {
          domainMap.set(baseDomain, []);
        }
        domainMap.get(baseDomain)!.push(bookmark);
      } catch {
        // Invalid URL, put in misc
        if (!domainMap.has('misc')) {
          domainMap.set('misc', []);
        }
        domainMap.get('misc')!.push(bookmark);
      }
    });

    // Create tiles from domains
    const emojis = ['💻', '🌐', '📚', '🛠️', '🎨', '🚀', '📱', '☁️', '🔐', '💰', '📊', '🎮', '🎵', '📷', '✈️', '🛒', '🏥', '🎓', '📝', '💡'];
    const colors = ['blue', 'emerald', 'violet', 'amber', 'rose', 'cyan', 'fuchsia', 'orange', 'indigo', 'lime', 'sky', 'slate', 'teal', 'pink', 'purple', 'yellow', 'zinc', 'red', 'green', 'gray'];

    const generatedTiles = Array.from(domainMap.entries()).map(([domain, links], index) => {
      const domainName = domain === 'misc' ? 'Miscellaneous' : domain.charAt(0).toUpperCase() + domain.slice(1);
      return {
        id: `tile_${Date.now()}_${index}`,
        title: domainName,
        description: `${links.length} link${links.length !== 1 ? 's' : ''} from ${domain}`,
        emoji: emojis[index % emojis.length],
        themeColor: colors[index % colors.length],
        links
      };
    });

    // Sort by domain name (misc at the end)
    generatedTiles.sort((a, b) => {
      if (a.title === 'Miscellaneous') return 1;
      if (b.title === 'Miscellaneous') return -1;
      return a.title.localeCompare(b.title);
    });

    setManualTiles(generatedTiles);
  };

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem(OPENROUTER_API_KEY_STORAGE);
    if (savedKey) {
      setApiKey(savedKey);
    }
    const savedModel = localStorage.getItem(MODEL_STORAGE);
    if (savedModel) {
      setSelectedModel(savedModel);
    }
    const savedChunkSize = localStorage.getItem(CHUNK_SIZE_STORAGE);
    if (savedChunkSize) {
      const size = parseInt(savedChunkSize, 10);
      if (size >= 10 && size <= 500) {
        setChunkSize(size);
        setChunkSizeInput(savedChunkSize);
      }
    }
  }, []);

  // Fetch browser extension enabled setting
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await settingsService.getSettings();
        setBrowserExtensionEnabled(settings.browser_specific_links_enabled === '1');
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      }
    };
    fetchSettings();
  }, []);

  // Fetch available categories from private tabs when import dialog opens
  useEffect(() => {
    const fetchCategories = async () => {
      if (showImportDialog) {
        try {
          const tiles = await getTiles();
          // Get categories from tiles that have private tabs
          const categoriesSet = new Set<string>();
          tiles.forEach(tile => {
            // Check if tile has tabs with private visibility
            if (tile.tabs && Array.isArray(tile.tabs)) {
              const hasPrivateTab = tile.tabs.some(tab => tab.visibility === 'private');
              if (hasPrivateTab && tile.group) {
                categoriesSet.add(tile.group);
              }
            }
            // Also include tiles with private visibility themselves
            if (tile.visibility === 'private' && tile.group) {
              categoriesSet.add(tile.group);
            }
          });
          const categories = Array.from(categoriesSet).sort();
          setAvailableCategories(categories);
          
          // If no categories found, default to creating a new one
          if (categories.length === 0) {
            setCreateNewCategory(true);
          }
        } catch (err) {
          console.error('Failed to fetch categories:', err);
          setAvailableCategories([]);
          setCreateNewCategory(true); // Default to creating new category on error
        }
      }
    };
    fetchCategories();
  }, [showImportDialog]);

  // Detect Browser Launcher Pro extension
  const detectExtension = useCallback(() => {
    setExtensionStatus('checking');
    let extensionFound = false;

    // Check if extension is available via postMessage
    const timestamp = Date.now();
    const checkMessage = {
      type: 'BROWSER_LAUNCHER_CHECK',
      timestamp: timestamp
    };

    const responseListener = (event: MessageEvent) => {
      if (event.data &&
        event.data.type === 'BROWSER_LAUNCHER_CHECK_RESPONSE' &&
        event.data.timestamp === timestamp) {
        window.removeEventListener('message', responseListener);
        extensionFound = true;

        if (event.data.available) {
          setExtensionStatus('found');
        } else {
          setExtensionStatus('not-found');
        }
      }
    };

    window.addEventListener('message', responseListener);
    window.postMessage(checkMessage, '*');

    // Timeout after 3 seconds
    setTimeout(() => {
      window.removeEventListener('message', responseListener);
      if (!extensionFound) {
        setExtensionStatus('not-found');
      }
    }, 3000);
  }, []);

  // Detect extension when browser extension is enabled
  useEffect(() => {
    if (browserExtensionEnabled) {
      detectExtension();
    }
  }, [browserExtensionEnabled, detectExtension]);

  // Fetch bookmarks from browser extension (shared function)
  const fetchBookmarksFromExtension = async () => {
    setLoading(true);
    setError(null);

    try {
      const timestamp = Date.now();
      const message = {
        type: 'BROWSER_LAUNCHER_GET_BOOKMARKS',
        timestamp: timestamp
      };

      const responseListener = (event: MessageEvent) => {
        if (event.data &&
          event.data.type === 'BROWSER_LAUNCHER_BOOKMARKS_LIST' &&
          event.data.timestamp === timestamp) {
          window.removeEventListener('message', responseListener);

          if (event.data.success && event.data.bookmarks) {
            // Deduplicate bookmarks
            const { unique, duplicateCount } = deduplicateBookmarks(event.data.bookmarks);

            setBookmarks(unique);
            setUniqueBookmarks(unique);
            setDuplicateCount(duplicateCount);

            // Auto-generate tiles
            autoGenerateTilesByDomain(unique);

            if (unique.length === 0) {
              setError('No bookmarks found in browser extension.');
            } else {
              setError(null);
              if (duplicateCount > 0) {
                console.log(`Filtered ${duplicateCount} duplicate bookmark(s). Processing ${unique.length} unique links.`);
              }
            }
          } else {
            setError(event.data?.error || 'Failed to fetch bookmarks from extension.');
          }

          setLoading(false);
        }
      };

      window.addEventListener('message', responseListener);
      window.postMessage(message, '*');

      // Timeout after 15 seconds
      setTimeout(() => {
        window.removeEventListener('message', responseListener);
        if (loading) {
          setError('Timeout waiting for extension response. Make sure Browser Launcher Pro extension is installed and enabled.');
          setLoading(false);
        }
      }, 15000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch bookmarks from extension.');
      setLoading(false);
    }
  };

  // Auto-generate tiles when bookmarks are loaded in manual organization tab
  useEffect(() => {
    if (activeTab === 'manual' && bookmarks.length > 0) {
      // Only auto-generate if tiles are empty (don't overwrite user's manual organization)
      if (manualTiles.length === 0) {
        autoGenerateTilesByDomain(bookmarks);
      }
    }
  }, [activeTab, bookmarks.length]); // Only trigger when tab changes or bookmarks are added

  // Save API key to localStorage when changed
  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    if (value.trim()) {
      localStorage.setItem(OPENROUTER_API_KEY_STORAGE, value);
    } else {
      localStorage.removeItem(OPENROUTER_API_KEY_STORAGE);
    }
  };

  // Deduplicate bookmarks by URL (case-insensitive, normalize URLs)
  const deduplicateBookmarks = (bookmarks: Bookmark[]): { unique: Bookmark[]; duplicateCount: number } => {
    const seenUrls = new Map<string, Bookmark>();
    const unique: Bookmark[] = [];
    let duplicates = 0;

    for (const bookmark of bookmarks) {
      // Normalize URL: lowercase, remove trailing slash, remove fragments
      const normalizedUrl = bookmark.url
        .toLowerCase()
        .replace(/\/$/, '') // Remove trailing slash
        .split('#')[0] // Remove fragment
        .trim();

      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.set(normalizedUrl, bookmark);
        unique.push(bookmark);
      } else {
        duplicates++;
        // Keep the bookmark with the better title (longer, more descriptive)
        const existing = seenUrls.get(normalizedUrl)!;
        if (bookmark.title.length > existing.title.length && bookmark.title !== bookmark.url) {
          // Replace with better title
          const index = unique.findIndex(b => {
            const norm = b.url.toLowerCase().replace(/\/$/, '').split('#')[0].trim();
            return norm === normalizedUrl;
          });
          if (index !== -1) {
            unique[index] = bookmark;
            seenUrls.set(normalizedUrl, bookmark);
          }
        }
      }
    }

    return { unique, duplicateCount: duplicates };
  };

  // Parse HTML bookmark file (Netscape format used by Chrome/Edge/Firefox)
  const parseHTMLBookmarks = (htmlContent: string): Bookmark[] => {
    const bookmarksList: Bookmark[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // Find all anchor tags (bookmarks)
    const links = doc.querySelectorAll('a');

    links.forEach((link) => {
      const href = link.getAttribute('href');
      const title = link.textContent?.trim() || href || '';

      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        bookmarksList.push({
          title: title || href,
          url: href
        });
      }
    });

    return bookmarksList;
  };

  // Handle HTML bookmark file import
  const handleHTMLFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      setError(null);

      const text = await file.text();
      const extracted = parseHTMLBookmarks(text);

      // Deduplicate bookmarks
      const { unique, duplicateCount } = deduplicateBookmarks(extracted);

      setBookmarks(unique);
      setUniqueBookmarks(unique);
      setDuplicateCount(duplicateCount);

      // Auto-generate tiles if in manual organization tab
      if (activeTab === 'manual') {
        autoGenerateTilesByDomain(unique);
      }

      if (unique.length === 0) {
        setError('No bookmarks found in the HTML file. Please ensure it\'s a valid bookmark export file.');
      } else {
        setError(null);
        if (duplicateCount > 0) {
          // Show info about duplicates (not an error)
          console.log(`Filtered ${duplicateCount} duplicate bookmark(s). Processing ${unique.length} unique links.`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse HTML bookmark file');
      setBookmarks([]);
      setUniqueBookmarks([]);
      setDuplicateCount(0);
    } finally {
      setLoading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  // Handle manual bookmark input
  const handleManualInput = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    const extracted: Bookmark[] = [];

    for (const line of lines) {
      // Try to parse as URL or title|URL format
      const trimmed = line.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        extracted.push({
          title: trimmed,
          url: trimmed
        });
      } else if (trimmed.includes('|')) {
        const [title, url] = trimmed.split('|').map(s => s.trim());
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          extracted.push({ title: title || url, url });
        }
      } else if (trimmed.includes('\t')) {
        // Tab-separated format (common in bookmark exports)
        const parts = trimmed.split('\t');
        if (parts.length >= 2) {
          const url = parts[0].trim();
          const title = parts[1].trim();
          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            extracted.push({ title: title || url, url });
          }
        }
      }
    }

    // Deduplicate bookmarks
    const { unique, duplicateCount } = deduplicateBookmarks(extracted);

    setBookmarks(unique);
    setUniqueBookmarks(unique);
    setDuplicateCount(duplicateCount);

    // Auto-generate tiles if in manual organization tab
    if (activeTab === 'manual') {
      autoGenerateTilesByDomain(unique);
    }

    if (unique.length === 0 && lines.length > 0) {
      setError('No valid URLs found. Please use format: "Title|URL" or just "URL"');
    } else {
      setError(null);
      if (duplicateCount > 0) {
        console.log(`Filtered ${duplicateCount} duplicate bookmark(s). Processing ${unique.length} unique links.`);
      }
    }
  };

  // Generate unique IDs
  const generateId = (prefix: string, index: number) => `${prefix}_${index}_${Date.now()}`;

  // Track which links were processed and return both count and lists
  const trackProcessedLinks = (tiles: any[], allBookmarks: Bookmark[]): {
    count: number;
    processed: Bookmark[];
    unprocessed: Bookmark[]
  } => {
    const processedUrls = new Set<string>();
    const processed: Bookmark[] = [];

    // Collect all processed URLs
    for (const tile of tiles) {
      // Check tabs
      if (tile.tabs && Array.isArray(tile.tabs)) {
        for (const tab of tile.tabs) {
          if (tab.sections && Array.isArray(tab.sections)) {
            for (const section of tab.sections) {
              if (section.links && Array.isArray(section.links)) {
                for (const link of section.links) {
                  if (link.url) {
                    const normalizedUrl = link.url.toLowerCase().replace(/\/$/, '').split('#')[0].trim();
                    if (!processedUrls.has(normalizedUrl)) {
                      processedUrls.add(normalizedUrl);
                      processed.push({
                        title: link.label || link.url,
                        url: link.url
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
      // Also check legacy sections array
      if (tile.sections && Array.isArray(tile.sections)) {
        for (const section of tile.sections) {
          if (section.links && Array.isArray(section.links)) {
            for (const link of section.links) {
              if (link.url) {
                const normalizedUrl = link.url.toLowerCase().replace(/\/$/, '').split('#')[0].trim();
                if (!processedUrls.has(normalizedUrl)) {
                  processedUrls.add(normalizedUrl);
                  processed.push({
                    title: link.label || link.url,
                    url: link.url
                  });
                }
              }
            }
          }
        }
      }
    }

    // Find unprocessed links
    const unprocessed: Bookmark[] = [];
    for (const bookmark of allBookmarks) {
      const normalizedUrl = bookmark.url.toLowerCase().replace(/\/$/, '').split('#')[0].trim();
      if (!processedUrls.has(normalizedUrl)) {
        unprocessed.push(bookmark);
      }
    }

    return {
      count: processed.length,
      processed,
      unprocessed
    };
  };

  // Estimate cost based on model and tokens
  const estimateCost = (model: string, inputTokens: number, outputTokens: number): number => {
    // Approximate pricing per 1M tokens (as of 2024)
    // These are estimates - actual pricing may vary
    const pricing: Record<string, { input: number; output: number }> = {
      'openai/gpt-4o': { input: 2.5, output: 10 },
      'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
      'anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
      'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
      'google/gemini-pro-1.5': { input: 1.25, output: 5 },
      'google/gemini-flash-1.5': { input: 0, output: 0 },
      'meta-llama/llama-3.1-70b-instruct': { input: 0, output: 0 },
      'mistralai/mistral-7b-instruct': { input: 0, output: 0 },
      'qwen/qwen-2.5-72b-instruct': { input: 0, output: 0 },
      'openrouter/auto': { input: 2, output: 8 }, // Average estimate
    };

    const modelPricing = pricing[model] || { input: 1, output: 4 }; // Default fallback
    const inputCost = (inputTokens / 1_000_000) * modelPricing.input;
    const outputCost = (outputTokens / 1_000_000) * modelPricing.output;

    return inputCost + outputCost;
  };

  // Process a single chunk of bookmarks
  const processChunk = async (chunk: Bookmark[], chunkIndex: number, totalChunks: number, startTime: number, currentTotalCost: number, signal?: AbortSignal): Promise<{ result: any; prompt: string; cost: number; inputTokens: number; outputTokens: number }> => {
    const bookmarksText = chunk.map((b, i) => `${i + 1}. ${b.title} - ${b.url}`).join('\n');

    const currentTimestamp = Math.floor(Date.now() / 1000);

    // Optimize prompt size for small batches
    const isSmallBatch = chunk.length <= 20;
    const templateExample = isSmallBatch ? `{
  "version": "1.1",
  "type": "category",
  "exportedAt": ${Date.now()},
  "categoryName": "Main",
  "tiles": [{
    "id": "tile_1",
    "title": "Category Name",
    "description": "Description",
    "htmlContent": "",
    "emoji": "💻",
    "themeColor": "blue",
    "group": "group1",
    "createdAt": ${currentTimestamp},
    "tabs": [{
      "id": "tab_1",
      "title": "Tab Name",
      "position": 0,
      "textColor": null,
      "visibleFrom": null,
      "expiresAt": null,
      "sections": [{
        "id": "sec_1",
        "title": "Section Name",
        "textColor": null,
        "visibleFrom": null,
        "expiresAt": null,
        "forceStackedView": false,
        "position": 0,
        "links": [{
          "id": "link_1",
          "label": "Link Title",
          "url": "https://example.com",
          "icon": null,
          "textColor": null,
          "visibility": "public",
          "allowedUsers": [],
          "notes": null,
          "tooltip": null,
          "visibleFrom": null,
          "expiresAt": null,
          "browser": null,
          "isFavorite": false,
          "hasRoleAccess": false,
          "position": 0,
          "health": {"status": "unknown", "httpCode": null, "error": null, "checkedAt": null}
        }],
        "richTextContent": []
      }]
    }],
    "sections": [],
    "visibility": "public",
    "allowedUsers": [],
    "isFavorite": false,
    "isHyperlink": false,
    "openInNewTab": true,
    "canView": true,
    "canEdit": true,
    "canDelete": true
  }]
}` : `{
  "version": "1.1",
  "type": "category",
  "exportedAt": ${Date.now()},
  "categoryName": "{CATEGORY_NAME}",
  "tiles": [{
    "id": "{UNIQUE_ID}",
    "title": "{TILE_TITLE}",
    "description": "{TILE_DESCRIPTION}",
    "htmlContent": "",
    "emoji": "{EMOJI}",
    "themeColor": "{COLOR}",
    "group": "{GROUP}",
    "createdAt": ${currentTimestamp},
    "tabs": [{
      "id": "{UNIQUE_ID}",
      "title": "{TAB_TITLE}",
      "position": 0,
      "textColor": null,
      "visibleFrom": null,
      "expiresAt": null,
      "sections": [{
        "id": "{UNIQUE_ID}",
        "title": "{SECTION_TITLE}",
        "textColor": null,
        "visibleFrom": null,
        "expiresAt": null,
        "forceStackedView": false,
        "position": 0,
        "links": [{
          "id": "{UNIQUE_ID}",
          "label": "{LINK_LABEL}",
          "url": "{URL}",
          "icon": null,
          "textColor": null,
          "visibility": "public",
          "allowedUsers": [],
          "notes": null,
          "tooltip": null,
          "visibleFrom": null,
          "expiresAt": null,
          "browser": null,
          "isFavorite": false,
          "hasRoleAccess": false,
          "position": 0,
          "health": {"status": "unknown", "httpCode": null, "error": null, "checkedAt": null}
        }],
        "richTextContent": []
      }]
    }],
    "sections": [{
      "id": "{UNIQUE_ID}",
      "title": "{SECTION_TITLE}",
      "textColor": null,
      "visibleFrom": null,
      "expiresAt": null,
      "forceStackedView": false,
      "position": 0,
      "links": [{
        "id": "{UNIQUE_ID}",
        "label": "{LINK_LABEL}",
        "url": "{URL}",
        "icon": null,
        "textColor": null,
        "visibility": "public",
        "allowedUsers": [],
        "notes": null,
        "tooltip": null,
        "visibleFrom": null,
        "expiresAt": null,
        "browser": null,
        "isFavorite": false,
        "hasRoleAccess": false,
        "position": 0,
        "health": {"status": "unknown", "httpCode": null, "error": null, "checkedAt": null}
      }],
      "richTextContent": []
    }],
    "visibility": "public",
    "allowedUsers": [],
    "isFavorite": false,
    "isHyperlink": false,
    "openInNewTab": true,
    "canView": true,
    "canEdit": true,
    "canDelete": true
  }]
}`;

    const prompt = `Organize these ${chunk.length} browser bookmarks into structured JSON. Group related links into tiles, sections, and tabs.

Rules:
- Create logical tiles (categories) for related bookmarks
- Use descriptive titles and appropriate emojis: 💻 🎨 🚀 📚 🛠️ 🎮 🎵 🎬 📷 📝 💰 🏥 ✈️ 🛒 🍔 🏋️ 🏠 🎓 🔐 ☁️ 📱 🌐 💡 📅 🔍 ⚙️ 📂 📧 📊 📈
- Use theme colors: blue, emerald, violet, amber, rose, cyan, fuchsia, orange, red, indigo, lime, sky, slate, teal, pink, purple, yellow, zinc
- Generate unique IDs (prefixes: tile_, tab_, sec_, link_)
- Include ALL ${chunk.length} bookmarks - do not skip any
- Set createdAt to ${currentTimestamp}, visibility to "public" for all links
- Keep null fields as null

JSON Structure:
${templateExample}

Bookmarks (Chunk ${chunkIndex + 1}/${totalChunks}):
${bookmarksText}

IMPORTANT: Return ONLY valid JSON. No markdown code blocks, no explanations, no text before or after. Start with { and end with }. Include ALL ${chunk.length} bookmarks.`;

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'LinkNest Fav Organizer'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: Math.min(16000, Math.max(4000, chunk.length * 300)), // Adaptive: ~300 tokens per link, min 4000, max 16000 (optimized for chunks up to 100 URLs)
        response_format: { type: 'json_object' }
      }),
      ...(signal && { signal })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    // Check if cancelled
    if (signal?.aborted) {
      throw new Error('Processing cancelled by user');
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const finishReason = data.choices?.[0]?.finish_reason;

    if (!content) {
      throw new Error('No response from API');
    }

    // Check if response was truncated
    if (finishReason === 'length') {
      console.warn('API response was truncated due to token limit. Consider increasing max_tokens or reducing chunk size.');
    }

    // Get token usage from response (if available)
    const usage = data.usage || {};
    const inputTokens = usage.prompt_tokens || Math.ceil(prompt.length / 4); // Rough estimate: ~4 chars per token
    const outputTokens = usage.completion_tokens || Math.ceil(content.length / 4);

    // Calculate cost
    const cost = estimateCost(selectedModel, inputTokens, outputTokens);

    // Clean the response - extract JSON more robustly
    let jsonText = content.trim();

    // Remove markdown code blocks (handle various formats)
    jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    jsonText = jsonText.replace(/^```\s*/i, '').replace(/\s*```$/i, '');

    // Try to extract JSON object if there's text before/after
    // Look for first { and last } to extract JSON object
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonText = jsonText.substring(firstBrace, lastBrace + 1);
    }

    // Clean up any remaining whitespace and remove BOM/zero-width characters
    jsonText = jsonText.trim().replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF]/g, '');

    // Validate JSON structure completeness before parsing
    const openBraces = (jsonText.match(/{/g) || []).length;
    const closeBraces = (jsonText.match(/}/g) || []).length;
    const openBrackets = (jsonText.match(/\[/g) || []).length;
    const closeBrackets = (jsonText.match(/\]/g) || []).length;

    if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
      console.warn('JSON structure appears incomplete:', {
        braces: { open: openBraces, close: closeBraces },
        brackets: { open: openBrackets, close: closeBrackets }
      });
      // Try to fix incomplete JSON by adding missing closing brackets/braces
      // Close brackets first (inner structures), then braces (outer structure)
      let fixedJson = jsonText.trim();

      // Remove any trailing incomplete property (ends with comma or incomplete string)
      fixedJson = fixedJson.replace(/,\s*$/, ''); // Remove trailing comma
      fixedJson = fixedJson.replace(/:\s*$/, ''); // Remove trailing colon
      fixedJson = fixedJson.replace(/:\s*"[^"]*$/, ''); // Remove incomplete string value
      fixedJson = fixedJson.replace(/:\s*[^,}\]]*$/, ''); // Remove incomplete value

      // Close brackets first (inner structures), then braces (outer structure)
      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        fixedJson += ']';
      }
      for (let i = 0; i < openBraces - closeBraces; i++) {
        fixedJson += '}';
      }
      jsonText = fixedJson;
      console.log('Attempted to fix incomplete JSON by adding closing brackets/braces');
    }

    // Parse and validate JSON
    let organized;
    try {
      organized = JSON.parse(jsonText);
    } catch (parseError) {
      // Provide more helpful error message with snippet of response
      const errorSnippet = content.substring(0, 200).replace(/\n/g, ' ');
      const errorMsg = `Invalid JSON response from API. ${parseError instanceof Error ? parseError.message : 'Parse error'}. Response preview: ${errorSnippet}...`;
      console.error('JSON Parse Error:', parseError);
      console.error('Raw response length:', content.length);
      console.error('Raw response (first 500 chars):', content.substring(0, 500));
      console.error('Raw response (last 500 chars):', content.substring(Math.max(0, content.length - 500)));
      console.error('Cleaned JSON text length:', jsonText.length);
      console.error('Cleaned JSON text (first 500 chars):', jsonText.substring(0, 500));
      console.error('Cleaned JSON text (last 500 chars):', jsonText.substring(Math.max(0, jsonText.length - 500)));
      console.error('JSON structure check:', {
        braces: { open: openBraces, close: closeBraces },
        brackets: { open: openBrackets, close: closeBrackets }
      });
      throw new Error(errorMsg);
    }

    return { result: organized, prompt, cost, inputTokens, outputTokens };
  };

  // Merge multiple organized results into one
  const mergeOrganizedResults = (results: any[]): any => {
    const mergedTiles: any[] = [];
    const tileMap = new Map<string, any>(); // Map by group+title for merging similar tiles

    for (const result of results) {
      if (!result || !result.tiles || !Array.isArray(result.tiles)) continue;

      for (const tile of result.tiles) {
        const key = `${tile.group || 'Main'}_${tile.title}`;

        if (tileMap.has(key)) {
          // Merge into existing tile
          const existingTile = tileMap.get(key);

          // Merge tabs/sections
          if (tile.tabs && Array.isArray(tile.tabs)) {
            for (const tab of tile.tabs) {
              if (tab.sections && Array.isArray(tab.sections)) {
                // Find or create matching tab
                let existingTab = existingTile.tabs.find((t: any) => t.title === tab.title);
                if (!existingTab) {
                  existingTab = {
                    ...tab,
                    id: generateId('tab', existingTile.tabs.length),
                    position: existingTile.tabs.length
                  };
                  existingTile.tabs.push(existingTab);
                }

                // Merge sections
                for (const section of tab.sections) {
                  let existingSection = existingTab.sections.find((s: any) => s.title === section.title);
                  if (!existingSection) {
                    existingSection = {
                      ...section,
                      id: generateId('sec', existingTab.sections.length),
                      position: existingTab.sections.length,
                      links: []
                    };
                    existingTab.sections.push(existingSection);
                  }

                  // Add links to section
                  if (section.links && Array.isArray(section.links)) {
                    for (const link of section.links) {
                      // Check for duplicates by URL
                      const linkExists = existingSection.links.some((l: any) => l.url === link.url);
                      if (!linkExists) {
                        existingSection.links.push({
                          ...link,
                          id: generateId('link', existingSection.links.length),
                          position: existingSection.links.length
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        } else {
          // New tile
          const newTile = { ...tile };
          newTile.id = generateId('tile', mergedTiles.length);
          tileMap.set(key, newTile);
          mergedTiles.push(newTile);
        }
      }
    }

    return {
      version: '1.1',
      type: 'category',
      exportedAt: Date.now(),
      categoryName: 'Main',
      tiles: mergedTiles
    };
  };

  // Organize bookmarks using OpenRouter API (with chunking)
  const handleOrganize = async () => {
    if (!apiKey.trim()) {
      setError('Please enter your OpenRouter API key');
      return;
    }

    if (bookmarks.length === 0) {
      setError('Please extract or enter bookmarks first');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setProgress(null);
      setStats(null);
      setIsCancelled(false);

      // Create abort controller for cancellation
      const controller = new AbortController();
      setAbortController(controller);

      const startTime = Date.now();

      // Save settings
      localStorage.setItem(MODEL_STORAGE, selectedModel);
      localStorage.setItem(CHUNK_SIZE_STORAGE, chunkSize.toString());

      // Split bookmarks into chunks
      const chunks: Bookmark[][] = [];
      for (let i = 0; i < bookmarks.length; i += chunkSize) {
        chunks.push(bookmarks.slice(i, i + chunkSize));
      }

      const totalChunks = chunks.length;
      setProgress({ current: 0, total: totalChunks, startTime });

      // Process each chunk
      const results: any[] = [];
      const prompts: string[] = [];
      const chunkStartTimes: number[] = [];
      const costs: number[] = [];
      let runningTotalCost = 0;
      let runningProcessedCount = 0;
      let runningUnprocessedCount = 0;

      for (let i = 0; i < chunks.length; i++) {
        chunkStartTimes[i] = Date.now();

        // Check if cancelled before processing chunk
        if (controller.signal.aborted) {
          throw new Error('Processing cancelled by user');
        }

        const { result, prompt, cost, inputTokens, outputTokens } = await processChunk(
          chunks[i],
          i,
          totalChunks,
          startTime,
          runningTotalCost,
          controller.signal
        );

        results.push(result);
        prompts.push(prompt);
        costs.push(cost);
        runningTotalCost += cost;

        // Track processed links from this chunk
        const chunkTracking = trackProcessedLinks(result?.tiles || [], chunks[i]);
        runningProcessedCount += chunkTracking.count;
        runningUnprocessedCount += chunks[i].length - chunkTracking.count;

        setProgress({
          current: i + 1,
          total: totalChunks,
          startTime,
          chunkTime: i > 0 ? Date.now() - chunkStartTimes[i - 1] : undefined,
          processedCount: runningProcessedCount,
          unprocessedCount: runningUnprocessedCount,
          chunkCost: cost,
          totalCost: runningTotalCost
        });

        // Small delay to avoid rate limiting (longer for free models)
        const isFreeModel = AVAILABLE_MODELS.find(m => m.id === selectedModel)?.free || false;
        const delay = isFreeModel ? 1000 : 500;
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      setChunkCosts(costs);

      // Store the combined prompt (first chunk's prompt as representative)
      setLastPrompt(prompts.length > 0 ? prompts[0] : '');

      // Merge all results
      const merged = mergeOrganizedResults(results);

      // Post-process: ensure all required IDs are generated and valid
      const processed = postProcessOrganizedData(merged);

      // Calculate statistics and track processed/unprocessed links
      const linkTracking = trackProcessedLinks(processed?.tiles || [], bookmarks || []);
      const totalTiles = (processed?.tiles || []).length;
      let totalSections = 0;
      for (const tile of processed?.tiles || []) {
        if (tile?.tabs && Array.isArray(tile.tabs)) {
          for (const tab of tile.tabs) {
            if (tab?.sections && Array.isArray(tab.sections)) {
              totalSections += tab.sections.length;
            }
          }
        }
      }

      const processingTime = Math.round((Date.now() - startTime) / 1000);

      // Store processed and unprocessed links (ensure arrays exist)
      setProcessedLinks(linkTracking?.processed || []);
      setUnprocessedLinks(linkTracking?.unprocessed || []);

      const finalStats: ProcessingStats = {
        totalLinks: (bookmarks?.length || 0) + (duplicateCount || 0), // Original count including duplicates
        uniqueLinks: bookmarks?.length || 0, // Unique links sent to LLM
        duplicateLinks: duplicateCount || 0, // Duplicates filtered
        processedLinks: linkTracking?.count || 0,
        unprocessedLinks: linkTracking?.unprocessed?.length || 0, // Unique links not processed
        totalTiles,
        totalSections,
        processingTime,
        chunksProcessed: totalChunks,
        totalCost: runningTotalCost
      };

      setStats(finalStats);

      // Format as pretty JSON
      const formattedJson = JSON.stringify(processed, null, 2);
      setOrganizedJson(formattedJson);
      setProgress(null);

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setIsCancelled(true);
        setError('Processing cancelled by user');
      } else if (err instanceof Error && err.message.includes('cancelled')) {
        setIsCancelled(true);
        setError('Processing cancelled by user');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to organize bookmarks');
      }
      setOrganizedJson(null);
      setProgress(null);
      setStats(null);
    } finally {
      setLoading(false);
      setAbortController(null);
    }
  };

  // Handle cancellation
  const handleCancel = () => {
    if (abortController) {
      abortController.abort();
      setIsCancelled(true);
      setLoading(false);
      setProgress(null);
    }
  };

  // Post-process organized data to ensure all IDs are unique and valid
  const postProcessOrganizedData = (data: any): any => {
    if (!data || !data.tiles) return data;

    const processed = { ...data };
    processed.tiles = processed.tiles.map((tile: any, tileIndex: number) => {
      const newTile = { ...tile };

      // Ensure tile has valid ID
      if (!newTile.id || newTile.id.startsWith('tile_')) {
        newTile.id = generateId('tile', tileIndex);
      }

      // Process tabs
      if (newTile.tabs && Array.isArray(newTile.tabs)) {
        newTile.tabs = newTile.tabs.map((tab: any, tabIndex: number) => {
          const newTab = { ...tab };
          if (!newTab.id || newTab.id.startsWith('tab_')) {
            newTab.id = generateId('tab', tabIndex);
          }
          newTab.position = tabIndex;

          // Process sections in tabs
          if (newTab.sections && Array.isArray(newTab.sections)) {
            newTab.sections = newTab.sections.map((section: any, secIndex: number) => {
              const newSection = { ...section };
              if (!newSection.id || newSection.id.startsWith('sec_')) {
                newSection.id = generateId('sec', secIndex);
              }
              newSection.position = secIndex;

              // Process links
              if (newSection.links && Array.isArray(newSection.links)) {
                newSection.links = newSection.links.map((link: any, linkIndex: number) => {
                  const newLink = { ...link };
                  if (!newLink.id || newLink.id.startsWith('link_')) {
                    newLink.id = generateId('link', linkIndex);
                  }
                  newLink.position = linkIndex;

                  // Ensure health object exists
                  if (!newLink.health) {
                    newLink.health = {
                      status: 'unknown',
                      httpCode: null,
                      error: null,
                      checkedAt: null
                    };
                  }

                  return newLink;
                });
              } else {
                newSection.links = [];
              }

              if (!newSection.richTextContent) {
                newSection.richTextContent = [];
              }

              return newSection;
            });
          } else {
            newTab.sections = [];
          }

          return newTab;
        });
      } else {
        newTile.tabs = [];
      }

      // Ensure sections array exists (for backward compatibility)
      if (!newTile.sections) {
        newTile.sections = [];
      }

      // Set defaults
      if (!newTile.createdAt) {
        newTile.createdAt = Math.floor(Date.now() / 1000);
      }
      if (!newTile.visibility) {
        newTile.visibility = 'public';
      }
      if (!newTile.allowedUsers) {
        newTile.allowedUsers = [];
      }
      if (newTile.isFavorite === undefined) {
        newTile.isFavorite = false;
      }
      if (newTile.isHyperlink === undefined) {
        newTile.isHyperlink = false;
      }
      if (newTile.openInNewTab === undefined) {
        newTile.openInNewTab = true;
      }
      if (newTile.canView === undefined) {
        newTile.canView = true;
      }
      if (newTile.canEdit === undefined) {
        newTile.canEdit = true;
      }
      if (newTile.canDelete === undefined) {
        newTile.canDelete = true;
      }

      return newTile;
    });

    return processed;
  };

  // Download JSON
  const handleDownload = () => {
    if (!organizedJson) return;

    const blob = new Blob([organizedJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `linknest-organized-bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy JSON to clipboard
  const handleCopy = async () => {
    if (!organizedJson) return;

    try {
      await navigator.clipboard.writeText(organizedJson);
      alert('JSON copied to clipboard!');
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  // Import JSON directly into a new category
  const handleImportToCategory = async () => {
    if (!organizedJson) {
      setError('No JSON to import. Please generate JSON first.');
      return;
    }

    const finalCategoryName = createNewCategory 
      ? categoryName.trim() 
      : selectedCategory;

    if (!finalCategoryName) {
      setError(createNewCategory ? 'Please enter a category name' : 'Please select a category');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setImportProgress({
        current: 0,
        total: 0,
        status: 'Parsing JSON...',
        errors: []
      });

      // Parse the JSON
      const data = JSON.parse(organizedJson);

      // Parse and normalize using the same functions as the app
      const parsed = parseSpaceExportObject(data);
      const normalizedTiles = normalizeImportedTiles(parsed);

      // Update group to the category name and ensure tabs are private
      const tilesToImport = normalizedTiles
        .filter(tile => {
          // Validate tile has required fields
          if (!tile.title || tile.title.trim() === '') {
            return false;
          }
          return true;
        })
        .map((tile, tileIndex) => {
          const updatedTile = {
            ...tile,
            group: finalCategoryName,
            createdAt: tile.createdAt || Date.now(),
            emoji: tile.emoji || '📁',
            themeColor: tile.themeColor || 'blue',
            description: tile.description || ''
          };

          // Ensure all tabs have private visibility and clean up links
          if (updatedTile.tabs && Array.isArray(updatedTile.tabs)) {
            updatedTile.tabs = updatedTile.tabs.map((tab, tabIndex) => ({
              ...tab,
              id: tab.id || `tab_${Date.now()}_${tileIndex}_${tabIndex}`,
              title: tab.title || 'Main',
              position: typeof tab.position === 'number' ? tab.position : tabIndex,
              visibility: 'private' as const,
              sections: Array.isArray(tab.sections) ? tab.sections.map((section, secIndex) => ({
                ...section,
                id: section.id || `sec_${Date.now()}_${tileIndex}_${tabIndex}_${secIndex}`,
                title: section.title || '',
                position: typeof section.position === 'number' ? section.position : secIndex,
                links: Array.isArray(section.links) ? section.links
                  .filter(link => link && link.url && link.url.trim() !== '' && link.label && link.label.trim() !== '')
                  .map((link, linkIndex) => ({
                    ...link,
                    id: link.id || `link_${Date.now()}_${tileIndex}_${tabIndex}_${secIndex}_${linkIndex}`,
                    label: String(link.label || '').trim(),
                    url: String(link.url || '').trim(),
                    visibility: 'private' as const,
                    position: typeof link.position === 'number' ? link.position : linkIndex
                  })) : []
              })) : []
            }));
          } else if (updatedTile.sections && Array.isArray(updatedTile.sections)) {
            // If using old sections format, convert to tabs with private visibility
            updatedTile.tabs = [{
              id: `tab_${Date.now()}_${tileIndex}_0`,
              title: 'Main',
              position: 0,
              visibility: 'private' as const,
              sections: updatedTile.sections
                .map((section, secIndex) => ({
                  ...section,
                  id: section.id || `sec_${Date.now()}_${tileIndex}_0_${secIndex}`,
                  title: section.title || '',
                  position: typeof section.position === 'number' ? section.position : secIndex,
                  links: Array.isArray(section.links) ? section.links
                    .filter(link => link && link.url && link.url.trim() !== '' && link.label && link.label.trim() !== '')
                    .map((link, linkIndex) => ({
                      ...link,
                      id: link.id || `link_${Date.now()}_${tileIndex}_0_${secIndex}_${linkIndex}`,
                      label: String(link.label || '').trim(),
                      url: String(link.url || '').trim(),
                      visibility: 'private' as const,
                      position: typeof link.position === 'number' ? link.position : linkIndex
                    })) : []
                }))
                .filter(section => section.links.length > 0) // Only keep sections with valid links
            }];
          } else {
            // Create a default private tab if no tabs/sections exist
            updatedTile.tabs = [{
              id: `tab_${Date.now()}_${tileIndex}_0`,
              title: 'Main',
              position: 0,
              sections: [],
              visibility: 'private' as const
            }];
          }

          // Ensure tile visibility is private and set allowedUsers to include current user
          updatedTile.visibility = 'private';
          if (user && user.id) {
            updatedTile.allowedUsers = [user.id];
          }

          return updatedTile;
        })
        .filter(tile => {
          // Filter out tiles that have no valid links in any tab
          if (!tile.tabs || tile.tabs.length === 0) return false;
          const hasValidLinks = tile.tabs.some(tab => 
            tab.sections && tab.sections.some(section => 
              section.links && section.links.length > 0
            )
          );
          return hasValidLinks;
        });

      if (tilesToImport.length === 0) {
        setError('No tiles found to import.');
        setImportProgress(null);
        return;
      }

      // Update progress
      setImportProgress({
        current: 0,
        total: tilesToImport.length,
        status: `Importing ${tilesToImport.length} tiles...`,
        errors: []
      });

      // Reset cancel flag
      setImportCancelled(false);

      // Import tiles one by one
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < tilesToImport.length; i++) {
        // Check if import was cancelled
        if (importCancelled) {
          setImportProgress({
            current: i,
            total: tilesToImport.length,
            status: `⚠️ Import cancelled. ${successCount} tiles imported successfully.`,
            errors: [...errors]
          });
          setError('Import was cancelled by user.');
          setLoading(false);
          return;
        }

        const tile = tilesToImport[i];
        try {
          // Validate tile before sending
          if (!tile.title || tile.title.trim() === '') {
            throw new Error('Tile title is required');
          }
          
          // Ensure createdAt is a number (timestamp)
          if (!tile.createdAt || typeof tile.createdAt !== 'number') {
            tile.createdAt = Date.now();
          }

          await createTile(tile);
          successCount++;

          // Update progress
          setImportProgress({
            current: i + 1,
            total: tilesToImport.length,
            status: `Imported ${i + 1} of ${tilesToImport.length} tiles...`,
            errors: [...errors]
          });
        } catch (error) {
          errorCount++;
          let errorMsg = 'Unknown error';
          if (error instanceof Error) {
            errorMsg = error.message;
            // Try to get more details from the error
            if (error.message.includes('Failed to create tile')) {
              // Check if we can get more info from the response
              const responseError = (error as any).response;
              if (responseError) {
                errorMsg = `Failed to create tile (HTTP ${responseError.status})`;
              }
            }
          }
          errors.push(`Failed to import "${tile.title || 'Untitled'}": ${errorMsg}`);
          console.error('Failed to import tile:', tile.title, error);
          console.error('Tile data:', JSON.stringify(tile, null, 2));

          // Update progress with error
          setImportProgress({
            current: i + 1,
            total: tilesToImport.length,
            status: `Imported ${i + 1} of ${tilesToImport.length} tiles... (${errorCount} errors)`,
            errors: [...errors]
          });
        }
      }

      // Final status (only if not cancelled)
      if (!importCancelled) {
        if (errorCount === 0) {
          setImportProgress({
            current: tilesToImport.length,
            total: tilesToImport.length,
            status: `✅ Successfully imported ${successCount} tiles into category "${finalCategoryName}"!`,
            errors: []
          });
          setError(null);

          // Clear the dialog after a delay
          setTimeout(() => {
            setShowImportDialog(false);
            setCategoryName('');
            setSelectedCategory('');
            setCreateNewCategory(false);
            setWizardStep(1);
            setImportProgress(null);
            setImportCancelled(false);
          }, 3000);
        } else {
          setImportProgress({
            current: tilesToImport.length,
            total: tilesToImport.length,
            status: `⚠️ Imported ${successCount} tiles, ${errorCount} failed.`,
            errors: errors
          });
          setError(`Import completed with ${errorCount} error(s). See details below.`);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to import JSON');
      setImportProgress(null);
      console.error('Error importing JSON:', err);
    } finally {
      setLoading(false);
    }
  };

  // Download processed links as CSV
  const handleDownloadProcessedLinks = () => {
    if (processedLinks.length === 0) return;

    const csvRows = ['Title,URL'];
    processedLinks.forEach(link => {
      const title = link.title.replace(/"/g, '""');
      const url = link.url.replace(/"/g, '""');
      csvRows.push(`"${title}","${url}"`);
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `processed-links-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Download unprocessed links as CSV
  const handleDownloadUnprocessedLinks = () => {
    if (unprocessedLinks.length === 0) return;

    const csvRows = ['Title,URL'];
    unprocessedLinks.forEach(link => {
      const title = link.title.replace(/"/g, '""');
      const url = link.url.replace(/"/g, '""');
      csvRows.push(`"${title}","${url}"`);
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `unprocessed-links-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Generate offline AI prompt (for testing without API calls)
  const generateOfflinePrompt = () => {
    if (manualTiles.length === 0) {
      setError('Please organize bookmarks into categories first');
      return;
    }

    // Extract unique domain names from tiles
    const domainToTileIndex = new Map<string, number>();
    const domainNames = manualTiles.map((tile, index) => {
      const firstLink = tile.links[0];
      let domainKey = '';
      if (firstLink) {
        try {
          const url = new URL(firstLink.url);
          let domain = url.hostname.replace('www.', '').replace(/^\.+/, '').toLowerCase();

          const twoPartTlds = ['co.uk', 'co.in', 'co.il', 'co.za', 'com.au', 'com.br', 'com.mx', 'net.au', 'org.uk'];
          const parts = domain.split('.');

          if (parts.length >= 3) {
            const lastTwo = parts.slice(-2).join('.');
            if (twoPartTlds.includes(lastTwo)) {
              domainKey = parts.slice(-3).join('.');
            } else {
              domainKey = parts.slice(-2).join('.');
            }
          } else if (parts.length === 2) {
            domainKey = domain;
          } else {
            domainKey = domain;
          }

          domainToTileIndex.set(domainKey, index);
          domainToTileIndex.set(domain, index);
          domainToTileIndex.set(url.hostname.toLowerCase(), index);

          return domainKey;
        } catch {
          domainKey = tile.title.toLowerCase();
          domainToTileIndex.set(domainKey, index);
          return domainKey;
        }
      }
      domainKey = tile.title.toLowerCase();
      domainToTileIndex.set(domainKey, index);
      return domainKey;
    });

    // Create the prompt
    const prompt = `Given these domain names, provide a concise, professional tile title and description for each.

Format your response as JSON object with this structure:
{
  "enhancements": [
    {
      "domain": "example.com",
      "title": "Short Title (max 30 chars)",
      "description": "Brief description (max 60 chars)"
    }
  ]
}

Domain names:
${domainNames.map((domain, i) => `${i + 1}. ${domain}`).join('\n')}

Return ONLY valid JSON object. No markdown, no code blocks, no explanations.`;

    setOfflinePrompt(prompt);
    setShowOfflinePrompt(true);

    // Copy to clipboard
    navigator.clipboard.writeText(prompt).then(() => {
      setError(null);
      // Show success message briefly
      const originalError = error;
      setError('✅ Prompt copied to clipboard! Paste it into ChatGPT/Claude and paste the response below.');
      setTimeout(() => setError(originalError), 3000);
    }).catch(() => {
      setError('Failed to copy to clipboard. Please manually copy the prompt.');
    });
  };

  // Process offline AI response
  const processOfflineResponse = async () => {
    if (!offlineResponse.trim()) {
      setError('Please paste the AI response');
      return;
    }

    if (manualTiles.length === 0) {
      setError('Please organize bookmarks into categories first');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Extract domain names (same as generateHybridJSON)
      const domainToTileIndex = new Map<string, number>();
      const domainNames = manualTiles.map((tile, index) => {
        const firstLink = tile.links[0];
        let domainKey = '';
        if (firstLink) {
          try {
            const url = new URL(firstLink.url);
            let domain = url.hostname.replace('www.', '').replace(/^\.+/, '').toLowerCase();

            const twoPartTlds = ['co.uk', 'co.in', 'co.il', 'co.za', 'com.au', 'com.br', 'com.mx', 'net.au', 'org.uk'];
            const parts = domain.split('.');

            if (parts.length >= 3) {
              const lastTwo = parts.slice(-2).join('.');
              if (twoPartTlds.includes(lastTwo)) {
                domainKey = parts.slice(-3).join('.');
              } else {
                domainKey = parts.slice(-2).join('.');
              }
            } else if (parts.length === 2) {
              domainKey = domain;
            } else {
              domainKey = domain;
            }

            domainToTileIndex.set(domainKey, index);
            domainToTileIndex.set(domain, index);
            domainToTileIndex.set(url.hostname.toLowerCase(), index);

            return domainKey;
          } catch {
            domainKey = tile.title.toLowerCase();
            domainToTileIndex.set(domainKey, index);
            return domainKey;
          }
        }
        domainKey = tile.title.toLowerCase();
        domainToTileIndex.set(domainKey, index);
        return domainKey;
      });

      // Parse AI response (same logic as generateHybridJSON)
      let jsonText = offlineResponse.trim();
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      }

      let aiEnhancements: Array<{ domain: string; title: string; description: string }> = [];
      try {
        const parsed = JSON.parse(jsonText);
        aiEnhancements = parsed.enhancements || [];
        console.log('AI Enhancements received (offline):', aiEnhancements);
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        console.error('Raw JSON text:', jsonText);
        throw new Error('Invalid JSON response. Please check the AI response format.');
      }

      // Process enhancements (same as generateHybridJSON)
      await processAIEnhancements(aiEnhancements, domainNames, domainToTileIndex);

      setShowOfflinePrompt(false);
      setOfflineResponse('');
    } catch (err: any) {
      setError(err.message || 'Failed to process AI response');
      console.error('Error processing offline response:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generate enhanced JSON with AI titles/descriptions (hybrid mode)
  const generateHybridJSON = async () => {
    if (bookmarks.length === 0) {
      setError('Please extract or enter bookmarks first');
      return;
    }

    if (!apiKey.trim()) {
      setError('Please enter your OpenRouter API key for AI enhancement');
      return;
    }

    if (manualTiles.length === 0) {
      setError('Please organize bookmarks into categories first');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Extract unique domain names from tiles (using same logic as autoGenerateTilesByDomain)
      // Also create a mapping from domain to tile index for reliable matching
      const domainToTileIndex = new Map<string, number>();
      const domainNames = manualTiles.map((tile, index) => {
        // Try to extract domain from tile links
        const firstLink = tile.links[0];
        let domainKey = '';
        if (firstLink) {
          try {
            const url = new URL(firstLink.url);
            let domain = url.hostname.replace('www.', '').replace(/^\.+/, '').toLowerCase();

            // Handle special cases like co.uk, co.in, co.il (these are valid 2-part TLDs)
            const twoPartTlds = ['co.uk', 'co.in', 'co.il', 'co.za', 'com.au', 'com.br', 'com.mx', 'net.au', 'org.uk'];
            const parts = domain.split('.');

            if (parts.length >= 3) {
              const lastTwo = parts.slice(-2).join('.');
              if (twoPartTlds.includes(lastTwo)) {
                // For domains like example.co.uk, use last 3 parts
                domainKey = parts.slice(-3).join('.');
              } else {
                // For normal domains, use last 2 parts
                domainKey = parts.slice(-2).join('.');
              }
            } else if (parts.length === 2) {
              domainKey = domain;
            } else {
              domainKey = domain;
            }

            // Store mapping for reliable matching
            domainToTileIndex.set(domainKey, index);
            // Also store variations
            domainToTileIndex.set(domain, index);
            domainToTileIndex.set(url.hostname.toLowerCase(), index);

            return domainKey;
          } catch {
            domainKey = tile.title.toLowerCase();
            domainToTileIndex.set(domainKey, index);
            return domainKey;
          }
        }
        domainKey = tile.title.toLowerCase();
        domainToTileIndex.set(domainKey, index);
        return domainKey;
      });

      // Create a simple prompt asking only for titles and descriptions
      const prompt = `Given these domain names, provide a concise, professional tile title and description for each.

Format your response as JSON object with this structure:
{
  "enhancements": [
    {
      "domain": "example.com",
      "title": "Short Title (max 30 chars)",
      "description": "Brief description (max 60 chars)"
    }
  ]
}

Domain names:
${domainNames.map((domain, i) => `${i + 1}. ${domain}`).join('\n')}

Return ONLY valid JSON object. No markdown, no code blocks, no explanations.`;

      // Call AI API with minimal tokens
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'LinkNest Fav Organizer'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: Math.min(2000, domainNames.length * 50), // Very low token usage
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No response from API');
      }

      // Parse AI response
      let jsonText = content.trim();
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      }

      let aiEnhancements: Array<{ domain: string; title: string; description: string }> = [];
      try {
        const parsed = JSON.parse(jsonText);
        aiEnhancements = parsed.enhancements || [];
        console.log('AI Enhancements received:', aiEnhancements);
      } catch (parseError) {
        // If parsing fails, continue without AI enhancements
        console.error('Failed to parse AI response:', parseError);
        console.error('Raw JSON text:', jsonText);
        throw new Error('Failed to parse AI response. Please try again.');
      }

      // Process enhancements using shared function
      await processAIEnhancements(aiEnhancements, domainNames, domainToTileIndex);
    } catch (err: any) {
      setError(err.message || 'Failed to enhance with AI');
      console.error('Error in generateHybridJSON:', err);
    } finally {
      setLoading(false);
    }
  };

  // Shared function to process AI enhancements (used by both API and offline modes)
  const processAIEnhancements = async (
    aiEnhancements: Array<{ domain: string; title: string; description: string }>,
    domainNames: string[],
    domainToTileIndex: Map<string, number>
  ) => {
    try {
      // Create a map of domain to AI enhancement (match by index first, then by domain)
      const enhancementByIndex: Array<{ title: string; description: string } | null> = new Array(manualTiles.length).fill(null);
      const enhancementMap = new Map<string, { title: string; description: string }>();

      aiEnhancements.forEach((enh: any, index: number) => {
        if (enh.domain && enh.title && enh.description) {
          // Normalize domain to base domain (same logic as extraction)
          let normalizedDomain = enh.domain.toLowerCase().trim().replace('www.', '').replace(/^\.+/, '');

          // Handle special cases like co.uk, co.in, co.il (these are valid 2-part TLDs)
          const twoPartTlds = ['co.uk', 'co.in', 'co.il', 'co.za', 'com.au', 'com.br', 'com.mx', 'net.au', 'org.uk'];
          const parts = normalizedDomain.split('.');
          let baseDomain = normalizedDomain;

          if (parts.length >= 3) {
            const lastTwo = parts.slice(-2).join('.');
            if (twoPartTlds.includes(lastTwo)) {
              // For domains like example.co.uk, use last 3 parts
              baseDomain = parts.slice(-3).join('.');
            } else {
              // For normal domains, use last 2 parts
              baseDomain = parts.slice(-2).join('.');
            }
          } else if (parts.length === 2) {
            baseDomain = normalizedDomain;
          }

          // Match by the exact domain that was sent to AI (most reliable)
          // The AI returns domains in the same format we sent, so match by the original domain from domainNames array
          if (index < domainNames.length) {
            const originalDomainSent = domainNames[index];
            const tileIndexFromOriginal = domainToTileIndex.get(originalDomainSent);

            if (tileIndexFromOriginal !== undefined && tileIndexFromOriginal < manualTiles.length) {
              if (!enhancementByIndex[tileIndexFromOriginal]) {
                enhancementByIndex[tileIndexFromOriginal] = {
                  title: enh.title,
                  description: enh.description
                };
                console.log(`✅ PRIMARY [${tileIndexFromOriginal}]:`, originalDomainSent, '->', enh.title);
              }
            } else {
              console.warn(`⚠️ Could not find tile index for domain:`, originalDomainSent, 'AI index:', index);
              // Debug: show what's in domainToTileIndex
              if (index < 5) {
                console.log('  domainToTileIndex sample keys:', Array.from(domainToTileIndex.keys()).slice(0, 10));
              }
            }
          }

          // Also try to match by index (fallback - in case order is preserved)
          if (index < manualTiles.length && !enhancementByIndex[index]) {
            enhancementByIndex[index] = {
              title: enh.title,
              description: enh.description
            };
            console.log(`✅ Matched by index [${index}]:`, baseDomain, '->', enh.title);
          }

          // Also try to match by domain name using domainToTileIndex
          const tileIndexFromDomain = domainToTileIndex.get(baseDomain) ?? domainToTileIndex.get(normalizedDomain);
          if (tileIndexFromDomain !== undefined && tileIndexFromDomain < manualTiles.length && !enhancementByIndex[tileIndexFromDomain]) {
            enhancementByIndex[tileIndexFromDomain] = {
              title: enh.title,
              description: enh.description
            };
            console.log(`✅ Matched by domain [${tileIndexFromDomain}]:`, baseDomain, '->', enh.title);
          }

          // Store in map for domain-based lookup with multiple variations
          // Store with the exact domain from AI response (most important - this is what AI returns)
          const aiDomainExact = enh.domain.toLowerCase().trim();
          enhancementMap.set(aiDomainExact, {
            title: enh.title,
            description: enh.description
          });

          // Store normalized variations for flexible matching
          enhancementMap.set(baseDomain, {
            title: enh.title,
            description: enh.description
          });
          enhancementMap.set(normalizedDomain, {
            title: enh.title,
            description: enh.description
          });

          // Also store without TLD for very flexible matching (e.g., "abcya" from "abcya.com")
          const domainWithoutTld = aiDomainExact.split('.')[0];
          if (domainWithoutTld && domainWithoutTld.length > 2) {
            enhancementMap.set(domainWithoutTld, {
              title: enh.title,
              description: enh.description
            });
          }
        }
      });

      const matchedCount = enhancementByIndex.filter(e => e !== null).length;
      console.log('=== ENHANCEMENT MATCHING SUMMARY ===');
      console.log('Enhancement by index:', matchedCount, 'out of', manualTiles.length);
      console.log('Enhancement map size:', enhancementMap.size);
      console.log('Sample enhancement keys:', Array.from(enhancementMap.keys()).slice(0, 10));
      if (matchedCount === 0) {
        console.warn('⚠️ WARNING: No enhancements matched by index! Will try domain-based matching.');
      }

      // Generate final JSON with AI-enhanced titles/descriptions
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const generateId = (prefix: string, index: number) => `${prefix}_${index + 1}`;

      const tiles = manualTiles.map((tile, tileIndex) => {
        // Try to get domain for lookup (using same base domain logic)
        let domainKey = '';
        const firstLink = tile.links[0];
        if (firstLink) {
          try {
            const url = new URL(firstLink.url);
            let domain = url.hostname.replace('www.', '').replace(/^\.+/, '').toLowerCase();

            // Handle special cases like co.uk, co.in, co.il (these are valid 2-part TLDs)
            const twoPartTlds = ['co.uk', 'co.in', 'co.il', 'co.za', 'com.au', 'com.br', 'com.mx'];
            const parts = domain.split('.');

            if (parts.length >= 3) {
              const lastTwo = parts.slice(-2).join('.');
              if (twoPartTlds.includes(lastTwo)) {
                // For domains like example.co.uk, use last 3 parts
                domainKey = parts.slice(-3).join('.');
              } else {
                // For normal domains, use last 2 parts
                domainKey = parts.slice(-2).join('.');
              }
            } else if (parts.length === 2) {
              domainKey = domain;
            } else {
              domainKey = domain;
            }
          } catch {
            domainKey = tile.title.toLowerCase();
          }
        } else {
          domainKey = tile.title.toLowerCase();
        }

        // Get AI enhancement - try by index first (most reliable), then by domain
        let enhancement = enhancementByIndex[tileIndex] || null;

        // If no match by index, try domain-based matching with multiple strategies
        if (!enhancement && firstLink) {
          try {
            const url = new URL(firstLink.url);
            const fullDomain = url.hostname.toLowerCase();
            const domainWithoutWww = fullDomain.replace('www.', '');

            // Strategy 1: Try exact domain key match (what we extracted)
            enhancement = enhancementMap.get(domainKey);

            // Strategy 2: Try full domain variations (with/without www)
            if (!enhancement) {
              enhancement = enhancementMap.get(fullDomain) ||
                enhancementMap.get(domainWithoutWww);
            }

            // Strategy 3: The AI returns domains like "abcya.com" exactly
            // Try to match by normalizing our domain to that format
            if (!enhancement) {
              // Normalize to base domain format (e.g., "abcya.com")
              const normalizedForAI = domainWithoutWww.split('.').slice(-2).join('.');
              enhancement = enhancementMap.get(normalizedForAI);
            }

            // Strategy 4: Try matching by main domain name (without TLD)
            // The AI returns "abcya.com", so if our domainKey is "abcya.com", try matching "abcya"
            if (!enhancement) {
              const domainNameOnly = domainKey.split('.')[0];
              if (domainNameOnly && domainNameOnly.length > 2) {
                enhancement = enhancementMap.get(domainNameOnly);
              }
            }

            // Strategy 5: Try matching by checking all keys for domain name match
            // The AI returns exact domains like "abcya.com", so check if any key matches our domain
            if (!enhancement) {
              const domainName = domainKey.split('.')[0];
              for (const [key, value] of enhancementMap.entries()) {
                // Check if the key matches our domain in any way
                if (key === domainKey ||
                  key === domainWithoutWww ||
                  key === fullDomain ||
                  key === domainKey.split('.').slice(-2).join('.') ||
                  (key.includes('.') && key.split('.')[0] === domainName)) {
                  enhancement = value;
                  console.log('✅ Found domain match:', domainKey, '->', key, '->', value.title);
                  break;
                }
              }
            }

            // Strategy 6: Last resort - partial matching by main domain part
            if (!enhancement) {
              const domainParts = domainKey.split('.');
              const mainPart = domainParts[0];
              if (mainPart && mainPart.length > 2) {
                for (const [key, value] of enhancementMap.entries()) {
                  const keyMainPart = key.split('.')[0];
                  if (keyMainPart === mainPart) {
                    enhancement = value;
                    console.log('✅ Found partial match:', domainKey, '->', key, '->', value.title);
                    break;
                  }
                }
              }
            }
          } catch (e) {
            console.warn('Error matching domain:', e);
          }
        }

        const finalTitle = enhancement?.title || tile.title;
        const finalDescription = enhancement?.description || tile.description;

        // Debug logging - show what's being used
        if (enhancement) {
          console.log(`✅ [${tileIndex}] Using AI enhancement:`, tile.title, '->', finalTitle);
        } else {
          console.log(`❌ [${tileIndex}] No enhancement found for:`, tile.title, 'Domain:', domainKey, 'Using original:', tile.title);
          // Show available enhancements for debugging
          if (enhancementMap.size > 0) {
            const sampleKeys = Array.from(enhancementMap.keys()).slice(0, 5);
            console.log('  Available enhancement keys (sample):', sampleKeys);
          }
        }

        const sections = tile.links.length > 0 ? [{
          id: generateId('sec', 0),
          title: 'Links',
          textColor: null,
          visibleFrom: null,
          expiresAt: null,
          forceStackedView: false,
          position: 0,
          links: tile.links.map((link, linkIndex) => ({
            id: generateId('link', linkIndex),
            label: link.title,
            url: link.url,
            icon: null,
            textColor: null,
            visibility: 'public',
            allowedUsers: [],
            notes: null,
            tooltip: null,
            visibleFrom: null,
            expiresAt: null,
            browser: null,
            isFavorite: false,
            hasRoleAccess: false,
            position: linkIndex,
            health: {
              status: 'unknown',
              httpCode: null,
              error: null,
              checkedAt: null
            }
          })),
          richTextContent: []
        }] : [];

        return {
          id: tile.id,
          title: finalTitle,
          description: finalDescription,
          htmlContent: '',
          emoji: tile.emoji,
          themeColor: tile.themeColor,
          group: 'group1',
          createdAt: currentTimestamp,
          tabs: [],
          sections,
          visibility: 'public',
          allowedUsers: [],
          isFavorite: false,
          isHyperlink: false,
          openInNewTab: true,
          canView: true,
          canEdit: true,
          canDelete: true
        };
      });

      const organized = {
        version: '1.1',
        type: 'category',
        exportedAt: Date.now(),
        categoryName: 'Main',
        tiles
      };

      const jsonString = JSON.stringify(organized, null, 2);
      setOrganizedJson(jsonString);

      // Calculate stats
      const totalLinks = bookmarks.length;
      const processedLinksCount = tiles.reduce((sum, tile) =>
        sum + (tile.sections?.reduce((secSum: number, sec: any) => secSum + (sec.links?.length || 0), 0) || 0), 0
      );

      setStats({
        totalLinks,
        uniqueLinks: totalLinks,
        duplicateLinks: duplicateCount,
        processedLinks: processedLinksCount,
        unprocessedLinks: totalLinks - processedLinksCount,
        totalTiles: tiles.length,
        totalSections: tiles.reduce((sum, tile) => sum + (tile.sections?.length || 0), 0),
        processingTime: 0,
        chunksProcessed: 1,
        totalCost: 0
      });

      setProcessedLinks(bookmarks);
      setUnprocessedLinks([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate enhanced JSON');
      throw err; // Re-throw to let caller handle
    }
  };

  // Generate JSON manually without AI
  const generateManualJSON = () => {
    if (bookmarks.length === 0) {
      setError('Please extract or enter bookmarks first');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const currentTimestamp = Math.floor(Date.now() / 1000);
      const generateId = (prefix: string, index: number) => `${prefix}_${index + 1}`;

      // Use manual tiles (should already be auto-generated by domain when bookmarks were imported)
      let tilesToUse = manualTiles;
      if (tilesToUse.length === 0) {
        // Fallback: auto-generate if somehow tiles weren't created
        autoGenerateTilesByDomain(bookmarks);
        tilesToUse = manualTiles;
      }

      // Convert manual tiles to JSON format
      const tiles = tilesToUse.map((tile, tileIndex) => {
        const sections = tile.links.length > 0 ? [{
          id: generateId('sec', 0),
          title: 'Links',
          textColor: null,
          visibleFrom: null,
          expiresAt: null,
          forceStackedView: false,
          position: 0,
          links: tile.links.map((link, linkIndex) => ({
            id: generateId('link', linkIndex),
            label: link.title,
            url: link.url,
            icon: null,
            textColor: null,
            visibility: 'public',
            allowedUsers: [],
            notes: null,
            tooltip: null,
            visibleFrom: null,
            expiresAt: null,
            browser: null,
            isFavorite: false,
            hasRoleAccess: false,
            position: linkIndex,
            health: {
              status: 'unknown',
              httpCode: null,
              error: null,
              checkedAt: null
            }
          })),
          richTextContent: []
        }] : [];

        return {
          id: tile.id,
          title: tile.title,
          description: tile.description,
          htmlContent: '',
          emoji: tile.emoji,
          themeColor: tile.themeColor,
          group: 'group1',
          createdAt: currentTimestamp,
          tabs: [],
          sections,
          visibility: 'public',
          allowedUsers: [],
          isFavorite: false,
          isHyperlink: false,
          openInNewTab: true,
          canView: true,
          canEdit: true,
          canDelete: true
        };
      });

      const organized = {
        version: '1.1',
        type: 'category',
        exportedAt: Date.now(),
        categoryName: 'Main',
        tiles
      };

      const jsonString = JSON.stringify(organized, null, 2);
      setOrganizedJson(jsonString);

      // Calculate stats
      const totalLinks = bookmarks.length;
      const processedLinksCount = tiles.reduce((sum, tile) =>
        sum + (tile.sections?.reduce((secSum: number, sec: any) => secSum + (sec.links?.length || 0), 0) || 0), 0
      );

      setStats({
        totalLinks,
        uniqueLinks: totalLinks,
        duplicateLinks: duplicateCount,
        processedLinks: processedLinksCount,
        unprocessedLinks: totalLinks - processedLinksCount,
        totalTiles: tiles.length,
        totalSections: tiles.reduce((sum, tile) => sum + (tile.sections?.length || 0), 0),
        processingTime: 0,
        chunksProcessed: 1,
        totalCost: 0
      });

      setProcessedLinks(bookmarks);
      setUnprocessedLinks([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate JSON');
    } finally {
      setLoading(false);
    }
  };

  // Add new manual tile
  const addManualTile = () => {
    const newTile = {
      id: `tile_${Date.now()}`,
      title: 'New Category',
      description: '',
      emoji: '📁',
      themeColor: 'blue',
      links: []
    };
    setManualTiles([...manualTiles, newTile]);
  };

  // Update manual tile
  const updateManualTile = (tileId: string, updates: Partial<typeof manualTiles[0]>) => {
    setManualTiles(manualTiles.map(tile =>
      tile.id === tileId ? { ...tile, ...updates } : tile
    ));
  };

  // Delete manual tile
  const deleteManualTile = (tileId: string) => {
    setManualTiles(manualTiles.filter(tile => tile.id !== tileId));
  };

  // Add link to manual tile
  const addLinkToTile = (tileId: string, bookmark: Bookmark) => {
    setManualTiles(manualTiles.map(tile => {
      if (tile.id === tileId) {
        // Check if link already exists
        if (tile.links.some(l => l.url === bookmark.url)) {
          return tile;
        }
        return { ...tile, links: [...tile.links, bookmark] };
      }
      return tile;
    }));
  };

  // Remove link from manual tile
  const removeLinkFromTile = (tileId: string, linkUrl: string) => {
    setManualTiles(manualTiles.map(tile => {
      if (tile.id === tileId) {
        return { ...tile, links: tile.links.filter(l => l.url !== linkUrl) };
      }
      return tile;
    }));
  };

  // Download AI prompt as text file
  const handleDownloadPrompt = () => {
    if (!lastPrompt) return;

    const blob = new Blob([lastPrompt], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-prompt-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Determine current wizard step based on state
  const getCurrentWizardStep = (): 1 | 2 | 3 => {
    if (organizedJson) return 3; // Step 3: Import (JSON is ready)
    if (bookmarks.length > 0 || manualTiles.length > 0) return 2; // Step 2: Organize (bookmarks loaded)
    return 1; // Step 1: Upload (initial state)
  };

  const currentWizardStep = getCurrentWizardStep();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 min-w-[400px] max-w-[600px] max-h-[90vh] overflow-y-auto">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
            📚 Favorite Organizer
          </h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Extract browser favorites and organize them into tiles, sections, and links
        </p>

        {/* Wizard Steps Indicator - Horizontal Installation Wizard Style */}
        <div className="mb-6 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center">
            {/* Step 1 */}
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                currentWizardStep >= 1 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}>
                1
              </div>
              <span className={`ml-2 text-xs font-medium ${currentWizardStep >= 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                Upload
              </span>
            </div>
            
            {/* Connector 1 */}
            <div className={`flex-1 h-0.5 mx-3 ${currentWizardStep >= 2 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
            
            {/* Step 2 */}
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                currentWizardStep >= 2 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}>
                2
              </div>
              <span className={`ml-2 text-xs font-medium ${currentWizardStep >= 2 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                Organize
              </span>
            </div>
            
            {/* Connector 2 */}
            <div className={`flex-1 h-0.5 mx-3 ${currentWizardStep >= 3 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
            
            {/* Step 3 */}
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                currentWizardStep >= 3 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }`}>
                3
              </div>
              <span className={`ml-2 text-xs font-medium ${currentWizardStep >= 3 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                Import
              </span>
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'ai' ? (
        <>
          {/* AI Organization tab content - hidden */}
          {false ? (
            <>

              {/* API Key Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  OpenRouter API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Stored in browser storage only. Get your key from{' '}
                  <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:underline">
                    openrouter.ai
                  </a>
                </p>
              </div>

              {/* Model Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  AI Model
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={loading}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {AVAILABLE_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} {model.free ? '🆓' : `(${model.cost})`}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Free models are slower but cost-effective. Premium models provide better quality.
                </p>
              </div>

              {/* Chunk Size Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Chunk Size (links per batch)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="10"
                    max="500"
                    value={chunkSizeInput}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      // Allow free typing - update input value
                      setChunkSizeInput(inputValue);
                      // Also update the numeric value if valid
                      const val = parseInt(inputValue, 10);
                      if (!isNaN(val) && val >= 10 && val <= 500) {
                        setChunkSize(val);
                      }
                    }}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value, 10);
                      // Validate and clamp on blur
                      if (isNaN(val) || val < 10) {
                        setChunkSize(10);
                        setChunkSizeInput('10');
                      } else if (val > 500) {
                        setChunkSize(500);
                        setChunkSizeInput('500');
                      } else {
                        setChunkSize(val);
                        setChunkSizeInput(val.toString());
                      }
                    }}
                    disabled={loading}
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    (10-500)
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Smaller chunks = more accurate but slower. Larger chunks = faster but may miss some links.
                </p>
              </div>

              {/* Extraction Method */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Import Method
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExtractionMethod('html')}
                    className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${extractionMethod === 'html'
                      ? 'bg-brand-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                  >
                    HTML File
                  </button>
                  <button
                    onClick={() => setExtractionMethod('manual')}
                    className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${extractionMethod === 'manual'
                      ? 'bg-brand-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                  >
                    Manual Input
                  </button>
                </div>
              </div>

              {/* Bookmark Import */}
              {extractionMethod === 'html' ? (
                <div className="mb-4">
                  <div className="mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-800 dark:text-blue-300">
                    <p className="font-medium mb-1">How to export bookmarks:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li><strong>Chrome/Edge:</strong> Bookmarks → Bookmark Manager → ⋮ (three dots) → Export bookmarks</li>
                      <li><strong>Firefox:</strong> Library → Bookmarks → Show All Bookmarks → Import and Backup → Export Bookmarks to HTML</li>
                    </ul>
                  </div>
                  <label className="block w-full px-4 py-3 bg-brand-500 text-white rounded hover:bg-brand-600 cursor-pointer transition-colors text-center">
                    <input
                      type="file"
                      accept=".html,.htm"
                      onChange={handleHTMLFileImport}
                      className="hidden"
                      disabled={loading}
                    />
                    {loading ? 'Importing...' : 'Import HTML Bookmark File'}
                  </label>
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Paste Bookmarks (one per line, format: Title|URL or just URL)
                  </label>
                  <textarea
                    onChange={(e) => handleManualInput(e.target.value)}
                    placeholder="https://example.com&#10;Google|https://google.com&#10;GitHub|https://github.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    rows={6}
                  />
                </div>
              )}

              {/* Bookmarks Count */}
              {bookmarks.length > 0 && (
                <div className="mb-4 p-2 bg-slate-50 dark:bg-slate-700/50 rounded text-sm text-slate-600 dark:text-slate-400">
                  <div className="flex items-center justify-between">
                    <span>
                      {duplicateCount > 0 ? (
                        <>
                          <span className="font-medium">{bookmarks.length} unique</span> bookmark{bookmarks.length !== 1 ? 's' : ''}
                          {duplicateCount > 0 && (
                            <span className="ml-2 text-amber-600 dark:text-amber-400">
                              ({duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''} filtered)
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          Found {bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''}
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* Progress Display */}
              {progress && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                      Processing chunks...
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-blue-600 dark:text-blue-400">
                        {progress.current} / {progress.total}
                      </span>
                      <button
                        onClick={handleCancel}
                        className="px-3 py-1 text-xs bg-red-500 text-white hover:bg-red-600 rounded transition-colors font-medium"
                        title="Cancel processing"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mb-2">
                    <div
                      className="bg-blue-500 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                  {progress.startTime && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                      <div>
                        Elapsed: {Math.round((Date.now() - progress.startTime) / 1000)}s
                        {progress.chunkTime && ` | Last chunk: ${Math.round(progress.chunkTime / 1000)}s`}
                      </div>
                      {progress.processedCount !== undefined && progress.unprocessedCount !== undefined && (
                        <div>
                          Processed: <span className="font-medium text-emerald-600 dark:text-emerald-400">{progress.processedCount}</span> |
                          Unprocessed: <span className="font-medium text-amber-600 dark:text-amber-400">{progress.unprocessedCount}</span>
                        </div>
                      )}
                      {progress.chunkCost !== undefined && progress.totalCost !== undefined && (
                        <div>
                          Chunk cost: <span className="font-medium">${progress.chunkCost.toFixed(4)}</span> |
                          Total cost: <span className="font-medium">${progress.totalCost.toFixed(4)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Cancelled Message */}
              {isCancelled && (
                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-sm text-amber-800 dark:text-amber-300">
                  ⚠️ Processing was cancelled. Partial results may be available below.
                </div>
              )}

              {/* Organize Button */}
              {bookmarks.length > 0 && (
                <div className="mb-4">
                  <button
                    onClick={handleOrganize}
                    disabled={loading || !apiKey.trim()}
                    className="w-full px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading
                      ? progress
                        ? `Organizing... (${progress.current}/${progress.total} chunks)`
                        : 'Organizing with AI...'
                      : `Organize ${bookmarks.length} Bookmarks`}
                  </button>
                  {bookmarks.length > 100 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-center">
                      Large set detected. Will process in chunks of 100 links.
                    </p>
                  )}
                </div>
              )}

              {/* Statistics Display */}
              {stats && (
                <div className="mb-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded">
                  <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-3">
                    Processing Complete! 📊
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Total Links Uploaded:</span>
                      <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">{stats.totalLinks}</span>
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Unique Links:</span>
                      <span className="ml-2 font-medium text-blue-700 dark:text-blue-400">{stats.uniqueLinks}</span>
                    </div>
                    {stats.duplicateLinks > 0 && (
                      <div>
                        <span className="text-slate-600 dark:text-slate-400">Duplicates Filtered:</span>
                        <span className="ml-2 font-medium text-amber-700 dark:text-amber-400">{stats.duplicateLinks}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Links Processed:</span>
                      <span className="ml-2 font-medium text-emerald-700 dark:text-emerald-400">{stats.processedLinks}</span>
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Links Not Processed:</span>
                      <span className={`ml-2 font-medium ${stats.unprocessedLinks > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'}`}>
                        {stats.unprocessedLinks}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Tiles Generated:</span>
                      <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">{stats.totalTiles}</span>
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Sections Created:</span>
                      <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">{stats.totalSections}</span>
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Processing Time:</span>
                      <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">{stats.processingTime}s</span>
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Total Cost:</span>
                      <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">
                        ${stats.totalCost.toFixed(4)}
                        {stats.totalCost === 0 && <span className="text-xs text-slate-500"> (Free model)</span>}
                      </span>
                    </div>
                  </div>
                  {stats.unprocessedLinks > 0 && (
                    <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-800 dark:text-amber-300">
                      ⚠️ {stats.unprocessedLinks} links were not included. Try using a larger model or smaller chunk size.
                    </div>
                  )}
                  {stats.processedLinks === stats.uniqueLinks && (
                    <div className="mt-3 p-2 bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded text-xs text-emerald-800 dark:text-emerald-300">
                      ✅ All {stats.uniqueLinks} unique links were successfully processed!
                    </div>
                  )}

                  {/* Download Links */}
                  <div className="mt-4 pt-3 border-t border-emerald-200 dark:border-emerald-800">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Download Reports:</p>
                    <div className="flex flex-wrap gap-2">
                      {processedLinks.length > 0 && (
                        <button
                          onClick={handleDownloadProcessedLinks}
                          className="px-3 py-1.5 text-xs bg-emerald-500 text-white hover:bg-emerald-600 rounded transition-colors"
                          title={`Download ${processedLinks.length} processed links as CSV`}
                        >
                          📥 Processed Links ({processedLinks.length})
                        </button>
                      )}
                      {unprocessedLinks.length > 0 && (
                        <button
                          onClick={handleDownloadUnprocessedLinks}
                          className="px-3 py-1.5 text-xs bg-amber-500 text-white hover:bg-amber-600 rounded transition-colors"
                          title={`Download ${unprocessedLinks.length} unprocessed links as CSV`}
                        >
                          📥 Unprocessed Links ({unprocessedLinks.length})
                        </button>
                      )}
                      {lastPrompt && (
                        <button
                          onClick={handleDownloadPrompt}
                          className="px-3 py-1.5 text-xs bg-blue-500 text-white hover:bg-blue-600 rounded transition-colors"
                          title="Download AI prompt used for processing"
                        >
                          📝 AI Prompt
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </>
      ) : activeTab === 'manual' ? (
        <>
          {/* Organization Tab */}
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-800 dark:text-blue-300">
            <p className="text-xs">
              Organize your bookmarks manually. Import bookmarks first, then create categories and assign links.
            </p>
          </div>



          {/* Import Method for Manual Tab */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Import Method
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setExtractionMethod('html')}
                className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${extractionMethod === 'html'
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
              >
                HTML File
              </button>
              <button
                onClick={() => setExtractionMethod('manual')}
                className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${extractionMethod === 'manual'
                  ? 'bg-brand-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
              >
                Manual Input
              </button>
            </div>
          </div>

          {/* Bookmark Import for Manual Tab */}
          {extractionMethod === 'html' ? (
            <div className="mb-4">
              <label className="block w-full px-4 py-3 bg-brand-500 text-white rounded hover:bg-brand-600 cursor-pointer transition-colors text-center">
                <input
                  type="file"
                  accept=".html,.htm"
                  onChange={handleHTMLFileImport}
                  className="hidden"
                  disabled={loading}
                />
                {loading ? 'Importing...' : 'Import HTML Bookmark File'}
              </label>
            </div>
          ) : (
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Paste Bookmarks (one per line, format: Title|URL or just URL)
              </label>
              <textarea
                onChange={(e) => handleManualInput(e.target.value)}
                placeholder="https://example.com&#10;Google|https://google.com&#10;GitHub|https://github.com"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                rows={6}
              />
            </div>
          )}

          {/* Browser Extension Button for Manual Tab */}
          {browserExtensionEnabled && (
            <div className="mb-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-800 dark:text-blue-300 mb-3">
                <p className="text-xs mb-2">
                  Pull favorites directly from Browser Launcher Pro extension.
                </p>
                {extensionStatus === 'checking' && (
                  <p className="text-xs">🔍 Detecting Browser Launcher Pro extension...</p>
                )}
                {extensionStatus === 'found' && (
                  <p className="text-xs">✅ Extension detected! You can fetch bookmarks now.</p>
                )}
                {extensionStatus === 'not-found' && (
                  <p className="text-xs">⚠️ Extension not detected. Please make sure Browser Launcher Pro extension is installed and enabled. You can find it in chrome://extensions</p>
                )}
                {extensionStatus === 'error' && (
                  <p className="text-xs">❌ Error detecting extension. Please refresh the page and try again.</p>
                )}
              </div>
              <button
                onClick={fetchBookmarksFromExtension}
                disabled={loading || extensionStatus === 'checking' || extensionStatus === 'not-found'}
                className="w-full px-4 py-3 bg-brand-500 text-white rounded hover:bg-brand-600 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Fetching Bookmarks...' : '📥 Fetch Bookmarks from Extension'}
              </button>
            </div>
          )}

          {/* Bookmarks Count for Manual Tab */}
          {bookmarks.length > 0 && (
            <div className="mb-4 p-2 bg-slate-50 dark:bg-slate-700/50 rounded text-sm text-slate-600 dark:text-slate-400">
              <span>
                Found {bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Manual Tiles Management */}
          {bookmarks.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Categories ({manualTiles.length})
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (confirm('This will regenerate categories by domain and overwrite your current organization. Continue?')) {
                        autoGenerateTilesByDomain(bookmarks);
                      }
                    }}
                    className="px-3 py-1.5 text-xs bg-blue-500 text-white hover:bg-blue-600 rounded transition-colors"
                    title="Regenerate categories by domain"
                  >
                    🔄 Regenerate
                  </button>
                  <button
                    onClick={addManualTile}
                    className="px-3 py-1.5 text-xs bg-brand-500 text-white hover:bg-brand-600 rounded transition-colors"
                  >
                    + Add Category
                  </button>
                </div>
              </div>

              {manualTiles.length === 0 && bookmarks.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-800 dark:text-blue-300">
                  Categories will be auto-generated by domain when you import bookmarks. Click "Regenerate" to recreate them, or "Add Category" to create custom categories.
                </div>
              )}

              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {manualTiles.map((tile, tileIndex) => (
                  <div key={tile.id} className="p-3 border border-slate-200 dark:border-slate-700 rounded">
                    <div className="flex items-start gap-2 mb-2">
                      <input
                        type="text"
                        value={tile.emoji}
                        onChange={(e) => updateManualTile(tile.id, { emoji: e.target.value })}
                        className="w-10 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        placeholder="💻"
                      />
                      <input
                        type="text"
                        value={tile.title}
                        onChange={(e) => updateManualTile(tile.id, { title: e.target.value })}
                        className="flex-1 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        placeholder="Category Name"
                      />
                      <select
                        value={tile.themeColor}
                        onChange={(e) => updateManualTile(tile.id, { themeColor: e.target.value })}
                        className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      >
                        <option value="blue">Blue</option>
                        <option value="emerald">Emerald</option>
                        <option value="violet">Violet</option>
                        <option value="amber">Amber</option>
                        <option value="rose">Rose</option>
                        <option value="cyan">Cyan</option>
                        <option value="fuchsia">Fuchsia</option>
                        <option value="orange">Orange</option>
                      </select>
                      <button
                        onClick={() => deleteManualTile(tile.id)}
                        className="px-2 py-1 text-xs bg-red-500 text-white hover:bg-red-600 rounded transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      type="text"
                      value={tile.description}
                      onChange={(e) => updateManualTile(tile.id, { description: e.target.value })}
                      className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 mb-2"
                      placeholder="Description (optional)"
                    />
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      {tile.links.length} link{tile.links.length !== 1 ? 's' : ''} in this category
                    </div>
                    <div className="max-h-[100px] overflow-y-auto space-y-1">
                      {tile.links.map((link, linkIndex) => (
                        <div key={linkIndex} className="flex items-center justify-between p-1.5 bg-slate-50 dark:bg-slate-700/50 rounded text-xs">
                          <span className="truncate flex-1">{link.title}</span>
                          <button
                            onClick={() => removeLinkFromTile(tile.id, link.url)}
                            className="ml-2 px-1.5 py-0.5 text-xs bg-red-500 text-white hover:bg-red-600 rounded"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2">
                      <select
                        onChange={(e) => {
                          const bookmark = bookmarks.find(b => `${b.title}|${b.url}` === e.target.value);
                          if (bookmark) {
                            addLinkToTile(tile.id, bookmark);
                            e.target.value = '';
                          }
                        }}
                        className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        defaultValue=""
                      >
                        <option value="">+ Add link to this category</option>
                        {bookmarks
                          .filter(b => !tile.links.some(l => l.url === b.url))
                          .map(bookmark => (
                            <option key={bookmark.url} value={`${bookmark.title}|${bookmark.url}`}>
                              {bookmark.title}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generate JSON Buttons for Manual Tab */}
          {bookmarks.length > 0 && (
            <div className="mb-4 space-y-2">
              <button
                onClick={generateManualJSON}
                disabled={loading}
                className="w-full px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Generating JSON...' : 'Generate JSON (No AI)'}
              </button>
              {manualTiles.length > 0 && (
                <button
                  onClick={generateOfflinePrompt}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  📋 Generate Offline Prompt (Use Any AI)
                </button>
              )}

              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-center">
                {manualTiles.length === 0
                  ? 'Will auto-organize by domain if no categories are created'
                  : `Will use ${manualTiles.length} categor${manualTiles.length !== 1 ? 'ies' : 'y'}.`}
              </p>

              {/* Offline AI Prompt Section */}
              {showOfflinePrompt && (
                <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Offline AI Prompt (Testing Mode)</h3>
                    <button
                      onClick={() => {
                        setShowOfflinePrompt(false);
                        setOfflinePrompt('');
                        setOfflineResponse('');
                      }}
                      className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      ✕
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      AI Prompt (copied to clipboard):
                    </label>
                    <textarea
                      value={offlinePrompt}
                      onChange={(e) => setOfflinePrompt(e.target.value)}
                      readOnly
                      className="w-full p-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 resize-none"
                      rows={8}
                      placeholder="The prompt will appear here..."
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(offlinePrompt);
                        setError('✅ Prompt copied to clipboard again!');
                        setTimeout(() => setError(null), 2000);
                      }}
                      className="mt-1 text-xs text-purple-600 dark:text-purple-400 hover:underline"
                    >
                      📋 Copy Prompt Again
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Paste AI Response Here:
                    </label>
                    <textarea
                      value={offlineResponse}
                      onChange={(e) => setOfflineResponse(e.target.value)}
                      className="w-full p-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 resize-y"
                      rows={8}
                      placeholder="Paste the JSON response from ChatGPT/Claude here..."
                    />
                  </div>

                  <button
                    onClick={processOfflineResponse}
                    disabled={loading || !offlineResponse.trim()}
                    className="w-full px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? 'Processing...' : '✅ Process AI Response'}
                  </button>

                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    💡 Tip: Copy the prompt above, paste it into ChatGPT or Claude, then paste the JSON response here.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}

      {/* Shared: Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Shared: Statistics Display */}
      {stats && (
        <div className="mb-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded">
          <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-3">
            Processing Complete! 📊
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-600 dark:text-slate-400">Total Links:</span>
              <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">{stats.totalLinks}</span>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400">Links Processed:</span>
              <span className="ml-2 font-medium text-emerald-700 dark:text-emerald-400">{stats.processedLinks}</span>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400">Tiles Generated:</span>
              <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">{stats.totalTiles}</span>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400">Sections Created:</span>
              <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">{stats.totalSections}</span>
            </div>
          </div>
        </div>
      )}

      {/* Shared: Organized JSON Display */}
      {organizedJson && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Organized JSON
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="px-3 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
              >
                Copy
              </button>
              <button
                onClick={handleDownload}
                className="px-3 py-1 text-xs bg-brand-500 text-white hover:bg-brand-600 rounded transition-colors"
              >
                Download
              </button>
            </div>
          </div>
          <textarea
            value={organizedJson}
            readOnly
            className="w-full px-3 py-2 text-xs font-mono border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none"
            rows={15}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            You can import this JSON file using the category import feature in the app
          </p>

          {/* Import to Category Button */}
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => {
                setShowImportDialog(true);
                setWizardStep(3); // Start at step 3 since steps 1 & 2 (Upload & Organize) are already done
                setCreateNewCategory(false);
                setSelectedCategory('');
                setCategoryName('');
              }}
              disabled={loading}
              className="w-full px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              📥 Import to Category
            </button>
          </div>
        </div>
      )}

      {/* Import Dialog - Wizard Style */}
      {showImportDialog && organizedJson && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Import to Category
                </h3>
                <button
                  onClick={() => {
                    if (loading && !importCancelled) {
                      setImportCancelled(true);
                      setLoading(false);
                    } else {
                      setShowImportDialog(false);
                      setCategoryName('');
                      setSelectedCategory('');
                      setCreateNewCategory(false);
                      setWizardStep(1);
                      setImportProgress(null);
                      setImportCancelled(false);
                    }
                  }}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  disabled={false}
                >
                  ✕
                </button>
              </div>

              {/* Wizard Steps Indicator - Horizontal Installation Wizard Style */}
              <div className="mb-6">
                <div className="flex items-center">
                  {/* Step 1 */}
                  <div className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                      wizardStep >= 1 
                        ? 'bg-emerald-500 text-white' 
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                      1
                    </div>
                    <span className={`ml-2 text-xs font-medium ${wizardStep >= 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      Upload
                    </span>
                  </div>
                  
                  {/* Connector 1 */}
                  <div className={`flex-1 h-0.5 mx-3 ${wizardStep >= 2 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                  
                  {/* Step 2 */}
                  <div className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                      wizardStep >= 2 
                        ? 'bg-emerald-500 text-white' 
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                      2
                    </div>
                    <span className={`ml-2 text-xs font-medium ${wizardStep >= 2 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      Organize
                    </span>
                  </div>
                  
                  {/* Connector 2 */}
                  <div className={`flex-1 h-0.5 mx-3 ${wizardStep >= 3 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                  
                  {/* Step 3 */}
                  <div className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                      wizardStep >= 3 
                        ? 'bg-emerald-500 text-white' 
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                      3
                    </div>
                    <span className={`ml-2 text-xs font-medium ${wizardStep >= 3 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      Import
                    </span>
                  </div>
                </div>
              </div>

              {/* Step 1 Content - Upload Confirmation */}
              {wizardStep === 1 && (
                <div className="mb-4">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center text-lg font-semibold">
                        ✓
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                          Step 1 Complete: Upload
                        </h4>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                          {bookmarks.length > 0 
                            ? `${bookmarks.length} bookmarks uploaded successfully`
                            : 'Bookmarks have been uploaded and processed'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2 Content - Organize Confirmation */}
              {wizardStep === 2 && (
                <div className="mb-4">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center text-lg font-semibold">
                        ✓
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                          Step 2 Complete: Organize
                        </h4>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                          {organizedJson 
                            ? 'Bookmarks have been organized and JSON is ready for import'
                            : 'Organization completed successfully'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3 Content - Category Selection */}
              {wizardStep === 3 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                    Select Category (Private Tab)
                  </label>
                  
                  {/* Category Selection Options */}
                  <div className="mb-4 space-y-3">
                    {/* Use Existing Category */}
                    <div>
                      <label className="flex items-center mb-2 cursor-pointer">
                        <input
                          type="radio"
                          name="categoryOption"
                          checked={!createNewCategory}
                          onChange={() => {
                            setCreateNewCategory(false);
                            setCategoryName('');
                          }}
                          className="mr-2"
                          disabled={loading}
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">Use existing category</span>
                      </label>
                      {!createNewCategory && (
                        <>
                          {availableCategories.length === 0 ? (
                            <div className="w-full mt-2 px-3 py-2 border border-amber-300 dark:border-amber-600 rounded bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-700 dark:text-amber-300">
                              No categories found in private tab. Please create a new category.
                            </div>
                          ) : (
                            <select
                              value={selectedCategory}
                              onChange={(e) => setSelectedCategory(e.target.value)}
                              className="w-full mt-2 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                              disabled={loading}
                            >
                              <option value="">Select a category...</option>
                              {availableCategories.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          )}
                        </>
                      )}
                    </div>

                    {/* Create New Category */}
                    <div>
                      <label className="flex items-center mb-2 cursor-pointer">
                        <input
                          type="radio"
                          name="categoryOption"
                          checked={createNewCategory}
                          onChange={() => {
                            setCreateNewCategory(true);
                            setSelectedCategory('');
                          }}
                          className="mr-2"
                          disabled={loading}
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">Create new category</span>
                      </label>
                      {createNewCategory && (
                        <input
                          type="text"
                          value={categoryName}
                          onChange={(e) => setCategoryName(e.target.value)}
                          placeholder="e.g., My Bookmarks, Work Links, etc."
                          className="w-full mt-2 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          disabled={loading}
                        />
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Categories will be created in your private tab with private visibility.
                  </p>
                </div>
              )}

              {/* Progress Display */}
              {importProgress && (
                <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-300 mb-1">
                      <span>{importProgress.status}</span>
                      <div className="flex items-center gap-2">
                        <span>{importProgress.current} / {importProgress.total}</span>
                        {loading && !importCancelled && (
                          <button
                            onClick={() => {
                              setImportCancelled(true);
                              setLoading(false);
                            }}
                            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                            title="Cancel import"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                    {importProgress.total > 0 && (
                      <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            importCancelled ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {importCancelled && (
                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-800 dark:text-amber-300">
                      ⚠️ Import cancelled. {importProgress.current} of {importProgress.total} tiles were processed.
                    </div>
                  )}

                  {importProgress.errors.length > 0 && (
                    <div className="mt-3 max-h-32 overflow-y-auto">
                      <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                        Errors ({importProgress.errors.length}):
                      </p>
                      <ul className="text-xs text-red-600 dark:text-red-400 space-y-1">
                        {importProgress.errors.slice(0, 5).map((error, idx) => (
                          <li key={idx}>• {error}</li>
                        ))}
                        {importProgress.errors.length > 5 && (
                          <li>... and {importProgress.errors.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex gap-3">
                {/* Previous button */}
                {wizardStep > 1 && !importProgress && (
                  <button
                    onClick={() => setWizardStep((prev) => (prev - 1) as 1 | 2 | 3)}
                    disabled={loading}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                )}
                
                {/* Cancel button - always visible */}
                <button
                  onClick={() => {
                    if (loading && !importCancelled) {
                      setImportCancelled(true);
                      setLoading(false);
                    } else {
                      setShowImportDialog(false);
                      setCategoryName('');
                      setSelectedCategory('');
                      setCreateNewCategory(false);
                      setWizardStep(1);
                      setImportProgress(null);
                      setImportCancelled(false);
                    }
                  }}
                  disabled={false}
                  className={`flex-1 px-4 py-2 rounded transition-colors ${
                    loading && !importCancelled
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                  }`}
                >
                  {loading && !importCancelled ? 'Cancel Import' : 'Cancel'}
                </button>
                
                {/* Step 3: Import button or Next button */}
                {wizardStep === 3 && !importProgress && (
                  <button
                    onClick={handleImportToCategory}
                    disabled={loading || (createNewCategory && !categoryName.trim()) || (!createNewCategory && (!selectedCategory || availableCategories.length === 0))}
                    className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    Import
                  </button>
                )}
                
                {/* Next button for steps 1 and 2 */}
                {wizardStep < 3 && !importProgress && (
                  <button
                    onClick={() => setWizardStep((prev) => (prev + 1) as 1 | 2 | 3)}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
