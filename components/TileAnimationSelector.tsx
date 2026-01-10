import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type TileAnimation =
    | 'none'
    | 'fade-in'
    | 'slide-up'
    | 'slide-down'
    | 'slide-left'
    | 'slide-right'
    | 'zoom-in'
    | 'zoom-out'
    | 'flip-x'
    | 'flip-y'
    | 'bounce'
    | 'rotate-in'
    | 'swing'
    | 'pulse'
    | 'shake'
    | 'blur-in'
    | 'roll-in'
    | 'jack-in-the-box'
    | 'back-in-down'
    | 'back-in-up'
    | 'reveal'
    | 'jello'
    | 'rubber-band'
    | 'tada'
    | 'flash'
    | 'zoom-in-up'
    | 'zoom-in-down'
    | 'wave'
    | 'glitch'
    | 'twirl'
    | 'skid'
    | 'spiral'
    | 'bounce-in-right'
    | 'bounce-in-left'
    | 'flip-3d'
    | 'wobble'
    | 'heartbeat'
    | 'puff-in'
    | 'drop'
    | 'swing-in'
    | 'blur-slide-left'
    | 'blur-slide-right'
    | 'neon-flicker'
    | 'focus-reveal'
    | 'perspective-in'
    | 'blink'
    | 'elastic'
    | 'zoom-in-left'
    | 'zoom-in-right'
    | 'slide-in-down-left'
    | 'slide-in-down-right'
    | 'slide-in-up-left'
    | 'slide-in-up-right'
    | 'rotate-in-down-left'
    | 'rotate-in-down-right'
    | 'rotate-in-up-left'
    | 'rotate-in-up-right'
    | 'light-speed-in-right'
    | 'light-speed-in-left'
    | 'swing-in-left'
    | 'swing-in-right'
    | 'roll-in-bottom'
    | 'roll-in-top'
    | 'back-in-left'
    | 'back-in-right'
    | 'stretch-in-hor'
    | 'stretch-in-ver'
    | 'bounce-in-up'
    | 'bounce-in-down'
    | 'jelly'
    | 'star-in'
    | 'flare-in'
    | 'beam-in'
    | 'teleport'
    | 'shimmer-in'
    | 'tilt-in'
    | 'magnify'
    | 'blur-in-up'
    | 'blur-in-down'
    | 'pop-in'
    | 'unfold-in'
    | 'fold-in'
    | 'slot-in'
    | 'newspaper'
    | 'carousel-in'
    | 'cube-in'
    | 'stack-in'
    | 'door-in'
    | 'ghost-in'
    | 'glitch-2'
    | 'neon-pulse'
    | 'vibrate'
    | 'bounce-top'
    | 'bounce-bottom'
    | 'bounce-left'
    | 'bounce-right'
    | 'squish'
    | 'slide-tilt'
    | 'swirl-in'
    | 'blur-perspective';

interface AnimationOption {
    id: TileAnimation;
    name: string;
    description: string;
    icon: string;
}

