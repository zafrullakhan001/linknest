import { Link, LinkSection, RichTextContent, Tab } from '../types';

const generateId = () => Math.random().toString(36).substring(2, 9);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'export';

const triggerDownload = (data: unknown, filename: string) => {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

/** JSON export: links only (for pasting into another section) */
export interface SectionLinksExportFile {
  version: '1.0';
  type: 'section_links';
  exportedAt: number;
  sectionTitle?: string;
  links: Link[];
}

/** JSON export: one tab with all sections, links, and rich text blocks */
export interface TabExportFile {
  version: '1.0';
  type: 'tab';
  exportedAt: number;
  tab: Tab;
}

export const exportSectionLinksToFile = (section: LinkSection) => {
  const links = (section.links || []).map((l) => ({ ...l }));
  const payload: SectionLinksExportFile = {
    version: '1.0',
    type: 'section_links',
    exportedAt: Date.now(),
    sectionTitle: section.title,
    links
  };
  const filename = `linknest-section-links-${slugify(section.title || 'links')}.json`;
  triggerDownload(payload, filename);
};

export const exportTabToFile = (tab: Tab) => {
  const tabCopy: Tab = JSON.parse(JSON.stringify(tab)) as Tab;
  const payload: TabExportFile = {
    version: '1.0',
    type: 'tab',
    exportedAt: Date.now(),
    tab: tabCopy
  };
  const filename = `linknest-tab-${slugify(tab.title || 'tab')}.json`;
  triggerDownload(payload, filename);
};

function normalizeImportedLink(raw: unknown): Link | null {
  if (!raw || typeof raw !== 'object') return null;
  const link = raw as Record<string, unknown>;
  const label = String(link.label ?? '').trim();
  const url = String(link.url ?? '').trim();
  if (!label && !url) return null;

  let finalUrl = url.trim();
  // Keep URL exactly as imported (ssh://, http://, bare hosts, etc.) — do not invent https://.

  return {
    id: generateId(),
    label: label || url || 'Link',
    url: finalUrl,
    icon: typeof link.icon === 'string' ? link.icon : undefined,
    textColor: typeof link.textColor === 'string' ? link.textColor : undefined,
    browser: typeof link.browser === 'string' ? link.browser : undefined,
    position: typeof link.position === 'number' ? link.position : undefined,
    visibility:
      link.visibility === 'authenticated' || link.visibility === 'private' || link.visibility === 'public'
        ? link.visibility
        : 'public',
    allowedUsers: Array.isArray(link.allowedUsers)
      ? (link.allowedUsers as unknown[]).filter((u): u is number => typeof u === 'number')
      : undefined,
    allowedGroups: Array.isArray(link.allowedGroups)
      ? (link.allowedGroups as unknown[]).filter((g): g is number => typeof g === 'number')
      : undefined,
    notes: typeof link.notes === 'string' ? link.notes : undefined,
    tooltip: typeof link.tooltip === 'string' ? link.tooltip : undefined,
    tooltipStyle: link.tooltipStyle === 'rich' ? 'rich' : (link.tooltipStyle === 'classic' ? 'classic' : undefined),
    notesEnabled: link.notesEnabled === true,
    notesVideoUrl: typeof link.notesVideoUrl === 'string' ? link.notesVideoUrl : undefined,
    richTextContent: typeof link.richTextContent === 'string' ? link.richTextContent : undefined,
    richTextEnabled: link.richTextEnabled === true,
    infoVideoUrl: typeof link.infoVideoUrl === 'string' ? link.infoVideoUrl : undefined,
    infoShowOpenLink: link.infoShowOpenLink !== false,
    maintenanceEnabled: link.maintenanceEnabled === true,
    maintenanceMessage: typeof link.maintenanceMessage === 'string' ? link.maintenanceMessage : undefined,
    maintenanceVideoUrl: typeof link.maintenanceVideoUrl === 'string' ? link.maintenanceVideoUrl : undefined,
    mobilePreviewEmulation: link.mobilePreviewEmulation === true || undefined,
    openInEmulation: link.openInEmulation === true || undefined,
    health: link.health && typeof link.health === 'object' ? (link.health as Link['health']) : undefined,
    visibleFrom: typeof link.visibleFrom === 'string' ? link.visibleFrom : undefined,
    expiresAt: typeof link.expiresAt === 'string' ? link.expiresAt : undefined,
    accessRestrictions: link.accessRestrictions && typeof link.accessRestrictions === 'object' ? (link.accessRestrictions as Link['accessRestrictions']) : undefined,
    animation: typeof link.animation === 'string' ? link.animation : undefined
  };
}

export const parseSectionLinksExport = (data: unknown): Link[] => {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid file: expected a JSON object.');
  }
  const o = data as Record<string, unknown>;
  if (o.type !== 'section_links') {
    throw new Error('Not a section links export (expected type "section_links").');
  }
  if (o.version !== '1.0') {
    console.warn('Unknown section links export version:', o.version);
  }
  if (!Array.isArray(o.links)) {
    throw new Error('Invalid export: missing "links" array.');
  }
  const out: Link[] = [];
  for (const item of o.links) {
    const link = normalizeImportedLink(item);
    if (link) out.push(link);
  }
  return out;
};

