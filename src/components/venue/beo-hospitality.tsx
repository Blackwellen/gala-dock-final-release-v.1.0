/**
 * BEO hospitality section (Q13): the structured `content.hospitality` written by `event_order_sync_hospitality` — catering, bar,
 * hospitality schedules, priced lines, allergens and warnings — rendered read-only. It replaces the free-text Catering / Bar
 * fields whenever it exists, so the BEO, the booking and the budget come from the same lines (no text-only duplication).
 */
type Line = { source: string; kind: string; label: string; section: string | null; course: string | null; basis: string; qty: number; unit_minor: number; total_minor: number;
  dietary: string[]; allergens: string[]; may_contain: string[]; service_at: string | null };
export type HospitalitySectionData = {
  status: string; booking_version: number; totals: { catering_minor: number; bar_minor: number; schedule_minor: number; contingent_minor: number; total_minor: number; adjustment_minor: number };
  allergens: string[]; may_contain: string[]; warnings: { code?: string; text?: string; message?: string }[] | null; allergen_disclaimer?: string;
  catering: { menu: string; serving_style: string | null; guests: number; final_guest_count: number | null; final_numbers_due: string | null; dietary_counts: Record<string, number> | null; service_at: string | null; timing_source: string } | null;
  bar: { package: string; mode: string; guests: number | null; starts_at: string | null; ends_at: string | null; tokens: number | null; corkage_bottles: number | null; min_spend_minor: number | null; licensing: { provided_by?: string; licence_ref?: string; min_age?: number } | null } | null;
  schedules: { id: string; kind: string; title: string; location: string | null; starts_at: string | null; ends_at: string | null; headcount: number | null; status: string }[];
  lines: Line[];
};
const gbp = (m: number | null | undefined) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((m ?? 0) / 100);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "—");
const words = (s: string) => s.replace(/_/g, " ");

export function BeoHospitality({ h }: { h: HospitalitySectionData }) {
  const diet = Object.entries(h.catering?.dietary_counts ?? {}).filter(([, n]) => n > 0);
  return <section className="mk-beo-h" aria-label="Hospitality">
    <dl className="mk-dl">
      <div><dt>Hospitality total</dt><dd>{gbp(h.totals.total_minor)}{h.totals.adjustment_minor ? ` (adjustment ${gbp(h.totals.adjustment_minor)})` : ""}</dd></div>
      <div><dt>Catering · bar · schedules</dt><dd>{gbp(h.totals.catering_minor)} · {gbp(h.totals.bar_minor)} · {gbp(h.totals.schedule_minor)}</dd></div>
      {h.totals.contingent_minor > 0 && <div><dt>Minimum-spend guarantee</dt><dd>{gbp(h.totals.contingent_minor)} (contingent, not in the total)</dd></div>}
      <div><dt>Selection</dt><dd>{words(h.status)} · version {h.booking_version}</dd></div>
    </dl>
    {h.catering && <><h3>Catering</h3><dl className="mk-dl">
      <div><dt>Menu</dt><dd>{h.catering.menu}{h.catering.serving_style ? ` · ${words(h.catering.serving_style)}` : ""}</dd></div>
      <div><dt>Guests</dt><dd>{h.catering.final_guest_count ?? h.catering.guests}{h.catering.final_guest_count ? " (final)" : h.catering.final_numbers_due ? ` · final numbers due ${new Date(h.catering.final_numbers_due).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</dd></div>
      <div><dt>Service</dt><dd>{when(h.catering.service_at)}{h.catering.timing_source === "programme" ? " (from the programme)" : ""}</dd></div>
      {diet.length > 0 && <div><dt>Dietary</dt><dd>{diet.map(([k, n]) => `${n} ${words(k)}`).join(", ")}</dd></div>}
    </dl></>}
    {h.bar && <><h3>Bar</h3><dl className="mk-dl">
      <div><dt>Package</dt><dd>{h.bar.package} · {words(h.bar.mode)}{h.bar.guests ? ` · ${h.bar.guests} guests` : ""}</dd></div>
      <div><dt>Hours</dt><dd>{when(h.bar.starts_at)} – {when(h.bar.ends_at)}</dd></div>
      {(h.bar.tokens || h.bar.corkage_bottles || h.bar.min_spend_minor) ? <div><dt>Terms</dt><dd>{[h.bar.tokens ? `${h.bar.tokens} tokens` : "", h.bar.corkage_bottles ? `${h.bar.corkage_bottles} bottles corkage` : "", h.bar.min_spend_minor ? `minimum spend ${gbp(h.bar.min_spend_minor)}` : ""].filter(Boolean).join(" · ")}</dd></div> : null}
      {h.bar.licensing && <div><dt>Licensing</dt><dd>{h.bar.licensing.provided_by ?? "—"}{h.bar.licensing.licence_ref ? ` (${h.bar.licensing.licence_ref})` : ""} · {h.bar.licensing.min_age ?? 18}+</dd></div>}
    </dl></>}
    {h.schedules.length > 0 && <><h3>Hospitality schedule</h3><ul className="mk-list">{h.schedules.map(s => <li key={s.id}><div className="mk-main"><b>{s.title}</b>
      <small>{words(s.kind)} · {when(s.starts_at)}{s.ends_at ? ` – ${when(s.ends_at)}` : ""}{s.location ? ` · ${s.location}` : ""}{s.headcount ? ` · ${s.headcount} people` : ""}</small></div></li>)}</ul></>}
    {h.lines.length > 0 && <><h3>Lines</h3><div style={{ overflowX: "auto" }}><table className="ws-table"><thead><tr><th>Item</th><th>Basis</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "right" }}>Unit</th><th style={{ textAlign: "right" }}>Total</th><th>Allergens</th></tr></thead>
      <tbody>{h.lines.map((l, i) => <tr key={i}><td>{l.label}{l.course ? <small> · {words(l.course)}</small> : null}</td><td>{words(l.basis)}</td><td style={{ textAlign: "right" }}>{l.qty}</td><td style={{ textAlign: "right" }}>{gbp(l.unit_minor)}</td><td style={{ textAlign: "right" }}>{gbp(l.total_minor)}</td>
        <td>{l.allergens.length ? l.allergens.join(", ") : "—"}{l.may_contain.length ? <small> · may contain {l.may_contain.join(", ")}</small> : null}</td></tr>)}</tbody></table></div></>}
    <dl className="mk-dl"><div><dt>Allergens across the menu</dt><dd>{h.allergens.length ? h.allergens.join(", ") : "None declared"}{h.may_contain.length ? ` · may contain ${h.may_contain.join(", ")}` : ""}</dd></div></dl>
    {(h.warnings ?? []).length > 0 && <ul className="mk-list">{(h.warnings ?? []).map((w, i) => <li key={i}><span className="mk-tag orange">Check</span><small>{w.text ?? w.message ?? words(w.code ?? "")}</small></li>)}</ul>}
    {h.allergen_disclaimer && <p className="mk-note">{h.allergen_disclaimer}</p>}
  </section>;
}
