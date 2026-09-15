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

const NAV_ITEMS: Array<{ id: AccessSubTab; label: string; emoji: string }> = [
  { id: 'hub', label: 'Overview', emoji: '🧭' },
  { id: 'roles', label: 'Roles', emoji: '🎭' },
  { id: 'groups', label: 'Teams', emoji: '👥' },
  { id: 'editors', label: 'Space editors', emoji: '✏️' },
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
      <div className="bg-white dark:bg-slate-800 border border-sky-200/70 dark:border-sky-800/40 rounded-xl p-1 shadow-sm shadow-sky-500/5">
        <div className="flex flex-wrap gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSubTabChange(item.id)}
              className={`flex-1 min-w-[7rem] px-3 py-2 text-sm font-medium transition-colors rounded-lg ${
                activeSubTab === item.id
                  ? 'bg-sky-600 text-white shadow-sm shadow-sky-500/25'
                  : 'text-sky-800/80 dark:text-sky-200/80 hover:bg-sky-50 dark:hover:bg-sky-950/40'
              }`}
            >
              <span aria-hidden className="mr-1">{item.emoji}</span>
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
