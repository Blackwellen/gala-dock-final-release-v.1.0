import type { Metadata } from "next";
import Link from "next/link";
import { Restricted } from "@/components/workspace/kit";
import { ActionButton, ActionForm } from "@/components/workspace/actions";
import { requireAdminPermission } from "@/lib/admin/context";
import { rows } from "@/lib/workspace/db";
import { Head, Pill } from "../../_b/kit";
import { stamp } from "../../_b/format";
import { saveMacro, archiveMacro, setSlaPolicy } from "../../_d/actions";
import "@/styles/admin-b.css";
import "@/styles/admin-d.css";

export const metadata: Metadata = { title: "Macros and SLAs" };

type Macro = { id: string; title: string; body: string; category: string | null; internal: boolean; set_status: string | null; active: boolean; usage_count: number; version: number; updated_at: string };
type Policy = { priority: string; first_response_minutes: number; resolution_minutes: number; auto_close_days: number; updated_at: string };
const CATS = ["booking", "ticketing", "payment", "account", "technical", "no_show", "emergency", "refund", "other", "safeguarding"];
const ORDER = ["urgent", "high", "medium", "low"];
const hm = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;

/** Support macros (reusable replies with {{requester_name}}, {{reference}}, {{subject}}) and SLA policies by priority (domain 196). */
export default async function MacrosPage(props: PageProps<"/admin/support/macros">) {
  const sp = await props.searchParams;
  const { db, allowed, permissions } = await requireAdminPermission("support");
  if (!allowed) return <Restricted area="Support" />;
  const [macros, policies] = await Promise.all([
    rows<Macro>(db.from("support_macros").select("id,title,body,category,internal,set_status,active,usage_count,version,updated_at").eq("active", true).order("title")),
    rows<Policy>(db.from("support_sla_policies").select("priority,first_response_minutes,resolution_minutes,auto_close_days,updated_at")),
  ]);
  const edit = typeof sp.edit === "string" ? macros.find(m => m.id === sp.edit) ?? null : null;
  const canSla = permissions.has("settings");
  return <div className="adb add">
    <Head back={{ href: "/admin/support", label: "Support" }} title="Macros and SLAs" subtitle="Reusable replies for common cases, and the response and resolution targets each priority is measured against. The resolution clock pauses while a case waits on the customer." />
    <div className="add-split">
      <section className="adb-panel"><div className="adb-sec-h"><h2>Macros</h2><small>{macros.length} active</small></div>
        <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Macro</th><th>Type</th><th>Then</th><th className="r">Used</th><th /></tr></thead>
          <tbody>{macros.length ? macros.map(m => <tr key={m.id}><td><b>{m.title}</b><small>{m.body.slice(0, 120)}{m.body.length > 120 ? "…" : ""}</small></td>
            <td><Pill status={m.internal ? "draft" : "active"} label={m.internal ? "Internal note" : "Customer reply"} />{m.category && <small>{m.category.replace("_", " ")} only</small>}</td>
            <td>{m.set_status ? `Mark ${m.set_status}` : "—"}</td><td className="r">{m.usage_count}</td>
            <td><span className="add-acts"><Link className="adb-btn" href={`/admin/support/macros?edit=${m.id}`}>Edit</Link>
              <ActionButton action={archiveMacro} args={[m.id]} reason variant="ghost" confirm={{ title: "Archive macro", body: "It disappears from the reply box. History keeps every use.", cta: "Archive" }}>Archive</ActionButton></span></td></tr>)
            : <tr><td colSpan={5} className="adb-none">No macros yet. Create one on the right.</td></tr>}</tbody></table></section>
      <section className="adb-panel"><div className="adb-sec-h"><h2>{edit ? `Edit “${edit.title}”` : "New macro"}</h2>{edit && <Link className="adb-link" href="/admin/support/macros">New instead</Link>}</div>
        <ActionForm action={saveMacro} className="add-stack" resetOnSuccess={!edit} key={edit?.id ?? "new"}>
          {edit && <><input type="hidden" name="id" value={edit.id} /><input type="hidden" name="version" value={edit.version} /></>}
          <label>Title<input name="title" required minLength={3} maxLength={80} defaultValue={edit?.title} /></label>
          <label>Text <small>Placeholders: {"{{requester_name}}"}, {"{{reference}}"}, {"{{subject}}"}</small><textarea name="body" required minLength={5} maxLength={5000} rows={6} defaultValue={edit?.body} /></label>
          <label>Only for category<select name="category" defaultValue={edit?.category ?? ""}><option value="">Any</option>{CATS.map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}</select></label>
          <label>Then set status<select name="set_status" defaultValue={edit?.set_status ?? ""}><option value="">Leave as is</option><option value="waiting">Waiting on customer</option><option value="escalated">Escalated</option></select></label>
          <label className="add-inline"><input type="checkbox" name="internal" defaultChecked={edit?.internal} className="adb-check" />Internal note (not shown to the customer)</label>
          <button className="adb-btn primary" type="submit">{edit ? "Save changes" : "Create macro"}</button>
        </ActionForm></section>
    </div>
    <section className="adb-panel"><div className="adb-sec-h"><h2>SLA policies</h2><small>{canSla ? "Changes apply to new cases and to priority changes; existing deadlines are kept." : "Editing SLAs needs the Settings permission."}</small></div>
      <table className="adb-table" tabIndex={0} data-pwa-scroll-region="true"><thead><tr><th>Priority</th><th>First response</th><th>Resolution</th><th>Auto-close resolved after</th><th>Updated</th>{canSla && <th>Change</th>}</tr></thead>
        <tbody>{[...policies].sort((a, b) => ORDER.indexOf(a.priority) - ORDER.indexOf(b.priority)).map(p => <tr key={p.priority}>
          <td><Pill status={p.priority} label={p.priority[0]!.toUpperCase() + p.priority.slice(1)} dot /></td><td>{hm(p.first_response_minutes)}</td><td>{hm(p.resolution_minutes)}</td><td>{p.auto_close_days} days</td><td>{stamp(p.updated_at)}</td>
          {canSla && <td><ActionForm action={setSlaPolicy.bind(null, p.priority)} className="add-inline">
            <input name="first" type="number" min={5} max={10080} defaultValue={p.first_response_minutes} aria-label="First response minutes" title="First response (minutes)" />
            <input name="resolution" type="number" min={15} max={43200} defaultValue={p.resolution_minutes} aria-label="Resolution minutes" title="Resolution (minutes)" />
            <input name="auto_close" type="number" min={1} max={90} defaultValue={p.auto_close_days} aria-label="Auto-close days" title="Auto-close (days)" />
            <input name="reason" required minLength={5} placeholder="Reason (audited)" aria-label="Reason" />
            <button className="adb-btn" type="submit">Save</button></ActionForm></td>}</tr>)}</tbody></table></section>
  </div>;
}
