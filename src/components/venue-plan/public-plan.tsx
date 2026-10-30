import "@/styles/public-plan.css";
import type { ReactNode } from "react";
import { FIXTURE_LABEL, type MapEl, type MapSpace } from "@/app/provider/venues/_components/venue-map";
import { ASSET, blockSeats, tableSeats } from "./assets";
import { PlanPreview } from "./plan-preview";
import { PlanZoom } from "./plan-zoom";

/**
 * Read-only public plan (event map or venue floor plan): the same renderer as the builders, rendered on the server so the
 * map code and its icon set never reach the browser; only the small pan/zoom frame is client code. Includes a legend and an
 * accessible text list of every area, so the map is never the only way to read the layout. Returns null when nothing is drawn.
 */
export type PlanTier = { id: string; name: string; color?: string | null };
type Item = { group: string; kind: string; name: string; detail: string | null; mine?: boolean };

const PALETTE = ["#5b5bff", "#a855f7", "#16a46c", "#e08a00", "#e0398b", "#0ea5c6"];
const FIX_GROUP: Record<string, [string, string]> = { stage: ["Stages & production", "#3b3f5c"], bar: ["Food & drink", "#e08a00"], toilets: ["Facilities", "#3f4596"], loading: ["Facilities", "#3f4596"],
  exit: ["Safety & access", "#ec3a52"], entrance: ["Entrances", "#16a46c"], accessible_route: ["Safety & access", "#16a46c"] };
const SKIP = new Set(["wall", "label", "underlay", "basemap", "layer", "water", "glyph", "shape", "text", "curve", "widget"]);
const ORDER = ["Your area", "Entrances", "Stages & production", "Rooms & spaces", "Zones & areas", "Seating & tables", "Food & drink", "Facilities", "Safety & access", "Transport & parking", "Landscape & outdoor", "Routes & barriers"];

export const planHasContent = (els: MapEl[]) => els.some(e => !e.hidden && e.type !== "layer" && e.type !== "basemap");

function items(els: MapEl[], spaces: MapSpace[], tierName: Map<string, string>, mine: string | null): { list: Item[]; legend: [string, string][] } {
  const list: Item[] = [], legend = new Map<string, string>();
  for (const e of els) {
    if (e.hidden || SKIP.has(e.type)) continue;
    if (e.type === "room") {
      const sp = spaces.find(s => s.id === e.space);
      list.push({ group: "Rooms & spaces", kind: "Room", name: sp?.name ?? e.label, detail: sp?.capacity ? `Up to ${sp.capacity.toLocaleString("en-GB")}` : null }); legend.set("Rooms & spaces", "#8b5cf6"); continue;
    }
    const fx = FIX_GROUP[e.type];
    if (fx) { list.push({ group: fx[0], kind: FIXTURE_LABEL[e.type] ?? e.type, name: e.label || (FIXTURE_LABEL[e.type] ?? e.type), detail: null }); legend.set(fx[0], fx[1]); continue; }
    if (e.type !== "asset") continue;
    const def = ASSET[e.asset ?? ""]; if (!def) continue;
    const seats = def.kind === "seating" && e.seating ? blockSeats(e.seating).length : def.kind === "table" && e.table ? tableSeats(e.table).length : 0;
    const tier = e.tier ? tierName.get(e.tier) : undefined;
    const detail = [seats ? `${seats} seats` : e.capacity ? `Up to ${e.capacity.toLocaleString("en-GB")}` : null, tier ?? null].filter(Boolean).join(" · ") || null;
    const own = !!mine && e.tier === mine;
    list.push({ group: own ? "Your area" : def.cat, kind: def.label, name: e.label && e.label !== def.label ? e.label : def.label, detail, mine: own });
    if (!legend.has(def.cat)) legend.set(def.cat, def.stroke);
  }
  // Same kind + name repeated (e.g. eight toilets) reads as one row with a count.
  const seen = new Map<string, Item & { n: number }>();
  for (const it of list) { const k = `${it.group}|${it.kind}|${it.name}|${it.detail}`; const x = seen.get(k); if (x) x.n++; else seen.set(k, { ...it, n: 1 }); }
  const out = [...seen.values()].map(x => ({ ...x, name: x.n > 1 ? `${x.name} ×${x.n}` : x.name }));
  out.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
  return { list: out, legend: [...legend.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0])) };
}

export function PublicPlan({ id, title, intro, label, base, overlay, spaces = [], tiers = [], mineTier = null, gate = null, cta, bare = false }: {
  id?: string; title: string; intro?: string; label: string; base: MapEl[]; overlay: MapEl[]; spaces?: MapSpace[]; tiers?: PlanTier[];
  /** Ticket holder: their tier's areas are coloured, the rest muted, and listed first as "Your area". */ mineTier?: string | null;
  /** Ticket holder: their entry gate, highlighted in the list when an entrance on the plan carries that name. */ gate?: string | null;
  cta?: ReactNode;
  /** Inside another card (checkout): no card chrome and no heading. */ bare?: boolean;
}) {
  const all = [...base, ...overlay];
  if (!planHasContent(all)) return null;
  const tierName = new Map(tiers.map(t => [t.id, t.name]));
  const colors = Object.fromEntries(tiers.map((t, i) => [t.id, mineTier && t.id !== mineTier ? "#c9cde0" : (t.color && t.color !== "#5b5bff" ? t.color : PALETTE[i % PALETTE.length]!)]));
  const { list, legend } = items(all, spaces, tierName, mineTier);
  const gateHit = gate ? list.find(x => x.group === "Entrances" && x.name.toLowerCase().includes(gate.toLowerCase().replace(/^main\s+/, ""))) : undefined;
  const groups = [...new Set(list.map(x => x.group))];
  const usedTiers = tiers.filter(t => all.some(e => e.tier === t.id || Object.values(e.seatTiers ?? {}).includes(t.id)));
  return <section id={id} className={bare ? "pp bare" : "ce-card pp"} aria-labelledby={id && !bare ? `${id}-h` : undefined} aria-label={bare ? title : undefined}>
    {!bare && <div className="pp-head"><div><h2 id={id ? `${id}-h` : undefined}>{title}</h2>{intro && <p>{intro}</p>}</div>{cta}</div>}
    <div className="pp-body">
      <div className="pp-mapcol">
        <PlanZoom label={label}><PlanPreview base={base} overlay={overlay} spaces={spaces} height="100%" tierColor={colors} label={label} /></PlanZoom>
        {(legend.length > 0 || usedTiers.length > 0) && <ul className="pp-legend" aria-label="Map key">
          {usedTiers.map(t => <li key={t.id}><i style={{ background: colors[t.id] }} />{t.name}{mineTier === t.id ? " (your ticket)" : ""}</li>)}
          {legend.map(([g, c]) => <li key={g}><i style={{ background: c }} />{g}</li>)}
        </ul>}
      </div>
      <div className="pp-list">
        {gateHit && <p className="pp-gate"><b>Your entrance</b>{gateHit.name}</p>}
        <h3>Areas on this map</h3>
        {groups.map(g => <div key={g} className={`pp-group${g === "Your area" ? " mine" : ""}`}><b>{g}</b><ul>{list.filter(x => x.group === g).map(x => <li key={`${x.kind}${x.name}${x.detail}`}><span>{x.name}{x.name !== x.kind && !x.name.startsWith(x.kind) ? <small> · {x.kind}</small> : null}</span>{x.detail && <em>{x.detail}</em>}</li>)}</ul></div>)}
      </div>
    </div>
  </section>;
}
