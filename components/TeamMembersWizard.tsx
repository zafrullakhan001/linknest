import React, { useEffect, useMemo, useState } from 'react';
import { AccessWizardShell, WizardNavButton, WizardSummaryCard } from './AccessWizardShell';

type MembersMode = 'add' | 'remove';

interface TeamUser {
  id: number;
  username: string;
  email: string;
  auth_source?: string;
}

interface TeamMember {
  id: number;
  username: string;
  email: string;
  authSource?: string;
  joinedAt: number;
}

interface TeamMembersWizardProps {
  isOpen: boolean;
  teamName?: string;
  members: TeamMember[];
  membersLoading: boolean;
  allUsers: TeamUser[];
  selectedUserIds: Set<number>;
  onSelectedUserIdsChange: (ids: Set<number>) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  error: string;
  loading: boolean;
  onClose: () => void;
  onAddMembers: () => void;
  onRemoveMembers: (userIds: number[]) => Promise<void> | void;
}

export const TeamMembersWizard: React.FC<TeamMembersWizardProps> = ({
  isOpen,
  teamName,
  members,
  membersLoading,
  allUsers,
  selectedUserIds,
  onSelectedUserIdsChange,
  searchTerm,
  onSearchTermChange,
  error,
  loading,
  onClose,
  onAddMembers,
  onRemoveMembers,
}) => {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<MembersMode>('add');

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setMode('add');
    }
  }, [isOpen]);

  const candidateUsers = useMemo(() => {
    const search = searchTerm.toLowerCase();
    if (mode === 'add') {
      return allUsers.filter(
        (user) =>
          !members.some((m) => m.id === user.id) &&
          (user.username.toLowerCase().includes(search) || user.email.toLowerCase().includes(search))
      );
    }
    return members.filter(
      (member) =>
        member.username.toLowerCase().includes(search) || member.email.toLowerCase().includes(search)
    );
  }, [allUsers, members, mode, searchTerm]);

  if (!isOpen) return null;

  const selectedCount = selectedUserIds.size;
  const canContinueFromMode = true;
  const canContinueFromSelect = selectedCount > 0;

  const toggleUser = (userId: number, checked: boolean) => {
    const next = new Set(selectedUserIds);
    if (checked) next.add(userId);
    else next.delete(userId);
    onSelectedUserIdsChange(next);
  };

  const handleModeChange = (nextMode: MembersMode) => {
    setMode(nextMode);
    onSelectedUserIdsChange(new Set());
    onSearchTermChange('');
  };

  const selectedPeople =
    mode === 'add'
      ? allUsers.filter((u) => selectedUserIds.has(u.id))
      : members.filter((m) => selectedUserIds.has(m.id));

  const summary =
    mode === 'add'
      ? `Add ${selectedCount} ${selectedCount === 1 ? 'person' : 'people'} to ${teamName ? `“${teamName}”` : 'this team'}. They will inherit the team’s roles and permissions.`
      : `Remove ${selectedCount} ${selectedCount === 1 ? 'person' : 'people'} from ${teamName ? `“${teamName}”` : 'this team'}. They will lose roles inherited only through this team.`;

  return (
    <AccessWizardShell
      title="Manage team members"
      subtitle={
        step === 1
          ? 'Choose whether you are adding or removing people.'
          : step === 2
            ? mode === 'add'
              ? 'Select people who are not already on this team.'
              : 'Select current members to remove.'
            : 'Confirm the membership change before applying.'
      }
      steps={['Action', 'People', 'Review']}
      currentStep={step}
      onStepChange={setStep}
      error={error}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
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
              disabled={step === 1 ? !canContinueFromMode : !canContinueFromSelect}
              onClick={() => setStep(step + 1)}
            >
              Continue
            </WizardNavButton>
          ) : (
            <WizardNavButton
              variant={mode === 'remove' ? 'danger' : 'primary'}
              disabled={loading || !canContinueFromSelect}
              onClick={async () => {
                if (mode === 'add') {
                  onAddMembers();
                } else {
                  await onRemoveMembers(Array.from(selectedUserIds));
                }
              }}
            >
              {loading
                ? mode === 'add'
                  ? 'Adding…'
                  : 'Removing…'
                : mode === 'add'
                  ? 'Add members'
                  : 'Remove members'}
            </WizardNavButton>
          )}
        </>
      }
    >
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {teamName ? (
              <>
                Updating members for <span className="font-semibold text-slate-900 dark:text-white">{teamName}</span>.
                Currently {members.length} member{members.length !== 1 ? 's' : ''}.
              </>
            ) : (
              <>Currently {members.length} member{members.length !== 1 ? 's' : ''}.</>
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleModeChange('add')}
              className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                mode === 'add'
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className={`text-sm font-semibold ${mode === 'add' ? 'text-brand-700 dark:text-brand-300' : 'text-slate-900 dark:text-white'}`}>
                Add people
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Invite people into the team so they inherit its roles.
              </p>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('remove')}
              className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                mode === 'remove'
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className={`text-sm font-semibold ${mode === 'remove' ? 'text-red-700 dark:text-red-300' : 'text-slate-900 dark:text-white'}`}>
                Remove people
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Take people off the team without deleting their accounts.
              </p>
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {mode === 'add' ? 'Select people to add' : 'Select members to remove'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{selectedCount} selected</p>
            </div>
          </div>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              placeholder={mode === 'add' ? 'Search people…' : 'Search members…'}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 pl-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-[22rem] overflow-y-auto">
            {membersLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
              </div>
            ) : candidateUsers.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {mode === 'add'
                  ? searchTerm
                    ? 'No matching people'
                    : 'Everyone is already on this team'
                  : searchTerm
                    ? 'No matching members'
                    : 'This team has no members yet'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
                {candidateUsers.map((person) => {
                  const selected = selectedUserIds.has(person.id);
                  return (
                    <label
                      key={person.id}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                        selected
                          ? 'bg-brand-50/70 dark:bg-brand-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => toggleUser(person.id, e.target.checked)}
                        className="mt-1 w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {person.username}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {person.email}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <WizardSummaryCard tone={mode === 'remove' ? 'danger' : 'brand'}>{summary}</WizardSummaryCard>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              {mode === 'add' ? 'People to add' : 'People to remove'} ({selectedCount})
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {selectedPeople.map((person) => (
                <div key={person.id} className="text-sm text-slate-800 dark:text-slate-200 truncate">
                  {person.username}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AccessWizardShell>
  );
};
