import type { Metadata } from "next";
import Link from "next/link";
import { Settings, Clock3, FileText, UsersRound, CircleCheck, ArrowRight, Eye, RotateCcw, Download, MoreHorizontal, Info, History, FileDown, FlaskConical, RefreshCcw, X, Plus, Wrench, Activity } from "lucide-react";
import "@/styles/admin-b.css";
import "@/styles/admin-b-settings.css";
import { Restricted } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows } from "@/lib/workspace/db";
import { requestTime } from "@/lib/workspace/format";
import { Head, TabBar, Pill } from "../_b/kit";
import { stamp, ago } from "../_b/format";
import { saveSettingsDraft, publishSettingsDraft, discardSettingsDraft, rollbackSetting } from "../_b/actions";

export const metadata: Metadata = { title: "Platform settings" };

type Setting = { id: string; section: string; version: number; status: string; value: Record<string, unknown>; effective_at: string | null; change_reason: string; summary: string; release: string | null; created_by: string | null; approved_by: string | null; created_at: string };
const SECTIONS: [string, string, string][] = [["general", "General", "Platform identity, localization and core defaults."], ["commerce", "Commerce", "Commission plans, ticket fees and payout schedule."], ["marketplace", "Marketplace", "Response windows, holds and emergency supply."],
  ["ticketing", "Ticketing", "Resale, transfers and order limits."], ["trust", "Trust", "Automated restrictions and verification rules."], ["agent", "Agent", "Gala Agent approval policy and tool limits."],
  ["communications", "Communications", "Sender identity and reminder policy."], ["integrations", "Integrations", "Connector defaults and webhook retries."]];
const COUNTRIES: [string, string][] = [["GB", "United Kingdom (GBP)"], ["US", "United States (USD)"], ["CA", "Canada (CAD)"], ["IE", "Ireland (EUR)"], ["AU", "Australia (AUD)"]];
const HOURS = [1, 2, 4, 6, 8, 12, 24, 48, 72];
const SYSTEMS: [string, string[]][] = [["Marketplace", []], ["Ticketing", []], ["Commerce", ["payments"]], ["SaaS & Subscriptions", ["payments"]], ["Communications", ["email", "sms", "messaging"]], ["Integrations", ["calendar", "sync", "automation", "crm", "maps", "marketing"]], ["Agent Runtime", ["ai", "agent"]], ["Trust & Safety", []]];

