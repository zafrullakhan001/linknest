import React from 'react';
import { isLinkInMaintenance, type LinkMaintenanceFields } from '../utils/linkMaintenance';

export const LinkMaintenanceBadge: React.FC<{
  link: LinkMaintenanceFields | null | undefined;
  compact?: boolean;
  className?: string;
}> = ({ link, compact = false, className = '' }) => {
  if (!isLinkInMaintenance(link)) return null;

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 font-semibold shrink-0 ${
        compact ? 'text-[9px] px-1.5 py-0' : 'text-[10px] px-1.5 py-0.5'
      } ${className}`}
      title="This link is under a maintenance window"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} aria-hidden>
        <path fillRule="evenodd" d="M19 5.5a4.5 4.5 0 01-4.791 4.49c-.873-.055-1.808.128-2.368.8l-6.024 7.23a2.724 2.724 0 11-3.837-3.837l7.23-6.024c.672-.56.855-1.495.8-2.368a4.5 4.5 0 015.873-4.575c.324.137.27.527-.128.686a2.5 2.5 0 00-.932 3.826c.122.342-.356.763-.68.647-.31-.111-.644-.111-.954 0-.324.116-.802-.305-.68-.647A4.5 4.5 0 0114.5 1c.868 0 1.69.247 2.39.68.415.25.313.89-.128.89A3.001 3.001 0 0019 5.5z" clipRule="evenodd" />
      </svg>
      {compact ? 'Maint' : 'Maintenance'}
    </span>
  );
};
