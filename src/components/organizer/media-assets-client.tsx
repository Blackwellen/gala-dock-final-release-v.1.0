"use client";
import { useState } from "react";
import { ImageIcon, Pencil, ShieldCheck, AlertTriangle, Plus, ArrowUp, ArrowDown, X, Globe, Lock, Palette, CheckCircle2, History } from "lucide-react";
import { Card, CardHead, Chip, Empty, Btn, Photo } from "@/components/kit";
import { Dialog, useAction } from "@/components/kit/client";
import { dateShort } from "@/lib/format";
import { saveAssetMetadata, saveGallery, setGalleryPublic, saveBrandRules, checkDesignBrand } from "@/lib/actions/media-library-ui";

export type Asset = { id: string; event_id: string | null; workspace_id: string | null; kind: string; title: string | null; url: string | null; status: string; alt_text: string | null; licence: string;
  licence_holder: string | null; licence_expires_at: string | null; credit: string | null; usage_scope: string; subject: string; created_at: string; problems: string[]; event_name: string | null };
export type Gallery = { id: string; title: string; event_id: string | null; visibility: string; status: string; version: number; updated_at: string; items: { asset_id: string; sort: number; caption: string | null }[] };

const PROBLEM: Record<string, string> = { alt_text_required: "Alt text missing", licence_unknown: "Licence unknown", licence_expired: "Licence expired", credit_required: "Credit needed", not_approved: "Not approved",
  file_missing: "File missing", file_unverified: "File not verified", file_pending: "Scan pending", file_quarantined: "File quarantined", file_blocked: "File blocked" };
const LICENCES: [string, string][] = [["owned", "Owned by us"], ["licensed", "Licensed"], ["stock", "Stock"], ["cc_by", "CC BY"], ["cc_by_sa", "CC BY-SA"], ["cc0", "CC0 / public domain"], ["unknown", "Unknown"]];
const SUBJECTS = ["event", "venue", "provider", "sponsor", "brand", "previous"];
const isImg = (a: Asset) => !!a.url && (a.kind === "image" || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(a.url));

function Problems({ a }: { a: Asset }) {
  if (!a.problems.length) return <Chip tone="green" icon={ShieldCheck}>Ready for public use</Chip>;
  return <span className="oc-badges">{a.problems.map(p => <Chip key={p} tone={p.startsWith("file_") ? "red" : "amber"}>{PROBLEM[p] ?? p.replace(/_/g, " ")}</Chip>)}</span>;
}

