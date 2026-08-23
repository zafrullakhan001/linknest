import React from 'react';
import { useDndContext } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SOFT_TRANSITION = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms ease, background-color 180ms ease, opacity 160ms ease';

type DragHandleProps = {
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: ReturnType<typeof useSortable>['listeners'];
  isDragging: boolean;
};

type DragHandleRender = (props: DragHandleProps) => React.ReactNode;

function DropLine({ position }: { position: 'before' | 'after' }) {
  return (
    <div
      className={`pointer-events-none absolute left-0 right-0 z-50 flex items-center ${
        position === 'before' ? '-top-2.5' : '-bottom-2.5'
      }`}
      aria-hidden
    >
      <span className="h-2.5 w-2.5 rounded-full bg-brand-500 shadow-[0_0_0_3px_rgba(59,130,246,0.35)] shrink-0" />
      <span className="flex-1 h-[3px] rounded-full bg-gradient-to-r from-brand-500 via-brand-400 to-brand-500 shadow-[0_0_10px_rgba(59,130,246,0.55)]" />
      <span className="h-2.5 w-2.5 rounded-full bg-brand-500 shadow-[0_0_0_3px_rgba(59,130,246,0.35)] shrink-0" />
    </div>
  );
}

/** Soft sortable wrapper — item follows the pointer; drop-line shows insert position. */
export const ViewModeSortable: React.FC<{
  id: string;
  htmlId?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Prefer vertical list indicators (default). Grid layouts still get a soft ring. */
  layout?: 'list' | 'grid';
  children: React.ReactNode | DragHandleRender;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'id' | 'children' | 'style' | 'className'>> = ({
  id,
  htmlId,
  disabled = false,
  className,
  style,
  layout = 'list',
  children,
  ...rest
}) => {
  const { active, over } = useDndContext();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
  });

  const isOverTarget =
    !!active &&
    !!over &&
    String(over.id) === String(id) &&
    String(active.id) !== String(id);

  let dropLine: 'before' | 'after' | null = null;
  if (isOverTarget && layout === 'list') {
    const activeIndex = active?.data?.current?.sortable?.index;
    const overIndex = over?.data?.current?.sortable?.index;
    if (typeof activeIndex === 'number' && typeof overIndex === 'number') {
      dropLine = activeIndex < overIndex ? 'after' : 'before';
    } else {
      dropLine = 'before';
    }
  }

  const content =
    typeof children === 'function'
      ? (children as DragHandleRender)({ attributes, listeners, isDragging })
      : children;

  const mergedStyle: React.CSSProperties = {
    ...style,
    transform: CSS.Translate.toString(transform),
    // Entrance animations (animate-in / pageAnimation) own `transform` and would
    // hide the drag preview — kill them for the duration of the drag.
    ...(isDragging
      ? {
          animation: 'none',
          transition: undefined,
          opacity: 0.95,
          zIndex: 200,
          cursor: 'grabbing' as const,
          boxShadow: '0 16px 36px -10px rgba(37, 99, 235, 0.4), 0 6px 14px -4px rgba(15, 23, 42, 0.2)',
          willChange: 'transform',
        }
      : {
          transition: transition ?? SOFT_TRANSITION,
          zIndex: isOverTarget ? 5 : undefined,
        }),
    position: 'relative',
  };

  return (
    <div
      ref={setNodeRef}
      id={htmlId}
      className={[
        className,
        'overflow-visible',
        !isDragging ? 'transition-[box-shadow,background-color,opacity] duration-200 ease-out' : 'animate-none',
        isDragging
          ? 'ring-2 ring-brand-400/90 dark:ring-brand-400/70 bg-white dark:bg-slate-800 shadow-xl'
          : '',
        isOverTarget && !isDragging
          ? 'ring-2 ring-brand-400/70 dark:ring-brand-400/50 bg-brand-50/60 dark:bg-brand-900/25 shadow-md shadow-brand-500/10'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={mergedStyle}
      data-dragging={isDragging ? 'true' : 'false'}
      data-drop-target={isOverTarget ? 'true' : 'false'}
      {...rest}
    >
      {dropLine && <DropLine position={dropLine} />}
      {content}
    </div>
  );
};

export const ViewModeDragHandle: React.FC<{
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: ReturnType<typeof useSortable>['listeners'];
  title?: string;
  className?: string;
}> = ({ attributes, listeners, title = 'Drag to reorder', className = '' }) => (
  <button
    type="button"
    className={`p-1.5 rounded-lg text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40 cursor-grab active:cursor-grabbing touch-none shrink-0 transition-colors ${className}`}
    title={title}
    aria-label={title}
    {...attributes}
    {...listeners}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
    }}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden>
      <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zM7 10a1 1 0 11-2 0 1 1 0 012 0zM7 16a1 1 0 11-2 0 1 1 0 012 0zM13 4a1 1 0 11-2 0 1 1 0 012 0zM13 10a1 1 0 11-2 0 1 1 0 012 0zM13 16a1 1 0 11-2 0 1 1 0 012 0z" />
    </svg>
  </button>
);
