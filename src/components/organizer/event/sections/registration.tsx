import Link from "next/link";
import { ClipboardList, Users, Hourglass, CheckCircle2, ExternalLink } from "lucide-react";
import { Card, Chip, Bar } from "@/components/kit";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { num, pct, dateShort, time } from "@/lib/format";
import type { SectionProps } from "./types";
import { FormEditor, RegistrationQueue, type FormRow, type RegRow } from "./registration-client";

const WRITE = ["owner", "manager", "member"];
const when = (iso?: string | null) => (iso ? `${dateShort(iso)} ${time(iso)}` : "");

/** Sell › Registration (Q18): versioned registration forms (draft → publish) and the approval queue. */
export async function RegistrationSection({ e, role }: SectionProps) {
  const db = untyped(await createClient());
  const now = new Date().getTime();
  const canWrite = WRITE.includes(role);
  const canSensitive = ["owner", "manager"].includes(role);   // registration_private RLS: event owner + workspace owner/manager
  const [formsQ, regsQ] = await Promise.all([
    db.from("registration_forms").select("id,family_id,version,status,title,fields,capacity,per_email_limit,approval_required,waitlist,opens_at,closes_at,published_at,created_at").eq("event_id", e.id).order("created_at", { ascending: false }),
    db.from("registrations").select("id,form_id,form_version,name,email,status,answers,decided_at,decision_reason,guest_id,created_at").eq("event_id", e.id).order("created_at", { ascending: false }).limit(500),
  ]);
  const forms = (formsQ.data ?? []) as FormRow[], regs = (regsQ.data ?? []) as RegRow[];
  const live = forms.find(f => f.status === "published") ?? null, draft = forms.find(f => f.status === "draft") ?? null;
  const history = forms.filter(f => ["published", "superseded"].includes(f.status)).sort((a, b) => b.version - a.version);
  const taken = regs.filter(r => ["submitted", "pending_approval", "approved"].includes(r.status)).length;
  const pending = regs.filter(r => ["submitted", "pending_approval"].includes(r.status)).length, waitlisted = regs.filter(r => r.status === "waitlisted").length, approved = regs.filter(r => r.status === "approved").length;
  const open = live && (!live.opens_at || Date.parse(live.opens_at) <= now) && (!live.closes_at || Date.parse(live.closes_at) > now);
  const sensitiveKeys = new Set(forms.flatMap(f => f.fields.filter(x => x.sensitive).map(x => x.key)));

  return <div className="ax-wrap">
    <div className="k-grid k-g4 ax-kpis">
      <div className="k-kpi"><span className="k-tile lg"><ClipboardList size={20} /></span><div className="k-grow"><div className="lbl">Live form</div><div className="val">{live ? `v${live.version}` : "None"}</div><div className="sub">{live ? (open ? "Accepting registrations" : "Outside its window") : "Publish a form to open registration"}</div></div></div>
      <div className="k-kpi"><span className="k-tile lg green"><CheckCircle2 size={20} /></span><div className="k-grow"><div className="lbl">Approved</div><div className="val">{num(approved)}</div><div className="sub">{live?.capacity ? `${num(taken)} of ${num(live.capacity)} places taken` : "No capacity limit"}</div>{live?.capacity ? <Bar value={pct(taken, live.capacity)} thin label="Places taken" /> : null}</div></div>
      <div className="k-kpi"><span className="k-tile lg amber"><Hourglass size={20} /></span><div className="k-grow"><div className="lbl">Awaiting decision</div><div className="val">{num(pending)}</div><div className="sub">{live?.approval_required ? "Approval required" : "Auto-approved when places are free"}</div></div></div>
      <div className="k-kpi"><span className="k-tile lg purple"><Users size={20} /></span><div className="k-grow"><div className="lbl">Waiting list</div><div className="val">{num(waitlisted)}</div><div className="sub">{live?.waitlist === false ? "Waiting list off" : "Promote when places free up"}</div></div></div>
    </div>

    <div className="ax-grid">
      <Card>
        <div className="ax-head"><div><h2 className="ov-h" style={{ fontSize: 15.5 }}>Approval queue</h2><p className="k-small">Approving creates a confirmed guest on the guest list. Every decision is recorded.</p></div>
          {live && e.slug && <Link className="k-btn outline sm" href={`/events/${e.slug}/register`} target="_blank"><ExternalLink size={13} />Public form</Link>}</div>
        <RegistrationQueue rows={regs} canWrite={canWrite} canSensitive={canSensitive} hasSensitive={sensitiveKeys.size > 0} labels={Object.fromEntries(forms.flatMap(f => f.fields.map(x => [x.key, x.label])))} />
      </Card>
      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        <Card>
          <div className="ax-head"><h2 className="ov-h" style={{ fontSize: 15 }}>Registration form</h2>{live && <Chip tone="green">v{live.version} live</Chip>}{draft && <Chip tone="amber">Draft</Chip>}</div>
          {live ? <dl className="ax-dl">
            <dt>Title</dt><dd>{live.title}</dd>
            <dt>Questions</dt><dd>{live.fields.length} ({live.fields.filter(f => f.sensitive).length} sensitive)</dd>
            <dt>Capacity</dt><dd>{live.capacity ? num(live.capacity) : "No limit"} · {live.per_email_limit} per email</dd>
            <dt>Approval</dt><dd>{live.approval_required ? "Manual approval" : "Automatic"} · waiting list {live.waitlist ? "on" : "off"}</dd>
            <dt>Window</dt><dd>{live.opens_at || live.closes_at ? `${when(live.opens_at) || "Now"} → ${when(live.closes_at) || "event"}` : "Open until the event"}</dd>
            <dt>Published</dt><dd>{when(live.published_at)}</dd>
          </dl> : <p className="k-small">No published form. {canWrite ? "Build a draft below and publish it to open registration." : "An editor needs to publish one."}</p>}
          {history.length > 1 && <p className="k-xs k-muted" style={{ marginTop: 8 }}>Earlier versions: {history.filter(h => h.status === "superseded").map(h => `v${h.version} (${dateShort(h.published_at)})`).join(", ")}. Registrations keep the version they answered.</p>}
        </Card>
        {canWrite ? <FormEditor eventId={e.id} draft={draft} live={live} /> : <Card><p className="k-small">Your role can view registrations but not edit the form or decide.</p></Card>}
      </div>
    </div>
  </div>;
}
