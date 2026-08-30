import React, { useEffect } from 'react';
import { MediaLibrary } from './MediaLibrary';
import type { MediaFile } from '../types';
import { mediaFileToInsertHtml } from '../services/mediaService';

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const handleSelect = (file: MediaFile) => {
    onInsertFile?.(file);
    onInsertHtml(mediaFileToInsertHtml(file));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2147483645] flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4" onClick={onClose}>
      <div
        className="w-full max-w-5xl h-[min(80vh,700px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <MediaLibrary mode="picker" compact onClose={onClose} onSelect={handleSelect} />
      </div>
    </div>
  );
};
