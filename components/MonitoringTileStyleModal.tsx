import React, { useState, useEffect } from 'react';
import { FaTimes, FaPalette } from 'react-icons/fa';
import { userPreferencesService } from '../services/userPreferencesService';

export interface TileStyle {
    // UP State
    upBackgroundColor: string;
    upTextColor: string;
    upUseGradient: boolean;
    upGradientStart: string;
    upGradientEnd: string;
    
    // DOWN State
    downBackgroundColor: string;
    downTextColor: string;
    downUseGradient: boolean;
    downGradientStart: string;
    downGradientEnd: string;
}

interface MonitoringTileStyleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onStylesChange: (styles: TileStyle) => void;
}

const defaultStyles: TileStyle = {
    upBackgroundColor: '#10b981', // emerald-600
    upTextColor: '#ffffff',
    upUseGradient: false,
    upGradientStart: '#10b981',
    upGradientEnd: '#059669',
    downBackgroundColor: '#dc2626', // red-600
    downTextColor: '#ffffff',
    downUseGradient: false,
    downGradientStart: '#dc2626',
    downGradientEnd: '#b91c1c',
};

export const MonitoringTileStyleModal: React.FC<MonitoringTileStyleModalProps> = ({
    isOpen,
    onClose,
    onStylesChange
}) => {
    const [styles, setStyles] = useState<TileStyle>(defaultStyles);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadStyles();
        }
    }, [isOpen]);

    const loadStyles = async () => {
        setIsLoading(true);
        try {
            const preferences = await userPreferencesService.getPreferences();
            
            const loadedStyles: TileStyle = {
                upBackgroundColor: preferences['monitor_tile_up_bg'] as string || defaultStyles.upBackgroundColor,
                upTextColor: preferences['monitor_tile_up_text'] as string || defaultStyles.upTextColor,
                upUseGradient: preferences['monitor_tile_up_gradient'] === 'true' || preferences['monitor_tile_up_gradient'] === true,
                upGradientStart: preferences['monitor_tile_up_gradient_start'] as string || defaultStyles.upGradientStart,
                upGradientEnd: preferences['monitor_tile_up_gradient_end'] as string || defaultStyles.upGradientEnd,
                downBackgroundColor: preferences['monitor_tile_down_bg'] as string || defaultStyles.downBackgroundColor,
                downTextColor: preferences['monitor_tile_down_text'] as string || defaultStyles.downTextColor,
                downUseGradient: preferences['monitor_tile_down_gradient'] === 'true' || preferences['monitor_tile_down_gradient'] === true,
                downGradientStart: preferences['monitor_tile_down_gradient_start'] as string || defaultStyles.downGradientStart,
                downGradientEnd: preferences['monitor_tile_down_gradient_end'] as string || defaultStyles.downGradientEnd,
            };
            
            setStyles(loadedStyles);
            onStylesChange(loadedStyles);
        } catch (error) {
            console.error('Failed to load tile styles:', error);
            setStyles(defaultStyles);
            onStylesChange(defaultStyles);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await userPreferencesService.updatePreferences({
                'monitor_tile_up_bg': styles.upBackgroundColor,
                'monitor_tile_up_text': styles.upTextColor,
                'monitor_tile_up_gradient': styles.upUseGradient ? 'true' : 'false',
                'monitor_tile_up_gradient_start': styles.upGradientStart,
                'monitor_tile_up_gradient_end': styles.upGradientEnd,
                'monitor_tile_down_bg': styles.downBackgroundColor,
                'monitor_tile_down_text': styles.downTextColor,
                'monitor_tile_down_gradient': styles.downUseGradient ? 'true' : 'false',
                'monitor_tile_down_gradient_start': styles.downGradientStart,
                'monitor_tile_down_gradient_end': styles.downGradientEnd,
            });
            
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

    if (!isOpen) return null;

    const getBackgroundStyle = (state: 'up' | 'down') => {
        const stateStyles = state === 'up' ? {
            useGradient: styles.upUseGradient,
            gradientStart: styles.upGradientStart,
            gradientEnd: styles.upGradientEnd,
            solidColor: styles.upBackgroundColor,
        } : {
            useGradient: styles.downUseGradient,
            gradientStart: styles.downGradientStart,
            gradientEnd: styles.downGradientEnd,
            solidColor: styles.downBackgroundColor,
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
            <div className="bg-white dark:bg-[#1e1e1e] rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-slate-200 dark:border-[#333] shadow-2xl flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-[#333] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <FaPalette size={20} className="text-blue-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Monitor Tile Styles</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Customize colors and gradients for UP and DOWN states</p>
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
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {/* UP State Styles */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 pb-2 border-b border-slate-200 dark:border-[#333]">
                                    <div
                                        className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                                        style={getBackgroundStyle('up')}
                                    >
                                        UP
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">UP State</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">Styles for monitors with UP status</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                                    {/* Use Gradient */}
                                    <div className="md:col-span-2">
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
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                            Preview
                                        </label>
                                        <div
                                            className="p-4 rounded-xl border border-slate-200 dark:border-[#333]"
                                            style={getBackgroundStyle('up')}
                                        >
                                            <div className="text-white">
                                                <div className="font-bold text-lg mb-1" style={{ color: styles.upTextColor }}>
                                                    Monitor Name
                                                </div>
                                                <div className="text-sm opacity-90" style={{ color: styles.upTextColor }}>
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
                                        className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                                        style={getBackgroundStyle('down')}
                                    >
                                        DOWN
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">DOWN State</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">Styles for monitors with DOWN status</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                                    {/* Use Gradient */}
                                    <div className="md:col-span-2">
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
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                            Preview
                                        </label>
                                        <div
                                            className="p-4 rounded-xl border border-slate-200 dark:border-[#333]"
                                            style={getBackgroundStyle('down')}
                                        >
                                            <div className="text-white">
                                                <div className="font-bold text-lg mb-1" style={{ color: styles.downTextColor }}>
                                                    Monitor Name
                                                </div>
                                                <div className="text-sm opacity-90" style={{ color: styles.downTextColor }}>
                                                    Status: DOWN
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
                <div className="p-6 bg-slate-50 dark:bg-[#252525] border-t border-slate-100 dark:border-[#333] flex items-center justify-between">
                    <button
                        onClick={resetToDefaults}
                        className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                        Reset to Defaults
                    </button>
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
