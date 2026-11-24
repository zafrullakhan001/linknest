import React, { useState, useEffect, useCallback } from 'react';
import { getBlockedUsers, unblockUser, type BlockedUser } from '../services/tileShareService';

interface BlockedUsersSectionProps {
  onUnblock?: () => void; // Called after unblocking to refresh tiles/share state
}

export const BlockedUsersSection: React.FC<BlockedUsersSectionProps> = ({ onUnblock }) => {
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const loadBlocked = useCallback(async () => {
    try {
      setError(null);
      const list = await getBlockedUsers();
      setBlocked(list);
    } catch (err) {
      console.error('Failed to load blocked users:', err);
      setError(err instanceof Error ? err.message : 'Failed to load blocked users');
      setBlocked([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlocked();
  }, [loadBlocked]);

  const handleUnblock = async (b: BlockedUser) => {
    setProcessingId(b.userId);
    try {
      await unblockUser(b.userId);
      setBlocked(prev => prev.filter(x => x.userId !== b.userId));
      onUnblock?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unblock');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading && blocked.length === 0) {
    return (
      <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 py-4 px-4">
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Loading blocked users...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-b border-slate-200 dark:border-slate-700 bg-red-50/50 dark:bg-red-900/10 py-3 px-4">
        <div className="text-sm text-red-600 dark:text-red-400">
          Could not load blocked users: {error}
        </div>
        <button
          onClick={() => { setLoading(true); loadBlocked(); }}
          className="mt-2 text-xs font-medium text-red-700 dark:text-red-300 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
      <div className="py-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Users you blocked from sharing ({blocked.length})
          </span>
          <button
            onClick={() => { setLoading(true); loadBlocked(); }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            title="Refresh"
          >
            Refresh
          </button>
        </div>
        {blocked.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            You have not blocked any users. Blocked users cannot share tiles with you. You can block from the &quot;Block Sharer&quot; option on shared tiles.
          </p>
        ) : (
          <>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            These users cannot share tiles with you. Click Unblock to allow them to share again.
          </p>
          <div className="space-y-2">
            {blocked.map(b => (
              <div
                key={b.userId}
                className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
              >
                <span className="font-medium text-slate-900 dark:text-slate-100">{b.username}</span>
                <button
                  onClick={() => handleUnblock(b)}
                  disabled={processingId !== null}
                  className="px-3 py-1.5 text-sm font-medium bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 disabled:opacity-50 text-slate-800 dark:text-slate-200 rounded-lg"
                >
                  {processingId === b.userId ? '...' : 'Unblock'}
                </button>
              </div>
            ))}
          </div>
          </>
        )}
      </div>
    </div>
  );
};