const ANIMATION_OPTIONS: AnimationOption[] = [
    { id: 'none', name: 'None', description: 'No animation', icon: '⭕' },
    { id: 'fade-in', name: 'Fade In', description: 'Gentle fade in effect', icon: '✨' },
    { id: 'slide-up', name: 'Slide Up', description: 'Slide from bottom', icon: '⬆️' },
    { id: 'slide-down', name: 'Slide Down', description: 'Slide from top', icon: '⬇️' },
    { id: 'slide-left', name: 'Slide Left', description: 'Slide from right', icon: '⬅️' },
    { id: 'slide-right', name: 'Slide Right', description: 'Slide from left', icon: '➡️' },
    { id: 'zoom-in', name: 'Zoom In', description: 'Scale up effect', icon: '🔍' },
    { id: 'zoom-out', name: 'Zoom Out', description: 'Scale down effect', icon: '🔎' },
    { id: 'flip-x', name: 'Flip Horizontal', description: 'Flip on X axis', icon: '🔄' },
    { id: 'flip-y', name: 'Flip Vertical', description: 'Flip on Y axis', icon: '🔃' },
    { id: 'bounce', name: 'Bounce', description: 'Bouncy entrance', icon: '🎾' },
    { id: 'rotate-in', name: 'Rotate In', description: 'Rotate while entering', icon: '🌀' },
    { id: 'swing', name: 'Swing', description: 'Swing from top', icon: '🎪' },
    { id: 'pulse', name: 'Pulse', description: 'Pulsing effect', icon: '💓' },
    { id: 'shake', name: 'Shake', description: 'Shake effect', icon: '📳' },
    { id: 'blur-in', name: 'Blur In', description: 'Fade with blur', icon: '🌫️' },
    { id: 'roll-in', name: 'Roll In', description: 'Roll from left', icon: '🗞️' },
    { id: 'jack-in-the-box', name: 'Jack Box', description: 'Pop out effect', icon: '🎁' },
    { id: 'back-in-down', name: 'Back In Down', description: 'Slide down with back', icon: '⏬' },
    { id: 'back-in-up', name: 'Back In Up', description: 'Slide up with back', icon: '⏫' },
    { id: 'reveal', name: 'Reveal', description: 'Wipe uncover', icon: '🎭' },
    { id: 'jello', name: 'Jello', description: 'Wobbly entrance', icon: '🍮' },
    { id: 'rubber-band', name: 'Rubber Band', description: 'Stretch & squeeze', icon: '🪁' },
    { id: 'tada', name: 'Tada', description: 'Celebration shake', icon: '🎉' },
    { id: 'flash', name: 'Flash', description: 'Flashing entrance', icon: '📸' },
    { id: 'zoom-in-up', name: 'Zoom In Up', description: 'Zoom from bottom', icon: '↗️' },
    { id: 'zoom-in-down', name: 'Zoom In Down', description: 'Zoom from top', icon: '↘️' },
    { id: 'wave', name: 'Wave', description: 'Wave entrance', icon: '🌊' },
    { id: 'glitch', name: 'Glitch', description: 'Digital breakdown', icon: '👾' },
    { id: 'twirl', name: 'Twirl', description: 'Spinning entrance', icon: '🌪️' },
    { id: 'skid', name: 'Skid', description: 'Brake to stop', icon: '🏎️' },
    { id: 'spiral', name: 'Spiral', description: 'Vortex entrance', icon: '🌀' },
    { id: 'bounce-in-right', name: 'Bounce Right', description: 'Bounce from right', icon: '🏀' },
    { id: 'bounce-in-left', name: 'Bounce Left', description: 'Bounce from left', icon: '🏀' },
    { id: 'flip-3d', name: 'Flip 3D', description: '3D perspective flip', icon: '🧊' },
    { id: 'wobble', name: 'Wobble', description: 'Wobbling entrance', icon: '🍮' },
    { id: 'heartbeat', name: 'Heartbeat', description: 'Rhythmic pulse', icon: '💓' },
    { id: 'puff-in', name: 'Puff In', description: 'Smoke puff effect', icon: '💨' },
    { id: 'drop', name: 'Drop', description: 'Fall and stop', icon: '💧' },
    { id: 'swing-in', name: 'Swing In', description: 'Swing from top', icon: '🎢' },
    { id: 'blur-slide-left', name: 'Blur Left', description: 'Blurred slide left', icon: '🌫️' },
    { id: 'blur-slide-right', name: 'Blur Right', description: 'Blurred slide right', icon: '🌫️' },
    { id: 'neon-flicker', name: 'Neon', description: 'Flickering light', icon: '💡' },
    { id: 'focus-reveal', name: 'Focus', description: 'Blur focus reveal', icon: '👁️' },
    { id: 'perspective-in', name: 'Perspective', description: '3D Tilt entrance', icon: '🖼️' },
    { id: 'blink', name: 'Blink', description: 'Fast flash', icon: '✨' },
    { id: 'elastic', name: 'Elastic', description: 'Sling-shot effect', icon: '🏹' },
    { id: 'zoom-in-left', name: 'Zoom In Left', description: 'Zoom from right', icon: '🔍' },
    { id: 'zoom-in-right', name: 'Zoom In Right', description: 'Zoom from left', icon: '🔎' },
    { id: 'slide-in-down-left', name: 'Slide Down Left', description: 'Slide from top-right', icon: '↙️' },
    { id: 'slide-in-down-right', name: 'Slide Down Right', description: 'Slide from top-left', icon: '↘️' },
    { id: 'slide-in-up-left', name: 'Slide Up Left', description: 'Slide from bottom-right', icon: '↖️' },
    { id: 'slide-in-up-right', name: 'Slide Up Right', description: 'Slide from bottom-left', icon: '↗️' },
    { id: 'rotate-in-down-left', name: 'Rotate Down Left', description: 'Rotate from top-left', icon: '↩️' },
    { id: 'rotate-in-down-right', name: 'Rotate Down Right', description: 'Rotate from top-right', icon: '↪️' },
    { id: 'rotate-in-up-left', name: 'Rotate Up Left', description: 'Rotate from bottom-left', icon: '⤴️' },
    { id: 'rotate-in-up-right', name: 'Rotate Up Right', description: 'Rotate from bottom-right', icon: '⤵️' },
    { id: 'light-speed-in-right', name: 'Light Speed R', description: 'Enter from right fast', icon: '🚄' },
    { id: 'light-speed-in-left', name: 'Light Speed L', description: 'Enter from left fast', icon: '🚄' },
    { id: 'swing-in-left', name: 'Swing In Left', description: 'Swing from left side', icon: '🚪' },
    { id: 'swing-in-right', name: 'Swing In Right', description: 'Swing from right side', icon: '🚪' },
    { id: 'roll-in-bottom', name: 'Roll In Bottom', description: 'Roll in from bottom', icon: '🦵' },
    { id: 'roll-in-top', name: 'Roll In Top', description: 'Roll in from top', icon: '🧢' },
    { id: 'back-in-left', name: 'Back In Left', description: 'Slide back from left', icon: '⏮️' },
    { id: 'back-in-right', name: 'Back In Right', description: 'Slide back from right', icon: '⏭️' },
    { id: 'stretch-in-hor', name: 'Stretch Hor', description: 'Stretch horizontally', icon: '↔️' },
    { id: 'stretch-in-ver', name: 'Stretch Ver', description: 'Stretch vertically', icon: '↕️' },
    { id: 'bounce-in-up', name: 'Bounce In Up', description: 'Bounce from bottom', icon: '🔝' },
    { id: 'bounce-in-down', name: 'Bounce In Down', description: 'Bounce from top', icon: '🔚' },
    { id: 'jelly', name: 'Jelly', description: 'Jelly wobble', icon: '🍮' },
    { id: 'star-in', name: 'Star In', description: 'Spin in like star', icon: '⭐' },
    { id: 'flare-in', name: 'Flare In', description: 'Bright flare entrance', icon: '🕯️' },
    { id: 'beam-in', name: 'Beam In', description: 'Beam of light reveal', icon: '🔦' },
    { id: 'teleport', name: 'Teleport', description: 'Instant appearance', icon: '⚛️' },
    { id: 'shimmer-in', name: 'Shimmer In', description: 'Sparkle entrance', icon: '💎' },
    { id: 'tilt-in', name: 'Tilt In', description: 'Tilt reveal', icon: '📐' },
    { id: 'magnify', name: 'Magnify', description: 'Grow from center', icon: '🔎' },
    { id: 'blur-in-up', name: 'Blur In Up', description: 'Blur from bottom', icon: '🌫️' },
    { id: 'blur-in-down', name: 'Blur In Down', description: 'Blur from top', icon: '🌫️' },
    { id: 'pop-in', name: 'Pop In', description: 'Sudden expansion', icon: '💥' },
    { id: 'unfold-in', name: 'Unfold In', description: 'Unfold like paper', icon: '📖' },
    { id: 'fold-in', name: 'Fold In', description: 'Fold into place', icon: '📁' },
    { id: 'slot-in', name: 'Slot In', description: 'Slot machine reveal', icon: '🎰' },
    { id: 'newspaper', name: 'Newspaper', description: 'Spin and grow', icon: '📰' },
    { id: 'carousel-in', name: 'Carousel In', description: 'Rotate in circle', icon: '🎡' },
    { id: 'cube-in', name: 'Cube In', description: 'Rotate like cube', icon: '🧊' },
    { id: 'stack-in', name: 'Stack In', description: 'Stack from back', icon: '📚' },
    { id: 'door-in', name: 'Door In', description: 'Open like door', icon: '🚪' },
    { id: 'ghost-in', name: 'Ghost In', description: 'Fade from transparent', icon: '👻' },
    { id: 'glitch-2', name: 'Glitch 2', description: 'Static glitch', icon: '💻' },
    { id: 'neon-pulse', name: 'Neon Pulse', description: 'Glowing pulse', icon: '🌈' },
    { id: 'vibrate', name: 'Vibrate', description: 'High speed shake', icon: '📳' },
    { id: 'bounce-top', name: 'Bounce Top', description: 'Bounce at top', icon: '⏫' },
    { id: 'bounce-bottom', name: 'Bounce Bottom', description: 'Bounce at bottom', icon: '⏬' },
    { id: 'bounce-left', name: 'Bounce Left', description: 'Bounce at left', icon: '⏪' },
    { id: 'bounce-right', name: 'Bounce Right', description: 'Bounce at right', icon: '⏩' },
    { id: 'squish', name: 'Squish', description: 'Squish and pop', icon: '🎈' },
    { id: 'slide-tilt', name: 'Slide Tilt', description: 'Tilt while sliding', icon: '📐' },
    { id: 'swirl-in', name: 'Swirl In', description: 'Swirling reveal', icon: '🍭' },
    { id: 'blur-perspective', name: 'Blur Perspective', description: '3D blur reveal', icon: '🔭' },
];

