import React from 'react';

/**
 * Data model for the desktop nav "widgets pill".
 *
 * The pill used to be ~15 hand-written <button> blocks inside Navigation.tsx.
 * Turning them into data lets the nav (a) measure one icon to predict the full
 * pill width and (b) move the tail icons into an overflow ("…") menu when the
 * centered brand would otherwise be overlapped. Icons/titles are unchanged.
 */
export interface NavWidgetItem {
  id: string;
  /** Human label, shown in the overflow menu. */
  label: string;
  /** Show/Hide tooltip for the pill button. */
  title: string;
  icon: React.ReactNode;
  /** Widget panel currently open. */
  active: boolean;
  onToggle: () => void;
}

export interface NavWidgetItemFlags {
  isWidgetAllowed: (widgetId: string) => boolean;
  /** A signed-in user is present (gates notes / fav-organizer / chat / speed test). */
  hasUser: boolean;
  /** Admin (gates the Media Library icon). */
  isAdmin: boolean;
  showClock: boolean;
  toggleClock: () => void;
  showWeather: boolean;
  toggleWeather: () => void;
  showCalculator: boolean;
  toggleCalculator: () => void;
  showNotes: boolean;
  toggleNotes: () => void;
  showMedia: boolean;
  toggleMedia: () => void;
  showPasswordGenerator: boolean;
  togglePasswordGenerator: () => void;
  showPhoneticAlphabet: boolean;
  togglePhoneticAlphabet: () => void;
  showZoomControl: boolean;
  toggleZoomControl: () => void;
  showTheme: boolean;
  toggleThemeWidget: () => void;
  showFavOrganizer: boolean;
  toggleFavOrganizer: () => void;
  showChat: boolean;
  toggleChat: () => void;
  showSnakeGame: boolean;
  toggleSnakeGame: () => void;
  showVncViewer: boolean;
  toggleVncViewer: () => void;
  showSshTerminal: boolean;
  toggleSshTerminal: () => void;
  showInternetSpeedTester: boolean;
  toggleInternetSpeedTester: () => void;
}

const ICON_CLASS = 'w-4 h-4 sm:w-5 sm:h-5';

function svg(children: React.ReactNode, fill = 'none'): React.ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill={fill}
      stroke={fill === 'none' ? 'currentColor' : undefined}
      strokeWidth={fill === 'none' ? 2 : undefined}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={ICON_CLASS}
    >
      {children}
    </svg>
  );
}