export function AssetsClient({ assets, usages, canManage }: { assets: Asset[]; usages: { asset_id: string; target_kind: string; target_id: string; public_use: boolean; created_at: string }[]; canManage: boolean }) {
  const [filter, setFilter] = useState<"all" | "attention" | "public">("all"); const [edit, setEdit] = useState<Asset | null>(null);
  const shown = assets.filter(a => filter === "all" || (filter === "public" ? a.usage_scope === "public" : a.problems.length > 0));
  return <div className="k-col" style={{ gap: 14 }}>
    <div className="k-notice"><ShieldCheck size={16} aria-hidden /><span>Media used publicly — public scope, public galleries, landing pages and campaign assets — needs alt text, a usable licence (with credit where required), approval and a clean file scan.</span></div>
    <div className="k-between oc-wrap"><div className="k-seg" role="tablist" aria-label="Filter media">{([["all", `All (${assets.length})`], ["attention", `Needs attention (${assets.filter(a => a.problems.length).length})`], ["public", `Public (${assets.filter(a => a.usage_scope === "public").length})`]] as const).map(([k, l]) =>
      <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}</div>
      {!canManage && <span className="k-xs k-muted">Read only — owners and managers edit media rights.</span>}</div>
    {shown.length ? <div className="oc-media-grid">{shown.map(a => <Card key={a.id} tight className="oc-media">
      {isImg(a) ? <Photo src={a.url} alt={a.alt_text ?? ""} h={140} radius={8} /> : <div className="oc-media-ph"><ImageIcon size={26} aria-hidden /><span>{a.kind}</span></div>}
      <div className="k-col" style={{ gap: 6, marginTop: 8 }}>
        <div className="k-between"><b className="oc-ellipsis">{a.title ?? "Untitled"}</b><Chip tone={a.usage_scope === "public" ? "blue" : "gray"} icon={a.usage_scope === "public" ? Globe : Lock}>{a.usage_scope}</Chip></div>
        <span className="k-xs k-muted">{a.event_name ?? "Workspace"} · {LICENCES.find(l => l[0] === a.licence)?.[1] ?? a.licence} · {a.status}</span>
        <Problems a={a} />
        <Btn size="sm" variant="outline" icon={Pencil} onClick={() => setEdit(a)} aria-label={`Edit details for ${a.title ?? "media"}`}>{canManage ? "Edit rights & publish" : "View details"}</Btn>
      </div></Card>)}</div>
      : <Empty icon={ImageIcon} title={assets.length ? "Nothing matches this filter" : "No media yet"} text={assets.length ? "Try another filter." : "Upload images on an event's Posters & Media page; they appear here for rights review."} action={assets.length ? <Btn size="sm" variant="outline" onClick={() => setFilter("all")}>Show all media</Btn> : undefined} />}
    {edit && <AssetEditor key={edit.id} a={edit} usages={usages.filter(u => u.asset_id === edit.id)} canManage={canManage} onClose={() => setEdit(null)} />}
  </div>;
}

function AssetEditor({ a, usages, canManage, onClose }: { a: Asset; usages: { target_kind: string; target_id: string; public_use: boolean; created_at: string }[]; canManage: boolean; onClose: () => void }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ alt_text: a.alt_text ?? "", licence: a.licence, licence_holder: a.licence_holder ?? "", licence_expires_at: a.licence_expires_at?.slice(0, 10) ?? "", credit: a.credit ?? "", subject: a.subject, status: a.status, public: a.usage_scope === "public" });
  const save = async () => { const r = await run(() => saveAssetMetadata(a.id, { ...f, licence_expires_at: f.licence_expires_at ? new Date(`${f.licence_expires_at}T23:59:59Z`).toISOString() : null })); if (r.ok) onClose(); };
  return <Dialog open onClose={onClose} wide title={a.title ?? "Media details"} sub="Rights, credit and where this media may be used."
    footer={<><Btn variant="ghost" onClick={onClose}>Close</Btn>{canManage && <Btn disabled={pending} onClick={() => void save()}>Save</Btn>}</>}>
    <div className="oc-asset-edit">
      <div>{isImg(a) ? <Photo src={a.url} alt={a.alt_text ?? ""} h={180} radius={8} /> : <div className="oc-media-ph" style={{ height: 180 }}><ImageIcon size={28} aria-hidden /></div>}
        <div style={{ marginTop: 8 }}><Problems a={a} /></div>
        <h3 className="oc-h3" style={{ marginTop: 12 }}>Used in</h3>
        {usages.length ? <ul className="oc-ul">{usages.map(u => <li key={`${u.target_kind}-${u.target_id}`}>{u.target_kind} · {u.public_use ? "public" : "private"} · since {dateShort(u.created_at)}</li>)}</ul> : <p className="k-small k-muted">Not used in any gallery, campaign or landing page yet.</p>}</div>
      <fieldset className="oc-form" disabled={!canManage} style={{ border: 0, padding: 0, margin: 0 }}>
        <label className="k-field oc-span2"><span>Alt text (describes the image for screen readers) <b>*</b></span><textarea className="k-input" rows={2} style={{ height: "auto" }} maxLength={500} value={f.alt_text} onChange={e => setF({ ...f, alt_text: e.target.value })} /></label>
        <label className="k-field"><span>Licence</span><select className="k-select" value={f.licence} onChange={e => setF({ ...f, licence: e.target.value })}>{LICENCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="k-field"><span>Licence holder</span><input className="k-input" maxLength={200} value={f.licence_holder} onChange={e => setF({ ...f, licence_holder: e.target.value })} /></label>
        <label className="k-field"><span>Licence expires</span><input type="date" className="k-input" value={f.licence_expires_at} onChange={e => setF({ ...f, licence_expires_at: e.target.value })} /><small>Once set, an expiry can be moved but not removed.</small></label>
        <label className="k-field"><span>Credit</span><input className="k-input" maxLength={200} value={f.credit} onChange={e => setF({ ...f, credit: e.target.value })} placeholder="Photo: Jane Doe" /></label>
        <label className="k-field"><span>Subject</span><select className="k-select" value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })}>{SUBJECTS.map(s => <option key={s}>{s}</option>)}</select></label>
        <label className="k-field"><span>Approval</span><select className="k-select" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="draft">Draft</option><option value="approved">Approved</option><option value="published">Published</option></select></label>
        <label className="k-row oc-span2" style={{ gap: 8 }}><input type="checkbox" checked={f.public} onChange={e => setF({ ...f, public: e.target.checked })} /><span><b>Usage scope: public</b> — may appear on public pages and galleries. Unticked keeps it to the event team.</span></label>
      </fieldset>
    </div>
  </Dialog>;
}

