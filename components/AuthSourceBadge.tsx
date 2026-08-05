import React from 'react';

export function normalizeAuthSource(source?: string): 'local' | 'ldap' | 'saml' {
  const s = (source || 'local').toLowerCase().trim();
  if (s === 'ldap' || s === 'saml') return s;
  return 'local';
}

/** Small colored Local / LDAP / SAML badge next to usernames */
export const AuthSourceBadge: React.FC<{ source?: string; className?: string }> = ({
  source,
  className = '',
}) => {
  const auth = normalizeAuthSource(source);
  const styles =
    auth === 'ldap'
      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
      : auth === 'saml'
        ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${styles} ${className}`.trim()}
    >
      {auth}
    </span>
  );
};
