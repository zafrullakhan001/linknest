import React, { useState } from 'react';
import { POPULAR_EMOJIS } from '../types';
import type { BoxAlign } from './RichTextBoxedView';

export type BoxFontWeight = 'normal' | 'bold';
export type BoxFontSize = 'sm' | 'md' | 'lg';
export type BoxImportance = 'notes' | 'info' | 'tip' | 'important' | 'warning' | 'critical';

export interface RichTextBoxMeta {
  boxed?: boolean;
  boxTitle?: string;
  boxFooter?: string;
  boxHeaderAlign?: BoxAlign;
  boxFooterAlign?: BoxAlign;
  boxHeaderBg?: string;
  boxFooterBg?: string;
  boxBodyBg?: string;
  boxHeaderFontWeight?: BoxFontWeight;
  boxFooterFontWeight?: BoxFontWeight;
  boxHeaderFontSize?: BoxFontSize;
  boxFooterFontSize?: BoxFontSize;
  boxHeaderEmoji?: string;
  boxImportance?: BoxImportance;
}

const ALIGN_OPTIONS: { value: BoxAlign; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const WEIGHT_OPTIONS: { value: BoxFontWeight; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'bold', label: 'Bold' },
];

const SIZE_OPTIONS: { value: BoxFontSize; label: string }[] = [
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
];

