import React from 'react';

export type WizardStep = 1 | 2 | 3 | 4;

interface AccessWizardShellProps {
  title: string;
  subtitle: string;
  steps: string[];
  currentStep: number;
  onStepChange: (step: number) => void;
  error?: string;
  onClose: () => void;
  children: React.ReactNode;
  footerLeft?: React.ReactNode;
  footerRight: React.ReactNode;
  maxWidthClassName?: string;
}

export const AccessWizardShell: React.FC<AccessWizardShellProps> = ({
  title,
  subtitle,
  steps,
  currentStep,
  onStepChange,
  error,
  onClose,
  children,
  footerLeft,
  footerRight,
  maxWidthClassName = 'max-w-2xl',
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={`bg-white dark:bg-slate-800 rounded-2xl shadow-xl ${maxWidthClassName} w-full max-h-[90vh] flex flex-col overflow-hidden`}
      >
        <div className="px-6 pt-5 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
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

          <div className="mt-5 flex items-center gap-2">
            {steps.map((label, index) => {
              const stepNumber = index + 1;
              const isActive = currentStep === stepNumber;
              const isDone = currentStep > stepNumber;
              return (
                <React.Fragment key={label}>
                  {index > 0 && (
                    <div
                      className={`h-px flex-1 ${isDone || isActive ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                    />
                  )}
                  <button
                    type="button"
                    disabled={stepNumber > currentStep}
                    onClick={() => {
                      if (stepNumber < currentStep) onStepChange(stepNumber);
                    }}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-brand-600 text-white'
                        : isDone
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-700/60 dark:text-slate-500'
                    } ${stepNumber < currentStep ? 'cursor-pointer' : 'cursor-default'}`}
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

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          {children}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-900/40">
          <div>{footerLeft}</div>
          <div className="flex items-center gap-2">{footerRight}</div>
        </div>
      </div>
    </div>
  );
};

export const WizardNavButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  type?: 'button' | 'submit';
}> = ({ children, onClick, disabled, variant = 'primary', type = 'button' }) => {
  const styles =
    variant === 'primary'
      ? 'bg-brand-600 hover:bg-brand-500 text-white'
      : variant === 'danger'
        ? 'bg-red-600 hover:bg-red-500 text-white'
        : variant === 'secondary'
          ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        variant === 'ghost' ? '' : ''
      } ${styles}`}
    >
      {children}
    </button>
  );
};

export const WizardSummaryCard: React.FC<{
  tone?: 'brand' | 'danger' | 'neutral';
  eyebrow?: string;
  children: React.ReactNode;
}> = ({ tone = 'brand', eyebrow = 'Summary', children }) => {
  const toneClass =
    tone === 'danger'
      ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 text-red-800 dark:text-red-200'
      : tone === 'neutral'
        ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200'
        : 'border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20 text-brand-900 dark:text-brand-100';

  return (
    <div className={`rounded-xl border px-4 py-4 ${toneClass}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
        {eyebrow}
      </div>
      <div className="text-sm font-medium leading-relaxed">{children}</div>
    </div>
  );
};
