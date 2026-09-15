import { useCallback, useEffect, useRef, useState } from 'react';

export type DialogPoint = { x: number; y: number };
export type DialogSize = { width: number; height: number };

export interface UseDraggableResizableDialogOptions {
  open: boolean;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  minVisible?: number;
  /** When set, position and size are restored from and saved to localStorage. */
  storageKey?: string;
}

const clampNum = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function getCssZoom(): number {
  const raw = getComputedStyle(document.documentElement).zoom;
  const z = raw && raw !== 'normal' ? Number.parseFloat(raw) : 1;
  return Number.isFinite(z) && z > 0 ? z : 1;
}

function getViewportSize() {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}

function getLayoutViewport() {
  const { width: vvW, height: vvH } = getViewportSize();
  const zoom = getCssZoom();
  return { width: vvW / zoom, height: vvH / zoom, zoom };
}

function defaultDialogSize(defaultWidth: number, defaultHeight: number, minWidth: number, minHeight: number): DialogSize {
  const { width: layoutW, height: layoutH } = getLayoutViewport();
  return {
    width: clampNum(Math.min(defaultWidth, layoutW - 32), minWidth, Math.max(minWidth, layoutW - 24)),
    height: clampNum(Math.min(defaultHeight, layoutH - 32), minHeight, Math.max(minHeight, layoutH - 24)),
  };
}

function centeredDialogPos(size: DialogSize): DialogPoint {
  const { width: layoutW, height: layoutH } = getLayoutViewport();
  return {
    x: Math.max(12, Math.round((layoutW - size.width) / 2)),
    y: Math.max(12, Math.round((layoutH - size.height) / 2)),
  };
}

function clampDialogPos(p: DialogPoint, size: DialogSize, minVisible: number): DialogPoint {
  const { width: layoutW, height: layoutH } = getLayoutViewport();
  return {
    x: clampNum(p.x, -size.width + minVisible, layoutW - minVisible),
    y: clampNum(p.y, -size.height + minVisible, layoutH - minVisible),
  };
}

function clampDialogSize(size: DialogSize, pos: DialogPoint, minWidth: number, minHeight: number): DialogSize {
  const { width: layoutW, height: layoutH } = getLayoutViewport();
  return {
    width: clampNum(size.width, minWidth, Math.max(minWidth, layoutW - Math.max(0, pos.x) - 8)),
    height: clampNum(size.height, minHeight, Math.max(minHeight, layoutH - Math.max(0, pos.y) - 8)),
  };
}

function loadStoredDialogGeom(key: string): { pos: DialogPoint; size: DialogSize } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number' ||
      !Number.isFinite(parsed.x) ||
      !Number.isFinite(parsed.y) ||
      !Number.isFinite(parsed.width) ||
      !Number.isFinite(parsed.height)
    ) {
      return null;
    }
    return {
      pos: { x: parsed.x, y: parsed.y },
      size: { width: parsed.width, height: parsed.height },
    };
  } catch {
    return null;
  }
}

function saveStoredDialogGeom(key: string, pos: DialogPoint, size: DialogSize): void {
  if (size.width <= 0 || size.height <= 0) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ x: pos.x, y: pos.y, width: size.width, height: size.height })
    );
  } catch {
    /* ignore quota / private mode */
  }
}

