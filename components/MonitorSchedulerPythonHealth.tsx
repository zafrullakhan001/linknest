import React from 'react';
import { FaCheck, FaCopy, FaDownload, FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import { MonitorWorkerPythonHealth, MonitorWorkerSchedulerDatabase } from '../services/monitoringService';

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

    return (
        <div className={`rounded-xl border px-3 py-2.5 ${boxClass}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
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
                    <p className={`mt-1 leading-relaxed opacity-90 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                        {python.message}
                    </p>
                    {python.path && ready && (
                        <p className="mt-1 text-[10px] font-mono opacity-70 truncate" title={python.path}>
                            {python.path}
                        </p>
                    )}
                </div>
            </div>

            {!compact && python.checks?.length > 0 && (
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
                    {!compact && (
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
                    )}
                </div>
            )}
        </div>
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
        <div className={`rounded-xl border px-3 py-2.5 ${boxClass}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
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
                    <p className={`mt-1 leading-relaxed opacity-90 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
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
                </div>
                {database.path && (
                    <button
                        type="button"
                        onClick={copyPath}
                        className="shrink-0 p-1.5 rounded-lg bg-white/70 dark:bg-black/30 hover:bg-white dark:hover:bg-black/50"
                        title="Copy database path"
                    >
                        <FaCopy size={10} />
                    </button>
                )}
            </div>
        </div>
    );
};
