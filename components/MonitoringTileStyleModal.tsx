import React, { useState, useEffect, useRef } from 'react';
import { FaTimes, FaPalette, FaDownload, FaUpload } from 'react-icons/fa';
import { userPreferencesService } from '../services/userPreferencesService';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import {
    DEFAULT_FONT_FAMILY,
    DEFAULT_MONITOR_TILE_STYLES,
    hasMonitorTileStylePreferences,
    readCachedMonitorTileStyles,
    tileStylesFromPreferences,
    tileStylesToPreferences,
    writeCachedMonitorTileStyles,
} from '../utils/monitorTileStyles';
import type { TileStyle } from '../utils/monitorTileStyles';

export type { TileStyle } from '../utils/monitorTileStyles';

interface MonitoringTileStyleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onStylesChange: (styles: TileStyle) => void;
    initialStyles?: TileStyle;
}

const FONT_OPTIONS: { label: string; value: string }[] = [
    { label: 'System (Default)', value: DEFAULT_FONT_FAMILY },
    { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
    { label: 'Segoe UI', value: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' },
    { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
    { label: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
    { label: 'Courier New', value: '"Courier New", Courier, monospace' },
];

const defaultStyles: TileStyle = DEFAULT_MONITOR_TILE_STYLES;

export const MonitoringTileStyleModal: React.FC<MonitoringTileStyleModalProps> = ({
    isOpen,
    onClose,
    onStylesChange,
    initialStyles
}) => {
    const [styles, setStyles] = useState<TileStyle>(initialStyles || readCachedMonitorTileStyles);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEscapeToClose(isOpen, onClose);

    useEffect(() => {
        if (!isOpen) return;
        if (initialStyles) {
            setStyles(initialStyles);
            setIsLoading(false);
        }
        void loadStyles(!initialStyles);
        // Seed once per open from parent/cache; do not re-run when live preview updates parent.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const loadStyles = async (showSpinner: boolean) => {
        if (showSpinner) setIsLoading(true);
        try {
            const preferences = await userPreferencesService.getPreferences();
            if (hasMonitorTileStylePreferences(preferences)) {
                const loadedStyles = tileStylesFromPreferences(preferences);
                writeCachedMonitorTileStyles(loadedStyles);
                setStyles(loadedStyles);
                onStylesChange(loadedStyles);
            }
        } catch (error) {
            console.error('Failed to load tile styles:', error);
            const fallback = initialStyles || readCachedMonitorTileStyles();
            setStyles(fallback);
            onStylesChange(fallback);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await userPreferencesService.updatePreferences(tileStylesToPreferences(styles));
            writeCachedMonitorTileStyles(styles);
            onStylesChange(styles);
            onClose();
        } catch (error) {
            console.error('Failed to save tile styles:', error);
            alert('Failed to save tile styles. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const updateStyle = (key: keyof TileStyle, value: any) => {
        setStyles(prev => ({ ...prev, [key]: value }));
    };

    const resetToDefaults = () => {
        setStyles(defaultStyles);
    };

    const exportStyles = () => {
        try {
            const exportData = {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                styles: styles
            };
            
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `monitor-tile-styles-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export styles:', error);
            alert('Failed to export styles. Please try again.');
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                const importedData = JSON.parse(content);
                
                // Support both direct style objects and wrapped objects with metadata
                const importedStyles: TileStyle = importedData.styles || importedData;
                
                // Validate that all required fields are present
                const requiredFields: (keyof TileStyle)[] = [
                    'upBackgroundColor', 'upTextColor', 'upUseGradient', 'upGradientStart', 
                    'upGradientEnd', 'upFontFamily',
                    'downBackgroundColor', 'downTextColor', 'downUseGradient', 'downGradientStart',
                    'downGradientEnd', 'downFontFamily',
                    'warningBackgroundColor', 'warningTextColor', 'warningUseGradient', 
                    'warningGradientStart', 'warningGradientEnd', 'warningFontFamily',
                    'borderRadius'
                ];
                
                const missingFields = requiredFields.filter(field => !(field in importedStyles));
                if (missingFields.length > 0) {
                    alert(`Invalid style file. Missing required fields: ${missingFields.join(', ')}`);
                    return;
                }
                
                // Validate types
                if (typeof importedStyles.borderRadius !== 'number') {
                    importedStyles.borderRadius = Number(importedStyles.borderRadius) || defaultStyles.borderRadius;
                }
                
                // Clamp borderRadius
                importedStyles.borderRadius = Math.max(0, Math.min(48, importedStyles.borderRadius));
                
                // Validate boolean fields
                if (typeof importedStyles.upUseGradient !== 'boolean') {
                    importedStyles.upUseGradient = importedStyles.upUseGradient === 'true' || importedStyles.upUseGradient === true;
                }
                if (typeof importedStyles.downUseGradient !== 'boolean') {
                    importedStyles.downUseGradient = importedStyles.downUseGradient === 'true' || importedStyles.downUseGradient === true;
                }
                if (typeof importedStyles.warningUseGradient !== 'boolean') {
                    importedStyles.warningUseGradient = importedStyles.warningUseGradient === 'true' || importedStyles.warningUseGradient === true;
                }
                
                setStyles(importedStyles);
                // Notify parent component of the imported styles
                onStylesChange(importedStyles);
                
                // Show success message and auto-save
                if (window.confirm('Styles imported successfully! Would you like to save them now?')) {
                    // Create a save function that uses the imported styles
                    const saveImportedStyles = async () => {
                        setIsSaving(true);
                        try {
                            await userPreferencesService.updatePreferences(tileStylesToPreferences(importedStyles));
                            writeCachedMonitorTileStyles(importedStyles);
                            
                            alert('Styles saved successfully!');
                        } catch (error) {
                            console.error('Failed to save imported styles:', error);
                            alert('Failed to save imported styles. Please try again.');
                        } finally {
                            setIsSaving(false);
                        }
                    };
                    
                    saveImportedStyles();
                } else {
                    alert('Styles loaded. Click "Save Styles" to apply them permanently.');
                }
            } catch (error) {
                console.error('Failed to import styles:', error);
                alert('Failed to import styles. Please ensure the file is a valid JSON format.');
            }
        };
        
        reader.readAsText(file);
        
        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    if (!isOpen) return null;

    const getBackgroundStyle = (state: 'up' | 'down' | 'warning') => {
        const stateStyles = state === 'up'
            ? {
                useGradient: styles.upUseGradient,
                gradientStart: styles.upGradientStart,
                gradientEnd: styles.upGradientEnd,
                solidColor: styles.upBackgroundColor,
            }
            : state === 'down'
                ? {
                    useGradient: styles.downUseGradient,
                    gradientStart: styles.downGradientStart,
                    gradientEnd: styles.downGradientEnd,
                    solidColor: styles.downBackgroundColor,
                }
                : {
                    useGradient: styles.warningUseGradient,
                    gradientStart: styles.warningGradientStart,
                    gradientEnd: styles.warningGradientEnd,
                    solidColor: styles.warningBackgroundColor,
                };
        
        if (stateStyles.useGradient) {
            return {
                background: `linear-gradient(135deg, ${stateStyles.gradientStart}, ${stateStyles.gradientEnd})`
            };
        }
        return {
            backgroundColor: stateStyles.solidColor
        };
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden border border-slate-200 dark:border-[#333] shadow-2xl flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-slate-100 dark:border-[#333] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <FaPalette size={20} className="text-blue-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Monitor Tile Styles</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Customize styles for UP, DOWN, and WARNING states</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-[#333] rounded-xl transition-all text-slate-500"
                    >
                        <FaTimes size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Shared */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-2xl border border-slate-200 dark:border-[#333] bg-slate-50 dark:bg-[#252525]">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Tile Corner Radius
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="range"
                                            min={0}
                                            max={48}
                                            step={1}
                                            value={styles.borderRadius}
                                            onChange={(e) => updateStyle('borderRadius', parseInt(e.target.value, 10) || 0)}
                                            className="w-full"
                                        />
                                        <input
                                            type="number"
                                            min={0}
                                            max={48}
                                            value={styles.borderRadius}
                                            onChange={(e) => updateStyle('borderRadius', Math.max(0, Math.min(48, parseInt(e.target.value, 10) || 0)))}
                                            className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                                        Applies to monitor tiles in the dashboard (tiles/compact views).
                                    </p>
                                </div>
                                <div className="flex items-center justify-center">
                                    <div
                                        className="w-full p-3 border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1e1e1e]"
                                        style={{ borderRadius: styles.borderRadius }}
                                    >
                                        <div className="text-xs font-bold text-slate-700 dark:text-slate-200">Preview</div>
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Radius: {styles.borderRadius}px</div>
                                    </div>
                                </div>
                            </div>

                            {/* UP State Styles */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 pb-2 border-b border-slate-200 dark:border-[#333]">
                                    <div
                                        className="px-3 py-2 rounded-xl flex items-center justify-center text-white font-black text-[10px] tracking-widest uppercase leading-none"
                                        style={getBackgroundStyle('up')}
                                    >
                                        UP
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">UP State</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">Styles for monitors with UP status</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Background Color */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Background Color
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="color"
                                                value={styles.upBackgroundColor}
                                                onChange={(e) => updateStyle('upBackgroundColor', e.target.value)}
                                                className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                                disabled={styles.upUseGradient}
                                            />
                                            <input
                                                type="text"
                                                value={styles.upBackgroundColor}
                                                onChange={(e) => updateStyle('upBackgroundColor', e.target.value)}
                                                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
                                                placeholder="#10b981"
                                                disabled={styles.upUseGradient}
                                            />
                                        </div>
                                    </div>

                                    {/* Text Color */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Text Color
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="color"
                                                value={styles.upTextColor}
                                                onChange={(e) => updateStyle('upTextColor', e.target.value)}
                                                className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={styles.upTextColor}
                                                onChange={(e) => updateStyle('upTextColor', e.target.value)}
                                                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
                                                placeholder="#ffffff"
                                            />
                                        </div>
                                    </div>

                                    {/* Font */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Font Style
                                        </label>
                                        <select
                                            value={styles.upFontFamily}
                                            onChange={(e) => updateStyle('upFontFamily', e.target.value)}
                                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                                        >
                                            {FONT_OPTIONS.map(opt => (
                                                <option key={opt.label} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Use Gradient */}
                                    <div className="md:col-span-3">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={styles.upUseGradient}
                                                onChange={(e) => updateStyle('upUseGradient', e.target.checked)}
                                                className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                Use Gradient Background
                                            </span>
                                        </label>
                                    </div>

                                    {/* Gradient Colors */}
                                    {styles.upUseGradient && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    Gradient Start Color
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="color"
                                                        value={styles.upGradientStart}
                                                        onChange={(e) => updateStyle('upGradientStart', e.target.value)}
                                                        className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={styles.upGradientStart}
                                                        onChange={(e) => updateStyle('upGradientStart', e.target.value)}
                                                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
                                                        placeholder="#10b981"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    Gradient End Color
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="color"
                                                        value={styles.upGradientEnd}
                                                        onChange={(e) => updateStyle('upGradientEnd', e.target.value)}
                                                        className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={styles.upGradientEnd}
                                                        onChange={(e) => updateStyle('upGradientEnd', e.target.value)}
                                                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
                                                        placeholder="#059669"
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* Preview */}
                                    <div className="md:col-span-3">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                            Preview
                                        </label>
                                        <div
                                            className="p-3 border border-slate-200 dark:border-[#333]"
                                            style={{ ...getBackgroundStyle('up'), borderRadius: styles.borderRadius, fontFamily: styles.upFontFamily }}
                                        >
                                            <div className="text-white">
                                                <div className="font-bold text-base mb-0.5" style={{ color: styles.upTextColor }}>
                                                    Monitor Name
                                                </div>
                                                <div className="text-xs opacity-90" style={{ color: styles.upTextColor }}>
                                                    Status: UP
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* DOWN State Styles */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 pb-2 border-b border-slate-200 dark:border-[#333]">
                                    <div
                                        className="px-3 py-2 rounded-xl flex items-center justify-center text-white font-black text-[10px] tracking-widest uppercase leading-none"
                                        style={getBackgroundStyle('down')}
                                    >
                                        DOWN
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">DOWN State</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">Styles for monitors with DOWN status</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Background Color */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Background Color
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="color"
                                                value={styles.downBackgroundColor}
                                                onChange={(e) => updateStyle('downBackgroundColor', e.target.value)}
                                                className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                                disabled={styles.downUseGradient}
                                            />
                                            <input
                                                type="text"
                                                value={styles.downBackgroundColor}
                                                onChange={(e) => updateStyle('downBackgroundColor', e.target.value)}
                                                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
                                                placeholder="#dc2626"
                                                disabled={styles.downUseGradient}
                                            />
                                        </div>
                                    </div>

                                    {/* Text Color */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Text Color
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="color"
                                                value={styles.downTextColor}
                                                onChange={(e) => updateStyle('downTextColor', e.target.value)}
                                                className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={styles.downTextColor}
                                                onChange={(e) => updateStyle('downTextColor', e.target.value)}
                                                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
                                                placeholder="#ffffff"
                                            />
                                        </div>
                                    </div>

                                    {/* Font */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Font Style
                                        </label>
                                        <select
                                            value={styles.downFontFamily}
                                            onChange={(e) => updateStyle('downFontFamily', e.target.value)}
                                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                                        >
                                            {FONT_OPTIONS.map(opt => (
                                                <option key={opt.label} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Use Gradient */}
                                    <div className="md:col-span-3">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={styles.downUseGradient}
                                                onChange={(e) => updateStyle('downUseGradient', e.target.checked)}
                                                className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                Use Gradient Background
                                            </span>
                                        </label>
                                    </div>

                                    {/* Gradient Colors */}
                                    {styles.downUseGradient && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    Gradient Start Color
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="color"
                                                        value={styles.downGradientStart}
                                                        onChange={(e) => updateStyle('downGradientStart', e.target.value)}
                                                        className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={styles.downGradientStart}
                                                        onChange={(e) => updateStyle('downGradientStart', e.target.value)}
                                                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
                                                        placeholder="#dc2626"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    Gradient End Color
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="color"
                                                        value={styles.downGradientEnd}
                                                        onChange={(e) => updateStyle('downGradientEnd', e.target.value)}
                                                        className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={styles.downGradientEnd}
                                                        onChange={(e) => updateStyle('downGradientEnd', e.target.value)}
                                                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
                                                        placeholder="#b91c1c"
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* Preview */}
                                    <div className="md:col-span-3">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                            Preview
                                        </label>
                                        <div
                                            className="p-3 border border-slate-200 dark:border-[#333]"
                                            style={{ ...getBackgroundStyle('down'), borderRadius: styles.borderRadius, fontFamily: styles.downFontFamily }}
                                        >
                                            <div className="text-white">
                                                <div className="font-bold text-base mb-0.5" style={{ color: styles.downTextColor }}>
                                                    Monitor Name
                                                </div>
                                                <div className="text-xs opacity-90" style={{ color: styles.downTextColor }}>
                                                    Status: DOWN
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* WARNING State Styles */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 pb-2 border-b border-slate-200 dark:border-[#333]">
                                    <div
                                        className="px-3 py-2 rounded-xl flex items-center justify-center text-white font-black text-[10px] tracking-widest uppercase leading-none"
                                        style={getBackgroundStyle('warning')}
                                    >
                                        WARN
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">WARNING State</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">Styles for monitors with WARNING status</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Background Color */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Background Color
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="color"
                                                value={styles.warningBackgroundColor}
                                                onChange={(e) => updateStyle('warningBackgroundColor', e.target.value)}
                                                className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                                disabled={styles.warningUseGradient}
                                            />
                                            <input
                                                type="text"
                                                value={styles.warningBackgroundColor}
                                                onChange={(e) => updateStyle('warningBackgroundColor', e.target.value)}
                                                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
                                                placeholder="#f59e0b"
                                                disabled={styles.warningUseGradient}
                                            />
                                        </div>
                                    </div>

                                    {/* Text Color */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Text Color
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="color"
                                                value={styles.warningTextColor}
                                                onChange={(e) => updateStyle('warningTextColor', e.target.value)}
                                                className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={styles.warningTextColor}
                                                onChange={(e) => updateStyle('warningTextColor', e.target.value)}
                                                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
                                                placeholder="#ffffff"
                                            />
                                        </div>
                                    </div>

                                    {/* Font */}
                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                            Font Style
                                        </label>
                                        <select
                                            value={styles.warningFontFamily}
                                            onChange={(e) => updateStyle('warningFontFamily', e.target.value)}
                                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                                        >
                                            {FONT_OPTIONS.map(opt => (
                                                <option key={opt.label} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Use Gradient */}
                                    <div className="md:col-span-3">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={styles.warningUseGradient}
                                                onChange={(e) => updateStyle('warningUseGradient', e.target.checked)}
                                                className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                Use Gradient Background
                                            </span>
                                        </label>
                                    </div>

                                    {/* Gradient Colors */}
                                    {styles.warningUseGradient && (
                                        <>
                                            <div className="space-y-2">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    Gradient Start Color
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="color"
                                                        value={styles.warningGradientStart}
                                                        onChange={(e) => updateStyle('warningGradientStart', e.target.value)}
                                                        className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={styles.warningGradientStart}
                                                        onChange={(e) => updateStyle('warningGradientStart', e.target.value)}
                                                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
                                                        placeholder="#f59e0b"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                                    Gradient End Color
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="color"
                                                        value={styles.warningGradientEnd}
                                                        onChange={(e) => updateStyle('warningGradientEnd', e.target.value)}
                                                        className="w-16 h-10 rounded-lg border border-slate-300 dark:border-slate-600 cursor-pointer"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={styles.warningGradientEnd}
                                                        onChange={(e) => updateStyle('warningGradientEnd', e.target.value)}
                                                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
                                                        placeholder="#d97706"
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* Preview */}
                                    <div className="md:col-span-3">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                            Preview
                                        </label>
                                        <div
                                            className="p-3 border border-slate-200 dark:border-[#333]"
                                            style={{ ...getBackgroundStyle('warning'), borderRadius: styles.borderRadius, fontFamily: styles.warningFontFamily }}
                                        >
                                            <div className="text-white">
                                                <div className="font-bold text-base mb-0.5" style={{ color: styles.warningTextColor }}>
                                                    Monitor Name
                                                </div>
                                                <div className="text-xs opacity-90" style={{ color: styles.warningTextColor }}>
                                                    Status: WARNING
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 dark:bg-[#252525] border-t border-slate-100 dark:border-[#333] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={resetToDefaults}
                            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        >
                            Reset to Defaults
                        </button>
                        <div className="h-6 w-px bg-slate-300 dark:bg-slate-600"></div>
                        <button
                            onClick={exportStyles}
                            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-2"
                        >
                            <FaDownload size={14} />
                            Export JSON
                        </button>
                        <button
                            onClick={handleImportClick}
                            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-2"
                        >
                            <FaUpload size={14} />
                            Import JSON
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json,application/json"
                            onChange={handleFileImport}
                            className="hidden"
                        />
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 bg-slate-200 dark:bg-[#333] hover:bg-slate-300 dark:hover:bg-[#444] text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-all active:scale-95"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSaving && (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            )}
                            Save Styles
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
