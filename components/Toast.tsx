import React, { createContext, useContext, useState, useCallback } from 'react';
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaTimes } from 'react-icons/fa';

interface Toast {
    id: number;
    message: string;
    type: 'success' | 'error' | 'info';
}

interface ToastContextType {
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    }, []);

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return <FaCheckCircle className="text-emerald-500" />;
            case 'error': return <FaExclamationCircle className="text-red-500" />;
            default: return <FaInfoCircle className="text-blue-500" />;
        }
    };

    const getStyles = (type: string) => {
        switch (type) {
            case 'success': return 'bg-emerald-50 border-emerald-200 text-emerald-800';
            case 'error': return 'bg-red-50 border-red-200 text-red-800';
            default: return 'bg-blue-50 border-blue-200 text-blue-800';
        }
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[300px] animate-in slide-in-from-right ${getStyles(toast.type)}`}
                    >
                        {getIcon(toast.type)}
                        <span className="flex-1 text-sm font-medium">{toast.message}</span>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="p-1 hover:bg-black/10 rounded transition-colors"
                        >
                            <FaTimes size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        // Fallback to console if not in provider
        return {
            success: (msg: string) => console.log('[SUCCESS]', msg),
            error: (msg: string) => console.error('[ERROR]', msg),
            info: (msg: string) => console.info('[INFO]', msg)
        };
    }
    return {
        success: (msg: string) => context.showToast(msg, 'success'),
        error: (msg: string) => context.showToast(msg, 'error'),
        info: (msg: string) => context.showToast(msg, 'info')
    };
};

// Simple toast object for direct usage
export const toast = {
    success: (message: string) => {
        console.log('[SUCCESS]', message);
        // You can also implement a global toast queue here
    },
    error: (message: string) => {
        console.error('[ERROR]', message);
        alert(`Error: ${message}`);
    },
    info: (message: string) => {
        console.info('[INFO]', message);
    }
};
