import React, { useEffect, useMemo, useState } from 'react';
import { Role } from '../services/rolesService';
import { AccessWizardShell, WizardNavButton, WizardSummaryCard } from './AccessWizardShell';

interface TeamRolesWizardProps {
  isOpen: boolean;
  teamName?: string;
  roles: Role[];
  rolesLoading: boolean;
  selectedRoleIds: Set<number>;
  onSelectedRoleIdsChange: (ids: Set<number>) => void;
  initialRoleIds: Set<number>;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  error: string;
  loading: boolean;
  onClose: () => void;
  onSave: () => void;
}

export const TeamRolesWizard: React.FC<TeamRolesWizardProps> = ({
  isOpen,
  teamName,
  roles,
  rolesLoading,
  selectedRoleIds,
  onSelectedRoleIdsChange,
  initialRoleIds,
  searchTerm,
  onSearchTermChange,
  error,
  loading,
  onClose,
  onSave,
}) => {
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (isOpen) setStep(1);
  }, [isOpen]);

  const filteredRoles = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return roles.filter(
      (role) =>
        role.name.toLowerCase().includes(search) ||
        (role.description || '').toLowerCase().includes(search)
    );
  }, [roles, searchTerm]);

  const selectedRoles = useMemo(
    () => roles.filter((role) => selectedRoleIds.has(role.id)),
    [roles, selectedRoleIds]
  );

  const addedRoles = useMemo(
    () => roles.filter((role) => selectedRoleIds.has(role.id) && !initialRoleIds.has(role.id)),
    [roles, selectedRoleIds, initialRoleIds]
  );

  const removedRoles = useMemo(
    () => roles.filter((role) => initialRoleIds.has(role.id) && !selectedRoleIds.has(role.id)),
    [roles, selectedRoleIds, initialRoleIds]
  );

  if (!isOpen) return null;

  const toggleRole = (roleId: number, checked: boolean) => {
    const next = new Set(selectedRoleIds);
    if (checked) next.add(roleId);
    else next.delete(roleId);
    onSelectedRoleIdsChange(next);
  };

  const summaryParts: string[] = [];
  if (addedRoles.length > 0) {
    summaryParts.push(`add ${addedRoles.length} role${addedRoles.length !== 1 ? 's' : ''}`);
  }
  if (removedRoles.length > 0) {
    summaryParts.push(`remove ${removedRoles.length} role${removedRoles.length !== 1 ? 's' : ''}`);
  }
  const summary =
    summaryParts.length === 0
      ? `No role changes for ${teamName ? `“${teamName}”` : 'this team'}. You can still save to keep the current set.`
      : `For ${teamName ? `“${teamName}”` : 'this team'}, you will ${summaryParts.join(' and ')}. Every team member inherits these roles.`;

  return (
    <AccessWizardShell
      title="Manage team roles"
      subtitle={
        step === 1
          ? 'Choose which roles this team should have. Members inherit them automatically.'
          : 'Review what will change for every member of this team.'
      }
      steps={['Roles', 'Review']}
      currentStep={step}
      onStepChange={setStep}
      error={error}
      onClose={onClose}
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
          {step < 2 ? (
            <WizardNavButton onClick={() => setStep(2)}>Continue</WizardNavButton>
          ) : (
            <WizardNavButton disabled={loading} onClick={onSave}>
              {loading ? 'Saving…' : 'Apply role changes'}
            </WizardNavButton>
          )}
        </>
      }
    >
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
            Checked roles stay assigned. Unchecked roles that were previously assigned will be removed.
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Select roles</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {selectedRoleIds.size} selected
              </p>
            </div>
          </div>
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              placeholder="Search roles…"
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 pl-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-[22rem] overflow-y-auto">
            {rolesLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
              </div>
            ) : filteredRoles.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {roles.length === 0 ? 'No roles available. Create roles first.' : 'No matching roles'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700/80">
                {filteredRoles.map((role) => {
                  const selected = selectedRoleIds.has(role.id);
                  return (
                    <label
                      key={role.id}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                        selected
                          ? 'bg-brand-50/70 dark:bg-brand-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => toggleRole(role.id, e.target.checked)}
                        className="mt-1 w-4 h-4 text-brand-600 border-slate-300 dark:border-slate-600 rounded focus:ring-brand-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900 dark:text-white">{role.name}</div>
                        {role.description && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {role.description}
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
          <WizardSummaryCard tone={removedRoles.length > 0 && addedRoles.length === 0 ? 'danger' : 'brand'}>
            {summary}
          </WizardSummaryCard>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                Will be assigned ({selectedRoles.length})
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {selectedRoles.length === 0 ? (
                  <div className="text-sm text-slate-500">No roles</div>
                ) : (
                  selectedRoles.map((role) => (
                    <div key={role.id} className="text-sm text-slate-800 dark:text-slate-200 truncate">
                      {role.name}
                      {addedRoles.some((r) => r.id === role.id) && (
                        <span className="ml-1 text-xs text-brand-600 dark:text-brand-400">new</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                Will be removed ({removedRoles.length})
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {removedRoles.length === 0 ? (
                  <div className="text-sm text-slate-500">None</div>
                ) : (
                  removedRoles.map((role) => (
                    <div key={role.id} className="text-sm text-red-700 dark:text-red-300 truncate">
                      {role.name}
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
