import React, { useEffect, useMemo, useState } from 'react';
import { Role } from '../services/rolesService';
import { GroupRole, userGroupsService } from '../services/userGroupsService';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface TeamInfo {
  id: number;
  name: string;
  description?: string | null;
}

interface TeamRolesModalProps {
  isOpen: boolean;
  team: TeamInfo | null;
  allRoles: Role[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

export const TeamRolesModal: React.FC<TeamRolesModalProps> = ({
  isOpen,
  team,
  allRoles,
  onClose,
  onChanged,
}) => {
  const [assigned, setAssigned] = useState<GroupRole[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState<Set<number>>(new Set());

  useEscapeToClose(isOpen, onClose);

  const loadRoles = async (teamId: number) => {
    setLoading(true);
    setError('');
    try {
      const list = await userGroupsService.getGroupRoles(teamId);
      setAssigned(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team roles');
      setAssigned([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !team) return;
    setSearch('');
    setSelectedToAdd(new Set());
    void loadRoles(team.id);
  }, [isOpen, team?.id]);

  const assignedIds = useMemo(() => new Set(assigned.map((r) => r.id)), [assigned]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRoles
      .filter((r) => !assignedIds.has(r.id))
      .filter((r) => {
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 150);
  }, [allRoles, assignedIds, search]);

  const filteredAssigned = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assigned;
    return assigned.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
    );
  }, [assigned, search]);

  if (!isOpen || !team) return null;

  const toggleAdd = (roleId: number) => {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (selectedToAdd.size === 0) return;
    setSaving(true);
    setError('');
    try {
      const nextIds = [...assignedIds, ...selectedToAdd];
      await userGroupsService.assignRolesToGroup(team.id, nextIds);
      setSelectedToAdd(new Set());
      await loadRoles(team.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign roles');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (role: GroupRole) => {
    if (!confirm(`Remove role "${role.name}" from team "${team.name}"?`)) return;
    setSaving(true);
    setError('');
    try {
      await userGroupsService.removeRoleFromGroup(team.id, role.id);
      await loadRoles(team.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove role');
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
              Team roles
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {team.name}
              {team.description ? ` — ${team.description}` : ''}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Every team member inherits these roles’ visibility.
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
            placeholder="Search current roles or find a role to add…"
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
                    Current ({assigned.length})
                  </h3>
                </div>
                {filteredAssigned.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                    {assigned.length === 0
                      ? 'No roles on this team yet. Add roles below.'
                      : 'No matches in current roles.'}
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    {filteredAssigned.map((role) => (
                      <li
                        key={role.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-slate-800/60"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {role.name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {role.description || 'No description'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRemove(role)}
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
                    Add roles
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
                    {allRoles.length === 0
                      ? 'No roles loaded. Create a role first.'
                      : search.trim()
                        ? 'No matching roles to add.'
                        : 'Every role is already on this team.'}
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    {candidates.map((role) => (
                      <li key={role.id}>
                        <label className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedToAdd.has(role.id)}
                            onChange={() => toggleAdd(role.id)}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {role.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {role.description || 'No description'}
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
