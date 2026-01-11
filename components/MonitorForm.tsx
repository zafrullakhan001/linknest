import React, { useState, useEffect } from 'react';
import { Monitor } from '../services/monitoringService';

interface MonitorFormProps {
    monitor?: Monitor;
    onSave: (monitor: Partial<Monitor>) => Promise<void>;
    onCancel: () => void;
}

export const MonitorForm: React.FC<MonitorFormProps> = ({ monitor, onSave, onCancel }) => {
    const [name, setName] = useState(monitor?.name || '');
    const [type, setType] = useState<Monitor['type']>(monitor?.type || 'url');
    const [target, setTarget] = useState(monitor?.target || '');
    const [port, setPort] = useState(monitor?.port?.toString() || '');
    const [keyword, setKeyword] = useState(monitor?.keyword || '');
    const [interval, setInterval] = useState(monitor?.interval?.toString() || '5');
    const [emailNotification, setEmailNotification] = useState(!!monitor?.email_notification);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            await onSave({
                name,
                type,
                target,
                port: port ? parseInt(port) : undefined,
                keyword,
                interval: parseInt(interval),
                email_notification: emailNotification ? 1 : 0
            });
        } catch (err: any) {
            setError(err.message || 'Failed to save monitor');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1e1e1e] rounded-xl shadow-2xl p-6 w-full max-w-md border border-[#333]">
                <h2 className="text-xl font-semibold text-white mb-4">
                    {monitor ? 'Edit Monitor' : 'Add New Monitor'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-[#2a2a2a] border border-[#444] rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500 transition-colors"
                            placeholder="My Server"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Type</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value as Monitor['type'])}
                            className="w-full bg-[#2a2a2a] border border-[#444] rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500 transition-colors"
                        >
                            <option value="url">URL Check</option>
                            <option value="keyword">Keyword Check</option>
                            <option value="port">Port Check</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            {type === 'port' ? 'Host / IP' : 'URL'}
                        </label>
                        <input
                            type={type === 'port' ? 'text' : 'url'}
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                            className="w-full bg-[#2a2a2a] border border-[#444] rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500 transition-colors"
                            placeholder={type === 'port' ? '127.0.0.1' : 'https://example.com'}
                            required
                        />
                    </div>

                    {type === 'port' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Port</label>
                            <input
                                type="number"
                                value={port}
                                onChange={(e) => setPort(e.target.value)}
                                className="w-full bg-[#2a2a2a] border border-[#444] rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500 transition-colors"
                                placeholder="80"
                                required
                            />
                        </div>
                    )}

                    {type === 'keyword' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Keyword</label>
                            <input
                                type="text"
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                className="w-full bg-[#2a2a2a] border border-[#444] rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500 transition-colors"
                                placeholder="Search String"
                                required
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Check Interval (min)</label>
                        <input
                            type="number"
                            value={interval}
                            onChange={(e) => setInterval(e.target.value)}
                            min="1"
                            className="w-full bg-[#2a2a2a] border border-[#444] rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500 transition-colors"
                            required
                        />
                    </div>

                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={emailNotification}
                            onChange={(e) => setEmailNotification(e.target.checked)}
                            id="emailNotif"
                            className="w-4 h-4 rounded border-gray-600 bg-[#2a2a2a] text-blue-600 focus:ring-blue-500 focus:ring-offset-[#1e1e1e]"
                        />
                        <label htmlFor="emailNotif" className="text-sm font-medium text-gray-400">
                            Send email notification on status change
                        </label>
                    </div>

                    {error && (
                        <div className="text-red-400 text-sm bg-red-900/20 p-2 rounded">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end space-x-3 pt-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Saving...' : 'Save Monitor'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
