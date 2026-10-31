import { shouldOpenInfoDialog } from './linkFeatureToggles';

const LINK_INFO_DISMISS_KEY = 'linknest_link_info_dismissed';

type LinkInfoDismissMap = Record<string, string>;

export type LinkInfoDismissFields = {
  id?: string;
  richTextEnabled?: boolean;
  richTextContent?: string;
  infoTopics?: Array<{ id?: string; title?: string; html?: string }> | null;
  infoVideoUrl?: string;
};

/** Short, stable fingerprint of info content so an edit re-prompts the dialog. */
export function linkInfoFingerprint(link: {
  richTextContent?: string;
  infoTopics?: Array<{ id?: string; title?: string; html?: string }> | null;
  infoVideoUrl?: string;
}): string {
  const topicsJson = Array.isArray(link.infoTopics)
    ? JSON.stringify(
        link.infoTopics.map((t) => ({
          id: t?.id || '',
          title: t?.title || '',
          html: t?.html || '',
        }))
      )
    : '';
  const content = typeof link.richTextContent === 'string' ? link.richTextContent : '';
  const video = typeof link.infoVideoUrl === 'string' ? link.infoVideoUrl.trim() : '';
  const raw = `${topicsJson}\n\0${content}\n\0${video}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function readDismissMap(): LinkInfoDismissMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LINK_INFO_DISMISS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: LinkInfoDismissMap = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeDismissMap(map: LinkInfoDismissMap): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LINK_INFO_DISMISS_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

export function isLinkInfoDismissed(link: LinkInfoDismissFields): boolean {
  if (!link.id) return false;
  const stored = readDismissMap()[link.id];
  if (!stored) return false;
  return stored === linkInfoFingerprint(link);
}

export function setLinkInfoDismissed(link: LinkInfoDismissFields, dismissed: boolean): void {
  if (!link.id) return;
  const map = readDismissMap();
  if (dismissed) {
    map[link.id] = linkInfoFingerprint(link);
  } else {
    delete map[link.id];
  }
  writeDismissMap(map);
}

/** True when info should interrupt a normal link click (not dismissed for current content). */
export function shouldPromptInfoDialog(link: LinkInfoDismissFields): boolean {
  return shouldOpenInfoDialog(link) && !isLinkInfoDismissed(link);
}
