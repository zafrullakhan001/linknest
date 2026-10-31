import { hasVisibleRichText, stripHtmlToPlainText } from './richTextDisplay';
import { isLinkInfoTopicVisible } from './linkInfoTopics';

function hasVideoUrl(url?: string | null): boolean {
  return typeof url === 'string' && url.trim() !== '';
}

function topicHasViewerContent(t?: { html?: string; hidden?: boolean } | null): boolean {
  return isLinkInfoTopicVisible(t) && hasVisibleRichText(t?.html);
}

export function isNotesTooltipEnabled(link: {
  notesEnabled?: boolean;
  notes?: string;
  notesTopics?: Array<{ html?: string; hidden?: boolean }> | null;
  tooltip?: string;
  notesVideoUrl?: string;
}): boolean {
  if (typeof link.notesEnabled === 'boolean') return link.notesEnabled;
  const hasTopics = Array.isArray(link.notesTopics) && link.notesTopics.some(topicHasViewerContent);
  return hasTopics || hasVisibleRichText(link.notes) || hasVisibleRichText(link.tooltip) || hasVideoUrl(link.notesVideoUrl);
}

export function isInfoContentEnabled(link: {
  richTextEnabled?: boolean;
  richTextContent?: string;
  infoTopics?: Array<{ html?: string; hidden?: boolean }> | null;
  infoVideoUrl?: string;
}): boolean {
  if (typeof link.richTextEnabled === 'boolean') return link.richTextEnabled;
  if (Array.isArray(link.infoTopics) && link.infoTopics.some(topicHasViewerContent)) {
    return true;
  }
  return hasVisibleRichText(link.richTextContent) || hasVideoUrl(link.infoVideoUrl);
}

export function shouldShowLinkNotes(link: {
  notesEnabled?: boolean;
  notes?: string;
  notesTopics?: Array<{ html?: string; hidden?: boolean }> | null;
  tooltip?: string;
  notesVideoUrl?: string;
}): boolean {
  const hasTopics = Array.isArray(link.notesTopics) && link.notesTopics.some(topicHasViewerContent);
  return isNotesTooltipEnabled(link) && (hasTopics || hasVisibleRichText(link.notes) || hasVideoUrl(link.notesVideoUrl));
}

export function shouldOpenInfoDialog(link: {
  richTextEnabled?: boolean;
  richTextContent?: string;
  infoTopics?: Array<{ html?: string; hidden?: boolean }> | null;
  infoVideoUrl?: string;
}): boolean {
  const hasTopics = Array.isArray(link.infoTopics) && link.infoTopics.some(topicHasViewerContent);
  return (
    isInfoContentEnabled(link) &&
    (hasTopics || hasVisibleRichText(link.richTextContent) || hasVideoUrl(link.infoVideoUrl))
  );
}

export function isInfoOpenLinkShown(link: { infoShowOpenLink?: boolean }): boolean {
  return link.infoShowOpenLink !== false;
}

export function linkHoverTitle(link: { notesEnabled?: boolean; notes?: string; tooltip?: string; notesVideoUrl?: string }, fallback: string): string {
  if (!isNotesTooltipEnabled(link)) return fallback;
  return stripHtmlToPlainText(link.tooltip || '') || fallback;
}

/** Rich HTML for a custom hover tooltip, or empty when the native/plain title should be used. */
export function linkHoverTooltipHtml(link: { notesEnabled?: boolean; notes?: string; tooltip?: string; notesVideoUrl?: string }): string {
  if (!isNotesTooltipEnabled(link)) return '';
  return hasVisibleRichText(link.tooltip) ? (link.tooltip || '') : '';
}