function normalizeRichTextItem(raw: unknown): RichTextContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const rtc = raw as Record<string, unknown>;
  return {
    id: generateId(),
    content: String(rtc.content ?? ''),
    position: typeof rtc.position === 'number' ? rtc.position : 0,
    visibility:
      rtc.visibility === 'authenticated' || rtc.visibility === 'private' || rtc.visibility === 'public'
        ? rtc.visibility
        : 'public',
    allowedUsers: Array.isArray(rtc.allowedUsers)
      ? (rtc.allowedUsers as unknown[]).filter((u): u is number => typeof u === 'number')
      : undefined,
    allowedGroups: Array.isArray(rtc.allowedGroups)
      ? (rtc.allowedGroups as unknown[]).filter((g): g is number => typeof g === 'number')
      : undefined,
    visibleFrom: typeof rtc.visibleFrom === 'string' ? rtc.visibleFrom : undefined,
    expiresAt: typeof rtc.expiresAt === 'string' ? rtc.expiresAt : undefined
  };
}

function normalizeImportedSection(raw: unknown, index: number): LinkSection {
  if (!raw || typeof raw !== 'object') {
    return {
      id: generateId(),
      title: `Section ${index + 1}`,
      links: [],
      position: index
    };
  }
  const s = raw as Record<string, unknown>;
  const linksRaw = Array.isArray(s.links) ? s.links : [];
  const links: Link[] = [];
  for (const item of linksRaw) {
    const link = normalizeImportedLink(item);
    if (link) links.push(link);
  }
  const richRaw = Array.isArray(s.richTextContent) ? s.richTextContent : [];
  const richTextContent: RichTextContent[] = [];
  for (const item of richRaw) {
    const rtc = normalizeRichTextItem(item);
    if (rtc) richTextContent.push(rtc);
  }

  return {
    id: generateId(),
    title: String(s.title ?? `Section ${index + 1}`),
    position: typeof s.position === 'number' ? s.position : index,
    textColor: typeof s.textColor === 'string' ? s.textColor : undefined,
    emoji: typeof s.emoji === 'string' ? s.emoji : undefined,
    forceStackedView: typeof s.forceStackedView === 'boolean' ? s.forceStackedView : undefined,
    visibility:
      s.visibility === 'authenticated' || s.visibility === 'private' || s.visibility === 'public'
        ? s.visibility
        : 'public',
    allowedUsers: Array.isArray(s.allowedUsers)
      ? (s.allowedUsers as unknown[]).filter((u): u is number => typeof u === 'number')
      : undefined,
    allowedGroups: Array.isArray(s.allowedGroups)
      ? (s.allowedGroups as unknown[]).filter((g): g is number => typeof g === 'number')
      : undefined,
    visibleFrom: typeof s.visibleFrom === 'string' ? s.visibleFrom : undefined,
    expiresAt: typeof s.expiresAt === 'string' ? s.expiresAt : undefined,
    links,
    richTextContent: richTextContent.length > 0 ? richTextContent : undefined
  };
}

export const parseTabExport = (data: unknown): Tab => {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid file: expected a JSON object.');
  }
  const o = data as Record<string, unknown>;
  if (o.type !== 'tab') {
    throw new Error('Not a tab export (expected type "tab").');
  }
  if (o.version !== '1.0') {
    console.warn('Unknown tab export version:', o.version);
  }
  const tabRaw = o.tab;
  if (!tabRaw || typeof tabRaw !== 'object') {
    throw new Error('Invalid export: missing "tab" object.');
  }
  const t = tabRaw as Record<string, unknown>;
  const sectionsRaw = Array.isArray(t.sections) ? t.sections : [];
  const sections = sectionsRaw.map((sec, i) => normalizeImportedSection(sec, i));

  return {
    id: generateId(),
    title: String(t.title ?? 'Imported Tab'),
    position: typeof t.position === 'number' ? t.position : 0,
    textColor: typeof t.textColor === 'string' ? t.textColor : undefined,
    emoji: typeof t.emoji === 'string' ? t.emoji : undefined,
    visibility:
      t.visibility === 'authenticated' || t.visibility === 'private' || t.visibility === 'public'
        ? t.visibility
        : 'public',
    allowedUsers: Array.isArray(t.allowedUsers)
      ? (t.allowedUsers as unknown[]).filter((u): u is number => typeof u === 'number')
      : undefined,
    allowedGroups: Array.isArray(t.allowedGroups)
      ? (t.allowedGroups as unknown[]).filter((g): g is number => typeof g === 'number')
      : undefined,
    visibleFrom: typeof t.visibleFrom === 'string' ? t.visibleFrom : undefined,
    expiresAt: typeof t.expiresAt === 'string' ? t.expiresAt : undefined,
    accessRestrictions: t.accessRestrictions && typeof t.accessRestrictions === 'object' ? (t.accessRestrictions as Tab['accessRestrictions']) : undefined,
    sections
  };
};
