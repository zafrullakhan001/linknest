import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { isEscapeDialogOpen } from '../hooks/useEscapeToClose';
import {
  sshConnectionService,
  type SavedSshConnection,
  type SshConnectionAppearance,
  type RemoteConnectionProtocol,
  SSH_CONNECTION_COLORS,
  normalizeSshColor,
  normalizeSshAppearance,
  normalizeConnectionProtocol,
} from '../services/sshConnectionService';
import {
  buildAutoTargetUrl,
  parseAutoTargetUrl,
  sshGatewayService,
} from '../services/sshGatewayService';
import type { OpenSshTerminalDetail } from '../utils/sshLink';
import { RdpSessionPane } from './RdpSessionPane';
import { XtermZoomSafeHost } from './XtermZoomSafeHost';

interface SshTerminalWidgetProps {
  onClose?: () => void;
  /** Request from App (ssh:// click) — requestId changes on every open. */
  pendingOpen?: (OpenSshTerminalDetail & { requestId: number }) | null;
  onPendingOpenConsumed?: () => void;
}

const IDLE_NOTICE = 'Click a saved connection to open a session — or fill Easy / RDP settings and Connect.';

const WS_STORAGE_KEY = 'linknest.sshTerminal.wsUrl.v1';
const HOST_STORAGE_KEY = 'linknest.sshTerminal.host.v1';
const PORT_STORAGE_KEY = 'linknest.sshTerminal.port.v1';
const USER_STORAGE_KEY = 'linknest.sshTerminal.username.v1';
const MODE_STORAGE_KEY = 'linknest.sshTerminal.mode.v1';
const X11_STORAGE_KEY = 'linknest.sshTerminal.x11.v1';
const CONNECTIONS_STORAGE_KEY = 'linknest.sshTerminal.savedConnections.v1';
const PANEL_OPEN_KEY = 'linknest.sshTerminal.panelOpen.v1';
const PANEL_WIDTH_KEY = 'linknest.sshTerminal.panelWidth.v1';
const CMD_BAR_HEIGHT_KEY = 'linknest.sshTerminal.cmdBarHeight.v1';
const TERM_FONT_SIZE_KEY = 'linknest.sshTerminal.termFontSize.v1';
const TERM_FONT_FAMILY_KEY = 'linknest.sshTerminal.termFontFamily.v1';
const TERM_BG_COLOR_KEY = 'linknest.sshTerminal.termBgColor.v1';
const TERM_FG_COLOR_KEY = 'linknest.sshTerminal.termFgColor.v1';
const TERM_CURSOR_COLOR_KEY = 'linknest.sshTerminal.termCursorColor.v1';
const TERM_SELECTION_BG_KEY = 'linknest.sshTerminal.termSelectionBg.v1';
const TERM_THEME_PRESET_KEY = 'linknest.sshTerminal.themePreset.v1';
const TERM_ANSI_KEY = 'linknest.sshTerminal.termAnsi.v1';
const CMD_FONT_SIZE_KEY = 'linknest.sshTerminal.cmdFontSize.v1';
const TAB_BAR_HEIGHT_KEY = 'linknest.sshTerminal.tabBarHeight.v1';
const TAB_BAR_FONT_SIZE_KEY = 'linknest.sshTerminal.tabBarFontSize.v1';
const SKIP_BAR_HEIGHT_KEY = 'linknest.sshTerminal.skipBarHeight.v1';
const SKIP_BAR_FONT_SIZE_KEY = 'linknest.sshTerminal.skipBarFontSize.v1';
const VIEW_MODE_KEY = 'linknest.sshTerminal.viewMode.v1';
const PANEL_MIN_WIDTH = 160;
const PANEL_MAX_WIDTH = 420;
const DEFAULT_MAX_SSH_TABS = 8;
const CMD_BAR_MIN_HEIGHT = 100;
const CMD_BAR_DEFAULT_HEIGHT = 112;
const CMD_BAR_MAX_HEIGHT = 360;
const TERM_FONT_SIZE_MIN = 11;
const TERM_FONT_SIZE_MAX = 24;
const CMD_FONT_SIZE_MIN = 12;
const CMD_FONT_SIZE_MAX = 22;
const TAB_BAR_HEIGHT_MIN = 28;
const TAB_BAR_HEIGHT_MAX = 52;
const TAB_BAR_HEIGHT_DEFAULT = 34;
const TAB_BAR_FONT_MIN = 11;
const TAB_BAR_FONT_MAX = 18;
const TAB_BAR_FONT_DEFAULT = 13;
const SKIP_BAR_HEIGHT_MIN = 24;
const SKIP_BAR_HEIGHT_MAX = 48;
const SKIP_BAR_HEIGHT_DEFAULT = 30;
const SKIP_BAR_FONT_MIN = 10;
const SKIP_BAR_FONT_MAX = 16;
const SKIP_BAR_FONT_DEFAULT = 12;
const DEFAULT_TERM_BG_COLOR = '#020617';
const DEFAULT_TERM_FG_COLOR = '#e2e8f0';
const DEFAULT_TERM_CURSOR_COLOR = '#38bdf8';
const DEFAULT_TERM_SELECTION_BG = '#1e3a5f';

