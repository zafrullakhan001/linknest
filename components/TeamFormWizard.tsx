import React, { useState, useEffect } from 'react';
import { AccessWizardShell, WizardNavButton, WizardSummaryCard } from './AccessWizardShell';

interface TeamFormWizardProps {
  isOpen: boolean;
  isEditing: boolean;
  name: string;
  description: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  error: string;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}

export const TeamFormWizard: React.FC<TeamFormWizardProps> = ({
  isOpen,
  isEditing,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  error,
  saving,
  onClose,
  onSave,
}) => {
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (isOpen) setStep(1);
  }, [isOpen]);

  if (!isOpen) return null;

  const canContinue = name.trim().length > 0;

  return (
    <AccessWizardShell
      title={isEditing ? 'Edit team' : 'Create team'}
      subtitle={
        step === 1
          ? 'Give the team a clear name so people know who belongs here.'
          : 'Confirm the details before saving.'
      }
      steps={['Details', 'Review']}
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
            <WizardNavButton disabled={!canContinue} onClick={() => setStep(2)}>
              Continue
            </WizardNavButton>
          ) : (
            <WizardNavButton disabled={!canContinue || saving} onClick={onSave}>
              {saving ? 'Saving…' : isEditing ? 'Save team' : 'Create team'}
            </WizardNavButton>
          )}
        </>
      }
    >
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
            Teams let you grant roles and space-editor access once, then every member inherits those permissions.
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Team name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
              placeholder="e.g. Marketing, IT Department"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
              placeholder="What this team is for"
              rows={3}
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <WizardSummaryCard>
            {isEditing
              ? `Update “${name.trim()}” with the details below.`
              : `Create a new team named “${name.trim()}”. You can add members and roles afterward from the Teams list.`}
          </WizardSummaryCard>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Name
              </div>
              <div className="text-sm font-medium text-slate-900 dark:text-white mt-1">{name.trim()}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Description
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                {description.trim() || 'No description'}
              </div>
            </div>
          </div>
        </div>
      )}
    </AccessWizardShell>
  );
};
