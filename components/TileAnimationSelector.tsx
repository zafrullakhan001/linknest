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
    | 'shake';

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
        setIsOpen(false);
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
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                Choose Tile Animation
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Select how tiles appear on the page
                            </p>
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
