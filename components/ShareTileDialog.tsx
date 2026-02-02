import React, { useState, useEffect } from 'react';
import { Tile } from '../types';
import { shareTile } from '../services/tileShareService';
import { authService, UserListItem } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';

interface ShareTileDialogProps {
  tile: Tile | null;
  onClose: () => void;
  onShared?: () => void;
}

export const ShareTileDialog: React.FC<ShareTileDialogProps> = ({ tile, onClose, onShared }) => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const list = await authService.getUsers();
        setUsers(list.filter(u => u.id !== user?.id));
      } catch {
        setError('Failed to load users');
      }
    };
    load();
  }, [user?.id]);

  const handleShare = async () => {
    if (!tile || !selectedUserId) return;
    setLoading(true);
    setError(null);
    try {
      await shareTile(tile.id, selectedUserId);
      setSuccess(true);
      onShared?.();
      setTimeout(() => onClose(), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to share');
    } finally {
      setLoading(false);
    }
  };

  if (!tile) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Share tile</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Share &quot;{tile.title}&quot; with another user. They will receive a notification to accept it in their Private tab.
          </p>
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select user</label>
            <select
              value={selectedUserId ?? ''}
              onChange={e => setSelectedUserId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            >
              <option value="">Choose a user...</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
          {success && <p className="text-sm text-green-600 dark:text-green-400 mb-3">Share invitation sent!</p>}
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              disabled={!selectedUserId || loading}
              className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white"
            >
              {loading ? 'Sending...' : 'Share'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
