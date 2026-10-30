"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CircleAlert, CircleCheck, Copy, GitCompare, GitMerge, History, RefreshCw, Upload, X } from "lucide-react";
import { useToast } from "@/components/ui";
import { PlanBuilder, type PlanApi, type PlanHighlight, type Tier } from "@/components/venue-plan/plan-builder";
import { PlanPreview } from "@/components/venue-plan/plan-preview";
import { ASSET } from "@/components/venue-plan/assets";
import { mergeElements } from "@/lib/maps/merge";
import type { MapEl, MapSpace } from "@/app/provider/venues/_components/venue-map";
import { compareEventMap, loadEventMapVersion, restoreEventMap, saveEventMap, validateEventMap, type Finding, type Validation } from "./actions";

export type MapTab = "design" | "ticketing" | "operations" | "preview";
export type TierRow = Tier & { quantity: number | null; price: number | null; status: string };
export type Binding = { tier_id: string; name: string; quantity: number | null; seats: number; area_capacity: number; elements: string[]; zones: string[] };
export type ZoneRow = { zone_id: string; name: string; kind: string; capacity: number | null; elements: string[] };
export type VersionRow = { version: number; status: string; created_at: string };
type Conflict = { current: number; mine: MapEl[]; publish: boolean };

const TABS: [MapTab, string][] = [["design", "Design"], ["ticketing", "Ticketing"], ["operations", "Operations"], ["preview", "Preview"]];
const SAFETY = new Set(["insufficient_exits", "exit_width_insufficient", "exit_blocked", "route_blocked", "aisle_narrow", "density_exceeded", "accessible_allocation", "venue_lock"]);
const CAPACITY = new Set(["capacity_exceeded", "room_capacity_exceeded", "room_seated_exceeded", "overlap"]);
const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-GB");
const day = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * ORG-013 · Event layout editor shell. Design (PlanBuilder over the venue's locked structure) · Ticketing (tier ↔ seat/area
 * bindings) · Operations (safety and capacity findings, exits, accessibility) · Preview (published layout as attendees see it).
 * Saves are version-checked (event_map_save); `stale_version` opens reload-merge; findings from event_map_validate are listed in
 * the right rail and drawn on the canvas, and clicking one selects that element. Version compare/restore/duplicate in the header.
 */
