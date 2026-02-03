import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Tile } from '../types';
import { shareTile, getTileShares, revokeShare, TileShareRecord } from '../services/tileShareService';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [currentShares, setCurrentShares] = useState<TileShareRecord[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const q = searchTerm.trim().toLowerCase();
    return users.filter(u => u.username.toLowerCase().includes(q));
  }, [users, searchTerm]);

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

  useEffect(() => {
    if (!tile?.id) {
      setCurrentShares([]);
      return;
    }
    let cancelled = false;
    setLoadingShares(true);
    getTileShares(tile.id)
      .then((shares) => {
        if (!cancelled) setCurrentShares(shares);
      })
      .catch(() => {
        if (!cancelled) setCurrentShares([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingShares(false);
      });
    return () => { cancelled = true; };
  }, [tile?.id, success]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  const handleShare = async () => {
    if (!tile || !selectedUserId) return;
    setLoading(true);
    setError(null);
    try {
      await shareTile(tile.id, selectedUserId);
      setSuccess(true);
      onShared?.();
      const shares = await getTileShares(tile.id);
      setCurrentShares(shares);
      setSelectedUserId(null);
      setSearchTerm('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to share');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (invitationId: number) => {
    setRevokingId(invitationId);
    setError(null);
    try {
      await revokeShare(invitationId);
      setCurrentShares((prev) => prev.filter((s) => s.id !== invitationId));
      onShared?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke');
    } finally {
      setRevokingId(null);
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  if (!tile) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={containerRef}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Share tile</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Share &quot;{tile.title}&quot; with another user. They will receive a notification to accept it in their Private tab.
          </p>

          {/* Current shares */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Shared with</label>
            {loadingShares ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
            ) : currentShares.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Not shared with anyone yet.</p>
            ) : (
              <ul className="rounded-lg border border-slate-200 dark:border-slate-600 divide-y divide-slate-200 dark:divide-slate-600 max-h-40 overflow-y-auto">
                {currentShares.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="text-slate-700 dark:text-slate-300 truncate">{s.receiverUsername}</span>
                    <span className="shrink-0 flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${s.status === 'accepted' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>
                        {s.status === 'accepted' ? 'Accepted' : 'Pending'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRevoke(s.id)}
                        disabled={revokingId === s.id}
                        className="shrink-0 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                      >
                        {revokingId === s.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mb-4 relative">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select user</label>
            <div className="relative">
              <input
                type="text"
                value={dropdownOpen ? searchTerm : (selectedUser?.username ?? '')}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setDropdownOpen(true);
                  if (!e.target.value) setSelectedUserId(null);
                }}
                onFocus={() => setDropdownOpen(true)}
                placeholder="Search users..."
                className="w-full px-3 py-2 pr-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
            {dropdownOpen && (
              <div className="absolute left-0 right-0 z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-1">
                {filteredUsers.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No users found</div>
                ) : (
                  filteredUsers.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelectedUserId(u.id);
                        setSearchTerm('');
                        setDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${selectedUserId === u.id ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-300'}`}
                    >
                      {u.username}
                    </button>
                  ))
                )}
              </div>
            )}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Press Esc to close</p>
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
