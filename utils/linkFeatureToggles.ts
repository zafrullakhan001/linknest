import { hasVisibleRichText, stripHtmlToPlainText } from './richTextDisplay';

export function isNotesTooltipEnabled(link: {
  notesEnabled?: boolean;
  notes?: string;
  tooltip?: string;
}): boolean {
  if (typeof link.notesEnabled === 'boolean') return link.notesEnabled;
  return hasVisibleRichText(link.notes) || hasVisibleRichText(link.tooltip);
}

export function isInfoContentEnabled(link: {
  richTextEnabled?: boolean;
  richTextContent?: string;
}): boolean {
  if (typeof link.richTextEnabled === 'boolean') return link.richTextEnabled;
  return hasVisibleRichText(link.richTextContent);
}

export function shouldShowLinkNotes(link: {
  notesEnabled?: boolean;
  notes?: string;
  tooltip?: string;
}): boolean {
  return isNotesTooltipEnabled(link) && hasVisibleRichText(link.notes);
}

export function shouldOpenInfoDialog(link: {
  richTextEnabled?: boolean;
  richTextContent?: string;
}): boolean {
  return isInfoContentEnabled(link) && hasVisibleRichText(link.richTextContent);
}

export function isInfoOpenLinkShown(link: { infoShowOpenLink?: boolean }): boolean {
  return link.infoShowOpenLink !== false;
}

export function linkHoverTitle(link: { notesEnabled?: boolean; notes?: string; tooltip?: string }, fallback: string): string {
  if (!isNotesTooltipEnabled(link)) return fallback;
  return stripHtmlToPlainText(link.tooltip || '') || fallback;
}

/** Rich HTML for a custom hover tooltip, or empty when the native/plain title should be used. */
export function linkHoverTooltipHtml(link: { notesEnabled?: boolean; notes?: string; tooltip?: string }): string {
  if (!isNotesTooltipEnabled(link)) return '';
  return hasVisibleRichText(link.tooltip) ? (link.tooltip || '') : '';
}
