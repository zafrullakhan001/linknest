import React, { useEffect, useMemo, useState } from 'react';
import { Tile } from '../types';
import { AccessWizardShell, WizardNavButton, WizardSummaryCard } from './AccessWizardShell';

interface EditorUser {
  id: number;
  username: string;
  email: string;
}

interface EditorGroup {
  id: number;
  name: string;
  memberCount: number;
}

type WhoTarget = 'users' | 'groups';

interface AssignSpaceEditorsWizardProps {
  isOpen: boolean;
  tiles: Tile[];
  users: EditorUser[];
  groups: EditorGroup[];
  selectedTileIds: Set<string>;
  onSelectedTileIdsChange: (ids: Set<string>) => void;
  selectedUserIds: Set<number>;
  onSelectedUserIdsChange: (ids: Set<number>) => void;
  selectedGroupIds: Set<number>;
  onSelectedGroupIdsChange: (ids: Set<number>) => void;
  tileSearchTerm: string;
  onTileSearchTermChange: (value: string) => void;
  userSearchTerm: string;
  onUserSearchTermChange: (value: string) => void;
  groupSearchTerm: string;
  onGroupSearchTermChange: (value: string) => void;
  menuFilter: string;
  onMenuFilterChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  ownerFilter: string;
  onOwnerFilterChange: (value: string) => void;
  categories: string[];
  owners: string[];
  error: string;
  loading: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export const AssignSpaceEditorsWizard: React.FC<AssignSpaceEditorsWizardProps> = ({
  isOpen,
  tiles,
  users,
  groups,
  selectedTileIds,
  onSelectedTileIdsChange,
  selectedUserIds,
  onSelectedUserIdsChange,
  selectedGroupIds,
  onSelectedGroupIdsChange,
  tileSearchTerm,
  onTileSearchTermChange,
  userSearchTerm,
  onUserSearchTermChange,
  groupSearchTerm,
  onGroupSearchTermChange,
  menuFilter,
  onMenuFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  ownerFilter,
  onOwnerFilterChange,
  categories,
  owners,
  error,
  loading,
  onClose,
  onSubmit,
}) => {
  const [step, setStep] = useState(1);
  const [whoTarget, setWhoTarget] = useState<WhoTarget>('users');

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setWhoTarget('users');
    }
  }, [isOpen]);

  const filteredTiles = useMemo(() => {
    return tiles.filter((tile) => {
      if (tileSearchTerm) {
        const search = tileSearchTerm.toLowerCase();
        const matchesSearch =
          (tile.title || '').toLowerCase().includes(search) ||
          (tile.description || '').toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }

      if (ownerFilter) {
        const userIdNum = typeof tile.userId === 'string' ? parseInt(tile.userId, 10) : tile.userId;
        const owner = users.find((u) => u.id === userIdNum);
        if ((owner?.username || '') !== ownerFilter) return false;
      }

      const tileVisibility = tile.visibility || 'public';
      if (tileVisibility !== menuFilter) return false;

      if (categoryFilter) {
        if ((tile.group || '') !== categoryFilter) return false;
      }

      return true;
    });
  }, [tiles, tileSearchTerm, ownerFilter, users, menuFilter, categoryFilter]);

  const filteredUsers = useMemo(() => {
    const search = userSearchTerm.toLowerCase();
    return users.filter(
      (user) =>
        user.username.toLowerCase().includes(search) || user.email.toLowerCase().includes(search)
    );
  }, [users, userSearchTerm]);

  const filteredGroups = useMemo(() => {
    const search = groupSearchTerm.toLowerCase();
    return groups.filter((group) => group.name.toLowerCase().includes(search));
  }, [groups, groupSearchTerm]);

  if (!isOpen) return null;

  const selectedSpaces = tiles.filter((tile) => selectedTileIds.has(tile.id));
  const selectedPeople = users.filter((user) => selectedUserIds.has(user.id));
  const selectedTeams = groups.filter((group) => selectedGroupIds.has(group.id));
  const whoCount = selectedUserIds.size + selectedGroupIds.size;

  const toggleTile = (tileId: string, checked: boolean) => {
    const next = new Set(selectedTileIds);
    if (checked) next.add(tileId);
    else next.delete(tileId);
    onSelectedTileIdsChange(next);
  };

  const toggleAllFilteredTiles = () => {
    const ids = filteredTiles.map((t) => t.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedTileIds.has(id));
    const next = new Set(selectedTileIds);
    if (allSelected) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    onSelectedTileIdsChange(next);
  };

  const toggleUser = (userId: number, checked: boolean) => {
    const next = new Set(selectedUserIds);
    if (checked) next.add(userId);
    else next.delete(userId);
    onSelectedUserIdsChange(next);
  };

  const toggleGroup = (groupId: number, checked: boolean) => {
    const next = new Set(selectedGroupIds);
    if (checked) next.add(groupId);
    else next.delete(groupId);
    onSelectedGroupIdsChange(next);
  };

  const summary = `Grant editor access on ${selectedTileIds.size} space${
    selectedTileIds.size !== 1 ? 's' : ''
  } to ${selectedUserIds.size} ${selectedUserIds.size === 1 ? 'person' : 'people'} and ${
    selectedGroupIds.size
  } team${selectedGroupIds.size !== 1 ? 's' : ''}. Editors can add and edit links, sections, and tabs by default. Delete, visibility, browser, and clone stay restricted unless you fine-tune later.`;

  return (
    <AccessWizardShell
      title="Assign space editors"
      subtitle={
        step === 1
          ? 'Choose which spaces should get new editors.'
          : step === 2
            ? 'Choose people and/or teams who should become editors.'
            : 'Confirm the grants before applying.'
      }
      steps={['Spaces', 'Who', 'Review']}
      currentStep={step}
      onStepChange={setStep}
      error={error}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
      footerLeft={
        <WizardNavButton variant="ghost" onClick={onClose}>
          Cancel
        </WizardNavButton>
      }
      footerRight={
        <>
          {step > 1 && (
            <WizardNavButton variant="secondary" onClick={() => setStep(step - 1)}>
              Back
            </WizardNavButton>
          )}
          {step < 3 ? (
            <WizardNavButton
              disabled={step === 1 ? selectedTileIds.size === 0 : whoCount === 0}
              onClick={() => setStep(step + 1)}
            >
              Continue
            </WizardNavButton>
          ) : (
            <WizardNavButton
              disabled={loading || selectedTileIds.size === 0 || whoCount === 0}
              onClick={onSubmit}
            >
              {loading ? 'Granting…' : 'Grant editor access'}
            </WizardNavButton>
          )}
        </>
      }
    >
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
            Space editors can manage content inside a space. Ownership of the space does not change.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={menuFilter}
              onChange={(e) => onMenuFilterChange(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white"
            >
              <option value="public">Public menu</option>
              <option value="authenticated">Authenticated</option>
              <option value="private">Private</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => onCategoryFilterChange(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              value={ownerFilter}
              onChange={(e) => onOwnerFilterChange(e.target.value)}
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white"
            >
              <option value="">All owners</option>
              {owners.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Select spaces</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {selectedTileIds.size} selected
              </p>
            </div>
            <button
              type="button"
              onClick={toggleAllFilteredTiles}
              className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              {filteredTiles.length > 0 && filteredTiles.every((t) => selectedTileIds.has(t.id))
                ? 'Deselect all'
                : 'Select all'}
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              value={tileSearchTerm}
              onChange={(e) => onTileSearchTermChange(e.target.value)}
              placeholder="Search spaces…"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 pl-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-[20rem] overflow-y-auto">
            {filteredTiles.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No spaces match</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
                {filteredTiles.map((tile) => {
                  const selected = selectedTileIds.has(tile.id);
                  return (
                    <label
                      key={tile.id}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                        selected
                          ? 'bg-brand-50/70 dark:bg-brand-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => toggleTile(tile.id, e.target.checked)}
                        className="mt-1 w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {tile.emoji || '📄'} {tile.title || tile.id}
                        </div>
                        {tile.description && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {tile.description}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900/60 p-1">
            <button
              type="button"
              onClick={() => setWhoTarget('users')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                whoTarget === 'users'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              People ({selectedUserIds.size})
            </button>
            <button
              type="button"
              onClick={() => setWhoTarget('groups')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                whoTarget === 'groups'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Teams ({selectedGroupIds.size})
            </button>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300">
            You can pick people and teams. Both will receive editor access on the spaces from step 1.
          </p>

          {whoTarget === 'users' ? (
            <>
              <div className="relative">
                <input
                  type="text"
                  value={userSearchTerm}
                  onChange={(e) => onUserSearchTermChange(e.target.value)}
                  placeholder="Search people…"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 pl-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                />
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-[20rem] overflow-y-auto">
                {filteredUsers.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No people found</div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
                    {filteredUsers.map((user) => {
                      const selected = selectedUserIds.has(user.id);
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
                            onChange={(e) => toggleUser(user.id, e.target.checked)}
                            className="mt-1 w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {user.username}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {user.email}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="relative">
                <input
                  type="text"
                  value={groupSearchTerm}
                  onChange={(e) => onGroupSearchTermChange(e.target.value)}
                  placeholder="Search teams…"
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 pl-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                />
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-[20rem] overflow-y-auto">
                {filteredGroups.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No teams found</div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
                    {filteredGroups.map((group) => {
                      const selected = selectedGroupIds.has(group.id);
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
                            onChange={(e) => toggleGroup(group.id, e.target.checked)}
                            className="mt-1 w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {group.name}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <WizardSummaryCard>{summary}</WizardSummaryCard>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                Spaces ({selectedSpaces.length})
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {selectedSpaces.map((tile) => (
                  <div key={tile.id} className="text-sm text-slate-800 dark:text-slate-200 truncate">
                    {tile.emoji || '📄'} {tile.title || tile.id}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                People ({selectedPeople.length})
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {selectedPeople.length === 0 ? (
                  <div className="text-sm text-slate-500">None</div>
                ) : (
                  selectedPeople.map((user) => (
                    <div key={user.id} className="text-sm text-slate-800 dark:text-slate-200 truncate">
                      {user.username}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                Teams ({selectedTeams.length})
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {selectedTeams.length === 0 ? (
                  <div className="text-sm text-slate-500">None</div>
                ) : (
                  selectedTeams.map((group) => (
                    <div key={group.id} className="text-sm text-slate-800 dark:text-slate-200 truncate">
                      {group.name}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AccessWizardShell>
  );
};
