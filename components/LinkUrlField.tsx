import React, { useId, useMemo, useState } from 'react';
import { FaCheck, FaCopy } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { copyTextToClipboard } from '../services/shortUrlService';
import {
    coveringLinkCheckException,
    isUrlExcludedFromLinkCheck,
    parseExceptionsSetting,
    persistUrlLinkCheckException,
    urlIsExactLinkCheckException,
} from '../services/linkCheckExceptionsService';
import { isHttpOrHttpsUrl } from '../utils/urlDisplay';
import { diagnoseLinkUrl, hasBlockingUrlIssues } from '../utils/urlDiagnostics';
import {
    BROKEN_STATUS_LABEL_MAX_LEN,
    BROKEN_STATUS_NOTE_MAX_LEN,
    BROKEN_STATUS_PRESETS,
    type BrokenStatusFontStyle,
    type BrokenStatusFontWeight,
    type BrokenStatusTone,
    getBrokenBadgeTextStyle,
    normalizeBrokenStatusTone,
} from '../utils/brokenStatusDisplay';
import { BrandingFontFamilyOptions } from './BrandingFontFamilyOptions';
import { UrlFormDiagnostics } from './UrlFormDiagnostics';
import { UrlProbeBadges } from './UrlProbeBadges';

const COPY_BUTTON_MIN_LENGTH = 40;

export interface LinkUrlFieldProps {
    value: string;
    onChange: (value: string) => void;
    label?: React.ReactNode;
    placeholder?: string;
    helpText?: string;
    inputType?: 'text' | 'url';
    required?: boolean;
    /** Space link editor shows ignore-from-check-links; monitor form hides it. */
    showIgnoreCheckbox?: boolean;
    /** Per-link: always show/open the short URL even if the space uses original URLs. */
    showForceShortUrl?: boolean;
    forceShortUrl?: boolean;
    onForceShortUrlChange?: (next: boolean) => void;
    /** Per-link custom badge text when health status is broken. */
    showBrokenStatusLabel?: boolean;
    brokenStatusLabel?: string;
    onBrokenStatusLabelChange?: (value: string) => void;
    brokenStatusNote?: string;
    onBrokenStatusNoteChange?: (value: string) => void;
    brokenStatusTone?: BrokenStatusTone | '';
    onBrokenStatusToneChange?: (value: BrokenStatusTone | '') => void;
    brokenStatusExpected?: boolean;
    onBrokenStatusExpectedChange?: (next: boolean) => void;
    brokenStatusManual?: boolean;
    onBrokenStatusManualChange?: (next: boolean) => void;
    brokenStatusFontColor?: string;
    onBrokenStatusFontColorChange?: (value: string) => void;
    brokenStatusFontWeight?: BrokenStatusFontWeight | '';
    onBrokenStatusFontWeightChange?: (value: BrokenStatusFontWeight | '') => void;
    brokenStatusFontStyle?: BrokenStatusFontStyle | '';
    onBrokenStatusFontStyleChange?: (value: BrokenStatusFontStyle | '') => void;
    brokenStatusFontFamily?: string;
    onBrokenStatusFontFamilyChange?: (value: string) => void;
    showCopyButton?: boolean;
    inputClassName?: string;
}