/** Builds the visible widget-pill items, preserving the original render order. */
export function buildNavWidgetItems(flags: NavWidgetItemFlags): NavWidgetItem[] {
  const {
    isWidgetAllowed,
    hasUser,
    isAdmin,
    showClock,
    toggleClock,
    showWeather,
    toggleWeather,
    showCalculator,
    toggleCalculator,
    showNotes,
    toggleNotes,
    showMedia,
    toggleMedia,
    showPasswordGenerator,
    togglePasswordGenerator,
    showPhoneticAlphabet,
    togglePhoneticAlphabet,
    showZoomControl,
    toggleZoomControl,
    showTheme,
    toggleThemeWidget,
    showFavOrganizer,
    toggleFavOrganizer,
    showChat,
    toggleChat,
    showSnakeGame,
    toggleSnakeGame,
    showVncViewer,
    toggleVncViewer,
    showSshTerminal,
    toggleSshTerminal,
    showInternetSpeedTester,
    toggleInternetSpeedTester,
  } = flags;

  const items: NavWidgetItem[] = [];

  if (isWidgetAllowed('clock')) {
    items.push({
      id: 'clock',
      label: 'Clock',
      title: showClock ? 'Hide Clock Widget' : 'Show Clock Widget',
      active: showClock,
      onToggle: toggleClock,
      icon: svg(
        <>
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </>
      ),
    });
  }

  if (isWidgetAllowed('weather')) {
    items.push({
      id: 'weather',
      label: 'Weather',
      title: showWeather ? 'Hide Weather Widget' : 'Show Weather Widget',
      active: showWeather,
      onToggle: toggleWeather,
      icon: svg(
        <>
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
          <path d="M22 10a3 3 0 0 0-3-3h-2.5a2.5 2.5 0 0 0-5 0H12a3 3 0 0 0 0 6h3a2.5 2.5 0 0 0 5 0H22Z"></path>
        </>
      ),
    });
  }

  if (isWidgetAllowed('calculator')) {
    items.push({
      id: 'calculator',
      label: 'Calculator',
      title: showCalculator ? 'Hide Calculator Widget' : 'Show Calculator Widget',
      active: showCalculator,
      onToggle: toggleCalculator,
      icon: svg(
        <>
          <rect x="4" y="2" width="16" height="20" rx="2"></rect>
          <line x1="8" y1="6" x2="16" y2="6"></line>
          <line x1="8" y1="10" x2="16" y2="10"></line>
          <line x1="8" y1="14" x2="16" y2="14"></line>
          <line x1="8" y1="18" x2="16" y2="18"></line>
        </>
      ),
    });
  }

  if (hasUser && isWidgetAllowed('notes')) {
    items.push({
      id: 'notes',
      label: 'Notes',
      title: showNotes ? 'Hide Notes Widget' : 'Show Notes Widget',
      active: showNotes,
      onToggle: toggleNotes,
      icon: svg(
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </>
      ),
    });
  }

  if (isAdmin && isWidgetAllowed('media')) {
    items.push({
      id: 'media',
      label: 'Media Library',
      title: showMedia ? 'Hide Media Library' : 'Show Media Library',
      active: showMedia,
      onToggle: toggleMedia,
      icon: svg(
        <>
          <rect x="3" y="3" width="18" height="18" rx="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </>
      ),
    });
  }

  if (isWidgetAllowed('password-generator')) {
    items.push({
      id: 'password-generator',
      label: 'Password Generator',
      title: showPasswordGenerator ? 'Hide Password Generator Widget' : 'Show Password Generator Widget',
      active: showPasswordGenerator,
      onToggle: togglePasswordGenerator,
      icon: svg(
        <>
          <rect x="5" y="11" width="14" height="10" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </>
      ),
    });
  }

  if (isWidgetAllowed('phonetic-alphabet')) {
    items.push({
      id: 'phonetic-alphabet',
      label: 'Phonetic Alphabet',
      title: showPhoneticAlphabet ? 'Hide Phonetic Alphabet' : 'Show Phonetic Alphabet',
      active: showPhoneticAlphabet,
      onToggle: togglePhoneticAlphabet,
      icon: svg(
        <>
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path>
          <path d="M8 8h4M8 12h4M8 16h4"></path>
        </>
      ),
    });
  }

  if (isWidgetAllowed('zoom-control')) {
    items.push({
      id: 'zoom-control',
      label: 'Zoom Control',
      title: showZoomControl ? 'Hide Zoom Control Widget' : 'Show Zoom Control Widget',
      active: showZoomControl,
      onToggle: toggleZoomControl,
      icon: svg(
        <>
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
          <line x1="11" y1="8" x2="11" y2="14"></line>
          <line x1="8" y1="11" x2="14" y2="11"></line>
        </>
      ),
    });
  }

  if (isWidgetAllowed('theme')) {
    items.push({
      id: 'theme',
      label: 'Theme',
      title: showTheme ? 'Hide Theme Widget' : 'Show Theme Widget',
      active: showTheme,
      onToggle: toggleThemeWidget,
      icon: svg(
        <>
          <circle cx="13.5" cy="6.5" r=".5"></circle>
          <circle cx="17.5" cy="10.5" r=".5"></circle>
          <circle cx="8.5" cy="7.5" r=".5"></circle>
          <circle cx="6.5" cy="12.5" r=".5"></circle>
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
        </>
      ),
    });
  }

  if (hasUser && isWidgetAllowed('fav-organizer')) {
    items.push({
      id: 'fav-organizer',
      label: 'Favorite Organizer',
      title: showFavOrganizer ? 'Hide Favorite Organizer Widget' : 'Show Favorite Organizer Widget',
      active: showFavOrganizer,
      onToggle: toggleFavOrganizer,
      icon: svg(
        <>
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          <path d="M12 2v14"></path>
          <path d="M8 6h8"></path>
          <path d="M8 10h8"></path>
          <path d="M8 14h6"></path>
        </>
      ),
    });
  }

  if (hasUser && isWidgetAllowed('chat')) {
    items.push({
      id: 'chat',
      label: 'Chat',
      title: showChat ? 'Hide Chat Widget' : 'Show Chat Widget',
      active: showChat,
      onToggle: toggleChat,
      icon: svg(
        <>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </>
      ),
    });
  }

  if (isWidgetAllowed('snake-game')) {
    items.push({
      id: 'snake-game',
      label: 'Snake Game',
      title: showSnakeGame ? 'Hide Snake Game Widget' : 'Show Snake Game Widget',
      active: showSnakeGame,
      onToggle: toggleSnakeGame,
      icon: svg(
        <>
          <path d="M2 12h20"></path>
          <path d="M12 2v20"></path>
          <path d="M8 8l-4 4 4 4"></path>
          <path d="M16 8l4 4-4 4"></path>
        </>
      ),
    });
  }

  if (isWidgetAllowed('vnc-viewer')) {
    items.push({
      id: 'vnc-viewer',
      label: 'VNC Viewer',
      title: showVncViewer ? 'Hide VNC Viewer Widget' : 'Show VNC Viewer Widget',
      active: showVncViewer,
      onToggle: toggleVncViewer,
      icon: svg(
        <>
          <rect x="2" y="3" width="20" height="14" rx="2"></rect>
          <path d="M8 21h8"></path>
          <path d="M12 17v4"></path>
        </>
      ),
    });
  }

  if (isWidgetAllowed('ssh-terminal')) {
    items.push({
      id: 'ssh-terminal',
      label: 'SSH Terminal',
      title: showSshTerminal ? 'Hide SSH Terminal Widget' : 'Show SSH Terminal Widget',
      active: showSshTerminal,
      onToggle: toggleSshTerminal,
      icon: svg(
        <>
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </>
      ),
    });
  }

  if (hasUser && isWidgetAllowed('internet-speed-tester')) {
    items.push({
      id: 'internet-speed-tester',
      label: 'Internet Speed Tester',
      title: showInternetSpeedTester ? 'Hide Internet Speed Tester' : 'Show Internet Speed Tester',
      active: showInternetSpeedTester,
      onToggle: toggleInternetSpeedTester,
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 576 512"
          fill="currentColor"
          className={ICON_CLASS}
        >
          <path d="M288 32C128.94 32 0 160.94 0 320c0 52.8 19.94 101.47 53.13 139.72 8.06 9.22 21.41 9.66 30.28 1.41l.03-.03c7.56-7.03 8.28-18.91 1.56-26.88A222.08 222.08 0 0 1 64 320c0-123.71 100.29-224 224-224s224 100.29 224 224c0 29.94-5.91 58.56-16.66 84.75-6.03 14.72 2.47 31.5 17.69 35.03 14.72 3.41 29.75-5.47 33.16-20.19A287.05 287.05 0 0 0 576 320C576 160.94 447.06 32 288 32zm0 64c-88.22 0-160 71.78-160 160 0 24.28 5.53 47.28 15.28 68.03l118.97-118.97c7.5-7.5 19.69-7.5 27.19 0 7.5 7.5 7.5 19.69 0 27.19L170.47 351.22A158.2 158.2 0 0 0 288 384c88.22 0 160-71.78 160-160S376.22 96 288 96z" />
        </svg>
      ),
    });
  }

  return items;
}
