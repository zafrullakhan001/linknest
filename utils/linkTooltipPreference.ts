export type LinkTooltipStyle = 'rich' | 'classic';

export function normalizeLinkTooltipStyle(value?: string | null): LinkTooltipStyle {
  return value === 'rich' ? 'rich' : 'classic';
}
