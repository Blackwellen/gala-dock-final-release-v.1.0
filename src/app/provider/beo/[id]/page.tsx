import { notFound, redirect } from "next/navigation";
import { getProvider } from "@/lib/provider/context";
import { PageHeader, Panel } from "@/components/workspace/kit";
import { BeoEditor } from "@/components/venue/beo";
import { BEO_SECTIONS } from "@/components/venue/beo-fields";
import { BeoHospitality, type HospitalitySectionData } from "@/components/venue/beo-hospitality";
import { ActionButton } from "@/components/workspace/actions";
import { syncHospitalityToBeo } from "./actions";
import { dateShort, time, money } from "@/lib/format";
import "@/styles/marketplace.css";

export const metadata = { title: "Event order" };
type Version = { version: number; content: Record<string, unknown>; financial: Record<string, string>; note: string; created_at: string; approved_at: string | null };

/** BEO for a booking (`id` = provider job). Every save is a new immutable version; the client approves a specific version (§62). */
export default async function BeoPage({ params, searchParams }: PageProps<"/provider/beo/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await getProvider();
  const { data: job } = await ctx.db.from("provider_jobs").select("id,reference,event_name,client_name,client_org,client_email,starts_at,ends_at,guests,layout,location,value,paid_amount,build_item_id,space_id").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!job) {
    // W13: "Event order approved" notifications link with the event order's id (venue_fnb notify_workspace) — resolve it to its booking.
    const { data: byOrder } = await ctx.db.from("event_orders").select("provider_job_id,build_item_id").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (byOrder?.provider_job_id) redirect(`/provider/beo/${byOrder.provider_job_id}`);
    if (byOrder?.build_item_id) redirect(`/provider/opportunities/${byOrder.build_item_id}`); // marketplace order not yet a booking
    notFound();
  }
  const [{ data: order }, { data: space }, { data: catering }, { data: hb }] = await Promise.all([
    ctx.db.from("event_orders").select("id,reference,status,current_version,approved_version").eq("provider_job_id", id).maybeSingle(),
    job.space_id ? ctx.db.from("spaces").select("name").eq("id", job.space_id).maybeSingle() : Promise.resolve({ data: null }),
    job.build_item_id ? ctx.db.from("catering_selections").select("guest_count,serving_style,dietary_counts,service_at,menus(name)").eq("build_item_id", job.build_item_id).maybeSingle() : Promise.resolve({ data: null }),
    job.build_item_id ? ctx.db.rpc("hospitality_booking", { p_item: job.build_item_id }) : Promise.resolve({ data: null }),
  ]);
  const hosp = hb as { exists?: boolean; beo?: { stale: boolean } | null } | null;
  const { data: versions } = order ? await ctx.db.from("event_order_versions").select("version,content,financial,note,created_at,approved_at").eq("order_id", order.id).order("version", { ascending: false }) : { data: [] };
  const vs = (versions ?? []) as Version[];
  const show = vs.find(v => String(v.version) === sp.v) ?? vs[0];
  const diet = catering?.dietary_counts ? Object.entries(catering.dietary_counts as Record<string, number>).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k.replace("_", "-")}`).join(", ") : "";
  const prefill: Record<string, unknown> = show?.content ?? {
    event: `${job.event_name}${job.client_name ? ` — ${job.client_name}${job.client_org ? `, ${job.client_org}` : ""}` : ""}`,
    room: (space as { name?: string } | null)?.name ?? job.location ?? "", times: job.starts_at ? `${dateShort(job.starts_at)} · ${time(job.starts_at)} – ${time(job.ends_at)}` : "",
    layout: job.layout ?? "", capacity: job.guests ? `${job.guests} guests` : "",
    catering: catering ? `${(catering.menus as unknown as { name: string } | null)?.name ?? "Menu"} · ${catering.guest_count} guests · ${catering.serving_style ?? ""}${diet ? ` · Dietary: ${diet}` : ""}` : "",
    contacts: [job.client_name, job.client_email].filter(Boolean).join(" · "),
  };
  const fin = show?.financial ?? { total: String(job.value ?? ""), deposit_paid: String(job.paid_amount ?? ""), balance_due: String(Math.max(0, Number(job.value ?? 0) - Number(job.paid_amount ?? 0))) };
  const status = order ? (order.status === "approved" ? `Approved (v${order.approved_version})` : order.status === "sent" ? "Awaiting client approval" : order.status === "revised" ? "Revised since approval" : "Draft") : "Not started";
  const readOnly = !!show && show.version !== order?.current_version;
  const structured = (show?.content.hospitality as HospitalitySectionData | undefined) ?? null;
  const textContent = Object.fromEntries(Object.entries(prefill).filter(([, x]) => typeof x === "string")) as Record<string, string>;
  const canSync = !!job.build_item_id && !!hosp?.exists && ctx.can.manage;
  return <>
    <PageHeader title={`Event order${order ? ` ${order.reference}` : ""}`} subtitle={`${job.event_name} · ${job.reference} · ${status}`} back={{ href: "/provider/bookings", label: "Bookings" }} />
    <div className="mk-page"><div className="mk-grid">
      <Panel title={readOnly ? `Version ${show!.version} (read-only)` : "Event order"}>
        {readOnly ? <dl className="mk-dl">{BEO_SECTIONS.filter(([k]) => typeof show!.content[k] === "string" && show!.content[k] && !(structured && (k === "catering" || k === "bar"))).map(([k, l]) => <div key={k}><dt>{l}</dt><dd style={{ whiteSpace: "pre-wrap", fontWeight: 500 }}>{String(show!.content[k])}</dd></div>)}</dl>
          : <BeoEditor jobId={job.id} initial={textContent} financial={fin} structured={!!structured} />}
      </Panel>
      {(structured || canSync) && <Panel title="Hospitality (catering &amp; bar)">
        {structured ? <BeoHospitality h={structured} /> : <p className="mk-empty">The booking has a structured catering or bar selection that isn’t on the event order yet.</p>}
        {canSync && (hosp?.beo?.stale || !structured) && <div className="mk-row" style={{ marginTop: 10 }}>
          {hosp?.beo?.stale && <p className="mk-note">The selection changed since this version was written.</p>}
          <ActionButton action={syncHospitalityToBeo} args={[job.id, job.build_item_id!, false]}>Sync into a new version</ActionButton>
          <ActionButton action={syncHospitalityToBeo} args={[job.id, job.build_item_id!, true]} variant="primary">Sync and send for approval</ActionButton></div>}
      </Panel>}
      <Panel title="Versions">
        {!vs.length ? <p className="mk-empty">No versions yet. Each save creates a new version; old versions are never overwritten.</p> :
        <ol className="mk-list">{vs.map(v => <li key={v.version}><div className="mk-main"><b><a className="mk-link" href={`?v=${v.version}`}>Version {v.version}</a></b><small>{dateShort(v.created_at)} {time(v.created_at)}{v.note ? ` · ${v.note}` : ""}</small></div>
          {v.approved_at ? <span className="mk-tag green">Approved</span> : v.version === order?.current_version ? <span className="mk-tag blue">Current</span> : null}</li>)}</ol>}
        {fin.total && <p className="mk-note">Total {money(Number(fin.total) || 0)}</p>}
      </Panel>
    </div></div>
  </>;
}
