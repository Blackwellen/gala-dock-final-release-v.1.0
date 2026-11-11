"use client";
import { Children, useRef, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { useAction } from "@/components/kit/client";
import { reorderBuild } from "@/lib/actions/build-extra";

/** Drag (pointer, from the grip) or keyboard (grip + ↑/↓) reordering of build rows. Order is presentation only — it never changes bookings. */
export function SortableBuild({ eventId, ids, labels, children }: { eventId: string; ids: string[]; labels: string[]; children: ReactNode }) {
  const rows = Children.toArray(children);
  const [order, setOrder] = useState(ids.map((_, i) => i)); const [drag, setDrag] = useState<number | null>(null); const [msg, setMsg] = useState("");
  // Only the grip arms dragging: a whole-row draggable started reorders from the CTA/menu buttons and, because the row's dialogs
  // (quote note, hold) render inside it, stopped text selection in their fields.
  const [armed, setArmed] = useState<number | null>(null);
  const before = useRef<number[] | null>(null); const dropped = useRef(false);
  const { run } = useAction();
  // Reset the local order when the server sends a different list (adjusting state during render, not in an effect).
  const idsKey = ids.join(","); const [prevKey, setPrevKey] = useState(idsKey);
  if (prevKey !== idsKey) { setPrevKey(idsKey); setOrder(ids.map((_, i) => i)); }
  // Optimistic: show the new order now, put the previous one back if the save fails (the action already toasts the error).
  const commit = (next: number[], prev: number[]) => { setOrder(next); void run(() => reorderBuild(eventId, next.map(i => ids[i]!)), { refresh: false }).then(r => { if (!r.ok) { setOrder(prev); setMsg("The new order wasn't saved."); } }); };
  const move = (pos: number, to: number) => { if (to < 0 || to >= order.length) return; const n = [...order]; const [x] = n.splice(pos, 1); n.splice(to, 0, x!); setMsg(`${labels[x!]} moved to position ${to + 1} of ${n.length}`); commit(n, order); };
  return <><ol className="cb-list">{order.map((ix, pos) => <li key={ids[ix]} className={`cb-row ${drag === pos ? "dragging" : ""}`} draggable={armed === ix}
    onDragStart={e => { if (armed !== ix) { e.preventDefault(); return; } before.current = order; dropped.current = false; setDrag(pos); e.dataTransfer.effectAllowed = "move"; }}
    onDragEnd={() => { setDrag(null); setArmed(null); if (!dropped.current && before.current) setOrder(before.current); before.current = null; }}
    onDragOver={e => { if (drag === null) return; e.preventDefault(); if (drag !== pos) { const n = [...order]; const [x] = n.splice(drag, 1); n.splice(pos, 0, x!); setOrder(n); setDrag(pos); } }}
    onDrop={e => { if (drag === null) return; e.preventDefault(); dropped.current = true; setDrag(null); const prev = before.current ?? order; if (prev.join(",") !== order.join(",")) commit(order, prev); }}>
    <button type="button" className="cb-grip" aria-label={`Reorder ${labels[ix]}. Use arrow keys to move.`} title="Drag to reorder — doesn't change bookings"
      onPointerDown={() => setArmed(ix)} onPointerUp={() => { if (drag === null) setArmed(null); }}
      onKeyDown={e => { if (e.key === "ArrowUp") { e.preventDefault(); move(pos, pos - 1); } if (e.key === "ArrowDown") { e.preventDefault(); move(pos, pos + 1); } }}><GripVertical size={16} /></button>
    {rows[ix]}
  </li>)}</ol><p className="k-sr" aria-live="polite">{msg}</p></>;
}
