/**
 * Display helpers for section rich text: auto-linkify URLs/emails in HTML
 * without nesting inside existing anchors, and without mutating stored content.
 */

import { ensureRichTextFontsLoaded } from './richTextFonts';

const SKIP_TAGS = new Set(['A', 'SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'VIDEO', 'AUDIO', 'IFRAME']);

function mediaKindFromHref(href: string): 'video' | 'audio' | 'image' | null {
  const path = (href.split('?')[0] || '').split('#')[0].toLowerCase();
  if (/\.(mp4|webm|ogv|mov)$/.test(path)) return 'video';
  if (/\.(mp3|wav|ogg|m4a)$/.test(path)) return 'audio';
  if (/\.(jpg|jpeg|png|gif|webp|svg)$/.test(path)) return 'image';
  return null;
}

function createMediaElement(doc: Document, href: string, kind: 'video' | 'audio' | 'image'): HTMLElement {
  if (kind === 'image') {
    const img = doc.createElement('img');
    img.src = href;
    img.alt = '';
    img.setAttribute('style', 'max-width:100%;height:auto;');
    return img;
  }
  if (kind === 'audio') {
    const audio = doc.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.setAttribute('style', 'width:100%;display:block;');
    const source = doc.createElement('source');
    source.src = href;
    audio.appendChild(source);
    return audio;
  }
  const video = doc.createElement('video');
  video.controls = true;
  video.setAttribute('playsinline', '');
  video.preload = 'metadata';
  video.setAttribute('width', '640');
  video.setAttribute('height', '360');
  video.setAttribute('style', 'max-width:100%;height:auto;display:block;background:#0f172a;');
  const source = doc.createElement('source');
  source.src = href;
  video.appendChild(source);
  return video;
}

/** Turn pasted media-library / upload links into playable tags. */
function embedBareMediaLinks(root: Element, doc: Document): void {
  root.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href') || '';
    const kind = mediaKindFromHref(href);
    if (!kind) return;
    if (anchor.closest('video, audio')) return;
    const text = (anchor.textContent || '').trim();
    const isRawUrl = !text || text === href || text.replace(/&amp;/g, '&') === href;
    const isUpload = /\/uploads\/media_[a-z0-9]/i.test(href);
    if (!isRawUrl && !isUpload) return;
    anchor.replaceWith(createMediaElement(doc, href, kind));
  });
}

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

const FONT_SIZE_ATTR_MAP: Record<string, string> = {
  '1': '0.75rem',
  '2': '0.875rem',
  '3': '1rem',
  '4': '1.125rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '7': '2rem',
};

/** Keep editor inline styles against theme CSS that uses !important. */
function promoteEditorFonts(root: Element): void {
  const styled = root.querySelectorAll<HTMLElement>('[style]');
  styled.forEach((el) => {
    const family = el.style.fontFamily;
    if (family) el.style.setProperty('font-family', family, 'important');
    const color = el.style.color;
    if (color) el.style.setProperty('color', color, 'important');
    const size = el.style.fontSize;
    if (size) el.style.setProperty('font-size', size, 'important');
    const bg = el.style.backgroundColor;
    if (bg) el.style.setProperty('background-color', bg, 'important');
    const weight = el.style.fontWeight;
    if (weight) el.style.setProperty('font-weight', weight, 'important');
    const italic = el.style.fontStyle;
    if (italic) el.style.setProperty('font-style', italic, 'important');
  });
  root.querySelectorAll('font[face]').forEach((fontEl) => {
    const face = fontEl.getAttribute('face');
    if (!face) return;
    (fontEl as HTMLElement).style.setProperty('font-family', face, 'important');
  });
  root.querySelectorAll('font[color]').forEach((fontEl) => {
    const color = fontEl.getAttribute('color');
    if (!color) return;
    (fontEl as HTMLElement).style.setProperty('color', color, 'important');
  });
  root.querySelectorAll('font[size]').forEach((fontEl) => {
    const size = fontEl.getAttribute('size');
    if (!size) return;
    const mapped = FONT_SIZE_ATTR_MAP[size] || size;
    (fontEl as HTMLElement).style.setProperty('font-size', mapped, 'important');
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
  embedBareMediaLinks(root, doc);

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
  embedBareMediaLinks(root, doc);
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
  if (!content) return false;
  if (stripHtmlToPlainText(content)) return true;
  return /<(img|video|audio|iframe|embed|object|source)\b/i.test(content);
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
