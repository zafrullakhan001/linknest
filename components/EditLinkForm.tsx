import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AccessRestrictions, Link, LinkOpenTarget, LinkVisibility } from '../types';
import { LINK_OPEN_TARGET_OPTIONS, normalizeLinkOpenTarget } from '../utils/openLinkUrl';
import type { UserListItem } from '../services/authService';
import { hasAccessRestrictions } from '../services/accessRestrictionService';
import { AccessRestrictionsEditor, AccessRestrictionsBadge } from './AccessRestrictionsEditor';
import { SelectableRichTextEditor } from './SelectableRichTextEditor';
import { LinkLabelField } from './LinkLabelField';
import { LinkMaintenanceVideoField } from './LinkMaintenanceVideoField';
import { hasVisibleRichText } from '../utils/richTextDisplay';
import { isInfoContentEnabled, isInfoOpenLinkShown, isNotesTooltipEnabled } from '../utils/linkFeatureToggles';
import { LinkTooltipStyleToggle } from './LinkTooltipStyleToggle';
import { HoverTooltipEditor } from './HoverTooltipEditor';
import { normalizeLinkTooltipStyle, type LinkTooltipStyle } from '../utils/linkTooltipPreference';
import { EmojiPickerPanel } from './EmojiPickerPanel';
import { TileAnimationSelector, type TileAnimation, getAnimationOption } from './TileAnimationSelector';
import { AuthSourceBadge } from './AuthSourceBadge';
import { SpaceModalHeader, EditModalTabButton } from './SpaceFormChrome';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

export const EDIT_LINK_VIEW_MODE_KEY = 'linknest_edit_link_view_mode';
export const EDIT_LINK_DIALOG_GEOMETRY_KEY = 'linknest_edit_link_dialog_geometry';
export type EditLinkViewMode = 'accordion' | 'dialog-tabs';

type DialogGeometry = { x: number; y: number; width: number; height: number };

const MIN_DIALOG_WIDTH = 400;
const MIN_DIALOG_HEIGHT = 300;
/** Keep at least this many pixels of the dialog inside the viewport for grab handles. */
const VIEWPORT_EDGE_PAD = 48;

export const readEditLinkViewMode = (): EditLinkViewMode => {
  try {
    return localStorage.getItem(EDIT_LINK_VIEW_MODE_KEY) === 'dialog-tabs' ? 'dialog-tabs' : 'accordion';
  } catch {
    return 'accordion';
  }
};

export const writeEditLinkViewMode = (mode: EditLinkViewMode): void => {
  try {
    localStorage.setItem(EDIT_LINK_VIEW_MODE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
};

const clampDialogGeometry = (geo: DialogGeometry): DialogGeometry => {
  const maxW = Math.max(MIN_DIALOG_WIDTH, window.innerWidth - 20);
  const maxH = Math.max(MIN_DIALOG_HEIGHT, window.innerHeight - 20);
  const width = Math.min(Math.max(geo.width, MIN_DIALOG_WIDTH), maxW);
  const height = Math.min(Math.max(geo.height, MIN_DIALOG_HEIGHT), maxH);
  // Keep a usable strip on-screen so header/bottom drag bars stay reachable
  const minX = VIEWPORT_EDGE_PAD - width;
  const maxX = window.innerWidth - VIEWPORT_EDGE_PAD;
  const minY = VIEWPORT_EDGE_PAD - height;
  const maxY = window.innerHeight - VIEWPORT_EDGE_PAD;
  const x = Math.min(Math.max(geo.x, minX), maxX);
  const y = Math.min(Math.max(geo.y, minY), maxY);
  return { x, y, width, height };
};

const readDialogGeometry = (): DialogGeometry | null => {
  try {
    const raw = localStorage.getItem(EDIT_LINK_DIALOG_GEOMETRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DialogGeometry>;
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number'
    ) {
      return null;
    }
    return clampDialogGeometry({
      x: parsed.x,
      y: parsed.y,
      width: parsed.width,
      height: parsed.height,
    });
  } catch {
    return null;
  }
};

const writeDialogGeometry = (geo: DialogGeometry): void => {
  try {
    localStorage.setItem(EDIT_LINK_DIALOG_GEOMETRY_KEY, JSON.stringify(clampDialogGeometry(geo)));
  } catch {
    // ignore quota / private mode
  }
};

const defaultDialogGeometry = (): DialogGeometry => {
  const width = Math.min(768, window.innerWidth - 40);
  const height = Math.min(700, window.innerHeight - 40);
  return clampDialogGeometry({
    x: (window.innerWidth - width) / 2,
    y: (window.innerHeight - height) / 2,
    width,
    height,
  });
};

export type EditLinkDraft = {
  label: string;
  url: string;
  icon: string;
  textColor: string;
  visibility: LinkVisibility;
  published: boolean;
  inheritShortUrls: boolean;
  forceShortUrl: boolean;
  brokenStatusLabel: string;
  brokenStatusNote: string;
  brokenStatusTone: '' | 'red' | 'amber' | 'slate';
  brokenStatusExpected: boolean;
  brokenStatusManual: boolean;
  brokenStatusFontColor: string;
  brokenStatusFontWeight: '' | 'normal' | 'bold';
  brokenStatusFontStyle: '' | 'normal' | 'italic';
  brokenStatusFontFamily: string;
  allowedUsers: number[];
  allowedGroups: number[];
  notes: string;
  tooltip: string;
  tooltipStyle: LinkTooltipStyle;
  notesEnabled: boolean;
  notesVideoUrl: string;
  browser: string;
  openTarget: LinkOpenTarget;
  richTextContent: string;
  richTextEnabled: boolean;
  infoVideoUrl: string;
  infoShowOpenLink: boolean;
  animation: string;
  accessRestrictions?: AccessRestrictions;
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  maintenanceVideoUrl: string;
  mobilePreviewEmulation: boolean;
  openInEmulation: boolean;
};

type EditLinkField =
  | 'label' | 'url' | 'icon' | 'textColor' | 'visibility' | 'allowedUsers' | 'allowedGroups'
  | 'notes' | 'tooltip' | 'tooltipStyle' | 'notesEnabled' | 'notesVideoUrl' | 'browser' | 'openTarget' | 'richTextContent'
  | 'richTextEnabled' | 'infoVideoUrl' | 'infoShowOpenLink' | 'animation' | 'published' | 'inheritShortUrls' | 'forceShortUrl' | 'brokenStatusLabel'
  | 'brokenStatusNote' | 'brokenStatusTone' | 'brokenStatusExpected' | 'brokenStatusManual'
  | 'brokenStatusFontColor' | 'brokenStatusFontWeight' | 'brokenStatusFontStyle' | 'brokenStatusFontFamily'
  | 'maintenanceEnabled' | 'maintenanceMessage' | 'maintenanceVideoUrl' | 'mobilePreviewEmulation' | 'openInEmulation';

const LINK_EDIT_NEUTRAL_CARD = 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50';

const LINK_EDIT_SECTION_ACCENTS = {
  sky: {
    border: 'border-sky-200 dark:border-sky-800/50',
    header: 'bg-sky-50 dark:bg-sky-950/35 hover:bg-sky-100/90 dark:hover:bg-sky-900/40',
    emoji: 'bg-sky-100 dark:bg-sky-900/50',
    title: 'text-sky-900 dark:text-sky-100',
    body: 'border-sky-100 dark:border-sky-900/40 bg-white/80 dark:bg-slate-900/40',
  },
  amber: {
    border: 'border-amber-200 dark:border-amber-800/50',
    header: 'bg-amber-50 dark:bg-amber-950/35 hover:bg-amber-100/90 dark:hover:bg-amber-900/40',
    emoji: 'bg-amber-100 dark:bg-amber-900/50',
    title: 'text-amber-900 dark:text-amber-100',
    body: 'border-amber-100 dark:border-amber-900/40 bg-white/80 dark:bg-slate-900/40',
  },
  violet: {
    border: 'border-violet-200 dark:border-violet-800/50',
    header: 'bg-violet-50 dark:bg-violet-950/35 hover:bg-violet-100/90 dark:hover:bg-violet-900/40',
    emoji: 'bg-violet-100 dark:bg-violet-900/50',
    title: 'text-violet-900 dark:text-violet-100',
    body: 'border-violet-100 dark:border-violet-900/40 bg-white/80 dark:bg-slate-900/40',
  },
  slate: {
    border: 'border-slate-200 dark:border-slate-700',
    header: 'bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800',
    emoji: 'bg-slate-200/80 dark:bg-slate-700',
    title: 'text-slate-800 dark:text-slate-100',
    body: 'border-slate-100 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/40',
  },
} as const;

type LinkEditSectionAccent = keyof typeof LINK_EDIT_SECTION_ACCENTS;

const LinkEditSection: React.FC<{
  emoji: string;
  title: string;
  subtitle?: string;
  accent?: LinkEditSectionAccent;
  defaultOpen?: boolean;
  foldNonce?: number;
  foldOpen?: boolean;
  plain?: boolean;
  badge?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}> = ({ emoji, title, subtitle, accent = 'slate', defaultOpen = false, foldNonce, foldOpen, plain = false, badge, headerAction, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const styles = LINK_EDIT_SECTION_ACCENTS[plain ? 'slate' : accent];

  useEffect(() => {
    if (!foldNonce) return;
    setOpen(!!foldOpen);
  }, [foldNonce, foldOpen]);

  return (
    <div className={`rounded-xl border-2 overflow-hidden shadow-sm ${styles.border}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors ${styles.header}`}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${styles.emoji}`} aria-hidden>
          {emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold ${styles.title}`}>{title}</span>
          {subtitle && (
            <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{subtitle}</span>
          )}
        </span>
        {badge}
        {headerAction && (
          <span
            className="shrink-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {headerAction}
          </span>
        )}
        <svg
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className={`px-3.5 py-3.5 space-y-3 border-t ${styles.body}`}>
          {children}
        </div>
      )}
    </div>
  );
};