interface TermAnsiPalette {
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

interface TermThemePreset {
  id: string;
  label: string;
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  ansi?: TermAnsiPalette;
}

const TERM_THEME_PRESETS: TermThemePreset[] = [
  {
    id: 'linknest',
    label: 'LinkNest',
    background: '#020617',
    foreground: '#e2e8f0',
    cursor: '#38bdf8',
    selectionBackground: '#1e3a5f',
  },
  {
    id: 'dracula',
    label: 'Dracula',
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    selectionBackground: '#44475a',
    ansi: {
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    },
  },
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    background: '#002b36',
    foreground: '#839496',
    cursor: '#93a1a1',
    selectionBackground: '#073642',
    ansi: {
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#002b36',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3',
    },
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    background: '#fdf6e3',
    foreground: '#657b83',
    cursor: '#586e75',
    selectionBackground: '#eee8d5',
    ansi: {
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#002b36',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3',
    },
  },
  {
    id: 'monokai',
    label: 'Monokai',
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f0',
    selectionBackground: '#49483e',
    ansi: {
      black: '#272822',
      red: '#f92672',
      green: '#a6e22e',
      yellow: '#f4bf75',
      blue: '#66d9ef',
      magenta: '#ae81ff',
      cyan: '#a1efe4',
      white: '#f8f8f2',
      brightBlack: '#75715e',
      brightRed: '#f92672',
      brightGreen: '#a6e22e',
      brightYellow: '#f4bf75',
      brightBlue: '#66d9ef',
      brightMagenta: '#ae81ff',
      brightCyan: '#a1efe4',
      brightWhite: '#f9f8f5',
    },
  },
  {
    id: 'one-dark',
    label: 'One Dark',
    background: '#282c34',
    foreground: '#abb2bf',
    cursor: '#528bff',
    selectionBackground: '#3e4451',
    ansi: {
      black: '#282c34',
      red: '#e06c75',
      green: '#98c379',
      yellow: '#e5c07b',
      blue: '#61afef',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#abb2bf',
      brightBlack: '#5c6370',
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#e5c07b',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#ffffff',
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    background: '#2e3440',
    foreground: '#d8dee9',
    cursor: '#d8dee9',
    selectionBackground: '#434c5e',
    ansi: {
      black: '#3b4252',
      red: '#bf616a',
      green: '#a3be8c',
      yellow: '#ebcb8b',
      blue: '#81a1c1',
      magenta: '#b48ead',
      cyan: '#88c0d0',
      white: '#e5e9f0',
      brightBlack: '#4c566a',
      brightRed: '#bf616a',
      brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1',
      brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb',
      brightWhite: '#eceff4',
    },
  },
  {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    background: '#1a1b26',
    foreground: '#c0caf5',
    cursor: '#c0caf5',
    selectionBackground: '#33467c',
    ansi: {
      black: '#15161e',
      red: '#f7768e',
      green: '#9ece6a',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#a9b1d6',
      brightBlack: '#414868',
      brightRed: '#f7768e',
      brightGreen: '#9ece6a',
      brightYellow: '#e0af68',
      brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',
      brightWhite: '#c0caf5',
    },
  },
  {
    id: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    background: '#1e1e2e',
    foreground: '#cdd6f4',
    cursor: '#f5e0dc',
    selectionBackground: '#45475a',
    ansi: {
      black: '#45475a',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#f5c2e7',
      cyan: '#94e2d5',
      white: '#bac2de',
      brightBlack: '#585b70',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',
      brightWhite: '#a6adc8',
    },
  },
  {
    id: 'gruvbox-dark',
    label: 'Gruvbox Dark',
    background: '#282828',
    foreground: '#ebdbb2',
    cursor: '#ebdbb2',
    selectionBackground: '#504945',
    ansi: {
      black: '#282828',
      red: '#cc241d',
      green: '#98971a',
      yellow: '#d79921',
      blue: '#458588',
      magenta: '#b16286',
      cyan: '#689d6a',
      white: '#a89984',
      brightBlack: '#928374',
      brightRed: '#fb4934',
      brightGreen: '#b8bb26',
      brightYellow: '#fabd2f',
      brightBlue: '#83a598',
      brightMagenta: '#d3869b',
      brightCyan: '#8ec07c',
      brightWhite: '#ebdbb2',
    },
  },
  {
    id: 'github-dark',
    label: 'GitHub Dark',
    background: '#0d1117',
    foreground: '#c9d1d9',
    cursor: '#58a6ff',
    selectionBackground: '#264f78',
    ansi: {
      black: '#484f58',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc',
    },
  },
  {
    id: 'campbell',
    label: 'Windows Campbell',
    background: '#0c0c0c',
    foreground: '#cccccc',
    cursor: '#ffffff',
    selectionBackground: '#264f78',
    ansi: {
      black: '#0c0c0c',
      red: '#c50f1f',
      green: '#13a10e',
      yellow: '#c19c00',
      blue: '#0037da',
      magenta: '#881798',
      cyan: '#3a96dd',
      white: '#cccccc',
      brightBlack: '#767676',
      brightRed: '#e74856',
      brightGreen: '#16c60c',
      brightYellow: '#f9f1a5',
      brightBlue: '#3b78ff',
      brightMagenta: '#b4009e',
      brightCyan: '#61d6d6',
      brightWhite: '#f2f2f2',
    },
  },
  {
    id: 'ubuntu',
    label: 'Ubuntu',
    background: '#300a24',
    foreground: '#eeeeee',
    cursor: '#eeeeee',
    selectionBackground: '#5e2750',
    ansi: {
      black: '#2e3436',
      red: '#cc0000',
      green: '#4e9a06',
      yellow: '#c4a000',
      blue: '#3465a4',
      magenta: '#75507b',
      cyan: '#06989a',
      white: '#d3d7cf',
      brightBlack: '#555753',
      brightRed: '#ef2929',
      brightGreen: '#8ae234',
      brightYellow: '#fce94f',
      brightBlue: '#729fcf',
      brightMagenta: '#ad7fa8',
      brightCyan: '#34e2e2',
      brightWhite: '#eeeeec',
    },
  },
  {
    id: 'powershell',
    label: 'PowerShell Blue',
    background: '#012456',
    foreground: '#f6f6f6',
    cursor: '#f6f6f6',
    selectionBackground: '#0e4a8a',
    ansi: {
      black: '#0c0c0c',
      red: '#c50f1f',
      green: '#13a10e',
      yellow: '#c19c00',
      blue: '#0037da',
      magenta: '#881798',
      cyan: '#3a96dd',
      white: '#cccccc',
      brightBlack: '#767676',
      brightRed: '#e74856',
      brightGreen: '#16c60c',
      brightYellow: '#f9f1a5',
      brightBlue: '#3b78ff',
      brightMagenta: '#b4009e',
      brightCyan: '#61d6d6',
      brightWhite: '#f2f2f2',
    },
  },
  {
    id: 'ayu-dark',
    label: 'Ayu Dark',
    background: '#0b0e14',
    foreground: '#bfbdb6',
    cursor: '#e6b450',
    selectionBackground: '#1b2733',
    ansi: {
      black: '#11151c',
      red: '#ea6c73',
      green: '#7fd962',
      yellow: '#f9af4f',
      blue: '#53bdfa',
      magenta: '#cda1fa',
      cyan: '#90e1c6',
      white: '#c7c7c7',
      brightBlack: '#686868',
      brightRed: '#f07178',
      brightGreen: '#aad94c',
      brightYellow: '#ffb454',
      brightBlue: '#59c2ff',
      brightMagenta: '#d2a6ff',
      brightCyan: '#95e6cb',
      brightWhite: '#ffffff',
    },
  },
];

const TERM_FONT_PRESETS: Array<{
  id: string;
  label: string;
  value: string;
  group: 'Monospace' | 'Sans / Serif' | 'Cursive / Script';
}> = [
  {
    id: 'system',
    label: 'System Mono',
    group: 'Monospace',
    value:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  {
    id: 'cascadia',
    label: 'Cascadia Code',
    group: 'Monospace',
    value: '"Cascadia Code", "Cascadia Mono", Consolas, "Courier New", monospace',
  },
  {
    id: 'consolas',
    label: 'Consolas',
    group: 'Monospace',
    value: 'Consolas, "Courier New", monospace',
  },
  {
    id: 'courier-new',
    label: 'Courier New',
    group: 'Monospace',
    value: '"Courier New", Courier, monospace',
  },
  {
    id: 'fira',
    label: 'Fira Code',
    group: 'Monospace',
    value: '"Fira Code", "Fira Mono", Menlo, Consolas, monospace',
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    group: 'Monospace',
    value: '"JetBrains Mono", Menlo, Consolas, monospace',
  },
  {
    id: 'source',
    label: 'Source Code Pro',
    group: 'Monospace',
    value: '"Source Code Pro", Consolas, Menlo, monospace',
  },
  {
    id: 'ibm-plex',
    label: 'IBM Plex Mono',
    group: 'Monospace',
    value: '"IBM Plex Mono", Consolas, Menlo, monospace',
  },
  {
    id: 'hack',
    label: 'Hack',
    group: 'Monospace',
    value: 'Hack, Menlo, Consolas, monospace',
  },
  {
    id: 'inconsolata',
    label: 'Inconsolata',
    group: 'Monospace',
    value: 'Inconsolata, Consolas, monospace',
  },
  {
    id: 'roboto-mono',
    label: 'Roboto Mono',
    group: 'Monospace',
    value: '"Roboto Mono", Consolas, monospace',
  },
  {
    id: 'ubuntu-mono',
    label: 'Ubuntu Mono',
    group: 'Monospace',
    value: '"Ubuntu Mono", Consolas, monospace',
  },
  {
    id: 'sf-mono',
    label: 'SF Mono / Menlo',
    group: 'Monospace',
    value: 'SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  {
    id: 'space-mono',
    label: 'Space Mono',
    group: 'Monospace',
    value: '"Space Mono", Consolas, monospace',
  },
  {
    id: 'inter',
    label: 'Inter',
    group: 'Sans / Serif',
    value: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  },
  {
    id: 'segoe-ui',
    label: 'Segoe UI',
    group: 'Sans / Serif',
    value: '"Segoe UI", system-ui, sans-serif',
  },
  {
    id: 'arial',
    label: 'Arial',
    group: 'Sans / Serif',
    value: 'Arial, Helvetica, sans-serif',
  },
  {
    id: 'verdana',
    label: 'Verdana',
    group: 'Sans / Serif',
    value: 'Verdana, Geneva, sans-serif',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    group: 'Sans / Serif',
    value: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    id: 'times',
    label: 'Times New Roman',
    group: 'Sans / Serif',
    value: '"Times New Roman", Times, serif',
  },
  {
    id: 'palatino',
    label: 'Palatino',
    group: 'Sans / Serif',
    value: 'Palatino, "Palatino Linotype", "Book Antiqua", serif',
  },
  {
    id: 'garamond',
    label: 'Garamond',
    group: 'Sans / Serif',
    value: 'Garamond, "EB Garamond", Georgia, serif',
  },
  {
    id: 'cursive-system',
    label: 'System Cursive',
    group: 'Cursive / Script',
    value: 'cursive',
  },
  {
    id: 'segoe-script',
    label: 'Segoe Script',
    group: 'Cursive / Script',
    value: '"Segoe Script", "Comic Sans MS", cursive',
  },
  {
    id: 'segoe-print',
    label: 'Segoe Print',
    group: 'Cursive / Script',
    value: '"Segoe Print", "Comic Sans MS", cursive',
  },
  {
    id: 'comic-sans',
    label: 'Comic Sans',
    group: 'Cursive / Script',
    value: '"Comic Sans MS", "Comic Sans", cursive',
  },
  {
    id: 'brush-script',
    label: 'Brush Script',
    group: 'Cursive / Script',
    value: '"Brush Script MT", "Segoe Script", cursive',
  },
  {
    id: 'lucida-handwriting',
    label: 'Lucida Handwriting',
    group: 'Cursive / Script',
    value: '"Lucida Handwriting", "Segoe Script", cursive',
  },
  {
    id: 'apple-chancery',
    label: 'Apple Chancery',
    group: 'Cursive / Script',
    value: '"Apple Chancery", "Bradley Hand", cursive',
  },
  {
    id: 'bradley-hand',
    label: 'Bradley Hand',
    group: 'Cursive / Script',
    value: '"Bradley Hand", "Segoe Script", cursive',
  },
  {
    id: 'snell-roundhand',
    label: 'Snell Roundhand',
    group: 'Cursive / Script',
    value: '"Snell Roundhand", "Apple Chancery", cursive',
  },
  {
    id: 'zapfino',
    label: 'Zapfino',
    group: 'Cursive / Script',
    value: 'Zapfino, "Snell Roundhand", cursive',
  },
  {
    id: 'pacifico',
    label: 'Pacifico',
    group: 'Cursive / Script',
    value: 'Pacifico, "Segoe Script", cursive',
  },
  {
    id: 'dancing-script',
    label: 'Dancing Script',
    group: 'Cursive / Script',
    value: '"Dancing Script", "Segoe Script", cursive',
  },
  {
    id: 'great-vibes',
    label: 'Great Vibes',
    group: 'Cursive / Script',
    value: '"Great Vibes", "Brush Script MT", cursive',
  },
  {
    id: 'satisfy',
    label: 'Satisfy',
    group: 'Cursive / Script',
    value: 'Satisfy, "Segoe Script", cursive',
  },
];

const TERM_FONT_GROUPS = ['Monospace', 'Sans / Serif', 'Cursive / Script'] as const;

const DEFAULT_TERM_FONT_FAMILY = TERM_FONT_PRESETS[0].value;

type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
type ConnectMode = 'auto' | 'ws';
type TerminalViewMode = 'single' | 'grid' | 'stack-v' | 'stack-h';

const VIEW_MODE_OPTIONS: Array<{
  id: TerminalViewMode;
  label: string;
  description: string;
}> = [
  { id: 'single', label: 'Single', description: 'One terminal at a time (tabs)' },
  { id: 'grid', label: 'Grid', description: 'Tile terminals in a grid' },
  { id: 'stack-v', label: 'Stack vertical', description: 'Stack terminals top to bottom' },
  { id: 'stack-h', label: 'Stack horizontal', description: 'Stack terminals side by side' },
];

interface SessionTab {
  id: string;
  title: string;
  connectionId: string | null;
  status: ConnState;
  statusMessage: string;
  kind?: 'ssh' | 'rdp'; // default ssh
  rdpUrl?: string;
  /** When true, skip this tab for Send all / Ctrl+C / Multi-paste */
  excludeFromMulti?: boolean;
}

interface SessionHandle {
  term: Terminal | null;
  fit: FitAddon | null;
  ws: WebSocket | null;
  gatewaySessionId: string | null;
}

const CMD = {
  OUTPUT: '0',
  SET_WINDOW_TITLE: '1',
  SET_PREFERENCES: '2',
  INPUT: '0',
  RESIZE_TERMINAL: '1',
} as const;

function normalizeWsUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^auto:\/\//i.test(trimmed)) return trimmed;
  if (/^wss?:\/\//i.test(trimmed)) return trimmed;
  if (/^https:\/\//i.test(trimmed)) return `wss://${trimmed.slice(8)}`;
  if (/^http:\/\//i.test(trimmed)) return `ws://${trimmed.slice(7)}`;
  return `ws://${trimmed}`;
}

function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,#]+/)) {
    const tag = part.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function loadLocalConnections(): SavedSshConnection[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.id === 'string' && typeof c.wsUrl === 'string' && typeof c.name === 'string')
      .map((c) => ({
        id: c.id,
        name: String(c.name),
        wsUrl: String(c.wsUrl),
        protocol: normalizeConnectionProtocol(c.protocol),
        tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
        notes: typeof c.notes === 'string' && c.notes ? c.notes : undefined,
        color: normalizeSshColor(c.color),
        appearance: normalizeSshAppearance(c.appearance),
        createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
        lastUsedAt: typeof c.lastUsedAt === 'number' ? c.lastUsedAt : undefined,
      }));
  } catch {
    return [];
  }
}

function persistLocalConnections(list: SavedSshConnection[]) {
  try {
    localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function newId(): string {
  return `ssh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadPanelWidth(): number {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_KEY);
    if (!raw) return 220;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return 220;
    return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, n));
  } catch {
    return 220;
  }
}

function loadCmdBarHeight(): number {
  try {
    const raw = localStorage.getItem(CMD_BAR_HEIGHT_KEY);
    if (!raw) return CMD_BAR_DEFAULT_HEIGHT;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return CMD_BAR_DEFAULT_HEIGHT;
    return Math.min(CMD_BAR_MAX_HEIGHT, Math.max(CMD_BAR_MIN_HEIGHT, n));
  } catch {
    return CMD_BAR_DEFAULT_HEIGHT;
  }
}

function loadClampedInt(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  } catch {
    return fallback;
  }
}

function loadTermFontFamily(): string {
  try {
    const raw = localStorage.getItem(TERM_FONT_FAMILY_KEY);
    if (!raw) return DEFAULT_TERM_FONT_FAMILY;
    const match = TERM_FONT_PRESETS.find((p) => p.id === raw || p.value === raw);
    return match?.value || DEFAULT_TERM_FONT_FAMILY;
  } catch {
    return DEFAULT_TERM_FONT_FAMILY;
  }
}

function normalizeHexColor(raw: string, fallback: string): string {
  const s = String(raw || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function loadTermColor(key: string, fallback: string): string {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return normalizeHexColor(raw, fallback);
  } catch {
    return fallback;
  }
}

function loadThemePresetId(): string {
  try {
    const raw = localStorage.getItem(TERM_THEME_PRESET_KEY);
    if (!raw) return 'linknest';
    if (raw === 'custom') return 'custom';
    if (TERM_THEME_PRESETS.some((p) => p.id === raw)) return raw;
  } catch {
    // ignore
  }
  return 'linknest';
}

function loadTermAnsi(): TermAnsiPalette {
  try {
    const raw = localStorage.getItem(TERM_ANSI_KEY);
    if (!raw) {
      const preset = TERM_THEME_PRESETS.find((p) => p.id === loadThemePresetId());
      return { ...(preset?.ansi || {}) };
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as TermAnsiPalette) : {};
  } catch {
    return {};
  }
}

function ansiFromPreset(preset: TermThemePreset | undefined): TermAnsiPalette {
  return { ...(preset?.ansi || {}) };
}

function buildXtermTheme(opts: {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  ansi?: TermAnsiPalette;
}) {
  return {
    background: opts.background,
    foreground: opts.foreground,
    cursor: opts.cursor,
    cursorAccent: opts.background,
    selectionBackground: opts.selectionBackground,
    ...(opts.ansi || {}),
  };
}

function clampTermFontSize(n: number): number {
  return Math.min(TERM_FONT_SIZE_MAX, Math.max(TERM_FONT_SIZE_MIN, Math.round(n)));
}

function resolveFontFamily(raw: string | undefined): string {
  if (!raw) return DEFAULT_TERM_FONT_FAMILY;
  const match = TERM_FONT_PRESETS.find((p) => p.id === raw || p.value === raw);
  return match?.value || raw || DEFAULT_TERM_FONT_FAMILY;
}

function defaultConnectionAppearance(): SshConnectionAppearance {
  const presetId = loadThemePresetId();
  const preset = TERM_THEME_PRESETS.find((p) => p.id === presetId);
  return {
    themePresetId: presetId,
    fontSize: loadClampedInt(TERM_FONT_SIZE_KEY, 14, TERM_FONT_SIZE_MIN, TERM_FONT_SIZE_MAX),
    fontFamily: loadTermFontFamily(),
    bgColor: loadTermColor(TERM_BG_COLOR_KEY, preset?.background || DEFAULT_TERM_BG_COLOR),
    fgColor: loadTermColor(TERM_FG_COLOR_KEY, preset?.foreground || DEFAULT_TERM_FG_COLOR),
    cursorColor: loadTermColor(TERM_CURSOR_COLOR_KEY, preset?.cursor || DEFAULT_TERM_CURSOR_COLOR),
    selectionBg: loadTermColor(TERM_SELECTION_BG_KEY, preset?.selectionBackground || DEFAULT_TERM_SELECTION_BG),
    ansi: loadTermAnsi() as Record<string, string>,
  };
}

function mergeConnectionAppearance(raw?: SshConnectionAppearance | null): {
  themePresetId: string;
  fontSize: number;
  fontFamily: string;
  bgColor: string;
  fgColor: string;
  cursorColor: string;
  selectionBg: string;
  ansi: TermAnsiPalette;
} {
  const base = defaultConnectionAppearance();
  const a = normalizeSshAppearance(raw) || {};
  const themePresetId =
    typeof a.themePresetId === 'string' && (a.themePresetId === 'custom' || TERM_THEME_PRESETS.some((p) => p.id === a.themePresetId))
      ? a.themePresetId
      : base.themePresetId || 'linknest';
  const preset = TERM_THEME_PRESETS.find((p) => p.id === themePresetId);
  return {
    themePresetId,
    fontSize: clampTermFontSize(a.fontSize ?? base.fontSize ?? 14),
    fontFamily: resolveFontFamily(a.fontFamily || base.fontFamily),
    bgColor: normalizeHexColor(a.bgColor || base.bgColor || '', preset?.background || DEFAULT_TERM_BG_COLOR),
    fgColor: normalizeHexColor(a.fgColor || base.fgColor || '', preset?.foreground || DEFAULT_TERM_FG_COLOR),
    cursorColor: normalizeHexColor(a.cursorColor || base.cursorColor || '', preset?.cursor || DEFAULT_TERM_CURSOR_COLOR),
    selectionBg: normalizeHexColor(
      a.selectionBg || base.selectionBg || '',
      preset?.selectionBackground || DEFAULT_TERM_SELECTION_BG
    ),
    ansi: (a.ansi && Object.keys(a.ansi).length ? a.ansi : base.ansi || {}) as TermAnsiPalette,
  };
}

function loadViewMode(): TerminalViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    if (raw === 'single' || raw === 'grid' || raw === 'stack-v' || raw === 'stack-h') return raw;
  } catch {
    // ignore
  }
  return 'single';
}

function formatTabTags(tags: string[] | undefined | null): string {
  if (!tags || tags.length === 0) return '';
  return ` [${tags.join(', ')}]`;
}

/** Plain ASCII dump of the full xterm buffer (scrollback + viewport). */
function getTerminalPlainText(term: Terminal): string {
  const buffer = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    if (!line) continue;
    lines.push(line.translateToString(true));
  }
  // Trim trailing blank lines
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines.join('\n');
}

function sanitizeExportFilename(raw: string): string {
  const base = String(raw || 'terminal')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80);
  return base || 'terminal';
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function textDecoderDecode(data: ArrayBuffer | string): string {
  if (typeof data === 'string') return data;
  return new TextDecoder().decode(data);
}

function parseTtydFrame(data: ArrayBuffer | Blob | string): { cmd: string; payload: Uint8Array | string } | null {
  if (typeof data === 'string') {
    if (!data) return null;
    return { cmd: data[0], payload: data.slice(1) };
  }
  if (data instanceof ArrayBuffer) {
    const bytes = new Uint8Array(data);
    if (bytes.length === 0) return null;
    return { cmd: String.fromCharCode(bytes[0]), payload: bytes.subarray(1) };
  }
  return null;
}

export const SshTerminalWidget: React.FC<SshTerminalWidgetProps> = ({
  onClose,
  pendingOpen,
  onPendingOpenConsumed,
}) => {
  const { isAuthenticated } = useAuth();
  const { settings } = useSettings();
  const brandName = (settings.app_name || '').trim() || 'LinkNest';
  const sessionHandlesRef = useRef<Map<string, SessionHandle>>(new Map());
  const tabHostsRef = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const activeTabIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const widgetRootRef = useRef<HTMLDivElement>(null);
  const panelWidthRef = useRef(loadPanelWidth());
  const panelResizeCleanupRef = useRef<(() => void) | null>(null);
  const cmdBarHeightRef = useRef(loadCmdBarHeight());
  const cmdBarResizeCleanupRef = useRef<(() => void) | null>(null);
  const encoderRef = useRef(new TextEncoder());

  const [connectMode, setConnectMode] = useState<ConnectMode>(() => {
    const saved = localStorage.getItem(MODE_STORAGE_KEY) as ConnectMode | null;
    if (saved === 'auto' || saved === 'ws') return saved;
    return 'auto';
  });
  const [sshHost, setSshHost] = useState(() => localStorage.getItem(HOST_STORAGE_KEY) || '');
  const [sshPort, setSshPort] = useState(() => localStorage.getItem(PORT_STORAGE_KEY) || '22');
  const [sshUsername, setSshUsername] = useState(() => localStorage.getItem(USER_STORAGE_KEY) || '');
  const [x11Forward, setX11Forward] = useState(() => localStorage.getItem(X11_STORAGE_KEY) === 'true');
  const [gatewayAvailable, setGatewayAvailable] = useState<boolean | null>(null);
  const [gatewayHint, setGatewayHint] = useState<string | null>(null);
  const [maxSshTabs, setMaxSshTabs] = useState(DEFAULT_MAX_SSH_TABS);
  const [guiHint, setGuiHint] = useState<string | null>(null);
  const [guiDisplayReady, setGuiDisplayReady] = useState<boolean | null>(null);

  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem(WS_STORAGE_KEY) || 'ws://localhost:7681/ws');
  const [tabs, setTabs] = useState<SessionTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPane, setSettingsPane] = useState<'connection' | 'appearance'>('connection');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<TerminalViewMode>(() => loadViewMode());
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const multiView = viewMode !== 'single';
  const [broadcastCmd, setBroadcastCmd] = useState('');
  const [panelOpen, setPanelOpen] = useState(() => localStorage.getItem(PANEL_OPEN_KEY) !== 'false');
  const [panelWidth, setPanelWidth] = useState(() => loadPanelWidth());
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [cmdBarHeight, setCmdBarHeight] = useState(() => loadCmdBarHeight());
  const [isResizingCmdBar, setIsResizingCmdBar] = useState(false);
  const [termFontSize, setTermFontSize] = useState(() =>
    loadClampedInt(TERM_FONT_SIZE_KEY, 14, TERM_FONT_SIZE_MIN, TERM_FONT_SIZE_MAX)
  );
  const [termFontFamily, setTermFontFamily] = useState(() => loadTermFontFamily());
  const [termBgColor, setTermBgColor] = useState(() =>
    loadTermColor(TERM_BG_COLOR_KEY, DEFAULT_TERM_BG_COLOR)
  );
  const [termFgColor, setTermFgColor] = useState(() =>
    loadTermColor(TERM_FG_COLOR_KEY, DEFAULT_TERM_FG_COLOR)
  );
  const [termCursorColor, setTermCursorColor] = useState(() =>
    loadTermColor(TERM_CURSOR_COLOR_KEY, DEFAULT_TERM_CURSOR_COLOR)
  );
  const [termSelectionBg, setTermSelectionBg] = useState(() =>
    loadTermColor(TERM_SELECTION_BG_KEY, DEFAULT_TERM_SELECTION_BG)
  );
  const [themePresetId, setThemePresetId] = useState(() => loadThemePresetId());
  const [termAnsi, setTermAnsi] = useState<TermAnsiPalette>(() => loadTermAnsi());
  const [cmdFontSize, setCmdFontSize] = useState(() =>
    loadClampedInt(CMD_FONT_SIZE_KEY, 14, CMD_FONT_SIZE_MIN, CMD_FONT_SIZE_MAX)
  );
  const [tabBarHeight, setTabBarHeight] = useState(() =>
    loadClampedInt(TAB_BAR_HEIGHT_KEY, TAB_BAR_HEIGHT_DEFAULT, TAB_BAR_HEIGHT_MIN, TAB_BAR_HEIGHT_MAX)
  );
  const [tabBarFontSize, setTabBarFontSize] = useState(() =>
    loadClampedInt(TAB_BAR_FONT_SIZE_KEY, TAB_BAR_FONT_DEFAULT, TAB_BAR_FONT_MIN, TAB_BAR_FONT_MAX)
  );
  const [skipBarHeight, setSkipBarHeight] = useState(() =>
    loadClampedInt(SKIP_BAR_HEIGHT_KEY, SKIP_BAR_HEIGHT_DEFAULT, SKIP_BAR_HEIGHT_MIN, SKIP_BAR_HEIGHT_MAX)
  );
  const [skipBarFontSize, setSkipBarFontSize] = useState(() =>
    loadClampedInt(SKIP_BAR_FONT_SIZE_KEY, SKIP_BAR_FONT_DEFAULT, SKIP_BAR_FONT_MIN, SKIP_BAR_FONT_MAX)
  );
  const [storageReady, setStorageReady] = useState(!isAuthenticated);
  const [saving, setSaving] = useState(false);

  const [connections, setConnections] = useState<SavedSshConnection[]>(() =>
    isAuthenticated ? [] : loadLocalConnections()
  );
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const [draftName, setDraftName] = useState('');
  const [draftTags, setDraftTags] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftColor, setDraftColor] = useState<string>(SSH_CONNECTION_COLORS[0]);
  const [draftProtocol, setDraftProtocol] = useState<RemoteConnectionProtocol>('ssh');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState(IDLE_NOTICE);

  const useServer = Boolean(isAuthenticated);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );
  const status: ConnState = activeTab?.status ?? 'idle';
  const statusMessage = activeTab?.statusMessage ?? notice;

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const tabsRef = useRef(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const connectionsRef = useRef(connections);
  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  const editingIdRef = useRef(editingId);
  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);

  const appearanceDraftRef = useRef({
    themePresetId,
    fontSize: termFontSize,
    fontFamily: termFontFamily,
    bgColor: termBgColor,
    fgColor: termFgColor,
    cursorColor: termCursorColor,
    selectionBg: termSelectionBg,
    ansi: termAnsi as Record<string, string>,
  });
  appearanceDraftRef.current = {
    themePresetId,
    fontSize: termFontSize,
    fontFamily: termFontFamily,
    bgColor: termBgColor,
    fgColor: termFgColor,
    cursorColor: termCursorColor,
    selectionBg: termSelectionBg,
    ansi: termAnsi as Record<string, string>,
  };

  const snapshotDraftAppearance = useCallback((): SshConnectionAppearance => {
    return { ...appearanceDraftRef.current };
  }, []);

  const loadAppearanceIntoForm = useCallback((raw?: SshConnectionAppearance | null) => {
    const a = mergeConnectionAppearance(raw);
    setThemePresetId(a.themePresetId);
    setTermFontSize(a.fontSize);
    setTermFontFamily(a.fontFamily);
    setTermBgColor(a.bgColor);
    setTermFgColor(a.fgColor);
    setTermCursorColor(a.cursorColor);
    setTermSelectionBg(a.selectionBg);
    setTermAnsi(a.ansi);
  }, []);

  const applyAppearanceToConnectionTabs = useCallback(
    (
      connectionId: string | null | undefined,
      appearance: {
        fontSize: number;
        fontFamily: string;
        bgColor: string;
        fgColor: string;
        cursorColor: string;
        selectionBg: string;
        ansi: TermAnsiPalette;
      }
    ) => {
      if (!connectionId) return 0;
      const theme = buildXtermTheme({
        background: appearance.bgColor,
        foreground: appearance.fgColor,
        cursor: appearance.cursorColor,
        selectionBackground: appearance.selectionBg,
        ansi: appearance.ansi,
      });
      let applied = 0;
      for (const tab of tabsRef.current) {
        if (tab.connectionId !== connectionId) continue;
        if ((tab.kind || 'ssh') === 'rdp') continue;
        const handle = sessionHandlesRef.current.get(tab.id);
        if (!handle?.term) continue;
        try {
          handle.term.options.fontSize = appearance.fontSize;
          handle.term.options.fontFamily = appearance.fontFamily;
          handle.term.options.theme = theme;
          handle.term.refresh(0, Math.max(0, handle.term.rows - 1));
          handle.fit?.fit();
          applied += 1;
        } catch {
          // ignore
        }
      }
      return applied;
    },
    []
  );

  // After exit / last tab closed, don't leave "Connecting…" stuck in the header
  useEffect(() => {
    if (tabs.length === 0) {
      setNotice(IDLE_NOTICE);
      setActiveTabId(null);
    }
  }, [tabs.length]);

  const updateTab = useCallback((tabId: string, patch: Partial<SessionTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...patch } : t)));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, connectMode);
      localStorage.setItem(HOST_STORAGE_KEY, sshHost);
      localStorage.setItem(PORT_STORAGE_KEY, sshPort);
      localStorage.setItem(USER_STORAGE_KEY, sshUsername);
      localStorage.setItem(X11_STORAGE_KEY, x11Forward ? 'true' : 'false');
    } catch {
      // ignore
    }
  }, [connectMode, sshHost, sshPort, sshUsername, x11Forward]);

  useEffect(() => {
    if (!useServer) {
      setGatewayAvailable(false);
      setGatewayHint(null);
      setGuiDisplayReady(null);
      setGuiHint(null);
      return;
    }
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const st = await sshGatewayService.status();
        if (cancelled) return;
        setGatewayAvailable(Boolean(st.available));
        if (!st.available) {
          const parts: string[] = [];
          if (st.ttydFound === false || (Array.isArray(st.missing) && st.missing.includes('ttyd'))) {
            parts.push('ttyd missing (deploy bin/ttyd.exe or set Admin → Add-ons → SSH Gateway)');
          }
          if (st.sshFound === false || (Array.isArray(st.missing) && st.missing.includes('ssh'))) {
            parts.push('OpenSSH ssh.exe missing (install OpenSSH Client)');
          }
          setGatewayHint(st.hint || (parts.length ? parts.join(' · ') : 'SSH gateway unavailable — check Admin → Add-ons → SSH Gateway'));
        } else {
          setGatewayHint(null);
        }
        if (typeof st.maxConnections === 'number' && st.maxConnections >= 1) {
          setMaxSshTabs(Math.floor(st.maxConnections));
        }
        setGuiDisplayReady(st.gui?.displayReachable ?? null);
        setGuiHint(st.gui?.hint || null);
      } catch {
        if (!cancelled) {
          setGatewayAvailable(false);
          setGatewayHint('Could not reach SSH gateway status API — sign in and refresh, then confirm bin/ttyd.exe is deployed.');
          setGuiDisplayReady(null);
        }
      }
    };
    void loadStatus();
    const t = window.setInterval(() => {
      if (x11Forward) void loadStatus();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [useServer, x11Forward]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    connections.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [connections]);

  const filteredConnections = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return connections
      .filter((c) => {
        if (filterTag && !c.tags.includes(filterTag)) return false;
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.wsUrl.toLowerCase().includes(q) ||
          (c.notes || '').toLowerCase().includes(q) ||
          c.tags.some((t) => t.includes(q)) ||
          (() => {
            const a = parseAutoTargetUrl(c.wsUrl);
            if (!a) return false;
            return (
              a.host.toLowerCase().includes(q) ||
              a.username.toLowerCase().includes(q) ||
              String(a.port).includes(q)
            );
          })()
        );
      })
      .sort((a, b) => (b.lastUsedAt || b.createdAt) - (a.lastUsedAt || a.createdAt));
  }, [connections, filterQuery, filterTag]);

  const updateConnectionsLocal = useCallback((next: SavedSshConnection[]) => {
    setConnections(next);
    persistLocalConnections(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!useServer) {
        setConnections(loadLocalConnections());
        setStorageReady(true);
        return;
      }
      setStorageReady(false);
      try {
        const list = await sshConnectionService.list();
        if (!cancelled) {
          setConnections(list);
          setStorageReady(true);
        }
      } catch (err) {
        console.error('Failed to load SSH connections', err);
        if (!cancelled) {
          setNotice(err instanceof Error ? err.message : 'Failed to load saved connections');
          setStorageReady(true);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [useServer]);

  const stopGatewayFor = useCallback(async (gatewaySessionId: string | null | undefined) => {
    if (!gatewaySessionId) return;
    try {
      await sshGatewayService.stop(gatewaySessionId);
    } catch {
      // ignore
    }
  }, []);

  /** Tabs whose WebSocket is being closed on purpose (UI close / reconnect) — skip auto-close-on-exit. */
  const intentionalWsCloseRef = useRef(new Set<string>());

  const disposeSessionHandle = useCallback((tabId: string, opts?: { keepHost?: boolean }) => {
    const handle = sessionHandlesRef.current.get(tabId);
    if (!handle) return;
    if (handle.ws) {
      intentionalWsCloseRef.current.add(tabId);
      try {
        handle.ws.close();
      } catch {
        // ignore
      }
    }
    handle.ws = null;
    try {
      handle.term?.dispose();
    } catch {
      // ignore
    }
    handle.term = null;
    handle.fit = null;
    const host = tabHostsRef.current.get(tabId);
    if (host && !opts?.keepHost) {
      host.innerHTML = '';
    }
    const gw = handle.gatewaySessionId;
    handle.gatewaySessionId = null;
    sessionHandlesRef.current.set(tabId, handle);
    return gw;
  }, []);

  const closeTab = useCallback(
    async (tabId: string) => {
      const handle = sessionHandlesRef.current.get(tabId);
      const gw = handle?.gatewaySessionId ?? null;
      disposeSessionHandle(tabId);
      sessionHandlesRef.current.delete(tabId);
      tabHostsRef.current.delete(tabId);
      void stopGatewayFor(gw);

      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== tabId);
        setActiveTabId((current) => {
          if (current !== tabId) return current;
          return next.length ? next[next.length - 1].id : null;
        });
        return next;
      });
    },
    [disposeSessionHandle, stopGatewayFor]
  );

  const requestClose = useCallback(async () => {
    const live = tabsRef.current.filter(
      (t) => t.status === 'connected' || t.status === 'connecting'
    );
    if (live.length > 0) {
      const ok = window.confirm('Kill all terminals and close?');
      if (!ok) return;
      const ids = tabsRef.current.map((t) => t.id);
      for (const id of ids) {
        await closeTab(id);
      }
    }
    onClose?.();
  }, [closeTab, onClose]);

  useEffect(() => {
    const onExternalClose = () => {
      void requestClose();
    };
    window.addEventListener('requestCloseSshTerminal', onExternalClose);
    return () => window.removeEventListener('requestCloseSshTerminal', onExternalClose);
  }, [requestClose]);

  const toggleFullscreen = useCallback(async () => {
    const el = widgetRootRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        setPanelOpen(true);
        await el.requestFullscreen();
      } else {
        setPanelOpen(true);
        await el.requestFullscreen();
      }
    } catch {
      setNotice('Fullscreen is not available in this browser/context');
    }
  }, []);

  const markLastUsed = useCallback(
    async (connectionId: string | null | undefined) => {
      if (!connectionId) return;
      const now = Date.now();
      setConnections((prev) => {
        const next = prev.map((c) => (c.id === connectionId ? { ...c, lastUsedAt: now } : c));
        if (!useServer) persistLocalConnections(next);
        return next;
      });
      if (useServer) {
        try {
          await sshConnectionService.update(connectionId, { lastUsedAt: now });
        } catch {
          // non-fatal
        }
      }
    },
    [useServer]
  );

  const sendResize = useCallback((tabId?: string | null) => {
    const id = tabId ?? activeTabIdRef.current;
    if (!id) return;
    const handle = sessionHandlesRef.current.get(id);
    const term = handle?.term;
    const ws = handle?.ws;
    if (!term || !ws || ws.readyState !== WebSocket.OPEN) return;
    const msg = CMD.RESIZE_TERMINAL + JSON.stringify({ columns: term.cols, rows: term.rows });
    ws.send(encoderRef.current.encode(msg));
  }, []);

  const fitSessions = useCallback(
    (ids?: string[] | null) => {
      const list = ids && ids.length ? ids : Array.from(sessionHandlesRef.current.keys());
      for (const id of list) {
        try {
          const handle = sessionHandlesRef.current.get(id);
          if (!handle?.fit || !handle.term) continue;
          handle.fit.fit();
          try {
            handle.term.refresh(0, Math.max(0, handle.term.rows - 1));
          } catch {
            // ignore
          }
          sendResize(id);
        } catch {
          // ignore
        }
      }
    },
    [sendResize]
  );

  const broadcastToAll = useCallback(
    (raw: string) => {
      const text = raw.replace(/\r\n/g, '\n');
      if (!text) return;
      const payload = text.endsWith('\n') ? text : `${text}\n`;
      const frame = encoderRef.current.encode(CMD.INPUT + payload);
      let sent = 0;
      for (const tab of tabs) {
        if ((tab.kind || 'ssh') === 'rdp') continue;
        if (tab.excludeFromMulti) continue;
        if (tab.status !== 'connected') continue;
        const ws = sessionHandlesRef.current.get(tab.id)?.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) continue;
        try {
          ws.send(frame);
          sent += 1;
        } catch {
          // ignore
        }
      }
      setNotice(
        sent > 0
          ? `Sent to ${sent} terminal${sent === 1 ? '' : 's'}`
          : 'No included terminals to receive the command'
      );
    },
    [tabs]
  );

  const sendKeyToAll = useCallback(
    (payload: string, label: string) => {
      const frame = encoderRef.current.encode(CMD.INPUT + payload);
      let sent = 0;
      for (const tab of tabs) {
        if ((tab.kind || 'ssh') === 'rdp') continue;
        if (tab.excludeFromMulti) continue;
        if (tab.status !== 'connected') continue;
        const ws = sessionHandlesRef.current.get(tab.id)?.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) continue;
        try {
          ws.send(frame);
          sent += 1;
        } catch {
          // ignore
        }
      }
      setNotice(
        sent > 0
          ? `Sent ${label} to ${sent} terminal${sent === 1 ? '' : 's'}`
          : `No included terminals to receive ${label}`
      );
    },
    [tabs]
  );

  const interruptAll = useCallback(() => {
    // ASCII ETX — Ctrl+C
    sendKeyToAll('\x03', 'Ctrl+C');
  }, [sendKeyToAll]);

  const suspendAll = useCallback(() => {
    // ASCII SUB — Ctrl+Z
    sendKeyToAll('\x1a', 'Ctrl+Z');
  }, [sendKeyToAll]);

  const eofAll = useCallback(() => {
    // ASCII EOT — Ctrl+D
    sendKeyToAll('\x04', 'Ctrl+D');
  }, [sendKeyToAll]);

  const enterAll = useCallback(() => {
    // CR — Enter
    sendKeyToAll('\r', 'Enter');
  }, [sendKeyToAll]);

  const arrowUpAll = useCallback(() => {
    // CSI CUU — Up arrow (shell history / cursor)
    sendKeyToAll('\x1b[A', '↑');
  }, [sendKeyToAll]);

  const arrowDownAll = useCallback(() => {
    // CSI CUD — Down arrow (shell history / cursor)
    sendKeyToAll('\x1b[B', '↓');
  }, [sendKeyToAll]);

  const pasteToAll = useCallback(async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setNotice('Clipboard paste was blocked — allow clipboard access first');
      return;
    }
    if (!text) {
      setNotice('Clipboard is empty');
      return;
    }

    let sent = 0;
    for (const tab of tabs) {
      if ((tab.kind || 'ssh') === 'rdp') continue;
      if (tab.excludeFromMulti) continue;
      if (tab.status !== 'connected') continue;
      const handle = sessionHandlesRef.current.get(tab.id);
      const term = handle?.term;
      const ws = handle?.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) continue;
      try {
        if (term) {
          // Prefer xterm paste so bracketed-paste mode is honored when available
          term.paste(text);
        } else {
          ws.send(encoderRef.current.encode(CMD.INPUT + text));
        }
        sent += 1;
      } catch {
        // ignore
      }
    }
    setNotice(
      sent > 0
        ? `Pasted to ${sent} terminal${sent === 1 ? '' : 's'}`
        : 'No included terminals to paste into'
    );
  }, [tabs]);

  const tileCols = useMemo(() => {
    const n = tabs.length;
    if (n <= 1) return 1;
    if (n === 2) return 2;
    if (n <= 4) return 2;
    if (n <= 6) return 3;
    return 4;
  }, [tabs.length]);

  useEffect(() => {
    const onFs = () => {
      const active = document.fullscreenElement === widgetRootRef.current;
      setIsFullscreen(active);
      window.setTimeout(() => fitSessions(), 80);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [fitSessions]);

  const waitForTabHost = useCallback(async (tabId: string): Promise<HTMLDivElement | null> => {
    for (let i = 0; i < 30; i++) {
      const el = tabHostsRef.current.get(tabId);
      if (el) return el;
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
    return tabHostsRef.current.get(tabId) ?? null;
  }, []);

  const connectTo = useCallback(
    async (opts?: {
      wsUrl?: string;
      connectionId?: string | null;
      connectionName?: string;
      host?: string;
      port?: number;
      username?: string;
      mode?: ConnectMode;
      x11?: boolean;
    }) => {
      if (sessionHandlesRef.current.size >= maxSshTabs) {
        setNotice(`Maximum of ${maxSshTabs} open sessions. Close a tab first.`);
        return;
      }

      const mode = opts?.mode ?? connectMode;
      let url = normalizeWsUrl(opts?.wsUrl ?? wsUrl);
      const nextConnectionId = opts?.connectionId !== undefined ? opts.connectionId : activeConnectionId;
      const nextName = opts?.connectionName;
      const tabId = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const tabTitle = (nextName || '').trim() || (opts?.host ? `${opts.username || sshUsername}@${opts.host}` : 'Session');

      sessionHandlesRef.current.set(tabId, {
        term: null,
        fit: null,
        ws: null,
        gatewaySessionId: null,
      });
      setTabs((prev) => [
        ...prev,
        {
          id: tabId,
          title: tabTitle || 'Session',
          connectionId: nextConnectionId,
          status: 'connecting',
          statusMessage: 'Starting session…',
          excludeFromMulti: false,
        },
      ]);
      setActiveTabId(tabId);
      setActiveConnectionId(nextConnectionId ?? null);
      setShowSettings(false);

      const failTab = (message: string) => {
        const handle = sessionHandlesRef.current.get(tabId);
        const gw = handle?.gatewaySessionId ?? null;
        if (handle) handle.gatewaySessionId = null;
        disposeSessionHandle(tabId);
        sessionHandlesRef.current.delete(tabId);
        tabHostsRef.current.delete(tabId);
        void stopGatewayFor(gw);
        setTabs((prev) => {
          const next = prev.filter((t) => t.id !== tabId);
          setActiveTabId((current) => {
            if (current !== tabId) return current;
            return next.length ? next[next.length - 1].id : null;
          });
          return next;
        });
        setNotice(message);
        setShowSettings(true);
        setSettingsPane('connection');
      };

      const autoFromUrl = parseAutoTargetUrl(url);
      const wantAuto =
        mode === 'auto' || Boolean(autoFromUrl) || (Boolean(opts?.host) && Boolean(opts?.username));

      if (wantAuto) {
        if (!useServer) {
          failTab(`Sign in to use automatic SSH (${brandName} starts ttyd for you). Or switch to WebSocket URL mode.`);
          return;
        }
        const host = (opts?.host ?? autoFromUrl?.host ?? sshHost).trim();
        const username = (opts?.username ?? autoFromUrl?.username ?? sshUsername).trim();
        const port = opts?.port ?? autoFromUrl?.port ?? (Number.parseInt(sshPort, 10) || 22);
        if (!host || !username) {
          failTab('Host and username are required.');
          return;
        }
        const title = nextName?.trim() || `${username}@${host}`;
        updateTab(tabId, {
          title,
          statusMessage:
            (opts?.x11 ?? x11Forward)
              ? `Starting SSH+GUI gateway to ${username}@${host}:${port}…`
              : `Starting SSH gateway to ${username}@${host}:${port}…`,
        });
        try {
          let session = await sshGatewayService.start({
            host,
            port,
            username,
            x11: opts?.x11 ?? x11Forward,
          });
          const handle = sessionHandlesRef.current.get(tabId);
          if (handle) handle.gatewaySessionId = session.sessionId;
          url = session.wsUrl;
          setWsUrl(url);
          setSshHost(host);
          setSshPort(String(port));
          setSshUsername(username);
          setConnectMode('auto');
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to start SSH gateway';
          // Orphan ttyd processes can remain after UI tabs are closed and still count toward the max.
          if (/too many active ssh gateways|gateway_limit/i.test(msg) && sessionHandlesRef.current.size <= 1) {
            try {
              const cleared = await sshGatewayService.stopAll();
              const session = await sshGatewayService.start({
                host,
                port,
                username,
                x11: opts?.x11 ?? x11Forward,
              });
              const handle = sessionHandlesRef.current.get(tabId);
              if (handle) handle.gatewaySessionId = session.sessionId;
              url = session.wsUrl;
              setWsUrl(url);
              setSshHost(host);
              setSshPort(String(port));
              setSshUsername(username);
              setConnectMode('auto');
              if (cleared.stopped > 0) {
                setNotice(`Cleared ${cleared.stopped} leftover gateway(s), then connected`);
              }
            } catch (err2) {
              failTab(err2 instanceof Error ? err2.message : msg);
              return;
            }
          } else {
            failTab(msg);
            return;
          }
        }
      }

      if (!url || /^auto:\/\//i.test(url)) {
        failTab('WebSocket URL is required.');
        return;
      }

      updateTab(tabId, {
        status: 'connecting',
        statusMessage: `Connecting to ${nextName || url}…`,
      });

      try {
        localStorage.setItem(WS_STORAGE_KEY, url);
      } catch {
        // ignore
      }

      const hostEl = await waitForTabHost(tabId);
      if (!hostEl) {
        failTab('Terminal surface is not ready.');
        return;
      }

      const appearance = (() => {
        const cid = nextConnectionId ?? null;
        if (cid && editingIdRef.current === cid) {
          return mergeConnectionAppearance(appearanceDraftRef.current);
        }
        if (cid) {
          const saved = connectionsRef.current.find((c) => c.id === cid);
          return mergeConnectionAppearance(saved?.appearance);
        }
        return mergeConnectionAppearance(appearanceDraftRef.current);
      })();

      const term = new Terminal({
        cursorBlink: true,
        fontSize: appearance.fontSize,
        lineHeight: 1.25,
        letterSpacing: 0,
        fontFamily: appearance.fontFamily,
        // Right-click pastes; selection is left-drag only
        rightClickSelectsWord: false,
        theme: buildXtermTheme({
          background: appearance.bgColor,
          foreground: appearance.fgColor,
          cursor: appearance.cursorColor,
          selectionBackground: appearance.selectionBg,
          ansi: appearance.ansi,
        }),
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      hostEl.innerHTML = '';
      term.open(hostEl);

      // Select → copy on mouse-up (when a selection exists)
      const copySelectionIfAny = () => {
        const text = term.getSelection();
        if (!text) return;
        void navigator.clipboard.writeText(text).catch(() => undefined);
      };
      const onMouseUpCopy = (ev: MouseEvent) => {
        if (ev.button !== 0) return;
        // Let xterm finalize selection first
        window.setTimeout(copySelectionIfAny, 0);
      };
      hostEl.addEventListener('mouseup', onMouseUpCopy);

      // Right-click → paste (block browser context menu)
      const pasteFromClipboard = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
        void navigator.clipboard
          .readText()
          .then((text) => {
            if (text) term.paste(text);
          })
          .catch(() => undefined);
      };
      hostEl.addEventListener('contextmenu', pasteFromClipboard);

      // Keyboard: Ctrl/Cmd+C copies selection; Ctrl/Cmd+V pastes
      term.attachCustomKeyEventHandler((ev) => {
        const mod = ev.ctrlKey || ev.metaKey;
        if (!mod || ev.type !== 'keydown') return true;
        const key = ev.key.toLowerCase();
        if (key === 'c' && term.hasSelection()) {
          copySelectionIfAny();
          return false;
        }
        if (key === 'v') {
          pasteFromClipboard(ev);
          return false;
        }
        return true;
      });

      requestAnimationFrame(() => {
        try {
          fit.fit();
          term.refresh(0, Math.max(0, term.rows - 1));
        } catch {
          // ignore
        }
      });

      const handle = sessionHandlesRef.current.get(tabId);
      if (!handle) {
        try {
          term.dispose();
        } catch {
          // ignore
        }
        failTab('Session was closed.');
        return;
      }
      handle.term = term;
      handle.fit = fit;

      let ws: WebSocket;
      try {
        ws = new WebSocket(url, ['tty']);
      } catch (err) {
        const gw = disposeSessionHandle(tabId);
        void stopGatewayFor(gw);
        failTab(err instanceof Error ? err.message : 'Failed to open WebSocket');
        return;
      }

      ws.binaryType = 'arraybuffer';
      handle.ws = ws;

      ws.onopen = () => {
        try {
          fit.fit();
        } catch {
          // ignore
        }
        const cols = Math.max(term.cols || 80, 2);
        const rows = Math.max(term.rows || 24, 1);
        const hello = JSON.stringify({ AuthToken: '', columns: cols, rows });
        ws.send(encoderRef.current.encode(hello));
        if (activeTabIdRef.current === tabId) term.focus();
        updateTab(tabId, {
          status: 'connected',
          statusMessage: nextName ? `Connected · ${nextName}` : 'Connected — enter SSH password if prompted',
        });
        void markLastUsed(nextConnectionId);
        window.setTimeout(() => {
          try {
            fit.fit();
            sendResize(tabId);
            if (activeTabIdRef.current === tabId) term.focus();
          } catch {
            // ignore
          }
        }, 80);
      };

      ws.onmessage = (ev) => {
        const frame = parseTtydFrame(ev.data as ArrayBuffer | string);
        if (!frame) return;
        const { cmd, payload } = frame;
        if (cmd === CMD.OUTPUT) {
          term.write(payload);
        } else if (cmd === CMD.SET_WINDOW_TITLE) {
          const title = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
          updateTab(tabId, {
            statusMessage: nextName ? `${nextName} · ${title}` : title,
            title: nextName?.trim() || title.split(' ')[0] || 'Session',
          });
        }
      };

      ws.onerror = () => {
        // Natural close (exit / ttyd stop) follows via onclose and removes the tab.
        // Connect-time failures use failTab() which already surfaces settings.
        updateTab(tabId, {
          status: 'error',
          statusMessage: `WebSocket error — cannot reach ${url}. If Easy mode was used, ttyd may have exited; try Connect again.`,
        });
      };

      ws.onclose = (ev) => {
        const intentional = intentionalWsCloseRef.current.delete(tabId);
        if (intentional) {
          const current = sessionHandlesRef.current.get(tabId);
          if (current) {
            current.ws = null;
            const gw = current.gatewaySessionId ?? null;
            current.gatewaySessionId = null;
            void stopGatewayFor(gw);
          }
          return;
        }
        // Prefer remote SSH close text already shown in the terminal (e.g. "Connection closed by host").
        // Only blame the WSS proxy when the socket dies with no useful terminal output.
        const code = typeof ev?.code === 'number' ? ev.code : 0;
        const abnormal = code === 1006 || code === 0 || (code > 0 && code < 1000);
        const term = sessionHandlesRef.current.get(tabId)?.term;
        let bufferText = '';
        try {
          // xterm buffer may hold the remote close reason
          const buf = term?.buffer?.active;
          if (buf) {
            const lines: string[] = [];
            const start = Math.max(0, buf.baseY + buf.cursorY - 12);
            const end = buf.baseY + buf.cursorY;
            for (let i = start; i <= end; i++) {
              const line = buf.getLine(i)?.translateToString(true)?.trim();
              if (line) lines.push(line);
            }
            bufferText = lines.join('\n');
          }
        } catch {
          // ignore
        }
        const remoteClosed = /connection closed by|permission denied|authentication failed|secureauth|access denied/i.test(
          bufferText
        );
        if (remoteClosed) {
          updateTab(tabId, {
            status: 'error',
            statusMessage:
              'Remote SSH closed the session after login/MFA (see terminal). Check SecureAuth code, PAM target, and account access — the WSS tunnel was working.',
          });
          const current = sessionHandlesRef.current.get(tabId);
          if (current?.ws === ws) current.ws = null;
          return;
        }
        if (abnormal) {
          updateTab(tabId, {
            status: 'error',
            statusMessage:
              'SSH tunnel closed after connect (often MFA / proxy). Confirm Apache gateway proxy uses HTTP/1.1 only, then Connect again.',
          });
          const current = sessionHandlesRef.current.get(tabId);
          if (current?.ws === ws) {
            current.ws = null;
          }
          return;
        }
        // Shell exited / remote closed — drop the tab; do not open settings.
        if (sessionHandlesRef.current.has(tabId)) {
          void closeTab(tabId);
        }
      };

      term.onData((data) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(encoderRef.current.encode(CMD.INPUT + data));
      });

      term.onResize(() => {
        sendResize(tabId);
      });
    },
    [
      connectMode,
      wsUrl,
      sshHost,
      sshPort,
      sshUsername,
      x11Forward,
      useServer,
      maxSshTabs,
      activeConnectionId,
      updateTab,
      disposeSessionHandle,
      stopGatewayFor,
      waitForTabHost,
      sendResize,
      markLastUsed,
      closeTab,
      brandName,
    ]
  );

  const copyActiveSelection = useCallback(async () => {
    const id = activeTabIdRef.current;
    if (!id) {
      setNotice('No active terminal');
      return;
    }
    const tab = tabsRef.current.find((t) => t.id === id);
    if (tab?.kind === 'rdp') {
      setNotice('Use the RDP gateway UI to copy text');
      return;
    }
    const term = sessionHandlesRef.current.get(id)?.term;
    const text = term?.getSelection() || '';
    if (!text.trim()) {
      setNotice('Select text in the terminal first, then Copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Copied to clipboard');
    } catch {
      setNotice('Clipboard copy was blocked by the browser');
    }
  }, []);

  const exportTerminalAscii = useCallback((tabId?: string | null) => {
    const id = tabId || activeTabIdRef.current;
    if (!id) {
      setNotice('No active terminal');
      return;
    }
    const tab = tabsRef.current.find((t) => t.id === id);
    if (!tab) {
      setNotice('Terminal tab not found');
      return;
    }
    if (tab.kind === 'rdp') {
      setNotice('ASCII export is only available for SSH terminals');
      return;
    }
    const term = sessionHandlesRef.current.get(id)?.term;
    if (!term) {
      setNotice('Terminal is not ready yet');
      return;
    }
    const text = getTerminalPlainText(term);
    if (!text.trim()) {
      setNotice('Terminal buffer is empty — nothing to export');
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${sanitizeExportFilename(tab.title)}_${stamp}.txt`;
    try {
      downloadTextFile(filename, text.endsWith('\n') ? text : `${text}\n`);
      setNotice(`Exported ${filename}`);
    } catch {
      setNotice('Failed to export terminal text');
    }
  }, []);

  const pasteIntoActive = useCallback(async () => {
    const id = activeTabIdRef.current;
    if (!id) {
      setNotice('No active terminal');
      return;
    }
    const tab = tabsRef.current.find((t) => t.id === id);
    if (tab?.kind === 'rdp') {
      setNotice('Use the RDP gateway UI to paste text');
      return;
    }
    const term = sessionHandlesRef.current.get(id)?.term;
    const ws = sessionHandlesRef.current.get(id)?.ws;
    if (!term || !ws || ws.readyState !== WebSocket.OPEN) {
      setNotice('Terminal is not connected');
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        setNotice('Clipboard is empty');
        return;
      }
      term.paste(text);
      term.focus();
      setNotice('Pasted from clipboard');
    } catch {
      setNotice('Clipboard paste was blocked — allow clipboard access or use Ctrl+V');
    }
  }, []);

  const onHostZoomCompensated = useCallback(() => {
    window.setTimeout(() => {
      try {
        fitSessions();
      } catch {
        // ignore
      }
    }, 40);
  }, [fitSessions]);

  const connect = useCallback(() => connectTo(), [connectTo]);

  const connectRdp = useCallback(
    (opts?: { url?: string; connectionId?: string; connectionName?: string }) => {
      if (sessionHandlesRef.current.size >= maxSshTabs) {
        setNotice(`Maximum of ${maxSshTabs} open sessions. Close a tab first.`);
        return;
      }

      const url = String(opts?.url ?? wsUrl).trim();
      if (!/^https?:\/\//i.test(url)) {
        setNotice('RDP gateway must be an http:// or https:// page URL');
        setShowSettings(true);
        setSettingsPane('connection');
        return;
      }

      const nextConnectionId = opts?.connectionId !== undefined ? opts.connectionId : activeConnectionId;
      const nextName = (opts?.connectionName || '').trim() || 'RDP';
      const tabId = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

      sessionHandlesRef.current.set(tabId, {
        term: null,
        fit: null,
        ws: null,
        gatewaySessionId: null,
      });
      setTabs((prev) => [
        ...prev,
        {
          id: tabId,
          title: nextName,
          connectionId: nextConnectionId ?? null,
          status: 'connecting',
          statusMessage: 'Loading RDP gateway…',
          kind: 'rdp',
          rdpUrl: url,
        },
      ]);
      setActiveTabId(tabId);
      setActiveConnectionId(nextConnectionId ?? null);
      setWsUrl(url);
      setShowSettings(false);
      setNotice(`Connecting RDP “${nextName}”…`);
      void markLastUsed(nextConnectionId);
    },
    [wsUrl, activeConnectionId, markLastUsed, maxSshTabs]
  );

  const selectTab = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId);
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.connectionId) setActiveConnectionId(tab.connectionId);
      requestAnimationFrame(() => {
        const handle = sessionHandlesRef.current.get(tabId);
        try {
          handle?.fit?.fit();
          sendResize(tabId);
          handle?.term?.focus();
        } catch {
          // ignore
        }
      });
    },
    [tabs, sendResize]
  );

  useEffect(() => {
    return () => {
      const ids = Array.from(sessionHandlesRef.current.keys());
      for (const id of ids) {
        const handle = sessionHandlesRef.current.get(id);
        const gw = handle?.gatewaySessionId ?? null;
        disposeSessionHandle(id);
        void stopGatewayFor(gw);
      }
      sessionHandlesRef.current.clear();
      tabHostsRef.current.clear();
    };
  }, [disposeSessionHandle, stopGatewayFor]);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_OPEN_KEY, panelOpen ? 'true' : 'false');
    } catch {
      // ignore
    }
  }, [panelOpen]);

  useEffect(() => {
    panelWidthRef.current = panelWidth;
    try {
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    } catch {
      // ignore
    }
  }, [panelWidth]);

  useEffect(() => {
    cmdBarHeightRef.current = cmdBarHeight;
    try {
      localStorage.setItem(CMD_BAR_HEIGHT_KEY, String(cmdBarHeight));
    } catch {
      // ignore
    }
  }, [cmdBarHeight]);

  useEffect(() => {
    try {
      localStorage.setItem(TERM_FONT_SIZE_KEY, String(termFontSize));
      localStorage.setItem(CMD_FONT_SIZE_KEY, String(cmdFontSize));
      localStorage.setItem(TAB_BAR_HEIGHT_KEY, String(tabBarHeight));
      localStorage.setItem(TAB_BAR_FONT_SIZE_KEY, String(tabBarFontSize));
      localStorage.setItem(SKIP_BAR_HEIGHT_KEY, String(skipBarHeight));
      localStorage.setItem(SKIP_BAR_FONT_SIZE_KEY, String(skipBarFontSize));
      const preset = TERM_FONT_PRESETS.find((p) => p.value === termFontFamily);
      localStorage.setItem(TERM_FONT_FAMILY_KEY, preset?.id || 'system');
      localStorage.setItem(TERM_BG_COLOR_KEY, termBgColor);
      localStorage.setItem(TERM_FG_COLOR_KEY, termFgColor);
      localStorage.setItem(TERM_CURSOR_COLOR_KEY, termCursorColor);
      localStorage.setItem(TERM_SELECTION_BG_KEY, termSelectionBg);
      localStorage.setItem(TERM_THEME_PRESET_KEY, themePresetId);
      localStorage.setItem(TERM_ANSI_KEY, JSON.stringify(termAnsi || {}));
    } catch {
      // ignore
    }
  }, [
    termFontSize,
    termFontFamily,
    termBgColor,
    termFgColor,
    termCursorColor,
    termSelectionBg,
    themePresetId,
    termAnsi,
    cmdFontSize,
    tabBarHeight,
    tabBarFontSize,
    skipBarHeight,
    skipBarFontSize,
  ]);

  useEffect(() => {
    // Only live-apply to open terminals for the connection currently being edited
    if (!editingId) return;
    const appearance = mergeConnectionAppearance(snapshotDraftAppearance());
    applyAppearanceToConnectionTabs(editingId, appearance);
    window.setTimeout(() => {
      try {
        fitSessions();
      } catch {
        // ignore
      }
    }, 40);
  }, [
    editingId,
    termFontSize,
    termFontFamily,
    termBgColor,
    termFgColor,
    termCursorColor,
    termSelectionBg,
    termAnsi,
    fitSessions,
    snapshotDraftAppearance,
    applyAppearanceToConnectionTabs,
  ]);

  useEffect(() => {
    window.setTimeout(() => {
      try {
        fitSessions();
      } catch {
        // ignore
      }
    }, 40);
  }, [tabBarHeight, skipBarHeight, fitSessions]);

  const applyThemePreset = useCallback((presetId: string, opts?: { quiet?: boolean }) => {
    const preset = TERM_THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setThemePresetId(preset.id);
    setTermBgColor(preset.background);
    setTermFgColor(preset.foreground);
    setTermCursorColor(preset.cursor);
    setTermSelectionBg(preset.selectionBackground);
    setTermAnsi(ansiFromPreset(preset));
    if (!opts?.quiet) {
      setNotice(
        editingIdRef.current
          ? `Applied “${preset.label}” to this connection’s open terminals`
          : `Theme “${preset.label}” set for this connection (save to keep)`
      );
    }
  }, []);

  const resetAllAppearance = useCallback(() => {
    const linknest = TERM_THEME_PRESETS.find((p) => p.id === 'linknest');
    setTermFontFamily(DEFAULT_TERM_FONT_FAMILY);
    setTermFontSize(14);
    setCmdFontSize(14);
    setTabBarHeight(TAB_BAR_HEIGHT_DEFAULT);
    setTabBarFontSize(TAB_BAR_FONT_DEFAULT);
    setSkipBarHeight(SKIP_BAR_HEIGHT_DEFAULT);
    setSkipBarFontSize(SKIP_BAR_FONT_DEFAULT);
    setCmdBarHeight(CMD_BAR_DEFAULT_HEIGHT);
    cmdBarHeightRef.current = CMD_BAR_DEFAULT_HEIGHT;
    setThemePresetId('linknest');
    setTermBgColor(linknest?.background || DEFAULT_TERM_BG_COLOR);
    setTermFgColor(linknest?.foreground || DEFAULT_TERM_FG_COLOR);
    setTermCursorColor(linknest?.cursor || DEFAULT_TERM_CURSOR_COLOR);
    setTermSelectionBg(linknest?.selectionBackground || DEFAULT_TERM_SELECTION_BG);
    setTermAnsi(ansiFromPreset(linknest));
    try {
      localStorage.setItem(TERM_FONT_SIZE_KEY, '14');
      localStorage.setItem(CMD_FONT_SIZE_KEY, '14');
      localStorage.setItem(TAB_BAR_HEIGHT_KEY, String(TAB_BAR_HEIGHT_DEFAULT));
      localStorage.setItem(TAB_BAR_FONT_SIZE_KEY, String(TAB_BAR_FONT_DEFAULT));
      localStorage.setItem(SKIP_BAR_HEIGHT_KEY, String(SKIP_BAR_HEIGHT_DEFAULT));
      localStorage.setItem(SKIP_BAR_FONT_SIZE_KEY, String(SKIP_BAR_FONT_DEFAULT));
      localStorage.setItem(TERM_FONT_FAMILY_KEY, 'system');
      localStorage.setItem(CMD_BAR_HEIGHT_KEY, String(CMD_BAR_DEFAULT_HEIGHT));
      localStorage.setItem(TERM_THEME_PRESET_KEY, 'linknest');
      localStorage.setItem(TERM_BG_COLOR_KEY, linknest?.background || DEFAULT_TERM_BG_COLOR);
      localStorage.setItem(TERM_FG_COLOR_KEY, linknest?.foreground || DEFAULT_TERM_FG_COLOR);
      localStorage.setItem(TERM_CURSOR_COLOR_KEY, linknest?.cursor || DEFAULT_TERM_CURSOR_COLOR);
      localStorage.setItem(TERM_SELECTION_BG_KEY, linknest?.selectionBackground || DEFAULT_TERM_SELECTION_BG);
      localStorage.setItem(TERM_ANSI_KEY, JSON.stringify(ansiFromPreset(linknest)));
    } catch {
      // ignore
    }
    setNotice('Appearance reset to original defaults');
  }, []);

  const markThemeCustom = useCallback(() => {
    setThemePresetId('custom');
  }, []);

  const clearAllTerminals = useCallback(() => {
    broadcastToAll('clear');
  }, [broadcastToAll]);

  useEffect(() => {
    return () => {
      panelResizeCleanupRef.current?.();
      panelResizeCleanupRef.current = null;
      cmdBarResizeCleanupRef.current?.();
      cmdBarResizeCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onWinResize = () => {
      try {
        if (multiView) {
          fitSessions();
        } else {
          const id = activeTabIdRef.current;
          if (!id) return;
          sessionHandlesRef.current.get(id)?.fit?.fit();
          sendResize(id);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, [sendResize, multiView, fitSessions]);

  // Refit when panel toggles / settings / tab switch / tile mode changes layout
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        if (multiView) {
          fitSessions();
        } else {
          const id = activeTabId;
          if (!id) return;
          sessionHandlesRef.current.get(id)?.fit?.fit();
          sendResize(id);
          sessionHandlesRef.current.get(id)?.term?.focus();
        }
      } catch {
        // ignore
      }
    }, 60);
    return () => window.clearTimeout(t);
  }, [panelOpen, panelWidth, showSettings, activeTabId, isFullscreen, multiView, viewMode, cmdBarHeight, sendResize, fitSessions]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  useEffect(() => {
    if (!viewMenuOpen) return;
    const onDown = (ev: MouseEvent) => {
      const el = viewMenuRef.current;
      if (!el) return;
      if (ev.target instanceof Node && !el.contains(ev.target)) {
        setViewMenuOpen(false);
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setViewMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [viewMenuOpen]);

  const startPanelResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    panelResizeCleanupRef.current?.();
    panelResizeCleanupRef.current = null;
    setIsResizingPanel(true);

    const startX = e.clientX;
    const startWidth = panelWidthRef.current;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const next = Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, startWidth + dx));
      panelWidthRef.current = next;
      setPanelWidth(next);
    };

    const onUp = () => {
      panelResizeCleanupRef.current?.();
      panelResizeCleanupRef.current = null;
      setIsResizingPanel(false);
      try {
        localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidthRef.current));
      } catch {
        // ignore
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
    panelResizeCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
    };
  };

  const startCmdBarResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cmdBarResizeCleanupRef.current?.();
    cmdBarResizeCleanupRef.current = null;
    setIsResizingCmdBar(true);

    const startY = e.clientY;
    const startHeight = cmdBarHeightRef.current;

    const onMove = (ev: PointerEvent) => {
      // Drag up → taller bar
      const dy = startY - ev.clientY;
      const next = Math.min(CMD_BAR_MAX_HEIGHT, Math.max(CMD_BAR_MIN_HEIGHT, startHeight + dy));
      cmdBarHeightRef.current = next;
      setCmdBarHeight(next);
    };

    const onUp = () => {
      cmdBarResizeCleanupRef.current?.();
      cmdBarResizeCleanupRef.current = null;
      setIsResizingCmdBar(false);
      try {
        localStorage.setItem(CMD_BAR_HEIGHT_KEY, String(cmdBarHeightRef.current));
      } catch {
        // ignore
      }
      window.setTimeout(() => {
        try {
          fitSessions();
        } catch {
          // ignore
        }
      }, 40);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
    cmdBarResizeCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
    };
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      if (e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return;
      if (isEscapeDialogOpen()) return;
      if (document.fullscreenElement) {
        // Let the browser exit fullscreen; don't also close the widget
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      void requestClose();
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [requestClose]);

  const applyConnection = useCallback(
    (c: SavedSshConnection, autoConnect: boolean) => {
      setActiveConnectionId(c.id);
      setDraftName(c.name);
      setDraftTags(c.tags.join(', '));
      setDraftNotes(c.notes || '');
      setDraftColor(normalizeSshColor(c.color));
      setEditingId(c.id);
      const protocol = normalizeConnectionProtocol(c.protocol);
      setDraftProtocol(protocol);
      loadAppearanceIntoForm(c.appearance);

      if (protocol === 'rdp') {
        setWsUrl(c.wsUrl);
        setShowSettings(!autoConnect);
        if (!autoConnect) setSettingsPane('connection');
        setNotice(autoConnect ? `Connecting to “${c.name}”…` : `Loaded “${c.name}”`);
        if (autoConnect) {
          connectRdp({
            url: c.wsUrl,
            connectionId: c.id,
            connectionName: c.name,
          });
        }
        return;
      }

      const auto = parseAutoTargetUrl(c.wsUrl);
      if (auto) {
        setConnectMode('auto');
        setSshHost(auto.host);
        setSshPort(String(auto.port));
        setSshUsername(auto.username);
        setWsUrl(c.wsUrl);
      } else {
        setConnectMode('ws');
        setWsUrl(c.wsUrl);
      }
      setShowSettings(!autoConnect);
      if (!autoConnect) setSettingsPane('connection');
      setNotice(autoConnect ? `Connecting to “${c.name}”…` : `Loaded “${c.name}”`);
      if (autoConnect) {
        void connectTo({
          wsUrl: c.wsUrl,
          connectionId: c.id,
          connectionName: c.name,
          mode: auto ? 'auto' : 'ws',
          host: auto?.host,
          port: auto?.port,
          username: auto?.username,
        });
      }
    },
    [connectTo, connectRdp, loadAppearanceIntoForm]
  );

  // Handle open from ssh:// space links (App → pendingOpen)
  useEffect(() => {
    if (!pendingOpen?.requestId || !pendingOpen.host) return;
    if (!storageReady) return;

    const req = pendingOpen;
    onPendingOpenConsumed?.();

    const port = req.port && req.port > 0 ? req.port : 22;
    const username = (req.username || '').trim();
    const name =
      (req.connectionName || '').trim() ||
      (username ? `${username}@${req.host}${port !== 22 ? `:${port}` : ''}` : req.host);

    setConnectMode('auto');
    setSshHost(req.host);
    setSshPort(String(port));
    if (username) setSshUsername(username);
    setDraftName(name);
    setDraftProtocol('ssh');
    setEditingId(null);

    const match = connections.find((c) => {
      const a = parseAutoTargetUrl(c.wsUrl);
      if (!a) return false;
      if (a.host.toLowerCase() !== req.host.toLowerCase()) return false;
      if (a.port !== port) return false;
      if (username && a.username !== username) return false;
      return true;
    });

    const shouldConnect = req.autoConnect !== false && Boolean(username || match);
    if (match) {
      applyConnection(match, shouldConnect);
      return;
    }

    setActiveConnectionId(null);
    if (shouldConnect && username) {
      setShowSettings(false);
      setNotice(`Connecting to ${name}…`);
      void connectTo({
        mode: 'auto',
        host: req.host,
        port,
        username,
        connectionName: name,
      });
    } else {
      setShowSettings(true);
      setSettingsPane('connection');
      setNotice(
        username
          ? `Ready: ${name} — click Connect`
          : `Host ${req.host} loaded — enter username and Connect`
      );
    }
  }, [
    pendingOpen?.requestId,
    storageReady,
    connections,
    applyConnection,
    connectTo,
    onPendingOpenConsumed,
    pendingOpen,
  ]);

  const saveCurrentConnection = async () => {
    let url = '';
    let name = draftName.trim();

    if (draftProtocol === 'rdp') {
      url = wsUrl.trim();
      if (!/^https?:\/\//i.test(url)) {
        setNotice('RDP gateway URL must start with https:// or http://');
        return;
      }
      if (!name) {
        try {
          name = new URL(url).hostname || 'RDP gateway';
        } catch {
          name = 'RDP gateway';
        }
      }
    } else if (connectMode === 'auto') {
      const host = sshHost.trim();
      const username = sshUsername.trim();
      const port = Number.parseInt(sshPort, 10) || 22;
      if (!host || !username) {
        setNotice('Enter host and username before saving.');
        return;
      }
      url = buildAutoTargetUrl(username, host, port);
      if (!name) name = `${username}@${host}:${port}`;
    } else {
      url = normalizeWsUrl(wsUrl);
      if (!url || /^auto:\/\//i.test(url)) {
        setNotice('Enter a WebSocket URL before saving.');
        return;
      }
      if (!name) name = url.replace(/^wss?:\/\//i, '').split('/')[0] || 'SSH host';
    }
    const tags = parseTags(draftTags);
    const notes = draftNotes.trim() || undefined;
    const color = normalizeSshColor(draftColor);
    const protocol = draftProtocol;
    const appearance = snapshotDraftAppearance();

    setSaving(true);
    try {
      if (useServer) {
        if (editingId) {
          const updated = await sshConnectionService.update(editingId, {
            name,
            wsUrl: url,
            tags,
            notes: notes || '',
            color,
            protocol,
            appearance,
          });
          setConnections((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
          setActiveConnectionId(editingId);
          setNotice(`Updated “${name}”`);
        } else {
          const created = await sshConnectionService.create({
            name,
            wsUrl: url,
            tags,
            notes,
            color,
            protocol,
            appearance,
          });
          setConnections((prev) => [created, ...prev]);
          setActiveConnectionId(created.id);
          setEditingId(created.id);
          setNotice(`Saved “${name}”`);
        }
      } else if (editingId) {
        updateConnectionsLocal(
          connections.map((c) =>
            c.id === editingId
              ? {
                  ...c,
                  name,
                  wsUrl: url,
                  protocol,
                  tags,
                  notes,
                  color,
                  appearance,
                }
              : c
          )
        );
        setActiveConnectionId(editingId);
        setNotice(`Updated “${name}”`);
      } else {
        const created: SavedSshConnection = {
          id: newId(),
          name,
          wsUrl: url,
          protocol,
          tags,
          notes,
          color,
          appearance,
          createdAt: Date.now(),
        };
        updateConnectionsLocal([created, ...connections]);
        setActiveConnectionId(created.id);
        setEditingId(created.id);
        setNotice(`Saved “${name}”`);
      }
      setWsUrl(url);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to save connection');
    } finally {
      setSaving(false);
    }
  };

  const startNewDraft = () => {
    setEditingId(null);
    setActiveConnectionId(null);
    setDraftName('');
    setDraftTags('');
    setDraftNotes('');
    setDraftProtocol('ssh');
    setDraftColor(SSH_CONNECTION_COLORS[Math.floor(Math.random() * SSH_CONNECTION_COLORS.length)]);
    loadAppearanceIntoForm(defaultConnectionAppearance());
    setShowSettings(true);
    setSettingsPane('connection');
    setNotice('New connection — fill URL, name, tags, then Save.');
  };

  const exportConnectionsJson = () => {
    const payload = {
      version: 1,
      type: 'linknest-ssh-connections',
      exportedAt: new Date().toISOString(),
      connections: connections.map(({ id, name, wsUrl: u, protocol, tags, notes, color, appearance, createdAt, lastUsedAt }) => ({
        id,
        name,
        wsUrl: u,
        protocol: normalizeConnectionProtocol(protocol),
        tags,
        notes,
        color: normalizeSshColor(color),
        appearance: normalizeSshAppearance(appearance) || undefined,
        createdAt,
        lastUsedAt,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linknest-ssh-connections-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setNotice(`Exported ${connections.length} connection${connections.length === 1 ? '' : 's'}`);
  };

  const importConnectionsJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.connections)
          ? parsed.connections
          : null;
      if (!list) {
        setNotice('Invalid JSON: expected { connections: [...] } or an array.');
        return;
      }

      const incoming: SavedSshConnection[] = [];
      for (const item of list) {
        if (!item || typeof item.wsUrl !== 'string') continue;
        const protocol = normalizeConnectionProtocol(item.protocol);
        const urlRaw = String(item.wsUrl).trim();
        const url =
          protocol === 'rdp'
            ? urlRaw
            : normalizeWsUrl(urlRaw);
        if (!url) continue;
        if (protocol === 'rdp' && !/^https?:\/\//i.test(url)) continue;
        incoming.push({
          id: typeof item.id === 'string' && item.id ? item.id : newId(),
          name:
            typeof item.name === 'string' && item.name.trim()
              ? item.name.trim()
              : protocol === 'rdp'
                ? (() => {
                    try {
                      return new URL(url).hostname || 'RDP gateway';
                    } catch {
                      return 'RDP gateway';
                    }
                  })()
                : url.replace(/^wss?:\/\//i, '').split('/')[0] || 'SSH host',
          wsUrl: url,
          protocol,
          tags: Array.isArray(item.tags) ? parseTags(item.tags.join(',')) : parseTags(String(item.tags || '')),
          notes: typeof item.notes === 'string' && item.notes.trim() ? item.notes.trim() : undefined,
          color: normalizeSshColor(item.color),
          appearance: normalizeSshAppearance(item.appearance),
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          lastUsedAt: typeof item.lastUsedAt === 'number' ? item.lastUsedAt : undefined,
        });
      }

      if (incoming.length === 0) {
        setNotice('No valid connections found in that file.');
        return;
      }

      if (useServer) {
        const merged = await sshConnectionService.bulkUpsert(incoming);
        setConnections(merged);
        setNotice(`Imported / merged ${incoming.length} connection(s)`);
        return;
      }

      const byKey = new Map<string, SavedSshConnection>();
      connections.forEach((c) => byKey.set(`${c.name}||${c.wsUrl}`, c));
      let added = 0;
      let updated = 0;
      for (const item of incoming) {
        const key = `${item.name}||${item.wsUrl}`;
        const existing = byKey.get(key) || byKey.get(`||${item.wsUrl}`);
        // Prefer exact name+url; also merge duplicates by wsUrl alone
        const urlOnly = Array.from(byKey.values()).find((c) => c.wsUrl === item.wsUrl);
        if (urlOnly) {
          byKey.delete(`${urlOnly.name}||${urlOnly.wsUrl}`);
          byKey.set(key, {
            ...urlOnly,
            name: item.name,
            tags: item.tags,
            notes: item.notes,
            color: normalizeSshColor(item.color || urlOnly.color),
            appearance: item.appearance || urlOnly.appearance,
            lastUsedAt: item.lastUsedAt || urlOnly.lastUsedAt,
          });
          updated += 1;
        } else if (existing) {
          byKey.set(key, {
            ...existing,
            tags: item.tags,
            notes: item.notes,
            color: normalizeSshColor(item.color || existing.color),
            appearance: item.appearance || existing.appearance,
            lastUsedAt: item.lastUsedAt || existing.lastUsedAt,
          });
          updated += 1;
        } else {
          byKey.set(key, { ...item, id: newId(), color: normalizeSshColor(item.color) });
          added += 1;
        }
      }
      updateConnectionsLocal(Array.from(byKey.values()));
      setNotice(`Imported ${added} new, updated ${updated}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to import JSON');
    }
  };

  const liveTabsForConnection = useCallback(
    (connectionId: string) =>
      tabs.filter(
        (t) =>
          t.connectionId === connectionId &&
          (t.status === 'connected' || t.status === 'connecting')
      ),
    [tabs]
  );

  const tabsForConnection = useCallback(
    (connectionId: string) => tabs.filter((t) => t.connectionId === connectionId),
    [tabs]
  );

  const disconnectConnectionSessions = useCallback(
    async (connectionId: string) => {
      const ids = tabs
        .filter((t) => t.connectionId === connectionId)
        .map((t) => t.id);
      for (const tabId of ids) {
        await closeTab(tabId);
      }
      if (ids.length) {
        setNotice(
          ids.length === 1
            ? 'Disconnected session for this host'
            : `Disconnected ${ids.length} sessions for this host`
        );
      }
    },
    [tabs, closeTab]
  );

  const deleteConnection = async (id: string) => {
    const target = connections.find((c) => c.id === id);
    if (!target) return;

    const live = liveTabsForConnection(id);
    const related = tabsForConnection(id);
    if (live.length > 0) {
      const ok = window.confirm(
        `“${target.name}” has ${live.length} live terminal session${live.length === 1 ? '' : 's'}.\n\nDisconnect and delete this saved connection?`
      );
      if (!ok) return;
      await disconnectConnectionSessions(id);
    } else if (related.length > 0) {
      const ok = window.confirm(
        `“${target.name}” has ${related.length} open tab${related.length === 1 ? '' : 's'} (not connected).\n\nClose those tabs and delete this saved connection?`
      );
      if (!ok) return;
      await disconnectConnectionSessions(id);
    } else if (!window.confirm(`Delete saved connection “${target.name}”?`)) {
      return;
    }

    try {
      if (useServer) {
        await sshConnectionService.remove(id);
      }
      const next = connections.filter((c) => c.id !== id);
      if (useServer) {
        setConnections(next);
      } else {
        updateConnectionsLocal(next);
      }
      if (editingId === id) {
        setEditingId(null);
        setDraftName('');
        setDraftTags('');
        setDraftNotes('');
        setDraftColor(SSH_CONNECTION_COLORS[0]);
      }
      if (activeConnectionId === id) setActiveConnectionId(null);
      setNotice(`Deleted “${target.name}”`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to delete connection');
    }
  };

  const statusColor =
    status === 'connected'
      ? 'text-emerald-600 dark:text-emerald-400'
      : status === 'connecting'
        ? 'text-amber-600 dark:text-amber-400'
        : status === 'error'
          ? 'text-red-600 dark:text-red-400'
          : 'text-slate-500 dark:text-slate-400';

  return (
    <div
      ref={widgetRootRef}
      className={`w-full h-full flex flex-col bg-white dark:bg-slate-800 overflow-hidden ${
        isFullscreen
          ? 'rounded-none border-0 shadow-none'
          : 'rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 shrink-0 bg-slate-50 dark:bg-slate-900/40">
        <div className="min-w-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-300 shrink-0"
            title={panelOpen ? 'Hide saved connections' : 'Show saved connections'}
            aria-label="Toggle connections panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              {panelOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 4.5l-7.5 7.5 7.5 7.5" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 4.5l7.5 7.5-7.5 7.5" />
              )}
            </svg>
          </button>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">SSH / RDP</h3>
            <p className={`text-[11px] truncate ${statusColor}`}>{statusMessage}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="relative" ref={viewMenuRef}>
            <button
              type="button"
              onClick={() => setViewMenuOpen((v) => !v)}
              disabled={tabs.length === 0}
              className={`p-1.5 rounded-md border transition-colors disabled:opacity-40 ${
                multiView
                  ? 'border-sky-500 bg-sky-600 text-white hover:bg-sky-500'
                  : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              title="Terminal layout views"
              aria-label="Terminal layout views"
              aria-haspopup="menu"
              aria-expanded={viewMenuOpen}
            >
              {viewMode === 'stack-v' ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5M3.75 12h16.5m-16.5 6.75h16.5" />
                </svg>
              ) : viewMode === 'stack-h' ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 3.75v16.5M12 3.75v16.5m6.75-16.5v16.5" />
                </svg>
              ) : viewMode === 'grid' ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 018.25 20.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 4.5h13.5A1.75 1.75 0 0120.5 6.25v11.5A1.75 1.75 0 0118.75 19.5H5.25A1.75 1.75 0 013.5 17.75V6.25A1.75 1.75 0 015.25 4.5z" />
                </svg>
              )}
            </button>
            {viewMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-40 w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-1 overflow-hidden"
              >
                {VIEW_MODE_OPTIONS.map((opt) => {
                  const active = viewMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        setViewMode(opt.id);
                        setViewMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                        active
                          ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                      }`}
                    >
                      <span className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400">
                        {opt.id === 'single' && (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 4.5h13.5A1.75 1.75 0 0120.5 6.25v11.5A1.75 1.75 0 0118.75 19.5H5.25A1.75 1.75 0 013.5 17.75V6.25A1.75 1.75 0 015.25 4.5z" />
                          </svg>
                        )}
                        {opt.id === 'grid' && (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 018.25 20.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
                          </svg>
                        )}
                        {opt.id === 'stack-v' && (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5M3.75 12h16.5m-16.5 6.75h16.5" />
                          </svg>
                        )}
                        {opt.id === 'stack-h' && (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 3.75v16.5M12 3.75v16.5m6.75-16.5v16.5" />
                          </svg>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12px] font-semibold">{opt.label}</span>
                        <span className="block text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                          {opt.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className={`p-1.5 rounded-md border transition-colors ${
              isFullscreen
                ? 'border-orange-400 bg-orange-500 text-white hover:bg-orange-600'
                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen (panel + tabs + terminal)'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
          {!isFullscreen && (
            <button
              type="button"
              onClick={() => void requestClose()}
              className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              title="Close"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {panelOpen && (
          <aside
            className={`relative shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col min-h-0 ${
              isResizingPanel ? 'select-none' : ''
            }`}
            style={{ width: panelWidth }}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize saved connections panel"
              title="Drag to resize"
              onPointerDown={startPanelResize}
              className={`absolute top-0 right-0 z-20 h-full w-1.5 -mr-0.5 cursor-col-resize group ${
                isResizingPanel ? 'bg-brand-500/50' : 'bg-transparent hover:bg-brand-400/40'
              }`}
            >
              <span className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 w-1 h-8 rounded-full bg-slate-300 dark:bg-slate-600 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            </div>
            <div className="p-2 border-b border-slate-200 dark:border-slate-700 space-y-2 shrink-0">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Saved{useServer ? ' · cloud' : ' · local'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={startNewDraft}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                  title="New connection draft"
                  aria-label="New connection draft"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={exportConnectionsJson}
                  disabled={connections.length === 0}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40"
                  title="Export connections as JSON"
                  aria-label="Export connections as JSON"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                  title="Import connections from JSON"
                  aria-label="Import connections from JSON"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void importConnectionsJson(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (draftProtocol === 'rdp') connectRdp();
                    else void connect();
                  }}
                  disabled={tabs.length >= maxSshTabs}
                  className="px-2 py-1 text-[10px] font-semibold rounded-md bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
                  title={tabs.length >= maxSshTabs ? `Maximum ${maxSshTabs} sessions` : 'Open a new session tab'}
                >
                  {status === 'connected' || status === 'connecting' ? 'New tab' : 'Connect'}
                </button>
              </div>
              <input
                type="search"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter name, URL, tag…"
                className="w-full h-7 px-2 text-[11px] rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              />
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => setFilterTag(null)}
                    className={`px-1.5 py-0.5 text-[10px] rounded-full border ${
                      !filterTag
                        ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900'
                        : 'border-slate-200 dark:border-slate-600 text-slate-500'
                    }`}
                  >
                    All
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setFilterTag((t) => (t === tag ? null : tag))}
                      className={`px-1.5 py-0.5 text-[10px] rounded-full border ${
                        filterTag === tag
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'border-slate-200 dark:border-slate-600 text-slate-500 hover:border-brand-400'
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1">
              {!storageReady ? (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1.5 py-3 text-center">Loading…</p>
              ) : filteredConnections.length === 0 ? (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 px-1.5 py-3 text-center leading-relaxed">
                  No saved connections yet. Open Settings on a host after creating one with <strong>+</strong>, then click <strong>Save</strong> in the form.
                </p>
              ) : (
                filteredConnections.map((c) => {
                  const active = activeConnectionId === c.id;
                  const liveTabs = liveTabsForConnection(c.id);
                  const isLive = liveTabs.length > 0;
                  const color = normalizeSshColor(c.color);
                  return (
                    <div
                      key={c.id}
                      className={`rounded-lg border overflow-hidden transition-colors ${
                        active
                          ? 'border-brand-400 bg-brand-50/80 dark:bg-brand-900/20 dark:border-brand-600'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                    >
                      <div className="flex min-w-0">
                        <div className="w-1.5 shrink-0 self-stretch" style={{ backgroundColor: color }} title={color} />
                        <div className="flex-1 min-w-0 p-2">
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => applyConnection(c, false)}
                            title={`Edit ${c.name}`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{c.name}</p>
                              <span
                                className={`shrink-0 px-1 py-0 rounded text-[9px] font-semibold uppercase tracking-wide ${
                                  normalizeConnectionProtocol(c.protocol) === 'rdp'
                                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                                    : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                }`}
                              >
                                {normalizeConnectionProtocol(c.protocol) === 'rdp' ? 'RDP' : 'SSH'}
                              </span>
                              {isLive && (
                                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  live{liveTabs.length > 1 ? ` · ${liveTabs.length}` : ''}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                              {(() => {
                                const a = parseAutoTargetUrl(c.wsUrl);
                                return a ? `${a.username}@${a.host}:${a.port}` : c.wsUrl;
                              })()}
                            </p>
                            {c.tags.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 mt-1">
                                {c.tags.map((t) => (
                                  <span
                                    key={t}
                                    className="px-1 py-0 text-[9px] rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300"
                                  >
                                    #{t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>

                          <div className="flex items-center gap-1 mt-2">
                            <button
                              type="button"
                              onClick={() => applyConnection(c, true)}
                              disabled={tabs.length >= maxSshTabs}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40"
                              title={
                                tabs.length >= maxSshTabs
                                  ? `Maximum ${maxSshTabs} sessions`
                                  : `Connect to ${c.name}`
                              }
                              aria-label={`Connect to ${c.name}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => void disconnectConnectionSessions(c.id)}
                              disabled={!isLive && tabsForConnection(c.id).length === 0}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-35 disabled:cursor-not-allowed"
                              title={
                                isLive
                                  ? `Disconnect live session${liveTabs.length === 1 ? '' : 's'} for ${c.name}`
                                  : `No open session for ${c.name}`
                              }
                              aria-label={`Disconnect ${c.name}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l6 6M15 9l-6 6" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => applyConnection(c, false)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                              title={`Edit ${c.name}`}
                              aria-label={`Edit ${c.name}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.875 4.5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteConnection(c.id)}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                              title={`Delete ${c.name}`}
                              aria-label={`Delete ${c.name}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => applyConnection(c, false)}
                              className={`ml-auto inline-flex items-center justify-center h-7 w-7 rounded-md border transition-colors ${
                                showSettings && activeConnectionId === c.id
                                  ? 'bg-orange-500 border-orange-600 text-white shadow-sm shadow-orange-500/30'
                                  : 'border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/40'
                              }`}
                              title={`Settings for ${c.name}`}
                              aria-label={`Settings for ${c.name}`}
                              aria-pressed={showSettings && activeConnectionId === c.id}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {showSettings && (
            <div className="shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col max-h-[58%] min-h-0">
              {/* Sticky top actions */}
              <div className="sticky top-0 z-20 flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {editingId ? 'Update connection' : 'New connection'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {draftName.trim() || (draftProtocol === 'rdp' ? 'RDP gateway' : 'SSH host')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void saveCurrentConnection()}
                    disabled={saving}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 shadow-sm"
                    title={editingId ? 'Update saved connection' : 'Save connection'}
                  >
                    {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                    title="Close settings"
                    aria-label="Close settings"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Pane switcher */}
              <div className="px-3 pt-2 pb-1 flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setSettingsPane('connection')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
                    settingsPane === 'connection'
                      ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  Connection
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsPane('appearance')}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
                    settingsPane === 'appearance'
                      ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200'
                      : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  Appearance
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-3">
                {settingsPane === 'appearance' ? (
                  <div className="space-y-3">
                    <section className="rounded-lg border border-sky-200 dark:border-sky-800/60 bg-sky-50/70 dark:bg-sky-950/30 p-2.5 space-y-2">
                      <div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                          Global UI bars
                        </h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Applies to all sessions — tab strip and multi-view Skip bars
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          Tab bar height
                          <div className="mt-1 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setTabBarHeight((n) => Math.max(TAB_BAR_HEIGHT_MIN, n - 2))
                              }
                              className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Shorter tab bar"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={TAB_BAR_HEIGHT_MIN}
                              max={TAB_BAR_HEIGHT_MAX}
                              value={tabBarHeight}
                              onChange={(e) => {
                                const n = Number.parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) return;
                                setTabBarHeight(
                                  Math.min(TAB_BAR_HEIGHT_MAX, Math.max(TAB_BAR_HEIGHT_MIN, n))
                                );
                              }}
                              className="w-14 h-8 px-1 text-center text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setTabBarHeight((n) => Math.min(TAB_BAR_HEIGHT_MAX, n + 2))
                              }
                              className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Taller tab bar"
                            >
                              +
                            </button>
                          </div>
                        </label>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          Tab bar font
                          <div className="mt-1 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setTabBarFontSize((n) => Math.max(TAB_BAR_FONT_MIN, n - 1))
                              }
                              className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Smaller tab font"
                            >
                              A−
                            </button>
                            <input
                              type="number"
                              min={TAB_BAR_FONT_MIN}
                              max={TAB_BAR_FONT_MAX}
                              value={tabBarFontSize}
                              onChange={(e) => {
                                const n = Number.parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) return;
                                setTabBarFontSize(
                                  Math.min(TAB_BAR_FONT_MAX, Math.max(TAB_BAR_FONT_MIN, n))
                                );
                              }}
                              className="w-14 h-8 px-1 text-center text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setTabBarFontSize((n) => Math.min(TAB_BAR_FONT_MAX, n + 1))
                              }
                              className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Larger tab font"
                            >
                              A+
                            </button>
                          </div>
                        </label>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          Skip bar height
                          <div className="mt-1 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setSkipBarHeight((n) => Math.max(SKIP_BAR_HEIGHT_MIN, n - 2))
                              }
                              className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Shorter skip bar"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={SKIP_BAR_HEIGHT_MIN}
                              max={SKIP_BAR_HEIGHT_MAX}
                              value={skipBarHeight}
                              onChange={(e) => {
                                const n = Number.parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) return;
                                setSkipBarHeight(
                                  Math.min(SKIP_BAR_HEIGHT_MAX, Math.max(SKIP_BAR_HEIGHT_MIN, n))
                                );
                              }}
                              className="w-14 h-8 px-1 text-center text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setSkipBarHeight((n) => Math.min(SKIP_BAR_HEIGHT_MAX, n + 2))
                              }
                              className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Taller skip bar"
                            >
                              +
                            </button>
                          </div>
                        </label>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          Skip bar font
                          <div className="mt-1 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setSkipBarFontSize((n) => Math.max(SKIP_BAR_FONT_MIN, n - 1))
                              }
                              className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Smaller skip bar font"
                            >
                              A−
                            </button>
                            <input
                              type="number"
                              min={SKIP_BAR_FONT_MIN}
                              max={SKIP_BAR_FONT_MAX}
                              value={skipBarFontSize}
                              onChange={(e) => {
                                const n = Number.parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) return;
                                setSkipBarFontSize(
                                  Math.min(SKIP_BAR_FONT_MAX, Math.max(SKIP_BAR_FONT_MIN, n))
                                );
                              }}
                              className="w-14 h-8 px-1 text-center text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setSkipBarFontSize((n) => Math.min(SKIP_BAR_FONT_MAX, n + 1))
                              }
                              className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Larger skip bar font"
                            >
                              A+
                            </button>
                          </div>
                        </label>
                      </div>
                      <p
                        className="truncate rounded border border-slate-200 dark:border-slate-700 px-2 py-1 bg-slate-900 text-slate-100"
                        style={{ fontSize: tabBarFontSize, minHeight: Math.min(tabBarHeight, 40) }}
                      >
                        Preview tab: user@host<span className="text-sky-300 font-semibold"> [prod]</span>
                      </p>
                    </section>

                    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/60 px-2.5 py-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                          {editingId ? 'Connection appearance' : 'Appearance defaults'}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {editingId
                            ? 'Applies only to this connection’s open terminals'
                            : 'Saved with the connection — does not change other hosts'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => resetAllAppearance()}
                        className="shrink-0 px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                        title="Reset all appearance settings to original defaults"
                      >
                        Reset all
                      </button>
                    </div>
                    <section className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Theme presets
                        </h4>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {themePresetId === 'custom'
                            ? 'Custom'
                            : TERM_THEME_PRESETS.find((p) => p.id === themePresetId)?.label || 'LinkNest'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-0.5">
                        {TERM_THEME_PRESETS.map((preset) => {
                          const active = themePresetId === preset.id;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => applyThemePreset(preset.id)}
                              className={`text-left rounded-md border px-1.5 py-1 transition-colors ${
                                active
                                  ? 'border-sky-500 ring-1 ring-sky-400/50'
                                  : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                              }`}
                              title={`Apply ${preset.label} (this connection only)`}
                            >
                              <span
                                className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px] font-mono truncate"
                                style={{
                                  backgroundColor: preset.background,
                                  color: preset.foreground,
                                  border: `1px solid ${preset.selectionBackground}`,
                                }}
                              >
                                <span
                                  className="w-1.5 h-3 rounded-sm shrink-0"
                                  style={{ backgroundColor: preset.cursor }}
                                  aria-hidden
                                />
                                {preset.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Applies live to this connection’s open terminals only — click Update to save.
                      </p>
                    </section>

                    <section className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 p-2.5 space-y-2">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Font
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          Family
                          <select
                            value={TERM_FONT_PRESETS.find((p) => p.value === termFontFamily)?.id || 'system'}
                            onChange={(e) => {
                              const preset = TERM_FONT_PRESETS.find((p) => p.id === e.target.value);
                              setTermFontFamily(preset?.value || DEFAULT_TERM_FONT_FAMILY);
                            }}
                            className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                            style={{ fontFamily: termFontFamily }}
                          >
                            {TERM_FONT_GROUPS.map((group) => (
                              <optgroup key={group} label={group}>
                                {TERM_FONT_PRESETS.filter((p) => p.group === group).map((p) => (
                                  <option key={p.id} value={p.id} style={{ fontFamily: p.value }}>
                                    {p.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </label>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          Terminal size
                          <div className="mt-1 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setTermFontSize((n) => Math.max(TERM_FONT_SIZE_MIN, n - 1))}
                              className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Smaller terminal font"
                            >
                              A−
                            </button>
                            <input
                              type="number"
                              min={TERM_FONT_SIZE_MIN}
                              max={TERM_FONT_SIZE_MAX}
                              value={termFontSize}
                              onChange={(e) => {
                                const n = Number.parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) return;
                                setTermFontSize(Math.min(TERM_FONT_SIZE_MAX, Math.max(TERM_FONT_SIZE_MIN, n)));
                              }}
                              className="w-14 h-8 px-1 text-center text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900"
                            />
                            <button
                              type="button"
                              onClick={() => setTermFontSize((n) => Math.min(TERM_FONT_SIZE_MAX, n + 1))}
                              className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Larger terminal font"
                            >
                              A+
                            </button>
                          </div>
                        </label>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">
                          Command bar size
                          <div className="mt-1 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setCmdFontSize((n) => Math.max(CMD_FONT_SIZE_MIN, n - 1))}
                              className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Smaller command font"
                            >
                              A−
                            </button>
                            <input
                              type="number"
                              min={CMD_FONT_SIZE_MIN}
                              max={CMD_FONT_SIZE_MAX}
                              value={cmdFontSize}
                              onChange={(e) => {
                                const n = Number.parseInt(e.target.value, 10);
                                if (!Number.isFinite(n)) return;
                                setCmdFontSize(Math.min(CMD_FONT_SIZE_MAX, Math.max(CMD_FONT_SIZE_MIN, n)));
                              }}
                              className="w-14 h-8 px-1 text-center text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900"
                            />
                            <button
                              type="button"
                              onClick={() => setCmdFontSize((n) => Math.min(CMD_FONT_SIZE_MAX, n + 1))}
                              className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Larger command font"
                            >
                              A+
                            </button>
                            <span
                              className="ml-2 text-[10px] truncate px-2 py-1 rounded border border-slate-200 dark:border-slate-700"
                              style={{
                                fontFamily: termFontFamily,
                                fontSize: cmdFontSize,
                                backgroundColor: termBgColor,
                                color: termFgColor,
                              }}
                            >
                              Aa Bb 123
                            </span>
                          </div>
                        </label>
                      </div>
                      <span
                        className="block text-[11px] truncate px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700"
                        style={{
                          fontFamily: termFontFamily,
                          backgroundColor: termBgColor,
                          color: termFgColor,
                        }}
                      >
                        The quick brown fox — Aa Bb 123
                      </span>
                    </section>

                    <section className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Colors
                        </h4>
                        <button
                          type="button"
                          onClick={() => applyThemePreset('linknest')}
                          className="h-7 px-2 text-[10px] rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Reset colors to LinkNest theme only"
                        >
                          Reset colors
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          Background
                          <div className="mt-1 flex items-center gap-1.5">
                            <input
                              type="color"
                              value={normalizeHexColor(termBgColor, DEFAULT_TERM_BG_COLOR)}
                              onChange={(e) => {
                                markThemeCustom();
                                setTermBgColor(normalizeHexColor(e.target.value, DEFAULT_TERM_BG_COLOR));
                              }}
                              className="h-8 w-10 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 cursor-pointer p-0.5"
                              title="Terminal background color"
                            />
                            <input
                              type="text"
                              value={termBgColor}
                              onChange={(e) => {
                                const next = e.target.value.trim();
                                if (/^#[0-9a-fA-F]{0,6}$/.test(next)) {
                                  markThemeCustom();
                                  setTermBgColor(next.toLowerCase());
                                }
                              }}
                              onBlur={() =>
                                setTermBgColor(normalizeHexColor(termBgColor, DEFAULT_TERM_BG_COLOR))
                              }
                              className="flex-1 min-w-0 h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono"
                              spellCheck={false}
                            />
                          </div>
                        </label>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          Foreground
                          <div className="mt-1 flex items-center gap-1.5">
                            <input
                              type="color"
                              value={normalizeHexColor(termFgColor, DEFAULT_TERM_FG_COLOR)}
                              onChange={(e) => {
                                markThemeCustom();
                                setTermFgColor(normalizeHexColor(e.target.value, DEFAULT_TERM_FG_COLOR));
                              }}
                              className="h-8 w-10 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 cursor-pointer p-0.5"
                              title="Terminal foreground color"
                            />
                            <input
                              type="text"
                              value={termFgColor}
                              onChange={(e) => {
                                const next = e.target.value.trim();
                                if (/^#[0-9a-fA-F]{0,6}$/.test(next)) {
                                  markThemeCustom();
                                  setTermFgColor(next.toLowerCase());
                                }
                              }}
                              onBlur={() =>
                                setTermFgColor(normalizeHexColor(termFgColor, DEFAULT_TERM_FG_COLOR))
                              }
                              className="flex-1 min-w-0 h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono"
                              spellCheck={false}
                            />
                          </div>
                        </label>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Drag the multi-command bar’s top edge to resize height. Appearance changes apply only to the connection you are editing.
                      </p>
                    </section>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <section className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 p-2.5 space-y-2">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Type &amp; mode
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setDraftProtocol('ssh')}
                          className={`px-2.5 py-1 text-[11px] rounded-md border ${
                            draftProtocol === 'ssh'
                              ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900'
                              : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          SSH
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraftProtocol('rdp')}
                          className={`px-2.5 py-1 text-[11px] rounded-md border ${
                            draftProtocol === 'rdp'
                              ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900'
                              : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          RDP
                        </button>
                        {draftProtocol === 'ssh' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setConnectMode('auto')}
                              className={`px-2.5 py-1 text-[11px] rounded-md border ${
                                connectMode === 'auto'
                                  ? 'bg-brand-600 text-white border-brand-600'
                                  : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              Easy (host / port)
                            </button>
                            <button
                              type="button"
                              onClick={() => setConnectMode('ws')}
                              className={`px-2.5 py-1 text-[11px] rounded-md border ${
                                connectMode === 'ws'
                                  ? 'bg-brand-600 text-white border-brand-600'
                                  : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              Advanced (WebSocket)
                            </button>
                          </>
                        )}
                      </div>
                    </section>

                    <section className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 p-2.5 space-y-2">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Details
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          Name
                          <input
                            type="text"
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            placeholder="Prod bastion"
                            className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          />
                        </label>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          Tags (comma-separated)
                          <input
                            type="text"
                            value={draftTags}
                            onChange={(e) => setDraftTags(e.target.value)}
                            placeholder="prod, bastion, linux"
                            className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          />
                        </label>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Color</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {SSH_CONNECTION_COLORS.map((hex) => {
                            const selected = normalizeSshColor(draftColor) === hex;
                            return (
                              <button
                                key={hex}
                                type="button"
                                onClick={() => setDraftColor(hex)}
                                className={`h-6 w-6 rounded-full border-2 transition-transform ${
                                  selected
                                    ? 'border-slate-900 dark:border-white scale-110 ring-2 ring-offset-1 ring-slate-400 dark:ring-offset-slate-800'
                                    : 'border-white dark:border-slate-700 shadow-sm hover:scale-105'
                                }`}
                                style={{ backgroundColor: hex }}
                                title={hex}
                                aria-label={`Color ${hex}`}
                                aria-pressed={selected}
                              />
                            );
                          })}
                        </div>
                      </div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        Notes (optional)
                        <input
                          type="text"
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                          placeholder="Jump host via VPN"
                          className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        />
                      </label>
                    </section>

                    <section className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 p-2.5 space-y-2">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Target
                      </h4>
                      {draftProtocol === 'rdp' ? (
                        <div className="space-y-2">
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                            RDP gateway URL
                            <input
                              type="url"
                              value={wsUrl}
                              onChange={(e) => setWsUrl(e.target.value)}
                              placeholder="https://guac.example.com/"
                              className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                              spellCheck={false}
                              autoComplete="off"
                            />
                          </label>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                            Embeds your Guacamole / web RDP page in a session tab. Passwords stay in the gateway — {brandName} never stores them.
                          </p>
                        </div>
                      ) : connectMode === 'auto' ? (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">
                              Host
                              <input
                                type="text"
                                value={sshHost}
                                onChange={(e) => setSshHost(e.target.value)}
                                placeholder="pam.example.com"
                                className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                                spellCheck={false}
                                autoComplete="off"
                              />
                            </label>
                            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                              Port
                              <input
                                type="number"
                                min={1}
                                max={65535}
                                value={sshPort}
                                onChange={(e) => setSshPort(e.target.value)}
                                placeholder="22"
                                className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                              />
                            </label>
                          </div>
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                            Username
                            <input
                              type="text"
                              value={sshUsername}
                              onChange={(e) => setSshUsername(e.target.value)}
                              placeholder="user or domain\user+target…"
                              title="Supports PAM / privileged-access usernames (\, +, custom ports)."
                              className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                              spellCheck={false}
                              autoComplete="off"
                            />
                          </label>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                            PAM-friendly: long usernames with `\`, `+`, and non-22 ports (e.g. 4489) are passed verbatim to SSH.
                          </p>
                          <div className="rounded-md border border-slate-200 dark:border-slate-600 p-2 space-y-2 bg-white/70 dark:bg-slate-950/30">
                            <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">Session type (via ttyd)</p>
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => setX11Forward(false)}
                                className={`px-2 py-1 text-[11px] rounded-md border ${
                                  !x11Forward
                                    ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900'
                                    : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                Terminal only
                              </button>
                              <button
                                type="button"
                                onClick={() => setX11Forward(true)}
                                className={`px-2 py-1 text-[11px] rounded-md border ${
                                  x11Forward
                                    ? 'bg-brand-600 text-white border-brand-600'
                                    : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                Terminal + GUI (X11)
                              </button>
                            </div>
                            {x11Forward && (
                              <div className="text-[10px] text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
                                <p className="font-medium text-slate-700 dark:text-slate-200">
                                  GUI setup ({brandName} starts ttyd with <code className="font-mono">ssh -Y</code>):
                                </p>
                                <ol className="list-decimal list-inside space-y-0.5 ml-0.5">
                                  <li>
                                    Install{' '}
                                    <a
                                      href="https://sourceforge.net/projects/vcxsrv/"
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-brand-600 dark:text-brand-400 underline"
                                    >
                                      VcXsrv
                                    </a>{' '}
                                    (or X410) on this Windows PC
                                  </li>
                                  <li>
                                    Start XLaunch → Multiple windows → Start no client → enable{' '}
                                    <strong>Disable access control</strong> → finish
                                  </li>
                                  <li>
                                    Docker: DISPLAY <code className="font-mono">host.docker.internal:0.0</code>. Local XAMPP:{' '}
                                    <code className="font-mono">127.0.0.1:0.0</code>.
                                  </li>
                                  <li>
                                    On Linux: <code className="font-mono">X11Forwarding yes</code> in sshd, restart sshd
                                  </li>
                                  <li>
                                    Connect, then run e.g. <code className="font-mono">xclock</code>
                                  </li>
                                </ol>
                                <p
                                  className={
                                    guiDisplayReady
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-amber-600 dark:text-amber-400'
                                  }
                                >
                                  {guiDisplayReady === true
                                    ? 'X server detected — GUI forwarding is ready.'
                                    : guiDisplayReady === false
                                      ? guiHint || 'X server not detected yet — start VcXsrv, then Connect.'
                                      : 'Checking X server…'}
                                </p>
                              </div>
                            )}
                          </div>
                          {!useServer && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400">
                              Sign in to use Easy mode (server starts ttyd). Guests can use Advanced WebSocket URL mode.
                            </p>
                          )}
                          {useServer && gatewayAvailable === false && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400">
                              {gatewayHint || (
                                <>
                                  ttyd was not found on this server. Deploy{' '}
                                  <code className="font-mono">bin/ttyd.exe</code> with the package, or install with{' '}
                                  <code className="font-mono">winget install tsl0922.ttyd --source winget</code> then set
                                  Admin → Add-ons → SSH Gateway.
                                </>
                              )}
                            </p>
                          )}
                        </>
                      ) : (
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          WebSocket URL (manual ttyd)
                          <input
                            type="text"
                            value={wsUrl}
                            onChange={(e) => setWsUrl(e.target.value)}
                            placeholder="ws://localhost:7681/ws"
                            className="mt-1 w-full h-8 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                            spellCheck={false}
                            autoComplete="off"
                          />
                        </label>
                      )}
                    </section>

                    <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed px-0.5">
                      {draftProtocol === 'rdp' ? (
                        <>
                          Save an https:// Guacamole (or similar) URL, then Connect to embed it. Passwords stay in the gateway.
                          {useServer ? ' Saved connections sync to your account.' : ' Guest saves stay in this browser.'}
                        </>
                      ) : (
                        <>
                          Use <strong>Update</strong> / <strong>Save</strong> to keep this connection. Passwords are never saved.
                          {useServer ? ' Saved connections sync to your account.' : ' Guest saves stay in this browser.'}
                        </>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Sticky bottom actions */}
              <div className="sticky bottom-0 z-20 flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 min-w-0 truncate">
                  {settingsPane === 'appearance'
                    ? editingId
                      ? 'Appearance applies only to this connection’s open terminals'
                      : 'Appearance will be saved with this new connection'
                    : editingId
                      ? 'Edit fields, then Update to save changes'
                      : 'Fill connection details, then Save'}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="px-2.5 py-1.5 text-[11px] font-medium rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveCurrentConnection()}
                    disabled={saving}
                    className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 shadow-sm"
                    title={editingId ? 'Update saved connection' : 'Save connection'}
                  >
                    {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            className="relative flex-1 min-h-0 overflow-hidden flex flex-col"
            style={{ backgroundColor: termBgColor }}
          >
            {tabs.length > 0 && (
              <div
                className="shrink-0 flex items-center gap-0.5 px-1 border-b border-slate-800 bg-slate-900 overflow-x-auto"
                style={{ minHeight: tabBarHeight, height: tabBarHeight }}
              >
                {tabs.map((tab) => {
                  const active = tab.id === activeTabId;
                  const conn = tab.connectionId
                    ? connections.find((c) => c.id === tab.connectionId)
                    : undefined;
                  const connColor = normalizeSshColor(conn?.color || draftColor);
                  const tagSuffix = formatTabTags(conn?.tags);
                  const tabLabel = `${tab.title}${tagSuffix}`;
                  const checkSize = Math.max(12, Math.min(18, Math.round(tabBarFontSize * 0.95)));
                  return (
                    <div
                      key={tab.id}
                      className={`group flex items-center gap-1 max-w-[18rem] shrink-0 rounded-md border overflow-hidden ${
                        active
                          ? 'bg-slate-800 text-slate-100'
                          : 'bg-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                      }`}
                      style={{
                        borderColor: active ? connColor : `${connColor}66`,
                        boxShadow: active ? `inset 3px 0 0 ${connColor}` : undefined,
                        height: Math.max(22, tabBarHeight - 6),
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => selectTab(tab.id)}
                        className="flex items-center gap-1.5 min-w-0 text-left pl-1.5 pr-0.5 h-full"
                        title={tab.statusMessage || tabLabel}
                      >
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/25 ${
                            tab.status === 'connecting' ? 'animate-pulse' : ''
                          }`}
                          style={{
                            backgroundColor: connColor,
                            outline:
                              tab.status === 'connected'
                                ? '1px solid rgba(52, 211, 153, 0.9)'
                                : tab.status === 'error'
                                  ? '1px solid rgba(248, 113, 113, 0.9)'
                                  : undefined,
                            outlineOffset: 1,
                          }}
                          aria-hidden
                        />
                        <span
                          className="truncate font-medium"
                          style={{ fontSize: tabBarFontSize }}
                        >
                          {tab.title}
                          {tagSuffix ? (
                            <span className="text-sky-300/90 font-semibold">{tagSuffix}</span>
                          ) : null}
                        </span>
                      </button>
                      {(tab.kind || 'ssh') !== 'rdp' && (
                        <label
                          className={`flex items-center shrink-0 px-0.5 cursor-pointer h-full ${
                            tab.excludeFromMulti ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
                          }`}
                          title={
                            tab.excludeFromMulti
                              ? 'Excluded from multi-exec (Send all / Ctrl+C / Multi-paste) — click to include'
                              : 'Include in multi-exec — check to exclude from Send all / Ctrl+C / Multi-paste'
                          }
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(tab.excludeFromMulti)}
                            onChange={(e) =>
                              updateTab(tab.id, { excludeFromMulti: e.target.checked })
                            }
                            className="rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500/40 focus:ring-offset-0 cursor-pointer"
                            style={{ width: checkSize, height: checkSize }}
                            aria-label={
                              tab.excludeFromMulti
                                ? `Include ${tabLabel} in multi-exec`
                                : `Exclude ${tabLabel} from multi-exec`
                            }
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void closeTab(tab.id);
                        }}
                        className="p-0.5 rounded opacity-60 hover:opacity-100 hover:bg-slate-700 text-slate-300 mr-0.5"
                        title="Close tab"
                        aria-label={`Close ${tabLabel}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
                <div className="ml-auto flex items-center gap-1 shrink-0 pr-0.5">
                  {(activeTab?.kind || 'ssh') !== 'rdp' && (
                    <>
                      <button
                        type="button"
                        onClick={() => void copyActiveSelection()}
                        className="px-1.5 h-6 text-[10px] font-semibold rounded border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                        title="Selection auto-copies; or click Copy"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => void pasteIntoActive()}
                        className="px-1.5 h-6 text-[10px] font-semibold rounded border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                        title="Paste (or right-click in the terminal)"
                      >
                        Paste
                      </button>
                      <button
                        type="button"
                        onClick={() => exportTerminalAscii(activeTabId)}
                        className="px-1.5 h-6 text-[10px] font-semibold rounded border border-emerald-700/70 text-emerald-200 hover:bg-emerald-950/50"
                        title="Export complete terminal text to a .txt file"
                      >
                        Export
                      </button>
                    </>
                  )}
                  <span className="px-1.5 text-[10px] text-slate-500">
                    {tabs.length}/{maxSshTabs}
                  </span>
                </div>
              </div>
            )}

            <div
              className={
                viewMode === 'grid'
                  ? 'relative flex-1 min-h-0 grid gap-1 p-1 overflow-hidden'
                  : viewMode === 'stack-v'
                    ? 'relative flex-1 min-h-0 flex flex-col gap-1 p-1 overflow-hidden'
                    : viewMode === 'stack-h'
                      ? 'relative flex-1 min-h-0 flex flex-row gap-1 p-1 overflow-hidden'
                      : 'relative flex-1 min-h-0 overflow-hidden'
              }
              style={
                viewMode === 'grid'
                  ? {
                      gridTemplateColumns: `repeat(${tileCols}, minmax(0, 1fr))`,
                      gridAutoRows: 'minmax(0, 1fr)',
                    }
                  : undefined
              }
            >
              {tabs.map((tab) => {
                const conn = tab.connectionId
                  ? connections.find((c) => c.id === tab.connectionId)
                  : undefined;
                const connColor = normalizeSshColor(conn?.color || draftColor);
                const tagSuffix = formatTabTags(conn?.tags);
                const skipCheckSize = Math.max(12, Math.min(18, Math.round(skipBarFontSize)));
                const isActive = tab.id === activeTabId;
                return (
                  <div
                    key={tab.id}
                    className={
                      multiView
                        ? `min-h-0 min-w-0 flex-1 flex flex-col rounded-md border overflow-hidden transition-[box-shadow,border-color] duration-200 ${
                            isActive
                              ? 'ring-2 ring-orange-400/80 border-orange-400/70 shadow-[0_0_0_1px_rgba(251,146,60,0.35)]'
                              : 'opacity-90'
                          }`
                        : `absolute inset-0 flex flex-col overflow-hidden ${
                            isActive ? 'z-10 visible' : 'z-0 invisible pointer-events-none'
                          }`
                    }
                    style={
                      multiView
                        ? {
                            borderColor: isActive ? undefined : `${connColor}66`,
                            backgroundColor: termBgColor,
                          }
                        : { backgroundColor: termBgColor }
                    }
                    aria-hidden={!multiView && !isActive}
                    onMouseDown={() => {
                      if (multiView) selectTab(tab.id);
                    }}
                  >
                    {multiView && (
                      <div
                        className={`shrink-0 flex items-center gap-1.5 px-1.5 font-medium border-b transition-colors duration-200 ${
                          isActive
                            ? 'bg-orange-500/25 text-orange-50 border-orange-400/50'
                            : 'bg-slate-900/80 text-slate-300 border-slate-800'
                        }`}
                        style={{
                          boxShadow: isActive
                            ? `inset 4px 0 0 #f97316, inset 0 -1px 0 rgba(249,115,22,0.35)`
                            : `inset 3px 0 0 ${connColor}`,
                          minHeight: skipBarHeight,
                          height: skipBarHeight,
                          fontSize: skipBarFontSize,
                        }}
                      >
                        <span
                          className={`rounded-full shrink-0 ring-2 ${
                            isActive
                              ? 'animate-pulse ring-orange-300 shadow-[0_0_8px_rgba(249,115,22,0.85)]'
                              : 'ring-black/25'
                          }`}
                          style={{
                            width: isActive ? 11 : 10,
                            height: isActive ? 11 : 10,
                            backgroundColor: isActive ? '#f97316' : connColor,
                          }}
                          aria-hidden
                          title={isActive ? 'Active terminal' : undefined}
                        />
                        <span className="truncate flex-1">
                          {tab.title}
                          {tagSuffix ? (
                            <span
                              className={`font-semibold ${
                                isActive ? 'text-orange-200' : 'text-sky-300/90'
                              }`}
                            >
                              {tagSuffix}
                            </span>
                          ) : null}
                        </span>
                        {isActive && (
                          <span
                            className="shrink-0 px-1.5 py-0.5 rounded bg-orange-500/90 text-white font-bold uppercase tracking-wide"
                            style={{ fontSize: Math.max(9, skipBarFontSize - 2) }}
                          >
                            Active
                          </span>
                        )}
                        {(tab.kind || 'ssh') !== 'rdp' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              exportTerminalAscii(tab.id);
                            }}
                            className={`shrink-0 px-1.5 py-0.5 rounded border font-semibold ${
                              isActive
                                ? 'border-orange-300/50 text-orange-50 hover:bg-orange-500/30'
                                : 'border-emerald-700/60 text-emerald-200 hover:bg-emerald-950/50'
                            }`}
                            style={{ fontSize: Math.max(9, skipBarFontSize - 1) }}
                            title="Export complete terminal text to a .txt file"
                          >
                            Export
                          </button>
                        )}
                        {(tab.kind || 'ssh') !== 'rdp' && (
                          <label
                            className={`flex items-center gap-1 shrink-0 cursor-pointer ${
                              tab.excludeFromMulti
                                ? 'text-amber-300'
                                : isActive
                                  ? 'text-orange-100/80'
                                  : 'text-slate-500'
                            }`}
                            title={
                              tab.excludeFromMulti
                                ? 'Excluded from multi-exec — click to include'
                                : 'Check to exclude from multi-exec'
                            }
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(tab.excludeFromMulti)}
                              onChange={(e) =>
                                updateTab(tab.id, { excludeFromMulti: e.target.checked })
                              }
                              className="rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-amber-500/40 focus:ring-offset-0 cursor-pointer"
                              style={{ width: skipCheckSize, height: skipCheckSize }}
                            />
                            <span
                              className="uppercase tracking-wide font-semibold"
                              style={{ fontSize: Math.max(9, skipBarFontSize - 1) }}
                            >
                              {tab.excludeFromMulti ? 'Skip' : 'Multi'}
                            </span>
                          </label>
                        )}
                        <span
                          className={`shrink-0 ${isActive ? 'text-orange-100/70' : 'text-slate-500'}`}
                          style={{ fontSize: Math.max(9, skipBarFontSize - 1) }}
                        >
                          {tab.status}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void closeTab(tab.id);
                          }}
                          className={`shrink-0 px-1.5 py-0.5 rounded border font-bold leading-none ${
                            isActive
                              ? 'border-rose-400/70 bg-rose-600/80 text-white hover:bg-rose-500'
                              : 'border-rose-700/70 bg-rose-950/50 text-rose-300 hover:bg-rose-900/70 hover:text-rose-100'
                          }`}
                          style={{ fontSize: Math.max(11, skipBarFontSize) }}
                          title={`Disconnect and close ${tab.title}`}
                          aria-label={`Disconnect ${tab.title}`}
                        >
                          [x]
                        </button>
                      </div>
                    )}
                    {tab.kind === 'rdp' ? (
                      <div className="relative flex-1 min-h-0 overflow-hidden">
                        <RdpSessionPane
                          url={tab.rdpUrl || ''}
                          title={tab.title}
                          active={isActive || multiView}
                          onStatus={(s, m) =>
                            updateTab(tab.id, {
                              status: s,
                              statusMessage: m || '',
                            })
                          }
                        />
                      </div>
                    ) : (
                      <XtermZoomSafeHost
                        className="relative flex-1 min-h-0"
                        onZoomCompensated={onHostZoomCompensated}
                        ref={(el) => {
                          if (el) tabHostsRef.current.set(tab.id, el);
                          else tabHostsRef.current.delete(tab.id);
                        }}
                      />
                    )}
                  </div>
                );
              })}
              {tabs.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center px-4">
                    <div className="mx-auto mb-2 w-10 h-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
                        <polyline points="4 17 10 11 4 5" />
                        <line x1="12" y1="19" x2="20" y2="19" />
                      </svg>
                    </div>
                    <p className="text-xs text-slate-400">
                      {connections.length
                        ? `Click a saved connection to open a session tab (up to ${maxSshTabs})`
                        : 'Connect or pick a saved host — each session opens in its own tab'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {(() => {
              const sshTabs = tabs.filter((t) => (t.kind || 'ssh') !== 'rdp');
              const includedTabs = sshTabs.filter((t) => !t.excludeFromMulti);
              const includedConnected = includedTabs.filter((t) => t.status === 'connected').length;
              const activeIsRdp = (activeTab?.kind || 'ssh') === 'rdp';
              if (sshTabs.length === 0 || activeIsRdp) return null;
              return (
              <div
                className={`shrink-0 border-t border-slate-800 bg-slate-900 relative flex flex-col ${
                  isResizingCmdBar ? 'select-none' : ''
                }`}
                style={{ height: cmdBarHeight }}
              >
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize command bar"
                  title="Drag to resize command bar"
                  onPointerDown={startCmdBarResize}
                  className={`absolute left-0 right-0 top-0 h-2 z-10 cursor-ns-resize flex items-start justify-center ${
                    isResizingCmdBar ? 'bg-sky-500/30' : 'hover:bg-sky-400/20'
                  }`}
                >
                  <span
                    className={`mt-0.5 h-0.5 w-10 rounded-full ${
                      isResizingCmdBar ? 'bg-sky-400' : 'bg-slate-600'
                    }`}
                  />
                </div>
                <div className="flex-1 min-h-0 flex items-stretch gap-2 px-2 pt-2.5 pb-1.5 overflow-hidden">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-400 shrink-0 self-start mt-1.5">
                    All
                  </span>
                  <textarea
                    value={broadcastCmd}
                    onChange={(e) => setBroadcastCmd(e.target.value)}
                    onKeyDown={(e) => {
                      // Ctrl+A–Z (except V) → send control char to included terminals
                      if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
                        const lower = e.key.toLowerCase();
                        if (lower === 'v') {
                          // Keep Ctrl+V as paste into the command bar
                          return;
                        }
                        if (lower >= 'a' && lower <= 'z') {
                          e.preventDefault();
                          e.stopPropagation();
                          const ctrlChar = String.fromCharCode(lower.charCodeAt(0) - 96);
                          sendKeyToAll(ctrlChar, `Ctrl+${lower.toUpperCase()}`);
                          return;
                        }
                        if (e.key === '\\') {
                          e.preventDefault();
                          e.stopPropagation();
                          sendKeyToAll('\x1c', 'Ctrl+\\');
                          return;
                        }
                        if (e.key === ']') {
                          e.preventDefault();
                          e.stopPropagation();
                          sendKeyToAll('\x1d', 'Ctrl+]');
                          return;
                        }
                        if (e.key === '[') {
                          e.preventDefault();
                          e.stopPropagation();
                          sendKeyToAll('\x1b', 'Ctrl+[');
                          return;
                        }
                      }
                      // Arrow keys → send CSI sequences to included terminals
                      if (
                        !e.ctrlKey &&
                        !e.metaKey &&
                        !e.altKey &&
                        (e.key === 'ArrowUp' ||
                          e.key === 'ArrowDown' ||
                          e.key === 'ArrowLeft' ||
                          e.key === 'ArrowRight')
                      ) {
                        e.preventDefault();
                        e.stopPropagation();
                        const arrowMap: Record<string, { payload: string; label: string }> = {
                          ArrowUp: { payload: '\x1b[A', label: '↑' },
                          ArrowDown: { payload: '\x1b[B', label: '↓' },
                          ArrowRight: { payload: '\x1b[C', label: '→' },
                          ArrowLeft: { payload: '\x1b[D', label: '←' },
                        };
                        const arrow = arrowMap[e.key];
                        if (arrow) sendKeyToAll(arrow.payload, arrow.label);
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        const cmd = broadcastCmd;
                        setBroadcastCmd('');
                        broadcastToAll(cmd);
                      }
                    }}
                    placeholder={
                      includedConnected > 0
                        ? `Command to ${includedConnected} included SSH terminal${includedConnected === 1 ? '' : 's'}… (Enter send · Shift+Enter newline · Ctrl+key / arrows send)`
                        : 'No included connected terminals — uncheck a tab’s exclude box'
                    }
                    className="flex-1 min-w-0 min-h-0 resize-none px-2.5 py-1.5 rounded-md border border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500 leading-relaxed tracking-wide"
                    style={{
                      fontFamily: termFontFamily,
                      fontSize: cmdFontSize,
                    }}
                    spellCheck={false}
                    autoComplete="off"
                    wrap="soft"
                  />
                  <div className="grid grid-cols-3 gap-1 shrink-0 self-center content-center max-h-full overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        const cmd = broadcastCmd;
                        setBroadcastCmd('');
                        broadcastToAll(cmd);
                      }}
                      disabled={!broadcastCmd.trim() || includedConnected === 0}
                      className="px-2.5 h-7 text-[11px] font-semibold rounded-md bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 whitespace-nowrap"
                      title="Send to all included connected SSH terminals"
                    >
                      Send all
                    </button>
                    <button
                      type="button"
                      onClick={() => interruptAll()}
                      disabled={includedConnected === 0}
                      className="px-2.5 h-7 text-[11px] font-semibold rounded-md border border-rose-700/70 bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 disabled:opacity-40 font-mono whitespace-nowrap"
                      title="Send Ctrl+C to all included connected SSH terminals"
                    >
                      Ctrl+C
                    </button>
                    <button
                      type="button"
                      onClick={() => suspendAll()}
                      disabled={includedConnected === 0}
                      className="px-2.5 h-7 text-[11px] font-semibold rounded-md border border-orange-700/70 bg-orange-950/50 hover:bg-orange-900/60 text-orange-200 disabled:opacity-40 font-mono whitespace-nowrap"
                      title="Send Ctrl+Z to all included connected SSH terminals"
                    >
                      Ctrl+Z
                    </button>
                    <button
                      type="button"
                      onClick={() => void pasteToAll()}
                      disabled={includedConnected === 0}
                      className="px-2.5 h-7 text-[11px] font-semibold rounded-md border border-emerald-700/70 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-200 disabled:opacity-40 whitespace-nowrap"
                      title="Paste clipboard into all included connected SSH terminals"
                    >
                      Multi-paste
                    </button>
                    <button
                      type="button"
                      onClick={() => eofAll()}
                      disabled={includedConnected === 0}
                      className="px-2.5 h-7 text-[11px] font-semibold rounded-md border border-fuchsia-700/70 bg-fuchsia-950/50 hover:bg-fuchsia-900/60 text-fuchsia-200 disabled:opacity-40 font-mono whitespace-nowrap"
                      title="Send Ctrl+D to all included connected SSH terminals"
                    >
                      Ctrl+D
                    </button>
                    <button
                      type="button"
                      onClick={() => enterAll()}
                      disabled={includedConnected === 0}
                      className="px-2.5 h-7 text-[11px] font-semibold rounded-md border border-indigo-700/70 bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-200 disabled:opacity-40 font-mono whitespace-nowrap"
                      title="Send Enter to all included connected SSH terminals"
                    >
                      Enter
                    </button>
                    <button
                      type="button"
                      onClick={() => clearAllTerminals()}
                      disabled={includedConnected === 0}
                      className="px-2.5 h-7 text-[11px] font-semibold rounded-md border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 font-mono whitespace-nowrap"
                      title="Run clear on all included connected SSH terminals"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => arrowUpAll()}
                      disabled={includedConnected === 0}
                      className="px-2.5 h-7 text-[11px] font-semibold rounded-md border border-cyan-700/70 bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-200 disabled:opacity-40 font-mono whitespace-nowrap"
                      title="Send ↑ to all included connected SSH terminals (previous history)"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => arrowDownAll()}
                      disabled={includedConnected === 0}
                      className="px-2.5 h-7 text-[11px] font-semibold rounded-md border border-cyan-700/70 bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-200 disabled:opacity-40 font-mono whitespace-nowrap"
                      title="Send ↓ to all included connected SSH terminals (next history)"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SshTerminalWidget;
