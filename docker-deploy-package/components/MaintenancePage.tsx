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
    <div className="fixed inset-0 h-screen bg-gradient-to-br from-indigo-600 via-blue-500 to-violet-600 dark:from-indigo-900 dark:via-blue-800 dark:to-violet-900 flex items-center justify-center p-4 overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-300/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-300/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-violet-300/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="max-w-2xl w-full bg-white/90 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-slate-700/50 p-8 md:p-12 text-center relative z-10 transform transition-all duration-500 hover:scale-[1.02]">
        <div className="mb-8">
          {/* Animated gear icon */}
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400 via-indigo-400 to-violet-500 animate-pulse"></div>
            <div className="absolute inset-1 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 text-transparent bg-gradient-to-br from-indigo-600 via-blue-500 to-violet-600 bg-clip-text animate-spin-slow"
                fill="currentColor"
                viewBox="0 0 24 24"
                style={{ animationDuration: '8s' }}
              >
                <path
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  fill="url(#gear-gradient)"
                />
                <path
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  fill="url(#gear-gradient)"
                />
                <defs>
                  <linearGradient id="gear-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="50%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-indigo-600 via-blue-500 to-violet-600 bg-clip-text text-transparent animate-gradient">
            Maintenance Mode
          </h1>
          <p className="text-xl text-slate-700 dark:text-slate-300 font-medium">
            {appName} is temporarily unavailable
          </p>
        </div>

        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/30 dark:to-blue-900/30 border-2 border-indigo-200 dark:border-indigo-700/50 rounded-2xl p-6 mb-8 shadow-lg backdrop-blur-sm">
          <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed text-lg font-medium">
            {message}
          </p>
        </div>

        <div className="text-base text-slate-600 dark:text-slate-400 space-y-2">
          <p className="flex items-center justify-center gap-2">
            <span className="text-2xl">🛠️</span>
            <span>We apologize for any inconvenience.</span>
          </p>
          <p className="flex items-center justify-center gap-2">
            <span className="text-2xl">⏰</span>
            <span>Please try again later.</span>
          </p>
        </div>

        {showAdminLogin && (
          <div className="mt-8 pt-8 border-t-2 border-gradient-to-r from-indigo-200 via-blue-200 to-violet-200 dark:from-indigo-700 dark:via-blue-700 dark:to-violet-700">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 flex items-center justify-center gap-2">
              <span className="text-xl">🔐</span>
              <span>Administrator? Log in to access the application during maintenance.</span>
            </p>
            <button
              onClick={onAdminLogin}
              className="group relative px-8 py-3 bg-gradient-to-r from-indigo-600 via-blue-500 to-violet-600 hover:from-indigo-700 hover:via-blue-600 hover:to-violet-700 text-white rounded-xl text-base font-bold transition-all duration-300 shadow-lg hover:shadow-2xl transform hover:scale-105 overflow-hidden"
            >
              <span className="relative z-10">Admin Login</span>
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-blue-500 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
        @keyframes gradient {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        .animate-gradient {
          background-size: 200% auto;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </div>
  );
};
