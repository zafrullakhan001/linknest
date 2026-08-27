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
                {showProbeBadges ? <UrlProbeBadges url={value} excluded={excluded} /> : null}
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
            {showIgnoreCheckbox && isHttpUrl && (isAdmin || excluded) && (
                <label
                    className={`mt-2 flex items-start gap-2 select-none ${canToggle ? 'cursor-pointer' : 'cursor-default'}`}
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
            {exceptionError && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{exceptionError}</p>
            )}
            {blocking && (
                <UrlFormDiagnostics diagnosis={diagnosis} listId={issuesId} onApplyFix={onChange} />
            )}
        </div>
    );
};
