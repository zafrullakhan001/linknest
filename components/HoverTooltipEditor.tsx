import React from 'react';
import { SelectableRichTextEditor } from './SelectableRichTextEditor';
import { MobileRichTextEditor } from './MobileRichTextEditor';
import { stripHtmlToPlainText } from '../utils/richTextDisplay';
import { normalizeLinkTooltipStyle, type LinkTooltipStyle } from '../utils/linkTooltipPreference';

interface HoverTooltipEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: 'desktop' | 'mobile';
  tooltipStyle?: LinkTooltipStyle | string | null;
}

const textareaClass =
  'w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all min-h-[80px] resize-y';

export const HoverTooltipEditor: React.FC<HoverTooltipEditorProps> = ({
  value,
  onChange,
  placeholder = 'Text shown on hover...',
  variant = 'desktop',
  tooltipStyle,
}) => {
  const style = normalizeLinkTooltipStyle(tooltipStyle);

  if (style === 'classic') {
    return (
      <textarea
        value={stripHtmlToPlainText(value || '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={textareaClass}
        rows={3}
      />
    );
  }

  if (variant === 'mobile') {
    return (
      <MobileRichTextEditor
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
      />
    );
  }

  return (
    <SelectableRichTextEditor
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder}
      className="min-h-[80px]"
    />
  );
};
