import React from 'react';

interface MaintenancePageProps {
  message?: string;
  appName?: string;
  showAdminLogin?: boolean;
  onAdminLogin?: () => void;
}

export const MaintenancePage: React.FC<MaintenancePageProps> = ({ 
  message = 'The application is currently undergoing maintenance. Please check back later.',
  appName = 'Application',
  showAdminLogin = true,
  onAdminLogin
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 md:p-12 text-center">
        <div className="mb-6">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10 text-amber-600 dark:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Maintenance Mode
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            {appName} is temporarily unavailable
          </p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-6 mb-6">
          <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
            {message}
          </p>
        </div>

        <div className="text-sm text-slate-500 dark:text-slate-400">
          <p>We apologize for any inconvenience.</p>
          <p className="mt-2">Please try again later.</p>
        </div>

        {showAdminLogin && (
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Administrator? Log in to access the application during maintenance.
            </p>
            <button
              onClick={onAdminLogin}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Admin Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
