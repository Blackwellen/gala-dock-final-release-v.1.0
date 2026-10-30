import "@/styles/public-listing-extras.css";
import Link from "next/link";
import { Users, Building2, Ruler, LayoutGrid, Utensils, Wine, Clock, Accessibility, Car, ShieldCheck, Truck, Music2, Ban, Wallet, CheckCircle2, XCircle, MapPin, Plug, CalendarClock } from "lucide-react";

/**
 * Public listing sections built from what providers publish (W01 Part 2). Server-only rendering, no client JS.
 * Every section hides itself when the provider hasn't filled it in — no placeholder copy, no invented facts.
 */
const money = (n: number | null | undefined) => n == null ? null : `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 })}`;
const txt = (v: unknown) => typeof v === "string" && v.trim() ? v.trim() : null;
const list = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
const LAYOUT: Record<string, string> = { theatre: "Theatre", banquet: "Banquet", cabaret: "Cabaret", standing: "Standing", classroom: "Classroom", boardroom: "Boardroom", reception: "Reception", u_shape: "U-shape", seated: "Seated" };
const DIET: Record<string, string> = { vegetarian: "Vegetarian", vegan: "Vegan", gluten_free: "Gluten free", dairy_free: "Dairy free", pescatarian: "Pescatarian", halal: "Halal", kosher: "Kosher", nut_free: "Nut free" };
const label = (k: string, map: Record<string, string>) => map[k] ?? k.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

