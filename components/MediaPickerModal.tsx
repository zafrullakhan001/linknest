import React from 'react';
import { createPortal } from 'react-dom';
import { MediaLibrary } from './MediaLibrary';
import type { MediaFile } from '../types';
import { mediaFileToInsertHtml } from '../services/mediaService';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

/** Above TinyMCE fullscreen overlay (2147483000) and typical app dialogs. */
const MEDIA_PICKER_Z = 2147483646;

interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onInsertHtml: (html: string) => void;
  /** Optionally receive the file as well */
  onInsertFile?: (file: MediaFile) => void;
}

export const MediaPickerModal: React.FC<MediaPickerModalProps> = ({
  open,
  onClose,
  onInsertHtml,
  onInsertFile,
}) => {
  // Nested above TinyMCE fullscreen so Escape closes the picker first.
  useEscapeToClose(open, onClose);

  if (!open) return null;

  const handleSelect = (file: MediaFile) => {
    onInsertFile?.(file);
    onInsertHtml(mediaFileToInsertHtml(file));
    onClose();
  };

  const handleInsertHtml = (html: string) => {
    onInsertHtml(html);
    onClose();
  };

  // Portal to body so the picker stacks above TinyMCE's fullscreen overlay
  // (in-tree fixed + z-index loses when ancestors create a stacking context).
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4"
      style={{ zIndex: MEDIA_PICKER_Z }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Insert from Media Library"
    >
      <div
        className="w-full max-w-5xl h-[min(80vh,700px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <MediaLibrary
          mode="picker"
          compact
          onClose={onClose}
          onSelect={handleSelect}
          onInsertHtml={handleInsertHtml}
        />
      </div>
    </div>,
    document.body
  );
};
