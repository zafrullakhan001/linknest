import React from 'react';

interface MobileCreateFabProps {
  onClick: () => void;
  /** Guests get a sign-in prompt instead of the create form. */
  requiresAuth?: boolean;
  label?: string;
}

/**
 * Primary create action for phones.
 *
 * The desktop "New Space" button lives inside TileGrid's desktop branch, so
 * mobile previously had no way to create a space at all. This is the mobile
 * equivalent; it sits above the home indicator via .linknest-mobile-fab.
 */
export const MobileCreateFab: React.FC<MobileCreateFabProps> = ({
  onClick,
  requiresAuth = false,
  label = 'New Space',
}) => (
  <button
    type="button"
    onClick={onClick}
    className="linknest-mobile-fab fixed z-30 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-5 text-white shadow-lg shadow-brand-500/40 transition-transform active:scale-95 hover:shadow-xl hover:shadow-brand-500/50 touch-manipulation"
    style={{ minHeight: '52px' }}
    aria-label={requiresAuth ? 'Sign in to create a space' : label}
    title={requiresAuth ? 'Sign in to create a space' : label}
  >
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
    <span className="text-sm font-semibold whitespace-nowrap">{label}</span>
  </button>
);

export default MobileCreateFab;