/* ---------- Spaces (item 5): card expands to layouts, dimensions and photos ---------- */
export type PublicSpace = { id: string; name: string; indoor: boolean; capacity_seated: number | null; capacity_standing: number | null; image: string | null; area_sqm: number | null; layouts: unknown; amenities: string[] | null; details: unknown };
export function SpaceCard({ s, fallback }: { s: PublicSpace; fallback?: string }) {
  const d = (s.details ?? {}) as Record<string, unknown>;
  const layouts = Object.entries((s.layouts && typeof s.layouts === "object" ? s.layouts : {}) as Record<string, number>).filter(([, n]) => Number(n) > 0).sort((a, b) => b[1] - a[1]);
  const dim = (d.dimensions ?? {}) as { width?: number; length?: number; ceiling?: number };
  const gallery = list(d.gallery).filter(g => g !== s.image).slice(0, 6);
  const feats = [...new Set([...list(d.layout_features), ...(s.amenities ?? [])])];
  const max = Math.max(s.capacity_standing ?? 0, s.capacity_seated ?? 0, ...layouts.map(([, n]) => Number(n)));
  const facts: [typeof Users, string, string][] = [
    ...(dim.width && dim.length ? [[Ruler, "Dimensions", `${dim.width} × ${dim.length} m${dim.ceiling ? ` · ${dim.ceiling} m ceiling` : ""}`] as [typeof Users, string, string]] : []),
    ...(s.area_sqm ? [[LayoutGrid, "Floor area", `${Number(s.area_sqm).toLocaleString("en-GB")} m²`] as [typeof Users, string, string]] : []),
    ...(txt(d.access) ? [[Truck, "Access", txt(d.access)!] as [typeof Users, string, string]] : []),
    ...(txt(d.toilets) ? [[Building2, "Toilets", txt(d.toilets)!] as [typeof Users, string, string]] : []),
    ...(txt(d.bar) ? [[Wine, "Bar", txt(d.bar)!] as [typeof Users, string, string]] : []),
    ...(txt(d.catering) ? [[Utensils, "Catering", txt(d.catering)!] as [typeof Users, string, string]] : []),
    ...(txt(d.accessibility) ? [[Accessibility, "Accessibility", txt(d.accessibility)!] as [typeof Users, string, string]] : []),
  ];
  const more = layouts.length > 0 || facts.length > 0 || gallery.length > 0 || feats.length > 0;
  const img = s.image || fallback;
  return <article className="ce-card pl3-space plx-space">
    {/* eslint-disable-next-line @next/next/no-img-element */}{img && <img src={img} alt="" loading="lazy" />}
    <b>{s.name}</b>
    {max > 0 && <small><Users size={14} />Up to {max.toLocaleString("en-GB")} guests</small>}
    <small><Building2 size={14} />{[s.indoor ? "Indoor" : "Outdoor", txt(d.space_type)].filter(Boolean).join(" · ")}</small>
    {txt(d.description) && <p>{txt(d.description)}</p>}
    {more && <details className="plx-more"><summary>Layouts, size and photos</summary>
      {layouts.length > 0 && <ul className="plx-layouts" aria-label={`${s.name} layouts`}>{layouts.map(([k, n]) => <li key={k} className={k === d.default_layout ? "on" : ""}><span>{label(k, LAYOUT)}{k === d.default_layout ? <i>Default</i> : null}</span><b>{Number(n).toLocaleString("en-GB")}</b></li>)}</ul>}
      {facts.length > 0 && <dl className="plx-facts">{facts.map(([I, t, v]) => <div key={t}><dt><I size={14} aria-hidden />{t}</dt><dd>{v}</dd></div>)}</dl>}
      {feats.length > 0 && <div className="plx-chips">{feats.slice(0, 10).map(f => <span key={f}><CheckCircle2 size={12} aria-hidden />{f}</span>)}</div>}
      {gallery.length > 0 && <div className="plx-sgal">{gallery.map((g, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={g} src={g} alt={`${s.name} photo ${i + 2}`} loading="lazy" />)}</div>}
    </details>}
  </article>;
}

/* ---------- Menus (item 2) ---------- */
export type PublicMenu = { id: string; name: string; kind: string; description: string | null; serving_style: string | null; pricing: string; price: number | null; min_guests: number | null; max_guests: number | null; final_numbers_days: number | null; listing: { name: string; href: string } | null };
export type PublicMenuSection = { id: string; menu_id: string; name: string; sort: number };
export type PublicMenuItem = { id: string; menu_id: string; section_id: string | null; name: string; description: string | null; price: number | null; unit: string | null; dietary: string[] | null; allergens: string[] | null; allergen_status: string | null; course: string | null; sort: number; available: boolean };
export function ListingMenus({ menus, sections, items, own }: { menus: PublicMenu[]; sections: PublicMenuSection[]; items: PublicMenuItem[]; own: string }) {
  if (!menus.length) return null;
  return <section id="menus" className="pl3-row plx-menus"><div className="k-between"><h2>Menus</h2><span className="k-small">{menus.length} menu{menus.length === 1 ? "" : "s"}</span></div>
    <div className="plx-menu-g">{menus.map(m => {
      const secs = sections.filter(s => s.menu_id === m.id).sort((a, b) => a.sort - b.sort);
      const its = items.filter(i => i.menu_id === m.id && i.available).sort((a, b) => a.sort - b.sort);
      const groups: [string, PublicMenuItem[]][] = secs.length ? secs.map(s => [s.name, its.filter(i => i.section_id === s.id)] as [string, PublicMenuItem[]]).filter(([, l]) => l.length > 0) : [["", its]];
      const loose = secs.length ? its.filter(i => !i.section_id || !secs.some(s => s.id === i.section_id)) : [];
      if (loose.length) groups.push(["More", loose]);
      const price = m.pricing === "per_person" && m.price ? `${money(m.price)} per guest` : m.pricing === "fixed" && m.price ? `${money(m.price)} package` : null;
      return <article key={m.id} className="ce-card plx-menu">
        <header><div><b>{m.name}</b><small>{[m.kind === "drink" ? "Drinks" : m.kind === "mixed" ? "Food & drink" : "Food", m.serving_style ? label(m.serving_style, {}) : null, m.listing && m.listing.name !== own ? `by ${m.listing.name}` : null].filter(Boolean).join(" · ")}</small></div>{price && <strong>{price}</strong>}</header>
        {m.description && <p>{m.description}</p>}
        {(m.min_guests || m.final_numbers_days) && <ul className="plx-menu-terms">{m.min_guests ? <li><Users size={13} aria-hidden />{m.max_guests ? `${m.min_guests.toLocaleString("en-GB")}–${m.max_guests.toLocaleString("en-GB")} guests` : `From ${m.min_guests.toLocaleString("en-GB")} guests`}</li> : null}{m.final_numbers_days ? <li><CalendarClock size={13} aria-hidden />Final numbers {m.final_numbers_days} days before</li> : null}</ul>}
        {its.length > 0 && <details className="plx-more" open={menus.length === 1}><summary>View {its.length} item{its.length === 1 ? "" : "s"}</summary>
          {groups.map(([g, l]) => <div key={g || "all"} className="plx-course">{g && <h3>{g}</h3>}<ul>{l.map(i => <li key={i.id}><div><b>{i.name}</b>{i.description && <small>{i.description}</small>}
            {((i.dietary ?? []).length > 0 || (i.allergen_status === "declared" && (i.allergens ?? []).length > 0)) && <span className="plx-tags">{(i.dietary ?? []).map(t => <i key={t}>{label(t, DIET)}</i>)}{i.allergen_status === "declared" && (i.allergens ?? []).length > 0 && <em>Contains: {(i.allergens ?? []).join(", ")}</em>}</span>}</div>
            {m.pricing !== "per_person" && m.pricing !== "fixed" && i.price ? <strong>{money(i.price)}{i.unit && i.unit !== "portion" ? <small> / {i.unit}</small> : null}</strong> : null}</li>)}</ul></div>)}
        </details>}
        {m.listing && m.listing.name !== own && <Link className="k-link" href={m.listing.href}>View {m.listing.name}</Link>}
      </article>;
    })}</div>
    <p className="plx-note">Allergens are as declared by the caterer. Tell them about any dietary needs when you enquire.</p></section>;
}

/* ---------- Media galleries + banner (item 3) ---------- */
export type PublicGallery = { id: string; title: string; items: { url: string; alt: string; caption: string | null }[] };
export function ListingBanner({ banner, name }: { banner: { url: string; alt: string | null; title: string | null } | null; name: string }) {
  if (!banner) return null;
  /* eslint-disable-next-line @next/next/no-img-element */
  return <figure className="plx-banner"><img src={banner.url} alt={banner.alt || banner.title || `${name} banner`} /></figure>;
}
export function ListingGalleries({ galleries }: { galleries: PublicGallery[] }) {
  const shown = galleries.filter(g => g.items.length > 0);
  if (!shown.length) return null;
  return <section id="galleries" className="pl3-row plx-gals">{shown.map(g => <div key={g.id} className="plx-gal"><div className="k-between"><h2>{g.title}</h2><span className="k-small">{g.items.length} photo{g.items.length === 1 ? "" : "s"}</span></div>
    <div className="pe3-photos-g">{g.items.slice(0, 12).map((it, i) => <figure key={it.url + i}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={it.url} alt={it.alt} loading="lazy" />{it.caption && <figcaption>{it.caption}</figcaption>}</figure>)}</div></div>)}</section>;
}

/* ---------- Venue "Good to know" (item 4): only the details providers enter for guests ---------- */
type VenueDetails = { features?: unknown; hours?: Record<string, [string, string] | null>; info?: Record<string, unknown>; access?: Record<string, unknown>; fnb?: Record<string, unknown>; suppliers?: Record<string, unknown>;
  commercial?: { cancellation?: { window: string; refund: number }[]; deposit_pct?: number; deposit_fixed?: number; balance_days?: number; security_deposit?: number; minimum_spend?: number; lead_days?: number; short_notice?: boolean; standby?: { enabled?: boolean } } };
const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]] as const;
export function venueFacts(d: VenueDetails) {
  const info = d.info ?? {}, access = d.access ?? {}, fnb = d.fnb ?? {};
  return {
    features: list(d.features), eventTypes: list(info.event_types), licences: list(info.licences),
    curfew: txt(info.curfew), parking: txt(info.parking) ?? (access.parking === true ? "Accessible parking" : null), staffing: txt(info.staffing),
    accessibility: txt(info.accessibility), catering: txt(fnb.catering),
  };
}
export function VenueGoodToKnow({ d }: { d: VenueDetails }) {
  const f = venueFacts(d), access = d.access ?? {}, fnb = d.fnb ?? {}, sup = d.suppliers ?? {}, c = d.commercial ?? {};
  const hours = DAYS.map(([k, l]) => [l, d.hours?.[k]] as const).filter(([, h]) => Array.isArray(h) && h.length === 2);
  const flags = ([["step_free", "Step-free access"], ["lift", "Lift access"], ["toilets", "Accessible toilets"], ["hearing_loop", "Hearing loop"], ["parking", "Accessible parking"], ["assistance", "Assistance available"]] as const).filter(([k]) => access[k] === true).map(([, l]) => l);
  const fb: [string, string][] = ([["Catering", txt(fnb.catering)], ["Bar", txt(fnb.bar)], ["External catering", txt(fnb.external_catering)], ["Corkage", txt(fnb.corkage)]] as [string, string | null][]).filter((x): x is [string, string] => !!x[1]);
  const fbFlags = [fnb.cash_bar === true ? "Cash bar" : null, fnb.drink_packages === true ? "Pre-paid drink packages" : null].filter(Boolean) as string[];
  const su: [string, string][] = ([["External suppliers", txt(sup.external)], ["Preferred suppliers", txt(sup.preferred)], ["Equipment hire", txt(sup.equipment)], ["Noise", txt(sup.noise)]] as [string, string | null][]).filter((x): x is [string, string] => !!x[1]);
  const canc = (c.cancellation ?? []).filter(x => x && x.window);
  const terms: [string, string][] = ([
    ["Deposit", c.deposit_pct ? `${c.deposit_pct}% to confirm` : c.deposit_fixed ? `${money(c.deposit_fixed)} to confirm` : null],
    ["Balance", c.balance_days ? `Due ${c.balance_days} days before the event` : null],
    ["Security deposit", c.security_deposit ? `${money(c.security_deposit)}, released after the event` : null],
    ["Minimum spend", c.minimum_spend ? money(c.minimum_spend) : null],
    ["Notice", c.lead_days ? `${c.lead_days} days minimum${c.short_notice ? " (shorter notice considered)" : ""}` : null],
    ["Standby dates", c.standby?.enabled ? "Offered when your date is taken" : null],
  ] as [string, string | null][]).filter((x): x is [string, string] => !!x[1]);
  const cards = [
    (flags.length || f.accessibility || txt(access.notes)) && <section key="a" className="ce-card plx-card"><h3><Accessibility size={18} aria-hidden />Accessibility</h3>{f.accessibility && <p>{f.accessibility}</p>}
      {flags.length > 0 && <ul className="plx-ticks">{flags.map(x => <li key={x}><CheckCircle2 size={14} aria-hidden />{x}</li>)}</ul>}{txt(access.notes) && <p className="k-small">{txt(access.notes)}</p>}</section>,
    (fb.length || fbFlags.length || txt(fnb.notes)) && <section key="f" className="ce-card plx-card"><h3><Utensils size={18} aria-hidden />Food &amp; drink</h3>{fb.length > 0 && <dl>{fb.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      {fbFlags.length > 0 && <ul className="plx-ticks">{fbFlags.map(x => <li key={x}><CheckCircle2 size={14} aria-hidden />{x}</li>)}</ul>}{txt(fnb.notes) && <p className="k-small">{txt(fnb.notes)}</p>}</section>,
    (f.parking || f.curfew || f.licences.length || f.staffing || hours.length) && <section key="p" className="ce-card plx-card"><h3><Clock size={18} aria-hidden />Practical details</h3><dl>
      {f.curfew && <div><dt>Curfew</dt><dd>{f.curfew}</dd></div>}{f.parking && <div><dt><Car size={13} aria-hidden /> Parking</dt><dd>{f.parking}</dd></div>}
      {f.licences.length > 0 && <div><dt><Music2 size={13} aria-hidden /> Licensed for</dt><dd>{f.licences.join(", ")}</dd></div>}{f.staffing && <div><dt>Staffing</dt><dd>{f.staffing}</dd></div>}</dl>
      {hours.length > 0 && <><b className="plx-sub">Opening hours</b><ul className="plx-hours">{hours.map(([l, h]) => <li key={l}><span>{l}</span><span>{h![0]}–{h![1]}</span></li>)}</ul></>}</section>,
    (su.length || txt(sup.notes)) && <section key="s" className="ce-card plx-card"><h3><ShieldCheck size={18} aria-hidden />Supplier rules</h3><dl>{su.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>{txt(sup.notes) && <p className="k-small">{txt(sup.notes)}</p>}</section>,
    (canc.length || terms.length) && <section key="t" className="ce-card plx-card"><h3><Wallet size={18} aria-hidden />Booking terms</h3>{terms.length > 0 && <dl>{terms.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      {canc.length > 0 && <><b className="plx-sub"><Ban size={13} aria-hidden /> Cancellation</b><ul className="plx-hours">{canc.map(x => <li key={x.window}><span>{x.window}</span><span>{x.refund}% refund</span></li>)}</ul></>}
      <p className="k-small">Accepted bookings keep the terms agreed at the time.</p></section>,
  ].filter(Boolean);
  if (!cards.length) return null;
  return <section id="details" className="pl3-row"><div className="k-between"><h2>Good to know</h2></div><div className="plx-cards">{cards}</div></section>;
}

/* ---------- Service details (item 4, services): what the supplier wizard publishes ---------- */
export type ServiceDetails = { coverage?: { mode?: string; radius_miles?: number; base?: string; areas?: string }; delivery?: string; event_types?: string[]; pricing?: { model?: string; show_price?: boolean };
  addons?: { name: string; desc: string; price: number; unit: string }[]; setup?: { setup_minutes?: number; packdown_minutes?: number; space?: string; power?: boolean; covered?: boolean; parking?: boolean; dressing?: boolean };
  lead?: { min_days?: number; max_days?: number | null }; cancellation?: { window: string; refund: number }[]; included?: string[]; excluded?: string[]; durations?: string; team?: string; equipment?: string; travel?: string;
  credentials?: { name: string; reference?: string; expires?: string }[] };
export function coverageLine(c: ServiceDetails["coverage"]) {
  if (!c) return null;
  if (c.mode === "national") return "Covers the whole UK";
  if (c.mode === "international") return "UK and international";
  return [c.radius_miles && c.base ? `Within ${c.radius_miles} miles of ${c.base}` : c.base ?? null, txt(c.areas)].filter(Boolean).join(" · ") || null;
}
export function ServiceDetailsSection({ s }: { s: ServiceDetails }) {
  const showPrice = s.pricing?.show_price !== false;
  const inc = list(s.included), exc = list(s.excluded), addons = (s.addons ?? []).filter(a => a?.name);
  const st = s.setup ?? {};
  const needs = [st.power ? "Power supply" : null, st.covered ? "Covered area" : null, st.parking ? "Parking for the team" : null, st.dressing ? "Changing / green room" : null].filter(Boolean) as string[];
  const facts: [typeof Users, string, string][] = ([
    [MapPin, "Coverage", coverageLine(s.coverage)], [Users, "Team", txt(s.team)], [Plug, "Equipment", txt(s.equipment)], [Truck, "Travel", txt(s.travel)], [Clock, "Durations", txt(s.durations)],
    [Clock, "Setup", st.setup_minutes || st.packdown_minutes ? [st.setup_minutes ? `${st.setup_minutes / 60} h setup` : null, st.packdown_minutes ? `${st.packdown_minutes / 60} h pack-down` : null].filter(Boolean).join(" · ") : null],
    [CalendarClock, "Notice", s.lead?.min_days ? `Book at least ${s.lead.min_days} days ahead` : null],
  ] as [typeof Users, string, string | null][]).filter((x): x is [typeof Users, string, string] => !!x[2]);
  const canc = (s.cancellation ?? []).filter(x => x && x.window);
  const types = list(s.event_types);
  const insured = (s.credentials ?? []).some(c => c.name?.startsWith("Public liability") && (c.reference || c.expires));
  if (!facts.length && !inc.length && !exc.length && !addons.length && !needs.length && !txt(st.space) && !canc.length && !types.length && !insured) return null;
  return <section id="details" className="pl3-row"><div className="k-between"><h2>Service details</h2>{insured && <span className="plx-badge"><ShieldCheck size={14} aria-hidden />Public liability insurance on file</span>}</div>
    <div className="plx-cards">
      {(facts.length > 0 || types.length > 0) && <section className="ce-card plx-card"><h3>At a glance</h3><dl>{facts.map(([I, k, v]) => <div key={k}><dt><I size={13} aria-hidden /> {k}</dt><dd>{v}</dd></div>)}</dl>
        {types.length > 0 && <div className="plx-chips">{types.map(t => <span key={t}>{t}</span>)}</div>}</section>}
      {(inc.length > 0 || exc.length > 0) && <section className="ce-card plx-card"><h3>What&apos;s included</h3>{inc.length > 0 && <ul className="plx-ticks">{inc.map(x => <li key={x}><CheckCircle2 size={14} aria-hidden />{x}</li>)}</ul>}
        {exc.length > 0 && <ul className="plx-ticks no">{exc.map(x => <li key={x}><XCircle size={14} aria-hidden />{x}</li>)}</ul>}</section>}
      {addons.length > 0 && <section className="ce-card plx-card"><h3>Add-ons</h3><ul className="plx-hours">{addons.map(a => <li key={a.name}><span><b>{a.name}</b>{a.desc && <small>{a.desc}</small>}</span>{showPrice && a.price ? <span>{money(a.price)} <small>{a.unit}</small></span> : <span>On request</span>}</li>)}</ul></section>}
      {(needs.length > 0 || txt(st.space)) && <section className="ce-card plx-card"><h3>What they need from you</h3>{needs.length > 0 && <ul className="plx-ticks">{needs.map(x => <li key={x}><CheckCircle2 size={14} aria-hidden />{x}</li>)}</ul>}{txt(st.space) && <p className="k-small">{txt(st.space)}</p>}</section>}
      {canc.length > 0 && <section className="ce-card plx-card"><h3><Ban size={16} aria-hidden />Cancellation</h3><ul className="plx-hours">{canc.map(x => <li key={x.window}><span>{x.window}</span><span>{x.refund}% refund</span></li>)}</ul><p className="k-small">Accepted bookings keep the terms agreed at the time.</p></section>}
    </div></section>;
}

/* ---------- Bar packages (published; same attachment rule as menus) ---------- */
export type PublicBar = { id: string; name: string; model: string; description: string | null; per_person: number | null; price: number | null; min_spend: number | null; token_price: number | null; corkage_per_bottle: number | null; hours_from: string | null; hours_to: string | null; min_age: number | null; listing: { name: string; href: string } | null };
const BAR_MODEL: Record<string, string> = { open_bar: "Open bar", hosted_bar: "Hosted bar", cash_bar: "Cash bar", minimum_spend: "Minimum-spend bar", drink_tokens: "Drink tokens", package: "Drinks package" };
/** Customer-facing terms only: price per guest / package, minimum spend, token and corkage prices, service hours, minimum age. Never licence references, staffing, equipment or deposits. */
export function ListingBars({ bars, own }: { bars: PublicBar[]; own: string }) {
  if (!bars.length) return null;
  const hm = (t: string | null) => t ? t.slice(0, 5) : null;
  return <section id="bars" className="pl3-row plx-menus"><div className="k-between"><h2>Bar packages</h2><span className="k-small">{bars.length} package{bars.length === 1 ? "" : "s"}</span></div>
    <div className="plx-menu-g">{bars.map(b => {
      const price = b.per_person ? `${money(b.per_person)} per guest` : b.price ? `${money(b.price)} package` : b.min_spend ? `${money(b.min_spend)} minimum spend` : null;
      const terms = [b.hours_from && b.hours_to ? `Bar open ${hm(b.hours_from)}–${hm(b.hours_to)}` : null, b.token_price ? `Drink tokens ${money(b.token_price)}` : null,
        b.corkage_per_bottle ? `Corkage ${money(b.corkage_per_bottle)} per bottle` : null, b.min_age ? `${b.min_age}+ only` : null, b.per_person && b.min_spend ? `Minimum spend ${money(b.min_spend)}` : null].filter(Boolean) as string[];
      return <article key={b.id} className="ce-card plx-menu">
        <header><div><b>{b.name}</b><small>{[label(b.model, BAR_MODEL), b.listing && b.listing.name !== own ? `by ${b.listing.name}` : null].filter(Boolean).join(" · ")}</small></div>{price && <strong>{price}</strong>}</header>
        {b.description && <p>{b.description}</p>}
        {terms.length > 0 && <ul className="plx-menu-terms">{terms.map(t => <li key={t}><Wine size={13} aria-hidden />{t}</li>)}</ul>}
        {b.listing && b.listing.name !== own && <Link className="k-link" href={b.listing.href}>View {b.listing.name}</Link>}
      </article>;
    })}</div></section>;
}
