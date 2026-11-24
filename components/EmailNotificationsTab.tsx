import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import {
    NotificationRule,
    MonitorNotificationTimezoneInfo,
    getNotificationRules,
    createNotificationRule,
    updateNotificationRule,
    deleteNotificationRule,
    importNotificationRules,
    moveNotificationRule,
    parseDaysOfWeek,
    formatDaysOfWeek,
    getDayName,
    getMonitorNotificationTimezone,
    updateMonitorNotificationTimezone,
} from '../services/monitorNotificationService';
import {
    NOTIFICATION_SCHEDULE_PRESETS,
    matchNotificationSchedulePreset,
    formatPresetScheduleSummary,
    NotificationSchedulePreset,
} from '../utils/notificationRulePresets';
import { MonitorTogglePill } from './MonitorTogglePill';

interface EmailNotificationsTabProps {
    monitorId: number;
}

const NotificationTimezonePanel: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const { user } = useAuth();
    const isAdmin = !!user?.is_admin;
    const [info, setInfo] = useState<MonitorNotificationTimezoneInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(!compact);
    const [selectedTz, setSelectedTz] = useState('');
    const [dstCorrection, setDstCorrection] = useState(true);

    const loadTimezone = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const tz = await getMonitorNotificationTimezone();
            setInfo(tz);
            setSelectedTz(tz.configured_timezone ?? '');
            setDstCorrection(!!tz.dst_correction_enabled);
        } catch (err: any) {
            setError(err.message || 'Failed to load timezone');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTimezone();
    }, [loadTimezone]);

    const handleSaveTimezone = async () => {
        if (!isAdmin) return;
        try {
            setSaving(true);
            setError(null);
            const tz = await updateMonitorNotificationTimezone(selectedTz, dstCorrection);
            setInfo(tz);
            setSelectedTz(tz.configured_timezone ?? '');
            setDstCorrection(!!tz.dst_correction_enabled);
        } catch (err: any) {
            setError(err.message || 'Failed to save timezone');
        } finally {
            setSaving(false);
        }
    };

    const dayName = info ? getDayName(info.day_of_week) : '';

    const settingsDirty = info
        ? selectedTz !== (info.configured_timezone ?? '') || dstCorrection !== !!info.dst_correction_enabled
        : false;

    const dstStatusLabel = info
        ? !info.dst_correction_enabled
            ? `📌 Standard time only (${info.timezone_abbreviation})`
            : info.dst_active
              ? `☀️ Daylight Saving active (${info.timezone_abbreviation})`
              : info.dst_aware
                ? `🌙 Standard time (${info.timezone_abbreviation})`
                : `🕐 No DST in this zone (${info.timezone_abbreviation})`
        : '';

    return (
        <div className="rounded-lg border border-sky-200 overflow-hidden bg-sky-50/60">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-sky-100 hover:bg-sky-200 border-b border-sky-200"
            >
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg shrink-0" aria-hidden="true">🕐</span>
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-sky-900">Notification Timezone</div>
                        {!expanded && info && (
                            <div className="text-xs text-sky-700 truncate">
                                {info.effective_timezone} · {info.current_local_time} (UTC{info.utc_offset})
                                {dstStatusLabel ? ` · ${dstStatusLabel}` : ''}
                            </div>
                        )}
                        {!expanded && loading && (
                            <div className="text-xs text-sky-600">Loading…</div>
                        )}
                    </div>
                </div>
                <svg
                    className={`w-5 h-5 shrink-0 text-sky-700 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {expanded && (
                <div className="p-4 space-y-3">
                    {loading && !info && (
                        <p className="text-sm text-gray-500">Loading timezone…</p>
                    )}
                    {error && (
                        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</p>
                    )}
                    {info && (
                        <>
                            <p className="text-xs text-gray-600">
                                Schedule presets and time windows use this timezone when deciding whether to send email alerts.
                                IANA regions (e.g. America/New_York) automatically shift between standard and daylight time when DST correction is enabled.
                            </p>
                            {info && (
                                <div className={`text-xs rounded-lg px-3 py-2 border ${
                                    info.dst_correction_enabled && info.dst_active
                                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                                        : info.dst_correction_enabled
                                          ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                                          : 'bg-gray-50 border-gray-200 text-gray-800'
                                }`}>
                                    <span className="font-medium">{dstStatusLabel}</span>
                                    {info.dst_correction_enabled && info.next_dst_transition && (
                                        <span className="block mt-1 text-[11px] opacity-90">
                                            Next change: {info.next_dst_transition.label} on {info.next_dst_transition.at}
                                        </span>
                                    )}
                                    {!info.dst_correction_enabled && info.dst_aware && (
                                        <span className="block mt-1 text-[11px] opacity-90">
                                            Schedules use fixed standard offset UTC{info.standard_utc_offset} (DST ignored).
                                        </span>
                                    )}
                                </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                <div className="rounded-lg bg-white border border-sky-100 px-3 py-2">
                                    <div className="text-xs text-gray-500 uppercase tracking-wide">Active timezone</div>
                                    <div className="font-medium text-gray-900 mt-0.5">{info.effective_timezone}</div>
                                    {info.uses_custom_timezone ? (
                                        <div className="text-xs text-emerald-700 mt-1">Custom setting</div>
                                    ) : (
                                        <div className="text-xs text-gray-500 mt-1">Using server default (PHP)</div>
                                    )}
                                </div>
                                <div className="rounded-lg bg-white border border-sky-100 px-3 py-2">
                                    <div className="text-xs text-gray-500 uppercase tracking-wide">Current time there</div>
                                    <div className="font-medium text-gray-900 mt-0.5">{info.current_local_time}</div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {dayName} · UTC{info.utc_offset}
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500">
                                Server PHP timezone: <code className="bg-white px-1 rounded">{info.server_php_timezone}</code>
                                {!info.uses_custom_timezone && info.server_php_timezone !== info.effective_timezone && (
                                    <> · effective: <code className="bg-white px-1 rounded">{info.effective_timezone}</code></>
                                )}
                            </p>

                            {isAdmin ? (
                                <div className="space-y-3 pt-1">
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <select
                                            value={selectedTz}
                                            onChange={(e) => setSelectedTz(e.target.value)}
                                            className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                                        >
                                            <option value="">Use server default ({info.server_php_timezone})</option>
                                            {info.options.map((opt) => (
                                                <option key={opt.value} value={opt.value}>
                                                    {opt.label} ({opt.value})
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={handleSaveTimezone}
                                            disabled={saving || !settingsDirty}
                                            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium whitespace-nowrap"
                                        >
                                            {saving ? 'Saving…' : 'Apply Settings'}
                                        </button>
                                    </div>
                                    <label className="flex items-start gap-3 p-3 bg-white border border-sky-100 rounded-lg cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={dstCorrection}
                                            onChange={(e) => setDstCorrection(e.target.checked)}
                                            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                                        />
                                        <span className="text-sm text-gray-800">
                                            <span className="font-medium">Adjust for daylight saving time</span>
                                            <span className="block text-xs text-gray-600 mt-0.5">
                                                Recommended. Automatically moves schedules with spring/fall clock changes (e.g. 9:00 AM stays 9:00 AM local).
                                                Turn off to keep a fixed standard-time offset year-round.
                                            </span>
                                        </span>
                                    </label>
                                </div>
                            ) : (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                                    Only administrators can change the notification timezone. Contact an admin if schedule times look wrong.
                                </p>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export const EmailNotificationsTab: React.FC<EmailNotificationsTabProps> = ({ monitorId }) => {
    const { settings } = useSettings();
    const appName = settings?.app_name || 'LinkNest';
    const [rules, setRules] = useState<NotificationRule[]>([]);
    const [loading, setLoading] = useState(true); // initial load only
    const [error, setError] = useState<string | null>(null);
    const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const importFileRef = useRef<HTMLInputElement>(null);
    const [movingRuleId, setMovingRuleId] = useState<number | null>(null);

    useEffect(() => {
        loadRules(true);
    }, [monitorId]);

    useEffect(() => {
        console.log('[EmailNotificationsTab] Rules state updated:', JSON.stringify(rules.map(r => ({ id: r.id, name: r.name, sort_order: (r as any).sort_order })), null, 2));
    }, [rules]);

    const loadRules = async (showSpinner = false) => {
        try {
            if (showSpinner) setLoading(true);
            setError(null);
            const data = await getNotificationRules(monitorId);
            console.log('[loadRules] Loaded rules:', JSON.stringify(data.map(r => ({ id: r.id, name: r.name, sort_order: (r as any).sort_order })), null, 2));
            // API already returns rules in correct order (sorted by sort_order ASC)
            setRules(data.map(r => ({ ...r })));
        } catch (err: any) {
            setError(err.message || 'Failed to load notification rules');
        } finally {
            if (showSpinner) setLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingRule({
            name: '',
            monitor_id: monitorId,
            status_trigger: 'down',
            subject_template: `[{app_name} Monitor] {monitor_name} - {status}`,
            body_template: "Monitor: {monitor_name}\nStatus: {status}\nTime: {time}\nDetails: {details}",
            is_enabled: 1,
            recipients: [],
            cc: []
        });
        setIsCreating(true);
    };

    const handleEdit = (rule: NotificationRule) => {
        setEditingRule({ ...rule });
        setIsCreating(false);
    };

    const handleClone = (rule: NotificationRule) => {
        // Create a copy of the rule with a new name
        const clonedRule: NotificationRule = {
            ...rule,
            id: undefined, // Remove ID so it's treated as new
            name: `${rule.name} (Copy)`,
            created_at: undefined,
            updated_at: undefined
        };
        setEditingRule(clonedRule);
        setIsCreating(true);
    };

    const handleDelete = async (ruleId: number) => {
        if (!confirm('Are you sure you want to delete this notification rule?')) {
            return;
        }
        try {
            await deleteNotificationRule(ruleId);
            await loadRules();
        } catch (err: any) {
            setError(err.message || 'Failed to delete notification rule');
        }
    };

    const handleMove = async (ruleId: number, direction: 'up' | 'down') => {
        try {
            console.log(`[handleMove] Moving rule ${ruleId} ${direction}`);
            const beforeMove = rules.map(r => ({ id: r.id, name: r.name, sort_order: (r as any).sort_order }));
            console.log('[handleMove] Current rules before move:', JSON.stringify(beforeMove, null, 2));
            setError(null);
            setMovingRuleId(ruleId);
            const result = await moveNotificationRule(ruleId, direction);
            console.log('[handleMove] Move result:', JSON.stringify(result, null, 2));
            if (result.moved && result.current_rule && result.target_rule) {
                console.log(`[handleMove] Backend updated: Rule ${result.current_rule.id} -> sort_order ${result.current_rule.sort_order}, Rule ${result.target_rule.id} -> sort_order ${result.target_rule.sort_order}`);
                if (result.debug) {
                    console.log('[handleMove] Debug info:', JSON.stringify(result.debug, null, 2));
                }
            }
            // Update UI immediately using server-provided order (prevents flicker + avoids re-fetch)
            if (result.order_after && Array.isArray(result.order_after)) {
                const byId = new Map<number, NotificationRule>();
                for (const r of rules) {
                    if (r.id != null) byId.set(r.id, { ...r });
                }
                // apply new sort_order values and ordering
                const next = result.order_after
                    .map(o => {
                        const r = byId.get(o.id);
                        if (!r) return null;
                        (r as any).sort_order = o.sort_order;
                        return r;
                    })
                    .filter(Boolean) as NotificationRule[];
                if (next.length > 0) setRules(next);
            } else {
                // Fallback: re-fetch (silent, no spinner)
                await loadRules(false);
            }
        } catch (err: any) {
            console.error('[handleMove] Error:', err);
            setError(err.message || 'Failed to move notification rule');
        } finally {
            setMovingRuleId(null);
        }
    };

    const handleSave = async (ruleData: NotificationRule) => {
        try {
            setError(null);
            if (isCreating) {
                await createNotificationRule(ruleData);
            } else if (editingRule?.id) {
                await updateNotificationRule(editingRule.id, ruleData);
            }
            setEditingRule(null);
            setIsCreating(false);
            await loadRules();
        } catch (err: any) {
            setError(err.message || 'Failed to save notification rule');
        }
    };

    const handleCancel = () => {
        setEditingRule(null);
        setIsCreating(false);
    };

    const downloadFile = (filename: string, content: BlobPart, mime: string) => {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const handleExportJson = () => {
        const exported = {
            version: 1,
            monitor_id: monitorId,
            exported_at: new Date().toISOString(),
            rules: (rules || []).map(r => ({
                name: r.name,
                sort_order: r.sort_order ?? 0,
                status_trigger: r.status_trigger,
                time_window_start: r.time_window_start ?? null,
                time_window_end: r.time_window_end ?? null,
                days_of_week: r.days_of_week ?? null,
                subject_template: r.subject_template,
                body_template: r.body_template,
                from_name: r.from_name ?? null,
                from_email: r.from_email ?? null,
                is_enabled: r.is_enabled ?? 1,
                recipients: r.recipients ?? [],
                cc: r.cc ?? [],
            })),
        };
        downloadFile(`notification-rules-monitor-${monitorId}.json`, JSON.stringify(exported, null, 2), 'application/json;charset=utf-8');
    };

    const handleImportClick = () => {
        importFileRef.current?.click();
    };

    const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        // Reset input so selecting same file twice triggers change
        e.target.value = '';
        if (!f) return;

        try {
            setError(null);
            const text = await f.text();
            const parsed = JSON.parse(text);
            const importedRules = Array.isArray(parsed?.rules) ? parsed.rules : Array.isArray(parsed) ? parsed : null;
            if (!importedRules || !Array.isArray(importedRules)) {
                throw new Error('Invalid JSON file: expected { rules: [...] } or [...]');
            }

            const replace = confirm('Replace existing rules? Click OK to replace all current rules, or Cancel to add/merge.');
            await importNotificationRules(monitorId, { replace, rules: importedRules });
            await loadRules();
        } catch (err: any) {
            setError(err.message || 'Failed to import notification rules');
        }
    };

    if (loading) {
        return <div className="text-center py-8 text-gray-500">Loading notification rules...</div>;
    }

    if (editingRule) {
        return (
            <div className="space-y-4">
                <NotificationTimezonePanel compact />
                <NotificationRuleForm
                    rule={editingRule}
                    onSave={handleSave}
                    onCancel={handleCancel}
                    isCreating={isCreating}
                />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <NotificationTimezonePanel />
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                        Email Notification Rules
                    </h3>
                    <p className="text-xs text-gray-600 mt-1">
                        Configure advanced email notifications with time windows, multiple recipients, and custom templates.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        ref={importFileRef}
                        type="file"
                        accept="application/json,.json"
                        onChange={handleImportFileSelected}
                        className="hidden"
                    />
                    <button
                        onClick={handleExportJson}
                        className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors border border-blue-200"
                        title="Export notification rules to JSON"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </button>
                    <button
                        onClick={handleImportClick}
                        className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors border border-blue-200"
                        title="Import notification rules from JSON"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                    </button>
                    <button
                        onClick={handleCreate}
                        className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        title="Add new notification rule"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>
            </div>

            {error && (
                <div className="text-red-700 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">
                    <strong>Error:</strong> {error}
                </div>
            )}

            {rules.length === 0 ? (
                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="mb-2">No notification rules configured.</p>
                    <p className="text-xs">Click "Add Notification Rule" to create your first rule.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {rules.map((rule, idx) => {
                        const sortOrder = (rule as any).sort_order ?? 0;
                        return (
                            <NotificationRuleCard
                                key={`rule-${rule.id}-${sortOrder}-${idx}`}
                                rule={rule}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onMove={handleMove}
                                onClone={handleClone}
                                index={idx}
                                total={rules.length}
                                movingRuleId={movingRuleId}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

interface NotificationRuleCardProps {
    rule: NotificationRule;
    onEdit: (rule: NotificationRule) => void;
    onDelete: (ruleId: number) => void;
    onMove: (ruleId: number, direction: 'up' | 'down') => void;
    onClone: (rule: NotificationRule) => void;
    index: number;
    total: number;
    movingRuleId: number | null;
}

const NotificationRuleCard: React.FC<NotificationRuleCardProps> = ({ rule, onEdit, onDelete, onMove, onClone, index, total, movingRuleId }) => {
    const days = parseDaysOfWeek(rule.days_of_week);
    const hasTimeWindow = rule.time_window_start && rule.time_window_end;
    const hasDaysFilter = days.length > 0;
    const canMoveUp = index > 0;
    const canMoveDown = index < total - 1;
    const isMoving = !!rule.id && movingRuleId === rule.id;

    return (
        <div className="relative border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                    <div className="font-semibold text-gray-900 mb-1">
                        {rule.name || 'Notification Rule'}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${rule.status_trigger === 'up' ? 'bg-green-100 text-green-800' :
                            rule.status_trigger === 'down' ? 'bg-red-100 text-red-800' :
                                'bg-blue-100 text-blue-800'
                            }`}>
                            {rule.status_trigger === 'up' ? 'UP' : rule.status_trigger === 'down' ? 'DOWN' : 'BOTH'}
                        </span>
                        {rule.is_enabled === 1 ? (
                            <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">Enabled</span>
                        ) : (
                            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">Disabled</span>
                        )}
                    </div>

                    <div className="space-y-1 text-sm text-gray-700">
                        <div>
                            <strong>Recipients:</strong> {rule.recipients?.join(', ') || 'None'}
                        </div>
                        {rule.cc && rule.cc.length > 0 && (
                            <div>
                                <strong>CC:</strong> {rule.cc.join(', ')}
                            </div>
                        )}
                        {hasTimeWindow && (
                            <div>
                                <strong>Time Window:</strong> {rule.time_window_start} - {rule.time_window_end}
                            </div>
                        )}
                        {hasDaysFilter && (
                            <div>
                                <strong>Days:</strong> {days.map(d => getDayName(d)).join(', ')}
                            </div>
                        )}
                        <div className="text-xs text-gray-500 mt-2">
                            <strong>Subject:</strong> {rule.subject_template}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                    <button
                        onClick={() => onEdit(rule)}
                        className="p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors border border-blue-200"
                        title="Edit rule"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => onClone(rule)}
                        className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors border border-green-200"
                        title="Clone rule"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </button>
                    <button
                        onClick={() => rule.id && onDelete(rule.id)}
                        className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors border border-red-200"
                        title="Delete rule"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Move controls in lower-right corner */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1">
                <button
                    type="button"
                    onClick={() => {
                        console.log('[Move Up] Rule ID:', rule.id, 'Can Move:', canMoveUp);
                        if (rule.id && canMoveUp) onMove(rule.id, 'up');
                    }}
                    disabled={!canMoveUp || isMoving}
                    className="flex items-center justify-center w-7 h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors disabled:text-gray-300 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    title={isMoving ? "Moving..." : "Move rule up"}
                >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" strokeWidth={2} stroke="currentColor" />
                    </svg>
                </button>
                <button
                    type="button"
                    onClick={() => {
                        console.log('[Move Down] Rule ID:', rule.id, 'Can Move:', canMoveDown);
                        if (rule.id && canMoveDown) onMove(rule.id, 'down');
                    }}
                    disabled={!canMoveDown || isMoving}
                    className="flex items-center justify-center w-7 h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors disabled:text-gray-300 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    title={isMoving ? "Moving..." : "Move rule down"}
                >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" strokeWidth={2} stroke="currentColor" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

