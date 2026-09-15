import React from 'react';

export interface AccessRestrictionDeniedInfo {
  message?: string | null;
  reason?: string | null;
  failedAt?: string | null;
}

const META: Record<string, { title: string; icon: string }> = {
  time_window: { title: 'Outside allowed hours', icon: '🕒' },
  host_ip: { title: 'Network or host not allowed', icon: '🌐' },
  time_and_host: { title: 'Access not permitted now', icon: '🕒' },
  vpn_required: { title: 'VPN or corporate network required', icon: '🔒' },
  vpn_misconfigured: { title: 'VPN rule misconfiguration', icon: '⚠️' },
  device_desktop_only: { title: 'Desktop required', icon: '🖥️' },
  device_mobile_only: { title: 'Mobile or tablet required', icon: '📱' },
  browser: { title: 'Browser not supported', icon: '🌍' },
  os: { title: 'Operating system not allowed', icon: '💻' },
  country: { title: 'Location not permitted', icon: '🗺️' },
  country_unknown: { title: 'Location could not be verified', icon: '❓' },
  date_not_yet: { title: 'Not available yet', icon: '📅' },
  date_expired: { title: 'Availability ended', icon: '📅' },
  referrer: { title: 'Open from the dashboard', icon: '🔗' },
  fingerprint: { title: 'Browser fingerprint not allowed', icon: '🪪' },
  fingerprint_missing: { title: 'Browser fingerprint required', icon: '🪪' },
};

interface AccessRestrictionDeniedDialogProps {
  open: boolean;
  info: AccessRestrictionDeniedInfo | null;
  onClose: () => void;
}

export const AccessRestrictionDeniedDialog: React.FC<AccessRestrictionDeniedDialogProps> = ({
  open,
  info,
  onClose,
}) => {
  if (!open || !info) return null;
  const meta = META[info.reason || ''] || { title: 'Access restricted', icon: '🚫' };
  const failedLabel = info.failedAt === 'tile' ? 'space' : info.failedAt;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-2xl border border-slate-200 dark:border-slate-700 p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="access-restriction-denied-title"
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="text-3xl" aria-hidden>{meta.icon}</div>
          <div>
            <h3 id="access-restriction-denied-title" className="text-lg font-bold text-slate-900 dark:text-white">
              {meta.title}
            </h3>
            {failedLabel ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Blocked by {failedLabel} restriction</p>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-5">
          {info.message || 'You cannot open this item from your current network, device, or time window.'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg font-medium"
        >
          OK
        </button>
      </div>
    </div>
  );
};
