import { requestTime } from "@/lib/workspace/format";
import Link from "next/link";
import { CloudSun, CloudOff, Wind, ShieldCheck, Bell } from "lucide-react";
import { Card, Chip, Empty } from "@/components/kit";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { dateShort, time } from "@/lib/format";
import { complianceCommand } from "@/lib/actions/compliance";
import { weatherHealth } from "@/lib/weather/provider";
import type { SectionProps } from "./types";
import { FormDialog, ActionButton, type Field, type FieldOption } from "./ops-forms-client";
import { canManage, VIEW_ONLY, ViewOnly, ChecksCard, Stat, StatusChip, label, opsItems } from "./ops-shared";

type Watch = { id: string; status: string; provider: string | null; provider_status: string; last_checked_at: string | null; last_error: string; location_label: string; latitude: number | null; longitude: number | null;
  window_from: string | null; window_to: string | null; thresholds: { wind_kph?: number; gust_kph?: number; rain_mm_h?: number; temp_max_c?: number; temp_min_c?: number; lightning?: boolean } };
type Alert = { id: string; metric: string; value: number | null; threshold: number | null; forecast_for: string; severity: string; message: string; acknowledged_at: string | null };
type Plan = { id: string; trigger_kind: string; threshold_text: string; action: string; action_detail: string; decision_owner: string; decision_deadline_hours: number | null; comms_note: string; status: string; approved_at: string | null };

const TRIGGERS: FieldOption[] = ["wind", "rain", "heat", "cold", "lightning", "flood", "other"].map(k => [k, label(k)]);
const ACTIONS: FieldOption[] = [["delay", "Delay"], ["move_indoors", "Move indoors"], ["shelter", "Shelter in place"], ["reduce_capacity", "Reduce capacity"], ["cancel", "Cancel"], ["other", "Other"]];

