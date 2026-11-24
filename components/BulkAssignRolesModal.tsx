import React, { useMemo } from 'react';
import { Role } from '../services/rolesService';

type AssignTarget = 'users' | 'groups';
type AssignMode = 'add' | 'replace' | 'remove';
type AssignStep = 1 | 2 | 3;

interface BulkUser {
  id: number;
  username: string;
  email: string;
}

interface BulkGroup {
  id: number;
  name: string;
  description?: string | null;
  memberCount: number;
}

interface AssignedRole {
  id: number;
  name: string;
  description?: string;
}

interface BulkAssignRolesModalProps {
  isOpen: boolean;
  error: string;
  step: AssignStep;
  onStepChange: (step: AssignStep) => void;
  target: AssignTarget;
  onTargetChange: (target: AssignTarget) => void;
  mode: AssignMode;
  onModeChange: (mode: AssignMode) => void;
  users: BulkUser[];
  groups: BulkGroup[];
  roles: Role[];
  rolesLoading: boolean;
  selectedUserIds: number[];
  onSelectedUserIdsChange: (ids: number[]) => void;
  selectedGroupIds: number[];
  onSelectedGroupIdsChange: (ids: number[]) => void;
  selectedRoleIds: number[];
  onSelectedRoleIdsChange: (ids: number[]) => void;
  userSearchTerm: string;
  onUserSearchTermChange: (value: string) => void;
  groupSearchTerm: string;
  onGroupSearchTermChange: (value: string) => void;
  roleSearchTerm: string;
  onRoleSearchTermChange: (value: string) => void;
  userRolesMap: Record<number, AssignedRole[]>;
  groupRolesMap: Record<number, AssignedRole[]>;
  loadingUserRoles: Set<number>;
  loadingGroupRoles: Set<number>;
  expandedRoleTargets: Set<string>;
  onToggleExpandedRoleTarget: (key: string) => void;
  onRefreshUserRoles: () => void;
  onRefreshGroupRoles: () => void;
  onSelectTeams: () => void;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

const STEP_LABELS = ['Who', 'Roles', 'Review'] as const;

const MODE_COPY: Record<AssignMode, { title: string; description: string; tone: string }> = {
  add: {
    title: 'Add',
    description: 'Keep current roles and add the ones you select.',
    tone: 'brand',
  },
  replace: {
    title: 'Replace',
    description: 'Clear current roles, then assign only the ones you select.',
    tone: 'brand',
  },
  remove: {
    title: 'Remove',
    description: 'Take selected roles away from the chosen people or teams.',
    tone: 'danger',
  },
};

export const BulkAssignRolesModal: React.FC<BulkAssignRolesModalProps> = ({
  isOpen,
  error,
  step,
  onStepChange,
  target,
  onTargetChange,
  mode,
  onModeChange,
  users,
  groups,
  roles,
  rolesLoading,
  selectedUserIds,
  onSelectedUserIdsChange,
  selectedGroupIds,
  onSelectedGroupIdsChange,
  selectedRoleIds,
  onSelectedRoleIdsChange,
  userSearchTerm,
  onUserSearchTermChange,
  groupSearchTerm,
  onGroupSearchTermChange,
  roleSearchTerm,
  onRoleSearchTermChange,
  userRolesMap,
  groupRolesMap,
  loadingUserRoles,
  loadingGroupRoles,
  expandedRoleTargets,
  onToggleExpandedRoleTarget,
  onRefreshUserRoles,
  onRefreshGroupRoles,
  onSelectTeams,
  loading,
  onClose,
  onSubmit,
}) => {
  const selectedTargetCount = target === 'users' ? selectedUserIds.length : selectedGroupIds.length;
  const targetLabel = target === 'users' ? 'people' : 'teams';
  const targetLabelSingular = target === 'users' ? 'person' : 'team';

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (user) =>
          user.username.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
          user.email.toLowerCase().includes(userSearchTerm.toLowerCase())
      ),
    [users, userSearchTerm]
  );

  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          group.name.toLowerCase().includes(groupSearchTerm.toLowerCase()) ||
          (group.description && group.description.toLowerCase().includes(groupSearchTerm.toLowerCase()))
      ),
    [groups, groupSearchTerm]
  );

  const filteredRoles = useMemo(() => {
    let next = roles.filter(
      (role) =>
        role.name.toLowerCase().includes(roleSearchTerm.toLowerCase()) ||
        (role.description && role.description.toLowerCase().includes(roleSearchTerm.toLowerCase()))
    );

    if (mode === 'remove') {
      if (target === 'users' && selectedUserIds.length > 0) {
        const userRoleIds = new Set<number>();
        selectedUserIds.forEach((userId) => {
          (userRolesMap[userId] || []).forEach((role) => userRoleIds.add(role.id));
        });
        next = next.filter((role) => userRoleIds.has(role.id));
      } else if (target === 'groups' && selectedGroupIds.length > 0) {
        const groupRoleIds = new Set<number>();
        selectedGroupIds.forEach((groupId) => {
          (groupRolesMap[groupId] || []).forEach((role) => groupRoleIds.add(role.id));
        });
        next = next.filter((role) => groupRoleIds.has(role.id));
      }
    }

    return next;
  }, [
    roles,
    roleSearchTerm,
    mode,
    target,
    selectedUserIds,
    selectedGroupIds,
    userRolesMap,
    groupRolesMap,
  ]);

  const selectedRoles = useMemo(
    () => roles.filter((role) => selectedRoleIds.includes(role.id)),
    [roles, selectedRoleIds]
  );

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedUserIds.includes(user.id)),
    [users, selectedUserIds]
  );

  const selectedGroups = useMemo(
    () => groups.filter((group) => selectedGroupIds.includes(group.id)),
    [groups, selectedGroupIds]
  );

  if (!isOpen) return null;

  const canContinueFromWho = selectedTargetCount > 0;
  const canContinueFromRoles = selectedRoleIds.length > 0;

  const toggleAllUsers = () => {
    const ids = filteredUsers.map((u) => u.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedUserIds.includes(id));
    if (allSelected) {
      onSelectedUserIdsChange(selectedUserIds.filter((id) => !ids.includes(id)));
    } else {
      const merged = [...selectedUserIds];
      ids.forEach((id) => {
        if (!merged.includes(id)) merged.push(id);
      });
      onSelectedUserIdsChange(merged);
    }
  };

  const toggleAllGroups = () => {
    const ids = filteredGroups.map((g) => g.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedGroupIds.includes(id));
    if (allSelected) {
      onSelectedGroupIdsChange(selectedGroupIds.filter((id) => !ids.includes(id)));
    } else {
      const merged = [...selectedGroupIds];
      ids.forEach((id) => {
        if (!merged.includes(id)) merged.push(id);
      });
      onSelectedGroupIdsChange(merged);
    }
  };

  const toggleAllRoles = () => {
    const ids = filteredRoles.map((r) => r.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedRoleIds.includes(id));
    if (allSelected) {
      onSelectedRoleIdsChange(selectedRoleIds.filter((id) => !ids.includes(id)));
    } else {
      const merged = [...selectedRoleIds];
      ids.forEach((id) => {
        if (!merged.includes(id)) merged.push(id);
      });
      onSelectedRoleIdsChange(merged);
    }
  };

  const reviewSummary =
    mode === 'add'
      ? `Add ${selectedRoleIds.length} role${selectedRoleIds.length !== 1 ? 's' : ''} to ${selectedTargetCount} ${selectedTargetCount === 1 ? targetLabelSingular : targetLabel}. Existing roles stay.`
      : mode === 'replace'
        ? `Replace all roles on ${selectedTargetCount} ${selectedTargetCount === 1 ? targetLabelSingular : targetLabel} with ${selectedRoleIds.length} selected role${selectedRoleIds.length !== 1 ? 's' : ''}.`
        : `Remove ${selectedRoleIds.length} role${selectedRoleIds.length !== 1 ? 's' : ''} from ${selectedTargetCount} ${selectedTargetCount === 1 ? targetLabelSingular : targetLabel}.`;

  const renderRoleSummary = (
    key: string,
    assigned: AssignedRole[],
    isLoading: boolean
  ) => {
    if (isLoading) {
      return <span className="text-xs text-slate-400">Loading roles…</span>;
    }

    if (assigned.length === 0) {
      return <span className="text-xs text-slate-400 dark:text-slate-500">No roles</span>;
    }

    const expanded = expandedRoleTargets.has(key);

    return (
      <div className="mt-1">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleExpandedRoleTarget(key);
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400"
        >
          <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-700 px-2 py-0.5">
            {assigned.length} role{assigned.length !== 1 ? 's' : ''}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {expanded && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {assigned.map((role) => (
              <span
                key={role.id}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                title={role.description || role.name}
              >
                {role.name}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Assign roles</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {step === 1 && 'Choose who should receive the change.'}
                {step === 2 && 'Pick a mode, then choose which roles apply.'}
                {step === 3 && 'Confirm the change before applying.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Steps */}
          <div className="mt-5 flex items-center gap-2">
            {STEP_LABELS.map((label, index) => {
              const stepNumber = (index + 1) as AssignStep;
              const isActive = step === stepNumber;
              const isDone = step > stepNumber;
              return (
                <React.Fragment key={label}>
                  {index > 0 && (
                    <div
                      className={`h-px flex-1 ${isDone || isActive ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                    />
                  )}
                  <button
                    type="button"
                    disabled={stepNumber > step}
                    onClick={() => {
                      if (stepNumber < step) onStepChange(stepNumber);
                    }}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-brand-600 text-white'
                        : isDone
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-700/60 dark:text-slate-500'
                    } ${stepNumber < step ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                        isActive
                          ? 'bg-white/20'
                          : isDone
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300'
                      }`}
                    >
                      {isDone ? '✓' : stepNumber}
                    </span>
                    {label}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <>
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900/60 p-1">
                <button
                  type="button"
                  onClick={() => onTargetChange('users')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    target === 'users'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  People
                </button>
                <button
                  type="button"
                  onClick={onSelectTeams}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    target === 'groups'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Teams
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Select {target === 'users' ? 'people' : 'teams'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedTargetCount} selected
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={target === 'users' ? onRefreshUserRoles : onRefreshGroupRoles}
                    className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title="Refresh current roles"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={target === 'users' ? toggleAllUsers : toggleAllGroups}
                    className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    {target === 'users'
                      ? filteredUsers.length > 0 && filteredUsers.every((u) => selectedUserIds.includes(u.id))
                        ? 'Deselect all'
                        : 'Select all'
                      : filteredGroups.length > 0 && filteredGroups.every((g) => selectedGroupIds.includes(g.id))
                        ? 'Deselect all'
                        : 'Select all'}
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder={target === 'users' ? 'Search people…' : 'Search teams…'}
                  value={target === 'users' ? userSearchTerm : groupSearchTerm}
                  onChange={(e) =>
                    target === 'users'
                      ? onUserSearchTermChange(e.target.value)
                      : onGroupSearchTermChange(e.target.value)
                  }
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 pl-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-[22rem] overflow-y-auto">
                {target === 'users' ? (
                  filteredUsers.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      {users.length === 0 ? 'No people available' : 'No matches'}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
                      {filteredUsers.map((user) => {
                        const assigned = userRolesMap[user.id] || [];
                        const selected = selectedUserIds.includes(user.id);
                        const key = `u:${user.id}`;
                        return (
                          <label
                            key={user.id}
                            className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                              selected
                                ? 'bg-brand-50/70 dark:bg-brand-900/20'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  onSelectedUserIdsChange([...selectedUserIds, user.id]);
                                } else {
                                  onSelectedUserIdsChange(selectedUserIds.filter((id) => id !== user.id));
                                }
                              }}
                              className="mt-1 w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                  {user.username}
                                </div>
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {user.email}
                              </div>
                              {renderRoleSummary(key, assigned, loadingUserRoles.has(user.id))}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )
                ) : filteredGroups.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    {groups.length === 0 ? 'No teams available' : 'No matches'}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
                    {filteredGroups.map((group) => {
                      const assigned = groupRolesMap[group.id] || [];
                      const selected = selectedGroupIds.includes(group.id);
                      const key = `g:${group.id}`;
                      return (
                        <label
                          key={group.id}
                          className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                            selected
                              ? 'bg-brand-50/70 dark:bg-brand-900/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                onSelectedGroupIdsChange([...selectedGroupIds, group.id]);
                              } else {
                                onSelectedGroupIdsChange(selectedGroupIds.filter((id) => id !== group.id));
                              }
                            }}
                            className="mt-1 w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {group.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
                              {group.description ? ` · ${group.description}` : ''}
                            </div>
                            {renderRoleSummary(key, assigned, loadingGroupRoles.has(group.id))}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">What should happen?</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(['add', 'replace', 'remove'] as AssignMode[]).map((option) => {
                    const copy = MODE_COPY[option];
                    const active = mode === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => onModeChange(option)}
                        className={`text-left rounded-xl border px-3 py-3 transition-colors ${
                          active
                            ? option === 'remove'
                              ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                              : 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <div
                          className={`text-sm font-semibold ${
                            active
                              ? option === 'remove'
                                ? 'text-red-700 dark:text-red-300'
                                : 'text-brand-700 dark:text-brand-300'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {copy.title}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          {copy.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Select roles</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedRoleIds.length} selected
                    {mode === 'remove' ? ' · only roles already assigned are shown' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleAllRoles}
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                >
                  {filteredRoles.length > 0 && filteredRoles.every((r) => selectedRoleIds.includes(r.id))
                    ? 'Deselect all'
                    : 'Select all'}
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Search roles…"
                  value={roleSearchTerm}
                  onChange={(e) => onRoleSearchTermChange(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 pl-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>

              {rolesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-[20rem] overflow-y-auto">
                  {filteredRoles.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      {roles.length === 0
                        ? 'No roles available. Create roles first.'
                        : mode === 'remove' && selectedTargetCount > 0
                          ? `No removable roles for the selected ${targetLabel}.`
                          : 'No matches'}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
                      {filteredRoles.map((role) => {
                        let allTargetsHaveRole = true;
                        if (mode === 'remove') {
                          if (target === 'users' && selectedUserIds.length > 0) {
                            allTargetsHaveRole = selectedUserIds.every((userId) =>
                              (userRolesMap[userId] || []).some((r) => r.id === role.id)
                            );
                          } else if (target === 'groups' && selectedGroupIds.length > 0) {
                            allTargetsHaveRole = selectedGroupIds.every((groupId) =>
                              (groupRolesMap[groupId] || []).some((r) => r.id === role.id)
                            );
                          }
                        }

                        const selected = selectedRoleIds.includes(role.id);
                        const disabled = mode === 'remove' && !allTargetsHaveRole;

                        return (
                          <label
                            key={role.id}
                            className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                              disabled
                                ? 'opacity-50 cursor-not-allowed'
                                : selected
                                  ? 'bg-brand-50/70 dark:bg-brand-900/20 cursor-pointer'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={disabled}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  onSelectedRoleIdsChange([...selectedRoleIds, role.id]);
                                } else {
                                  onSelectedRoleIdsChange(selectedRoleIds.filter((id) => id !== role.id));
                                }
                              }}
                              className="mt-1 w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500 disabled:cursor-not-allowed"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-slate-900 dark:text-white">
                                {role.name}
                              </div>
                              {role.description && (
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                  {role.description}
                                </div>
                              )}
                              {disabled && (
                                <div className="text-xs text-slate-400 mt-1 italic">
                                  Not assigned to every selected {targetLabelSingular}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div
                className={`rounded-xl border px-4 py-4 ${
                  mode === 'remove'
                    ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                    : 'border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20'
                }`}
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                  Summary
                </div>
                <p
                  className={`text-sm font-medium leading-relaxed ${
                    mode === 'remove'
                      ? 'text-red-800 dark:text-red-200'
                      : 'text-brand-900 dark:text-brand-100'
                  }`}
                >
                  {reviewSummary}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    {target === 'users' ? 'People' : 'Teams'} ({selectedTargetCount})
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {target === 'users'
                      ? selectedUsers.map((user) => (
                          <div key={user.id} className="text-sm text-slate-800 dark:text-slate-200 truncate">
                            {user.username}
                          </div>
                        ))
                      : selectedGroups.map((group) => (
                          <div key={group.id} className="text-sm text-slate-800 dark:text-slate-200 truncate">
                            {group.name}
                          </div>
                        ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    Roles ({selectedRoleIds.length})
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {selectedRoles.map((role) => (
                      <div key={role.id} className="text-sm text-slate-800 dark:text-slate-200 truncate">
                        {role.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mode: <span className="font-medium text-slate-700 dark:text-slate-300">{MODE_COPY[mode].title}</span>
                {' · '}
                You can go back to change selections before applying.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-900/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => onStepChange((step - 1) as AssignStep)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                disabled={step === 1 ? !canContinueFromWho : !canContinueFromRoles}
                onClick={() => onStepChange((step + 1) as AssignStep)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={loading || !canContinueFromWho || !canContinueFromRoles}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors ${
                  mode === 'remove' ? 'bg-red-600 hover:bg-red-500' : 'bg-brand-600 hover:bg-brand-500'
                }`}
              >
                {loading
                  ? mode === 'remove'
                    ? 'Removing…'
                    : 'Applying…'
                  : mode === 'remove'
                    ? 'Remove roles'
                    : 'Apply changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