export default async function SettingsPage(props: PageProps<"/admin/settings">) {
  const sp = await props.searchParams;
  const { db, allowed, userId } = await requireAdminPermission("settings");
  if (!allowed) return <Restricted area="Platform settings" />;
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] as string : "");
  const now = requestTime();
  const [all, ints] = await Promise.all([
    rows<Setting>(db.from("platform_settings").select("id,section,version,status,value,effective_at,change_reason,summary,release,created_by,approved_by,created_at").order("created_at", { ascending: false })),
    rows<{ name: string; category: string; status: string }>(db.from("integrations").select("name,category,status")),
  ]);
  const people = await rows<{ id: string; full_name: string }>(db.from("profiles").select("id,full_name").in("id", [...new Set(all.map(r => r.created_by).filter(Boolean))] as string[]));
  const who = (id: string | null) => id === userId ? "You" : people.find(p => p.id === id)?.full_name || "Platform Admin";
  const tab = SECTIONS.some(([k]) => k === s("tab")) ? s("tab") : "general";
  const [, label, blurb] = SECTIONS.find(([k]) => k === tab)!;
  const live = all.find(r => r.section === tab && r.status === "published"), draft = all.find(r => r.section === tab && r.status === "draft");
  const drafts = all.filter(r => r.status === "draft");
  const history = all.filter(r => r.status !== "draft").sort((a, b) => new Date(b.effective_at ?? b.created_at).getTime() - new Date(a.effective_at ?? a.created_at).getTime());
  const latest = history.find(r => r.status === "published" && r.release) ?? history[0];
  const prevVersion = all.filter(r => r.section === tab && r.status === "superseded").sort((a, b) => b.version - a.version)[0];
  const firstVersion = all.filter(r => r.section === tab && r.status !== "draft").sort((a, b) => a.version - b.version)[0];
  const value = (draft ?? live)?.value ?? {};
  const policies = all.filter(r => r.status === "published" && ["trust", "marketplace", "ticketing", "agent"].includes(r.section)).reduce((a, r) => a + Object.keys(r.value ?? {}).length, 0);
  const sysStatus = SYSTEMS.map(([name, cats]) => { const bad = ints.filter(i => cats.includes(i.category) && i.status !== "healthy" && i.status !== "disabled"); return [name, bad.length ? (bad.some(b => b.status === "down") ? "Outage" : "Degraded") : "Operational"] as const; });
  const allOk = sysStatus.every(([, st]) => st === "Operational");
  const rel = (r: Setting) => r.release ? `v${r.release}` : `${titleOf(r.section)} v${r.version}`;
  const preview = s("preview") === "1";
  const changed = draft && live ? Object.keys({ ...live.value, ...draft.value }).filter(k => JSON.stringify(live.value[k]) !== JSON.stringify(draft.value[k])) : [];

  return <div className="adb adst">
    <Head title="Platform Settings" subtitle="Configure governed platform defaults and feature policy."
      actions={<>
        <Link className="adb-btn" href="/admin/health"><Activity aria-hidden="true" />System health</Link>
        <Link className="adb-btn" href="/admin/maintenance"><Wrench aria-hidden="true" />Maintenance</Link>
        <Link className="adb-btn blue" href={`/admin/settings?tab=${tab}&preview=1`}><Eye aria-hidden="true" />Preview changes</Link>
        <ActionButton action={rollbackSetting} args={[tab, prevVersion?.version ?? 0]} reason variant="outline" className="adst-hb" disabled={!prevVersion}
          title={!prevVersion ? "No earlier version of this section" : undefined}
          confirm={{ title: `Roll back ${label}`, body: prevVersion ? `Republishes ${label} v${prevVersion.version} (${stamp(prevVersion.effective_at ?? prevVersion.created_at)}) as a new version. The current version stays in history.` : "", cta: "Roll back" }}><RotateCcw aria-hidden="true" />Rollback</ActionButton>
        <ActionButton action={publishSettingsDraft} args={[tab]} reason variant="primary" className="adst-hb" disabled={!draft} title={!draft ? "No unpublished changes in this section" : undefined}
          confirm={{ title: `Publish ${label} changes`, body: `${changed.length || "All"} changed setting${changed.length === 1 ? "" : "s"} go live immediately as a new configuration version. You can roll back from history.`, cta: "Publish changes" }}><Download aria-hidden="true" />Publish changes</ActionButton>
      </>} />
    <div className="adst-grid">
      <div className="adst-main">
        <TabBar active={tab} tabs={SECTIONS.map(([key, l]) => ({ key, label: l, href: key === "general" ? "/admin/settings" : `/admin/settings?tab=${key}` }))} />
        <section className="adst-kpis">
          <div className="adst-k"><i className="blue"><Settings aria-hidden="true" /></i><span><small>Platform version</small><b>{latest ? (latest.release ? `v${latest.release}` : `v${latest.version}`) : "—"}</b><em>{latest ? <>Published {stamp(latest.effective_at ?? latest.created_at)}<br />by {who(latest.approved_by ?? latest.created_by)}</> : "Nothing published yet"}</em></span><Pill status="live" label="Live" /></div>
          <div className="adst-k"><i className="orange"><Clock3 aria-hidden="true" /></i><span><small>Pending changes</small><b>{drafts.length}</b><em>{drafts[0] ? <>Last edited {ago(drafts[0].created_at, now)}<br />by {who(drafts[0].created_by)}</> : "No drafts"}</em></span>{drafts.length > 0 && <Pill status="draft" label="Draft" />}</div>
          <div className="adst-k"><i className="blue"><FileText aria-hidden="true" /></i><span><small>Active policies</small><b>{policies}</b><em className="ok">{allOk ? <><CircleCheck aria-hidden="true" />All systems operating</> : "Some systems degraded"}</em></span></div>
          <div className="adst-k"><i className="blue"><UsersRound aria-hidden="true" /></i><span><small>Affected systems</small><b>{drafts.length}</b><em>{drafts.length ? drafts.map(d => titleOf(d.section)).join(", ") : "None pending"}<br /><Link href={`/admin/settings?tab=${drafts[0]?.section ?? tab}&preview=1`}>View all <ArrowRight aria-hidden="true" /></Link></em></span></div>
        </section>
        {preview && <section className="adb-panel adst-preview"><div className="adb-sec-h"><h2>Unpublished changes — {label}</h2><Link className="adb-link" href={`/admin/settings?tab=${tab}`}>Close preview <X aria-hidden="true" /></Link></div>
          {draft ? <>{changed.length ? <table className="adb-table"><thead><tr><th>Setting</th><th>Live</th><th>Draft</th></tr></thead><tbody>{changed.map(k => <tr key={k}><td>{k.replaceAll("_", " ")}</td><td>{fmt(live?.value[k])}</td><td><b>{fmt(draft.value[k])}</b></td></tr>)}</tbody></table> : <p className="adb-none">The draft matches the live version.</p>}
            <div className="adst-prev-a"><ActionButton action={discardSettingsDraft} args={[tab]} reason variant="danger" confirm={{ title: "Discard draft", body: "The unpublished changes in this section are deleted. The live version is unchanged.", cta: "Discard" }}>Discard draft</ActionButton></div></>
            : <p className="adb-none">No unpublished changes in {label}.</p>}</section>}
        <section className="adb-panel adst-form">
          <ActionForm action={saveSettingsDraft}>
            <input type="hidden" name="section" value={tab} /><input type="hidden" name="base" value={JSON.stringify(value)} />
            <div className="adst-form-h"><div><h2>{label}</h2><p>{blurb}{draft && <span className="adst-draft"> · Editing draft (v{draft.version}, saved {ago(draft.created_at, now)})</span>}</p></div><button type="submit" className="adb-btn primary">Save changes</button></div>
            {tab === "general" ? <GeneralForm v={value} /> : <GenericForm v={value} />}
          </ActionForm>
        </section>
      </div>
      <aside className="adst-rail">
        <section className="adb-panel adst-hist">
          <div className="adb-sec-h"><h2>Configuration version</h2><Link className="adb-link" href="/admin/settings?history=all">View history <ArrowRight aria-hidden="true" /></Link></div>
          <ol>{history.slice(0, s("history") === "all" ? 50 : 4).map(r => <li key={r.id}><span><b>{rel(r)}{r.status === "published" && r.release === latest?.release && <em> (Live)</em>}</b><small>{stamp(r.effective_at ?? r.created_at)}</small><small>by {who(r.approved_by ?? r.created_by)}</small><small>{r.summary || r.change_reason.replace(/^Seed:\s*(B\s)?/, "")}</small></span>
            <details className="adb-pop"><summary className="adb-dots" aria-label={`Options for ${rel(r)}`}><MoreHorizontal aria-hidden="true" /></summary><div className="adb-pop-body adst-pop"><h3>{titleOf(r.section)} v{r.version}</h3><pre>{JSON.stringify(r.value, null, 1).slice(0, 600)}</pre>
              {r.status === "superseded" && <ActionButton action={rollbackSetting} args={[r.section, r.version]} reason variant="outline" confirm={{ title: `Restore ${titleOf(r.section)} v${r.version}`, body: "Republishes this version as a new version.", cta: "Restore" }}>Restore this version</ActionButton>}</div></details></li>)}</ol>
          {!history.length && <p className="adb-none">No versions yet.</p>}
        </section>
        <section className="adb-panel adst-sys">
          <div className="adb-sec-h"><div><h2>System status</h2><p>{allOk ? "All systems operating normally." : "Some systems need attention."}</p></div><Link className="adb-link" href="/admin/agent-integrations?tab=connections">View all <ArrowRight aria-hidden="true" /></Link></div>
          <ul>{sysStatus.map(([n, st]) => <li key={n}><i />{n}<b className={st === "Operational" ? "" : st === "Degraded" ? "warn" : "bad"}><i />{st}</b></li>)}</ul>
        </section>
        <section className="adb-panel adst-qa"><h2>Quick actions</h2>
          <div>
            <Link className="adb-btn" href="/admin/settings?history=all"><History aria-hidden="true" />View change log</Link>
            <Link className="adb-btn" href="/admin/settings/export"><FileDown aria-hidden="true" />Export configuration</Link>
            <Link className="adb-btn" href={`/admin/settings?tab=${tab}&preview=1`}><FlaskConical aria-hidden="true" />Test configuration</Link>
            <ActionButton action={rollbackSetting} args={[tab, firstVersion?.version ?? 0]} reason variant="outline" disabled={!firstVersion || firstVersion.id === live?.id}
              confirm={{ title: `Reset ${label} to defaults`, body: `Republishes the first recorded version of ${label} (v${firstVersion?.version ?? "—"}) as a new version.`, cta: "Reset" }}><RefreshCcw aria-hidden="true" />Reset to defaults</ActionButton>
          </div>
        </section>
      </aside>
    </div>
  </div>;
}

