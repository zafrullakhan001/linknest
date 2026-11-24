import React, { useState } from 'react';
import { FaCheck, FaChevronDown, FaCopy, FaDownload, FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import { MonitorWorkerPythonHealth, MonitorWorkerSchedulerDatabase, MonitorWorkerSchedulerWorkerEnv } from '../services/monitoringService';

interface SchedulerCollapsibleBlockProps {
    title: React.ReactNode;
    summary?: React.ReactNode;
    defaultOpen?: boolean;
    boxClass: string;
    headerExtra?: React.ReactNode;
    children: React.ReactNode;
}

export const SchedulerCollapsibleBlock: React.FC<SchedulerCollapsibleBlockProps> = ({
    title,
    summary,
    defaultOpen = false,
    boxClass,
    headerExtra,
    children,
}) => {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className={`rounded-xl border ${boxClass}`}>
            <div
                role="button"
                tabIndex={0}
                onClick={() => setOpen((prev) => !prev)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpen((prev) => !prev);
                    }
                }}
                className="w-full flex items-start gap-2 px-3 py-2.5 text-left cursor-pointer select-none"
                aria-expanded={open}
            >
                <FaChevronDown
                    className={`mt-0.5 shrink-0 opacity-70 transition-transform ${open ? '' : '-rotate-90'}`}
                    size={10}
                    aria-hidden
                />
                <div className="min-w-0 flex-1">
                    {title}
                    {!open && summary ? (
                        <div className="mt-1 text-[10px] font-mono opacity-80 break-all leading-snug">
                            {summary}
                        </div>
                    ) : null}
                </div>
                {headerExtra ? (
                    <div
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    >
                        {headerExtra}
                    </div>
                ) : null}
            </div>
            {open && <div className="px-3 pb-2.5">{children}</div>}
        </div>
    );
};

interface MonitorSchedulerPythonHealthProps {
    python: MonitorWorkerPythonHealth;
    variant?: 'float' | 'modal';
    isAdmin: boolean;
    installing: boolean;
    checking: boolean;
    onInstall: () => void;
}

