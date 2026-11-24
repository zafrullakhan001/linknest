import React, { useEffect, useRef, useState } from 'react';
import { FaCheck, FaCopy, FaExternalLinkAlt } from 'react-icons/fa';
import { formatMonitorTargetFull, getMonitorLaunchUrl } from '../utils/monitorDisplay';

type MonitorTargetLabelProps = {
    target: string;
    port?: number | null;
    /** tile = card body; inline = status bar; table = grid row; compact = narrow capsule row */
    variant?: 'tile' | 'inline' | 'table' | 'compact';
    className?: string;
    style?: React.CSSProperties;
    as?: 'span' | 'code' | 'div';
};

const VARIANT_CLASS: Record<NonNullable<MonitorTargetLabelProps['variant']>, string> = {
    tile: 'block flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden',
    inline: 'block max-w-[200px] sm:max-w-[320px] min-w-0 truncate whitespace-nowrap overflow-hidden',
    table: 'block max-w-[280px] min-w-0 truncate whitespace-nowrap overflow-hidden',
    compact: 'block max-w-[120px] min-w-0 truncate whitespace-nowrap overflow-hidden',
};

const ICON_SIZE: Record<NonNullable<MonitorTargetLabelProps['variant']>, number> = {
    tile: 11,
    inline: 10,
    table: 11,
    compact: 8,
};

export const MonitorTargetLabel: React.FC<MonitorTargetLabelProps> = ({
    target,
    port,
    variant = 'tile',
    className = '',
    style,
    as: Tag = 'span',
}) => {
    const full = formatMonitorTargetFull(target, port);
    const launchUrl = getMonitorLaunchUrl(target, port);
    const [copied, setCopied] = useState(false);
    const copiedTimer = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (copiedTimer.current != null) {
                window.clearTimeout(copiedTimer.current);
            }
        };
    }, []);

    const stopCardClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    const handleCopy = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!full) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(full);
            } else {
                const ta = document.createElement('textarea');
                ta.value = full;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            setCopied(true);
            if (copiedTimer.current != null) {
                window.clearTimeout(copiedTimer.current);
            }
            copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
        } catch {
            // Ignore clipboard errors
        }
    };

    const handleLaunch = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!launchUrl) return;
        window.open(launchUrl, '_blank', 'noopener,noreferrer');
    };

    const iconSize = ICON_SIZE[variant];
    const actionBtnClass =
        'p-1 rounded-md hover:bg-black/20 dark:hover:bg-white/15 transition-colors opacity-70 hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-current';

    return (
        <div className={`flex items-center gap-0.5 min-w-0 ${variant === 'tile' || variant === 'table' ? 'w-full' : ''}`}>
            <Tag
                className={`font-mono ${VARIANT_CLASS[variant]} ${className}`}
                title={full}
                style={style}
            >
                {full}
            </Tag>
            {full && (
                <div className="flex items-center flex-shrink-0 -mr-0.5">
                    <button
                        type="button"
                        onClick={handleCopy}
                        onMouseDown={stopCardClick}
                        title={copied ? 'Copied' : 'Copy URL'}
                        aria-label={copied ? 'Copied' : 'Copy URL'}
                        className={actionBtnClass}
                    >
                        {copied ? <FaCheck size={iconSize} /> : <FaCopy size={iconSize} />}
                    </button>
                    {launchUrl && (
                        <button
                            type="button"
                            onClick={handleLaunch}
                            onMouseDown={stopCardClick}
                            title="Launch URL"
                            aria-label="Launch URL"
                            className={actionBtnClass}
                        >
                            <FaExternalLinkAlt size={iconSize} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
