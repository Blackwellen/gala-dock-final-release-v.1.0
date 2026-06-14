"use client";

import { useRef, useState, useTransition } from "react";
import {
  ImagePlus,
  Palette,
  Trash2,
  Pencil,
  Check,
  X,
  GripVertical,
  Upload,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  addImageItems,
  addColourItem,
  deleteItem,
  updateItemCaption,
  reorderItems,
} from "./actions";

export interface MoodItemView {
  id: string;
  storage_key: string | null;
  color_hex: string | null;
  caption: string | null;
  sort_order: number;
  /** Pre-signed URL for image items, resolved server-side. */
  imageUrl: string | null;
}

interface Props {
  eventId: string;
  boardId: string;
  items: MoodItemView[];
}

export function MoodBoardClient({ eventId, boardId, items: initialItems }: Props) {
  const [items, setItems] = useState<MoodItemView[]>(initialItems);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showColour, setShowColour] = useState(false);
  const [colourHex, setColourHex] = useState("#4f46e5");
  const [colourName, setColourName] = useState("");

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    startTransition(async () => {
      try {
        await addImageItems(eventId, boardId, fd);
        // Server revalidates; a full refresh is simplest for new signed URLs.
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  }

  function handleAddColour() {
    setError(null);
    const fd = new FormData();
    fd.append("color_hex", colourHex);
    if (colourName.trim()) fd.append("caption", colourName.trim());
    startTransition(async () => {
      try {
        await addColourItem(eventId, boardId, fd);
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add colour");
      }
    });
  }

  function handleDelete(itemId: string) {
    if (!confirm("Remove this item from the mood board?")) return;
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    startTransition(async () => {
      try {
        await deleteItem(eventId, itemId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete item");
      }
    });
  }

  function saveCaption(itemId: string) {
    const value = editCaption.trim();
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, caption: value || null } : i))
    );
    setEditingId(null);
    startTransition(async () => {
      try {
        await updateItemCaption(eventId, itemId, value || null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save caption");
      }
    });
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const reordered = [...items];
    const from = reordered.findIndex((i) => i.id === dragId);
    const to = reordered.findIndex((i) => i.id === targetId);
    if (from === -1 || to === -1) {
      setDragId(null);
      return;
    }
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setItems(reordered);
    setDragId(null);
    const orderedIds = reordered.map((i) => i.id);
    startTransition(async () => {
      try {
        await reorderItems(eventId, orderedIds);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save order");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <ImagePlus className="h-4 w-4" strokeWidth={1.8} />
          Upload images
        </button>
        <button
          type="button"
          onClick={() => setShowColour((s) => !s)}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-3.5 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50"
        >
          <Palette className="h-4 w-4" strokeWidth={1.8} />
          Add colour
        </button>
        {pending && <span className="text-xs text-surface-400">Saving…</span>}
        <label className="sr-only">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </div>

      {error && (
        <p className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {error}
        </p>
      )}

      {/* Colour picker inline form */}
      {showColour && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-surface-200 bg-surface-50 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-surface-600">Colour</label>
            <input
              type="color"
              value={colourHex}
              onChange={(e) => setColourHex(e.target.value)}
              className="h-10 w-16 cursor-pointer rounded border border-surface-300 bg-white"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-surface-600">
              Name (optional)
            </label>
            <input
              value={colourName}
              onChange={(e) => setColourName(e.target.value)}
              placeholder="e.g. Champagne Gold"
              className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <button
            type="button"
            onClick={handleAddColour}
            disabled={pending}
            className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      {/* Grid */}
      {items.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="Start building your vision board"
          description="Upload inspiration images and add colour swatches to capture the look and feel of this event."
          action={
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <ImagePlus className="h-4 w-4" strokeWidth={1.8} />
              Upload images
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => setDragId(item.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(item.id)}
              onDragEnd={() => setDragId(null)}
              className={`group relative overflow-hidden rounded-xl border border-surface-200 bg-white shadow-card transition-shadow hover:shadow-md ${
                dragId === item.id ? "opacity-50" : ""
              }`}
            >
              {/* Visual */}
              {item.color_hex ? (
                <div
                  className="flex aspect-square items-end p-3"
                  style={{ backgroundColor: item.color_hex }}
                >
                  <span className="rounded bg-white/85 px-1.5 py-0.5 font-mono text-[11px] font-medium text-surface-800">
                    {item.color_hex.toUpperCase()}
                  </span>
                </div>
              ) : item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt={item.caption ?? "Mood board image"}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center bg-surface-100 text-xs text-surface-400">
                  Image unavailable
                </div>
              )}

              {/* Hover controls */}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="pointer-events-auto cursor-grab rounded bg-black/40 p-1 text-white">
                  <GripVertical className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="pointer-events-auto rounded bg-black/40 p-1 text-white hover:bg-danger-600"
                  aria-label="Delete item"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>

              {/* Caption */}
              <div className="border-t border-surface-100 px-2.5 py-2">
                {editingId === item.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                      autoFocus
                      className="min-w-0 flex-1 rounded border border-surface-300 px-2 py-1 text-xs focus:border-brand-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => saveCaption(item.id)}
                      className="rounded p-1 text-success-600 hover:bg-success-50"
                      aria-label="Save caption"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded p-1 text-surface-400 hover:bg-surface-100"
                      aria-label="Cancel"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditCaption(item.caption ?? "");
                    }}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="truncate text-xs text-surface-600">
                      {item.caption ?? "Add caption…"}
                    </span>
                    <Pencil
                      className="h-3 w-3 shrink-0 text-surface-300"
                      strokeWidth={1.8}
                    />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
