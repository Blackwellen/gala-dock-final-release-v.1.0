"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  ArrowLeft,
  Star,
  Copy,
  Trash2,
  Save,
  Printer,
  Lock,
  Unlock,
  Pencil,
  LayoutGrid,
  UserPlus,
  Check,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { FloorPlanCanvas } from "./FloorPlanCanvas";
import {
  ELEMENT_SPECS,
  LAYOUT_PRESETS,
  isTable,
  makeElement,
  type FloorPlanElement,
  type FloorPlanElementType,
} from "./lib";
import {
  createFloorPlan,
  saveFloorPlan,
  renameFloorPlan,
  setPrimaryFloorPlan,
  duplicateFloorPlan,
  deleteFloorPlan,
} from "./actions";

export interface PlanData {
  id: string;
  name: string;
  isPrimary: boolean;
  width: number;
  height: number;
  elements: FloorPlanElement[];
}

export interface GuestOption {
  id: string;
  name: string;
  rsvpStatus: string;
  hasDietary: boolean;
}

const COLORS = ["#7c5cff", "#0ea5e9", "#16a34a", "#db2777", "#ca8a04", "#475569", "#b45309"];

export function FloorPlanClient({
  eventId,
  eventName,
  eventDate,
  plans,
  guests,
}: {
  eventId: string;
  eventName: string;
  eventDate: string | null;
  plans: PlanData[];
  guests: GuestOption[];
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(plans[0]?.id ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSeating, setShowSeating] = useState(false);

  const activePlan = plans.find((p) => p.id === activeId) ?? plans[0] ?? null;

  if (plans.length === 0) {
    return (
      <div className="animate-fade-in">
        <Header
          eventId={eventId}
          eventName={eventName}
          onAdd={() => setShowAdd(true)}
          showActions={false}
        />
        <div className="p-6">
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <EmptyState
              icon={LayoutGrid}
              title="No floor plans yet"
              description="Create your first layout — start blank or from a preset, then drag tables and features onto the canvas."
              action={
                <button
                  type="button"
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
                >
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                  Create Layout
                </button>
              }
            />
          </div>
        </div>
        {showAdd && (
          <AddLayoutDialog eventId={eventId} onClose={() => setShowAdd(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Header
        eventId={eventId}
        eventName={eventName}
        onAdd={() => setShowAdd(true)}
        onSeating={() => setShowSeating(true)}
        showActions
      />

      {/* Layout sub-tabs */}
      <div className="bg-white border-b border-surface-200 px-6 print:hidden">
        <div className="flex items-center gap-1 overflow-x-auto">
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                p.id === activePlan?.id
                  ? "text-brand-600 border-brand-600"
                  : "text-surface-500 border-transparent hover:text-surface-800",
              )}
            >
              {p.isPrimary && <Star className="w-3.5 h-3.5 fill-current text-warning-500" strokeWidth={0} />}
              {p.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-surface-400 hover:text-brand-600 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            Add Layout
          </button>
        </div>
      </div>

      {activePlan && (
        <Editor
          key={activePlan.id}
          eventId={eventId}
          eventName={eventName}
          eventDate={eventDate}
          plan={activePlan}
          guests={guests}
          showSeatingReport={showSeating}
          onCloseSeatingReport={() => setShowSeating(false)}
        />
      )}

      {showAdd && <AddLayoutDialog eventId={eventId} onClose={() => setShowAdd(false)} />}
    </div>
  );

  function Header({
    eventId,
    eventName,
    onAdd,
    onSeating,
    showActions,
  }: {
    eventId: string;
    eventName: string;
    onAdd: () => void;
    onSeating?: () => void;
    showActions: boolean;
  }) {
    return (
      <PageHeader
        title="Floor Plans"
        description={eventName}
        actions={
          <>
            <Link
              href={`/event-manager/events/${eventId}`}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-surface-600 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors print:hidden"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Back to Event</span>
            </Link>
            {showActions && onSeating && (
              <button
                type="button"
                onClick={onSeating}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors print:hidden"
              >
                Seating Summary
              </button>
            )}
            <button
              type="button"
              onClick={onAdd}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand print:hidden"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              Add Layout
            </button>
          </>
        }
      />
    );
  }
}

function Editor({
  eventId,
  eventName,
  eventDate,
  plan,
  guests,
  showSeatingReport,
  onCloseSeatingReport,
}: {
  eventId: string;
  eventName: string;
  eventDate: string | null;
  plan: PlanData;
  guests: GuestOption[];
  showSeatingReport: boolean;
  onCloseSeatingReport: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [elements, setElements] = useState<FloorPlanElement[]>(plan.elements);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  // Map of element id -> seated guest count (for canvas pills).
  const seatedById = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of elements) m.set(e.id, e.guest_ids.length);
    return m;
  }, [elements]);

  // Guests already seated anywhere, to filter the add-guest dropdown.
  const seatedGuestIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of elements) for (const g of e.guest_ids) s.add(g);
    return s;
  }, [elements]);

  const guestById = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);

  function persist(next: FloorPlanElement[]) {
    setSaving(true);
    startTransition(async () => {
      try {
        await saveFloorPlan(eventId, plan.id, next);
        setDirty(false);
        setSavedAt(Date.now());
      } finally {
        setSaving(false);
      }
    });
  }

  // Debounced auto-save (1.5s after the last change).
  function scheduleSave(next: FloorPlanElement[]) {
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next), 1500);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function apply(next: FloorPlanElement[]) {
    setElements(next);
    scheduleSave(next);
  }

  function updateEl(id: string, patch: Partial<FloorPlanElement>) {
    apply(elements.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function addElement(type: FloorPlanElementType) {
    const tableIndex = elements.filter((e) => isTable(e.type)).length + 1;
    const el = makeElement(type, plan.width / 2, plan.height / 2, tableIndex);
    apply([...elements, el]);
    setSelectedId(el.id);
  }

  function moveEl(id: string, x: number, y: number) {
    apply(elements.map((e) => (e.id === id ? { ...e, x, y } : e)));
  }

  function deleteEl(id: string) {
    apply(elements.filter((e) => e.id !== id));
    setSelectedId(null);
  }

  function duplicateEl(id: string) {
    const src = elements.find((e) => e.id === id);
    if (!src) return;
    const tableIndex = elements.filter((e) => isTable(e.type)).length + 1;
    const copy = makeElement(src.type, src.x + src.width / 2 + 24, src.y + src.height / 2 + 24, tableIndex);
    copy.label = src.label;
    copy.color = src.color;
    copy.rotation = src.rotation;
    apply([...elements, copy]);
    setSelectedId(copy.id);
  }

  function seatGuest(elId: string, guestId: string) {
    apply(
      elements.map((e) =>
        e.id === elId ? { ...e, guest_ids: [...e.guest_ids, guestId] } : e,
      ),
    );
  }

  function unseatGuest(elId: string, guestId: string) {
    apply(
      elements.map((e) =>
        e.id === elId ? { ...e, guest_ids: e.guest_ids.filter((g) => g !== guestId) } : e,
      ),
    );
  }

  function saveNow() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    persist(elements);
  }

  function planAction(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const grouped = useMemo(() => {
    const groups: Record<string, typeof ELEMENT_SPECS> = {};
    for (const s of ELEMENT_SPECS) (groups[s.group] ??= []).push(s);
    return groups;
  }, []);

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-0 print:block">
        {/* Library */}
        <aside className="lg:w-56 shrink-0 border-b lg:border-b-0 lg:border-r border-surface-200 bg-white p-4 space-y-4 print:hidden">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
              Elements
            </h3>
          </div>
          {Object.entries(grouped).map(([group, specs]) => (
            <div key={group}>
              <p className="text-[11px] font-semibold text-surface-400 uppercase tracking-wider mb-2">
                {group}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {specs.map((s) => (
                  <button
                    key={s.type}
                    type="button"
                    onClick={() => addElement(s.type)}
                    className="px-2 py-2 text-xs font-medium text-surface-700 border border-surface-200 rounded-lg hover:border-brand-300 hover:bg-brand-50 transition-colors text-left"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>

        {/* Canvas */}
        <div className="flex-1 min-w-0 bg-surface-100/60 p-4 lg:p-6 print:p-0 print:bg-white">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap print:hidden">
            <div className="flex items-center gap-2">
              <PlanNameEditor
                name={plan.name}
                onRename={(n) => planAction(() => renameFloorPlan(eventId, plan.id, n))}
              />
              {plan.isPrimary ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-warning-50 text-warning-600 border-warning-200">
                  <Star className="w-3 h-3 fill-current" strokeWidth={0} />
                  Primary
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => planAction(() => setPrimaryFloorPlan(eventId, plan.id))}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-surface-500 border border-surface-200 rounded-md hover:bg-surface-50"
                >
                  <Star className="w-3.5 h-3.5" strokeWidth={1.8} />
                  Set Primary
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-400">
                {saving ? "Saving…" : dirty ? "Unsaved changes" : savedAt ? "Saved" : ""}
              </span>
              <button
                type="button"
                onClick={saveNow}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-50"
              >
                <Save className="w-4 h-4" strokeWidth={1.8} />
                Save
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-50"
              >
                <Printer className="w-4 h-4" strokeWidth={1.8} />
                Print
              </button>
              <button
                type="button"
                onClick={() => planAction(() => duplicateFloorPlan(eventId, plan.id))}
                title="Duplicate layout"
                className="p-1.5 text-surface-500 border border-surface-200 rounded-lg hover:bg-surface-50"
              >
                <Copy className="w-4 h-4" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete layout "${plan.name}"?`)) {
                    planAction(() => deleteFloorPlan(eventId, plan.id));
                  }
                }}
                title="Delete layout"
                className="p-1.5 text-surface-500 border border-surface-200 rounded-lg hover:bg-danger-50 hover:text-danger-600"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>
          </div>

          {/* Print header (only visible when printing) */}
          <div className="hidden print:block mb-4">
            <h1 className="text-lg font-bold text-surface-900">{eventName}</h1>
            <p className="text-sm text-surface-600">{plan.name}</p>
          </div>

          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden print:border-surface-300 print:shadow-none">
            <FloorPlanCanvas
              elements={elements}
              width={plan.width}
              height={plan.height}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMove={moveEl}
              seatedCountById={seatedById}
            />
          </div>

          <p className="hidden print:block mt-2 text-xs text-surface-400 text-center">
            Gala Dock — Floor Plan
          </p>
        </div>

        {/* Properties / seating panel */}
        <aside className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-surface-200 bg-white p-4 print:hidden">
          {selected ? (
            <PropertiesPanel
              el={selected}
              guests={guests}
              guestById={guestById}
              seatedGuestIds={seatedGuestIds}
              onUpdate={(patch) => updateEl(selected.id, patch)}
              onDelete={() => deleteEl(selected.id)}
              onDuplicate={() => duplicateEl(selected.id)}
              onSeat={(gid) => seatGuest(selected.id, gid)}
              onUnseat={(gid) => unseatGuest(selected.id, gid)}
            />
          ) : (
            <div className="text-center py-10">
              <LayoutGrid className="w-8 h-8 text-surface-300 mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-sm text-surface-500">Select an element to edit it</p>
              <p className="text-xs text-surface-400 mt-1">
                Or add one from the Elements panel.
              </p>
            </div>
          )}
        </aside>
      </div>

      {showSeatingReport && (
        <SeatingReport
          eventName={eventName}
          eventDate={eventDate}
          planName={plan.name}
          elements={elements}
          guestById={guestById}
          onClose={onCloseSeatingReport}
        />
      )}
    </>
  );
}

function PropertiesPanel({
  el,
  guests,
  guestById,
  seatedGuestIds,
  onUpdate,
  onDelete,
  onDuplicate,
  onSeat,
  onUnseat,
}: {
  el: FloorPlanElement;
  guests: GuestOption[];
  guestById: Map<string, GuestOption>;
  seatedGuestIds: Set<string>;
  onUpdate: (patch: Partial<FloorPlanElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSeat: (guestId: string) => void;
  onUnseat: (guestId: string) => void;
}) {
  const labelCls = "block text-xs font-medium text-surface-600 mb-1.5";
  const inputCls =
    "w-full px-2.5 py-1.5 text-sm text-surface-800 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500";
  const table = isTable(el.type);
  const available = guests.filter((g) => !seatedGuestIds.has(g.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
          Properties
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicate"
            className="p-1.5 rounded-lg text-surface-400 hover:text-brand-600 hover:bg-brand-50"
          >
            <Copy className="w-4 h-4" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ locked: !el.locked })}
            title={el.locked ? "Unlock" : "Lock"}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100"
          >
            {el.locked ? <Lock className="w-4 h-4" strokeWidth={1.8} /> : <Unlock className="w-4 h-4" strokeWidth={1.8} />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Delete"
            className="p-1.5 rounded-lg text-surface-400 hover:text-danger-600 hover:bg-danger-50"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="el-label">Label</label>
        <input
          id="el-label"
          type="text"
          value={el.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Colour</label>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onUpdate({ color: c })}
              aria-label={`Colour ${c}`}
              className={cn(
                "w-6 h-6 rounded-full border-2 transition-transform",
                el.color === c ? "border-surface-900 scale-110" : "border-white",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {table && (
        <div>
          <label className={labelCls} htmlFor="el-cap">Capacity</label>
          <input
            id="el-cap"
            type="number"
            min={0}
            value={el.capacity ?? 0}
            onChange={(e) => onUpdate({ capacity: Number(e.target.value) || 0 })}
            className={inputCls}
          />
        </div>
      )}

      <div>
        <label className={labelCls} htmlFor="el-rot">Rotation: {el.rotation}°</label>
        <input
          id="el-rot"
          type="range"
          min={0}
          max={360}
          value={el.rotation}
          onChange={(e) => onUpdate({ rotation: Number(e.target.value) })}
          className="w-full accent-brand-600"
        />
      </div>

      {/* Seating */}
      {table && (
        <div className="pt-2 border-t border-surface-100">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
              Seating
            </h4>
            <span className="text-xs text-surface-400">
              {el.guest_ids.length}/{el.capacity ?? 0} seated
            </span>
          </div>

          {el.guest_ids.length > 0 && (
            <ul className="space-y-1 mb-2">
              {el.guest_ids.map((gid) => {
                const g = guestById.get(gid);
                return (
                  <li
                    key={gid}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-surface-50 text-sm"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {g?.hasDietary && (
                        <span className="w-2 h-2 rounded-full bg-warning-500 shrink-0" title="Dietary note" />
                      )}
                      <span className="truncate text-surface-700">{g?.name ?? "Guest"}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onUnseat(gid)}
                      aria-label="Remove from seat"
                      className="p-0.5 rounded text-surface-400 hover:text-danger-600 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {available.length > 0 ? (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onSeat(e.target.value);
              }}
              className={inputCls}
              aria-label="Add guest to table"
            >
              <option value="">+ Add guest…</option>
              {available.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-surface-400 flex items-center gap-1">
              <UserPlus className="w-3.5 h-3.5" strokeWidth={1.8} />
              {guests.length === 0 ? "No guests added to this event yet." : "All guests are seated."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PlanNameEditor({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(name);
          setEditing(true);
        }}
        className="flex items-center gap-1.5 text-base font-semibold text-surface-900 hover:text-brand-600"
      >
        {name}
        <Pencil className="w-3.5 h-3.5 text-surface-300" strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onRename(value.trim());
        setEditing(false);
      }}
      className="flex items-center gap-1"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => setEditing(false)}
        className="px-2 py-1 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <button type="submit" className="p-1 text-success-600" aria-label="Save name">
        <Check className="w-4 h-4" strokeWidth={2} />
      </button>
    </form>
  );
}

function AddLayoutDialog({
  eventId,
  onClose,
}: {
  eventId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "w-full px-3 py-2 text-sm text-surface-800 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500";
  const labelCls = "block text-xs font-medium text-surface-600 mb-1.5";

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await createFloorPlan(eventId, formData);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create layout");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-surface-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <h2 className="text-base font-semibold text-surface-900">Add Layout</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100"
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        <form action={onSubmit} className="p-5 space-y-4">
          <div>
            <label className={labelCls} htmlFor="name">Layout Name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="e.g. Dinner, Ceremony, Evening Reception"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="preset">Start From</label>
            <select id="preset" name="preset" className={inputCls} defaultValue="blank">
              {LAYOUT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm font-medium text-surface-600 rounded-lg hover:bg-surface-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SeatingReport({
  eventName,
  eventDate,
  planName,
  elements,
  guestById,
  onClose,
}: {
  eventName: string;
  eventDate: string | null;
  planName: string;
  elements: FloorPlanElement[];
  guestById: Map<string, GuestOption>;
  onClose: () => void;
}) {
  const tables = elements.filter((e) => isTable(e.type));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-surface-900/40 backdrop-blur-sm overflow-y-auto print:static print:bg-white print:p-0">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-surface-200 my-8 print:shadow-none print:border-0 print:my-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 print:hidden">
          <h2 className="text-base font-semibold text-surface-900">Seating Summary</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-surface-700 border border-surface-200 rounded-lg hover:bg-surface-50"
            >
              <Printer className="w-4 h-4" strokeWidth={1.8} />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <h1 className="text-lg font-bold text-surface-900">{eventName}</h1>
            <p className="text-sm text-surface-500">
              {planName}
              {eventDate ? ` · ${new Date(eventDate).toLocaleDateString("en-GB")}` : ""}
            </p>
          </div>
          {tables.length === 0 ? (
            <p className="text-sm text-surface-400">No tables on this layout yet.</p>
          ) : (
            <div className="space-y-4">
              {tables.map((t) => (
                <div key={t.id} className="border border-surface-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-surface-50 border-b border-surface-200">
                    <span className="text-sm font-semibold text-surface-800">{t.label}</span>
                    <span className="text-xs text-surface-500">
                      {t.guest_ids.length}/{t.capacity ?? 0} seated
                    </span>
                  </div>
                  {t.guest_ids.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-surface-400">No guests assigned.</p>
                  ) : (
                    <ul className="divide-y divide-surface-100">
                      {t.guest_ids.map((gid) => {
                        const g = guestById.get(gid);
                        return (
                          <li key={gid} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                            {g?.hasDietary && (
                              <span className="w-2 h-2 rounded-full bg-warning-500 shrink-0" title="Dietary note" />
                            )}
                            <span className="text-surface-700">{g?.name ?? "Guest"}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
