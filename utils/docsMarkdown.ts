/**
 * Docs markdown → safe HTML for Help Guides (tables, h1–h4, code, blockquotes).
 * Reuses escape / inline helpers from release notes renderer.
 */
import { escapeHtml, formatInlineMarkdown } from './releaseNotesMarkdown';

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function renderTable(header: string[], rows: string[][]): string {
  const th = header
    .map(
      (c) =>
        `<th class="px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-600">${formatInlineMarkdown(c)}</th>`
    )
    .join('');
  const body = rows
    .map((cols) => {
      const tds = cols
        .map(
          (c) =>
            `<td class="px-3 py-2 text-sm text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700 align-top">${formatInlineMarkdown(c)}</td>`
        )
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  return `<div class="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700"><table class="min-w-full text-sm"><thead class="bg-slate-50 dark:bg-slate-900/60"><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function renderDocsHtml(markdown: string): string {
  if (!markdown || !markdown.trim()) return '';

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeLang = '';
  let codeBuf: string[] = [];
  let inBlockquote = false;

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

  const closeQuote = () => {
    if (inBlockquote) {
      out.push('</blockquote>');
      inBlockquote = false;
    }
  };

  const flushCode = () => {
    const source = codeBuf.join('\n');
    if (codeLang === 'mermaid') {
      out.push(
        `<div class="mermaid-diagram my-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-4"><div class="mermaid">${escapeHtml(source)}</div></div>`
      );
    } else {
      out.push(
        `<pre class="text-xs bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto my-3"><code>${escapeHtml(source)}</code></pre>`
      );
    }
    codeBuf = [];
    codeLang = '';
    inCode = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      closeQuote();
      if (inCode) {
        flushCode();
      } else {
        closeLists();
        codeLang = line.trim().slice(3).trim().toLowerCase().split(/\s+/)[0] || '';
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // Tables: header + separator + rows
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      closeLists();
      closeQuote();
      const header = splitTableRow(line);
      i += 1; // skip separator
      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].trim() !== '') {
        i += 1;
        if (isTableSeparator(lines[i])) continue;
        rows.push(splitTableRow(lines[i]));
      }
      out.push(renderTable(header, rows));
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      closeLists();
      closeQuote();
      out.push('<hr class="my-4 border-slate-200 dark:border-slate-600" />');
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeLists();
      closeQuote();
      const level = heading[1].length;
      const cls =
        level === 1
          ? 'text-2xl font-bold mt-2 mb-3'
          : level === 2
            ? 'text-xl font-semibold mt-5 mb-2'
            : level === 3
              ? 'text-lg font-semibold mt-4 mb-2'
              : 'text-base font-semibold mt-3 mb-1.5 text-slate-800 dark:text-slate-100';
      out.push(
        `<h${level} class="${cls} text-slate-900 dark:text-white">${formatInlineMarkdown(heading[2])}</h${level}>`
      );
      continue;
    }

    const bq = line.match(/^\s*>\s?(.*)$/);
    if (bq) {
      closeLists();
      if (!inBlockquote) {
        out.push(
          '<blockquote class="border-l-4 border-brand-400 dark:border-brand-500 pl-3 my-3 text-slate-600 dark:text-slate-300 italic">'
        );
        inBlockquote = true;
      }
      out.push(`<p class="my-1">${formatInlineMarkdown(bq[1])}</p>`);
      continue;
    }
    if (inBlockquote) {
      closeQuote();
    }

    const ul = line.match(/^\s*[-*+]\s+(.+)$/);
    if (ul) {
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul class="list-disc pl-5 space-y-1 my-2">');
        inUl = true;
      }
      out.push(`<li class="text-slate-700 dark:text-slate-300">${formatInlineMarkdown(ul[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ol) {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol class="list-decimal pl-5 space-y-1 my-2">');
        inOl = true;
      }
      out.push(`<li class="text-slate-700 dark:text-slate-300">${formatInlineMarkdown(ol[1])}</li>`);
      continue;
    }

    if (line.trim() === '') {
      closeLists();
      continue;
    }

    closeLists();
    out.push(`<p class="my-2 text-slate-700 dark:text-slate-300 leading-relaxed">${formatInlineMarkdown(line)}</p>`);
  }

  closeLists();
  closeQuote();
  if (inCode) {
    flushCode();
  }

  return out.join('\n');
}
