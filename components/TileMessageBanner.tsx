import React, { useEffect, useState } from 'react';
import type { TileMessage } from '../types';
import { buildMessageTextStyle, messageMarqueeStyle, MARQUEE_SECONDS_DETAIL } from '../utils/messageStyle';

/** Strip markdown-ish formatting for the plain-text hover tooltip. */
const stripFormatting = (content: string): string => {
    let plainText = content.replace(/\*\*(.*?)\*\*/g, '$1');
    plainText = plainText.replace(/\*([^*]+)\*/g, '$1');
    plainText = plainText.replace(/_([^_]+)_/g, '$1');
    return plainText;
};

/** Render URLs as clickable links and **bold** / _italic_ as markup. */
const renderMessageContent = (content: string) => {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const boldPattern = /(\*\*)(.*?)\1/g;
    const italicPattern = /(?<!\*)_([^_]+)_(?!\*)/g;

    let processedContent = content;
    processedContent = processedContent.replace(boldPattern, '<strong>$2</strong>');
    processedContent = processedContent.replace(italicPattern, '<em>$1</em>');

    const parts = processedContent.split(urlPattern);

    return parts.map((part, index) => {
        if (urlPattern.test(part)) {
            return (
                <a
                    key={index}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-semibold hover:opacity-80 transition-opacity inherit"
                    style={{ color: 'inherit' }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {part}
                </a>
            );
        }
        return <span key={index} dangerouslySetInnerHTML={{ __html: part }} />;
    });
};

/** Animation class for a message animation type. */
const getMessageAnimationClass = (animationType?: string): string => {
    if (!animationType || animationType === 'rollover' || animationType === 'still') return '';
    return `message-animate-${animationType}`;
};

/** Animation duration in seconds for a message animation type. */
const getAnimationDuration = (animationType?: string): number => {
    if (animationType === 'still') return 0; // No animation duration for still
    const durations: Record<string, number> = {
        'flash': 1.5,
        'flip-horizontal': 2,
        'flip-vertical': 2,
        'bounce': 2,
        'pulse': 2,
        'shake': 1,
        'fade': 2,
        'slide': 3
    };
    return durations[animationType || ''] || 2;
};

/**
 * Cycle through messages one at a time for non-rollover animations.
 * Rollover messages render together as a marquee, so no cycling is needed for them.
 */
const useMessageRotation = (messages: TileMessage[]): number => {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        if (messages.length <= 1) {
            setIndex(0);
            return;
        }

        // Check if any message uses a non-rollover animation
        const hasNonRollover = messages.some(msg => msg.animationType && msg.animationType !== 'rollover');
        if (!hasNonRollover) {
            setIndex(0);
            return;
        }

        const currentMsg = messages[index];
        if (!currentMsg || index >= messages.length) {
            setIndex(0);
            return;
        }

        const animationType = currentMsg.animationType || 'rollover';
        const animationDuration = animationType === 'rollover' ? 0 : getAnimationDuration(animationType);
        const delayBefore = currentMsg.delayBefore || 0;
        // For 'still' messages with no delay, use a default display duration (3 seconds)
        const displayDuration = animationType === 'still' && delayBefore === 0 ? 3 : (animationDuration + delayBefore);
        const totalDuration = displayDuration * 1000;

        if (animationType === 'rollover' && totalDuration <= 0) {
            // Skip rollover messages immediately
            setIndex((prevIndex) => (prevIndex + 1) % messages.length);
            return;
        }

        const timer = setTimeout(() => {
            setIndex((prevIndex) => (prevIndex + 1) % messages.length);
        }, totalDuration);

        return () => clearTimeout(timer);
    }, [index, messages]);

    return index;
};

interface TileMessageBannerProps {
    messages: TileMessage[];
    /** Where this instance is rendered: above the tab strip (default) or at the top of the content area. */
    slot?: 'above' | 'below';
}

/**
 * Rolling / animated Message Board banner for the space page.
 *
 * TileDetail renders it twice — once above the tab strip for messages with
 * `placement: 'above'` (default) and once at the top of the content area for
 * `placement: 'below'`. Each instance rotates its own messages independently.
 */