export const MonitorSchedulerPythonHealthCard: React.FC<MonitorSchedulerPythonHealthProps> = ({
    python,
    variant = 'float',
    isAdmin,
    installing,
    checking,
    onInstall,
}) => {
    const ready = python.available === true;
    const compact = variant === 'float';
    const boxClass = ready
        ? 'border-emerald-200/80 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-950/40'
        : 'border-amber-300/80 dark:border-amber-700/70 bg-amber-50/90 dark:bg-amber-950/40';

    const copyWinget = () => {
        if (!python.winget_command) return;
        void navigator.clipboard.writeText(python.winget_command);
    };

    const copyPath = () => {
        if (!python.path) return;
        void navigator.clipboard.writeText(python.path);
    };

    return (
        <SchedulerCollapsibleBlock
            boxClass={boxClass}
            defaultOpen={!compact || !ready}
            summary={ready ? python.path : python.message}
            headerExtra={python.path ? (
                <button
                    type="button"
                    onClick={copyPath}
                    className="p-1.5 rounded-lg bg-white/70 dark:bg-black/30 hover:bg-white dark:hover:bg-black/50"
                    title="Copy Python path"
                >
                    <FaCopy size={10} />
                </button>
            ) : undefined}
            title={
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {ready ? (
                        <FaCheck className="text-emerald-600 dark:text-emerald-400 shrink-0" size={11} />
                    ) : (
                        <FaExclamationTriangle className="text-amber-600 dark:text-amber-400 shrink-0" size={11} />
                    )}
                    <span className="font-bold text-[10px] uppercase tracking-wide">
                        {ready ? `Python ${python.version ?? ''} ready` : 'Python not found'}
                    </span>
                    {python.source && python.source !== 'missing' && ready && (
                        <span className="text-[10px] opacity-70">({python.source})</span>
                    )}
                </div>
            }
        >
            <p className={`leading-relaxed opacity-90 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                {python.message}
            </p>
            {python.path && ready && (
                <p className="mt-1 text-[10px] font-mono opacity-70 break-all" title={python.path}>
                    {python.path}
                </p>
            )}

            {python.checks?.length > 0 && (
                <ul className="mt-2 space-y-1">
                    {python.checks.map((check) => (
                        <li key={check.id} className="flex items-start gap-1.5 text-[11px] leading-snug">
                            {check.ok ? (
                                <FaCheck className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" size={10} />
                            ) : (
                                <FaTimes className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" size={10} />
                            )}
                            <span>
                                <span className="font-semibold">{check.label}</span>
                                <span className="opacity-80"> — {check.detail}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {!ready && (
                <div className="mt-2.5 space-y-2">
                    {isAdmin && python.can_install && (
                        <button
                            type="button"
                            onClick={onInstall}
                            disabled={installing || checking}
                            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-sky-600 hover:bg-sky-700 text-white transition-colors disabled:opacity-50"
                        >
                            <FaDownload size={9} />
                            {installing ? 'Installing Python…' : 'Install Python runtime'}
                        </button>
                    )}
                    <p className="text-[10px] leading-relaxed opacity-85">
                        {python.can_install
                            ? 'Installs a bundled Python 3.12 into this LinkNest folder (bin\\python). No admin rights. Internet required (~11 MB). Then click Install tasks.'
                            : 'Install Python 3.9+ on this host, then Recheck, then Install tasks.'}
                    </p>
                    <div className="text-[10px] leading-relaxed opacity-85 space-y-1">
                        <p>
                            Or install system Python from{' '}
                            <a
                                href={python.install_url || 'https://www.python.org/downloads/windows/'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline font-semibold"
                            >
                                python.org/downloads/windows
                            </a>
                            {' '}and check <strong>Add python.exe to PATH</strong>.
                        </p>
                        {python.winget_command && (
                            <div className="flex items-start gap-1.5">
                                <code className="flex-1 bg-black/10 dark:bg-white/10 px-1.5 py-1 rounded font-mono break-all">
                                    {python.winget_command}
                                </code>
                                <button
                                    type="button"
                                    onClick={copyWinget}
                                    className="shrink-0 p-1.5 rounded-lg bg-white/70 dark:bg-black/30 hover:bg-white dark:hover:bg-black/50"
                                    title="Copy winget command"
                                >
                                    <FaCopy size={10} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </SchedulerCollapsibleBlock>
    );
};

interface MonitorSchedulerDatabaseCardProps {
    database: MonitorWorkerSchedulerDatabase;
    variant?: 'float' | 'modal';
}

export const MonitorSchedulerDatabaseCard: React.FC<MonitorSchedulerDatabaseCardProps> = ({
    database,
    variant = 'float',
}) => {
    const compact = variant === 'float';
    const mismatch = database.mismatch === true;
    const missing = database.exists !== true;
    const boxClass = mismatch || missing
        ? 'border-amber-300/80 dark:border-amber-700/70 bg-amber-50/90 dark:bg-amber-950/40'
        : 'border-slate-200/90 dark:border-slate-700/70 bg-white/60 dark:bg-black/20';

    const copyPath = () => {
        if (!database.path) return;
        void navigator.clipboard.writeText(database.path);
    };

    return (
        <SchedulerCollapsibleBlock
            boxClass={boxClass}
            defaultOpen={!compact || mismatch || missing}
            summary={database.path}
            headerExtra={database.path ? (
                <button
                    type="button"
                    onClick={copyPath}
                    className="p-1.5 rounded-lg bg-white/70 dark:bg-black/30 hover:bg-white dark:hover:bg-black/50"
                    title="Copy database path"
                >
                    <FaCopy size={10} />
                </button>
            ) : undefined}
            title={
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {mismatch || missing ? (
                        <FaExclamationTriangle className="text-amber-600 dark:text-amber-400 shrink-0" size={11} />
                    ) : (
                        <FaCheck className="text-emerald-600 dark:text-emerald-400 shrink-0" size={11} />
                    )}
                    <span className="font-bold text-[10px] uppercase tracking-wide">
                        {mismatch ? 'Database path mismatch' : 'SQLite database'}
                    </span>
                </div>
            }
        >
            <p className={`leading-relaxed opacity-90 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                {database.message}
            </p>
            {database.path && (
                <p className="mt-1 text-[10px] font-mono opacity-80 break-all" title={database.path}>
                    {database.path}
                </p>
            )}
            {mismatch && database.php_path && database.php_path !== database.path && (
                <p className="mt-1 text-[10px] font-mono opacity-60 break-all" title={database.php_path}>
                    PHP: {database.php_path}
                </p>
            )}
        </SchedulerCollapsibleBlock>
    );
};

interface MonitorSchedulerWorkerEnvCardProps {
    env: MonitorWorkerSchedulerWorkerEnv;
    variant?: 'float' | 'modal';
}

const displayValue = (value: string | number | boolean | null | undefined): string => {
    if (value === null || value === undefined || value === '') return '(empty)';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
};

export const MonitorSchedulerWorkerEnvCard: React.FC<MonitorSchedulerWorkerEnvCardProps> = ({
    env,
    variant = 'float',
}) => {
    const compact = variant === 'float';
    const ok = env.app_name_configured === true && env.notifications_paused !== true;
    const boxClass = ok
        ? 'border-slate-200/90 dark:border-slate-700/70 bg-white/60 dark:bg-black/20'
        : 'border-amber-300/80 dark:border-amber-700/70 bg-amber-50/90 dark:bg-amber-950/40';

    const settingsRows: Array<{ name: string; value: string }> = [
        { name: '{app_name}', value: displayValue(env.app_name) },
        { name: 'app_name_configured', value: displayValue(env.app_name_configured) },
        { name: 'notifications_paused', value: displayValue(env.notifications_paused) },
        { name: 'working_directory', value: displayValue(env.working_directory) },
        { name: 'python_path', value: displayValue(env.python_path) },
        { name: 'db_path', value: displayValue(env.db_path) },
        { name: 'smtp.enabled', value: displayValue(env.smtp?.enabled) },
        { name: 'smtp.host', value: displayValue(env.smtp?.host) },
        { name: 'smtp.from_email', value: displayValue(env.smtp?.from_email) },
        { name: 'smtp.from_name_raw', value: displayValue(env.smtp?.from_name_raw) },
        { name: 'smtp.from_name_resolved', value: displayValue(env.smtp?.from_name_resolved) },
        { name: 'smtp.source', value: displayValue(env.smtp?.source) },
    ];

    const copyAll = () => {
        const lines = [
            ...settingsRows.map((row) => `${row.name}=${row.value}`),
            '',
            '# Template tokens',
            ...(env.placeholders || []).map((row) => `${row.token}=${row.value}  [${row.source}]`),
            '',
            '# OS environment',
            ...(env.os_env || []).map((row) => `${row.name}=${row.value}`),
        ];
        void navigator.clipboard.writeText(lines.join('\n'));
    };

    return (
        <SchedulerCollapsibleBlock
            boxClass={boxClass}
            defaultOpen={!compact}
            summary={`{app_name} = ${env.app_name}${env.smtp?.from_name_resolved ? ` · SMTP From: ${env.smtp.from_name_resolved}` : ''}`}
            headerExtra={(
                <button
                    type="button"
                    onClick={copyAll}
                    className="p-1.5 rounded-lg bg-white/70 dark:bg-black/30 hover:bg-white dark:hover:bg-black/50"
                    title="Copy all worker values"
                >
                    <FaCopy size={10} />
                </button>
            )}
            title={
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {ok ? (
                        <FaCheck className="text-emerald-600 dark:text-emerald-400 shrink-0" size={11} />
                    ) : (
                        <FaExclamationTriangle className="text-amber-600 dark:text-amber-400 shrink-0" size={11} />
                    )}
                    <span className="font-bold text-[10px] uppercase tracking-wide">
                        Worker placeholders
                    </span>
                    {env.notifications_paused && (
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">paused</span>
                    )}
                </div>
            }
        >
            <p className={`leading-relaxed opacity-90 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                {env.message}
            </p>

            <div className="mt-2">
                <p className="font-semibold uppercase tracking-wide opacity-70 mb-1 text-[10px]">Resolved values</p>
                <div className="overflow-x-auto">
                    <table className="w-full text-[10px] text-left">
                        <tbody>
                            {settingsRows.map((row) => (
                                <tr key={row.name} className="border-t border-black/5 dark:border-white/10">
                                    <td className="py-1 pr-2 font-mono whitespace-nowrap align-top">{row.name}</td>
                                    <td className="py-1 font-mono break-all">{row.value}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-2">
                <p className="font-semibold uppercase tracking-wide opacity-70 mb-1 text-[10px]">Template tokens</p>
                <div className="overflow-x-auto">
                    <table className="w-full text-[10px] text-left">
                        <thead>
                            <tr className="opacity-70">
                                <th className="py-1 pr-2 font-semibold">Token</th>
                                <th className="py-1 pr-2 font-semibold">Value Python uses</th>
                                <th className="py-1 font-semibold">Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(env.placeholders || []).map((row) => (
                                <tr key={row.token} className="border-t border-black/5 dark:border-white/10">
                                    <td className="py-1 pr-2 font-mono whitespace-nowrap">{row.token}</td>
                                    <td className="py-1 pr-2 font-mono break-all">{row.value}</td>
                                    <td className="py-1 opacity-70">{row.source}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-2 pt-2 border-t border-black/5 dark:border-white/10">
                <p className="font-semibold uppercase tracking-wide opacity-70 mb-1 text-[10px]">OS environment (process)</p>
                {env.os_env && env.os_env.length > 0 ? (
                    env.os_env.map((row) => (
                        <p key={row.name} className="font-mono break-all opacity-80 text-[10px]">
                            {row.name}={row.value}
                        </p>
                    ))
                ) : (
                    <p className="text-[10px] opacity-70">
                        No LINKNEST_* / APP_NAME process env vars are set. Python reads {'{app_name}'} from SQLite settings, not from Windows.
                    </p>
                )}
            </div>
        </SchedulerCollapsibleBlock>
    );
};
