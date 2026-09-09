"use client";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { useId, useState, type ReactNode, type SyntheticEvent } from "react";
function isControl(event: SyntheticEvent) {
  return (
    event.target instanceof Element &&
    !!event.target.closest(
      'button,input,textarea,select,a,label,summary,[contenteditable="true"],[data-no-drag]',
    )
  );
}
function Row({
  id,
  children,
  surface,
  label,
  over,
}: {
  id: string;
  children: ReactNode;
  surface: boolean;
  label: string;
  over: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      data-dragging={isDragging || undefined}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      className={`relative ${surface ? "rounded-xl cursor-grab focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700" : ""} ${isDragging ? "z-20 cursor-grabbing shadow-xl opacity-80" : over ? "ring-2 ring-teal-600 ring-offset-2" : ""}`}
      {...(surface
        ? {
            ...attributes,
            role: "group",
            "aria-label": label,
            "aria-roledescription": "sortable card",
            onMouseDown: (e: React.MouseEvent) => {
              if (!isControl(e)) listeners?.onMouseDown?.(e);
            },
            onTouchStart: (e: React.TouchEvent) => {
              if (!isControl(e)) listeners?.onTouchStart?.(e);
            },
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.target === e.currentTarget) listeners?.onKeyDown?.(e);
            },
          }
        : {})}
    >
      {!surface && (
        <button
          type="button"
          className="btn-secondary my-2 cursor-grab touch-none"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          ⠿ Move
        </button>
      )}
      {children}
    </div>
  );
}
export function SortableList<T extends { id: string }>({
  items,
  onChange,
  render,
  surface = false,
  label = (item: T) => item.id,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, index: number) => ReactNode;
  surface?: boolean;
  label?: (item: T) => string;
}) {
  const contextId = useId();
  const [active, setActive] = useState<string | null>(null),
    [over, setOver] = useState<string | null>(null);
  const pointer = useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    mouse = useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    touch = useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 6 },
    }),
    keyboard = useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    });
  const sensors = useSensors(
    surface ? mouse : pointer,
    surface ? touch : undefined,
    keyboard,
  );
  return (
    <DndContext
      id={contextId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActive(String(active.id))}
      onDragOver={({ over }) => setOver(over ? String(over.id) : null)}
      onDragCancel={() => {
        setActive(null);
        setOver(null);
      }}
      onDragEnd={({ active, over }) => {
        setActive(null);
        setOver(null);
        if (over && active.id !== over.id)
          onChange(
            arrayMove(
              items,
              items.findIndex((i) => i.id === active.id),
              items.findIndex((i) => i.id === over.id),
            ),
          );
      }}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={surface ? "space-y-3" : undefined}>
          {items.map((item, i) => (
            <Row
              key={item.id}
              id={item.id}
              surface={surface}
              label={label(item)}
              over={active !== null && over === item.id && active !== item.id}
            >
              {render(item, i)}
            </Row>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
