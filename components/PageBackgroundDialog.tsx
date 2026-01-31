import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SpaceStyles, DEFAULT_STYLES, styleService } from '../services/styleService';
import { useAuth } from '../contexts/AuthContext';

export type PageBackgroundType = 'none' | 'solid' | 'gradient' | 'pattern' | 'image';
export type CelebrationEffectType = 
  | 'none' 
  | 'fireworks' 
  | 'rocket-fireworks'
  | 'confetti' 
  | 'balloons' 
  | 'hearts' 
  | 'snow' 
  | 'bubbles' 
  | 'matrix' 
  | 'shooting-stars' 
  | 'floating-ribbons' 
  | 'sparkles'
  | 'rain'
  | 'leaves'
  | 'fireflies'
  | 'petals'
  | 'aurora'
  | 'cosmic'
  | 'meteors'
  | 'dandelion'
  | 'butterflies'
  | 'lightning';

const GRADIENT_PRESETS: Array<{ name: string; start: string; end: string; direction: number }> = [
  { name: 'Sunset', start: '#f97316', end: '#ec4899', direction: 135 },
  { name: 'Ocean', start: '#0ea5e9', end: '#06b6d4', direction: 180 },
  { name: 'Lavender', start: '#a78bfa', end: '#e879f9', direction: 135 },
  { name: 'Mint', start: '#34d399', end: '#6ee7b7', direction: 90 },
  { name: 'Slate', start: '#64748b', end: '#94a3b8', direction: 180 },
  { name: 'Warm', start: '#fef3c7', end: '#fde68a', direction: 45 },
  { name: 'Cool', start: '#e0e7ff', end: '#c7d2fe', direction: 135 },
  { name: 'Nord', start: '#88c0d0', end: '#81a1c1', direction: 160 },
];

const METALLIC_GRADIENT_PRESETS: Array<{ name: string; start: string; end: string; direction: number }> = [
  { name: 'Silver', start: '#ffffff', end: '#a8a8a8', direction: 135 },
  { name: 'Gold', start: '#fffacd', end: '#daa520', direction: 135 },
  { name: 'Chrome', start: '#f5f5f5', end: '#b0b0b0', direction: 135 },
  { name: 'Bronze', start: '#daa520', end: '#8b4513', direction: 135 },
  { name: 'Copper', start: '#daa520', end: '#8b4513', direction: 160 },
  { name: 'Platinum', start: '#e8e8e8', end: '#909090', direction: 135 },
  { name: 'Rose Gold', start: '#f5e6e8', end: '#c9a0a0', direction: 135 },
];

const SOLID_PRESETS: Array<{ name: string; color: string }> = [
  { name: 'Silver', color: '#c0c0c0' },
  { name: 'Gold', color: '#daa520' },
  { name: 'Chrome', color: '#d0d0d0' },
  { name: 'Bronze', color: '#b87333' },
  { name: 'Copper', color: '#cd7f32' },
  { name: 'Platinum', color: '#e5e4e2' },
  { name: 'Slate', color: '#64748b' },
  { name: 'Off-white', color: '#f8fafc' },
];