const STORAGE_KEY = 'linknest_tile_animation';

interface TileAnimationSelectorProps {
    onAnimationChange?: (animation: TileAnimation) => void;
}

export const TileAnimationSelector: React.FC<TileAnimationSelectorProps> = ({ onAnimationChange }) => {
    const [selectedAnimation, setSelectedAnimation] = useState<TileAnimation>('fade-in');
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

    // Load animation preference from localStorage on mount
    useEffect(() => {
        const savedAnimation = localStorage.getItem(STORAGE_KEY) as TileAnimation | null;
        if (savedAnimation && ANIMATION_OPTIONS.find(opt => opt.id === savedAnimation)) {
            setSelectedAnimation(savedAnimation);
            onAnimationChange?.(savedAnimation);
        }
    }, [onAnimationChange]);

    // Update dropdown position when opened
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPosition({
                top: rect.bottom + window.scrollY + 8,
                left: rect.right + window.scrollX - 320, // 320px is the dropdown width
            });
        }
    }, [isOpen]);

    const handleAnimationSelect = (animation: TileAnimation) => {
        setSelectedAnimation(animation);
        localStorage.setItem(STORAGE_KEY, animation);
        onAnimationChange?.(animation);
    };

    const selectedOption = ANIMATION_OPTIONS.find(opt => opt.id === selectedAnimation) || ANIMATION_OPTIONS[0];

    return (
        <>
            {/* Trigger Button */}
            <button
                ref={buttonRef}
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-500 transition-all shadow-sm hover:shadow-md"
                title="Select tile animation"
            >
                <span className="text-lg">{selectedOption.icon}</span>
                <div className="flex flex-col items-start">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Animation
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        {selectedOption.name}
                    </span>
                </div>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
            </button>

            {/* Dropdown Menu - Rendered via Portal */}
            {isOpen && createPortal(
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-[9999]"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Animation Options Grid */}
                    <div
                        className="fixed w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[10000] overflow-hidden"
                        style={{
                            top: `${dropdownPosition.top}px`,
                            left: `${dropdownPosition.left}px`,
                        }}
                    >
                        <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                        Choose Tile Animation
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        Select how tiles appear on the page
                                    </p>
                                </div>
                                <span className="px-2 py-0.5 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400 text-[10px] font-bold">
                                    {ANIMATION_OPTIONS.length} Total
                                </span>
                            </div>
                        </div>

                        <div className="max-h-96 overflow-y-auto p-2">
                            <div className="grid grid-cols-2 gap-2">
                                {ANIMATION_OPTIONS.map((option) => (
                                    <button
                                        key={option.id}
                                        onClick={() => handleAnimationSelect(option.id)}
                                        className={`
                      p-3 rounded-lg text-left transition-all
                      ${selectedAnimation === option.id
                                                ? 'bg-brand-50 dark:bg-brand-500/10 border-2 border-brand-500 shadow-sm'
                                                : 'bg-slate-50 dark:bg-slate-900 border-2 border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                                            }
                    `}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span className="text-2xl">{option.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-slate-700 dark:text-slate-300 truncate">
                                                    {option.name}
                                                </div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                    {option.description}
                                                </div>
                                            </div>
                                            {selectedAnimation === option.id && (
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-brand-500 flex-shrink-0">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                                </svg>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Preview Section */}
                        <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                    Preview on page load
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            // Trigger a re-render by toggling the animation class
                                            const tiles = document.querySelectorAll('.linknest-tile-animated');
                                            tiles.forEach((tile) => {
                                                const element = tile as HTMLElement;
                                                element.style.animation = 'none';
                                                setTimeout(() => {
                                                    element.style.animation = '';
                                                }, 10);
                                            });
                                        }}
                                        className="px-3 py-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 rounded-md transition-colors"
                                    >
                                        Replay
                                    </button>
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="px-3 py-1.5 text-xs font-medium bg-brand-600 text-white hover:bg-brand-700 rounded-md transition-colors shadow-sm"
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>,
                document.body
            )}
        </>
    );
};

// Hook to get the current animation preference
export const useTileAnimation = (): TileAnimation => {
    const [animation, setAnimation] = useState<TileAnimation>('fade-in');

    useEffect(() => {
        const savedAnimation = localStorage.getItem(STORAGE_KEY) as TileAnimation | null;
        if (savedAnimation && ANIMATION_OPTIONS.find(opt => opt.id === savedAnimation)) {
            setAnimation(savedAnimation);
        }
    }, []);

    return animation;
};

// Helper function to get animation class name
export const getTileAnimationClass = (animation: TileAnimation): string => {
    if (animation === 'none') return '';
    return `tile-anim-${animation}`;
};
