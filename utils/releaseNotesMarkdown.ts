/**
 * Lightweight markdown → safe HTML for release notes (no dependency).
 * Supports: headings, bold/italic, inline code, links, lists, paragraphs, hr.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInline(text: string): string {
  let s = escapeHtml(text);
  // links [label](url)
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_m, label, url) => {
    const safeUrl = String(url).replace(/"/g, '');
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-brand-600 dark:text-brand-400 underline">${label}</a>`;
  });
  // bold **text** or __text__
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // italic *text* (single asterisks remaining) or _text_
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  // inline code
  s = s.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[0.85em]">$1</code>');
  return s;
}

export function renderReleaseNotesHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) return '';

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuf: string[] = [];

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;

    if (line.trim().startsWith('```')) {
      if (inCode) {
        out.push(
          `<pre class="text-[11px] bg-slate-900 text-slate-100 rounded-md p-2 overflow-x-auto my-2"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`
        );
        codeBuf = [];
        inCode = false;
      } else {
        closeLists();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      closeLists();
      out.push('<hr class="my-2 border-slate-200 dark:border-slate-600" />');
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      const cls =
        level === 1
          ? 'text-sm font-bold mt-2 mb-1'
          : level === 2
            ? 'text-sm font-semibold mt-2 mb-1'
            : 'text-xs font-semibold mt-1.5 mb-0.5 uppercase tracking-wide text-slate-500';
      out.push(`<h${level} class="${cls} text-slate-900 dark:text-white">${formatInline(heading[2])}</h${level}>`);
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.+)$/);
    if (ul) {
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul class="list-disc list-inside space-y-0.5 my-1">');
        inUl = true;
      }
      out.push(`<li class="text-slate-700 dark:text-slate-300">${formatInline(ul[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ol) {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol class="list-decimal list-inside space-y-0.5 my-1">');
        inOl = true;
      }
      out.push(`<li class="text-slate-700 dark:text-slate-300">${formatInline(ol[1])}</li>`);
      continue;
    }

    if (line.trim() === '') {
      closeLists();
      continue;
    }

    closeLists();
    out.push(`<p class="my-1 text-slate-700 dark:text-slate-300">${formatInline(line)}</p>`);
  }

  closeLists();
  if (inCode) {
    out.push(
      `<pre class="text-[11px] bg-slate-900 text-slate-100 rounded-md p-2 overflow-x-auto my-2"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`
    );
  }

  return out.join('\n');
}