export function EventMapEditor(p: {
  eventId: string; base: MapEl[]; overlay: MapEl[]; spaces: MapSpace[]; tiers: TierRow[]; geo: { lat: number; lng: number } | null;
  versions: VersionRow[]; publishedVersion: number; latestVersion: number; validation: Validation | null; bindings: Binding[]; zones: ZoneRow[];
  venueCapacity: number | null; sold: number; held: number; initialTab: MapTab; canEdit: boolean; publishedOverlay: MapEl[];
}) {
  const router = useRouter(), toast = useToast();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<MapTab>(p.initialTab);
  const [base, setBase] = useState({ version: p.latestVersion, overlay: p.overlay });
  const [seed, setSeed] = useState({ key: 0, overlay: p.overlay });
  const [validation, setValidation] = useState<Validation | null>(p.validation);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cmp, setCmp] = useState<{ a: number; b: number; added: string[]; removed: string[]; changed: string[] } | null>(null);
  const [pick, setPick] = useState<number>(p.versions[1]?.version ?? p.versions[0]?.version ?? 0);
  const [confirmPub, setConfirmPub] = useState(false);
  const api = useRef<PlanApi | null>(null);
  const tierColor = useMemo(() => Object.fromEntries(p.tiers.map(t => [t.id, t.color])), [p.tiers]);

  const go = (t: MapTab) => { setTab(t); const u = new URL(window.location.href); u.searchParams.set("tab", t); window.history.replaceState(null, "", u); };
  const findings = useMemo(() => [...(validation?.errors ?? []), ...(validation?.warnings ?? [])], [validation]);
  const highlights: PlanHighlight[] = useMemo(() => [
    ...findings.filter(f => f.element_id).map(f => ({ id: String(f.element_id), severity: f.severity === "error" ? "error" as const : "warning" as const })),
    ...(cmp ? [...cmp.added, ...cmp.changed].map(id => ({ id, severity: "warning" as const })) : []),
  ], [findings, cmp]);

  const save = useCallback(async (els: MapEl[], publish: boolean, baseVersion = base.version) => {
    const r = await saveEventMap(p.eventId, els, publish, baseVersion);
    if (r.ok && r.version) { setBase({ version: r.version, overlay: els }); if (r.validation) setValidation({ ...r.validation, version: r.version, status: r.status }); router.refresh(); }
    if (!r.ok && r.conflict !== undefined) { setConflict({ current: r.conflict, mine: els, publish }); return { ok: false, error: "Not saved — choose how to combine your changes with the newer version." }; }
    return r;
  }, [base.version, p.eventId, router]);

  const resolve = (how: "reload" | "merge" | "mine") => start(async () => {
    if (!conflict) return;
    const theirs = await loadEventMapVersion(p.eventId, conflict.current);
    if (!theirs.ok) { toast(theirs.error); return; }
    if (how === "reload") { setBase({ version: theirs.version, overlay: theirs.overlay }); setSeed(s => ({ key: s.key + 1, overlay: theirs.overlay })); setConflict(null); toast(`Loaded version ${theirs.version}. Your unsaved changes were discarded.`); return; }
    const next = how === "merge" ? mergeElements(base.overlay, conflict.mine, theirs.overlay) : { elements: conflict.mine, conflicts: [] as string[] };
    const r = await saveEventMap(p.eventId, next.elements, conflict.publish, theirs.version);
    if (!r.ok) { if (r.conflict !== undefined) setConflict({ ...conflict, current: r.conflict }); toast(r.error ?? "Couldn’t save"); return; }
    setBase({ version: r.version!, overlay: next.elements }); setSeed(s => ({ key: s.key + 1, overlay: next.elements })); setConflict(null);
    if (r.validation) setValidation({ ...r.validation, version: r.version });
    router.refresh();
    toast(how === "merge" ? `Merged into version ${r.version}${next.conflicts.length ? ` — kept your version of ${next.conflicts.slice(0, 3).join(", ")}${next.conflicts.length > 3 ? "…" : ""}` : ""}` : `Saved your layout as version ${r.version} on top of version ${theirs.version}`);
  });

  const restore = (v: number) => start(async () => {
    if (dirty && !window.confirm("You have unsaved changes. Restoring creates a new draft from that version and discards them. Continue?")) return;
    const r = await restoreEventMap(p.eventId, v, base.version);
    if (!r.ok) { toast(r.error ?? "Couldn’t restore"); if (r.conflict !== undefined) router.refresh(); return; }
    const loaded = await loadEventMapVersion(p.eventId, r.version);
    if (loaded.ok) { setBase({ version: loaded.version, overlay: loaded.overlay }); setSeed(s => ({ key: s.key + 1, overlay: loaded.overlay })); }
    if (r.validation) setValidation({ ...r.validation, version: r.version });
    setCmp(null); toast(r.message ?? "Restored"); router.refresh();
  });
  const compare = () => start(async () => {
    const b = base.version, a = pick;
    if (!a || !b || a === b) { toast("Choose an earlier version to compare with the latest."); return; }
    const r = await compareEventMap(p.eventId, a, b);
    if (!r.ok) { toast(r.error); return; }
    setCmp({ a, b, added: r.added, removed: r.removed, changed: r.changed }); go("design");
  });
  const recheck = () => start(async () => { const r = await validateEventMap(p.eventId); if (r.ok) { setValidation(r.validation); toast(r.validation.ok ? "No blocking issues" : `${r.validation.errors.length} blocking issue${r.validation.errors.length === 1 ? "" : "s"}`); } else toast(r.error); });
  const focus = (f: Finding) => { if (!f.element_id) return; if (tab !== "design") go("design"); setTimeout(() => { if (!api.current?.focus(String(f.element_id))) toast("That element is on the venue’s locked plan or was removed."); }, tab === "design" ? 0 : 60); };

  // Capacity strip (ORG-013 header KPIs) from the editor's current overlay and the server's last validation.
  const overlayNow = base.overlay;
  const kpi = useMemo(() => {
    let seated = 0, ga = 0, vip = 0, tables = 0, booths = 0;
    for (const e of overlayNow) { const d = ASSET[e.asset ?? ""]; if (!d || e.hidden) continue;
      if (d.kind === "seating" && e.seating) seated += e.seating.rows * e.seating.cols;
      if (d.kind === "table" && e.table) { seated += e.table.seats; tables += 1; if (e.asset === "vip_booth") { booths += 1; vip += e.table.seats; } }
      if (d.capacity && e.capacity) { if (e.asset === "vip_area" || e.asset === "lounge") vip += e.capacity; else ga += e.capacity; }
      if (["market_stall", "sponsor", "merch", "food_stall"].includes(e.asset ?? "")) booths += 1; }
    const allocated = p.tiers.reduce((a, t) => a + (t.quantity ?? 0), 0);
    return { seated, ga, vip, tables, booths, allocated, total: Number(validation?.stats?.total ?? seated + ga + vip) };
  }, [overlayNow, p.tiers, validation]);
  const cap = p.venueCapacity ?? Number(validation?.stats?.venue_capacity ?? 0) ?? 0;
  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
  const status = base.version === 0 ? "Not started" : p.publishedVersion === base.version ? "Published" : "Draft";

  const findingList = (list: Finding[], empty: string) => !list.length ? <p className="om-empty"><CircleCheck aria-hidden="true" />{empty}</p>
    : <ul className="om-findings">{list.map((f, i) => <li key={`${f.code}-${f.element_id ?? i}-${i}`} className={f.severity}>
      <button type="button" onClick={() => focus(f)} disabled={!f.element_id} aria-label={`${f.severity === "error" ? "Blocking" : "Warning"}: ${f.text}${f.element_id ? " — show on map" : ""}`}>
        {f.severity === "error" ? <CircleAlert aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}<span>{f.text}<small>{f.code.replace(/_/g, " ")}{f.element_id ? " · show on map" : ""}</small></span></button></li>)}</ul>;

  return <div className="om">
    <div className="om-actions">
      <label className="om-ver"><History aria-hidden="true" /><span className="om-sr">Compare or restore version</span>
        <select className="k-select" value={pick} onChange={e => setPick(Number(e.target.value))} aria-label="Version">
          {p.versions.map(v => <option key={v.version} value={v.version}>Version {v.version} · {v.status}{v.version === p.publishedVersion ? " (live)" : ""} · {day(v.created_at)}</option>)}
          {!p.versions.length && <option value={0}>No versions yet</option>}</select></label>
      <button type="button" className="k-btn outline sm" disabled={pending || !pick || pick === base.version} onClick={compare}><GitCompare aria-hidden="true" />Compare with latest</button>
      {p.canEdit && <button type="button" className="k-btn outline sm" disabled={pending || !pick} onClick={() => restore(pick)}><Copy aria-hidden="true" />{pick === base.version ? "Duplicate as draft" : `Restore v${pick} as draft`}</button>}
      {p.canEdit && <span className="om-pub"><button type="button" className="k-btn primary sm" disabled={pending} aria-expanded={confirmPub} onClick={() => setConfirmPub(v => !v)}><Upload aria-hidden="true" />Publish map</button>
        {confirmPub && <div className="om-pop" role="dialog" aria-label="Publish layout"><b>Publish this event layout?</b>
          <p>{validation && !validation.ok ? `${validation.errors.length} blocking issue${validation.errors.length === 1 ? "" : "s"} on the last check — publishing is refused until they’re fixed.` : "Seat and area inventory for ticketing updates to match. Sold or held seats must stay on the plan."}</p>
          <div><button type="button" className="k-btn ghost sm" onClick={() => setConfirmPub(false)}>Cancel</button>
            <button type="button" className="k-btn primary sm" disabled={pending} onClick={() => { setConfirmPub(false); if (tab !== "design") go("design"); setTimeout(() => api.current?.save(true), 30); }}>Publish</button></div></div>}</span>}
    </div>

    <dl className="om-kpis" aria-label="Capacity">
      <div><dt>Total capacity</dt><dd>{n(kpi.total)}{cap ? <small> / {n(cap)}</small> : null}</dd>{cap ? <i style={{ ["--w" as string]: `${pct(kpi.total, cap)}%` }} className={kpi.total > cap ? "over" : ""} /> : null}</div>
      <div><dt>Tickets allocated</dt><dd>{n(kpi.allocated)}</dd>{kpi.total ? <i style={{ ["--w" as string]: `${pct(kpi.allocated, kpi.total)}%` }} className={kpi.allocated > kpi.total ? "over" : ""} /> : null}</div>
      <div><dt><b className="dot ga" />GA capacity</dt><dd>{n(kpi.ga)}</dd></div>
      <div><dt><b className="dot seat" />Seated capacity</dt><dd>{n(kpi.seated)}</dd></div>
      <div><dt><b className="dot vip" />VIP capacity</dt><dd>{n(kpi.vip)}</dd></div>
      <div><dt><b className="dot booth" />Booths / tables</dt><dd>{n(kpi.booths + kpi.tables)}</dd></div>
    </dl>

    <nav className="om-tabs" aria-label="Layout sections" role="tablist">{TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => go(k)}>{l}</button>)}
      <span className="om-state">{status}{base.version ? ` · v${base.version}` : ""}{dirty ? " · unsaved changes" : ""}</span></nav>

    <div className="om-body">
      <div className="om-main">
        <div hidden={tab !== "design"}>
          {cmp && <div className="om-cmp" role="status"><GitCompare aria-hidden="true" /><span>v{cmp.a} → v{cmp.b}: <b>{cmp.added.length}</b> added · <b>{cmp.changed.length}</b> changed · <b>{cmp.removed.length}</b> removed{cmp.removed.length ? ` (${cmp.removed.slice(0, 4).join(", ")}${cmp.removed.length > 4 ? "…" : ""})` : ""}. Added and changed elements are outlined.</span>
            <button type="button" className="k-btn ghost sm" onClick={() => setCmp(null)} aria-label="Close comparison"><X aria-hidden="true" /></button></div>}
          <PlanBuilder key={seed.key} mode="event" base={p.base} initial={seed.overlay} spaces={p.spaces} tiers={p.tiers} version={p.publishedVersion}
            draftVersion={base.version > p.publishedVersion ? base.version : 0} geo={p.geo} height={640} apiRef={api} highlights={highlights} onDirtyChange={setDirty} hidePublish
            onSave={(els, publish) => save(els, publish)} />
        </div>
        {tab === "ticketing" && <section className="k-card om-panel"><h2>Ticket tiers on the layout</h2>
          <p className="om-sub">Seats and areas assigned to each tier on the {p.publishedVersion ? `published layout (v${p.publishedVersion})` : "latest draft"}. Assign tiers on the Design tab: select seats, tables or areas and choose a tier.</p>
          {!p.bindings.length ? <p className="om-empty">This event has no ticket tiers yet.</p> : <table className="k-table"><thead><tr><th>Tier</th><th>On sale</th><th className="num">Tickets</th><th className="num">Seats on map</th><th className="num">Area capacity</th><th className="num">Elements</th><th>Access zones</th><th>Check</th></tr></thead>
            <tbody>{p.bindings.map(b => { const t = p.tiers.find(x => x.id === b.tier_id); const placed = b.seats + b.area_capacity; const q = b.quantity ?? 0;
              const msg = !placed ? "Not on the map" : q > placed ? `${n(q - placed)} more tickets than places` : q && placed > q ? `${n(placed - q)} places not sold` : "Matches";
              return <tr key={b.tier_id}><td><span className="om-tier"><i style={{ background: t?.color }} />{b.name}</span></td><td>{(t?.status ?? "").replace(/_/g, " ")}</td><td className="num">{n(q)}</td><td className="num">{n(b.seats)}</td><td className="num">{n(b.area_capacity)}</td><td className="num">{b.elements.length}</td>
                <td>{b.zones.length ? b.zones.map(z => p.zones.find(x => x.zone_id === z)?.name ?? "Zone").join(", ") : "—"}</td><td className={msg === "Matches" ? "ok" : "warn"}>{msg}</td></tr>; })}</tbody></table>}
          {p.zones.length > 0 && <><h3>Access zones</h3><table className="k-table"><thead><tr><th>Zone</th><th>Kind</th><th className="num">Capacity</th><th className="num">Elements on map</th></tr></thead>
            <tbody>{p.zones.map(z => <tr key={z.zone_id}><td>{z.name}</td><td>{z.kind.replace(/_/g, " ")}</td><td className="num">{z.capacity == null ? "—" : n(z.capacity)}</td><td className="num">{z.elements.length}</td></tr>)}</tbody></table></>}
          {findingList(findings.filter(f => f.code.startsWith("tier_") || f.code.startsWith("zone_") || f.code === "invalid_tier" || f.code === "invalid_zone"), "Every tier and zone on the layout is consistent.")}
        </section>}
        {tab === "operations" && <section className="k-card om-panel"><h2>Safety &amp; operations</h2>
          <p className="om-sub">Checked against the venue’s rule pack{validation?.rule_pack ? ` (${validation.rule_pack.key} v${validation.rule_pack.version})` : ""}. Errors block publishing; warnings are advisory.</p>
          <dl className="om-ops">
            <div><dt>Exits</dt><dd className={Number(validation?.stats?.exits ?? 0) < Number(validation?.stats?.required_exits ?? 0) ? "warn" : ""}>{n(Number(validation?.stats?.exits ?? 0))} <small>of {n(Number(validation?.stats?.required_exits ?? 0))} required</small></dd></div>
            <div><dt>Exit width</dt><dd>{n(Number(validation?.stats?.exit_width_mm ?? 0))} mm</dd></div>
            <div><dt>Accessible places</dt><dd>{n(Number(validation?.stats?.accessible ?? 0))}</dd></div>
            <div><dt>Seats sold · held</dt><dd>{n(p.sold)} · {n(p.held)}</dd></div>
          </dl>
          <h3>Safety and access</h3>{findingList(findings.filter(f => SAFETY.has(f.code)), "Exits, routes, aisles and accessible places meet the rule pack.")}
          <h3>Capacity</h3>{findingList(findings.filter(f => CAPACITY.has(f.code)), "Within venue, room and density limits.")}
          <button type="button" className="k-btn outline sm" disabled={pending} onClick={recheck}><RefreshCw aria-hidden="true" />Re-check saved layout</button>
        </section>}
        {tab === "preview" && <section className="k-card om-panel"><h2>Preview</h2>
          <p className="om-sub">{p.publishedVersion ? `Published layout v${p.publishedVersion}, as ticket buyers and staff see it.` : "Nothing published yet — this is the latest draft."}</p>
          <PlanPreview base={p.base} overlay={p.publishedVersion ? p.publishedOverlay : base.overlay} spaces={p.spaces} height={560} tierColor={tierColor} label="Published event layout" />
          {p.tiers.length > 0 && <ul className="om-legend" aria-label="Ticket tiers">{p.tiers.map(t => <li key={t.id}><i style={{ background: t.color }} />{t.name}{t.price != null ? <small> · £{Number(t.price).toFixed(2)}</small> : null}</li>)}</ul>}
        </section>}
      </div>
      <aside className="om-rail" aria-label="Layout checks">
        <section className="k-card om-card"><header><h2>Layout checks</h2>{validation?.version ? <small>v{validation.version}</small> : null}</header>
          {!validation?.map ? <p className="om-empty">Save the layout to run the safety and capacity checks.</p> : <>
            <p className={validation.ok ? "om-ok" : "om-bad"}>{validation.ok ? <><CircleCheck aria-hidden="true" />Ready to publish</> : <><CircleAlert aria-hidden="true" />{validation.errors.length} blocking · {validation.warnings.length} warning{validation.warnings.length === 1 ? "" : "s"}</>}</p>
            {findingList(findings, "No issues found.")}</>}
        </section>
        <section className="k-card om-card"><header><h2>Capacity summary</h2></header>
          <ul className="om-cap">
            <li><b className="dot ga" />General admission<span>{n(kpi.ga)}</span><small>{pct(kpi.ga, kpi.total)}%</small></li>
            <li><b className="dot seat" />Seated (incl. tables)<span>{n(kpi.seated)}</span><small>{pct(kpi.seated, kpi.total)}%</small></li>
            <li><b className="dot vip" />VIP areas &amp; booths<span>{n(kpi.vip)}</span><small>{pct(kpi.vip, kpi.total)}%</small></li>
            <li className="tot">Total public capacity<span>{n(kpi.total)}</span><small>{cap ? `${pct(kpi.total, cap)}%` : ""}</small></li>
            <li>Venue capacity (max)<span>{cap ? n(cap) : "Not set by venue"}</span></li>
          </ul></section>
      </aside>
    </div>

    {conflict && <div className="om-modal" role="alertdialog" aria-modal="true" aria-labelledby="om-conflict-h"><div className="om-modal-box">
      <h3 id="om-conflict-h"><AlertTriangle aria-hidden="true" />This layout changed while you were editing</h3>
      <p>Version {conflict.current} was saved after you opened version {base.version}. Nothing has been overwritten.</p>
      <div className="om-modal-acts"><button type="button" className="k-btn primary sm" disabled={pending} onClick={() => resolve("merge")}><GitMerge aria-hidden="true" />Merge and save</button>
        <button type="button" className="k-btn outline sm" disabled={pending} onClick={() => resolve("reload")}><RefreshCw aria-hidden="true" />Reload their version</button>
        <button type="button" className="k-btn outline sm" disabled={pending} onClick={() => resolve("mine")}>Keep mine on top</button>
        <button type="button" className="k-btn ghost sm" disabled={pending} onClick={() => setConflict(null)}>Cancel</button></div>
      <small>Merge keeps both sides’ additions and takes each element from whoever changed it; where you both changed the same element, yours is kept and listed.</small></div></div>}
  </div>;
}
