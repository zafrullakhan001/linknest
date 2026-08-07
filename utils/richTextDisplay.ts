/**
 * Display helpers for section rich text: auto-linkify URLs/emails in HTML
 * without nesting inside existing anchors, and without mutating stored content.
 */

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
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = text;
  return a;
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

  return root.innerHTML;
}