const LinkEditHeaderSwitch: React.FC<{
  enabled: boolean;
  onToggle: () => void;
  onClassName: string;
  labelOn: string;
  labelOff: string;
}> = ({ enabled, onToggle, onClassName, labelOn, labelOff }) => (
  <button
    type="button"
    role="switch"
    aria-checked={enabled}
    aria-label={enabled ? labelOn : labelOff}
    title={enabled ? labelOn : labelOff}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle();
    }}
    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${enabled ? onClassName : 'bg-slate-400 dark:bg-slate-600'}`}
  >
    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

type EditLinkTabId = 'access' | 'basics' | 'notes' | 'info' | 'maintenance' | 'advanced' | 'restrictions';

const TABS: { id: EditLinkTabId; emoji: string; label: string }[] = [
  { id: 'access', emoji: '🚀', label: 'Access' },
  { id: 'basics', emoji: '🔗', label: 'Basics' },
  { id: 'notes', emoji: '📝', label: 'Notes' },
  { id: 'info', emoji: '📄', label: 'Info' },
  { id: 'maintenance', emoji: '🔧', label: 'Maintenance' },
  { id: 'advanced', emoji: '⚙️', label: 'Advanced' },
  { id: 'restrictions', emoji: '🛡️', label: 'Restrictions' },
];

export type EditLinkFormProps = {
  link: Link;
  draft: EditLinkDraft;
  plain: boolean;
  onPlainChange: (plain: boolean) => void;
  foldNonce: number;
  foldOpen: boolean;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onUpdateField: (field: EditLinkField, value: string | LinkVisibility | number[] | boolean) => void;
  onPatchDraft: (patch: Partial<EditLinkDraft>) => void;
  onCancel: () => void;
  onSave: () => void;
  onConvert?: () => void;
  /** Prefer this mode on mount (e.g. dialog-tabs when editing from view mode). */
  initialViewMode?: EditLinkViewMode;
  /** When true and in dialog-tabs, only render the floating dialog (no inline placeholder). */
  dialogOnly?: boolean;
  urlField: React.ReactNode;
  isAdmin: boolean;
  canChangeVisibility: boolean;
  canChangeBrowser: boolean;
  browserSpecificEnabled: boolean;
  availableBrowsers: string[];
  usersList: UserListItem[];
  availableGroups: Array<{ id: number; name: string; description: string | null; memberCount: number }>;
  loadingUsers: boolean;
  showUserPicker: boolean;
  onToggleUserPicker: () => void;
  linkUserSearch: string;
  onLinkUserSearch: (q: string) => void;
  linkGroupSearch: string;
  onLinkGroupSearch: (q: string) => void;
  onToggleUser: (userId: number) => void;
  onToggleGroup: (groupId: number) => void;
  showEmojiPicker: boolean;
  onSetEmojiPicker: (open: boolean) => void;
  onOpenNotesPreset?: () => void;
  linkAnimationForEdit: (animation?: string) => TileAnimation;
};

const SaveIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export const EditLinkForm: React.FC<EditLinkFormProps> = (props) => {
  const {
    link,
    draft,
    plain: plainPreference,
    onPlainChange,
    foldNonce,
    foldOpen,
    onCollapseAll,
    onExpandAll,
    onUpdateField,
    onPatchDraft,
    onCancel,
    onSave,
    onConvert,
    initialViewMode,
    dialogOnly = false,
    urlField,
    isAdmin,
    canChangeVisibility,
    canChangeBrowser,
    browserSpecificEnabled,
    availableBrowsers,
    usersList,
    availableGroups,
    loadingUsers,
    showUserPicker,
    onToggleUserPicker,
    linkUserSearch,
    onLinkUserSearch,
    linkGroupSearch,
    onLinkGroupSearch,
    onToggleUser,
    onToggleGroup,
    showEmojiPicker,
    onSetEmojiPicker,
    onOpenNotesPreset,
    linkAnimationForEdit,
  } = props;

  const [viewMode, setViewMode] = useState<EditLinkViewMode>(
    () => initialViewMode ?? readEditLinkViewMode()
  );
  const [activeTab, setActiveTab] = useState<EditLinkTabId>('basics');
  const canSave = !!draft.label?.trim() && !!draft.url?.trim();
  // Popup tabs always use colored section chrome; Long form keeps the Colors preference.
  const plain = viewMode === 'dialog-tabs' ? false : plainPreference;

  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [modalSize, setModalSize] = useState({ width: 0, height: 0 });
  const [dialogReady, setDialogReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const modalPositionRef = useRef({ x: 0, y: 0 });
  const modalSizeRef = useRef({ width: 0, height: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  const setViewModePersist = (mode: EditLinkViewMode) => {
    setViewMode(mode);
    writeEditLinkViewMode(mode);
  };

  useEscapeToClose(viewMode === 'dialog-tabs', onCancel);

  useEffect(() => {
    if (viewMode !== 'dialog-tabs') {
      setDialogReady(false);
      return;
    }
    const timer = window.setTimeout(() => {
      const saved = readDialogGeometry();
      const geo = saved ?? defaultDialogGeometry();
      setModalSize({ width: geo.width, height: geo.height });
      setModalPosition({ x: geo.x, y: geo.y });
      modalSizeRef.current = { width: geo.width, height: geo.height };
      modalPositionRef.current = { x: geo.x, y: geo.y };
      setDialogReady(true);
    }, 10);
    return () => window.clearTimeout(timer);
  }, [viewMode]);

  useEffect(() => {
    if (!isDragging && !isResizing) {
      modalPositionRef.current = modalPosition;
      modalSizeRef.current = modalSize;
    }
  }, [modalPosition, modalSize, isDragging, isResizing]);

  const persistGeometry = useCallback((pos: { x: number; y: number }, size: { width: number; height: number }) => {
    const clamped = clampDialogGeometry({ ...pos, ...size });
    setModalPosition({ x: clamped.x, y: clamped.y });
    setModalSize({ width: clamped.width, height: clamped.height });
    modalPositionRef.current = { x: clamped.x, y: clamped.y };
    modalSizeRef.current = { width: clamped.width, height: clamped.height };
    if (modalRef.current) {
      modalRef.current.style.left = `${clamped.x}px`;
      modalRef.current.style.top = `${clamped.y}px`;
      modalRef.current.style.width = `${clamped.width}px`;
      modalRef.current.style.height = `${clamped.height}px`;
    }
    writeDialogGeometry(clamped);
  }, []);

  const handleDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('[data-resize-handle]')) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    if (!modalRef.current) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - (modalPositionRef.current.x || 0),
      y: e.clientY - (modalPositionRef.current.y || 0),
    };
    modalSizeRef.current = { width: modalSize.width, height: modalSize.height };
  };

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging || !modalRef.current) return;
    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;
    modalPositionRef.current = { x: newX, y: newY };
    modalRef.current.style.left = `${newX}px`;
    modalRef.current.style.top = `${newY}px`;
    modalRef.current.style.position = 'absolute';
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    persistGeometry(modalPositionRef.current, modalSizeRef.current);
    setIsDragging(false);
  }, [persistGeometry]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!modalRef.current) return;
    setIsResizing(true);
    const rect = modalRef.current.getBoundingClientRect();
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
      height: rect.height,
    };
    modalPositionRef.current = { x: modalPosition.x, y: modalPosition.y };
  };

  const handleResize = useCallback((e: MouseEvent) => {
    if (!isResizing || !modalRef.current) return;
    const deltaX = e.clientX - resizeStartRef.current.x;
    const deltaY = e.clientY - resizeStartRef.current.y;
    const maxWidth = window.innerWidth - modalPositionRef.current.x;
    const maxHeight = window.innerHeight - modalPositionRef.current.y;
    const newWidth = Math.max(MIN_DIALOG_WIDTH, Math.min(resizeStartRef.current.width + deltaX, maxWidth));
    const newHeight = Math.max(MIN_DIALOG_HEIGHT, Math.min(resizeStartRef.current.height + deltaY, maxHeight));
    modalSizeRef.current = { width: newWidth, height: newHeight };
    modalRef.current.style.width = `${newWidth}px`;
    modalRef.current.style.height = `${newHeight}px`;
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    persistGeometry(modalPositionRef.current, modalSizeRef.current);
    setIsResizing(false);
  }, [persistGeometry]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = isDragging ? 'move' : 'nwse-resize';
    document.addEventListener('mousemove', isDragging ? handleDrag : handleResize);
    document.addEventListener('mouseup', isDragging ? handleDragEnd : handleResizeEnd);
    return () => {
      document.removeEventListener('mousemove', isDragging ? handleDrag : handleResize);
      document.removeEventListener('mouseup', isDragging ? handleDragEnd : handleResizeEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, isResizing, handleDrag, handleResize, handleDragEnd, handleResizeEnd]);

  // Re-clamp after window resize so a saved position cannot leave the dialog unreachable
  useEffect(() => {
    if (viewMode !== 'dialog-tabs' || !dialogReady) return;
    const onResize = () => {
      persistGeometry(modalPositionRef.current, modalSizeRef.current);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [viewMode, dialogReady, persistGeometry]);

  const notesOn = !!(draft.notesEnabled ?? isNotesTooltipEnabled(link));
  const infoOn = !!(draft.richTextEnabled ?? isInfoContentEnabled(link));
  const infoOpenLinkOn = draft.infoShowOpenLink ?? isInfoOpenLinkShown(link);
  const maintenanceOn = !!draft.maintenanceEnabled;
  const restrictionsOn = hasAccessRestrictions(draft.accessRestrictions);

  const viewModeToggle = (
    <div className="flex items-center gap-1 pr-2 mr-0.5 border-r border-slate-200 dark:border-slate-600">
      <button
        type="button"
        onClick={() => setViewModePersist('accordion')}
        className={`px-2.5 py-2 text-xs font-medium rounded-lg border transition-all ${
          viewMode === 'accordion'
            ? 'bg-brand-600 text-white border-brand-600'
            : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'
        }`}
        title="Long form (accordion)"
      >
        Long form
      </button>
      <button
        type="button"
        onClick={() => setViewModePersist('dialog-tabs')}
        className={`px-2.5 py-2 text-xs font-medium rounded-lg border transition-all ${
          viewMode === 'dialog-tabs'
            ? 'bg-brand-600 text-white border-brand-600'
            : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'
        }`}
        title="Popup dialog with tabs"
      >
        Popup tabs
      </button>
    </div>
  );

  const colorsToggle = (
    <div className="flex items-center gap-1.5 pr-2 mr-0.5 border-r border-slate-200 dark:border-slate-600">
      <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">Colors</span>
      <button
        type="button"
        role="switch"
        aria-checked={!plainPreference}
        aria-label={plainPreference ? 'Turn section colors on' : 'Turn section colors off'}
        title={plainPreference ? 'Show section colors' : 'Hide section colors'}
        onClick={() => onPlainChange(!plainPreference)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${plainPreference ? 'bg-slate-400 dark:bg-slate-600' : 'bg-brand-600'}`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${plainPreference ? 'translate-x-1' : 'translate-x-6'}`} />
      </button>
    </div>
  );

  const tooltipStyleToggle = (
    <div className="flex items-center pr-2 mr-0.5 border-r border-slate-200 dark:border-slate-600">
      <LinkTooltipStyleToggle
        compact
        value={normalizeLinkTooltipStyle(draft.tooltipStyle)}
        onChange={(style) => onUpdateField('tooltipStyle', style)}
      />
    </div>
  );

  const cancelSaveButtons = (
    <>
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={!canSave}
        className="px-4 py-2 text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-brand-500/30 flex items-center gap-1.5"
      >
        <SaveIcon />
        Save
      </button>
    </>
  );

  const footerActions = (
    <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
      {onConvert && (
        <button
          type="button"
          onClick={onConvert}
          className="mr-auto px-4 py-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-all"
        >
          Convert to tile/space
        </button>
      )}
      {cancelSaveButtons}
    </div>
  );

  const accessFields = (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isAdmin && (
          <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border-2 ${
            plain
              ? LINK_EDIT_NEUTRAL_CARD
              : (draft.published !== false)
                ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40'
                : 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-900/60'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 dark:bg-slate-800 text-lg shadow-sm" aria-hidden>
                {(draft.published !== false) ? '🚀' : '⏸️'}
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Publish</div>
                <div className={`text-sm font-semibold ${
                  !plain && (draft.published !== false)
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-slate-600 dark:text-slate-300'
                }`}>
                  {(draft.published !== false) ? 'Published' : 'Unpublished'}
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.published !== false}
              onClick={() => onUpdateField('published', draft.published === false)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${(draft.published !== false) ? (plain ? 'bg-slate-600' : 'bg-emerald-500') : 'bg-slate-400 dark:bg-slate-600'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${(draft.published !== false) ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        )}
        <div className={`p-3.5 rounded-xl border-2 ${
          plain
            ? LINK_EDIT_NEUTRAL_CARD
            : draft.visibility === 'private'
              ? 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30'
              : draft.visibility === 'authenticated'
                ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30'
                : 'border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30'
        } ${!isAdmin ? 'sm:col-span-2' : ''}`}>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 dark:bg-slate-800 text-lg shadow-sm" aria-hidden>
              {draft.visibility === 'private' ? '🔒' : draft.visibility === 'authenticated' ? '👤' : '🌍'}
            </span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Visibility</div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Who can see this link</div>
            </div>
          </div>
          <select
            value={draft.visibility || 'public'}
            onChange={(e) => onUpdateField('visibility', e.target.value as LinkVisibility)}
            className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-medium"
          >
            {isAdmin && <option value="public">🌍 Public (visible to everyone)</option>}
            {isAdmin && <option value="authenticated">👤 Authenticated (logged-in users only)</option>}
            <option value="private">🔒 Private (specific users only)</option>
          </select>
        </div>
      </div>

      {draft.visibility === 'private' && (
        <div className={`p-3.5 rounded-xl border-2 space-y-3 ${
          plain
            ? LINK_EDIT_NEUTRAL_CARD
            : 'bg-rose-50/80 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60'
        }`}>
          <div className={`flex items-center gap-2 text-sm font-semibold ${
            plain ? 'text-slate-800 dark:text-slate-200' : 'text-rose-800 dark:text-rose-200'
          }`}>
            <span aria-hidden>👥</span>
            Allowed users & groups
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Select Users</label>
              <button
                type="button"
                onClick={onToggleUserPicker}
                className="text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-medium flex items-center gap-1"
              >
                {showUserPicker ? 'Hide' : 'Show'}
              </button>
            </div>
            {draft.allowedUsers && draft.allowedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {draft.allowedUsers.map((userId) => {
                  const u = usersList.find((x) => x.id === userId);
                  return (
                    <span
                      key={userId}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 rounded text-xs font-medium"
                    >
                      {u?.username || `User ${userId}`}
                      <AuthSourceBadge source={u?.auth_source} />
                      <button
                        type="button"
                        onClick={() => onToggleUser(userId)}
                        className="hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        title="Remove user"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            {showUserPicker && (
              <div className="space-y-1.5">
                <div className="relative">
                  <input
                    type="text"
                    value={linkUserSearch}
                    onChange={(e) => onLinkUserSearch(e.target.value)}
                    placeholder="Search users..."
                    className="w-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 pl-7 text-xs text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 absolute left-2 top-2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {linkUserSearch && (
                    <button
                      type="button"
                      onClick={() => onLinkUserSearch('')}
                      className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="max-h-32 overflow-y-auto border-2 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-2 space-y-1">
                  {loadingUsers ? (
                    <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">Loading...</div>
                  ) : usersList.length === 0 ? (
                    <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">No users available</div>
                  ) : (() => {
                    const q = (linkUserSearch || '').trim().toLowerCase();
                    const filtered = !q
                      ? usersList
                      : usersList.filter((u) =>
                          u.username.toLowerCase().includes(q) ||
                          (u.email || '').toLowerCase().includes(q) ||
                          (u.auth_source || 'local').toLowerCase().includes(q)
                        );
                    if (filtered.length === 0) {
                      return <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">No users found</div>;
                    }
                    return filtered.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded cursor-pointer">
                        <input type="checkbox" checked={draft.allowedUsers?.includes(u.id) || false} onChange={() => onToggleUser(u.id)} className="rounded w-3.5 h-3.5" />
                        <span className="text-xs font-medium">{u.username}</span>
                        <AuthSourceBadge source={u.auth_source} />
                      </label>
                    ));
                  })()}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-2">Select Groups</label>
            {draft.allowedGroups && draft.allowedGroups.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {draft.allowedGroups.map((groupId) => {
                  const group = availableGroups.find((g) => g.id === groupId);
                  return (
                    <span key={groupId} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                      {group?.name || `Group ${groupId}`}
                      <button type="button" onClick={() => onToggleGroup(groupId)} className="hover:text-red-600 dark:hover:text-red-400">×</button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="space-y-1.5">
              <div className="relative">
                <input
                  type="text"
                  value={linkGroupSearch}
                  onChange={(e) => onLinkGroupSearch(e.target.value)}
                  placeholder="Search groups..."
                  className="w-full bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 pl-7 text-xs text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                />
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 absolute left-2 top-2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {linkGroupSearch && (
                  <button
                    type="button"
                    onClick={() => onLinkGroupSearch('')}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="max-h-32 overflow-y-auto border-2 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 p-2 space-y-1">
                {availableGroups.length === 0 ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">No groups available</div>
                ) : (() => {
                  const q = (linkGroupSearch || '').trim().toLowerCase();
                  const filtered = !q
                    ? availableGroups
                    : availableGroups.filter((g) =>
                        g.name.toLowerCase().includes(q) ||
                        (g.description || '').toLowerCase().includes(q)
                      );
                  if (filtered.length === 0) {
                    return <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">No groups found</div>;
                  }
                  return filtered.map((group) => (
                    <label key={group.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded cursor-pointer">
                      <input type="checkbox" checked={draft.allowedGroups?.includes(group.id) || false} onChange={() => onToggleGroup(group.id)} className="rounded w-3.5 h-3.5" />
                      <span className="text-xs font-medium">{group.name}</span>
                      <span className="text-[10px] text-slate-500">({group.memberCount})</span>
                    </label>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border-2 ${
        plain
          ? LINK_EDIT_NEUTRAL_CARD
          : draft.forceShortUrl
            ? 'border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30'
            : (draft.inheritShortUrls !== false)
              ? 'border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30'
              : 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-900/60'
      }`}>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Short URLs</div>
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {draft.forceShortUrl
              ? 'Forced — short URL only'
              : (draft.inheritShortUrls !== false) ? 'Inherit from parent' : 'Override — original URL'}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={draft.forceShortUrl ? true : draft.inheritShortUrls !== false}
          disabled={draft.forceShortUrl === true}
          onClick={() => onUpdateField('inheritShortUrls', draft.inheritShortUrls === false)}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            draft.forceShortUrl || draft.inheritShortUrls !== false
              ? (plain ? 'bg-slate-600' : 'bg-orange-500')
              : 'bg-slate-400 dark:bg-slate-600'
          }`}
          title={
            draft.forceShortUrl
              ? 'Short URL is forced on in Basics. Turn that off to inherit or show the original URL.'
              : 'On: inherit short URLs from the section/tab/space. Off: show the original URL.'
          }
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${(draft.forceShortUrl || draft.inheritShortUrls !== false) ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
    </div>
  );

  const basicsFields = (
    <div className="space-y-3">
      <LinkLabelField
        key={link.id}
        value={draft.label || ''}
        onChange={(value) => onUpdateField('label', value)}
      />
      {urlField}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
          Open URL in
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {LINK_OPEN_TARGET_OPTIONS.map((opt) => {
            const selected = normalizeLinkOpenTarget(draft.openTarget) === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex items-center gap-2 cursor-pointer rounded-lg border-2 px-3 py-2 transition-colors ${
                  selected
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-800 dark:text-brand-200'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name={`openTarget-${link.id}`}
                  value={opt.value}
                  checked={selected}
                  onChange={() => onUpdateField('openTarget', opt.value)}
                  className="w-4 h-4 text-brand-600 focus:ring-brand-500 focus:ring-2"
                />
                <span className="min-w-0">
                  <span className="text-sm font-medium">{opt.label}</span>
                  {opt.hint ? (
                    <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400 leading-tight">
                      {opt.hint}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          New window is a compact popup. Full browser (tabs, toolbar, menus) uses Bookmark Sync 1.8.5+: reload the extension, then refresh this page. InPrivate / Incognito needs the extension too.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Emoji</label>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={() => onSetEmojiPicker(!showEmojiPicker)}
              className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-md transition-all focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
              title="Select emoji"
            >
              <span className="text-xl">
                {draft.icon || '😀'}
              </span>
            </button>
            <input
              type="text"
              value={draft.icon || ''}
              onChange={(e) => onUpdateField('icon', e.target.value)}
              placeholder="Or type emoji..."
              className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
            />
          </div>
          {showEmojiPicker && (
            <>
              <div className="fixed inset-0 z-[100070]" onClick={() => onSetEmojiPicker(false)}></div>
              <div className="fixed z-[100071] bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-[26rem] max-w-[calc(100vw-1.5rem)] h-[min(420px,72vh)] flex flex-col overflow-hidden" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                <EmojiPickerPanel
                  currentValue={draft.icon || ''}
                  onSelect={(emoji) => {
                    onUpdateField('icon', emoji);
                    onSetEmojiPicker(false);
                  }}
                />
              </div>
            </>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Text Color</label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={draft.textColor && draft.textColor.trim() ? draft.textColor : '#000000'}
              onChange={(e) => onUpdateField('textColor', e.target.value)}
              className="w-12 h-12 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:border-brand-400 dark:hover:border-brand-500 transition-all"
              title="Select text color"
            />
            <div className="flex-1 flex gap-1.5">
              <input
                type="text"
                value={draft.textColor || ''}
                onChange={(e) => onUpdateField('textColor', e.target.value)}
                placeholder="#000000"
                className="flex-1 bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => onUpdateField('textColor', '')}
                className="px-2.5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors text-xs font-medium"
                title="Clear color"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const notesFields = (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Notes (Rich Text)</label>
          {onOpenNotesPreset && (
            <button
              type="button"
              onClick={onOpenNotesPreset}
              className="text-[10px] px-2 py-1 bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 hover:bg-brand-200 dark:hover:bg-brand-900/50 rounded transition-colors flex items-center gap-1"
              title="Use preset form"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Preset Form
            </button>
          )}
        </div>
        <SelectableRichTextEditor
          value={draft.notes || ''}
          onChange={(html) => onUpdateField('notes', html)}
          placeholder="Add notes... or use Preset Form button above"
          className="min-h-[200px]"
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Hover Tooltip</label>
          <LinkTooltipStyleToggle
            compact
            value={normalizeLinkTooltipStyle(draft.tooltipStyle)}
            onChange={(style) => onUpdateField('tooltipStyle', style)}
          />
        </div>
        <HoverTooltipEditor
          value={draft.tooltip || ''}
          onChange={(html) => onUpdateField('tooltip', html)}
          tooltipStyle={draft.tooltipStyle}
          placeholder="Text shown on hover..."
        />
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
          Yellow uses the normal Windows tooltip and a plain text box. Rich uses a formatted tooltip. This applies only to this link.
        </p>
      </div>
      <LinkMaintenanceVideoField
        value={draft.notesVideoUrl || ''}
        onChange={(url) => onUpdateField('notesVideoUrl', url)}
        heading="Notes video"
        description="Record a webcam message or upload a video file (WebM, MP4, up to 50MB)."
      />
    </div>
  );

  const infoFields = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          If provided, clicking this link opens a rich text dialog instead of navigating to the URL. Viewers can skip the dialog until the information is updated, and reopen it anytime with the View info icon.
        </p>
        <button
          type="button"
          onClick={() => {
            const demoContent = '<h2>Welcome to Information Content</h2><p>This is a <strong>sample rich text content</strong> that demonstrates various formatting options available in the editor.</p><h3>Key Features</h3><ul><li>Rich text formatting with <em>bold</em> and <u>underline</u></li><li>Lists and structured content</li><li>Links and embedded content</li><li>Custom styling options</li></ul><h3>Contact Information</h3><p>For more information, please contact:</p><p><strong>Support Team:</strong> support@company.com<br/><strong>Phone:</strong> +1-555-0100</p><blockquote><p>This is an important note or quote that stands out from the regular content.</p></blockquote><p>You can edit this content using the rich text editor toolbar above.</p>';
            onPatchDraft({ richTextContent: demoContent, richTextEnabled: true });
          }}
          className={`px-3 py-1 text-xs text-white rounded-lg font-medium transition-colors shrink-0 ${
            plain ? 'bg-slate-600 hover:bg-slate-500' : 'bg-amber-500 hover:bg-amber-600'
          }`}
        >
          Demo Fill
        </button>
      </div>
      <SelectableRichTextEditor
        value={draft.richTextContent || ''}
        onChange={(html) => onUpdateField('richTextContent', html)}
        placeholder="Enter rich text content that will be displayed in a dialog when the link is clicked..."
        className="min-h-[200px]"
      />
      <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border-2 ${
        plain
          ? LINK_EDIT_NEUTRAL_CARD
          : infoOpenLinkOn
            ? 'border-violet-200 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-950/30'
            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50'
      }`}>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Open Link button</div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {infoOpenLinkOn ? 'Shown in the info dialog footer' : 'Hidden — viewers only see the content'}
          </div>
        </div>
        <LinkEditHeaderSwitch
          enabled={infoOpenLinkOn}
          onToggle={() => onUpdateField('infoShowOpenLink', !infoOpenLinkOn)}
          onClassName={plain ? 'bg-slate-600' : 'bg-violet-500'}
          labelOn="Hide Open Link button in info dialog"
          labelOff="Show Open Link button in info dialog"
        />
      </div>
      <LinkMaintenanceVideoField
        value={draft.infoVideoUrl || ''}
        onChange={(url) => onUpdateField('infoVideoUrl', url)}
        heading="Info video"
        description="Record a webcam message or upload a video file (WebM, MP4, up to 50MB)."
      />
    </div>
  );

  const maintenanceFields = (
    <div className="space-y-3">
      <div className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border-2 ${
        plain
          ? LINK_EDIT_NEUTRAL_CARD
          : draft.maintenanceEnabled
            ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40'
            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50'
      }`}>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Maintenance window</div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {draft.maintenanceEnabled ? 'Clicks show the maintenance message' : 'Off — link opens normally'}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!draft.maintenanceEnabled}
          onClick={() => onUpdateField('maintenanceEnabled', !draft.maintenanceEnabled)}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${draft.maintenanceEnabled ? (plain ? 'bg-slate-600' : 'bg-amber-500') : 'bg-slate-400 dark:bg-slate-600'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${draft.maintenanceEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Message and video are kept when the toggle is off so you can reuse them later.
      </p>
      <SelectableRichTextEditor
        value={draft.maintenanceMessage || ''}
        onChange={(html) => onUpdateField('maintenanceMessage', html)}
        placeholder="Describe the maintenance window..."
        className="min-h-[160px]"
      />
      <LinkMaintenanceVideoField
        value={draft.maintenanceVideoUrl || ''}
        onChange={(url) => onUpdateField('maintenanceVideoUrl', url)}
      />
    </div>
  );

  const advancedFields = (
    <div className="space-y-3">
      {browserSpecificEnabled && (isAdmin || canChangeBrowser) && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">Open link in</label>
          <select
            value={draft.browser || 'default'}
            onChange={(e) => onUpdateField('browser', e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-all"
          >
            <option value="default">Default Browser</option>
            {availableBrowsers.length > 0 ? (
              availableBrowsers.map((browserId) => {
                const displayName = browserId
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, (l) => l.toUpperCase())
                  .replace('Wsl', '(WSL)')
                  .replace('Stable', 'Stable')
                  .replace('Beta', 'Beta')
                  .replace('Dev', 'Dev');
                return (
                  <option key={browserId} value={browserId}>
                    {displayName}
                  </option>
                );
              })
            ) : (
              <>
                <option value="chrome-stable">Chrome Stable</option>
                <option value="chrome-beta">Chrome Beta</option>
                <option value="chrome-dev">Chrome Dev</option>
                <option value="edge-stable">Edge Stable</option>
                <option value="edge-beta">Edge Beta</option>
                <option value="edge-dev">Edge Dev</option>
                <option value="firefox">Firefox (WSL)</option>
              </>
            )}
          </select>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
            Select which browser should open this link. Requires browser extension to be installed.
          </p>
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
          Entrance Animation
        </label>
        <div className="flex items-center gap-3">
          <TileAnimationSelector
            persistGlobal={false}
            animationsOnly
            includeInherit
            value={linkAnimationForEdit(draft.animation)}
            onAnimationChange={(animation) => onUpdateField('animation', animation)}
            scopeLabel="Link Animation"
            scopeHint="Overrides space Links Animation when not Inherit"
            buttonTitle="Choose entrance animation for this link (or inherit space default)"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {getAnimationOption(linkAnimationForEdit(draft.animation)).name}
          </span>
        </div>
      </div>
      <div className={`rounded-xl border-2 p-3 ${LINK_EDIT_NEUTRAL_CARD}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span aria-hidden>🖥️</span> Device emulation on mobile preview
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              When on, the phone action opens a sized Device emulation window directly — no Device Preview dialog.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.mobilePreviewEmulation === true}
            onClick={() => onUpdateField('mobilePreviewEmulation', !(draft.mobilePreviewEmulation === true))}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
              draft.mobilePreviewEmulation === true ? 'bg-sky-600' : 'bg-slate-400 dark:bg-slate-600'
            }`}
            title={
              draft.mobilePreviewEmulation === true
                ? 'Mobile preview opens Device emulation window'
                : 'Mobile preview opens Device Preview dialog'
            }
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                draft.mobilePreviewEmulation === true ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
      <div className={`rounded-xl border-2 p-3 ${LINK_EDIT_NEUTRAL_CARD}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span aria-hidden>📱</span> Open link in Device emulation
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              When on, clicking this link opens a sized Device emulation window instead of the normal tab or browser.
              Notes, Info, and Maintenance dialogs still open first when enabled. Hold Ctrl/Cmd to open normally.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.openInEmulation === true}
            onClick={() => onUpdateField('openInEmulation', !(draft.openInEmulation === true))}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
              draft.openInEmulation === true ? 'bg-sky-600' : 'bg-slate-400 dark:bg-slate-600'
            }`}
            title={
              draft.openInEmulation === true
                ? 'Click opens Device emulation window'
                : 'Click uses normal Open Target'
            }
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                draft.openInEmulation === true ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );

  const restrictionsFields = (
    <AccessRestrictionsEditor
      compact
      embedded
      value={draft.accessRestrictions}
      disabled={canChangeVisibility === false}
      onChange={(next) => onPatchDraft({ accessRestrictions: next })}
    />
  );

  const tabBadge = (on: boolean, accent: string) =>
    on ? (
      <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
        plain ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : accent
      }`}>On</span>
    ) : null;

  const dialogTabContent = (() => {
    switch (activeTab) {
      case 'access': return accessFields;
      case 'basics': return basicsFields;
      case 'notes': return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notes & Tooltip</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Owner info, support details, hover text</div>
            </div>
            <LinkEditHeaderSwitch
              enabled={notesOn}
              onToggle={() => onUpdateField('notesEnabled', !notesOn)}
              onClassName={plain ? 'bg-slate-600' : 'bg-amber-500'}
              labelOn="Disable notes and tooltip"
              labelOff="Enable notes and tooltip"
            />
          </div>
          {notesFields}
        </div>
      );
      case 'info': return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Information Content</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Rich text dialog instead of opening the URL</div>
            </div>
            <LinkEditHeaderSwitch
              enabled={infoOn}
              onToggle={() => onUpdateField('richTextEnabled', !infoOn)}
              onClassName={plain ? 'bg-slate-600' : 'bg-violet-500'}
              labelOn="Disable information content"
              labelOff="Enable information content"
            />
          </div>
          {infoFields}
        </div>
      );
      case 'maintenance': return maintenanceFields;
      case 'advanced': return advancedFields;
      case 'restrictions': return (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-gradient-to-br from-rose-50 to-slate-50 dark:from-rose-950/30 dark:to-slate-900/40 p-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-xl dark:bg-rose-900/50 shadow-sm"
              aria-hidden
            >
              🛡️
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Extra gates when opening this link
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pick a category below — ⏰ time, 🌐 network, 💻 device, 🧭 browser, and more.
              </p>
            </div>
          </div>
          {restrictionsFields}
        </div>
      );
      default: return null;
    }
  })();

  const accordionBody = (
    <div className={`${plain
      ? 'bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600'
      : 'bg-gradient-to-br from-white via-slate-50 to-brand-50/40 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 border-2 border-brand-500 dark:border-brand-500/50'
    } rounded-xl p-4 shadow-lg space-y-3`}>
      <div className="flex items-center justify-between gap-2 pb-1 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0" aria-hidden>✏️</span>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Edit Link</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Organize access, content, and display options below
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <div className="flex items-center gap-1.5 pr-2 mr-0.5 border-r border-slate-200 dark:border-slate-600">
            <button
              type="button"
              onClick={onCollapseAll}
              className="px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
              title="Collapse all sections"
            >
              Collapse all
            </button>
            <button
              type="button"
              onClick={onExpandAll}
              className="px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-all"
              title="Expand all sections"
            >
              Expand all
            </button>
          </div>
          {viewModeToggle}
          {colorsToggle}
          {tooltipStyleToggle}
          {cancelSaveButtons}
        </div>
      </div>

      {accessFields}

      <LinkEditSection
        emoji="🔗"
        title="Basics"
        subtitle="Label, URL, emoji & color"
        accent="sky"
        defaultOpen
        foldNonce={foldNonce}
        foldOpen={foldOpen}
        plain={plain}
      >
        {basicsFields}
      </LinkEditSection>

      <LinkEditSection
        emoji="📝"
        title="Notes & Tooltip"
        subtitle="Owner info, support details, hover text"
        accent="amber"
        defaultOpen={!!(draft.notesEnabled || hasVisibleRichText(draft.notes) || hasVisibleRichText(draft.tooltip) || draft.notesVideoUrl || hasVisibleRichText(link.notes) || hasVisibleRichText(link.tooltip) || link.notesVideoUrl)}
        foldNonce={foldNonce}
        foldOpen={foldOpen}
        plain={plain}
        badge={
          notesOn ? (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
              plain
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                : 'bg-amber-200/80 dark:bg-amber-800/50 text-amber-800 dark:text-amber-200'
            }`}>On</span>
          ) : undefined
        }
        headerAction={
          <LinkEditHeaderSwitch
            enabled={notesOn}
            onToggle={() => onUpdateField('notesEnabled', !notesOn)}
            onClassName={plain ? 'bg-slate-600' : 'bg-amber-500'}
            labelOn="Disable notes and tooltip"
            labelOff="Enable notes and tooltip"
          />
        }
      >
        {notesFields}
      </LinkEditSection>

      <LinkEditSection
        emoji="📄"
        title="Information Content"
        subtitle="Rich text dialog instead of opening the URL"
        accent="violet"
        defaultOpen={!!(draft.richTextEnabled || draft.richTextContent || draft.infoVideoUrl || link.richTextContent || link.infoVideoUrl)}
        foldNonce={foldNonce}
        foldOpen={foldOpen}
        plain={plain}
        badge={
          infoOn ? (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
              plain
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                : 'bg-violet-200/80 dark:bg-violet-800/50 text-violet-800 dark:text-violet-200'
            }`}>On</span>
          ) : undefined
        }
        headerAction={
          <LinkEditHeaderSwitch
            enabled={infoOn}
            onToggle={() => onUpdateField('richTextEnabled', !infoOn)}
            onClassName={plain ? 'bg-slate-600' : 'bg-violet-500'}
            labelOn="Disable information content"
            labelOff="Enable information content"
          />
        }
      >
        {infoFields}
      </LinkEditSection>

      <LinkEditSection
        emoji="🔧"
        title="Maintenance"
        subtitle="Show a maintenance dialog instead of opening the URL"
        accent="amber"
        defaultOpen={!!(draft.maintenanceEnabled || draft.maintenanceMessage || draft.maintenanceVideoUrl)}
        foldNonce={foldNonce}
        foldOpen={foldOpen}
        plain={plain}
        badge={
          maintenanceOn ? (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
              plain
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                : 'bg-amber-200/80 dark:bg-amber-800/50 text-amber-800 dark:text-amber-200'
            }`}>On</span>
          ) : undefined
        }
      >
        {maintenanceFields}
      </LinkEditSection>

      <LinkEditSection
        emoji="⚙️"
        title="Advanced"
        subtitle="Browser target, animation & device emulation"
        accent="slate"
        defaultOpen={false}
        foldNonce={foldNonce}
        foldOpen={foldOpen}
        plain={plain}
      >
        {advancedFields}
      </LinkEditSection>

      <LinkEditSection
        emoji="🛡️"
        title="Additional access restrictions"
        subtitle="Optional extra gate when opening this link"
        accent="slate"
        defaultOpen={restrictionsOn}
        foldNonce={foldNonce}
        foldOpen={foldOpen}
        plain={plain}
        badge={<AccessRestrictionsBadge rules={draft.accessRestrictions} />}
      >
        {restrictionsFields}
      </LinkEditSection>

      {footerActions}
    </div>
  );

  const dialogPortal =
    viewMode === 'dialog-tabs' && typeof document !== 'undefined'
      ? createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 100060 }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" style={{ zIndex: 100059 }} onClick={onCancel} />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit Link"
        className={`bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl p-6 pb-8 relative shadow-2xl animate-in fade-in zoom-in duration-200 overflow-hidden flex flex-col ${isDragging ? 'cursor-move' : ''} ${isDragging || isResizing ? 'will-change-transform' : ''} ${dialogReady ? '' : 'opacity-0'}`}
        style={{
          zIndex: 100060,
          width: dialogReady ? `${modalSize.width}px` : '768px',
          maxWidth: '90vw',
          minWidth: `${MIN_DIALOG_WIDTH}px`,
          height: dialogReady ? `${modalSize.height}px` : '700px',
          maxHeight: '90vh',
          minHeight: `${MIN_DIALOG_HEIGHT}px`,
          left: dialogReady ? `${modalPosition.x}px` : 'auto',
          top: dialogReady ? `${modalPosition.y}px` : 'auto',
          position: dialogReady ? 'absolute' : 'relative',
          transition: isDragging || isResizing ? 'none' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <SpaceModalHeader
          emoji="✏️"
          eyebrow="Edit Link"
          title={draft.label?.trim() || 'Untitled link'}
          subtitle="Organize access, content, and display options"
          onClose={onCancel}
          onMouseDown={handleDragStart}
        />
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end -mt-2 mb-3">
          {!dialogOnly && viewModeToggle}
          {cancelSaveButtons}
        </div>
        <div className="flex gap-1.5 mb-4 border-b border-slate-200 dark:border-slate-700 overflow-x-auto shrink-0">
          {TABS.map((tab) => (
            <EditModalTabButton
              key={tab.id}
              active={activeTab === tab.id}
              emoji={tab.emoji}
              label={
                <span className="inline-flex items-center">
                  {tab.label}
                  {tab.id === 'notes' && tabBadge(notesOn, 'bg-amber-200/80 dark:bg-amber-800/50 text-amber-800 dark:text-amber-200')}
                  {tab.id === 'info' && tabBadge(infoOn, 'bg-violet-200/80 dark:bg-violet-800/50 text-violet-800 dark:text-violet-200')}
                  {tab.id === 'maintenance' && tabBadge(maintenanceOn, 'bg-amber-200/80 dark:bg-amber-800/50 text-amber-800 dark:text-amber-200')}
                  {tab.id === 'restrictions' && tabBadge(restrictionsOn, 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200')}
                </span>
              }
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>
        <div className="flex-1 overflow-y-auto pr-1 min-h-0 space-y-3">
          {dialogTabContent}
        </div>
        <div className="shrink-0 mt-3">
          {footerActions}
        </div>
        {/* Bottom drag strip — reachable if the header is off-screen */}
        <div
          onMouseDown={handleDragStart}
          className={`absolute left-0 right-6 bottom-0 h-7 cursor-move flex items-center justify-center gap-1.5 select-none border-t border-slate-200/80 dark:border-slate-700/80 ${
            isDragging
              ? 'bg-sky-100/90 dark:bg-sky-950/50'
              : 'bg-slate-50/95 dark:bg-slate-800/95 hover:bg-slate-100 dark:hover:bg-slate-700/80'
          }`}
          style={{ zIndex: 100069 }}
          title="Drag to move"
          role="presentation"
        >
          <span className="w-8 h-1 rounded-full bg-slate-300 dark:bg-slate-500" aria-hidden />
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Drag
          </span>
          <span className="w-8 h-1 rounded-full bg-slate-300 dark:bg-slate-500" aria-hidden />
        </div>
        <div
          data-resize-handle
          onMouseDown={handleResizeStart}
          className={`absolute bottom-0 right-0 w-6 h-7 cursor-nwse-resize flex items-end justify-end ${isResizing ? 'bg-brand-500/20' : 'hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
          style={{ zIndex: 100070 }}
          title="Resize"
          aria-hidden
        >
          <div className="w-4 h-4 relative mb-0.5 mr-0.5">
            <div className="absolute bottom-0 right-0 w-3 h-3 border-r-2 border-b-2 border-slate-400 dark:border-slate-500 rounded-br-lg" />
            <div className="absolute bottom-1 right-1 w-2 h-2 border-r border-b border-slate-400 dark:border-slate-500 rounded-br" />
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
      : null;

  if (viewMode === 'dialog-tabs') {
    if (dialogOnly) {
      return dialogPortal;
    }
    return (
      <>
        <div
          className="flex items-center gap-2 p-2.5 rounded-xl border-2 border-brand-400 dark:border-brand-500/60 bg-brand-50/80 dark:bg-brand-950/30 shadow-sm"
        >
          <span className="text-lg" aria-hidden>✏️</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              Editing in popup
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {draft.label?.trim() || 'Untitled link'} — use the dialog tabs to navigate sections
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {viewModeToggle}
            {cancelSaveButtons}
          </div>
        </div>
        {dialogPortal}
      </>
    );
  }

  return accordionBody;
};

export default EditLinkForm;
