import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';

import { Tile } from '../types';
import { shareTile, getTileShares, revokeShare, TileShareRecord } from '../services/tileShareService';
import { authService, UserListItem } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import { AuthSourceBadge, normalizeAuthSource } from './AuthSourceBadge';

interface ShareTileDialogProps {
  tile: Tile | null;
  onClose: () => void;
  onShared?: () => void;
}

function UserPickRow({
  userItem,
  selected,
  onSelect,
}: {
  userItem: UserListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full px-3 py-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
        selected ? 'bg-brand-50 dark:bg-brand-900/30' : ''
      }`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
          {(userItem.username || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          {/* Login id first, email right beside it so the right account is easy to identify. */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium truncate ${selected ? 'text-brand-700 dark:text-brand-300' : 'text-slate-900 dark:text-white'}`}>
              {userItem.username}
            </span>
            <AuthSourceBadge source={userItem.auth_source} />
            {userItem.is_admin ? (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                Admin
              </span>
            ) : null}
            {userItem.email ? (
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate" title={userItem.email}>
                · {userItem.email}
              </span>
            ) : (
              <span className="text-xs text-slate-400 dark:text-slate-500">· No email on file</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
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
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        normalizeAuthSource(u.auth_source).includes(q)
    );
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

  const closedInputLabel = selectedUser
    ? `${selectedUser.username}${selectedUser.email ? ` · ${selectedUser.email}` : ''}`
    : '';

  // Rendered in a portal on document.body: the space header uses `isolate`, which creates a
  // stacking context and would otherwise trap this overlay behind later page layers.
  return createPortal(
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        ref={containerRef}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-lg w-full mx-4"
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
                {currentShares.map((s) => {
                  const shareUser = users.find((u) => u.id === s.receiverUserId);
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        {/* Login id with the email beside it, matching the picker above. */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-800 dark:text-slate-200 font-medium truncate">{s.receiverUsername}</span>
                          {shareUser ? <AuthSourceBadge source={shareUser.auth_source} /> : null}
                          {shareUser?.email ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate" title={shareUser.email}>
                              · {shareUser.email}
                            </span>
                          ) : null}
                        </div>
                      </div>
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
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mb-4 relative">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select user</label>
            <div className="relative">
              <input
                type="text"
                value={dropdownOpen ? searchTerm : closedInputLabel}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setDropdownOpen(true);
                  if (!e.target.value) setSelectedUserId(null);
                }}
                onFocus={() => {
                  setDropdownOpen(true);
                  if (selectedUserId && !searchTerm) setSearchTerm('');
                }}
                placeholder="Search by username, email, or auth (ldap, local, saml)..."
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
              <div className="absolute left-0 right-0 z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-1">
                {filteredUsers.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No users found</div>
                ) : (
                  filteredUsers.map(u => (
                    <UserPickRow
                      key={u.id}
                      userItem={u}
                      selected={selectedUserId === u.id}
                      onSelect={() => {
                        setSelectedUserId(u.id);
                        setSearchTerm('');
                        setDropdownOpen(false);
                      }}
                    />
                  ))
                )}
              </div>
            )}
            {selectedUser && !dropdownOpen && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{selectedUser.username}</span>
                <AuthSourceBadge source={selectedUser.auth_source} />
                {selectedUser.email ? (
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate" title={selectedUser.email}>
                    · {selectedUser.email}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-slate-500">· No email on file</span>
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
    </div>,
    document.body
  );
};