export function GalleriesClient({ workspaceId, galleries, assets, events, canManage }: { workspaceId: string; galleries: Gallery[]; assets: Asset[]; events: { id: string; name: string }[]; canManage: boolean }) {
  const { run, pending } = useAction(); const [sel, setSel] = useState<string | null>(galleries[0]?.id ?? null); const [creating, setCreating] = useState(false);
  const [nt, setNt] = useState({ title: "", event: "" });
  const g = galleries.find(x => x.id === sel) ?? null;
  return <div className="oc-split">
    <Card><CardHead title="Galleries" sub="Ordered sets of media for event pages and listings.">{canManage && <Btn size="sm" icon={Plus} onClick={() => setCreating(true)}>New gallery</Btn>}</CardHead>
      {galleries.length ? <ul className="oc-list">{galleries.map(x => <li key={x.id}><button type="button" className={`oc-li ${x.id === sel ? "on" : ""}`} aria-pressed={x.id === sel} onClick={() => setSel(x.id)}>
        <span className="k-grow"><b>{x.title}</b><small>{x.items.length} item(s) · {events.find(e => e.id === x.event_id)?.name ?? "Workspace"}</small></span><Chip tone={x.status === "published" ? "green" : "gray"}>{x.status === "published" ? "Public" : "Draft"}</Chip></button></li>)}</ul>
        : <Empty icon={ImageIcon} title="No galleries yet" text="Group approved media into a gallery for an event page." action={canManage ? <Btn size="sm" icon={Plus} onClick={() => setCreating(true)}>Create a gallery</Btn> : undefined} />}
    </Card>
    {g ? <GalleryEditor key={`${g.id}-${g.version}`} workspaceId={workspaceId} g={g} assets={assets} canManage={canManage} /> : <Card><Empty title="Select a gallery" text="Its items, order and publication appear here." /></Card>}
    <Dialog open={creating} onClose={() => setCreating(false)} title="New gallery" footer={<><Btn variant="ghost" onClick={() => setCreating(false)}>Cancel</Btn><Btn disabled={pending || nt.title.trim().length < 2} onClick={async () => {
      const r = await run(() => saveGallery(workspaceId, null, nt.title, nt.event || null, [], null)); const id = (r as { data?: { id: string } }).data?.id; if (r.ok) { setCreating(false); setNt({ title: "", event: "" }); if (id) setSel(id); } }}>Create gallery</Btn></>}>
      <div className="oc-form"><label className="k-field oc-span2"><span>Title</span><input className="k-input" maxLength={120} value={nt.title} onChange={e => setNt({ ...nt, title: e.target.value })} /></label>
        <label className="k-field oc-span2"><span>Event (optional)</span><select className="k-select" value={nt.event} onChange={e => setNt({ ...nt, event: e.target.value })}><option value="">Workspace gallery</option>{events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label></div>
    </Dialog>
  </div>;
}

function GalleryEditor({ workspaceId, g, assets, canManage }: { workspaceId: string; g: Gallery; assets: Asset[]; canManage: boolean }) {
  const { run, pending } = useAction();
  const [title, setTitle] = useState(g.title); const [items, setItems] = useState(g.items.map(i => ({ asset_id: i.asset_id, caption: i.caption ?? "" }))); const [add, setAdd] = useState("");
  const byId = new Map(assets.map(a => [a.id, a]));
  const move = (i: number, d: number) => setItems(s => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  const dirty = title !== g.title || JSON.stringify(items) !== JSON.stringify(g.items.map(i => ({ asset_id: i.asset_id, caption: i.caption ?? "" })));
  const isPublic = g.status === "published" && g.visibility === "public";
  const blocked = items.filter(i => (byId.get(i.asset_id)?.problems.length ?? 0) > 0).length;
  return <Card>
    <div className="k-between oc-wrap"><input className="k-input oc-title-input" aria-label="Gallery title" value={title} disabled={!canManage} maxLength={120} onChange={e => setTitle(e.target.value)} />
      <Chip lg tone={isPublic ? "green" : "gray"}>{isPublic ? "Public" : "Draft"}</Chip></div>
    {blocked > 0 && <p className="k-small k-amber" style={{ marginTop: 8 }}><AlertTriangle size={13} aria-hidden /> {blocked} item(s) aren&apos;t cleared for public use — fix them in Library before publishing.</p>}
    {items.length ? <ol className="oc-gallery">{items.map((it, i) => { const a = byId.get(it.asset_id); return <li key={it.asset_id}>
      {a && isImg(a) ? <Photo src={a.url} alt={a.alt_text ?? ""} h={64} w={86} radius={6} /> : <div className="oc-media-ph" style={{ width: 86, height: 64 }}><ImageIcon size={18} aria-hidden /></div>}
      <div className="k-grow k-col" style={{ gap: 4, minWidth: 0 }}><b className="oc-ellipsis">{a?.title ?? "Media"}</b>{a && <Problems a={a} />}
        <input className="k-input" aria-label={`Caption for ${a?.title ?? "item"}`} disabled={!canManage} maxLength={300} value={it.caption} placeholder="Caption (optional)" onChange={e => setItems(s => s.map((x, k) => k === i ? { ...x, caption: e.target.value } : x))} /></div>
      {canManage && <div className="k-row" style={{ gap: 4 }}><button type="button" className="k-icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
        <button type="button" className="k-icon-btn" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
        <button type="button" className="k-icon-btn" aria-label={`Remove ${a?.title ?? "item"}`} onClick={() => setItems(s => s.filter((_, k) => k !== i))}><X size={14} /></button></div>}
    </li>; })}</ol> : <p className="k-small k-muted" style={{ marginTop: 10 }}>No items yet.</p>}
    {canManage && <div className="k-row oc-wrap" style={{ gap: 8, marginTop: 10 }}>
      <select className="k-select" style={{ maxWidth: 320 }} aria-label="Add media to gallery" value={add} onChange={e => setAdd(e.target.value)}><option value="">Add media…</option>{assets.filter(a => !items.some(i => i.asset_id === a.id)).map(a => <option key={a.id} value={a.id}>{a.title ?? a.id.slice(0, 8)}{a.problems.length ? " (needs attention)" : ""}</option>)}</select>
      <Btn size="sm" variant="outline" icon={Plus} disabled={!add} onClick={() => { setItems(s => [...s, { asset_id: add, caption: "" }]); setAdd(""); }}>Add</Btn>
      <span className="k-grow" />
      <Btn size="sm" variant="outline" disabled={pending || !dirty} onClick={() => void run(() => saveGallery(workspaceId, g.id, title, null, items.map((x, i) => ({ asset_id: x.asset_id, sort: i, caption: x.caption || undefined })), g.version))}>Save order & items</Btn>
      {isPublic ? <Btn size="sm" variant="ghost" disabled={pending} onClick={() => void run(() => setGalleryPublic(g.id, false))}>Unpublish</Btn>
        : <Btn size="sm" icon={Globe} disabled={pending || dirty || !items.length} title={dirty ? "Save your changes first" : !items.length ? "Add an item first" : undefined} onClick={() => void run(() => setGalleryPublic(g.id, true))}>Publish gallery</Btn>}
    </div>}
    <p className="k-xs k-muted" style={{ marginTop: 8 }}>Public galleries show on listed event pages only. Version {g.version} · updated {dateShort(g.updated_at)}</p>
  </Card>;
}

type Kit = { colors: string[]; fonts: string[]; logos: string[]; rules: { palette_only?: boolean; kit_fonts_only?: boolean; min_contrast?: number; min_logo_px?: number; logo_clear_space_pct?: number }; version: number; updated_at: string } | null;
const FONTS = ["Inter", "Poppins", "Playfair Display", "Montserrat", "Roboto", "Lato", "Open Sans", "DM Sans", "Manrope", "Space Grotesk", "Lora", "Oswald"];
export function BrandClient({ workspaceId, kit, versions, designs, canManage }: { workspaceId: string; kit: Kit; versions: { version: number; created_at: string; snapshot: { colors?: string[]; fonts?: string[] } }[]; designs: { id: string; title: string; updated_at: string }[]; canManage: boolean }) {
  const { run, pending } = useAction();
  const [colors, setColors] = useState<string[]>(kit?.colors ?? []); const [fonts, setFonts] = useState<string[]>(kit?.fonts ?? []); const [nc, setNc] = useState("#");
  const [rules, setRules] = useState({ palette_only: !!kit?.rules?.palette_only, kit_fonts_only: !!kit?.rules?.kit_fonts_only, min_contrast: kit?.rules?.min_contrast != null ? String(kit.rules.min_contrast) : "", min_logo_px: kit?.rules?.min_logo_px != null ? String(kit.rules.min_logo_px) : "", logo_clear_space_pct: kit?.rules?.logo_clear_space_pct != null ? String(kit.rules.logo_clear_space_pct) : "" });
  const [checks, setChecks] = useState<Record<string, { ok: boolean; kit: boolean; findings: { rule: string; value: string }[] }>>({});
  const save = () => run(() => saveBrandRules(workspaceId, { colors, fonts, rules: { palette_only: rules.palette_only, kit_fonts_only: rules.kit_fonts_only,
    ...(rules.min_contrast ? { min_contrast: Number(rules.min_contrast) } : {}), ...(rules.min_logo_px ? { min_logo_px: Number(rules.min_logo_px) } : {}), ...(rules.logo_clear_space_pct ? { logo_clear_space_pct: Number(rules.logo_clear_space_pct) } : {}) } }, kit?.version ?? null));
  const check = async (id: string) => { const r = await run(() => checkDesignBrand(id), { refresh: false }); const d = (r as { data?: { ok: boolean; kit: boolean; findings: { rule: string; value: string }[] } }).data; if (r.ok && d) setChecks(s => ({ ...s, [id]: d })); };
  return <div className="oc-split">
    <Card>
      <CardHead title="Brand kit & rules" sub={kit ? `Version ${kit.version} · saved ${dateShort(kit.updated_at)}` : "No brand kit yet — save one to start versioning."} />
      <fieldset disabled={!canManage} className="k-col" style={{ gap: 12, border: 0, padding: 0, margin: 0 }}>
        <div><span className="k-label">Colours</span><div className="oc-swatches">{colors.map(c => <span key={c} className="oc-swatch"><i style={{ background: c }} aria-hidden />{c}{canManage && <button type="button" aria-label={`Remove ${c}`} onClick={() => setColors(s => s.filter(x => x !== c))}><X size={12} /></button>}</span>)}
          {canManage && <span className="k-row" style={{ gap: 6 }}><input className="k-input" style={{ width: 110 }} aria-label="New colour hex" value={nc} maxLength={7} onChange={e => setNc(e.target.value)} /><Btn size="sm" variant="outline" disabled={!/^#[0-9a-fA-F]{6}$/.test(nc) || colors.includes(nc.toUpperCase())} onClick={() => { setColors(s => [...s, nc.toUpperCase()]); setNc("#"); }}>Add</Btn></span>}</div></div>
        <div><span className="k-label">Fonts</span><div className="oc-badges" style={{ marginTop: 6 }}>{FONTS.map(f => <label key={f} className={`oc-pick ${fonts.includes(f) ? "on" : ""}`}><input type="checkbox" checked={fonts.includes(f)} onChange={e => setFonts(s => e.target.checked ? [...s, f] : s.filter(x => x !== f))} />{f}</label>)}
          {fonts.filter(f => !FONTS.includes(f)).map(f => <Chip key={f}>{f} (uploaded)</Chip>)}</div></div>
        <div className="oc-form">
          <label className="k-row oc-span2" style={{ gap: 8 }}><input type="checkbox" checked={rules.palette_only} onChange={e => setRules({ ...rules, palette_only: e.target.checked })} /> Designs may only use kit colours</label>
          <label className="k-row oc-span2" style={{ gap: 8 }}><input type="checkbox" checked={rules.kit_fonts_only} onChange={e => setRules({ ...rules, kit_fonts_only: e.target.checked })} /> Designs may only use kit fonts</label>
          <label className="k-field"><span>Minimum contrast ratio</span><input className="k-input" inputMode="decimal" value={rules.min_contrast} placeholder="4.5" onChange={e => setRules({ ...rules, min_contrast: e.target.value.replace(/[^\d.]/g, "") })} /></label>
          <label className="k-field"><span>Minimum logo size (px)</span><input className="k-input" inputMode="numeric" value={rules.min_logo_px} placeholder="64" onChange={e => setRules({ ...rules, min_logo_px: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="k-field"><span>Logo clear space (%)</span><input className="k-input" inputMode="decimal" value={rules.logo_clear_space_pct} placeholder="10" onChange={e => setRules({ ...rules, logo_clear_space_pct: e.target.value.replace(/[^\d.]/g, "") })} /></label>
        </div>
        <p className="k-xs k-muted">{kit?.logos?.length ?? 0} logo(s) in the kit are kept as they are. Automatic checks cover palette and fonts; contrast, logo size and clear space are recorded as guidance.</p>
      </fieldset>
      {canManage ? <Btn icon={Palette} disabled={pending} onClick={() => void save()} style={{ marginTop: 10 }}>Save as new version</Btn> : <p className="k-xs k-muted">Only owners and managers can change the brand kit.</p>}
      {versions.length > 0 && <><h3 className="oc-h3" style={{ marginTop: 14 }}><History size={13} aria-hidden /> Version history</h3><ul className="oc-ul">{versions.map(v => <li key={v.version}>v{v.version} · {dateShort(v.created_at)} · {v.snapshot.colors?.length ?? 0} colours, {v.snapshot.fonts?.length ?? 0} fonts</li>)}</ul></>}
    </Card>
    <Card>
      <CardHead title="Check designs against the kit" sub="Runs the saved rules on a design. Results are not stored." />
      {designs.length ? <ul className="oc-list">{designs.map(d => { const c = checks[d.id]; return <li key={d.id} className="oc-li static"><span className="k-grow"><b>{d.title}</b><small>Edited {dateShort(d.updated_at)}</small>
        {c && (c.ok ? <small className="k-green"><CheckCircle2 size={12} aria-hidden /> {c.kit ? "Follows the brand rules" : "No brand kit to check against"}</small> : <small className="k-amber">{c.findings.map(f => `${f.rule === "palette_only" ? "Off-palette colour" : "Non-kit font"} ${f.value}`).join(" · ")}</small>)}</span>
        <Btn size="sm" variant="outline" disabled={pending} onClick={() => void check(d.id)} aria-label={`Check ${d.title} against the brand kit`}>Check</Btn></li>; })}</ul>
        : <Empty icon={Palette} title="No designs yet" text="Create a design in My designs, then check it here." />}
    </Card>
  </div>;
}