const titleOf = (k: string) => SECTIONS.find(([s]) => s === k)?.[1] ?? k;
const fmt = (v: unknown) => v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
const hrs = (n: number) => `${n} hour${n === 1 ? "" : "s"}`;

function Sel({ name, v, options }: { name: string; v: unknown; options: [string | number, string][] }) {
  return <select name={name} defaultValue={String(v ?? options[0]?.[0] ?? "")} className="adb-select">{options.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>;
}
function Toggle({ name, on, label, hint }: { name: string; on: boolean; label: string; hint: string }) {
  return <label className="adst-tg"><input type="hidden" name="bools" value={name} /><input type="checkbox" name={`f:b:${name}`} defaultChecked={on} role="switch" /><i aria-hidden="true" /><span>{hint}</span><span className="sr-only">{label}</span></label>;
}

function GeneralForm({ v }: { v: Record<string, unknown> }) {
  const countries = (v.supported_countries as string[] | undefined) ?? ["GB"];
  const desc = String(v.description ?? "");
  return <div className="adst-sections">
    <fieldset className="adst-fs"><legend>Platform details</legend>
      <div className="adst-two">
        <div className="adst-rows">
          <label><span>Platform name</span><input name="f:s:platform_name" defaultValue={String(v.platform_name ?? "")} required maxLength={60} /></label>
          <label><span>Support email</span><input name="f:s:support_email" type="email" defaultValue={String(v.support_email ?? "")} required /></label>
          <label><span>Default timezone</span><Sel name="f:s:timezone" v={v.timezone} options={[["Europe/London", "(GMT+00:00) London"], ["Europe/Dublin", "(GMT+00:00) Dublin"], ["America/New_York", "(GMT-05:00) New York"], ["America/Toronto", "(GMT-05:00) Toronto"]]} /></label>
          <label><span>Default currency</span><Sel name="f:s:default_currency" v={v.default_currency} options={[["GBP", "GBP (£)"], ["USD", "USD ($)"], ["CAD", "CAD ($)"], ["EUR", "EUR (€)"]]} /></label>
        </div>
        <div className="adst-rows">
          <label className="adst-desc"><span>Platform description</span><textarea name="f:s:description" defaultValue={desc} maxLength={500} rows={4} /><small>{desc.length}/500</small></label>
          <label className="adst-inline"><span>Default language</span><span className="adst-flagsel"><UkFlag /><Sel name="f:s:default_locale" v={v.default_locale} options={[["en-GB", "English (UK)"], ["en-US", "English (US)"], ["fr-CA", "French (Canada)"]]} /></span></label>
        </div>
      </div>
    </fieldset>
    <fieldset className="adst-fs"><legend>Localization &amp; regions<small>Available countries, currencies and tax settings.</small></legend>
      <div className="adst-loc">
        <div><span className="adst-lbl">Supported countries</span>
          <div className="adst-chips"><input type="hidden" name="lists" value="supported_countries" />{COUNTRIES.map(([code, l]) => <label key={code} className="adst-chip"><input type="checkbox" name="f:l:supported_countries" value={code} defaultChecked={countries.includes(code)} /><span>{l}<X aria-hidden="true" /></span></label>)}
            <span className="adst-add"><Plus aria-hidden="true" />Add country</span></div></div>
        <label><span className="adst-lbl">Default country for new accounts</span><span className="adst-flagsel"><UkFlag /><Sel name="f:s:default_country" v={v.default_country} options={COUNTRIES.map(([c, l]) => [c, l.replace(/ \(.*/, "")])} /></span></label>
        <label><span className="adst-lbl">Tax handling</span><span className="adst-tax"><Sel name="f:s:tax_handling" v={v.tax_handling} options={[["platform_uk_vat", "Platform collects and remits (UK VAT only)"], ["provider", "Providers handle their own tax"], ["none", "No tax collected"]]} /><Info aria-hidden="true" /></span></label>
      </div>
    </fieldset>
    <fieldset className="adst-fs"><legend>Operational defaults<small>Core platform operational settings.</small></legend>
      <div className="adst-ops">
        <label><span>Default response window (suppliers)</span><span><Sel name="f:n:supplier_response_hours" v={v.supplier_response_hours} options={HOURS.map(h => [h, hrs(h)])} /><small>Time allowed for suppliers to respond to new enquiries.</small></span></label>
        <label><span>Auto-expire pending requests</span><span><Sel name="f:n:auto_expire_hours" v={v.auto_expire_hours} options={HOURS.map(h => [h, hrs(h)])} /><small>Requests automatically expire if no response.</small></span></label>
        <label><span>Default response window (venues)</span><span><Sel name="f:n:venue_response_hours" v={v.venue_response_hours} options={HOURS.map(h => [h, hrs(h)])} /><small>Time allowed for venues to respond to new enquiries.</small></span></label>
        <label><span>Minimum lead time for new bookings</span><span><Sel name="f:n:min_lead_hours" v={v.min_lead_hours} options={HOURS.map(h => [h, hrs(h)])} /><small>Minimum notice required for confirmed bookings.</small></span></label>
        <div className="adst-trow"><span>Emergency replacement eligibility</span><Toggle name="emergency_replacement" on={v.emergency_replacement !== false} label="Emergency replacement eligibility" hint="Allow automatic search for replacement providers." /></div>
        <div className="adst-trow"><span>Allow short-notice bookings</span><Toggle name="short_notice_bookings" on={v.short_notice_bookings !== false} label="Allow short-notice bookings" hint="Allow bookings inside minimum lead time (subject to policy)." /></div>
      </div>
    </fieldset>
  </div>;
}

/** Other sections: every scalar setting is editable; nested objects are shown read-only and kept as-is. */
function GenericForm({ v }: { v: Record<string, unknown> }) {
  const entries = Object.entries(v);
  if (!entries.length) return <p className="adb-none">No settings recorded for this section yet. Saving creates the first draft.</p>;
  return <div className="adst-sections"><fieldset className="adst-fs"><legend>Settings</legend><div className="adst-gen">{entries.map(([k, val]) => {
    const l = k.replaceAll("_", " ");
    if (typeof val === "boolean") return <div key={k} className="adst-trow"><span>{l}</span><Toggle name={k} on={val} label={l} hint={val ? "Enabled" : "Disabled"} /></div>;
    if (typeof val === "number") return <label key={k}><span>{l}</span><input name={`f:n:${k}`} type="number" step="any" min={0} defaultValue={val} /></label>;
    if (typeof val === "string") return <label key={k}><span>{l}</span><input name={`f:s:${k}`} defaultValue={val} maxLength={2000} /></label>;
    if (Array.isArray(val) && val.every(x => typeof x === "string")) return <label key={k}><span>{l}</span><input name={`f:c:${k}`} defaultValue={val.join(", ")} /><small>Comma-separated</small></label>;
    return <div key={k} className="adst-ro"><span>{l}</span><code>{JSON.stringify(val)}</code></div>;
  })}</div></fieldset></div>;
}

function UkFlag() {
  return <svg className="adst-flag" viewBox="0 0 60 30" aria-hidden="true"><path d="M0,0 v30 h60 v-30 z" fill="#012169" /><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" /><path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="2" /><path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" /><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" /></svg>;
}