interface NotificationRuleFormProps {
    rule: NotificationRule;
    onSave: (rule: NotificationRule) => void;
    onCancel: () => void;
    isCreating: boolean;
}

const NotificationRuleForm: React.FC<NotificationRuleFormProps> = ({ rule, onSave, onCancel, isCreating }) => {
    const { settings } = useSettings();
    const appName = settings?.app_name || 'LinkNest';
    const [formData, setFormData] = useState<NotificationRule>(rule);
    const [recipientsText, setRecipientsText] = useState(rule.recipients?.join(', ') || '');
    const [ccText, setCcText] = useState(rule.cc?.join(', ') || '');
    const [selectedDays, setSelectedDays] = useState<number[]>(parseDaysOfWeek(rule.days_of_week));
    const [error, setError] = useState<string | null>(null);
    const [activePresetId, setActivePresetId] = useState<string | null>(null);
    const [presetsExpanded, setPresetsExpanded] = useState(isCreating);

    const matchedPreset = useMemo(
        () => matchNotificationSchedulePreset(formData.time_window_start, formData.time_window_end, selectedDays),
        [formData.time_window_start, formData.time_window_end, selectedDays]
    );

    const applySchedulePreset = (preset: NotificationSchedulePreset) => {
        setFormData({
            ...formData,
            time_window_start: preset.time_window_start,
            time_window_end: preset.time_window_end,
            name: (!formData.name?.trim() && preset.suggestedRuleName)
                ? preset.suggestedRuleName
                : formData.name,
        });
        setSelectedDays([...preset.days]);
        setActivePresetId(preset.id);
        setError(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validate rule name
        const ruleName = (formData.name || '').trim();
        if (!ruleName) {
            setError('Rule name is required');
            return;
        }

        // Validate recipients
        const recipients = recipientsText.split(',').map(r => r.trim()).filter(r => r.length > 0);
        if (recipients.length === 0) {
            setError('At least one recipient email is required');
            return;
        }

        // Validate email addresses (allow localhost for local testing)
        const emailRegex = /^[^\s@]+@([^\s@]+\.[^\s@]+|localhost|127\.0\.0\.1|::1)$/i;
        for (const email of recipients) {
            if (!emailRegex.test(email)) {
                setError(`Invalid email address: ${email}`);
                return;
            }
        }

        // Validate CC emails (optional)
        const cc = ccText.split(',').map(r => r.trim()).filter(r => r.length > 0);
        for (const email of cc) {
            if (!emailRegex.test(email)) {
                setError(`Invalid CC email address: ${email}`);
                return;
            }
        }

        // Validate time window if provided
        if (formData.time_window_start && formData.time_window_end) {
            const startMatch = formData.time_window_start.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/);
            const endMatch = formData.time_window_end.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/);
            if (!startMatch || !endMatch) {
                setError('Time window must be in HH:MM format (24-hour)');
                return;
            }
        }

        const ruleToSave: NotificationRule = {
            ...formData,
            name: ruleName,
            recipients,
            cc,
            days_of_week: selectedDays.length > 0 ? formatDaysOfWeek(selectedDays) : null
        };

        onSave(ruleToSave);
    };

    const toggleDay = (day: number) => {
        setActivePresetId(null);
        setSelectedDays(prev =>
            prev.includes(day)
                ? prev.filter(d => d !== day)
                : [...prev, day].sort()
        );
    };

    const handleTimeWindowChange = (field: 'time_window_start' | 'time_window_end', value: string) => {
        setActivePresetId(null);
        setFormData({ ...formData, [field]: value || null });
    };

    const FieldHelp: React.FC<{ text: string }> = ({ text }) => (
        <p className="text-xs text-gray-600 mt-1">{text}</p>
    );

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    {isCreating ? 'Create Notification Rule' : 'Edit Notification Rule'}
                </h3>
                <button
                    type="button"
                    onClick={onCancel}
                    className="text-gray-500 hover:text-gray-700 text-sm"
                >
                    Cancel
                </button>
            </div>

            {error && (
                <div className="text-red-700 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">
                    <strong>Error:</strong> {error}
                </div>
            )}

            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50">
                <div>
                    <div className="text-sm font-semibold text-gray-800">Rule enabled</div>
                    <p className="text-xs text-gray-600 mt-0.5">
                        {formData.is_enabled === 1 ? 'This rule will send emails when triggered' : 'This rule is paused'}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${formData.is_enabled === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                    >
                        {formData.is_enabled === 1 ? 'On' : 'Off'}
                    </span>
                    <MonitorTogglePill
                        enabled={formData.is_enabled === 1}
                        onToggle={() => setFormData({ ...formData, is_enabled: formData.is_enabled === 1 ? 0 : 1 })}
                        onClassName="bg-emerald-500"
                        labelOn="Enable notification rule"
                        labelOff="Disable notification rule"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rule Name <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder="e.g., Business Hours Alerts"
                    required
                />
                <FieldHelp text="A friendly name to identify this rule in the list." />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status Trigger <span className="text-red-500">*</span>
                </label>
                <select
                    value={formData.status_trigger}
                    onChange={(e) => setFormData({ ...formData, status_trigger: e.target.value as 'up' | 'down' | 'both' })}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                >
                    <option value="down">Down (when service goes down)</option>
                    <option value="up">Up (when service recovers)</option>
                    <option value="both">Both (down and up)</option>
                </select>
                <FieldHelp text="Select when this notification should be triggered" />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Recipient Emails <span className="text-red-500">*</span>
                </label>
                <textarea
                    value={recipientsText}
                    onChange={(e) => setRecipientsText(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder="email1@example.com, email2@example.com"
                    rows={3}
                    required
                />
                <FieldHelp text="Enter email addresses separated by commas. All recipients will receive notifications for this rule." />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    CC Emails (optional)
                </label>
                <input
                    value={ccText}
                    onChange={(e) => setCcText(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder="cc1@example.com, cc2@example.com"
                />
                <FieldHelp text="Comma-separated CC emails. CC recipients will receive a copy of the notification." />
            </div>

            <div className="rounded-lg border border-gray-200 overflow-hidden">
                <button
                    type="button"
                    onClick={() => setPresetsExpanded((v) => !v)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                        matchedPreset
                            ? `${matchedPreset.theme.headerBg} ${matchedPreset.theme.headerBorder} border-b`
                            : 'bg-violet-50 hover:bg-violet-100 border-b border-violet-200'
                    }`}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg shrink-0" aria-hidden="true">
                            {matchedPreset?.theme.emoji ?? '⚡'}
                        </span>
                        <div className="min-w-0">
                            <div className={`text-sm font-semibold ${matchedPreset?.theme.headerText ?? 'text-violet-900'}`}>
                                Schedule Presets
                            </div>
                            {!presetsExpanded && matchedPreset && (
                                <div className={`text-xs truncate ${matchedPreset.theme.activeSummaryText}`}>
                                    {matchedPreset.theme.emoji} {formatPresetScheduleSummary(matchedPreset)}
                                </div>
                            )}
                            {!presetsExpanded && !matchedPreset && (
                                <div className="text-xs text-violet-600 truncate">
                                    Tap to pick business hours, weekends, off-hours…
                                </div>
                            )}
                        </div>
                    </div>
                    <svg
                        className={`w-5 h-5 shrink-0 transition-transform ${matchedPreset?.theme.headerText ?? 'text-violet-700'} ${presetsExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {presetsExpanded && (
                    <div className="p-4 bg-gray-50 space-y-3">
                        <p className="text-xs text-gray-600">
                            Quick-fill time window and days (times use the <strong>Notification Timezone</strong> above). For full nights &amp; weekends coverage, add two rules:{' '}
                            <strong>🌙 Off Business Hours</strong> + <strong>🏖️ Weekends</strong>.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {NOTIFICATION_SCHEDULE_PRESETS.map((preset) => {
                                const isActive = matchedPreset?.id === preset.id || activePresetId === preset.id;
                                const t = preset.theme;
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => applySchedulePreset(preset)}
                                        className={`text-left p-3 rounded-lg border transition-all ${
                                            isActive
                                                ? `${t.cardActiveBorder} ${t.cardActiveBg} ring-2 ${t.cardActiveRing}`
                                                : `${t.cardBorder} ${t.cardBg} ${t.cardHoverBorder} ${t.cardHoverBg}`
                                        }`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span className="text-xl leading-none shrink-0 mt-0.5" aria-hidden="true">
                                                {t.emoji}
                                            </span>
                                            <div className="min-w-0">
                                                <div className={`font-medium text-sm ${t.titleText}`}>
                                                    {preset.name}
                                                </div>
                                                <div className={`text-xs mt-0.5 ${t.descriptionText}`}>
                                                    {preset.description}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {matchedPreset && (
                            <p className={`text-xs font-medium ${matchedPreset.theme.activeSummaryText}`}>
                                {matchedPreset.theme.emoji} Active schedule: {formatPresetScheduleSummary(matchedPreset)}
                            </p>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Time Window Start (HH:MM)
                    </label>
                    <input
                        type="text"
                        value={formData.time_window_start || ''}
                        onChange={(e) => handleTimeWindowChange('time_window_start', e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        placeholder="09:00"
                        pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                    />
                    <FieldHelp text="Leave empty for always active. Use 24-hour format (e.g., 09:00, 22:30)" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Time Window End (HH:MM)
                    </label>
                    <input
                        type="text"
                        value={formData.time_window_end || ''}
                        onChange={(e) => handleTimeWindowChange('time_window_end', e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        placeholder="17:00"
                        pattern="^([01]?[0-9]|2[0-3]):[0-5][0-9]$"
                    />
                    <FieldHelp text="Leave empty for always active. Can span midnight (e.g., 22:00 to 06:00)" />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Days of Week
                </label>
                <div className="flex flex-wrap gap-2">
                    {[0, 1, 2, 3, 4, 5, 6].map(day => (
                        <button
                            key={day}
                            type="button"
                            onClick={() => toggleDay(day)}
                            className={`px-3 py-1 rounded-lg text-sm transition-colors ${selectedDays.includes(day)
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            {getDayName(day).substring(0, 3)}
                        </button>
                    ))}
                </div>
                <FieldHelp text="Select days when notifications should be sent. Leave all unselected for all days." />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Subject Template <span className="text-red-500">*</span>
                </label>
                <input
                    type="text"
                    value={formData.subject_template}
                    onChange={(e) => setFormData({ ...formData, subject_template: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    required
                />
                <FieldHelp text="Available variables: {monitor_name}, {status}, {time}, {date}, {details}, {response_time}, {app_name}" />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Body Template <span className="text-red-500">*</span>
                </label>
                <textarea
                    value={formData.body_template}
                    onChange={(e) => setFormData({ ...formData, body_template: e.target.value })}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    rows={6}
                    required
                />
                <FieldHelp text="Available variables: {monitor_name}, {status}, {time}, {date}, {details}, {response_time}, {monitor_type}, {monitor_target}, {app_name}" />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        From Name (Optional)
                    </label>
                    <input
                        type="text"
                        value={formData.from_name || ''}
                        onChange={(e) => setFormData({ ...formData, from_name: e.target.value || null })}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        placeholder={`${appName} Monitor`}
                    />
                    <FieldHelp text="Custom sender name. Uses SMTP settings if not specified." />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        From Email (Optional)
                    </label>
                    <input
                        type="text"
                        inputMode="email"
                        autoComplete="email"
                        value={formData.from_email || ''}
                        onChange={(e) => setFormData({ ...formData, from_email: e.target.value || null })}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        placeholder="noreply@example.com"
                    />
                    <FieldHelp text="Custom sender email. Uses SMTP settings if not specified." />
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100 border border-gray-300"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                >
                    {isCreating ? 'Create Rule' : 'Update Rule'}
                </button>
            </div>
        </form>
    );
};
