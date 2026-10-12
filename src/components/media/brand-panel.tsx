"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { saveBrandKit, type BrandKit } from "@/lib/media/collab";
import { FONTS } from "@/lib/media/document";
import { confirmDialog } from "@/lib/ui/dialogs";

export type CustomFont = { id: string; family: string; weight: number; style: "normal" | "italic" };
export type Brand = { workspaceId: string; canManage: boolean; kit: BrandKit; fonts: CustomFont[] };
export const logoSrc = (path: string) => `/api/media/asset?path=${encodeURIComponent(path)}`;

/** @font-face rules for the workspace's uploaded fonts (served same-origin so exports can embed them). */
export const fontFaceCss = (fonts: CustomFont[]) => fonts.map(f =>
  `@font-face{font-family:${JSON.stringify(f.family)};src:url(/api/media/font?id=${f.id});font-weight:${f.weight};font-style:${f.style};font-display:swap}`).join("\n");

/**
 * Brand kit (media spec §34–35, §44): the workspace's colours, fonts and logos, one click away in every design.
 * Owners and managers edit it here; everyone in the workspace can use it.
 */
export function BrandPanel({ brand, canEdit, onColor, onFont, onLogo, onFontsChange }: {
  brand: Brand; canEdit: boolean; onColor: (hex: string) => void; onFont: (family: string) => void; onLogo: (src: string, path: string, name: string) => void; onFontsChange: (f: CustomFont[]) => void;
}) {
  const [kit, setKit] = useState(brand.kit);
  const [fonts, setFonts] = useState(brand.fonts);
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState("");
  const [hex, setHex] = useState("#0b08f8"), [pickFont, setPickFont] = useState("");
  const manage = brand.canManage;
  const persist = async (next: BrandKit) => {
    setBusy("kit"); setMsg("");
    const r = await saveBrandKit(brand.workspaceId, next); setBusy("");
    if (r.ok) setKit(next); else setMsg(r.error);
  };
  const uploadLogo = async (file: File) => {
    setBusy("logo"); setMsg("");
    const fd = new FormData(); fd.set("file", file); fd.set("purpose", "image");
    const r = await fetch("/api/uploads", { method: "POST", body: fd }); const j = await r.json(); setBusy("");
    if (!r.ok) { setMsg(j.error ?? "Upload failed."); return; }
    await persist({ ...kit, logos: [...kit.logos, { path: j.path, name: String(j.name || "Logo").slice(0, 60) }] });
  };
  const uploadFont = async (form: HTMLFormElement) => {
    const fd = new FormData(form); fd.set("workspaceId", brand.workspaceId);
    setBusy("font"); setMsg("");
    const r = await fetch("/api/media/font", { method: "POST", body: fd }); const j = await r.json(); setBusy("");
    if (!r.ok) { setMsg(j.error ?? "Upload failed."); return; }
    const next = [...fonts, j as CustomFont]; setFonts(next); onFontsChange(next); form.reset(); setMsg(`${j.family} added. It’s now in every font list in this workspace.`);
  };
  const removeFont = async (f: CustomFont) => {
    if (!(await confirmDialog({ title: `Remove ${f.family} ${f.weight}? Designs using it will fall back to a standard font.`, confirmLabel: "Remove", danger: true }))) return;
    const r = await fetch(`/api/media/font?id=${f.id}`, { method: "DELETE" });
    if (!r.ok) { setMsg("You can’t remove this font."); return; }
    const next = fonts.filter(x => x.id !== f.id); setFonts(next); onFontsChange(next);
  };
  const families = [...new Set(fonts.map(f => f.family))];

  return <div className="st-brand">
    <h3>Colours</h3>
    {kit.colors.length ? <div className="st-swatches">{kit.colors.map((c, i) => <span key={`${c.hex}${i}`} className="st-swatch-wrap">
      <button className="st-swatch" style={{ background: c.hex }} title={`${c.name ? `${c.name} · ` : ""}${c.hex}`} aria-label={`Apply ${c.name || c.hex}`} disabled={!canEdit} onClick={() => onColor(c.hex)} />
      {manage && <button className="st-swatch-x" aria-label={`Remove ${c.hex}`} onClick={() => persist({ ...kit, colors: kit.colors.filter((_, j) => j !== i) })}><X size={10} /></button>}
    </span>)}</div> : <p className="st-hint">No brand colours yet.</p>}
    {manage && <div className="st-row"><input type="color" value={hex} onChange={e => setHex(e.target.value)} aria-label="New brand colour" />
      <button className="st-btn" disabled={busy === "kit" || kit.colors.length >= 24} onClick={() => persist({ ...kit, colors: [...kit.colors, { hex }] })}><Plus size={13} />Add colour</button></div>}


    <h3>Fonts</h3>
    {kit.fonts.length + families.length ? <ul className="st-fontlist">
      {kit.fonts.map((f, i) => <li key={`k${f.family}${i}`}><button className="st-fontbtn" style={{ fontFamily: f.family }} disabled={!canEdit} onClick={() => onFont(f.family)}>{f.family}<small>{f.role ?? "brand"}</small></button>
        {manage && <button className="st-icon sm" aria-label={`Remove ${f.family} from brand kit`} onClick={() => persist({ ...kit, fonts: kit.fonts.filter((_, j) => j !== i) })}><X size={12} /></button>}</li>)}
      {fonts.map(f => <li key={f.id}><button className="st-fontbtn" style={{ fontFamily: f.family, fontWeight: f.weight, fontStyle: f.style }} disabled={!canEdit} onClick={() => onFont(f.family)}>{f.family}<small>uploaded · {f.weight}{f.style === "italic" ? " italic" : ""}</small></button>
        {manage && <button className="st-icon sm" aria-label={`Delete uploaded font ${f.family} ${f.weight}`} onClick={() => removeFont(f)}><Trash2 size={12} /></button>}</li>)}
    </ul> : <p className="st-hint">No brand fonts yet.</p>}
    {manage && <>
      <div className="st-row"><select value={pickFont} onChange={e => setPickFont(e.target.value)} aria-label="Font to add to the brand kit"><option value="">Add a font…</option>
        {[...families, ...FONTS.map(f => f.family)].map(f => <option key={f}>{f}</option>)}</select>
        <select id="st-font-role" aria-label="Font role" defaultValue="heading"><option value="heading">Heading</option><option value="body">Body</option><option value="accent">Accent</option></select>
        <button className="st-btn" disabled={!pickFont || busy === "kit"} onClick={() => { const role = (document.getElementById("st-font-role") as HTMLSelectElement).value as "heading"; void persist({ ...kit, fonts: [...kit.fonts, { family: pickFont, role }] }); setPickFont(""); }}><Plus size={13} />Add</button></div>
      <details className="st-details"><summary>Upload a custom font</summary>
        <form className="st-form" onSubmit={e => { e.preventDefault(); void uploadFont(e.currentTarget); }}>
          <label className="st-field"><span>Font file (WOFF2, WOFF, TTF or OTF, up to 5MB)</span><input name="file" type="file" accept=".woff2,.woff,.ttf,.otf" required /></label>
          <label className="st-field"><span>Font name</span><input name="family" required minLength={2} maxLength={60} pattern="[A-Za-z0-9 \-]{2,60}" placeholder="e.g. Acme Display" /></label>
          <div className="st-row"><label className="st-field"><span>Weight</span><select name="weight" defaultValue="400">{[100, 200, 300, 400, 500, 600, 700, 800, 900].map(w => <option key={w}>{w}</option>)}</select></label>
            <label className="st-field"><span>Style</span><select name="style"><option value="normal">Normal</option><option value="italic">Italic</option></select></label></div>
          <label className="st-check"><input type="checkbox" name="licence" value="yes" required />I have a licence to use this font for our designs.</label>
          <button className="st-btn primary" disabled={busy === "font"}>{busy === "font" ? <Loader2 size={14} className="mk-spin" /> : <Upload size={14} />}Upload font</button>
        </form>
      </details>
    </>}

    <h3>Logos</h3>
    {kit.logos.length ? <div className="st-assets">{kit.logos.map((l, i) => <span key={l.path} className="st-swatch-wrap">
      <button onClick={() => onLogo(logoSrc(l.path), l.path, l.name || "Logo")} title={l.name || "Logo"} disabled={!canEdit}>{/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc(l.path)} alt={l.name || "Logo"} loading="lazy" /></button>
      {manage && <button className="st-swatch-x" aria-label={`Remove ${l.name || "logo"}`} onClick={() => persist({ ...kit, logos: kit.logos.filter((_, j) => j !== i) })}><X size={10} /></button>}
    </span>)}</div> : <p className="st-hint">No logos yet.</p>}
    {manage && <label className="st-drop"><Upload size={18} /><span>{busy === "logo" ? "Uploading…" : "Add a logo (PNG, JPG or WebP)"}</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadLogo(f); }} /></label>}

    {msg && <p className="st-hint" role="status">{msg}</p>}
  </div>;
}
