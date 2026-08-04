import React from 'react';
import type { AccessSubTab } from './types';
import { OverviewHub, OverviewHubProps } from './OverviewHub';

export interface AccessManagerPanelProps {
  activeSubTab: AccessSubTab;
  onSubTabChange: (tab: AccessSubTab) => void;
  overview: Omit<OverviewHubProps, 'onNavigate'>;
  rolesWorkspace: React.ReactNode;
  teamsWorkspace: React.ReactNode;
  editorsWorkspace: React.ReactNode;
}

const NAV_ITEMS: Array<{ id: AccessSubTab; label: string }> = [
  { id: 'hub', label: 'Overview' },
  { id: 'roles', label: 'Roles' },
  { id: 'groups', label: 'Teams' },
  { id: 'editors', label: 'Space editors' },
];

export const AccessManagerPanel: React.FC<AccessManagerPanelProps> = ({
  activeSubTab,
  onSubTabChange,
  overview,
  rolesWorkspace,
  teamsWorkspace,
  editorsWorkspace,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1">
        <div className="flex flex-wrap gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSubTabChange(item.id)}
              className={`flex-1 min-w-[7rem] px-3 py-2 text-sm font-medium transition-colors rounded-lg ${
                activeSubTab === item.id
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {activeSubTab === 'hub' && (
        <OverviewHub {...overview} onNavigate={onSubTabChange} />
      )}
      {activeSubTab === 'roles' && rolesWorkspace}
      {activeSubTab === 'groups' && teamsWorkspace}
      {activeSubTab === 'editors' && editorsWorkspace}
    </div>
  );
};
