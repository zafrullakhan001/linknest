/**
 * Lazy-load Mermaid from jsDelivr (CDN) once per page.
 * Used by Help Guides for ```mermaid blocks without an npm dependency.
 */

export type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  run: (opts: { nodes: HTMLElement[] }) => Promise<void>;
};

declare global {
  interface Window {
    mermaid?: MermaidApi;
  }
}

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js';

let loadPromise: Promise<MermaidApi> | null = null;

export function loadMermaid(): Promise<MermaidApi> {
  if (typeof window !== 'undefined' && window.mermaid) {
    return Promise.resolve(window.mermaid);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<MermaidApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-linknest-mermaid]`);
    if (existing && window.mermaid) {
      resolve(window.mermaid);
      return;
    }

    const script = document.createElement('script');
    script.src = MERMAID_CDN;
    script.async = true;
    script.dataset.linknestMermaid = '1';
    script.onload = () => {
      if (window.mermaid) {
        resolve(window.mermaid);
      } else {
        loadPromise = null;
        reject(new Error('Mermaid loaded but window.mermaid is missing'));
      }
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Mermaid from CDN'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
