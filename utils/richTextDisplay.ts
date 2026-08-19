/**
 * Display helpers for section rich text: auto-linkify URLs/emails in HTML
 * without nesting inside existing anchors, and without mutating stored content.
 */

import { ensureRichTextFontsLoaded } from './richTextFonts';

const SKIP_TAGS = new Set(['A', 'SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

const URL_OR_EMAIL_RE =
  /((https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}])|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

function isInsideSkippedElement(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    el = el.parentElement;
  }
  return false;
}

function createLinkElement(doc: Document, href: string, text: string): HTMLAnchorElement {
  const a = doc.createElement('a');
  a.href = href;
  a.textContent = text;
  if (!href.toLowerCase().startsWith('mailto:')) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  return a;
}

/** Keep editor font-family against theme CSS that uses !important. */
function promoteEditorFonts(root: Element): void {
  const styled = root.querySelectorAll<HTMLElement>('[style]');
  styled.forEach((el) => {
    const family = el.style.fontFamily;
    if (family) {
      el.style.setProperty('font-family', family, 'important');
    }
  });
  root.querySelectorAll('font[face]').forEach((fontEl) => {
    const face = fontEl.getAttribute('face');
    if (!face) return;
    (fontEl as HTMLElement).style.setProperty('font-family', face, 'important');
  });
}

function linkifyTextNode(doc: Document, textNode: Text): void {
  const text = textNode.nodeValue;
  if (!text || !URL_OR_EMAIL_RE.test(text)) return;
  URL_OR_EMAIL_RE.lastIndex = 0;

  const frag = doc.createDocumentFragment();
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_OR_EMAIL_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      frag.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
    }

    const token = match[0];
    let href: string;
    if (token.includes('@') && !/^https?:\/\//i.test(token) && !/^www\./i.test(token)) {
      href = `mailto:${token}`;
    } else if (/^www\./i.test(token)) {
      href = `https://${token}`;
    } else {
      href = token;
    }

    frag.appendChild(createLinkElement(doc, href, token));
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
  }

  textNode.parentNode?.replaceChild(frag, textNode);
}

/**
 * Wrap bare URLs and emails in text nodes with <a> tags.
 * Existing anchors and content inside code/pre are left untouched.
 */
export function linkifyHtml(html: string): string {
  if (!html || typeof document === 'undefined') return html || '';
  ensureRichTextFontsLoaded();

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__rt_root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__rt_root');
  if (!root) return html;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE && !isInsideSkippedElement(current)) {
      textNodes.push(current as Text);
    }
    current = walker.nextNode();
  }

  for (const node of textNodes) {
    linkifyTextNode(doc, node);
  }

  promoteEditorFonts(root);

  return root.innerHTML;
}

/** Load web fonts and keep editor font-family in viewers without auto-linking. */
export function prepareViewerHtml(html: string): string {
  if (!html || typeof document === 'undefined') return html || '';
  ensureRichTextFontsLoaded();
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__rt_root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__rt_root');
  if (!root) return html;
  promoteEditorFonts(root);
  return root.innerHTML;
}

/** True when the string looks like stored rich-text HTML rather than plain notes. */
export function looksLikeHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content || '');
}

export function stripHtmlToPlainText(content: string): string {
  if (!content) return '';
  if (typeof document === 'undefined') {
    return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  return (tempDiv.textContent || tempDiv.innerText || '').replace(/\s+/g, ' ').trim();
}

/** False for empty editors that still emit `<p></p>` or `<p><br></p>`. */
export function hasVisibleRichText(content?: string | null): boolean {
  return !!stripHtmlToPlainText(content || '');
}

export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Convert plain-text preset notes into HTML the rich-text editor can display. */
export function plainNotesToHtml(text: string): string {
  const normalized = (text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  return normalized.split(/\n{2,}/).map((block) =>
    block.split('\n').map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (idx === 0 && /information\s*:?\s*$/i.test(trimmed)) {
        const title = trimmed.replace(/:\s*$/, '');
        return `<p><strong>${escapeHtmlText(title)}:</strong></p>`;
      }
      const colon = trimmed.indexOf(':');
      if (colon > 0 && colon < 48 && !trimmed.slice(0, colon).includes('http')) {
        return `<p><strong>${escapeHtmlText(trimmed.slice(0, colon + 1))}</strong>${escapeHtmlText(trimmed.slice(colon + 1))}</p>`;
      }
      return `<p>${escapeHtmlText(trimmed)}</p>`;
    }).join('')
  ).join('');
}