const PATTERNS: Array<{ id: string; label: string; preview: string; previewSize?: string }> = [
  { id: 'dots', label: 'Dots', preview: 'radial-gradient(circle at 1px 1px, rgba(100,116,139,0.3) 1px, transparent 0)', previewSize: '24px 24px' },
  { id: 'grid', label: 'Grid', preview: 'linear-gradient(rgba(100,116,139,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.25) 1px, transparent 1px)', previewSize: '16px 16px' },
  { id: 'waves', label: 'Waves', preview: 'radial-gradient(ellipse at 50% 50%, rgba(100,116,139,0.25) 0%, transparent 70%)' },
  { id: 'cross', label: 'Cross', preview: 'linear-gradient(rgba(100,116,139,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.22) 1px, transparent 1px)', previewSize: '20px 20px' },
  { id: 'diagonal', label: 'Diagonal', preview: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(100,116,139,0.22) 10px, rgba(100,116,139,0.22) 11px)' },
  { id: 'hexagon', label: 'Hexagon', preview: 'linear-gradient(30deg, rgba(100,116,139,0.22) 12%, transparent 12.5%), linear-gradient(150deg, rgba(100,116,139,0.22) 12%, transparent 12.5%)', previewSize: '32px 56px' },
  { id: 'noise', label: 'Noise', preview: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.06\'/%3E%3C/svg%3E")' },
  { id: 'circles', label: 'Circles', preview: 'radial-gradient(circle at 50% 50%, rgba(100,116,139,0.28) 0%, transparent 70%)', previewSize: '48px 48px' },
  { id: 'bricks', label: 'Bricks', preview: 'linear-gradient(90deg, rgba(100,116,139,0.22) 0%, transparent 50%), repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(100,116,139,0.18) 24px, rgba(100,116,139,0.18) 25px)' },
  { id: 'stripes', label: 'Stripes', preview: 'repeating-linear-gradient(90deg, transparent, transparent 12px, rgba(100,116,139,0.22) 12px, rgba(100,116,139,0.22) 13px)' },
  { id: 'checkerboard', label: 'Checkerboard', preview: 'linear-gradient(45deg, rgba(100,116,139,0.2) 25%, transparent 25%), linear-gradient(-45deg, rgba(148,163,184,0.2) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(100,116,139,0.2) 75%), linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.2) 75%)', previewSize: '24px 24px' },
  { id: 'plus', label: 'Plus', preview: 'linear-gradient(rgba(100,116,139,0.25) 2px, transparent 2px), linear-gradient(90deg, rgba(100,116,139,0.25) 2px, transparent 2px)', previewSize: '20px 20px' },
  { id: 'topography', label: 'Topography', preview: 'repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(100,116,139,0.18) 20px, rgba(100,116,139,0.18) 21px), repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(148,163,184,0.15) 20px, rgba(148,163,184,0.15) 21px)' },
  { id: 'confetti', label: 'Confetti', preview: 'radial-gradient(circle at 0 0, rgba(100,116,139,0.25) 2px, transparent 2px), radial-gradient(circle at 16px 16px, rgba(148,163,184,0.22) 2px, transparent 2px)', previewSize: '32px 32px' },
  { id: 'rings', label: 'Rings', preview: 'radial-gradient(circle at 50% 50%, transparent 40%, rgba(100,116,139,0.25) 41%, transparent 42%)', previewSize: '48px 48px' },
  { id: 'squares', label: 'Squares', preview: 'linear-gradient(rgba(100,116,139,0.22) 2px, transparent 2px), linear-gradient(90deg, rgba(100,116,139,0.22) 2px, transparent 2px)', previewSize: '24px 24px' },
  { id: 'herringbone', label: 'Herringbone', preview: 'repeating-linear-gradient(45deg, rgba(100,116,139,0.2) 0px, rgba(100,116,139,0.2) 8px, transparent 8px, transparent 16px), repeating-linear-gradient(-45deg, rgba(148,163,184,0.2) 0px, rgba(148,163,184,0.2) 8px, transparent 8px, transparent 16px)', previewSize: '32px 32px' },
  { id: 'zigzag', label: 'Zigzag', preview: 'repeating-linear-gradient(135deg, transparent, transparent 12px, rgba(100,116,139,0.22) 12px, rgba(100,116,139,0.22) 14px), repeating-linear-gradient(45deg, transparent, transparent 12px, rgba(148,163,184,0.2) 12px, rgba(148,163,184,0.2) 14px)', previewSize: '24px 24px' },
  { id: 'quatrefoil', label: 'Quatrefoil', preview: 'radial-gradient(circle at 0 0, rgba(100,116,139,0.25) 4px, transparent 4px), radial-gradient(circle at 24px 0, rgba(100,116,139,0.25) 4px, transparent 4px), radial-gradient(circle at 0 24px, rgba(100,116,139,0.25) 4px, transparent 4px), radial-gradient(circle at 24px 24px, rgba(100,116,139,0.25) 4px, transparent 4px)', previewSize: '24px 24px' },
  { id: 'stars', label: 'Stars', preview: 'radial-gradient(circle at 50% 50%, rgba(100,116,139,0.25) 1px, transparent 1px), radial-gradient(circle at 0 0, rgba(148,163,184,0.2) 1px, transparent 1px)', previewSize: '32px 32px' },
  { id: 'mesh', label: 'Mesh', preview: 'linear-gradient(rgba(100,116,139,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.2) 1px, transparent 1px), linear-gradient(rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.15) 1px, transparent 1px)', previewSize: '24px 24px' },
  { id: 'plaid', label: 'Plaid', preview: 'repeating-linear-gradient(0deg, transparent, transparent 8px, rgba(100,116,139,0.2) 8px, rgba(100,116,139,0.2) 10px), repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(100,116,139,0.2) 8px, rgba(100,116,139,0.2) 10px), repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(148,163,184,0.15) 24px, rgba(148,163,184,0.15) 26px), repeating-linear-gradient(90deg, transparent, transparent 24px, rgba(148,163,184,0.15) 24px, rgba(148,163,184,0.15) 26px)', previewSize: '48px 48px' },
  { id: 'triangles', label: 'Triangles', preview: 'linear-gradient(30deg, rgba(100,116,139,0.22) 12%, transparent 12.5%), linear-gradient(150deg, rgba(100,116,139,0.22) 12%, transparent 12.5%), linear-gradient(30deg, rgba(148,163,184,0.18) 12%, transparent 12.5%), linear-gradient(150deg, rgba(148,163,184,0.18) 12%, transparent 12.5%)', previewSize: '32px 56px' },
  { id: 'diamonds', label: 'Diamonds', preview: 'repeating-linear-gradient(45deg, rgba(100,116,139,0.22) 0px, rgba(100,116,139,0.22) 2px, transparent 2px, transparent 14px), repeating-linear-gradient(-45deg, rgba(148,163,184,0.2) 0px, rgba(148,163,184,0.2) 2px, transparent 2px, transparent 14px)', previewSize: '20px 20px' },
  { id: 'arrows', label: 'Arrows', preview: 'repeating-linear-gradient(90deg, transparent, transparent 16px, rgba(100,116,139,0.22) 16px, rgba(100,116,139,0.22) 18px), repeating-linear-gradient(0deg, transparent, transparent 16px, rgba(148,163,184,0.2) 16px, rgba(148,163,184,0.2) 18px)', previewSize: '32px 32px' },
  { id: 'scatter', label: 'Scatter', preview: 'radial-gradient(circle at 20% 30%, rgba(100,116,139,0.25) 2px, transparent 2px), radial-gradient(circle at 80% 70%, rgba(148,163,184,0.22) 2px, transparent 2px), radial-gradient(circle at 50% 50%, rgba(100,116,139,0.2) 1px, transparent 1px)', previewSize: '64px 64px' },
];

