import React from 'react';
import { getPasswordCriteria } from '../services/passwordValidation';

interface PasswordCriteriaListProps {
  password: string;
  className?: string;
}

const RULES: { key: keyof ReturnType<typeof getPasswordCriteria>; label: string }[] = [
  { key: 'length', label: 'At least 8 characters' },
  { key: 'upper', label: 'One uppercase letter' },
  { key: 'number', label: 'One number' },
  { key: 'special', label: 'One special character (!@#$%^&* etc.)' },
];

export const PasswordCriteriaList: React.FC<PasswordCriteriaListProps> = ({ password, className = '' }) => {
  const criteria = getPasswordCriteria(password);
  const anyTyped = password.length > 0;

  if (!anyTyped) return null;

  return (
    <ul className={`mt-1.5 space-y-0.5 text-xs ${className}`}>
      {RULES.map(({ key, label }) => {
        const met = criteria[key];
        return (
          <li key={key} className={`flex items-center gap-1.5 ${met ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {met ? (
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <span className="w-3.5 h-3.5 flex-shrink-0 rounded-full border border-current box-border" aria-hidden />
            )}
            <span>{label}</span>
          </li>
        );
      })}
    </ul>
  );
};
