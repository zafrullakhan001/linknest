import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { NotificationRule, getNotificationRules, createNotificationRule, updateNotificationRule, deleteNotificationRule, importNotificationRules, moveNotificationRule, parseDaysOfWeek, formatDaysOfWeek, getDayName } from '../services/monitorNotificationService';

interface EmailNotificationsTabProps {
    monitorId: number;
}

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
            subject_template: `[{app_name} Monitor] {monitor_name} Status: {status}`,
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
            <NotificationRuleForm
                rule={editingRule}
                onSave={handleSave}
                onCancel={handleCancel}
                isCreating={isCreating}
            />
        );
    }

    return (
        <div className="space-y-4">
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
        setSelectedDays(prev =>
            prev.includes(day)
                ? prev.filter(d => d !== day)
                : [...prev, day].sort()
        );
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

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Time Window Start (HH:MM)
                    </label>
                    <input
                        type="text"
                        value={formData.time_window_start || ''}
                        onChange={(e) => setFormData({ ...formData, time_window_start: e.target.value || null })}
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
                        onChange={(e) => setFormData({ ...formData, time_window_end: e.target.value || null })}
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
                        type="email"
                        value={formData.from_email || ''}
                        onChange={(e) => setFormData({ ...formData, from_email: e.target.value || null })}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        placeholder="noreply@example.com"
                    />
                    <FieldHelp text="Custom sender email. Uses SMTP settings if not specified." />
                </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <input
                    type="checkbox"
                    checked={formData.is_enabled === 1}
                    onChange={(e) => setFormData({ ...formData, is_enabled: e.target.checked ? 1 : 0 })}
                    id="isEnabled"
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isEnabled" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Enable this notification rule
                </label>
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
