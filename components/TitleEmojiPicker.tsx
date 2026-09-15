import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EmojiPickerPopover } from './EmojiPickerPanel';
import { uploadTileEmojiImage } from '../services/storageService';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface TitleEmojiPickerProps {
  value?: string;
  onChange: (emoji: string) => void;
  /** When provided with onImageChange, enables tile-emoji / upload / catalog menu. */
  imageUrl?: string | null;
  onImageChange?: (url: string | null) => void;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}

type MenuMode = 'closed' | 'menu' | 'emoji';

interface MenuPos {
  top: number;
  left: number;
  width: number;
}

/** Compact emoji picker shown to the left of tab/section titles.
 *  Pass imageUrl + onImageChange for page/tile icon (emoji, upload, or catalog). */
export const TitleEmojiPicker: React.FC<TitleEmojiPickerProps> = ({
  value = '',
  onChange,
  imageUrl,
  onImageChange,
  size = 'md',
  title = 'Choose emoji',
}) => {
  const supportsImage = typeof onImageChange === 'function';
  const [mode, setMode] = useState<MenuMode>('closed');
  const [uploading, setUploading] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const emoji = (value || '').trim();
  const image = (imageUrl || '').trim();
  const hasIcon = Boolean(image || emoji);
  const btnSize = size === 'lg' ? 'w-16 h-14 text-2xl' : size === 'sm' ? 'w-7 h-7 text-sm' : 'w-9 h-9 text-lg';

  const closeAll = () => setMode('closed');

  useEscapeToClose(mode !== 'closed', closeAll);

  useLayoutEffect(() => {
    if (mode !== 'menu') {
      setMenuPos(null);
      return;
    }
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 200;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = rect.bottom + 6;
    setMenuPos({ top, left, width });
  }, [mode]);

  useEffect(() => {
    if (mode !== 'menu') return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      closeAll();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [mode]);

  const handleMainClick = () => {
    if (!supportsImage) {
      setMode((m) => (m === 'emoji' ? 'closed' : 'emoji'));
      return;
    }
    setMode((m) => (m === 'menu' ? 'closed' : 'menu'));
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (supportsImage && image) {
      onImageChange!(null);
    } else {
      onChange('');
      if (supportsImage) onImageChange!(null);
    }
    closeAll();
  };

  const handleUseTileEmoji = () => {
    if (supportsImage) onImageChange!(null);
    closeAll();
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onImageChange) return;
    setUploading(true);
    try {
      const url = await uploadTileEmojiImage(file);
      onImageChange(url);
      closeAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload emoji image');
    } finally {
      setUploading(false);
    }
  };

  const handleChooseEmoji = () => {
    setMode('emoji');
  };

  const handleEmojiSelect = (next: string) => {
    onChange(next);
    if (supportsImage) onImageChange!(null);
    closeAll();
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={handleMainClick}
        disabled={uploading}
        className={`ln-icon-btn ${btnSize} p-0 appearance-none rounded-lg border-2 flex items-center justify-center transition-all overflow-hidden ${
          hasIcon
            ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:border-brand-400'
            : 'bg-slate-50 dark:bg-slate-900/50 border-dashed border-slate-300 dark:border-slate-600 hover:border-brand-400 text-slate-400'
        } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
        title={title}
        aria-label={title}
        aria-expanded={mode !== 'closed'}
        aria-haspopup={supportsImage ? 'menu' : 'dialog'}
      >
        {image ? (
          <img src={image} alt="" className="w-full h-full object-contain p-1" draggable={false} />
        ) : (
          <span aria-hidden>{emoji || '😀'}</span>
        )}
      </button>
      {hasIcon ? (
        <button
          type="button"
          onClick={handleClear}
          className="ln-icon-btn absolute -top-1 -right-1 w-3.5 h-3.5 p-0 appearance-none min-h-0 min-w-0 rounded-full bg-slate-500 hover:bg-red-500 text-white text-[9px] leading-none flex items-center justify-center z-10"
          title={image ? 'Clear image' : 'Clear emoji'}
        >
          ×
        </button>
      ) : null}

      {supportsImage && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,.jpg,.jpeg,.png,.gif,.webp,.bmp"
          className="hidden"
          disabled={uploading}
          onChange={handleFileChange}
        />
      )}

      {supportsImage && mode === 'menu' && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Icon source"
              className="fixed z-[10051] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl py-1 overflow-hidden"
              style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleUseTileEmoji}
                className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
              >
                <span className="text-base w-6 text-center shrink-0">{emoji || '📁'}</span>
                <span>Use tile emoji</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleUploadClick}
                disabled={uploading}
                className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 disabled:opacity-60"
              >
                <span className="text-base w-6 text-center shrink-0" aria-hidden>
                  🖼
                </span>
                <span>{uploading ? 'Uploading…' : image ? 'Replace image' : 'Upload image'}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleChooseEmoji}
                className="w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
              >
                <span className="text-base w-6 text-center shrink-0" aria-hidden>
                  😀
                </span>
                <span>Choose emoji</span>
              </button>
            </div>,
            document.body
          )
        : null}

      <EmojiPickerPopover
        open={mode === 'emoji'}
        onClose={closeAll}
        onSelect={handleEmojiSelect}
        anchorRef={btnRef}
        currentValue={emoji}
      />
    </div>
  );
};
