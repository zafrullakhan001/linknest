import React, { useEffect, useMemo, useState } from 'react';
import { Role, rolesService } from '../services/rolesService';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface RoleMemberUser {
  id: number;
  username: string;
  email: string;
}

interface RoleMembersModalProps {
  isOpen: boolean;
  role: Role | null;
  allUsers: RoleMemberUser[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

export const RoleMembersModal: React.FC<RoleMembersModalProps> = ({
  isOpen,
  role,
  allUsers,
  onClose,
  onChanged,
}) => {
  const [members, setMembers] = useState<RoleMemberUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState<Set<number>>(new Set());

  useEscapeToClose(isOpen, onClose);

  const loadMembers = async (roleId: number) => {
    setLoading(true);
    setError('');
    try {
      const detail = await rolesService.getRole(roleId);
      setMembers(detail.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load people for this role');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !role) return;
    setSearch('');
    setSelectedToAdd(new Set());
    void loadMembers(role.id);
  }, [isOpen, role?.id]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers
      .filter((u) => !memberIds.has(u.id))
      .filter((u) => {
        if (!q) return true;
        return (
          u.username.toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 150);
  }, [allUsers, memberIds, search]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
    );
  }, [members, search]);

  if (!isOpen || !role) return null;

  const toggleAdd = (userId: number) => {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (selectedToAdd.size === 0) return;
    setSaving(true);
    setError('');
    try {
      await rolesService.bulkAssignRolesToUsers({
        userIds: Array.from(selectedToAdd),
        roleIds: [role.id],
        mode: 'add',
      });
      setSelectedToAdd(new Set());
      await loadMembers(role.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add people');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (user: RoleMemberUser) => {
    if (!confirm(`Remove ${user.username} from the "${role.name}" role?`)) return;
    setSaving(true);
    setError('');
    try {
      await rolesService.removeRoleFromUser(user.id, role.id);
      await loadMembers(role.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove person');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              People with access
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {role.name}
              {role.description ? ` — ${role.description}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search current people or find someone to add…"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
            </div>
          ) : (
            <>
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Current ({members.length})
                  </h3>
                </div>
                {filteredMembers.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                    {members.length === 0
                      ? 'No one has this role yet. Add people below.'
                      : 'No matches in current people.'}
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    {filteredMembers.map((user) => (
                      <li
                        key={user.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-slate-800/60"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {user.username}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {user.email}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRemove(user)}
                          disabled={saving}
                          className="shrink-0 px-2.5 py-1 text-xs font-medium rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between mb-3 gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Add people
                  </h3>
                  {selectedToAdd.size > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleAddSelected()}
                      disabled={saving}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
                    >
                      {saving ? 'Adding…' : `Add ${selectedToAdd.size} selected`}
                    </button>
                  )}
                </div>
                {candidates.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                    {allUsers.length === 0
                      ? 'No users loaded.'
                      : search.trim()
                        ? 'No matching users to add.'
                        : 'Everyone is already on this role.'}
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    {candidates.map((user) => (
                      <li key={user.id}>
                        <label className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedToAdd.has(user.id)}
                            onChange={() => toggleAdd(user.id)}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {user.username}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {user.email}
                            </div>
                          </div>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          {selectedToAdd.size > 0 && (
            <button
              type="button"
              onClick={() => void handleAddSelected()}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white disabled:opacity-50"
            >
              {saving ? 'Adding…' : `Add ${selectedToAdd.size} selected`}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
