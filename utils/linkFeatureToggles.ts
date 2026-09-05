import { hasVisibleRichText, stripHtmlToPlainText } from './richTextDisplay';

function hasVideoUrl(url?: string | null): boolean {
  return typeof url === 'string' && url.trim() !== '';
}

export function isNotesTooltipEnabled(link: {
  notesEnabled?: boolean;
  notes?: string;
  tooltip?: string;
  notesVideoUrl?: string;
}): boolean {
  if (typeof link.notesEnabled === 'boolean') return link.notesEnabled;
  return hasVisibleRichText(link.notes) || hasVisibleRichText(link.tooltip) || hasVideoUrl(link.notesVideoUrl);
}

export function isInfoContentEnabled(link: {
  richTextEnabled?: boolean;
  richTextContent?: string;
  infoVideoUrl?: string;
}): boolean {
  if (typeof link.richTextEnabled === 'boolean') return link.richTextEnabled;
  return hasVisibleRichText(link.richTextContent) || hasVideoUrl(link.infoVideoUrl);
}

export function shouldShowLinkNotes(link: {
  notesEnabled?: boolean;
  notes?: string;
  tooltip?: string;
  notesVideoUrl?: string;
}): boolean {
  return isNotesTooltipEnabled(link) && (hasVisibleRichText(link.notes) || hasVideoUrl(link.notesVideoUrl));
}

export function shouldOpenInfoDialog(link: {
  richTextEnabled?: boolean;
  richTextContent?: string;
  infoVideoUrl?: string;
}): boolean {
  return isInfoContentEnabled(link) && (hasVisibleRichText(link.richTextContent) || hasVideoUrl(link.infoVideoUrl));
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
