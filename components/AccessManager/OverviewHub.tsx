import React, { useState } from 'react';
import type { AccessSubTab } from './types';
import { ACCESS_ONBOARDING_DISMISSED_KEY } from './types';

export interface OverviewHubProps {
  rolesCount: number;
  teamsCount: number;
  configuredRolesCount: number;
  hasAssignments: boolean;
  hasSpaceEditors: boolean;
  onNavigate: (tab: AccessSubTab) => void;
  onCreateRole: () => void;
  onCreateTeam: () => void;
  onAssignAccess: () => void;
  onAssignEditors: () => void;
}

export const OverviewHub: React.FC<OverviewHubProps> = ({
  rolesCount,
  teamsCount,
  configuredRolesCount,
  hasAssignments,
  hasSpaceEditors,
  onNavigate,
  onCreateRole,
  onCreateTeam,
  onAssignAccess,
  onAssignEditors,
}) => {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(ACCESS_ONBOARDING_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [comparisonOpen, setComparisonOpen] = useState(false);

  const dismissChecklist = () => {
    setDismissed(true);
    try {
      localStorage.setItem(ACCESS_ONBOARDING_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const steps = [
    {
      id: 'create-role',
      label: 'Create a role',
      done: rolesCount > 0,
      action: () => {
        onNavigate('roles');
        if (rolesCount === 0) onCreateRole();
      },
    },
    {
      id: 'configure',
      label: 'Choose what that role can see',
      done: configuredRolesCount > 0,
      action: () => onNavigate('roles'),
    },
    {
      id: 'team',
      label: 'Create a team (optional)',
      done: teamsCount > 0,
      optional: true,
      action: () => {
        onNavigate('groups');
        if (teamsCount === 0) onCreateTeam();
      },
    },
    {
      id: 'assign',
      label: 'Assign the role to people or a team',
      done: hasAssignments,
      action: () => {
        onNavigate('roles');
        onAssignAccess();
      },
    },
    {
      id: 'editors',
      label: 'Optionally assign space editors',
      done: hasSpaceEditors,
      optional: true,
      action: () => onNavigate('editors'),
    },
  ];

  const completedRequired = steps.filter((s) => !s.optional && s.done).length;
  const totalRequired = steps.filter((s) => !s.optional).length;
  const showChecklist = !dismissed && completedRequired < totalRequired;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-sky-200/70 dark:border-sky-800/40 rounded-xl overflow-hidden shadow-sm shadow-sky-500/5">
        <div className="bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-800/40 px-6 py-5">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span aria-hidden>🛡️</span> Access Manager
          </h3>
          <p className="text-sm text-sky-800/70 dark:text-sky-200/70 mt-0.5 max-w-2xl">
            Control who can see content and who can edit spaces. Start with roles for visibility, use teams to
            share roles across people, and assign space editors only when someone needs to change a space.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onNavigate('roles')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigate('roles');
            }
          }}
          className="text-left bg-white dark:bg-slate-800 border border-sky-100 dark:border-sky-900/40 rounded-xl p-5 hover:border-sky-400 dark:hover:border-sky-500 hover:shadow-md hover:shadow-sky-500/10 transition-all group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 flex items-center justify-center mb-3 text-xl" aria-hidden>
            🎭
          </div>
          <h4 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">
            Roles
          </h4>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            Define what someone can <span className="font-medium text-slate-800 dark:text-slate-200">see</span> —
            spaces, links, app tabs, and widgets.
          </p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-500">
              {rolesCount === 0 ? 'None yet' : `${rolesCount} role${rolesCount === 1 ? '' : 's'}`}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate('roles');
                if (rolesCount === 0) onCreateRole();
              }}
              className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline"
            >
              {rolesCount === 0 ? 'Create a role' : 'Manage roles'}
            </button>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => onNavigate('groups')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigate('groups');
            }
          }}
          className="text-left bg-white dark:bg-slate-800 border border-sky-100 dark:border-sky-900/40 rounded-xl p-5 hover:border-sky-400 dark:hover:border-sky-500 hover:shadow-md hover:shadow-sky-500/10 transition-all group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center mb-3 text-xl" aria-hidden>
            👥
          </div>
          <h4 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">
            Teams
          </h4>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            Group people together. Roles given to a team apply to every member.
          </p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-500">
              {teamsCount === 0 ? 'None yet' : `${teamsCount} team${teamsCount === 1 ? '' : 's'}`}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate('groups');
                if (teamsCount === 0) onCreateTeam();
              }}
              className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline"
            >
              {teamsCount === 0 ? 'Create a team' : 'Manage teams'}
            </button>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => onNavigate('editors')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigate('editors');
            }
          }}
          className="text-left bg-white dark:bg-slate-800 border border-sky-100 dark:border-sky-900/40 rounded-xl p-5 hover:border-sky-400 dark:hover:border-sky-500 hover:shadow-md hover:shadow-sky-500/10 transition-all group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center mb-3 text-xl" aria-hidden>
            ✏️
          </div>
          <h4 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400">
            Space editors
          </h4>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            Let trusted people <span className="font-medium text-slate-800 dark:text-slate-200">edit</span> specific
            spaces without making them full admins.
          </p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-500">
              {hasSpaceEditors ? 'Editors assigned' : 'Optional'}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate('editors');
                onAssignEditors();
              }}
              className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline"
            >
              Assign editors
            </button>
          </div>
        </div>
      </div>

      {/* How access fits together */}
      <div className="bg-white dark:bg-slate-800 border border-sky-100 dark:border-sky-900/40 rounded-xl p-6 bg-gradient-to-br from-sky-50/40 to-white dark:from-sky-950/20 dark:to-slate-800">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">How access fits together</h4>
        <div className="overflow-x-auto">
          <div className="min-w-[640px] flex flex-col gap-4 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-slate-700 dark:text-slate-300">
              <span className="px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-700 font-medium">Person</span>
              <span className="text-slate-400 dark:text-slate-500">belongs to</span>
              <span className="px-3 py-1.5 rounded-md bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200 font-medium">Team</span>
              <span className="text-slate-400 dark:text-slate-500">has</span>
              <span className="px-3 py-1.5 rounded-md bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 font-medium">Role</span>
              <span className="text-slate-400 dark:text-slate-500">can see</span>
              <span className="px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-700 font-medium">Spaces / Links / App tabs / Widgets</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-slate-700 dark:text-slate-300">
              <span className="px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-700 font-medium">Person</span>
              <span className="text-slate-400 dark:text-slate-500">or gets a role directly</span>
              <span className="px-3 py-1.5 rounded-md bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 font-medium">Role</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-slate-700 dark:text-slate-300">
              <span className="px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-700 font-medium">Person / Team</span>
              <span className="text-slate-400 dark:text-slate-500">can edit</span>
              <span className="px-3 py-1.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 font-medium">Specific spaces</span>
              <span className="text-slate-400 dark:text-slate-500">(Space editors)</span>
            </div>
          </div>
        </div>
      </div>

      {showChecklist && (
        <div className="rounded-xl border border-sky-200/70 dark:border-sky-800/40 bg-gradient-to-r from-sky-50/80 to-teal-50/50 dark:from-sky-950/30 dark:to-teal-950/20 p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h4 className="text-sm font-semibold text-sky-900 dark:text-sky-100">Get started</h4>
              <p className="text-xs text-sky-800/80 dark:text-sky-200/80 mt-1">
                Follow these steps once — you can skip optional ones.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissChecklist}
              className="text-xs text-sky-700 dark:text-sky-300 hover:underline shrink-0"
            >
              Dismiss
            </button>
          </div>
          <ol className="space-y-2">
            {steps.map((step, index) => (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={step.action}
                  className={`w-full flex items-center gap-3 text-left px-3 py-2 rounded-lg transition-colors ${
                    step.done
                      ? 'bg-white/60 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400'
                      : 'bg-white dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                      step.done
                        ? 'bg-emerald-500 text-white'
                        : 'bg-sky-100 dark:bg-sky-800 text-sky-700 dark:text-sky-200'
                    }`}
                  >
                    {step.done ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className={`text-sm flex-1 ${step.done ? 'line-through' : 'font-medium'}`}>
                    {step.label}
                  </span>
                  {step.optional && !step.done && (
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">Optional</span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 border border-sky-100 dark:border-sky-900/40 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setComparisonOpen(!comparisonOpen)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-sky-50/50 dark:hover:bg-sky-950/30 transition-colors"
        >
          <span className="text-sm font-semibold text-slate-900 dark:text-white">Not sure which to use?</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-5 h-5 text-slate-400 transition-transform ${comparisonOpen ? 'rotate-180' : ''}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        {comparisonOpen && (
          <div className="px-6 pb-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sky-100 dark:border-sky-900/40 text-left">
                  <th className="py-2 pr-4 font-semibold text-slate-700 dark:text-slate-300">Tool</th>
                  <th className="py-2 pr-4 font-semibold text-slate-700 dark:text-slate-300">What it does</th>
                  <th className="py-2 font-semibold text-slate-700 dark:text-slate-300">When to use it</th>
                </tr>
              </thead>
              <tbody className="text-slate-600 dark:text-slate-400">
                <tr className="border-b border-slate-100 dark:border-slate-700/60">
                  <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Roles</td>
                  <td className="py-3 pr-4 align-top">Grants view access to spaces, links, app tabs, and widgets</td>
                  <td className="py-3 align-top">People should see certain content but not edit it</td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-slate-700/60">
                  <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Teams</td>
                  <td className="py-3 pr-4 align-top">Groups of people that inherit roles together</td>
                  <td className="py-3 align-top">A department or project shares the same access</td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-slate-700/60">
                  <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Space editors</td>
                  <td className="py-3 pr-4 align-top">Lets people edit content on specific spaces</td>
                  <td className="py-3 align-top">Someone manages a space without being a system admin</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white align-top">Private share</td>
                  <td className="py-3 pr-4 align-top">Invite list on a private space (users / teams)</td>
                  <td className="py-3 align-top">Share one private space from the space editor — not managed here</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
