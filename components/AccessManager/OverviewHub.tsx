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
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Access Manager</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
          Control who can see content and who can edit spaces. Start with roles for visibility, use teams to
          share roles across people, and assign space editors only when someone needs to change a space.
        </p>
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
          className="text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-md transition-all group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 flex items-center justify-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
          </div>
          <h4 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400">
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
              className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
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
          className="text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-md transition-all group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
            </svg>
          </div>
          <h4 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400">
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
              className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
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
          className="text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-md transition-all group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
          </div>
          <h4 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400">
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
              className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              Assign editors
            </button>
          </div>
        </div>
      </div>

      {/* How access fits together */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
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
        <div className="bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-xl p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h4 className="text-sm font-semibold text-brand-900 dark:text-brand-100">Get started</h4>
              <p className="text-xs text-brand-800/80 dark:text-brand-200/80 mt-1">
                Follow these steps once — you can skip optional ones.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissChecklist}
              className="text-xs text-brand-700 dark:text-brand-300 hover:underline shrink-0"
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
                        : 'bg-brand-100 dark:bg-brand-800 text-brand-700 dark:text-brand-200'
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

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setComparisonOpen(!comparisonOpen)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
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
                <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
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
