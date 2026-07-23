"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface KanbanColumn {
  id: string;
  label: string;
  /** Tailwind text/bg accent classes for the column header dot, e.g. "bg-info-500" */
  color?: string;
}

interface KanbanBoardProps<T> {
  columns: KanbanColumn[];
  items: T[];
  getItemId: (item: T) => string;
  getItemColumnId: (item: T) => string;
  renderCard: (item: T) => React.ReactNode;
  onMoveItem?: (itemId: string, toColumnId: string) => void;
  emptyColumnLabel?: string;
  className?: string;
  /** Optional extra line rendered under the column label (e.g. a pipeline value total). */
  renderColumnMeta?: (columnId: string) => React.ReactNode;
  /** Optional footer rendered below the card list in each column (e.g. an "Add" affordance). */
  renderColumnFooter?: (columnId: string) => React.ReactNode;
}

/**
 * Lightweight Kanban board using native HTML5 drag-and-drop — no external library.
 * Optimistic moves are the caller's responsibility via onMoveItem.
 */
export function KanbanBoard<T>({
  columns,
  items,
  getItemId,
  getItemColumnId,
  renderCard,
  onMoveItem,
  emptyColumnLabel = "No items in this stage",
  className,
  renderColumnMeta,
  renderColumnFooter,
}: KanbanBoardProps<T>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  function handleDrop(columnId: string) {
    if (draggingId && onMoveItem) onMoveItem(draggingId, columnId);
    setDraggingId(null);
    setOverColumn(null);
  }

  return (
    <div className={cn("flex gap-4 overflow-x-auto pb-4", className)}>
      {columns.map((col) => {
        const colItems = items.filter((it) => getItemColumnId(it) === col.id);
        return (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOverColumn(col.id);
            }}
            onDragLeave={() => setOverColumn((c) => (c === col.id ? null : c))}
            onDrop={() => handleDrop(col.id)}
            className={cn(
              "flex flex-col w-[280px] shrink-0 rounded-xl border bg-surface-50/60 transition-colors",
              overColumn === col.id ? "border-brand-400 bg-brand-50/40" : "border-surface-200"
            )}
          >
            <div className="flex items-center gap-2 px-3.5 py-3 border-b border-surface-200">
              <span className={cn("w-2 h-2 rounded-full shrink-0", col.color ?? "bg-surface-400")} />
              <div className="min-w-0">
                <span className="text-sm font-semibold text-surface-800">{col.label}</span>
                {renderColumnMeta && (
                  <div className="text-[11px] text-surface-400 leading-tight">{renderColumnMeta(col.id)}</div>
                )}
              </div>
              <span className="ml-auto shrink-0 text-xs font-medium text-surface-400 bg-surface-100 rounded-full px-2 py-0.5">
                {colItems.length}
              </span>
            </div>

            <div className="flex-1 flex flex-col gap-2.5 p-2.5 min-h-[120px]">
              {colItems.length === 0 ? (
                <p className="text-xs text-surface-400 text-center py-6 px-2">{emptyColumnLabel}</p>
              ) : (
                colItems.map((item) => {
                  const id = getItemId(item);
                  return (
                    <div
                      key={id}
                      draggable={!!onMoveItem}
                      onDragStart={() => setDraggingId(id)}
                      onDragEnd={() => setDraggingId(null)}
                      className={cn(
                        "rounded-lg border border-surface-200 bg-white p-3 shadow-sm transition-all",
                        onMoveItem && "cursor-grab active:cursor-grabbing hover:shadow-md hover:border-surface-300",
                        draggingId === id && "opacity-50"
                      )}
                    >
                      {renderCard(item)}
                    </div>
                  );
                })
              )}
            </div>

            {renderColumnFooter && (
              <div className="border-t border-surface-200 p-2">{renderColumnFooter(col.id)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
