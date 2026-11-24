/**
 * Build a https://mermaid.live/edit#base64:… URL.
 *
 * Mermaid Live serde accepts `base64:` (URL-safe JSON) and `pako:` (zlib+pako).
 * We use `base64:` so links always decode without depending on zlib/pako quirks.
 *
 * @see https://github.com/mermaid-js/mermaid-live-editor/blob/develop/src/lib/util/serde.ts
 */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // URL-safe, no padding — matches js-base64 toBase64(…, true)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function stringToBase64Url(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

function buildStateJson(code: string): string {
  return JSON.stringify({
    code: code.replace(/\r\n/g, '\n').trim(),
    mermaid: '{\n  "theme": "default"\n}',
    autoSync: true,
    updateDiagram: true,
    editorMode: 'code',
  });
}

export function buildMermaidLiveUrlBase64(code: string): string {
  return `https://mermaid.live/edit#base64:${stringToBase64Url(buildStateJson(code))}`;
}

export async function buildMermaidLiveUrl(code: string): Promise<string> {
  return buildMermaidLiveUrlBase64(code);
}
