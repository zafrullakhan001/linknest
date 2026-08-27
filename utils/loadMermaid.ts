/**
 * Lazy-load Mermaid from a same-origin script (public/vendor/mermaid.min.js).
 * CDN jsDelivr is blocked by the app CSP (script-src 'self'), which left
 * Help & About diagrams as raw text.
 */

export type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  run: (opts: { nodes: HTMLElement[] }) => Promise<void>;
  render?: (id: string, text: string) => Promise<{ svg: string }>;
};

declare global {
  interface Window {
    mermaid?: MermaidApi;
  }
}

let loadPromise: Promise<MermaidApi> | null = null;

function mermaidScriptSrc(): string {
  const base = import.meta.env.BASE_URL || './';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}vendor/mermaid.min.js`;
}

function resolveMermaid(): MermaidApi | null {
  if (typeof window === 'undefined') return null;
  const mermaid = window.mermaid;
  if (!mermaid || typeof mermaid.initialize !== 'function' || typeof mermaid.run !== 'function') {
    return null;
  }
  return mermaid;
}

export function loadMermaid(): Promise<MermaidApi> {
  const ready = resolveMermaid();
  if (ready) return Promise.resolve(ready);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<MermaidApi>((resolve, reject) => {
    const finishOk = () => {
      const mermaid = resolveMermaid();
      if (mermaid) {
        resolve(mermaid);
        return;
      }
      loadPromise = null;
      reject(new Error('Mermaid loaded but window.mermaid is missing'));
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-linknest-mermaid]');
    if (existing) {
      existing.addEventListener('load', finishOk, { once: true });
      existing.addEventListener(
        'error',
        () => {
          loadPromise = null;
          reject(new Error('Failed to load Mermaid'));
        },
        { once: true }
      );
      if (resolveMermaid()) finishOk();
      return;
    }

    const script = document.createElement('script');
    script.src = mermaidScriptSrc();
    script.async = true;
    script.dataset.linknestMermaid = '1';
    script.onload = finishOk;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error(`Failed to load Mermaid from ${script.src}`));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
