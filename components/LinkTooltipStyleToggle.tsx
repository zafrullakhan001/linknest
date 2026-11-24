import React from 'react';
import { type LinkTooltipStyle } from '../utils/linkTooltipPreference';

interface LinkTooltipStyleToggleProps {
  value: LinkTooltipStyle;
  onChange: (style: LinkTooltipStyle) => void;
  compact?: boolean;
  className?: string;
}

export const LinkTooltipStyleToggle: React.FC<LinkTooltipStyleToggleProps> = ({
  value,
  onChange,
  compact = false,
  className = '',
}) => {
  const optionClass = (option: LinkTooltipStyle) =>
    `px-2 py-1 text-[11px] font-medium rounded-md transition-all ${
      value === option
        ? option === 'classic'
          ? 'bg-yellow-400 text-black shadow-sm'
          : 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
    }`;

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {!compact && (
        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
          Tooltip
        </span>
      )}
      <div
        className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5"
        role="group"
        aria-label="Link tooltip style"
      >
        <button
          type="button"
          className={optionClass('classic')}
          aria-pressed={value === 'classic'}
          title="Native Windows / browser tooltip (plain text)"
          onClick={() => onChange('classic')}
        >
          Yellow
        </button>
        <button
          type="button"
          className={optionClass('rich')}
          aria-pressed={value === 'rich'}
          title="Rich text tooltip (fonts and colors)"
          onClick={() => onChange('rich')}
        >
          Rich
        </button>
      </div>
    </div>
  );
};
