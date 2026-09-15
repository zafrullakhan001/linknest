import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  SECTION_BG_PRESETS,
  SectionBackgroundDecoration,
  buildGradientCss,
  clearBackgroundDecoration,
  colorInputValue,
  decorationFromPreset,
  evenlySpacedPositions,
  normalizeHexColor,
  sanitizeGradientColors,
} from '../utils/sectionBackgroundColor';

type Props = {
  value: SectionBackgroundDecoration;
  /** Inherited tab decoration shown when section has no override (optional label). */
  inheritedHint?: string;
  label?: string;
  onChange: (next: SectionBackgroundDecoration) => void;
  compact?: boolean;
};

const GRADIENT_TYPES: Array<'linear' | 'radial'> = ['linear', 'radial'];

export const SectionBackgroundPicker: React.FC<Props> = ({
  value,
  inheritedHint,
  label = 'Bg',
  onChange,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const colors = sanitizeGradientColors(value.backgroundGradientColors);
  const gradientOn = !!value.backgroundGradientEnabled && colors.length >= 2;
  const previewCss =
    buildGradientCss(value) ||
    normalizeHexColor(value.backgroundColor) ||
    'transparent';
  const hasCustom = !!(normalizeHexColor(value.backgroundColor) || gradientOn);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 340;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const top = Math.min(rect.bottom + 6, window.innerHeight - 24);
      setPos({ top, left });
    };
    update();
    // Use click (not mousedown) so preset button onClick always fires first.
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const applyDecoration = (next: SectionBackgroundDecoration) => {
    onChange({
      backgroundColor: next.backgroundColor,
      backgroundGradientEnabled: next.backgroundGradientEnabled ?? false,
      backgroundGradientColors: next.backgroundGradientColors,
      backgroundGradientDirection: next.backgroundGradientDirection,
      backgroundGradientType: next.backgroundGradientType,
      backgroundGradientColorPositions: next.backgroundGradientColorPositions,
    });
  };

  const setSolid = (hex: string) => {
    const normalized = normalizeHexColor(hex) ?? undefined;
    applyDecoration({
      backgroundColor: normalized,
      backgroundGradientEnabled: false,
      backgroundGradientColors: undefined,
      backgroundGradientDirection: undefined,
      backgroundGradientType: undefined,
      backgroundGradientColorPositions: undefined,
    });
  };

  const enableGradient = (enabled: boolean) => {
    if (!enabled) {
      applyDecoration({
        ...value,
        backgroundGradientEnabled: false,
      });
      return;
    }
    const nextColors =
      colors.length >= 2
        ? colors
        : [
            normalizeHexColor(value.backgroundColor) || '#3B82F6',
            '#8B5CF6',
          ];
    applyDecoration({
      ...value,
      backgroundColor: nextColors[0],
      backgroundGradientEnabled: true,
      backgroundGradientType: value.backgroundGradientType || 'linear',
      backgroundGradientDirection: value.backgroundGradientDirection ?? 135,
      backgroundGradientColors: nextColors,
      backgroundGradientColorPositions: evenlySpacedPositions(nextColors.length),
    });
  };

  const updateColorAt = (index: number, hex: string) => {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return;
    const next = [...(colors.length ? colors : ['#3B82F6', '#8B5CF6'])];
    next[index] = normalized;
    applyDecoration({
      ...value,
      backgroundGradientEnabled: true,
      backgroundGradientColors: next,
      backgroundColor: next[0],
      backgroundGradientColorPositions: evenlySpacedPositions(next.length),
    });
  };

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby={titleId}
          className="fixed z-[9999] w-[340px] max-h-[min(70vh,560px)] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl p-3 space-y-3"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="flex items-center justify-between gap-2">
            <h4 id={titleId} className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Section background
            </h4>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-red-500"
              onClick={() => {
                applyDecoration(clearBackgroundDecoration());
                setOpen(false);
              }}
            >
              Clear
            </button>
          </div>
          {inheritedHint ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{inheritedHint}</p>
          ) : null}
          <p className="text-[11px] text-amber-700 dark:text-amber-300/90 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-2 py-1.5">
            Custom colors apply in light mode only. Dark mode keeps the default dark section style.
          </p>

          <div
            className="h-12 rounded-lg border border-slate-200 dark:border-slate-600"
            style={{ background: previewCss === 'transparent' ? undefined : previewCss }}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Solid color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={colorInputValue(value.backgroundColor)}
                onChange={(e) => setSolid(e.target.value)}
                className="w-10 h-9 rounded border border-slate-300 dark:border-slate-600 cursor-pointer"
              />
              <input
                type="text"
                value={value.backgroundColor || ''}
                onChange={(e) => setSolid(e.target.value)}
                placeholder="#94A3B8"
                className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-2 py-1.5 text-xs"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={!!value.backgroundGradientEnabled}
              onChange={(e) => enableGradient(e.target.checked)}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Enable gradient
          </label>

          {value.backgroundGradientEnabled ? (
            <div className="space-y-2 border-t border-slate-100 dark:border-slate-700 pt-2">
              <div className="flex gap-1">
                {GRADIENT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => applyDecoration({ ...value, backgroundGradientType: t })}
                    className={`flex-1 px-2 py-1.5 text-[11px] font-semibold rounded-lg border ${
                      (value.backgroundGradientType || 'linear') === t
                        ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200'
                        : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {(value.backgroundGradientType || 'linear') === 'linear' ? (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Angle ({value.backgroundGradientDirection ?? 135}°)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={value.backgroundGradientDirection ?? 135}
                    onChange={(e) =>
                      applyDecoration({ ...value, backgroundGradientDirection: Number(e.target.value) })
                    }
                    className="w-full accent-brand-600"
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                {(colors.length >= 2 ? colors : ['#3B82F6', '#8B5CF6']).slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={colorInputValue(c)}
                      onChange={(e) => updateColorAt(i, e.target.value)}
                      className="w-8 h-8 rounded border border-slate-300 dark:border-slate-600 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-500">Stop {i + 1}</span>
                  </div>
                ))}
                {(colors.length >= 2 ? colors : ['#3B82F6', '#8B5CF6']).length < 5 ? (
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-brand-600 dark:text-brand-400"
                    onClick={() => {
                      const base = colors.length >= 2 ? colors : ['#3B82F6', '#8B5CF6'];
                      const next = [...base, '#EC4899'];
                      applyDecoration({
                        ...value,
                        backgroundGradientEnabled: true,
                        backgroundGradientColors: next,
                        backgroundGradientColorPositions: evenlySpacedPositions(next.length),
                      });
                    }}
                  >
                    + Add color
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Style presets
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-0.5">
              {SECTION_BG_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyDecoration(decorationFromPreset(preset));
                  }}
                  className="px-2 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200/80 dark:border-slate-600 overflow-hidden"
                  style={{
                    background: `linear-gradient(${preset.direction}deg, ${preset.colors.join(', ')})`,
                    color: preset.textColor,
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`cursor-pointer rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 ${
          compact ? 'p-1' : 'p-1.5'
        }`}
        title="Section / tab background (presets & gradient)"
      >
        <span
          className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} rounded border border-slate-300 dark:border-slate-600 shrink-0`}
          style={{
            background: hasCustom && previewCss !== 'transparent' ? previewCss : '#94a3b8',
          }}
        />
        {!compact ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {label}
            {hasCustom ? '' : inheritedHint ? '*' : ''}
          </span>
        ) : null}
      </button>
      {panel}
    </>
  );
};
