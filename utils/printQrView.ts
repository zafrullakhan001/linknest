/**
 * Print QR code grids as they appear on screen (section or full page).
 */

function absolutizeSvgImages(root: ParentNode): void {
  root.querySelectorAll('image').forEach((imageEl) => {
    const href =
      imageEl.getAttribute('href') ||
      imageEl.getAttribute('xlink:href') ||
      imageEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
      '';
    if (!href || href.startsWith('data:') || href.startsWith('blob:')) return;
    try {
      const absolute = new URL(href, window.location.href).href;
      imageEl.setAttribute('href', absolute);
      imageEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', absolute);
      imageEl.setAttribute('xlink:href', absolute);
    } catch {
      // keep original
    }
  });
}

function sanitizeQrCardClone(card: HTMLElement): HTMLElement {
  const clone = card.cloneNode(true) as HTMLElement;
  // Drop interactive actions (Open link / Enlarge / etc.)
  clone.querySelectorAll('a, button').forEach((el) => el.remove());
  // Remove leftover separators that sat between action links
  clone.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
    const text = (el.textContent || '').trim();
    if (text === '·' || text === '•' || text === '|') el.remove();
  });
  absolutizeSvgImages(clone);
  return clone;
}

function buildSectionBlocks(sectionEls: HTMLElement[]): string {
  return sectionEls
    .map((sectionEl) => {
      const title =
        sectionEl.querySelector('.linknest-content-section-title')?.textContent?.trim() ||
        sectionEl.getAttribute('data-qr-print-title') ||
        '';
      const cards = Array.from(sectionEl.querySelectorAll<HTMLElement>('.linknest-qr-card'));
      if (cards.length === 0) return '';

      const cardsHtml = cards
        .map((card) => {
          const clean = sanitizeQrCardClone(card);
          clean.className = 'qr-card';
          return clean.outerHTML;
        })
        .join('\n');

      return `
        <section class="qr-section">
          ${title ? `<h2 class="section-title">${escapeHtml(title)}</h2>` : ''}
          <div class="qr-grid">${cardsHtml}</div>
        </section>
      `;
    })
    .filter(Boolean)
    .join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function waitForPrintAssets(doc: Document): Promise<void> {
  const images = [
    ...Array.from(doc.images),
    ...Array.from(doc.querySelectorAll('image')),
  ] as Array<HTMLImageElement | SVGImageElement>;

  if (images.length === 0) {
    return new Promise((resolve) => window.setTimeout(resolve, 80));
  }

  return new Promise((resolve) => {
    let pending = images.length;
    let settled = false;
    const done = () => {
      pending -= 1;
      if (pending <= 0 && !settled) {
        settled = true;
        window.setTimeout(resolve, 50);
      }
    };

    images.forEach((img) => {
      if ('complete' in img && (img as HTMLImageElement).complete) {
        done();
        return;
      }
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });

    window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, 2000);
  });
}

export type PrintQrViewOptions = {
  /** Page title shown in the print document / browser tab */
  title: string;
  /**
   * For full-page print: container that holds one or more `[data-qr-print-section]` blocks.
   * For section print: the section element itself (with `data-qr-print-section`).
   */
  root: HTMLElement;
  /** Optional subtitle under the main title */
  subtitle?: string;
};

/**
 * Opens the system print dialog with QR cards cloned from the on-screen layout.
 */
export async function printQrView(options: PrintQrViewOptions): Promise<void> {
  const { title, root, subtitle } = options;

  const sectionEls = root.matches('[data-qr-print-section]')
    ? [root]
    : Array.from(root.querySelectorAll<HTMLElement>('[data-qr-print-section]'));

  const withCards = sectionEls.filter((el) => el.querySelector('.linknest-qr-card'));
  if (withCards.length === 0) {
    throw new Error('No QR codes found to print');
  }

  const bodyHtml = buildSectionBlocks(withCards);
  const baseHref = window.location.href.split('#')[0];

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <base href="${escapeHtml(baseHref)}" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 12mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #0f172a;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    .sheet { padding: 8px 4px 16px; }
    .page-title {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 4px;
      text-align: center;
    }
    .page-subtitle {
      font-size: 12px;
      color: #64748b;
      margin: 0 0 18px;
      text-align: center;
    }
    .qr-section { margin: 0 0 22px; break-inside: avoid-page; }
    .section-title {
      font-size: 15px;
      font-weight: 700;
      margin: 0 0 12px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e2e8f0;
    }
    .qr-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 14px;
      align-items: start;
    }
    .qr-card {
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 14px;
      text-align: center;
      break-inside: avoid;
      background: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .qr-card svg {
      width: 180px !important;
      height: 180px !important;
      max-width: 100%;
      display: block;
    }
    .qr-card img {
      max-width: 180px;
      height: auto;
    }
    .qr-card p {
      margin: 0;
    }
    a { color: inherit; text-decoration: none; }
  </style>
</head>
<body>
  <div class="sheet">
    <h1 class="page-title">${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="page-subtitle">${escapeHtml(subtitle)}</p>` : ''}
    ${bodyHtml}
  </div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win?.document;
  if (!win || !doc) {
    iframe.remove();
    throw new Error('Unable to create print frame');
  }

  doc.open();
  doc.write(html);
  doc.close();

  await waitForPrintAssets(doc);

  try {
    win.focus();
    win.print();
  } finally {
    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        // ignore
      }
    }, 1000);
  }
}
