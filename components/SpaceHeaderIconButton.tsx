import React, { useLayoutEffect, useRef, useState } from 'react';
import { dockScaleFor, useSpaceHeaderDock } from './SpaceHeaderDock';

const HEADER_BTN =
  'p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white border border-white/20 transition-colors duration-150 shadow-sm flex items-center justify-center backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed';
const HEADER_BTN_ACTIVE =
  'p-2 rounded-lg bg-white/35 hover:bg-white/45 text-white border border-white/50 transition-colors duration-150 shadow-sm flex items-center justify-center backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed';
const DRAWER_BTN =
  'w-full px-3 py-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 disabled:opacity-50';

function faceLabelFrom(title: string, label?: string): string {
  if (label) return label;
  return title.split(/\s+/)[0] || title;
}

export const SpaceHeaderIconButton: React.FC<{
  title: string;
  label?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ title, label, onClick, disabled, active, className, children }) => {
  const dock = useSpaceHeaderDock();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);
  const liftActive = !!dock && scale > 1.01;
  const faceLabel = faceLabelFrom(title, label);
  const showFaceLabel = !!dock;

  useLayoutEffect(() => {
    if (!dock) {
      setScale(1);
      return;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) {
      setScale(1);
      return;
    }
    setScale(
      dockScaleFor(
        dock.pointer,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        dock.reducedMotion
      )
    );
  }, [dock]);

  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${active ? HEADER_BTN_ACTIVE : HEADER_BTN} ${className || ''} ${
        dock ? 'relative overflow-hidden' : ''
      }`}
      title={dock ? undefined : title}
      aria-label={title}
      aria-pressed={active ? true : undefined}
      onFocus={() => {
        if (!dock) return;
        const rect = wrapRef.current?.getBoundingClientRect();
        if (!rect) return;
        dock.setFocusPointer({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }}
      onBlur={() => dock?.setFocusPointer(null)}
      style={
        dock
          ? {
              transform: `scale(${scale})`,
              transformOrigin: 'center bottom',
            }
          : undefined
      }
    >
      {children}
      {showFaceLabel && (
        <span className="ln-space-dock-btn-label" aria-hidden="true">
          {faceLabel}
        </span>
      )}
    </button>
  );

  if (!dock) return button;

  return (
    <span
      ref={wrapRef}
      className={`relative inline-flex items-end justify-center ${liftActive ? 'ln-space-dock-item-hot' : 'ln-space-dock-item'}`}
      style={{ zIndex: Math.round(scale * 20) }}
    >
      {button}
    </span>
  );
};

export const SpaceHeaderDrawerButton: React.FC<{
  label: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
  icon: React.ReactNode;
}> = ({ label, onClick, disabled, className, icon }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`${DRAWER_BTN} ${className || ''}`}
  >
    <span className="w-5 h-5 text-slate-400 shrink-0 flex items-center justify-center">{icon}</span>
    {label}
  </button>
);

const iconClass = 'w-5 h-5';

export const HeaderIcons = {
  shortUrls: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
      <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
    </svg>
  ),
  favorite: (filled: boolean) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" className={iconClass} aria-hidden="true">
      <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
    </svg>
  ),
  info: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
    </svg>
  ),
  checkLinks: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
    </svg>
  ),
  spinner: (
    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  ),
  compare: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path d="M8 2a.75.75 0 01.75.75v14.5a.75.75 0 01-1.5 0V2.75A.75.75 0 018 2zM12 2a.75.75 0 01.75.75v14.5a.75.75 0 01-1.5 0V2.75A.75.75 0 0112 2z" />
      <path d="M3.28 7.22a.75.75 0 011.06 0L5.5 8.38V5.75a.75.75 0 011.5 0v4.5a.75.75 0 01-.75.75H2.75a.75.75 0 010-1.5h2.63L3.28 8.28a.75.75 0 010-1.06zM16.72 12.78a.75.75 0 01-1.06 0L14.5 11.62v2.63a.75.75 0 01-1.5 0v-4.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-2.63l1.16 1.16a.75.75 0 010 1.06z" />
    </svg>
  ),
  export: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
      <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
    </svg>
  ),
  ai: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path d="M10 1.25a.75.75 0 01.67.415l1.31 2.652 2.926.425a.75.75 0 01.416 1.28l-2.117 2.063.5 2.912a.75.75 0 01-1.088.79L10 10.45l-2.617 1.337a.75.75 0 01-1.088-.79l.5-2.912L4.678 6.022a.75.75 0 01.416-1.28l2.926-.425L9.33 1.665A.75.75 0 0110 1.25z" />
      <path d="M15.25 12a.75.75 0 01.64.364l.72 1.224 1.35.196a.75.75 0 01.416 1.279l-.977.952.23 1.344a.75.75 0 01-1.088.791L15.25 17.36l-1.291.68a.75.75 0 01-1.088-.791l.23-1.344-.977-.952a.75.75 0 01.416-1.28l1.35-.196.72-1.224A.75.75 0 0115.25 12z" />
    </svg>
  ),
  share: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path d="M10 5a3 3 0 11-6 0 3 3 0 016 0zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM16.25 10.75a.75.75 0 00-1.5 0v2h-2a.75.75 0 000 1.5h2v2a.75.75 0 001.5 0v-2h2a.75.75 0 000-1.5h-2v-2z" />
    </svg>
  ),
  edit: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
    </svg>
  ),
  clone: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
      <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
    </svg>
  ),
  archive: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
      <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.801a2 2 0 01-1.99-1.79L2 7.5zM8.22 9.72a.75.75 0 011.06 0L10 10.44l.72-.72a.75.75 0 111.06 1.06l-1.25 1.25a.75.75 0 01-1.06 0L8.22 10.78a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  ),
  trash: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
    </svg>
  ),
  plus: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
    </svg>
  ),
  close: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  ),
  menu: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={iconClass} aria-hidden="true">
      <path d="M3 12h18M3 6h18M3 18h18" />
    </svg>
  ),
  back: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={iconClass} aria-hidden="true">
      <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
    </svg>
  ),
};
