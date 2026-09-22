import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { Tile } from '../types';
import { fetchTileSharesSafe, revokeAllTileShares, TileShareRecord } from '../services/tileShareService';
import { authService, UserListItem } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import { AuthSourceBadge } from './AuthSourceBadge';
import { formatUserLabel } from '../utils/userDisplay';

interface DeleteSharedSpaceDialogProps {
  tile: Tile;
  onClose: () => void;
  /**
   * Performs the actual delete (moves the space to the recycle bin) after the user has
   * decided what happens to the shares. `revokedShares` reports how many recipients lost
   * access first, so callers can refresh their lists / show a summary.
   */
  onDelete: (options: { revokedShares: number }) => Promise<void> | void;
}

type RecipientRow = {
  userId: number;
  username: string;
  /** pending = invitation not accepted yet, accepted = has access, allowed = listed on the space only. */
  status: 'pending' | 'accepted' | 'allowed';
};

/**
 * Confirmation shown when deleting a space that is shared with other users
 * (docs/PRIVATE_SPACE_SHARING.md).
 *
 * The owner/admin chooses between revoking every share first (recipients lose access right
 * away and the space leaves their Private tab / pending list) or deleting without revoking
 * (invitations survive, so restoring the space from the recycle bin re-shares it).
 */
export const DeleteSharedSpaceDialog: React.FC<DeleteSharedSpaceDialogProps> = ({ tile, onClose, onDelete }) => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [shares, setShares] = useState<TileShareRecord[]>([]);
  const [loadingShares, setLoadingShares] = useState(true);
  /** False for a delegated deleter (not owner/admin): the API will refuse to revoke shares. */
  const [canManageShares, setCanManageShares] = useState(true);
  const [busy, setBusy] = useState<'revoke' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Recipients whose revoke call failed (kept so the user can retry). */
  const [failedNames, setFailedNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    authService
      .getUsers()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingShares(true);
    fetchTileSharesSafe(tile.id)
      .then((result) => {
        if (cancelled) return;
        setShares(result.shares);
        setCanManageShares(result.canManage);
      })
      .finally(() => {
        if (!cancelled) setLoadingShares(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tile.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose]);

  const userById = useMemo(() => {
    const map = new Map<number, UserListItem>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  /**
   * Everyone the space is shared with: invitation rows (pending/accepted) plus users listed
   * directly in allowed_users that have no invitation on file (legacy shares).
   */
  const recipients = useMemo<RecipientRow[]>(() => {
    const rows: RecipientRow[] = [];
    const seen = new Set<number>();

    shares.forEach((share) => {
      const id = Number(share.receiverUserId);
      if (!Number.isFinite(id) || seen.has(id)) return;
      seen.add(id);
      rows.push({
        userId: id,
        username: share.receiverUsername || userById.get(id)?.username || `User #${id}`,
        status: share.status === 'accepted' ? 'accepted' : 'pending'
      });
    });

    (tile.allowedUsers || []).forEach((rawId) => {
      const id = Number(rawId);
      if (!Number.isFinite(id) || seen.has(id) || id === user?.id) return;
      seen.add(id);
      rows.push({
        userId: id,
        username: userById.get(id)?.username || `User #${id}`,
        status: 'allowed'
      });
    });

    return rows;
  }, [shares, tile.allowedUsers, user?.id, userById]);

  const recipientCount = recipients.length;
  const labelFor = useCallback(
    (row: RecipientRow): string => {
      const person = userById.get(row.userId);
      return person ? formatUserLabel({ ...person, username: person.username || row.username }) : row.username;
    },
    [userById]
  );

  /** Revoke every share, then delete. Stays open (with the failure list) if a revoke fails. */
  const handleRevokeAndDelete = useCallback(async () => {
    setBusy('revoke');
    setError(null);
    setFailedNames([]);
    try {
      const result = await revokeAllTileShares(tile.id);
      if (!result.canManage) {
        setError(
          'Only the space owner or an administrator can revoke these shares. ' +
            'Use "Delete without revoking", or ask the owner to revoke them first.'
        );
        setBusy(null);
        return;
      }
      if (result.failed.length > 0) {
        setFailedNames(result.failed.map((share) => share.receiverUsername || `User #${share.receiverUserId}`));
        setError(
          `Could not revoke access for ${result.failed.length} user${result.failed.length === 1 ? '' : 's'}. ` +
            'Nothing was deleted — retry, or choose "Delete without revoking".'
        );
        setBusy(null);
        return;
      }
      await onDelete({ revokedShares: result.revoked });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete this space.');
    } finally {
      setBusy(null);
    }
  }, [onDelete, tile.id]);

  /** Delete straight away, keeping the share list (recipients keep access if it is restored). */
  const handleDeleteWithoutRevoking = useCallback(async () => {
    setBusy('delete');
    setError(null);
    try {
      await onDelete({ revokedShares: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete this space.');
    } finally {
      setBusy(null);
    }
  }, [onDelete]);

  const statusBadge = (status: RecipientRow['status']) => {
    if (status === 'accepted') {
      return (
        <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
          Accepted
        </span>
      );
    }
    if (status === 'pending') {
      return (
        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
          Pending
        </span>
      );
    }
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
        Shared
      </span>
    );
  };


  // Portal on document.body: the space header uses `isolate`, which would otherwise trap
  // this overlay behind later page layers (same reason as ShareTileDialog).
  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label="Delete shared space"
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
            <span aria-hidden="true">👥</span>
            Delete shared space
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {tile.emoji ? `${tile.emoji} ` : ''}{tile.title}
            </span>{' '}
            is shared with {loadingShares ? '…' : recipientCount} user{recipientCount === 1 ? '' : 's'}. Revoke their
            access before deleting it so the space disappears from their Private tab and from any pending invitation.
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Users who will lose access
            </label>
            {loadingShares ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
            ) : recipients.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No other users are listed on this space right now.
              </p>
            ) : (
              <ul className="rounded-lg border border-slate-200 dark:border-slate-600 divide-y divide-slate-200 dark:divide-slate-600 max-h-44 overflow-y-auto">
                {recipients.map((row) => {
                  const person = userById.get(row.userId);
                  return (
                    <li key={row.userId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="min-w-0 text-slate-800 dark:text-slate-200 font-medium truncate">
                          {labelFor(row)}
                        </span>
                        {person ? <AuthSourceBadge source={person.auth_source} /> : null}
                        {person?.email ? (
                          <span className="min-w-0 text-xs text-slate-500 dark:text-slate-400 truncate" title={person.email}>
                            · {person.email}
                          </span>
                        ) : null}
                      </div>
                      <span className="shrink-0">{statusBadge(row.status)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {!loadingShares && recipients.length > 0 && !canManageShares && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Only the space owner or an administrator can revoke these shares — you can still delete the space.
              </p>
            )}
          </div>


          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            The space is moved to the recycle bin either way. Revoking is permanent for the recipients — restoring the
            space later will not share it with them again.
          </p>

          {error && (
            <div className="mb-3 text-sm text-red-600 dark:text-red-400">
              <p>{error}</p>
              {failedNames.length > 0 && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-300">Still shared with: {failedNames.join(', ')}</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy !== null}
              className="px-4 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteWithoutRevoking()}
              disabled={busy !== null}
              title="Recipients keep the invitation, so restoring this space from the recycle bin shares it with them again"
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete without revoking'}
            </button>
            <button
              type="button"
              onClick={() => void handleRevokeAndDelete()}
              disabled={busy !== null || (recipients.length > 0 && !canManageShares)}
              title={recipients.length > 0 && !canManageShares
                ? 'Only the space owner or an administrator can revoke these shares'
                : 'Revoke every recipient, then delete the space'}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50"
            >
              {busy === 'revoke' ? 'Revoking…' : 'Revoke access & delete'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DeleteSharedSpaceDialog;

