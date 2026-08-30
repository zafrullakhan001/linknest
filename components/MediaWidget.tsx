import React, { useEffect } from 'react';
import { isEscapeDialogOpen } from '../hooks/useEscapeToClose';
import { MediaLibrary } from './MediaLibrary';

interface MediaWidgetProps {
  onClose?: () => void;
}

export const MediaWidget: React.FC<MediaWidgetProps> = ({ onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isEscapeDialogOpen()) return;
      e.preventDefault();
      onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="h-full rounded-xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
      <MediaLibrary mode="manage" compact onClose={onClose} />
    </div>
  );
};
