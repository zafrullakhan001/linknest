import React, { useState, useEffect } from 'react';

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
  { id: 'meta-llama/llama-3.1-70b-instruct:free', name: 'Llama 3.1 70B (FREE)', cost: 'FREE', free: true },
  { id: 'google/gemini-flash-1.5:free', name: 'Gemini Flash 1.5 (FREE)', cost: 'FREE', free: true },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (FREE)', cost: 'FREE', free: true },
  { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B (FREE)', cost: 'FREE', free: true },
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
}

export const FavOrganizerWidget: React.FC<FavOrganizerWidgetProps> = ({ onClose }) => {
  const [apiKey, setApiKey] = useState<string>('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [organizedJson, setOrganizedJson] = useState<string | null>(null);
  const [extractionMethod, setExtractionMethod] = useState<'html' | 'manual'>('html');
  const [progress, setProgress] = useState<{ current: number; total: number; chunkTime?: number; startTime?: number } | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('openai/gpt-4o-mini');
  const [chunkSize, setChunkSize] = useState<number>(100);
  const [stats, setStats] = useState<ProcessingStats | null>(null);
  const [uniqueBookmarks, setUniqueBookmarks] = useState<Bookmark[]>([]);
  const [duplicateCount, setDuplicateCount] = useState<number>(0);
  const [processedLinks, setProcessedLinks] = useState<Bookmark[]>([]);
  const [unprocessedLinks, setUnprocessedLinks] = useState<Bookmark[]>([]);
  const [lastPrompt, setLastPrompt] = useState<string>('');

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
      }
    }
  }, []);

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

  // Track which links were processed (count all links in all tiles)
  const trackProcessedLinks = (tiles: any[]): number => {
    let count = 0;
    const seenUrls = new Set<string>();
    
    for (const tile of tiles) {
      // Check tabs
      if (tile.tabs && Array.isArray(tile.tabs)) {
        for (const tab of tile.tabs) {
          if (tab.sections && Array.isArray(tab.sections)) {
            for (const section of tab.sections) {
              if (section.links && Array.isArray(section.links)) {
                for (const link of section.links) {
                  if (link.url && !seenUrls.has(link.url)) {
                    seenUrls.add(link.url);
                    count++;
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
              if (link.url && !seenUrls.has(link.url)) {
                seenUrls.add(link.url);
                count++;
              }
            }
          }
        }
      }
    }
    return count;
  };

  // Process a single chunk of bookmarks
  const processChunk = async (chunk: Bookmark[], chunkIndex: number, totalChunks: number, startTime: number): Promise<{ result: any; prompt: string }> => {
    const bookmarksText = chunk.map((b, i) => `${i + 1}. ${b.title} - ${b.url}`).join('\n');

    const currentTimestamp = Math.floor(Date.now() / 1000);
    
    const prompt = `Organize these browser bookmarks into a structured JSON format. Group related links into tiles, sections, and tabs.

GUIDELINES:
- Create logical tiles (categories) for related bookmarks
- Use descriptive titles for tiles, tabs, and sections
- Choose appropriate emojis: 💻 🎨 🚀 📚 🛠️ 🎮 🎵 🎬 📷 📝 💰 🏥 ✈️ 🛒 🍔 🏋️ 🏠 🎓 🔐 ☁️ 📱 🌐 💡 📅 🔍 ⚙️ 📂 📧 📊 📈
- Use theme colors: blue, emerald, violet, amber, rose, cyan, fuchsia, orange, red, indigo, lime, sky, slate, teal, pink, purple, yellow, zinc (or hex codes)
- Generate unique IDs for each item (use descriptive prefixes like tile_, tab_, sec_, link_)
- Include ALL bookmarks - do not skip any links
- Set createdAt to ${currentTimestamp}
- Keep all null fields as null
- Set visibility to "public" for all links

TEMPLATE (replace placeholders with actual values):
{
  "version": "1.1",
  "type": "category",
  "exportedAt": ${Date.now()},
  "categoryName": "{CATEGORY_NAME}",
  "tiles": [
    {
      "id": "{UNIQUE_ID}",
      "title": "{TILE_TITLE}",
      "description": "{TILE_DESCRIPTION}",
      "htmlContent": "",
      "emoji": "{EMOJI}",
      "themeColor": "{COLOR_NAME_OR_HEX}",
      "group": "{GROUP_NAME}",
      "createdAt": ${currentTimestamp},
      "tabs": [
        {
          "id": "{UNIQUE_ID}",
          "title": "{TAB_TITLE}",
          "position": 0,
          "textColor": null,
          "visibleFrom": null,
          "expiresAt": null,
          "sections": [
            {
              "id": "{UNIQUE_ID}",
              "title": "{SECTION_TITLE}",
              "textColor": null,
              "visibleFrom": null,
              "expiresAt": null,
              "forceStackedView": false,
              "position": 0,
              "links": [
                {
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
                  "health": {
                    "status": "unknown",
                    "httpCode": null,
                    "error": null,
                    "checkedAt": null
                  }
                }
              ],
              "richTextContent": []
            }
          ]
        }
      ],
      "sections": [
        {
          "id": "{UNIQUE_ID}",
          "title": "{SECTION_TITLE}",
          "textColor": null,
          "visibleFrom": null,
          "expiresAt": null,
          "forceStackedView": false,
          "position": 0,
          "links": [
            {
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
              "health": {
                "status": "unknown",
                "httpCode": null,
                "error": null,
                "checkedAt": null
              }
            }
          ],
          "richTextContent": []
        }
      ],
      "visibility": "public",
      "allowedUsers": [],
      "isFavorite": false,
      "isHyperlink": false,
      "openInNewTab": true,
      "canView": true,
      "canEdit": true,
      "canDelete": true
    }
  ]
}

Bookmarks to organize (Chunk ${chunkIndex + 1} of ${totalChunks}):
${bookmarksText}

CRITICAL: Return ONLY valid JSON matching the template above. Include ALL ${chunk.length} bookmarks. No markdown, no code blocks, no explanations.`;

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
        max_tokens: 8000,
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

    // Clean the response - remove markdown code blocks if present
    let jsonText = content.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }

    // Parse and validate JSON
    let organized;
    try {
      organized = JSON.parse(jsonText);
    } catch (parseError) {
      throw new Error('Invalid JSON response from API. Please try again.');
    }

    return { result: organized, prompt };
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
      const chunkStartTimes: number[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
        chunkStartTimes[i] = Date.now();
        setProgress({ 
          current: i + 1, 
          total: totalChunks,
          startTime,
          chunkTime: i > 0 ? Date.now() - chunkStartTimes[i - 1] : undefined
        });
        
        const result = await processChunk(chunks[i], i, totalChunks, startTime);
        results.push(result);
        
        // Small delay to avoid rate limiting (longer for free models)
        const delay = selectedModel.includes(':free') ? 1000 : 500;
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // Merge all results
      const merged = mergeOrganizedResults(results);
      
      // Post-process: ensure all required IDs are generated and valid
      const processed = postProcessOrganizedData(merged);
      
      // Calculate statistics
      const processedLinks = trackProcessedLinks(processed.tiles || []);
      const totalTiles = (processed.tiles || []).length;
      let totalSections = 0;
      for (const tile of processed.tiles || []) {
        if (tile.tabs && Array.isArray(tile.tabs)) {
          for (const tab of tile.tabs) {
            if (tab.sections && Array.isArray(tab.sections)) {
              totalSections += tab.sections.length;
            }
          }
        }
      }
      
      const processingTime = Math.round((Date.now() - startTime) / 1000);
      
      const finalStats: ProcessingStats = {
        totalLinks: bookmarks.length + duplicateCount, // Original count including duplicates
        uniqueLinks: bookmarks.length, // Unique links sent to LLM
        duplicateLinks: duplicateCount, // Duplicates filtered
        processedLinks,
        unprocessedLinks: bookmarks.length - processedLinks, // Unique links not processed
        totalTiles,
        totalSections,
        processingTime,
        chunksProcessed: totalChunks
      };
      
      setStats(finalStats);
      
      // Format as pretty JSON
      const formattedJson = JSON.stringify(processed, null, 2);
      setOrganizedJson(formattedJson);
      setProgress(null);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to organize bookmarks');
      setOrganizedJson(null);
      setProgress(null);
      setStats(null);
    } finally {
      setLoading(false);
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

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 min-w-[400px] max-w-[600px] max-h-[90vh] overflow-y-auto">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
            📚 Favorite Organizer
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Close Widget"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Extract browser favorites and organize them into tiles, sections, and links using AI
        </p>
      </div>

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
            value={chunkSize}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (val >= 10 && val <= 500) {
                setChunkSize(val);
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
            className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${
              extractionMethod === 'html'
                ? 'bg-brand-500 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            HTML File
          </button>
          <button
            onClick={() => setExtractionMethod('manual')}
            className={`flex-1 px-3 py-2 text-sm rounded transition-colors ${
              extractionMethod === 'manual'
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
            <span className="text-sm text-blue-600 dark:text-blue-400">
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mb-2">
            <div
              className="bg-blue-500 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          {progress.startTime && (
            <div className="text-xs text-blue-600 dark:text-blue-400">
              Elapsed: {Math.round((Date.now() - progress.startTime) / 1000)}s
              {progress.chunkTime && ` | Last chunk: ${Math.round(progress.chunkTime / 1000)}s`}
            </div>
          )}
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
          </div>
          {stats.unprocessedLinks > 0 && (
            <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-800 dark:text-amber-300">
              ⚠️ {stats.unprocessedLinks} links were not included. Try using a larger model or smaller chunk size.
            </div>
          )}
          {stats.processedLinks === stats.totalLinks && (
            <div className="mt-3 p-2 bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded text-xs text-emerald-800 dark:text-emerald-300">
              ✅ All {stats.totalLinks} links were successfully processed!
            </div>
          )}
        </div>
      )}

      {/* Organized JSON Display */}
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
        </div>
      )}
    </div>
  );
};