export function useDraggableResizableDialog({
  open,
  defaultWidth = 768,
  defaultHeight = 720,
  minWidth = 360,
  minHeight = 320,
  minVisible = 64,
  storageKey,
}: UseDraggableResizableDialogOptions) {
  const [modalPosition, setModalPosition] = useState<DialogPoint>({ x: 0, y: 0 });
  const [modalSize, setModalSize] = useState<DialogSize>({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const modalPositionRef = useRef<DialogPoint>({ x: 0, y: 0 });
  const modalSizeRef = useRef<DialogSize>({ width: 0, height: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setModalPosition({ x: 0, y: 0 });
      setModalSize({ width: 0, height: 0 });
      modalPositionRef.current = { x: 0, y: 0 };
      modalSizeRef.current = { width: 0, height: 0 };
      return;
    }

    let nextSize = clampDialogSize(
      defaultDialogSize(defaultWidth, defaultHeight, minWidth, minHeight),
      { x: 0, y: 0 },
      minWidth,
      minHeight
    );
    let nextPos = clampDialogPos(centeredDialogPos(nextSize), nextSize, minVisible);

    if (storageKey) {
      const stored = loadStoredDialogGeom(storageKey);
      if (stored) {
        nextSize = clampDialogSize(stored.size, stored.pos, minWidth, minHeight);
        nextPos = clampDialogPos(stored.pos, nextSize, minVisible);
        nextSize = clampDialogSize(nextSize, nextPos, minWidth, minHeight);
      }
    }

    setModalSize(nextSize);
    setModalPosition(nextPos);
    modalSizeRef.current = nextSize;
    modalPositionRef.current = nextPos;
  }, [open, defaultWidth, defaultHeight, minWidth, minHeight, minVisible, storageKey]);

  useEffect(() => {
    if (!isDragging && !isResizing) {
      modalPositionRef.current = modalPosition;
      modalSizeRef.current = modalSize;
    }
  }, [modalPosition, modalSize, isDragging, isResizing]);

  useEffect(() => {
    if (!open || modalSize.width === 0) return;

    const reclamp = () => {
      const nextSize = clampDialogSize(modalSizeRef.current, modalPositionRef.current, minWidth, minHeight);
      const nextPos = clampDialogPos(modalPositionRef.current, nextSize, minVisible);
      modalSizeRef.current = nextSize;
      modalPositionRef.current = nextPos;
      setModalSize(nextSize);
      setModalPosition(nextPos);
      if (modalRef.current) {
        modalRef.current.style.left = `${nextPos.x}px`;
        modalRef.current.style.top = `${nextPos.y}px`;
        modalRef.current.style.width = `${nextSize.width}px`;
        modalRef.current.style.height = `${nextSize.height}px`;
      }
      if (storageKey) {
        saveStoredDialogGeom(storageKey, nextPos, nextSize);
      }
    };

    window.addEventListener('resize', reclamp);
    window.visualViewport?.addEventListener('resize', reclamp);
    window.visualViewport?.addEventListener('scroll', reclamp);
    return () => {
      window.removeEventListener('resize', reclamp);
      window.visualViewport?.removeEventListener('resize', reclamp);
      window.visualViewport?.removeEventListener('scroll', reclamp);
    };
  }, [open, modalSize.width, minWidth, minHeight, minVisible, storageKey]);

  const handleDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, summary, details')) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: modalPositionRef.current.x,
      posY: modalPositionRef.current.y,
    };
  };

  const handleDrag = useCallback(
    (e: MouseEvent) => {
      if (!modalRef.current) return;
      const zoom = getCssZoom();
      const next = clampDialogPos(
        {
          x: dragStartRef.current.posX + (e.clientX - dragStartRef.current.x) / zoom,
          y: dragStartRef.current.posY + (e.clientY - dragStartRef.current.y) / zoom,
        },
        modalSizeRef.current,
        minVisible
      );
      modalPositionRef.current = next;
      modalRef.current.style.left = `${next.x}px`;
      modalRef.current.style.top = `${next.y}px`;
    },
    [minVisible]
  );

  const handleDragEnd = useCallback(() => {
    setModalPosition(modalPositionRef.current);
    setIsDragging(false);
    if (storageKey) {
      saveStoredDialogGeom(storageKey, modalPositionRef.current, modalSizeRef.current);
    }
  }, [storageKey]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!modalRef.current) return;
    setIsResizing(true);
    const rect = modalRef.current.getBoundingClientRect();
    const zoom = getCssZoom();
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: rect.width / zoom,
      height: rect.height / zoom,
    };
  };

  const handleResize = useCallback(
    (e: MouseEvent) => {
      if (!modalRef.current) return;
      const zoom = getCssZoom();
      const dx = (e.clientX - resizeStartRef.current.x) / zoom;
      const dy = (e.clientY - resizeStartRef.current.y) / zoom;
      const nextSize = clampDialogSize(
        {
          width: resizeStartRef.current.width + dx,
          height: resizeStartRef.current.height + dy,
        },
        modalPositionRef.current,
        minWidth,
        minHeight
      );
      modalSizeRef.current = nextSize;
      modalRef.current.style.width = `${nextSize.width}px`;
      modalRef.current.style.height = `${nextSize.height}px`;
    },
    [minWidth, minHeight]
  );

  const handleResizeEnd = useCallback(() => {
    setModalSize(modalSizeRef.current);
    setIsResizing(false);
    if (storageKey) {
      saveStoredDialogGeom(storageKey, modalPositionRef.current, modalSizeRef.current);
    }
  }, [storageKey]);

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

  return {
    modalRef,
    modalPosition,
    modalSize,
    isDragging,
    isResizing,
    handleDragStart,
    handleResizeStart,
    isReady: modalSize.width > 0,
  };
}