export const IMPORTANCE_OPTIONS: {
  value: BoxImportance;
  label: string;
  emoji: string;
  bg: string;
  text: string;
  border: string;
}[] = [
  { value: 'notes', label: 'Notes', emoji: '📝', bg: '#f1f5f9', text: '#334155', border: '#cbd5e1' },
  { value: 'info', label: 'Information', emoji: 'ℹ️', bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  { value: 'tip', label: 'Tip', emoji: '💡', bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  { value: 'important', label: 'Important', emoji: '⭐', bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  { value: 'warning', label: 'Warning', emoji: '⚠️', bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  { value: 'critical', label: 'Critical', emoji: '🚨', bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
];

export function getImportanceStyle(importance?: BoxImportance | null) {
  return IMPORTANCE_OPTIONS.find((o) => o.value === importance) || IMPORTANCE_OPTIONS[0];
}

export const DEFAULT_HEADER_BG = '#e2e8f0';
export const DEFAULT_FOOTER_BG = '#f1f5f9';
export const DEFAULT_BODY_BG = '#ffffff';

function normalizeHexColor(value: string, fallback: string): string {
  const raw = (value || '').trim();
  if (!raw) return fallback;
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(withHash)) {
    return withHash.toLowerCase();
  }
  return fallback;
}

interface RichTextBoxOptionsFieldsProps {
  boxed: boolean;
  onBoxedChange: (boxed: boolean) => void;
  boxTitle: string;
  onBoxTitleChange: (value: string) => void;
  boxFooter: string;
  onBoxFooterChange: (value: string) => void;
  boxHeaderAlign: BoxAlign;
  onBoxHeaderAlignChange: (value: BoxAlign) => void;
  boxFooterAlign: BoxAlign;
  onBoxFooterAlignChange: (value: BoxAlign) => void;
  boxHeaderBg: string;
  onBoxHeaderBgChange: (value: string) => void;
  boxFooterBg: string;
  onBoxFooterBgChange: (value: string) => void;
  boxBodyBg: string;
  onBoxBodyBgChange: (value: string) => void;
  boxHeaderFontWeight: BoxFontWeight;
  onBoxHeaderFontWeightChange: (value: BoxFontWeight) => void;
  boxFooterFontWeight: BoxFontWeight;
  onBoxFooterFontWeightChange: (value: BoxFontWeight) => void;
  boxHeaderFontSize: BoxFontSize;
  onBoxHeaderFontSizeChange: (value: BoxFontSize) => void;
  boxFooterFontSize: BoxFontSize;
  onBoxFooterFontSizeChange: (value: BoxFontSize) => void;
  boxHeaderEmoji: string;
  onBoxHeaderEmojiChange: (value: string) => void;
  boxImportance: BoxImportance;
  onBoxImportanceChange: (value: BoxImportance) => void;
  accent?: 'emerald' | 'brand';
}

export function buildBoxMetaFromFields(fields: {
  boxed: boolean;
  boxTitle: string;
  boxFooter: string;
  boxHeaderAlign: BoxAlign;
  boxFooterAlign: BoxAlign;
  boxHeaderBg: string;
  boxFooterBg: string;
  boxBodyBg: string;
  boxHeaderFontWeight: BoxFontWeight;
  boxFooterFontWeight: BoxFontWeight;
  boxHeaderFontSize: BoxFontSize;
  boxFooterFontSize: BoxFontSize;
  boxHeaderEmoji: string;
  boxImportance: BoxImportance;
}): RichTextBoxMeta {
  if (!fields.boxed) {
    return { boxed: false };
  }
  return {
    boxed: true,
    boxTitle: fields.boxTitle.trim() || undefined,
    boxFooter: fields.boxFooter.trim() || undefined,
    boxHeaderAlign: fields.boxHeaderAlign || 'left',
    boxFooterAlign: fields.boxFooterAlign || 'left',
    boxHeaderBg: normalizeHexColor(fields.boxHeaderBg, DEFAULT_HEADER_BG),
    boxFooterBg: normalizeHexColor(fields.boxFooterBg, DEFAULT_FOOTER_BG),
    boxBodyBg: normalizeHexColor(fields.boxBodyBg, DEFAULT_BODY_BG),
    boxHeaderFontWeight: fields.boxHeaderFontWeight === 'normal' ? 'normal' : 'bold',
    boxFooterFontWeight: fields.boxFooterFontWeight === 'bold' ? 'bold' : 'normal',
    boxHeaderFontSize: fields.boxHeaderFontSize || 'md',
    boxFooterFontSize: fields.boxFooterFontSize || 'sm',
    boxHeaderEmoji: fields.boxHeaderEmoji.trim() || undefined,
    boxImportance: fields.boxImportance || 'notes',
  };
}

function SegmentedButtons<T extends string>({
  options,
  value,
  onChange,
  accent,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  accent: 'emerald' | 'brand';
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 min-w-[3.5rem] px-2 py-1.5 text-xs font-medium rounded-md border transition-colors ${
            value === opt.value
              ? accent === 'emerald'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-brand-600 text-white border-brand-600'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  inputClass,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputClass: string;
}) {
  const safe = normalizeHexColor(value, '#ffffff');
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safe.length === 4 ? `#${safe[1]}${safe[1]}${safe[2]}${safe[2]}${safe[3]}${safe[3]}` : safe}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="h-9 w-12 cursor-pointer rounded border border-slate-200 dark:border-slate-600 bg-transparent p-0.5 shrink-0"
          title={label}
        />
        <input
          type="text"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(normalizeHexColor(e.target.value, safe))}
          className={`${inputClass} font-mono`}
          placeholder="#ffffff"
        />
      </div>
    </div>
  );
}

export const RichTextBoxOptionsFields: React.FC<RichTextBoxOptionsFieldsProps> = ({
  boxed,
  onBoxedChange,
  boxTitle,
  onBoxTitleChange,
  boxFooter,
  onBoxFooterChange,
  boxHeaderAlign,
  onBoxHeaderAlignChange,
  boxFooterAlign,
  onBoxFooterAlignChange,
  boxHeaderBg,
  onBoxHeaderBgChange,
  boxFooterBg,
  onBoxFooterBgChange,
  boxBodyBg,
  onBoxBodyBgChange,
  boxHeaderFontWeight,
  onBoxHeaderFontWeightChange,
  boxFooterFontWeight,
  onBoxFooterFontWeightChange,
  boxHeaderFontSize,
  onBoxHeaderFontSizeChange,
  boxFooterFontSize,
  onBoxFooterFontSizeChange,
  boxHeaderEmoji,
  onBoxHeaderEmojiChange,
  boxImportance,
  onBoxImportanceChange,
  accent = 'emerald',
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const focusRing =
    accent === 'emerald'
      ? 'focus:border-emerald-500 focus:ring-emerald-500/40'
      : 'focus:border-brand-500 focus:ring-brand-500/40';
  const inputClass = `w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${focusRing}`;

  return (
    <div className="space-y-3 pt-1">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={boxed}
          onChange={(e) => onBoxedChange(e.target.checked)}
          className={`rounded border-slate-300 dark:border-slate-600 focus:ring-2 ${
            accent === 'emerald' ? 'text-emerald-600 focus:ring-emerald-500' : 'text-brand-600 focus:ring-brand-500'
          }`}
        />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Wrap in styled box
        </span>
      </label>

      {boxed && (
        <div className="space-y-3 pl-1 sm:pl-6 border-l-2 border-slate-200 dark:border-slate-700 ml-1 sm:ml-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Importance
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {IMPORTANCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onBoxImportanceChange(opt.value)}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-semibold transition-all"
                  style={{
                    background: boxImportance === opt.value ? opt.bg : undefined,
                    color: boxImportance === opt.value ? opt.text : undefined,
                    borderColor: boxImportance === opt.value ? opt.border : undefined,
                    boxShadow: boxImportance === opt.value ? `0 0 0 1px ${opt.border}` : undefined,
                  }}
                >
                  <span>{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr]">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Header emoji
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className="w-12 h-10 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xl flex items-center justify-center hover:border-brand-400 transition-colors"
                  title="Pick header emoji"
                >
                  {boxHeaderEmoji || '😀'}
                </button>
                {boxHeaderEmoji && (
                  <button
                    type="button"
                    onClick={() => onBoxHeaderEmojiChange('')}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-500 text-white text-[10px] leading-none"
                    title="Clear emoji"
                  >
                    ×
                  </button>
                )}
                {showEmojiPicker && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)} />
                    <div className="absolute top-full left-0 mt-2 w-64 h-56 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-20 flex flex-col overflow-hidden">
                      <div className="p-2 border-b border-slate-100 dark:border-slate-700">
                        <input
                          type="text"
                          value={boxHeaderEmoji}
                          onChange={(e) => onBoxHeaderEmojiChange(e.target.value)}
                          placeholder="Type emoji..."
                          className="w-full text-sm px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                          autoFocus
                        />
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-8 gap-1">
                        {POPULAR_EMOJIS.slice(0, 96).map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              onBoxHeaderEmojiChange(emoji);
                              setShowEmojiPicker(false);
                            }}
                            className="w-7 h-7 flex items-center justify-center text-base hover:bg-brand-100 dark:hover:bg-brand-900/30 rounded-md"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Header title
              </label>
              <input
                type="text"
                value={boxTitle}
                onChange={(e) => onBoxTitleChange(e.target.value)}
                placeholder="e.g. Architecture Guidelines"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Footer <span className="font-normal normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={boxFooter}
                onChange={(e) => onBoxFooterChange(e.target.value)}
                placeholder="Optional footer text"
                className={inputClass}
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/60 dark:bg-slate-900/40">
            <ColorField
              label="Content / body background"
              value={boxBodyBg || DEFAULT_BODY_BG}
              onChange={onBoxBodyBgChange}
              inputClass={inputClass}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/60 dark:bg-slate-900/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Header style
              </p>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Align</label>
                <SegmentedButtons options={ALIGN_OPTIONS} value={boxHeaderAlign} onChange={onBoxHeaderAlignChange} accent={accent} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Weight</label>
                <SegmentedButtons options={WEIGHT_OPTIONS} value={boxHeaderFontWeight} onChange={onBoxHeaderFontWeightChange} accent={accent} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Size</label>
                <SegmentedButtons options={SIZE_OPTIONS} value={boxHeaderFontSize} onChange={onBoxHeaderFontSizeChange} accent={accent} />
              </div>
              <ColorField label="Background" value={boxHeaderBg || DEFAULT_HEADER_BG} onChange={onBoxHeaderBgChange} inputClass={inputClass} />
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/60 dark:bg-slate-900/40">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Footer style
              </p>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Align</label>
                <SegmentedButtons options={ALIGN_OPTIONS} value={boxFooterAlign} onChange={onBoxFooterAlignChange} accent={accent} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Weight</label>
                <SegmentedButtons options={WEIGHT_OPTIONS} value={boxFooterFontWeight} onChange={onBoxFooterFontWeightChange} accent={accent} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Size</label>
                <SegmentedButtons options={SIZE_OPTIONS} value={boxFooterFontSize} onChange={onBoxFooterFontSizeChange} accent={accent} />
              </div>
              <ColorField label="Background" value={boxFooterBg || DEFAULT_FOOTER_BG} onChange={onBoxFooterBgChange} inputClass={inputClass} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