const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/svg+xml,image/webp,image/gif';

const PAGE_BG_ACTIVE_TAB_KEY = 'linknest_page_bg_active_tab';
const VALID_TABS = ['none', 'solid', 'gradient', 'pattern', 'image', 'celebration'] as const;

function getPersistedTab(): PageBackgroundType | 'celebration' | null {
  try {
    const saved = localStorage.getItem(PAGE_BG_ACTIVE_TAB_KEY);
    if (saved && VALID_TABS.includes(saved as typeof VALID_TABS[number])) return saved as PageBackgroundType | 'celebration';
  } catch (_) {}
  return null;
}

function persistTab(tab: PageBackgroundType | 'celebration') {
  try {
    localStorage.setItem(PAGE_BG_ACTIVE_TAB_KEY, tab);
  } catch (_) {}
}

interface PageBackgroundDialogProps {
  isOpen: boolean;
  onClose: () => void;
  styles: SpaceStyles;
  onApply: (styles: SpaceStyles) => void;
}

export const PageBackgroundDialog: React.FC<PageBackgroundDialogProps> = ({ isOpen, onClose, styles, onApply }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<PageBackgroundType | 'celebration'>(() => {
    const persisted = getPersistedTab();
    const celebrationEnabled = styles?.celebrationEffectEnabled ?? DEFAULT_STYLES.celebrationEffectEnabled;
    if (persisted) return persisted;
    if (celebrationEnabled) return 'celebration';
    return (styles?.pageBackgroundType as PageBackgroundType) || 'none';
  });
  const [solidColor, setSolidColor] = useState(styles?.pageBackgroundSolidColor ?? DEFAULT_STYLES.pageBackgroundSolidColor);
  const [gradientStart, setGradientStart] = useState(styles?.pageBackgroundGradientStart ?? DEFAULT_STYLES.pageBackgroundGradientStart);
  const [gradientEnd, setGradientEnd] = useState(styles?.pageBackgroundGradientEnd ?? DEFAULT_STYLES.pageBackgroundGradientEnd);
  const [gradientDirection, setGradientDirection] = useState(styles?.pageBackgroundGradientDirection ?? DEFAULT_STYLES.pageBackgroundGradientDirection);
  const [gradientType, setGradientType] = useState<'linear' | 'radial' | 'conic'>(styles?.pageBackgroundGradientType ?? 'linear');
  const [patternId, setPatternId] = useState(styles?.pageBackgroundPatternId ?? DEFAULT_STYLES.pageBackgroundPatternId);
  const [patternColor1, setPatternColor1] = useState(styles?.pageBackgroundPatternColor1 ?? DEFAULT_STYLES.pageBackgroundPatternColor1);
  const [patternColor2, setPatternColor2] = useState(styles?.pageBackgroundPatternColor2 ?? DEFAULT_STYLES.pageBackgroundPatternColor2);
  const [patternOpacity, setPatternOpacity] = useState(styles?.pageBackgroundPatternOpacity ?? DEFAULT_STYLES.pageBackgroundPatternOpacity);
  const [patternFixed, setPatternFixed] = useState(styles?.pageBackgroundPatternFixed ?? true);
  const [imageUrl, setImageUrl] = useState(styles?.pageBackgroundImageUrl ?? '');
  const [imageBlur, setImageBlur] = useState(styles?.pageBackgroundBlur ?? 0);
  const [imageDarkOverlay, setImageDarkOverlay] = useState(styles?.pageBackgroundDarkOverlay ?? 40);
  const [opacity, setOpacity] = useState(styles?.pageBackgroundOpacity ?? 100);
  const [imagePosition, setImagePosition] = useState(styles?.pageBackgroundImagePosition ?? 'center');
  const [imageSize, setImageSize] = useState(styles?.pageBackgroundImageSize ?? 'cover');
  const [imagePreviewError, setImagePreviewError] = useState(false);

  // Celebration effects state
  const [celebrationEnabled, setCelebrationEnabled] = useState(styles?.celebrationEffectEnabled ?? DEFAULT_STYLES.celebrationEffectEnabled);
  const [celebrationType, setCelebrationType] = useState<CelebrationEffectType>(() => (styles?.celebrationEffectType as CelebrationEffectType) ?? DEFAULT_STYLES.celebrationEffectType);
  const [celebrationIntensity, setCelebrationIntensity] = useState(styles?.celebrationIntensity ?? DEFAULT_STYLES.celebrationIntensity);
  const [celebrationParticleSize, setCelebrationParticleSize] = useState(styles?.celebrationParticleSize ?? DEFAULT_STYLES.celebrationParticleSize);
  const [celebrationSpeed, setCelebrationSpeed] = useState(styles?.celebrationSpeed ?? DEFAULT_STYLES.celebrationSpeed);
  const [celebrationColor1, setCelebrationColor1] = useState(styles?.celebrationColor1 ?? DEFAULT_STYLES.celebrationColor1);
  const [celebrationColor2, setCelebrationColor2] = useState(styles?.celebrationColor2 ?? DEFAULT_STYLES.celebrationColor2);
  const [celebrationColor3, setCelebrationColor3] = useState(styles?.celebrationColor3 ?? DEFAULT_STYLES.celebrationColor3);
  const [celebrationShowOnForeground, setCelebrationShowOnForeground] = useState(styles?.celebrationShowOnForeground ?? DEFAULT_STYLES.celebrationShowOnForeground ?? false);
  const [celebrationOpacity, setCelebrationOpacity] = useState(styles?.celebrationOpacity ?? DEFAULT_STYLES.celebrationOpacity ?? 100);
  const [celebrationBurstInterval, setCelebrationBurstInterval] = useState(styles?.celebrationBurstInterval ?? DEFAULT_STYLES.celebrationBurstInterval ?? 1500);

  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (imageUrl.trim()) setImagePreviewError(false);
  }, [imageUrl]);
  const headerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }
  }, [isOpen]);

  const handleHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dialogRef.current || (e.target as HTMLElement).closest('button')) return;
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const x = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth));
      const y = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight));
      setPosition({ x, y });
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (dataUrl) setImageUrl(dataUrl);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (isOpen && styles) {
      const celebrationEnabled = styles.celebrationEffectEnabled ?? DEFAULT_STYLES.celebrationEffectEnabled;
      setActiveTab((prev) => {
        const persisted = getPersistedTab();
        if (persisted) return persisted;
        if (prev === 'celebration') return prev;
        if (celebrationEnabled) return 'celebration' as const;
        return (styles.pageBackgroundType as PageBackgroundType) || 'none';
      });
      setSolidColor(styles.pageBackgroundSolidColor ?? DEFAULT_STYLES.pageBackgroundSolidColor);
      setGradientStart(styles.pageBackgroundGradientStart ?? DEFAULT_STYLES.pageBackgroundGradientStart);
      setGradientEnd(styles.pageBackgroundGradientEnd ?? DEFAULT_STYLES.pageBackgroundGradientEnd);
      setGradientDirection(styles.pageBackgroundGradientDirection ?? DEFAULT_STYLES.pageBackgroundGradientDirection);
      setGradientType(styles.pageBackgroundGradientType ?? 'linear');
      setPatternId(styles.pageBackgroundPatternId ?? DEFAULT_STYLES.pageBackgroundPatternId);
      setPatternColor1(styles.pageBackgroundPatternColor1 ?? DEFAULT_STYLES.pageBackgroundPatternColor1);
      setPatternColor2(styles.pageBackgroundPatternColor2 ?? DEFAULT_STYLES.pageBackgroundPatternColor2);
      setPatternOpacity(styles.pageBackgroundPatternOpacity ?? DEFAULT_STYLES.pageBackgroundPatternOpacity);
      setPatternFixed(styles.pageBackgroundPatternFixed ?? true);
      setImageUrl(styles.pageBackgroundImageUrl ?? '');
      setImageBlur(styles.pageBackgroundBlur ?? 0);
      setImageDarkOverlay(styles.pageBackgroundDarkOverlay ?? 40);
      setOpacity(styles.pageBackgroundOpacity ?? 100);
      setImagePosition(styles.pageBackgroundImagePosition ?? 'center');
      setImageSize(styles.pageBackgroundImageSize ?? 'cover');
      setCelebrationEnabled(styles.celebrationEffectEnabled ?? DEFAULT_STYLES.celebrationEffectEnabled);
      setCelebrationType((styles.celebrationEffectType as CelebrationEffectType) ?? DEFAULT_STYLES.celebrationEffectType);
      setCelebrationIntensity(styles.celebrationIntensity ?? DEFAULT_STYLES.celebrationIntensity);
      setCelebrationParticleSize(styles.celebrationParticleSize ?? DEFAULT_STYLES.celebrationParticleSize);
      setCelebrationSpeed(styles.celebrationSpeed ?? DEFAULT_STYLES.celebrationSpeed);
      setCelebrationColor1(styles.celebrationColor1 ?? DEFAULT_STYLES.celebrationColor1);
      setCelebrationColor2(styles.celebrationColor2 ?? DEFAULT_STYLES.celebrationColor2);
      setCelebrationColor3(styles.celebrationColor3 ?? DEFAULT_STYLES.celebrationColor3);
      setCelebrationShowOnForeground(styles.celebrationShowOnForeground ?? DEFAULT_STYLES.celebrationShowOnForeground ?? false);
      setCelebrationOpacity(styles.celebrationOpacity ?? DEFAULT_STYLES.celebrationOpacity ?? 100);
      setCelebrationBurstInterval(styles.celebrationBurstInterval ?? DEFAULT_STYLES.celebrationBurstInterval ?? 1500);
    }
  }, [isOpen, styles]);

  const apply = (overrides: Partial<SpaceStyles> = {}) => {
    const bgType = activeTab === 'celebration' ? (styles?.pageBackgroundType ?? 'none') : activeTab;
    const next: SpaceStyles = {
      ...styles,
      pageBackgroundType: bgType,
      pageBackgroundSolidColor: solidColor,
      pageBackgroundGradientStart: gradientStart,
      pageBackgroundGradientEnd: gradientEnd,
      pageBackgroundGradientDirection: gradientDirection,
      pageBackgroundGradientType: gradientType,
      pageBackgroundPatternId: patternId,
      pageBackgroundPatternColor1: patternColor1,
      pageBackgroundPatternColor2: patternColor2,
      pageBackgroundPatternOpacity: patternOpacity,
      pageBackgroundPatternFixed: patternFixed,
      pageBackgroundImageUrl: imageUrl.trim(),
      pageBackgroundBlur: imageBlur,
      pageBackgroundDarkOverlay: imageDarkOverlay,
      pageBackgroundOpacity: opacity,
      pageBackgroundImagePosition: imagePosition,
      pageBackgroundImageSize: imageSize,
      celebrationEffectEnabled: celebrationEnabled,
      celebrationEffectType: celebrationType,
      celebrationIntensity: celebrationIntensity,
      celebrationParticleSize: celebrationParticleSize,
      celebrationSpeed: celebrationSpeed,
      celebrationColor1: celebrationColor1,
      celebrationColor2: celebrationColor2,
      celebrationColor3: celebrationColor3,
      celebrationShowOnForeground: celebrationShowOnForeground,
      celebrationOpacity: celebrationOpacity,
      celebrationBurstInterval: celebrationBurstInterval,
      ...overrides
    };
    onApply(next);
    if (user?.is_admin) {
      styleService.saveActiveProfileStyles(next).catch((err) => console.error('Failed to persist page background:', err));
    }
  };

  const handleApplyNone = () => {
    setActiveTab('none');
    persistTab('none');
    apply({ pageBackgroundType: 'none' });
  };

  const handleApplySolid = () => {
    apply({ pageBackgroundType: 'solid', pageBackgroundSolidColor: solidColor });
  };

  const handleApplyGradient = (preset?: typeof GRADIENT_PRESETS[0]) => {
    if (preset) {
      setGradientStart(preset.start);
      setGradientEnd(preset.end);
      setGradientDirection(preset.direction);
      apply({
        pageBackgroundType: 'gradient',
        pageBackgroundGradientStart: preset.start,
        pageBackgroundGradientEnd: preset.end,
        pageBackgroundGradientDirection: preset.direction
      });
    } else {
      apply({ pageBackgroundType: 'gradient' });
    }
  };

  const handleApplyPattern = (id: string) => {
    setPatternId(id);
    apply({ pageBackgroundType: 'pattern', pageBackgroundPatternId: id, pageBackgroundPatternColor1: patternColor1, pageBackgroundPatternColor2: patternColor2, pageBackgroundPatternOpacity: patternOpacity, pageBackgroundPatternFixed: patternFixed });
  };

  const handleApplyImage = () => {
    if (!imageUrl.trim()) return;
    apply({ pageBackgroundType: 'image' });
  };

  const handleImageOptionChange = (overrides: Partial<SpaceStyles> = {}) => {
    if (!imageUrl.trim()) return;
    const next: SpaceStyles = {
      ...styles,
      pageBackgroundType: 'image',
      pageBackgroundImageUrl: imageUrl.trim(),
      pageBackgroundBlur: imageBlur,
      pageBackgroundDarkOverlay: imageDarkOverlay,
      pageBackgroundOpacity: opacity,
      pageBackgroundImagePosition: imagePosition,
      pageBackgroundImageSize: imageSize,
      ...overrides
    };
    onApply(next);
  };

  const tabs: { id: PageBackgroundType | 'celebration'; label: string }[] = [
    { id: 'none', label: 'Default' },
    { id: 'solid', label: 'Solid' },
    { id: 'gradient', label: 'Gradient' },
    { id: 'pattern', label: 'Pattern' },
    { id: 'image', label: 'Image' },
    { id: 'celebration', label: 'Celebration' }
  ];

  const dialogContent = (
    <div className="fixed inset-0 z-[10000] p-4 pointer-events-none">
      <div className="absolute inset-0 bg-black/50 dark:bg-black/60 pointer-events-auto" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden pointer-events-auto"
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -50%)',
          cursor: isDragging ? 'grabbing' : 'default'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={headerRef}
          onMouseDown={handleHeaderMouseDown}
          className={`flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-violet-50 dark:from-slate-800 dark:to-violet-900/20 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Page background</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveTab(id);
                persistTab(id);
              }}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {activeTab === 'none' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Use the default page background (light or dark depending on theme).
              </p>
              <button
                type="button"
                onClick={handleApplyNone}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Use default
              </button>
            </div>
          )}

          {activeTab === 'solid' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Metallic & solid presets</p>
              <div className="grid grid-cols-4 gap-2">
                {SOLID_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setSolidColor(preset.color);
                      apply({ pageBackgroundType: 'solid', pageBackgroundSolidColor: preset.color });
                    }}
                    className="h-10 rounded-xl border-2 border-slate-200 dark:border-slate-600 overflow-hidden hover:ring-2 hover:ring-brand-500 transition-all"
                    style={{ backgroundColor: preset.color }}
                    title={preset.name}
                  />
                ))}
              </div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mt-3">Custom color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={solidColor}
                  onChange={(e) => setSolidColor(e.target.value)}
                  className="h-10 w-14 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer bg-transparent"
                />
                <input
                  type="text"
                  value={solidColor}
                  onChange={(e) => setSolidColor(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleApplySolid}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
              >
                Apply
              </button>
            </div>
          )}

          {activeTab === 'gradient' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Metallic-style presets</p>
              <div className="grid grid-cols-4 gap-2">
                {METALLIC_GRADIENT_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleApplyGradient(preset)}
                    className="h-10 rounded-xl border-2 border-slate-200 dark:border-slate-600 overflow-hidden hover:ring-2 hover:ring-brand-500 transition-all"
                    style={{
                      background: `linear-gradient(${preset.direction}deg, ${preset.start}, ${preset.end})`
                    }}
                    title={preset.name}
                  />
                ))}
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 pt-2">Color presets</p>
              <div className="grid grid-cols-4 gap-2">
                {GRADIENT_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleApplyGradient(preset)}
                    className="h-12 rounded-xl border-2 border-slate-200 dark:border-slate-600 overflow-hidden hover:ring-2 hover:ring-brand-500 transition-all"
                    style={{
                      background: `linear-gradient(${preset.direction}deg, ${preset.start}, ${preset.end})`
                    }}
                    title={preset.name}
                  />
                ))}
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Custom</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Start</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={gradientStart}
                        onChange={(e) => setGradientStart(e.target.value)}
                        className="h-9 w-12 rounded border border-slate-300 dark:border-slate-600 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={gradientStart}
                        onChange={(e) => setGradientStart(e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">End</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={gradientEnd}
                        onChange={(e) => setGradientEnd(e.target.value)}
                        className="h-9 w-12 rounded border border-slate-300 dark:border-slate-600 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={gradientEnd}
                        onChange={(e) => setGradientEnd(e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-xs"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Angle: {gradientDirection}°</label>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={gradientDirection}
                    onChange={(e) => setGradientDirection(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div className="mt-2">
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Type</label>
                  <select
                    value={gradientType}
                    onChange={(e) => setGradientType(e.target.value as 'linear' | 'radial' | 'conic')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                  >
                    <option value="linear">Linear</option>
                    <option value="radial">Radial</option>
                    <option value="conic">Conic</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => handleApplyGradient()}
                  className="mt-3 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
                >
                  Apply custom
                </button>
              </div>
            </div>
          )}

          {activeTab === 'pattern' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Choose a pattern and set colors. Many patterns use both colors.
              </p>
              <div className="grid grid-cols-2 gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Pattern color 1</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={patternColor1}
                      onChange={(e) => setPatternColor1(e.target.value)}
                      className="h-9 w-11 rounded border border-slate-300 dark:border-slate-600 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={patternColor1}
                      onChange={(e) => setPatternColor1(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Pattern color 2</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={patternColor2}
                      onChange={(e) => setPatternColor2(e.target.value)}
                      className="h-9 w-11 rounded border border-slate-300 dark:border-slate-600 cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={patternColor2}
                      onChange={(e) => setPatternColor2(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-xs"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Pattern intensity: {patternOpacity}%</label>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={patternOpacity}
                    onChange={(e) => setPatternOpacity(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pattern-fixed"
                    checked={patternFixed}
                    onChange={(e) => setPatternFixed(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                  />
                  <label htmlFor="pattern-fixed" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                    Keep pattern still (fixed when scrolling)
                  </label>
                </div>
                <div className="col-span-2">
                  <button
                    type="button"
                    onClick={() => apply({ pageBackgroundType: 'pattern', pageBackgroundPatternId: patternId, pageBackgroundPatternColor1: patternColor1, pageBackgroundPatternColor2: patternColor2, pageBackgroundPatternOpacity: patternOpacity, pageBackgroundPatternFixed: patternFixed })}
                    className="px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
                  >
                    Apply pattern colors
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {PATTERNS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleApplyPattern(p.id)}
                    className={`flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-all ${
                      patternId === p.id
                        ? 'border-brand-500 ring-2 ring-brand-500/30'
                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                    }`}
                  >
                    <div
                      className="w-full h-14 rounded-lg bg-slate-100 dark:bg-slate-700"
                      style={{
                        background: p.preview,
                        backgroundSize: p.previewSize || (p.id === 'grid' || p.id === 'cross' ? '16px 16px' : p.id === 'hexagon' ? '24px 42px' : '24px 24px'),
                        backgroundColor: '#f1f5f9'
                      }}
                    />
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'image' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Upload image (JPG, PNG, SVG, WebP, GIF)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES}
                  onChange={handleImageFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                >
                  Choose file...
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Or paste image URL</label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => { setImageUrl(e.target.value); }}
                  placeholder="https://example.com/your-image.jpg or /uploads/photo.jpg"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                />
                {imageUrl.trim() && (() => {
                  const resolved = styleService.resolvePageBackgroundImageUrl(imageUrl);
                  const isHttp = /^https?:\/\//i.test(resolved);
                  return (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {isHttp ? (
                        <a
                          href={resolved}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-600 hover:text-brand-500 underline"
                        >
                          Open image in new tab
                        </a>
                      ) : resolved.startsWith('data:') ? (
                        <span>Image from file (preview below)</span>
                      ) : (
                        <span>Resolved: {resolved}</span>
                      )}
                    </p>
                  );
                })()}
              </div>
              {imageUrl.trim() && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Preview</label>
                  <div className="w-full h-24 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center">
                    {!imagePreviewError ? (
                      <img
                        key={imageUrl}
                        src={styleService.resolvePageBackgroundImageUrl(imageUrl)}
                        alt="Background preview"
                        className="max-w-full max-h-full object-contain"
                        onError={() => setImagePreviewError(true)}
                        onLoad={() => setImagePreviewError(false)}
                      />
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-slate-400 px-2 text-center">Image failed to load. Check URL or try another source.</span>
                    )}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Position</label>
                  <select
                    value={imagePosition}
                    onChange={(e) => { const v = e.target.value; setImagePosition(v); handleImageOptionChange({ pageBackgroundImagePosition: v }); }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                  >
                    <option value="center">Center</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="top left">Top left</option>
                    <option value="top right">Top right</option>
                    <option value="bottom left">Bottom left</option>
                    <option value="bottom right">Bottom right</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Size</label>
                  <select
                    value={imageSize}
                    onChange={(e) => { const v = e.target.value; setImageSize(v); handleImageOptionChange({ pageBackgroundImageSize: v }); }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                  >
                    <option value="cover">Cover (fill)</option>
                    <option value="contain">Contain (fit)</option>
                    <option value="auto">Auto</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Blur: {imageBlur === 0 ? 'None' : `${imageBlur}px`}</label>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={imageBlur}
                  onChange={(e) => { const v = Number(e.target.value); setImageBlur(v); handleImageOptionChange({ pageBackgroundBlur: v }); }}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Dark overlay (text readability): {imageDarkOverlay}%</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={imageDarkOverlay}
                  onChange={(e) => { setImageDarkOverlay(Number(e.target.value)); handleImageOptionChange(); }}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Image opacity: {opacity}%</label>
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={opacity}
                  onChange={(e) => { const v = Number(e.target.value); setOpacity(v); handleImageOptionChange({ pageBackgroundOpacity: v }); }}
                  className="w-full"
                />
              </div>
              <button
                type="button"
                onClick={handleApplyImage}
                disabled={!imageUrl.trim()}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                Apply & save image
              </button>
            </div>
          )}

          {activeTab === 'celebration' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Add amazing celebration effects over the page. Choose from fireworks, confetti, hearts, snow, bubbles, matrix rain, and more!
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="celebration-enabled"
                  checked={celebrationEnabled}
                  onChange={(e) => {
                    setCelebrationEnabled(e.target.checked);
                    apply({
                      celebrationEffectEnabled: e.target.checked,
                      celebrationEffectType: celebrationType,
                      celebrationIntensity: celebrationIntensity,
                      celebrationParticleSize: celebrationParticleSize,
                      celebrationSpeed: celebrationSpeed,
                      celebrationColor1: celebrationColor1,
                      celebrationColor2: celebrationColor2,
                      celebrationColor3: celebrationColor3,
                      celebrationShowOnForeground: celebrationShowOnForeground,
                    });
                  }}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="celebration-enabled" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  Enable celebration effects
                </label>
              </div>
              
              {/* Foreground/Background Toggle */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                <input
                  type="checkbox"
                  id="celebration-foreground"
                  checked={celebrationShowOnForeground}
                  onChange={(e) => {
                    const newValue = e.target.checked;
                    setCelebrationShowOnForeground(newValue);
                    apply({ celebrationShowOnForeground: newValue });
                  }}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500"
                />
                <div className="flex-1">
                  <label htmlFor="celebration-foreground" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-2">
                    Show on foreground
                    <span className={`text-xs px-2 py-0.5 rounded-full ${celebrationShowOnForeground ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-400'}`}>
                      {celebrationShowOnForeground ? 'Above content' : 'Behind content'}
                    </span>
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {celebrationShowOnForeground 
                      ? 'Effects appear on top of all content (more visible)' 
                      : 'Effects appear behind tiles and content'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Effect type</label>
                <div className="grid grid-cols-4 gap-1.5 max-h-64 overflow-y-auto">
                  {([
                    { value: 'none', label: 'Off', icon: '⭕' },
                    { value: 'fireworks', label: 'Fireworks', icon: '🎆' },
                    { value: 'rocket-fireworks', label: 'Rocket', icon: '🚀' },
                    { value: 'confetti', label: 'Confetti', icon: '🎊' },
                    { value: 'balloons', label: 'Balloons', icon: '🎈' },
                    { value: 'hearts', label: 'Hearts', icon: '💖' },
                    { value: 'snow', label: 'Snow', icon: '❄️' },
                    { value: 'bubbles', label: 'Bubbles', icon: '🫧' },
                    { value: 'matrix', label: 'Matrix', icon: '💚' },
                    { value: 'shooting-stars', label: 'Stars', icon: '⭐' },
                    { value: 'floating-ribbons', label: 'Ribbons', icon: '🎀' },
                    { value: 'sparkles', label: 'Sparkles', icon: '✨' },
                    { value: 'rain', label: 'Rain', icon: '🌧️' },
                    { value: 'leaves', label: 'Leaves', icon: '🍂' },
                    { value: 'fireflies', label: 'Fireflies', icon: '🪲' },
                    { value: 'petals', label: 'Petals', icon: '🌸' },
                    { value: 'aurora', label: 'Aurora', icon: '🌌' },
                    { value: 'cosmic', label: 'Cosmic', icon: '🌠' },
                    { value: 'meteors', label: 'Meteors', icon: '☄️' },
                    { value: 'dandelion', label: 'Dandelion', icon: '🌼' },
                    { value: 'butterflies', label: 'Butterflies', icon: '🦋' },
                    { value: 'lightning', label: 'Lightning', icon: '⚡' },
                  ] as const).map((effect) => (
                    <button
                      key={effect.value}
                      type="button"
                      onClick={() => {
                        setCelebrationType(effect.value as CelebrationEffectType);
                        if (effect.value === 'none') setCelebrationEnabled(false);
                        apply({
                          celebrationEffectType: effect.value as CelebrationEffectType,
                          celebrationEffectEnabled: effect.value !== 'none' ? celebrationEnabled : false,
                        });
                      }}
                      className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl text-xs font-medium transition-all ${
                        celebrationType === effect.value
                          ? 'bg-brand-600 text-white ring-2 ring-brand-400 ring-offset-2 dark:ring-offset-slate-800'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      <span className="text-lg">{effect.icon}</span>
                      <span>{effect.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {celebrationType !== 'none' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Intensity: {celebrationIntensity}%</label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={celebrationIntensity}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setCelebrationIntensity(v);
                        apply({ celebrationIntensity: v });
                      }}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Particle / item size: {celebrationParticleSize}</label>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={celebrationParticleSize}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setCelebrationParticleSize(v);
                        apply({ celebrationParticleSize: v });
                      }}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Animation speed: {celebrationSpeed}%</label>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={celebrationSpeed}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setCelebrationSpeed(v);
                        apply({ celebrationSpeed: v });
                      }}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Opacity: {celebrationOpacity}%</label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={celebrationOpacity}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setCelebrationOpacity(v);
                        apply({ celebrationOpacity: v });
                      }}
                      className="w-full"
                    />
                  </div>
                  {(['fireworks', 'rocket-fireworks'].includes(celebrationType) && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Burst interval: {celebrationBurstInterval}ms</label>
                      <input
                        type="range"
                        min={500}
                        max={5000}
                        step={100}
                        value={celebrationBurstInterval}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setCelebrationBurstInterval(v);
                          apply({ celebrationBurstInterval: v });
                        }}
                        className="w-full"
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Lower = more frequent bursts</p>
                    </div>
                  ))}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Color 1</label>
                      <div className="flex gap-1">
                        <input
                          type="color"
                          value={celebrationColor1}
                          onChange={(e) => setCelebrationColor1(e.target.value)}
                          className="h-9 w-10 rounded border border-slate-300 dark:border-slate-600 cursor-pointer bg-transparent"
                        />
                        <input
                          type="text"
                          value={celebrationColor1}
                          onChange={(e) => setCelebrationColor1(e.target.value)}
                          className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Color 2</label>
                      <div className="flex gap-1">
                        <input
                          type="color"
                          value={celebrationColor2}
                          onChange={(e) => setCelebrationColor2(e.target.value)}
                          className="h-9 w-10 rounded border border-slate-300 dark:border-slate-600 cursor-pointer bg-transparent"
                        />
                        <input
                          type="text"
                          value={celebrationColor2}
                          onChange={(e) => setCelebrationColor2(e.target.value)}
                          className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Color 3</label>
                      <div className="flex gap-1">
                        <input
                          type="color"
                          value={celebrationColor3}
                          onChange={(e) => setCelebrationColor3(e.target.value)}
                          className="h-9 w-10 rounded border border-slate-300 dark:border-slate-600 cursor-pointer bg-transparent"
                        />
                        <input
                          type="text"
                          value={celebrationColor3}
                          onChange={(e) => setCelebrationColor3(e.target.value)}
                          className="flex-1 min-w-0 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-xs"
                        />
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => apply()}
                    className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
                  >
                    Apply celebration settings
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!isOpen) return null;
  return createPortal(dialogContent, document.body);
};