export async function WeatherSection({ e, role }: SectionProps) {
  const sb = untyped(await createClient()); const ev = e.id;
  const mgr = canManage(role); const dr = mgr ? null : VIEW_ONLY; const cmd = complianceCommand.bind(null, ev);
  const health = weatherHealth();
  const [{ data: w }, { data: alerts }, { data: plans }, checks] = await Promise.all([
    sb.from("weather_watches").select("*").eq("event_id", ev).maybeSingle(),
    sb.from("weather_alerts").select("*").eq("event_id", ev).gt("forecast_for", new Date(requestTime() - 864e5).toISOString()).order("forecast_for"),
    sb.from("contingency_plans").select("*").eq("event_id", ev).order("trigger_kind"),
    opsItems(ev, i => i.domain === "compliance" && (i.fix.includes("section=weather") || i.key === "rule_weather_contingency")),
  ]);
  const W = w as Watch | null; const AL = (alerts ?? []) as Alert[]; const CP = (plans ?? []) as Plan[];
  const configured = health.state === "ok";
  const watchFields = (x?: Watch | null): Field[] => [
    { name: "location_label", label: "Location", defaultValue: x?.location_label ?? e.city ?? "", hint: "Coordinates default to the venue listing when it has them." },
    { name: "latitude", label: "Latitude", type: "number", min: -90, max: 90, defaultValue: x?.latitude ?? "" }, { name: "longitude", label: "Longitude", type: "number", min: -180, max: 180, defaultValue: x?.longitude ?? "" },
    { name: "window_from", label: "Watch from", type: "datetime", defaultValue: x?.window_from ?? (e.starts_at ? new Date(Date.parse(e.starts_at) - 6 * 36e5).toISOString() : "") },
    { name: "window_to", label: "Watch until", type: "datetime", defaultValue: x?.window_to ?? e.ends_at },
    { name: "wind_kph", label: "Wind limit (km/h)", type: "number", min: 0, defaultValue: x?.thresholds.wind_kph ?? 50 }, { name: "gust_kph", label: "Gust limit (km/h)", type: "number", min: 0, defaultValue: x?.thresholds.gust_kph ?? 65 },
    { name: "rain_mm_h", label: "Rain limit (mm/h)", type: "number", min: 0, defaultValue: x?.thresholds.rain_mm_h ?? 8 }, { name: "temp_max_c", label: "Max temperature (°C)", type: "number", defaultValue: x?.thresholds.temp_max_c ?? 30 },
    { name: "temp_min_c", label: "Min temperature (°C)", type: "number", defaultValue: x?.thresholds.temp_min_c ?? 0 }, { name: "lightning", label: "Lightning", type: "checkbox", defaultValue: x?.thresholds.lightning ?? true, hint: "Alert on lightning" }];
  const planFields = (p?: Plan): Field[] => [{ name: "trigger_kind", label: "Trigger", type: "select", required: true, options: TRIGGERS, defaultValue: p?.trigger_kind },
    { name: "threshold_text", label: "Threshold", defaultValue: p?.threshold_text, placeholder: "e.g. sustained wind over 50 km/h" }, { name: "action", label: "Action", type: "select", required: true, options: ACTIONS, defaultValue: p?.action },
    { name: "action_detail", label: "What happens", type: "textarea", defaultValue: p?.action_detail }, { name: "decision_owner", label: "Decision owner", defaultValue: p?.decision_owner, hint: "Required before approval." },
    { name: "decision_deadline_hours", label: "Decide by (hours before doors)", type: "number", min: 0, max: 720, defaultValue: p?.decision_deadline_hours ?? "" }, { name: "comms_note", label: "Communications", type: "textarea", defaultValue: p?.comms_note }];
  const open = AL.filter(a => !a.acknowledged_at);

  return <div className="eo">
    <ViewOnly role={role} what="the weather watch and contingency plans" />
    {!configured && <div className="k-notice amber eo-legal" role="status"><CloudOff size={16} /><span><b>Weather provider not configured.</b> No forecast service is connected{health.missing.length ? ` (missing ${health.missing.join(", ")})` : ""}, so watches can&apos;t fetch forecasts or raise alerts automatically. Check the forecast manually and keep an approved contingency plan ready. Readiness shows this as a warning until a provider is set up.</span></div>}
    <div className="eo-stats">
      <Stat icon={CloudSun} label="Weather watch" value={W ? label(W.status) : "None"} sub={W ? `Provider: ${configured ? label(W.provider_status) : "not configured"}` : "Start one for outdoor events"} tone={W?.status === "active" ? "green" : "amber"} />
      <Stat icon={Bell} label="Open alerts" value={open.length} sub={open.some(a => a.severity === "severe") ? <span className="k-red">Severe alert</span> : "next 72 hours"} tone={open.length ? "red" : "green"} />
      <Stat icon={ShieldCheck} label="Contingency plans" value={`${CP.filter(p => p.status === "approved").length}/${CP.filter(p => p.status !== "retired").length}`} sub="approved" tone="purple" />
    </div>
    <div className="eo-main">
      <div className="eo-col-main">
        <Card><div className="k-between eo-head"><div><h2 className="ov-h">Weather watch</h2><p className="k-small">Thresholds that raise alerts to owners and managers once forecasts are available.</p></div>
          <span className="eo-acts">{W ? <>
            <FormDialog label="Edit watch" icon="edit" title="Edit weather watch" disabledReason={dr} action={cmd.bind(null, "watch", null, {})} fields={watchFields(W)} />
            {W.status === "active" && <ActionButton label="Pause" icon="stop" variant="ghost" disabledReason={dr} action={cmd.bind(null, "watch_status", null, { status: "paused" }, {})} />}
            {W.status !== "active" && <ActionButton label="Restart" icon="play" variant="soft" disabledReason={dr} action={cmd.bind(null, "watch_status", null, { status: "active" }, {})} />}
            {W.status !== "ended" && <ActionButton label="End watch" icon="ban" variant="ghost" disabledReason={dr} confirm={{ title: "End the weather watch?", danger: true, confirmLabel: "End watch" }} action={cmd.bind(null, "watch_status", null, { status: "ended" }, {})} />}</>
            : <FormDialog label="Start watch" icon="play" variant="primary" title="Start a weather watch" sub={configured ? undefined : "The watch is recorded now; it reports “not configured” until a weather provider is connected."} disabledReason={dr} action={cmd.bind(null, "watch", null, {})} fields={watchFields(null)} />}</span></div>
          {W ? <div className="eo-provisions">
            <div className="eo-kv"><span>Status</span><StatusChip s={W.status} /></div>
            <div className="eo-kv"><span>Forecast provider</span>{configured ? <StatusChip s={W.provider_status} /> : <Chip tone="amber">Not configured</Chip>}</div>
            <div className="eo-kv"><span>Location</span><span>{W.location_label || "—"}{W.latitude != null ? ` · ${W.latitude.toFixed(3)}, ${W.longitude?.toFixed(3)}` : " · no coordinates"}</span></div>
            <div className="eo-kv"><span>Window</span><span>{W.window_from ? `${dateShort(W.window_from)} ${time(W.window_from)}` : "—"} – {W.window_to ? `${dateShort(W.window_to)} ${time(W.window_to)}` : "—"}</span></div>
            <div className="eo-kv"><span>Thresholds</span><span>Wind {W.thresholds.wind_kph ?? "—"} · gust {W.thresholds.gust_kph ?? "—"} km/h · rain {W.thresholds.rain_mm_h ?? "—"} mm/h · {W.thresholds.temp_min_c ?? "—"}–{W.thresholds.temp_max_c ?? "—"} °C{W.thresholds.lightning ? " · lightning" : ""}</span></div>
            <div className="eo-kv"><span>Last checked</span><span>{W.last_checked_at ? `${dateShort(W.last_checked_at)} ${time(W.last_checked_at)}` : "Never"}{W.last_error ? ` · ${W.last_error}` : ""}</span></div></div>
            : <Empty icon={Wind} title="No weather watch" text="Outdoor events need an active watch and an approved contingency plan." />}</Card>
        <Card><div className="k-between eo-head"><div><h2 className="ov-h">Alerts</h2><p className="k-small">Raised when a forecast breaches a threshold. A severe alert without an approved matching contingency plan blocks readiness.</p></div></div>
          {AL.length ? <ul className="eo-list">{AL.map(a => <li key={a.id}><span className="k-grow"><b>{a.message}</b><small>{dateShort(a.forecast_for)} {time(a.forecast_for)} · {label(a.metric.replace(/_(kph|mm_h|c)$/, ""))}{a.value != null ? ` ${a.value}` : ""}{a.threshold != null ? ` (limit ${a.threshold})` : ""}</small></span>
            <Chip tone={a.severity === "severe" ? "red" : a.severity === "warning" ? "amber" : "blue"}>{label(a.severity)}</Chip>
            {a.acknowledged_at ? <Chip tone="gray">Acknowledged</Chip> : <ActionButton label="Acknowledge" icon="check" variant="ghost" disabledReason={dr} action={cmd.bind(null, "alert_ack", a.id, {}, {})} />}</li>)}</ul>
            : <p className="k-small eo-muted">{configured ? "No alerts in the watch window." : "No alerts — none can be raised until a weather provider is configured."}</p>}</Card>
      </div>
      <div className="eo-col-side">
        <ChecksCard title="Weather checks" items={checks.items} error={checks.error} empty="No weather blockers or warnings." />
        <Card><div className="k-between"><h3 className="ov-h">Contingency plans</h3><FormDialog label="Add plan" icon="plus" title="New contingency plan" disabledReason={dr} action={cmd.bind(null, "contingency", null, {})} fields={planFields()} /></div>
          {CP.length ? <ul className="eo-list">{CP.map(p => <li key={p.id} className={p.status === "retired" ? "eo-old" : ""}><span className="k-grow"><b>{label(p.trigger_kind)} → {ACTIONS.find(x => x[0] === p.action)?.[1] ?? p.action}</b><small>{p.threshold_text || "No threshold text"}{p.decision_owner ? ` · ${p.decision_owner} decides` : " · no decision owner"}{p.decision_deadline_hours != null ? ` · ${p.decision_deadline_hours}h before` : ""}</small></span><StatusChip s={p.status} />
            <span className="eo-acts">{p.status === "draft" && <ActionButton label="Approve" icon="check" variant="soft" disabledReason={dr ?? (!p.decision_owner.trim() ? "Name a decision owner first." : null)} action={cmd.bind(null, "contingency_approve", p.id, {}, {})} />}
              {p.status !== "retired" && <><FormDialog label={`Edit ${p.trigger_kind} plan`} icon="edit" variant="ghost" iconOnly title="Edit contingency plan" sub="Edits return it to draft." disabledReason={dr} action={cmd.bind(null, "contingency", p.id, {})} fields={planFields(p)} />
                <ActionButton label={`Retire ${p.trigger_kind} plan`} icon="trash" variant="ghost" iconOnly disabledReason={dr} confirm={{ title: "Retire this contingency plan?", danger: true, confirmLabel: "Retire" }} action={cmd.bind(null, "contingency_retire", p.id, {}, {})} /></>}</span></li>)}</ul>
            : <p className="k-small eo-muted">No contingency plans. Add one per trigger (wind, rain, heat, lightning) with a named decision owner.</p>}</Card>
        <Card><h3 className="ov-h">Related</h3><ul className="eo-list tight"><li><span className="k-grow k-small">Weather contingency rule and safety plans — <Link className="k-link" href={`/organizer/events/${ev}?tab=plan&section=compliance`}>Plan › Compliance</Link></span></li></ul></Card>
      </div>
    </div>
  </div>;
}
