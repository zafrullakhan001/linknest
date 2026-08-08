import { useEffect } from 'react';

export interface UseEscapeToCloseOptions {
  /** When false, the listener is not attached. Defaults to true. */
  enabled?: boolean;
  /**
   * Use capture phase so Escape is handled before floating widgets
   * that also listen for Escape. Defaults to true.
   */
  capture?: boolean;
}

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

/**
 * Closes a dialog/modal when the user presses Escape.
 * Prefer this over ad-hoc keydown listeners so behavior stays consistent.
 */
export function useEscapeToClose(
  isOpen: boolean,
  onClose: () => void,
  options: UseEscapeToCloseOptions = {}
): void {
  const { enabled = true, capture = true } = options;

  useEffect(() => {
    if (!isOpen || !enabled) return;

    openEscapeDialogCount += 1;
    syncEscapeDialogDataset();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      onClose();
    };

    // Capture + register after typical widget listeners so this runs first among
    // same-target capture handlers that were already attached when the dialog opened.
    window.addEventListener('keydown', handleKeyDown, capture);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, capture);
      openEscapeDialogCount = Math.max(0, openEscapeDialogCount - 1);
      syncEscapeDialogDataset();
    };
  }, [isOpen, onClose, enabled, capture]);
}
