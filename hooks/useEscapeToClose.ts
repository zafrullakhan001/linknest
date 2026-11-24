import { useEffect, useRef } from 'react';

export interface UseEscapeToCloseOptions {
  /** When false, the listener is not attached. Defaults to true. */
  enabled?: boolean;
  /**
   * Use capture phase so Escape is handled before floating widgets
   * that also listen for Escape. Defaults to true.
   */
  capture?: boolean;
}

type EscapeStackEntry = {
  id: number;
  onClose: () => void;
};

/** LIFO stack so nested dialogs close top-first on Escape. */
const escapeStack: EscapeStackEntry[] = [];
let nextEscapeId = 1;
let globalListenerAttached = false;

/** Tracks how many Esc-closable dialogs are currently open (for widget handlers). */
let openEscapeDialogCount = 0;

function syncEscapeDialogDataset(): void {
  if (typeof document === 'undefined') return;
  if (openEscapeDialogCount > 0) {
    document.documentElement.dataset.escapeDialogOpen = String(openEscapeDialogCount);
  } else {
    delete document.documentElement.dataset.escapeDialogOpen;
  }
}

/** True when at least one Esc-closable dialog is open. */
export function isEscapeDialogOpen(): boolean {
  return openEscapeDialogCount > 0;
}

function handleGlobalEscapeKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' && e.key !== 'Esc') return;
  if (escapeStack.length === 0) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const top = escapeStack[escapeStack.length - 1];
  top?.onClose();
}

function ensureGlobalListener(capture: boolean): void {
  if (globalListenerAttached || typeof window === 'undefined') return;
  window.addEventListener('keydown', handleGlobalEscapeKeyDown, capture);
  globalListenerAttached = true;
  (ensureGlobalListener as { capture?: boolean }).capture = capture;
}

function releaseGlobalListenerIfIdle(): void {
  if (escapeStack.length > 0 || !globalListenerAttached || typeof window === 'undefined') return;
  const capture = (ensureGlobalListener as { capture?: boolean }).capture ?? true;
  window.removeEventListener('keydown', handleGlobalEscapeKeyDown, capture);
  globalListenerAttached = false;
}

/**
 * Closes a dialog/modal when the user presses Escape.
 * Nested dialogs close top-first: only the most recently opened
 * Esc-closable dialog receives the keypress.
 */
export function useEscapeToClose(
  isOpen: boolean,
  onClose: () => void,
  options: UseEscapeToCloseOptions = {}
): void {
  const { enabled = true, capture = true } = options;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || !enabled) return;

    const id = nextEscapeId++;
    const entry: EscapeStackEntry = {
      id,
      onClose: () => onCloseRef.current(),
    };
    escapeStack.push(entry);
    openEscapeDialogCount += 1;
    syncEscapeDialogDataset();
    ensureGlobalListener(capture);

    return () => {
      const index = escapeStack.findIndex((item) => item.id === id);
      if (index >= 0) escapeStack.splice(index, 1);
      openEscapeDialogCount = Math.max(0, openEscapeDialogCount - 1);
      syncEscapeDialogDataset();
      releaseGlobalListenerIfIdle();
    };
  }, [isOpen, enabled, capture]);
}
