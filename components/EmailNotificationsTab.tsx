import React, { useState, useEffect } from 'react';
import { NotificationRule, getNotificationRules, createNotificationRule, updateNotificationRule, deleteNotificationRule, parseDaysOfWeek, formatDaysOfWeek, getDayName } from '../services/monitorNotificationService';

interface EmailNotificationsTabProps {
    monitorId: number;
}

export const EmailNotificationsTab: React.FC<EmailNotificationsTabProps> = ({ monitorId }) => {
    const [rules, setRules] = useState<NotificationRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        loadRules();
    }, [monitorId]);

    const loadRules = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getNotificationRules(monitorId);
            setRules(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load notification rules');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingRule({
            name: '',
            monitor_id: monitorId,
            status_trigger: 'down',
            subject_template: '[LinkNest Monitor] {monitor_name} Status: {status}',
            body_template: "Monitor: {monitor_name}\nStatus: {status}\nTime: {time}\nDetails: {details}",
            is_enabled: 1,
            recipients: []
        });
        setIsCreating(true);
    };

    const handleEdit = (rule: NotificationRule) => {
        setEditingRule({ ...rule });
        setIsCreating(false);
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
                <button
                    onClick={handleCreate}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                    + Add Notification Rule
                </button>
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
                    {rules.map((rule) => (
                        <NotificationRuleCard
                            key={rule.id}
                            rule={rule}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

interface NotificationRuleCardProps {
    rule: NotificationRule;
    onEdit: (rule: NotificationRule) => void;
    onDelete: (ruleId: number) => void;
}

const NotificationRuleCard: React.FC<NotificationRuleCardProps> = ({ rule, onEdit, onDelete }) => {
    const days = parseDaysOfWeek(rule.days_of_week);
    const hasTimeWindow = rule.time_window_start && rule.time_window_end;
    const hasDaysFilter = days.length > 0;

    return (
        <div className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="font-semibold text-gray-900 mb-1">
                        {rule.name || 'Notification Rule'}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                            rule.status_trigger === 'up' ? 'bg-green-100 text-green-800' :
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

                <div className="flex gap-2 ml-4">
                    <button
                        onClick={() => onEdit(rule)}
                        className="px-3 py-1 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                    >
                        Edit
                    </button>
                    <button
                        onClick={() => rule.id && onDelete(rule.id)}
                        className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    >
                        Delete
                    </button>
                </div>
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
    const [formData, setFormData] = useState<NotificationRule>(rule);
    const [recipientsText, setRecipientsText] = useState(rule.recipients?.join(', ') || '');
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

        // Validate email addresses
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        for (const email of recipients) {
            if (!emailRegex.test(email)) {
                setError(`Invalid email address: ${email}`);
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
                            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                                selectedDays.includes(day)
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
                <FieldHelp text="Available variables: {monitor_name}, {status}, {time}, {date}, {details}, {response_time}" />
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
                <FieldHelp text="Available variables: {monitor_name}, {status}, {time}, {date}, {details}, {response_time}, {monitor_type}, {monitor_target}" />
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
                        placeholder="LinkNest Monitor"
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
