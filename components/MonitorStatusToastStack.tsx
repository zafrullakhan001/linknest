import React, { useEffect } from 'react';
import { FaCheckCircle, FaTimes, FaTimesCircle } from 'react-icons/fa';
import type { MonitorStatusAlert } from '../utils/monitorBrowserNotifications';

export type MonitorStatusToast = MonitorStatusAlert & {
    key: string;
};

type MonitorStatusToastStackProps = {
    toasts: MonitorStatusToast[];
    onDismiss: (key: string) => void;
    /** Auto-dismiss delay in ms (default 4000). */
    durationMs?: number;
};

const MonitorStatusToastItem: React.FC<{
    toast: MonitorStatusToast;
    onDismiss: (key: string) => void;
    durationMs: number;
}> = ({ toast, onDismiss, durationMs }) => {
    useEffect(() => {
        const timer = window.setTimeout(() => onDismiss(toast.key), durationMs);
        return () => window.clearTimeout(timer);
    }, [toast.key, onDismiss, durationMs]);

    const isDown = toast.status === 'down';
    const title = isDown ? `Monitor down: ${toast.name}` : `Monitor up: ${toast.name}`;
    const body = (toast.details || '').trim().slice(0, 120);

    return (
        <div
            role="status"
            className="pointer-events-auto flex items-start gap-3 min-w-[280px] max-w-[380px] px-4 py-3 rounded-xl shadow-xl text-white animate-in slide-in-from-right fade-in duration-200"
            style={{ backgroundColor: toast.color }}
        >
            <span className="mt-0.5 shrink-0 opacity-95">
                {isDown ? <FaTimesCircle size={18} /> : <FaCheckCircle size={18} />}
            </span>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold leading-snug">{title}</div>
                {body ? (
                    <div className="text-xs mt-0.5 opacity-90 break-words">{body}</div>
                ) : null}
            </div>
            <button
                type="button"
                onClick={() => onDismiss(toast.key)}
                className="p-1 rounded-md hover:bg-black/15 transition-colors shrink-0"
                aria-label="Dismiss"
            >
                <FaTimes size={12} />
            </button>
        </div>
    );
};

/**
 * Floating in-page popup for monitor up/down — visible while the dashboard is open.
 * Auto-dismisses after a few seconds (does not go into OS Notification Center).
 */
export const MonitorStatusToastStack: React.FC<MonitorStatusToastStackProps> = ({
    toasts,
    onDismiss,
    durationMs = 4000,
}) => {
    if (toasts.length === 0) return null;

    return (
        <div
            className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 pointer-events-none"
            aria-live="polite"
            aria-relevant="additions"
        >
            {toasts.map((t) => (
                <MonitorStatusToastItem
                    key={t.key}
                    toast={t}
                    onDismiss={onDismiss}
                    durationMs={durationMs}
                />
            ))}
        </div>
    );
};
