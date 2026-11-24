import { Link, LinkSection, RichTextContent, Tab } from '../types';
import { pickSectionBackgroundDecoration } from '../utils/sectionBackgroundColor';
import { generateUuid } from './idService';

const generateId = () => generateUuid();

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

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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
  version: '1.0' | '1.1';
  type: 'tab';
  exportedAt: number;
  tab: Tab;
}

/** JSON export: several tabs */
export interface TabsExportFile {
  version: '1.1';
  type: 'tabs';
  exportedAt: number;
  tabs: Tab[];
}

/** JSON export: one full section (title, colors, links, rich text) */
export interface SectionExportFile {
  version: '1.1';
  type: 'section';
  exportedAt: number;
  section: LinkSection;
  tabTitle?: string;
}

/** JSON export: several full sections */
export interface SectionsExportFile {
  version: '1.1';
  type: 'sections';
  exportedAt: number;
  tabTitle?: string;
  sections: LinkSection[];
}

export type ContentTransferKind = 'tabs' | 'sections' | 'links';

export interface ParsedContentTransfer {
  kind: ContentTransferKind;
  tabs?: Tab[];
  sections?: LinkSection[];
  links?: Link[];
  sourceTabTitle?: string;
}

type ContentTopic = { id: string; title: string; html: string; hidden?: boolean };