export const LinkUrlField: React.FC<LinkUrlFieldProps> = ({
    value,
    onChange,
    label,
    placeholder = 'https://…  http://…  ssh://user@host:22  or vnc://host:5900',
    helpText,
    inputType = 'text',
    required = false,
    showIgnoreCheckbox = true,
    showForceShortUrl = false,
    forceShortUrl = false,
    onForceShortUrlChange,
    showBrokenStatusLabel = false,
    brokenStatusLabel = '',
    onBrokenStatusLabelChange,
    brokenStatusNote = '',
    onBrokenStatusNoteChange,
    brokenStatusTone = '',
    onBrokenStatusToneChange,
    brokenStatusExpected = false,
    onBrokenStatusExpectedChange,
    brokenStatusManual = false,
    onBrokenStatusManualChange,
    brokenStatusFontColor = '',
    onBrokenStatusFontColorChange,
    brokenStatusFontWeight = '',
    onBrokenStatusFontWeightChange,
    brokenStatusFontStyle = '',
    onBrokenStatusFontStyleChange,
    brokenStatusFontFamily = '',
    onBrokenStatusFontFamilyChange,
    showCopyButton = false,
    inputClassName,
}) => {
    const diagnosis = useMemo(() => diagnoseLinkUrl(value), [value]);
    const blocking = hasBlockingUrlIssues(diagnosis);
    const issuesId = useId();
    const { settings, patchSettings } = useSettings();
    const { user } = useAuth();
    const isAdmin = !!user?.is_admin;
    const [savingException, setSavingException] = useState(false);
    const [exceptionError, setExceptionError] = useState('');
    const [copied, setCopied] = useState(false);

    const exceptions = useMemo(
        () => parseExceptionsSetting(settings.link_check_exceptions),
        [settings.link_check_exceptions]
    );
    const trimmedUrl = (value || '').trim();
    const isHttpUrl = /^https?:\/\//i.test(trimmedUrl);
    const excluded = isHttpUrl && isUrlExcludedFromLinkCheck(trimmedUrl, exceptions);
    const exactException = isHttpUrl && urlIsExactLinkCheckException(trimmedUrl, exceptions);
    const coveringPattern = excluded ? coveringLinkCheckException(trimmedUrl, exceptions) : null;
    const canToggle = isAdmin && isHttpUrl && !savingException && (exactException || !excluded || !coveringPattern);
    const showProbeBadges = isHttpOrHttpsUrl(trimmedUrl);
    const shouldShowCopy = showCopyButton && trimmedUrl.length >= COPY_BUTTON_MIN_LENGTH;
    const activeTone = normalizeBrokenStatusTone(brokenStatusTone || null) || '';

    const handleIgnoreChange = async (next: boolean) => {
        if (!isAdmin || !isHttpUrl) return;
        if (!next && !exactException) return;
        setSavingException(true);
        setExceptionError('');
        try {
            const stored = await persistUrlLinkCheckException(settings.link_check_exceptions, trimmedUrl, next);
            patchSettings({ link_check_exceptions: stored });
        } catch (err: unknown) {
            setExceptionError(err instanceof Error ? err.message : 'Failed to update Link Check Exceptions');
        } finally {
            setSavingException(false);
        }
    };

    const handleCopy = async () => {
        if (!trimmedUrl) return;
        const ok = await copyTextToClipboard(trimmedUrl);
        if (ok) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        }
    };

    const applyPreset = (preset: string) => {
        onBrokenStatusLabelChange?.(preset);
        if (!activeTone) {
            onBrokenStatusToneChange?.('amber');
        }
        if (!brokenStatusExpected) {
            onBrokenStatusExpectedChange?.(true);
        }
    };

    const defaultInputClass = blocking
        ? 'border-amber-400 dark:border-amber-600 focus:border-amber-500 focus:ring-amber-500/40'
        : 'border-slate-200 dark:border-slate-700 focus:border-brand-500 focus:ring-brand-500/50';

    const resolvedInputClass =
        inputClassName ??
        `w-full bg-slate-50 dark:bg-slate-900 border-2 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 transition-all font-mono ${defaultInputClass}`;

    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                {label ?? (
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        URL
                    </label>
                )}
                {showProbeBadges ? <UrlProbeBadges url={value} excluded={excluded} onAdoptUrl={onChange} /> : null}
            </div>
            <div className="flex items-stretch gap-2 min-w-0">
                <input
                    type={inputType}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    required={required}
                    aria-invalid={blocking}
                    aria-describedby={blocking ? issuesId : undefined}
                    className={`${resolvedInputClass} min-w-0 flex-1 overflow-hidden text-ellipsis`}
                    style={{ textOverflow: 'ellipsis' }}
                    title={shouldShowCopy ? trimmedUrl : undefined}
                />
                {shouldShowCopy ? (
                    <button
                        type="button"
                        onClick={() => void handleCopy()}
                        className={`shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                            copied
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                : 'border-cyan-200 bg-white/90 text-cyan-800 hover:bg-cyan-50'
                        }`}
                        title={copied ? 'Copied' : 'Copy full URL'}
                        aria-label={copied ? 'Copied URL' : 'Copy full URL'}
                    >
                        {copied ? <FaCheck size={12} aria-hidden /> : <FaCopy size={12} aria-hidden />}
                        <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                ) : null}
            </div>
            {helpText ? <p className="text-xs text-gray-600 mt-1">{helpText}</p> : null}
            {((showIgnoreCheckbox && isHttpUrl && (isAdmin || excluded)) || showForceShortUrl) && (
                <div className="mt-2 flex flex-wrap items-start gap-x-6 gap-y-2">
                    {showIgnoreCheckbox && isHttpUrl && (isAdmin || excluded) && (
                        <label
                            className={`flex items-start gap-2 select-none min-w-[12rem] flex-1 ${canToggle ? 'cursor-pointer' : 'cursor-default'}`}
                            title={
                                !isAdmin
                                    ? 'This URL is on Link Check Exceptions. Ask an admin to change it.'
                                    : excluded && !exactException && coveringPattern
                                      ? `Covered by host exception "${coveringPattern}". Remove that pattern in Admin → Link Check Exceptions to check this URL.`
                                      : 'When checked, this URL is added to Link Check Exceptions and skipped by Check Links.'
                            }
                        >
                            <input
                                type="checkbox"
                                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:bg-slate-800 dark:border-slate-600"
                                checked={excluded}
                                disabled={!canToggle}
                                onChange={(e) => void handleIgnoreChange(e.target.checked)}
                            />
                            <span className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
                                Ignore from Check Links
                                <span className="block text-[11px] text-slate-500 dark:text-slate-500">
                                    {savingException
                                        ? 'Saving…'
                                        : excluded && !exactException && coveringPattern
                                          ? `Covered by exception: ${coveringPattern}`
                                          : 'Adds this URL to Link Check Exceptions so it is never marked Broken.'}
                                </span>
                            </span>
                        </label>
                    )}
                    {showForceShortUrl && (
                        <label
                            className="flex items-start gap-2 select-none min-w-[12rem] flex-1 cursor-pointer"
                            title="Always display and open this link as its short URL, even if the space uses original URLs."
                        >
                            <input
                                type="checkbox"
                                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 dark:bg-slate-800 dark:border-slate-600"
                                checked={forceShortUrl === true}
                                onChange={(e) => onForceShortUrlChange?.(e.target.checked)}
                            />
                            <span className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
                                Show short URL only
                                <span className="block text-[11px] text-slate-500 dark:text-slate-500">
                                    Force this link to display and open as its short URL.
                                </span>
                            </span>
                        </label>
                    )}
                </div>
            )}
            {showBrokenStatusLabel && isHttpUrl && (
                <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 p-2.5 space-y-2">
                    <div>
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Custom broken label</div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5">
                            Replace Broken with a lifecycle word, optionally show it without a failed check, and soften the badge.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {BROKEN_STATUS_PRESETS.map((preset) => {
                            const active = (brokenStatusLabel || '').trim().toLowerCase() === preset.toLowerCase();
                            return (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => applyPreset(preset)}
                                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors ${
                                        active
                                            ? 'border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-500 dark:bg-amber-900/40 dark:text-amber-200'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:text-amber-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                    }`}
                                >
                                    {preset}
                                </button>
                            );
                        })}
                    </div>
                    <input
                        type="text"
                        value={brokenStatusLabel || ''}
                        maxLength={BROKEN_STATUS_LABEL_MAX_LEN}
                        placeholder="e.g. Retired, Decommissioned"
                        onChange={(e) => onBrokenStatusLabelChange?.(e.target.value)}
                        className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                    />
                    <input
                        type="text"
                        value={brokenStatusNote || ''}
                        maxLength={BROKEN_STATUS_NOTE_MAX_LEN}
                        placeholder="Hover note (optional) — e.g. Cut over to HUB 2.0"
                        onChange={(e) => onBrokenStatusNoteChange?.(e.target.value)}
                        className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Badge color</span>
                        {(
                            [
                                { id: 'red' as const, label: 'Red', swatch: 'bg-red-500' },
                                { id: 'amber' as const, label: 'Amber', swatch: 'bg-amber-500' },
                                { id: 'slate' as const, label: 'Slate', swatch: 'bg-slate-400' },
                            ] as const
                        ).map((opt) => {
                            const isSelected = activeTone === opt.id;
                            return (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => onBrokenStatusToneChange?.(isSelected ? '' : opt.id)}
                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] border ${
                                        isSelected
                                            ? 'border-slate-400 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                                            : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'
                                    }`}
                                    title={`${opt.label} badge`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${opt.swatch}`} />
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="space-y-2 rounded-md border border-slate-200/80 dark:border-slate-700/80 bg-white/70 dark:bg-slate-900/50 p-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Label typography
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                                Color
                                <input
                                    type="color"
                                    value={/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(brokenStatusFontColor || '') ? brokenStatusFontColor! : '#ef4444'}
                                    onChange={(e) => onBrokenStatusFontColorChange?.(e.target.value)}
                                    className="h-7 w-9 rounded border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                                    title="Font color"
                                />
                                <button
                                    type="button"
                                    className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 text-[10px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    onClick={() => onBrokenStatusFontColorChange?.('')}
                                    title="Clear custom font color"
                                >
                                    Reset
                                </button>
                            </label>
                            <div className="inline-flex items-center gap-1">
                                <span className="text-[11px] text-slate-500">Weight</span>
                                {([
                                    { id: '' as const, label: 'Default' },
                                    { id: 'normal' as const, label: 'Normal' },
                                    { id: 'bold' as const, label: 'Bold' },
                                ]).map((opt) => (
                                    <button
                                        key={opt.id || 'default-weight'}
                                        type="button"
                                        onClick={() => onBrokenStatusFontWeightChange?.(opt.id)}
                                        className={`px-2 py-0.5 rounded-md text-[11px] border ${
                                            (brokenStatusFontWeight || '') === opt.id
                                                ? 'border-slate-400 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                                                : 'border-slate-200 dark:border-slate-600 text-slate-500'
                                        } ${opt.id === 'bold' ? 'font-bold' : 'font-normal'}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            <div className="inline-flex items-center gap-1">
                                <span className="text-[11px] text-slate-500">Style</span>
                                {([
                                    { id: '' as const, label: 'Default' },
                                    { id: 'normal' as const, label: 'Normal' },
                                    { id: 'italic' as const, label: 'Italic' },
                                ]).map((opt) => (
                                    <button
                                        key={opt.id || 'default-style'}
                                        type="button"
                                        onClick={() => onBrokenStatusFontStyleChange?.(opt.id)}
                                        className={`px-2 py-0.5 rounded-md text-[11px] border ${
                                            (brokenStatusFontStyle || '') === opt.id
                                                ? 'border-slate-400 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                                                : 'border-slate-200 dark:border-slate-600 text-slate-500'
                                        } ${opt.id === 'italic' ? 'italic' : 'not-italic'}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <label className="flex flex-col gap-1 min-w-0 max-w-sm">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">Font family (includes cursive)</span>
                            <select
                                value={brokenStatusFontFamily || 'inherit'}
                                onChange={(e) =>
                                    onBrokenStatusFontFamilyChange?.(
                                        e.target.value === 'inherit' ? '' : e.target.value
                                    )
                                }
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                                style={
                                    brokenStatusFontFamily
                                        ? { fontFamily: brokenStatusFontFamily }
                                        : undefined
                                }
                            >
                                <BrandingFontFamilyOptions />
                            </select>
                        </label>
                        <div
                            className="text-xs text-slate-600 dark:text-slate-300"
                            style={getBrokenBadgeTextStyle({
                                brokenStatusFontColor: brokenStatusFontColor || undefined,
                                brokenStatusFontWeight: brokenStatusFontWeight || undefined,
                                brokenStatusFontStyle: brokenStatusFontStyle || undefined,
                                brokenStatusFontFamily: brokenStatusFontFamily || undefined,
                            })}
                        >
                            Preview: {(brokenStatusLabel || '').trim() || 'Broken'}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                        <label className="flex items-start gap-2 select-none cursor-pointer min-w-[12rem]">
                            <input
                                type="checkbox"
                                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 dark:bg-slate-800 dark:border-slate-600"
                                checked={brokenStatusExpected === true}
                                onChange={(e) => {
                                    const next = e.target.checked;
                                    onBrokenStatusExpectedChange?.(next);
                                    if (next && !activeTone) onBrokenStatusToneChange?.('amber');
                                }}
                            />
                            <span className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
                                Expected downtime
                                <span className="block text-[11px] text-slate-500">
                                    Treat as intentional — excluded from surprise Broken stats.
                                </span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2 select-none cursor-pointer min-w-[12rem]">
                            <input
                                type="checkbox"
                                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:bg-slate-800 dark:border-slate-600"
                                checked={brokenStatusManual === true}
                                onChange={(e) => {
                                    const next = e.target.checked;
                                    onBrokenStatusManualChange?.(next);
                                    if (next && !activeTone) onBrokenStatusToneChange?.('amber');
                                }}
                            />
                            <span className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
                                Show without failed check
                                <span className="block text-[11px] text-slate-500">
                                    Display this label even if the URL still responds.
                                </span>
                            </span>
                        </label>
                    </div>
                </div>
            )}
            {exceptionError && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{exceptionError}</p>
            )}
            {blocking && (
                <UrlFormDiagnostics diagnosis={diagnosis} listId={issuesId} onApplyFix={onChange} />
            )}
        </div>
    );
};
