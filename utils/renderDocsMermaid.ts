import { loadMermaid } from './loadMermaid';

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}

export function fixMermaidLabelOverflow(scope: ParentNode): void {
  scope.querySelectorAll('svg').forEach((svg) => {
    const el = svg as SVGElement;
    el.style.overflow = 'visible';
    el.removeAttribute('height');
    el.style.maxWidth = '100%';
    el.style.height = 'auto';
  });

  scope.querySelectorAll('foreignObject').forEach((fo) => {
    const el = fo as SVGForeignObjectElement;
    el.style.overflow = 'visible';
    const inner = el.querySelector('.nodeLabel, .edgeLabel, div, span') as HTMLElement | null;
    if (!inner) return;
    const padX = 12;
    const padY = 8;
    const needW =
      Math.ceil(Math.max(inner.scrollWidth, inner.offsetWidth, inner.getBoundingClientRect().width)) +
      padX;
    const needH =
      Math.ceil(
        Math.max(inner.scrollHeight, inner.offsetHeight, inner.getBoundingClientRect().height)
      ) + padY;
    const curW = parseFloat(el.getAttribute('width') || '0') || 0;
    const curH = parseFloat(el.getAttribute('height') || '0') || 0;
    if (needW > curW) el.setAttribute('width', String(needW));
    if (needH > curH) el.setAttribute('height', String(needH));
    inner.style.overflow = 'visible';
    inner.style.whiteSpace = 'normal';
    inner.style.wordBreak = 'break-word';
    inner.style.overflowWrap = 'anywhere';
  });
}

function ensureSource(node: HTMLElement): string {
  if (node.dataset.mermaidSource) return node.dataset.mermaidSource;
  // Prefer text before any SVG was injected
  const text = (node.textContent || '').trim();
  node.dataset.mermaidSource = text;
  return text;
}

/** Reset node to source text so Mermaid can re-process it. */
export function resetMermaidNode(node: HTMLElement): void {
  const source = ensureSource(node);
  node.removeAttribute('data-processed');
  node.removeAttribute('data-mermaid-expanded');
  node.innerHTML = '';
  node.textContent = source;
}

export async function renderMermaidNodes(nodes: HTMLElement[]): Promise<void> {
  if (!nodes.length) return;
  const mermaid = await loadMermaid();
  const dark = isDarkMode();

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: dark ? 'dark' : 'default',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    themeVariables: {
      fontSize: '15px',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    },
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
      padding: 18,
      nodeSpacing: 48,
      rankSpacing: 56,
      wrappingWidth: 180,
      useMaxWidth: true,
    },
    sequence: {
      useMaxWidth: true,
      actorMargin: 28,
      boxMargin: 12,
      messageMargin: 40,
      wrap: true,
      width: 180,
      height: 56,
    },
    er: {
      useMaxWidth: true,
      entityPadding: 18,
      fontSize: 14,
    },
  });

  nodes.forEach((node) => {
    ensureSource(node);
    resetMermaidNode(node);
  });

  await mermaid.run({ nodes });
  nodes.forEach((node) => fixMermaidLabelOverflow(node));
  requestAnimationFrame(() => {
    nodes.forEach((node) => fixMermaidLabelOverflow(node));
  });
}

export function collectMermaidNodes(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.mermaid'));
}

export function getUnprocessedOrBrokenMermaidNodes(root: ParentNode): HTMLElement[] {
  return collectMermaidNodes(root).filter((node) => {
    if (!node.getAttribute('data-processed')) return true;
    // SVG missing → fell back to raw text after a React/DOM wipe
    return !node.querySelector('svg');
  });
}

export async function refreshAllMermaid(root: ParentNode): Promise<void> {
  const nodes = collectMermaidNodes(root);
  await renderMermaidNodes(nodes);
}

export async function refreshOneMermaid(node: HTMLElement): Promise<void> {
  await renderMermaidNodes([node]);
}

export function getMermaidSourceFromDiagram(diagram: HTMLElement): string {
  const node = diagram.querySelector<HTMLElement>('.mermaid');
  if (!node) return '';
  return ensureSource(node);
}