const remapTopics = (topics: unknown): ContentTopic[] | undefined => {
  if (!Array.isArray(topics)) return undefined;
  const out: ContentTopic[] = [];
  for (const raw of topics) {
    if (!raw || typeof raw !== 'object') continue;
    const t = raw as Record<string, unknown>;
    out.push({
      id: generateId(),
      title: typeof t.title === 'string' && t.title.trim() ? t.title.trim() : 'Topic',
      html: typeof t.html === 'string' ? t.html : '',
      ...(t.hidden === true ? { hidden: true } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
};

const prepareSectionForExport = (section: LinkSection): LinkSection => {
  const background = pickSectionBackgroundDecoration(section as unknown as Record<string, unknown>);
  return deepClone({ ...section, ...background });
};

const prepareTabForExport = (tab: Tab): Tab => {
  const background = pickSectionBackgroundDecoration(tab as unknown as Record<string, unknown>);
  const sections = Array.isArray(tab.sections)
    ? tab.sections.map((section) => prepareSectionForExport(section))
    : [];
  return deepClone({ ...tab, ...background, sections });
};

/** Fresh ids; drop shortUrl / syncSourceId so copies cannot take over existing short links. */
export const cloneLinkForImport = (raw: unknown): Link | null => {
  if (!raw || typeof raw !== 'object') return null;
  const link = deepClone(raw) as Link;
  const label = String(link.label ?? '').trim();
  const url = String(link.url ?? '').trim();
  if (!label && !url) return null;

  link.id = generateId();
  delete link.shortUrl;
  delete link.syncSourceId;
  link.label = label || url || 'Link';
  link.url = url;

  const notesTopics = remapTopics(link.notesTopics);
  if (notesTopics) link.notesTopics = notesTopics;
  else delete link.notesTopics;

  const infoTopics = remapTopics(link.infoTopics);
  if (infoTopics) link.infoTopics = infoTopics;
  else delete link.infoTopics;

  const maintenanceTopics = remapTopics(link.maintenanceTopics);
  if (maintenanceTopics) link.maintenanceTopics = maintenanceTopics;
  else delete link.maintenanceTopics;

  return link;
};

const cloneRichTextForImport = (raw: unknown): RichTextContent | null => {
  if (!raw || typeof raw !== 'object') return null;
  const rtc = deepClone(raw) as RichTextContent;
  rtc.id = generateId();
  rtc.content = String(rtc.content ?? '');
  rtc.position = typeof rtc.position === 'number' ? rtc.position : 0;
  return rtc;
};

export const cloneSectionForImport = (raw: unknown, index = 0): LinkSection => {
  if (!raw || typeof raw !== 'object') {
    return {
      id: generateId(),
      title: `Section ${index + 1}`,
      links: [],
      position: index,
    };
  }
  const section = deepClone(raw) as LinkSection;
  section.id = generateId();
  delete section.shortUrl;
  delete section.syncSourceId;
  section.title = String(section.title ?? `Section ${index + 1}`);
  section.position = typeof section.position === 'number' ? section.position : index;

  const background = pickSectionBackgroundDecoration(section as unknown as Record<string, unknown>);
  Object.assign(section, background);

  const linksRaw = Array.isArray(section.links) ? section.links : [];
  section.links = linksRaw
    .map((item) => cloneLinkForImport(item))
    .filter((l): l is Link => l !== null);

  const richRaw = Array.isArray(section.richTextContent) ? section.richTextContent : [];
  const richTextContent = richRaw
    .map((item) => cloneRichTextForImport(item))
    .filter((r): r is RichTextContent => r !== null);
  section.richTextContent = richTextContent.length > 0 ? richTextContent : undefined;

  return section;
};

export const cloneTabForImport = (raw: unknown, index = 0): Tab => {
  if (!raw || typeof raw !== 'object') {
    return {
      id: generateId(),
      title: `Imported Tab ${index + 1}`,
      position: index,
      sections: [],
    };
  }
  const tab = deepClone(raw) as Tab;
  tab.id = generateId();
  delete tab.shortUrl;
  delete tab.syncSourceId;
  tab.title = String(tab.title ?? `Imported Tab ${index + 1}`);
  tab.position = typeof tab.position === 'number' ? tab.position : index;

  const background = pickSectionBackgroundDecoration(tab as unknown as Record<string, unknown>);
  Object.assign(tab, background);

  const sectionsRaw = Array.isArray(tab.sections) ? tab.sections : [];
  tab.sections = sectionsRaw.map((sec, i) => cloneSectionForImport(sec, i));
  return tab;
};

export const exportSectionLinksToFile = (section: LinkSection) => {
  const links = (section.links || []).map((l) => ({ ...l }));
  const payload: SectionLinksExportFile = {
    version: '1.0',
    type: 'section_links',
    exportedAt: Date.now(),
    sectionTitle: section.title,
    links,
  };
  const filename = `linknest-section-links-${slugify(section.title || 'links')}.json`;
  triggerDownload(payload, filename);
};

export const exportTabToFile = (tab: Tab) => {
  const tabCopy = prepareTabForExport(tab);
  const payload: TabExportFile = {
    version: '1.0',
    type: 'tab',
    exportedAt: Date.now(),
    tab: tabCopy,
  };
  const filename = `linknest-tab-${slugify(tab.title || 'tab')}.json`;
  triggerDownload(payload, filename);
};

/** Export one or more tabs. A single tab uses type "tab" so existing importers still work. */
export const exportTabsToFile = (tabs: Tab[]) => {
  if (tabs.length === 0) {
    throw new Error('Select at least one tab to export.');
  }
  if (tabs.length === 1) {
    exportTabToFile(tabs[0]);
    return;
  }
  const payload: TabsExportFile = {
    version: '1.1',
    type: 'tabs',
    exportedAt: Date.now(),
    tabs: tabs.map((t) => prepareTabForExport(t)),
  };
  const filename = `linknest-tabs-${tabs.length}-${slugify(tabs[0].title || 'tabs')}.json`;
  triggerDownload(payload, filename);
};

/** Export one or more full sections (not links-only). */
export const exportSectionsToFile = (sections: LinkSection[], tabTitle?: string) => {
  if (sections.length === 0) {
    throw new Error('Select at least one section to export.');
  }
  if (sections.length === 1) {
    const payload: SectionExportFile = {
      version: '1.1',
      type: 'section',
      exportedAt: Date.now(),
      section: prepareSectionForExport(sections[0]),
      ...(tabTitle ? { tabTitle } : {}),
    };
    const filename = `linknest-section-${slugify(sections[0].title || 'section')}.json`;
    triggerDownload(payload, filename);
    return;
  }
  const payload: SectionsExportFile = {
    version: '1.1',
    type: 'sections',
    exportedAt: Date.now(),
    ...(tabTitle ? { tabTitle } : {}),
    sections: sections.map((s) => prepareSectionForExport(s)),
  };
  const filename = `linknest-sections-${sections.length}-${slugify(tabTitle || sections[0].title || 'sections')}.json`;
  triggerDownload(payload, filename);
};

export const parseSectionLinksExport = (data: unknown): Link[] => {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid file: expected a JSON object.');
  }
  const o = data as Record<string, unknown>;
  if (o.type !== 'section_links') {
    throw new Error('Not a section links export (expected type "section_links").');
  }
  if (o.version !== '1.0' && o.version !== '1.1') {
    console.warn('Unknown section links export version:', o.version);
  }
  if (!Array.isArray(o.links)) {
    throw new Error('Invalid export: missing "links" array.');
  }
  const out: Link[] = [];
  for (const item of o.links) {
    const link = cloneLinkForImport(item);
    if (link) out.push(link);
  }
  return out;
};

export const parseTabExport = (data: unknown): Tab => {
  const parsed = parseContentTransfer(data);
  if (parsed.kind !== 'tabs' || !parsed.tabs?.length) {
    throw new Error('Not a tab export (expected type "tab").');
  }
  return parsed.tabs[0];
};

/**
 * Parse tab / tabs / section / sections / section_links JSON.
 * Always returns copies with fresh ids (shortUrl and syncSourceId removed).
 */
export const parseContentTransfer = (data: unknown): ParsedContentTransfer => {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid file: expected a JSON object.');
  }
  const o = data as Record<string, unknown>;
  const type = o.type;

  if (type === 'tab') {
    if (!o.tab || typeof o.tab !== 'object') {
      throw new Error('Invalid export: missing "tab" object.');
    }
    return { kind: 'tabs', tabs: [cloneTabForImport(o.tab, 0)] };
  }

  if (type === 'tabs') {
    if (!Array.isArray(o.tabs) || o.tabs.length === 0) {
      throw new Error('Invalid export: missing "tabs" array.');
    }
    return {
      kind: 'tabs',
      tabs: o.tabs.map((t, i) => cloneTabForImport(t, i)),
    };
  }

  if (type === 'section') {
    if (!o.section || typeof o.section !== 'object') {
      throw new Error('Invalid export: missing "section" object.');
    }
    return {
      kind: 'sections',
      sections: [cloneSectionForImport(o.section, 0)],
      sourceTabTitle: typeof o.tabTitle === 'string' ? o.tabTitle : undefined,
    };
  }

  if (type === 'sections') {
    if (!Array.isArray(o.sections) || o.sections.length === 0) {
      throw new Error('Invalid export: missing "sections" array.');
    }
    return {
      kind: 'sections',
      sections: o.sections.map((s, i) => cloneSectionForImport(s, i)),
      sourceTabTitle: typeof o.tabTitle === 'string' ? o.tabTitle : undefined,
    };
  }

  if (type === 'section_links') {
    return {
      kind: 'links',
      links: parseSectionLinksExport(data),
      sourceTabTitle: typeof o.sectionTitle === 'string' ? o.sectionTitle : undefined,
    };
  }

  throw new Error(
    'Unsupported file. Expected a LinkNest tab, tabs, section, sections, or section_links export.'
  );
};

export interface ApplyContentTransferOptions {
  /** Append imported tabs after this tab id. Omit to append at the end. */
  afterTabId?: string | null;
  /** Target tab id when importing sections or links. */
  targetTabId?: string | null;
  /** Target section id when importing links-only. */
  targetSectionId?: string | null;
}

/**
 * Merge a parsed transfer into an existing tabs array.
 * Tabs are appended (or inserted after afterTabId). Sections and links are appended into the target.
 */
export const applyContentTransfer = (
  existingTabs: Tab[],
  parsed: ParsedContentTransfer,
  options: ApplyContentTransferOptions = {}
): Tab[] => {
  const tabs = existingTabs.map((t) => ({
    ...t,
    sections: Array.isArray(t.sections) ? [...t.sections] : [],
  }));

  if (parsed.kind === 'tabs' && parsed.tabs?.length) {
    const imported = parsed.tabs.map((t, i) => ({
      ...t,
      position: tabs.length + i,
    }));
    const afterId = options.afterTabId;
    if (afterId) {
      const idx = tabs.findIndex((t) => t.id === afterId);
      if (idx !== -1) {
        const next = [...tabs.slice(0, idx + 1), ...imported, ...tabs.slice(idx + 1)];
        return next.map((t, i) => ({ ...t, position: i }));
      }
    }
    return [...tabs, ...imported].map((t, i) => ({ ...t, position: i }));
  }

  if (parsed.kind === 'sections' && parsed.sections?.length) {
    const targetId = options.targetTabId || tabs[0]?.id;
    if (!targetId) {
      throw new Error('This space has no tabs to import sections into.');
    }
    const tabIdx = tabs.findIndex((t) => t.id === targetId);
    if (tabIdx === -1) {
      throw new Error('Target tab was not found.');
    }
    const tab = tabs[tabIdx];
    const startPos = tab.sections.length;
    const imported = parsed.sections.map((s, i) => ({
      ...s,
      position: startPos + i,
    }));
    tabs[tabIdx] = {
      ...tab,
      sections: [...tab.sections, ...imported],
    };
    return tabs;
  }

  if (parsed.kind === 'links' && parsed.links?.length) {
    const targetTabId = options.targetTabId || tabs[0]?.id;
    if (!targetTabId) {
      throw new Error('This space has no tabs to import links into.');
    }
    const tabIdx = tabs.findIndex((t) => t.id === targetTabId);
    if (tabIdx === -1) {
      throw new Error('Target tab was not found.');
    }
    const tab = tabs[tabIdx];
    const targetSectionId = options.targetSectionId || tab.sections[0]?.id;
    if (!targetSectionId) {
      throw new Error('The target tab has no sections to import links into.');
    }
    const secIdx = tab.sections.findIndex((s) => s.id === targetSectionId);
    if (secIdx === -1) {
      throw new Error('Target section was not found.');
    }
    const section = tab.sections[secIdx];
    const nextSections = [...tab.sections];
    nextSections[secIdx] = {
      ...section,
      links: [...(section.links || []), ...parsed.links],
    };
    tabs[tabIdx] = { ...tab, sections: nextSections };
    return tabs;
  }

  throw new Error('Nothing to import from this file.');
};

export const describeContentTransfer = (parsed: ParsedContentTransfer): string => {
  if (parsed.kind === 'tabs' && parsed.tabs) {
    const n = parsed.tabs.length;
    const sections = parsed.tabs.reduce((sum, t) => sum + (t.sections?.length || 0), 0);
    const links = parsed.tabs.reduce(
      (sum, t) => sum + (t.sections || []).reduce((s, sec) => s + (sec.links?.length || 0), 0),
      0
    );
    return `${n} tab${n === 1 ? '' : 's'} (${sections} section${sections === 1 ? '' : 's'}, ${links} link${links === 1 ? '' : 's'})`;
  }
  if (parsed.kind === 'sections' && parsed.sections) {
    const n = parsed.sections.length;
    const links = parsed.sections.reduce((sum, s) => sum + (s.links?.length || 0), 0);
    return `${n} section${n === 1 ? '' : 's'} (${links} link${links === 1 ? '' : 's'})`;
  }
  if (parsed.kind === 'links' && parsed.links) {
    const n = parsed.links.length;
    return `${n} link${n === 1 ? '' : 's'}`;
  }
  return 'Empty import';
};
