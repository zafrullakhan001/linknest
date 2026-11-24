import React from 'react';

interface MonitorTogglePillProps {
    enabled: boolean;
    onToggle: () => void;
    onClassName?: string;
    labelOn?: string;
    labelOff?: string;
    disabled?: boolean;
}

export const MonitorTogglePill: React.FC<MonitorTogglePillProps> = ({
    enabled,
    onToggle,
    onClassName = 'bg-blue-600',
    labelOn = 'On',
    labelOff = 'Off',
    disabled = false,
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? labelOn : labelOff}
        title={enabled ? labelOn : labelOff}
        disabled={disabled}
        onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled) onToggle();
        }}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${enabled ? onClassName : 'bg-slate-400 dark:bg-slate-600'}`}
    >
        <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
        />
    </button>
);

interface MonitorQuickTogglesProps {
    isActive: boolean;
    onIsActiveChange: (value: boolean) => void;
    emailNotification: boolean;
    onEmailNotificationChange: (value: boolean) => void;
    /** When true, legacy emails are off and only rule-based notifications send. */
    ruleBasedOnly?: boolean;
}

export const MonitorQuickToggles: React.FC<MonitorQuickTogglesProps> = ({
    isActive,
    onIsActiveChange,
    emailNotification,
    onEmailNotificationChange,
    ruleBasedOnly = false,
}) => {
    const emailUsesRuleBased = emailNotification && ruleBasedOnly;

    return (
    <div className="px-6 py-3 border-b border-gray-200 bg-gradient-to-r from-emerald-50/40 via-slate-50 to-violet-50/30">
        <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center justify-between gap-3 flex-1 min-w-0 p-3 rounded-xl border border-emerald-100 bg-emerald-50/50 shadow-sm">
                <div className="min-w-0 flex items-start gap-2">
                    <span className="text-lg leading-none" aria-hidden="true">⚡</span>
                    <div>
                    <div className="text-sm font-semibold text-emerald-900">Monitor</div>
                    <p className="text-xs text-emerald-800/80 mt-0.5">
                        {isActive ? 'Scheduled checks are running' : 'Paused — no checks will run'}
                    </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                    >
                        {isActive ? 'On' : 'Off'}
                    </span>
                    <MonitorTogglePill
                        enabled={isActive}
                        onToggle={() => onIsActiveChange(!isActive)}
                        onClassName="bg-emerald-500"
                        labelOn="Enable monitor"
                        labelOff="Disable monitor"
                    />
                </div>
            </div>

            <div
                className={`flex items-center justify-between gap-3 flex-1 min-w-0 p-3 rounded-xl border shadow-sm ${
                    emailUsesRuleBased
                        ? 'border-purple-200 bg-purple-50/60'
                        : emailNotification
                          ? 'border-blue-100 bg-blue-50/50'
                          : 'border-slate-200 bg-slate-50/50'
                }`}
            >
                <div className="min-w-0 flex items-start gap-2">
                    <span className="text-lg leading-none" aria-hidden="true">📧</span>
                    <div>
                    <div className={`text-sm font-semibold ${emailUsesRuleBased ? 'text-purple-900' : emailNotification ? 'text-blue-900' : 'text-slate-700'}`}>
                        Email alerts
                    </div>
                    <p className={`text-xs mt-0.5 ${emailUsesRuleBased ? 'text-purple-800/80' : emailNotification ? 'text-blue-800/80' : 'text-slate-600'}`}>
                        {!emailNotification
                            ? 'No email on status change'
                            : emailUsesRuleBased
                              ? 'Rule-based notifications only'
                              : 'Legacy status-change emails enabled'}
                    </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                            !emailNotification
                                ? 'bg-slate-100 text-slate-500'
                                : emailUsesRuleBased
                                  ? 'bg-purple-200 text-purple-800'
                                  : 'bg-blue-100 text-blue-700'
                        }`}
                    >
                        {emailNotification ? 'On' : 'Off'}
                    </span>
                    <MonitorTogglePill
                        enabled={emailNotification}
                        onToggle={() => onEmailNotificationChange(!emailNotification)}
                        onClassName={emailUsesRuleBased ? 'bg-purple-600' : 'bg-blue-600'}
                        labelOn="Enable email alerts"
                        labelOff="Disable email alerts"
                    />
                </div>
            </div>
        </div>
    </div>
    );
};
