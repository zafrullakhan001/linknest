import { hasVisibleRichText } from './richTextDisplay';

export type LinkInfoTopic = {
  id: string;
  title: string;
  html: string;
  /** When true, topic is kept in the editor but hidden from viewers. */
  hidden?: boolean;
};

export function isLinkInfoTopicVisible(topic: { hidden?: boolean } | null | undefined): boolean {
  return topic?.hidden !== true;
}

/** Topics shown to viewers (dialogs / legacy mirror). Editors keep the full list. */
export function visibleLinkInfoTopics(topics: LinkInfoTopic[] | null | undefined): LinkInfoTopic[] {
  if (!Array.isArray(topics) || topics.length === 0) return [];
  return topics.filter(isLinkInfoTopicVisible);
}

export type LinkContentTopicKind = 'info' | 'notes' | 'maintenance';

const KIND_META: Record<
  LinkContentTopicKind,
  { defaultTitle: string; idPrefix: string; historyPath: string }
> = {
  info: { defaultTitle: 'Information', idPrefix: 'infotopic_', historyPath: 'info-revisions' },
  notes: { defaultTitle: 'Notes', idPrefix: 'notestopic_', historyPath: 'notes-revisions' },
  maintenance: { defaultTitle: 'Maintenance', idPrefix: 'mainttopic_', historyPath: 'maintenance-revisions' },
};

export function linkContentTopicKindMeta(kind: LinkContentTopicKind = 'info') {
  return KIND_META[kind] || KIND_META.info;
}

function newTopicId(prefix = 'infotopic_'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function stripToPlain(html: string): string {
  if (!html) return '';
  if (typeof document !== 'undefined') {
    const el = document.createElement('div');
    el.innerHTML = html;
    return (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim();
  }
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleFromLegacyHtml(html: string, fallback: string): string {
  const match = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (match) {
    const heading = stripToPlain(match[1]);
    if (heading && heading.length <= 80) return heading;
  }
  return fallback;
}

/** Normalize API/draft topics or fall back to a single topic from legacy HTML. */
export function normalizeLinkInfoTopics(
  topics?: LinkInfoTopic[] | null,
  legacyHtml?: string | null,
  defaultTitle = 'Information',
  idPrefix = 'infotopic_'
): LinkInfoTopic[] {
  if (Array.isArray(topics) && topics.length > 0) {
    return topics.map((t) => ({
      id: (t?.id && String(t.id).trim()) || newTopicId(idPrefix),
      title: (t?.title && String(t.title).trim()) || defaultTitle,
      html: typeof t?.html === 'string' ? t.html : '',
      hidden: t?.hidden === true,
    }));
  }
  const legacy = typeof legacyHtml === 'string' ? legacyHtml : '';
  if (!legacy.trim()) return [];
  return [{ id: newTopicId(idPrefix), title: titleFromLegacyHtml(legacy, defaultTitle), html: legacy, hidden: false }];
}

export function normalizeLinkContentTopics(
  kind: LinkContentTopicKind,
  topics?: LinkInfoTopic[] | null,
  legacyHtml?: string | null
): LinkInfoTopic[] {
  const meta = linkContentTopicKindMeta(kind);
  return normalizeLinkInfoTopics(topics, legacyHtml, meta.defaultTitle, meta.idPrefix);
}

export function createEmptyInfoTopic(title = 'New topic', idPrefix = 'infotopic_'): LinkInfoTopic {
  return { id: newTopicId(idPrefix), title, html: '', hidden: false };
}

/** Mirror visible topics into one HTML string for legacy columns / dismiss fingerprint. */
export function linkInfoTopicsToRichTextHtml(topics: LinkInfoTopic[], defaultTitle = 'Information'): string {
  const visible = visibleLinkInfoTopics(topics);
  if (!visible.length) return '';
  return visible
    .map((t) => {
      const title = (t.title || defaultTitle)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      return `<h2>${title}</h2>${t.html || ''}`;
    })
    .join('');
}

export function linkHasInfoTopics(link: {
  infoTopics?: LinkInfoTopic[] | null;
  richTextContent?: string | null;
  infoVideoUrl?: string | null;
}): boolean {
  const topics = visibleLinkInfoTopics(normalizeLinkInfoTopics(link.infoTopics, link.richTextContent));
  if (topics.some((t) => hasVisibleRichText(t.html))) return true;
  return typeof link.infoVideoUrl === 'string' && link.infoVideoUrl.trim() !== '';
}

export function demoInfoTopics(): LinkInfoTopic[] {
  return [
    {
      id: newTopicId(),
      title: 'Welcome',
      html: '<h2>Welcome to Information Content</h2><p>This is a <strong>sample rich text content</strong> that demonstrates various formatting options available in the editor.</p><h3>Key Features</h3><ul><li>Rich text formatting with <em>bold</em> and <u>underline</u></li><li>Lists and structured content</li><li>Links and embedded content</li><li>Custom styling options</li></ul>',
    },
    {
      id: newTopicId(),
      title: 'Contact',
      html: '<h3>Contact Information</h3><p>For more information, please contact:</p><p><strong>Support Team:</strong> support@company.com<br/><strong>Phone:</strong> +1-555-0100</p><blockquote><p>This is an important note or quote that stands out from the regular content.</p></blockquote>',
    },
  ];
}

export function demoNotesTopics(): LinkInfoTopic[] {
  return [
    {
      id: newTopicId('notestopic_'),
      title: 'Owner',
      html: '<p><strong>Owner Information:</strong> Team owner and escalation contacts.</p>',
    },
    {
      id: newTopicId('notestopic_'),
      title: 'Support',
      html: '<p><strong>Support Team:</strong> support@company.com</p>',
    },
  ];
}

export function demoMaintenanceTopics(): LinkInfoTopic[] {
  return [
    {
      id: newTopicId('mainttopic_'),
      title: 'Window',
      html: '<p>This link is under a maintenance window and is temporarily unavailable.</p>',
    },
    {
      id: newTopicId('mainttopic_'),
      title: 'Status',
      html: '<p>Expected return: TBD. Check back later or contact the owner.</p>',
    },
  ];
}