export const TileMessageBanner: React.FC<TileMessageBannerProps> = ({ messages, slot = 'above' }) => {
    const messageIndex = useMessageRotation(messages);

    if (messages.length === 0) {
        return null;
    }

    return (
        <div className="mb-2 w-full group/message relative cursor-help" data-message-banner-slot={slot}>
            {/* Custom Instant Tooltip - Optimized for Large Detail View */}
            <div
                className="tooltip-force-black absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-yellow-400 text-[10px] rounded-lg shadow-xl opacity-0 translate-y-2 group-hover/message:opacity-100 group-hover/message:translate-y-0 transition-all duration-200 pointer-events-none z-[100] border border-yellow-500 w-max max-w-[400px] text-left"
            >
                {messages.map((m, idx) => (
                    <div key={m.id} className="last:mb-0 mb-1 leading-tight">
                        {messages.length > 1 && <span className="opacity-50 mr-1">{idx + 1}.</span>}
                        {stripFormatting(m.content)}
                    </div>
                ))}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-yellow-400"></div>
            </div>

            <div className={`relative min-h-6 flex items-center overflow-hidden ${!messages[0].textColor ? (
                messages[0].type === 'alert' ? 'text-amber-600 dark:text-amber-400' :
                    messages[0].type === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                        messages[0].type === 'celebration' ? 'text-pink-600 dark:text-pink-400' :
                            'text-brand-600 dark:text-brand-400'
            ) : ''}`}
                style={messages[0].textColor ? {
                    // Only set color on parent if custom color is set, to override tile text color
                    color: messages[0].textColor
                } : undefined}
            >
                {(() => {
                    // Check if all messages use rollover animation
                    const allRollover = messages.length > 0 && messages.every(msg => !msg.animationType || msg.animationType === 'rollover');

                    if (allRollover) {
                        // Rollover animation - stock ticker style: single copy, right-to-left, pause when fully gone
                        return (
                            <div
                                className="animate-rolling-detail flex items-center gap-10 text-sm font-semibold"
                                style={messageMarqueeStyle(messages, MARQUEE_SECONDS_DETAIL)}
                            >
                                {messages.map((msg, idx) => (
                                    <div
                                        key={`${msg.id}-${idx}`}
                                        className="flex items-center gap-2 shrink-0"
                                        style={buildMessageTextStyle(msg)}
                                        data-message-color={msg.textColor || ''}
                                    >
                                        {renderMessageContent(msg.content)}
                                        {msg.url && (
                                            <a
                                                href={msg.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 text-[10px] font-medium text-slate-800 dark:text-brand-400 bg-transparent hover:bg-slate-200/50 dark:hover:bg-brand-900/30 rounded transition-colors"
                                                onClick={(e) => e.stopPropagation()}
                                                title={msg.urlLabel || 'Click for more info'}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                    <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                                                    <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                                                </svg>
                                                {msg.urlLabel || 'Info'}
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        );
                    } else {
                        // Other animations - show one message at a time, cycle through them
                        const currentMsg = messages[messageIndex] || messages[0];

                        if (!currentMsg) {
                            return null;
                        }

                        const currentAnimationType = currentMsg.animationType || 'rollover';
                        const animationClass = getMessageAnimationClass(currentAnimationType);

                        return (
                            <div className={`flex items-center gap-2 text-sm font-semibold ${animationClass}`}>
                                <div
                                    key={`${currentMsg.id}-current`}
                                    className="flex items-center gap-1"
                                    style={buildMessageTextStyle(currentMsg)}
                                    data-message-color={currentMsg.textColor || ''}
                                >
                                    {renderMessageContent(currentMsg.content)}
                                    {currentMsg.url && (
                                        <a
                                            href={currentMsg.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 text-[10px] font-medium text-slate-800 dark:text-brand-400 bg-transparent hover:bg-slate-200/50 dark:hover:bg-brand-900/30 rounded transition-colors"
                                            onClick={(e) => e.stopPropagation()}
                                            title={currentMsg.urlLabel || 'Click for more info'}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                                                <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                                            </svg>
                                            {currentMsg.urlLabel || 'Info'}
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    }
                })()}
            </div>
        </div>
    );
};
