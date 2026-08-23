import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type DragHandleBag = {
  attributes: React.HTMLAttributes<HTMLElement>;
  // dnd-kit synthetic listeners
  listeners: ReturnType<typeof useSortable>['listeners'];
  isDragging: boolean;
};

type DragHandleRender = (props: DragHandleBag) => React.ReactNode;

/** Thin sortable wrapper for view-mode section / link cards. */
export const ViewModeSortable: React.FC<{
  id: string;
  htmlId?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode | DragHandleRender;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'id' | 'children' | 'style' | 'className'>> = ({
  id,
  htmlId,
  disabled = false,
  className,
  style,
  children,
  ...rest
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const mergedStyle: React.CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : undefined,
    zIndex: isDragging ? 20 : undefined,
    position: isDragging ? 'relative' : style?.position,
    outline: isDragging ? '2px dashed rgb(96 165 250)' : undefined,
    outlineOffset: isDragging ? 2 : undefined,
  };

  const content =
    typeof children === 'function'
      ? (children as DragHandleRender)({ attributes, listeners, isDragging })
      : children;

  return (
    <div
      ref={setNodeRef}
      id={htmlId}
      className={className}
      style={mergedStyle}
      data-dragging={isDragging ? 'true' : 'false'}
      {...rest}
    >
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
    className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-grab active:cursor-grabbing touch-none shrink-0 ${className}`}
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
