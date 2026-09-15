function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type ReportSection = { title: string; rows: { label: string; value: string }[] };

export function buildReportHtmlDocument(title: string, sections: ReportSection[], footerNote: string): string {
  const sectionHtml = sections
    .map((sec) => {
      const rows = sec.rows
        .map(
          (r) =>
            `<tr><th scope="row">${escapeHtml(r.label)}</th><td>${escapeHtml(r.value)}</td></tr>`
        )
        .join('');
      return `<section class="sec"><h2>${escapeHtml(sec.title)}</h2><table>${rows}</table></section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1.5rem; color: #111; }
    h1 { font-size: 1.25rem; }
    h2 { font-size: 1rem; margin-top: 1.25rem; }
    table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
    th, td { border: 1px solid #ddd; padding: 0.35rem 0.5rem; text-align: left; vertical-align: top; }
    th { width: 28%; background: #f9fafb; }
    .foot { margin-top: 2rem; font-size: 0.75rem; color: #666; }
    @media print { body { margin: 0.5in; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="foot">${escapeHtml(footerNote)}</p>
  ${sectionHtml}
  <p class="foot">SSL Forge — public certificate data only; private keys are never included.</p>
</body>
</html>`;
}

export function downloadHtmlReport(filename: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function openPrintReport(html: string): void {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
