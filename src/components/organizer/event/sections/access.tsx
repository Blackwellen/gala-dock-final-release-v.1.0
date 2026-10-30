import Link from "next/link";
import { KeyRound, MapPin, BadgeCheck, ScanLine, Users, IdCard } from "lucide-react";
import { Card, Chip, Empty, Bar } from "@/components/kit";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { num, pct, dateShort, time } from "@/lib/format";
import type { SectionProps } from "./types";
import { CopyPathButton } from "./ops-forms-client";
import { ZoneButton, RulesButton, IssuePassButton, PassActions, BadgeTemplateButton, ScannerButton, ScannerRevoke, type ZoneRow, type RuleRow, type PassRow, type BadgeRow, type ScannerRow } from "./access-client";

const WRITE = ["owner", "manager", "member"];
const KIND: Record<string, string> = { general: "General", vip: "VIP", backstage: "Backstage", staff: "Staff", artist: "Artist", supplier: "Supplier", press: "Press", accessible: "Accessible", other: "Other" };
const PASS_TONE: Record<string, "green" | "amber" | "red" | "gray"> = { active: "green", suspended: "amber", revoked: "red", expired: "gray" };
const when = (iso?: string | null) => (iso ? `${dateShort(iso)} ${time(iso)}` : "");

/** Operations › Access & passes (Q18): zones, who gets in where, passes and badges, door staff, live zone occupancy. */
export async function AccessSection({ e, d, role }: SectionProps) {
  const db = untyped(await createClient());
  const now = new Date().getTime();
  const canWrite = WRITE.includes(role);
  const [zonesQ, rulesQ, passesQ, badgesQ, checksQ, scannersQ] = await Promise.all([
    db.from("access_zones").select("id,name,kind,capacity,opens_at,closes_at,reentry,max_entries,status,sort").eq("event_id", e.id).order("sort").order("name"),
    db.from("access_rules").select("id,zone_id,tier_id,pass_type,valid_from,valid_to").eq("event_id", e.id),
    db.from("access_passes").select("id,pass_type,code,holder_name,holder_email,zones,valid_from,valid_to,status,printed_count,last_printed_at,revoked_reason,checked_in_at,badge_template_id,created_at").eq("event_id", e.id).order("created_at", { ascending: false }).limit(500),
    db.from("badge_templates").select("id,family_id,version,status,name,layout,pass_types,created_at").eq("event_id", e.id).order("created_at", { ascending: false }),
    db.from("check_ins").select("zone_id,result,direction").eq("event_id", e.id).not("zone_id", "is", null).limit(20000),
    canWrite ? db.rpc("event_scanners_list", { p_event: e.id }) : Promise.resolve({ data: null, error: null }),
  ]);
  const zones = (zonesQ.data ?? []) as ZoneRow[], rules = (rulesQ.data ?? []) as RuleRow[], passes = (passesQ.data ?? []) as PassRow[];
  const badges = (badgesQ.data ?? []) as BadgeRow[], scanners = ((scannersQ.data ?? []) as ScannerRow[]);
  const tiers = d.tiers.map(t => ({ id: t.id as string, name: t.name as string }));
  const zoneName = new Map(zones.map(z => [z.id, z.name])), tierName = new Map(tiers.map(t => [t.id, t.name]));
  // Live occupancy per zone: admissions + re-entries − exits (check_ins is the single admission write table).
  const occ = new Map<string, number>();
  for (const c of (checksQ.data ?? []) as { zone_id: string; result: string; direction: string | null }[]) {
    const delta = c.result === "exited" || c.direction === "out" ? -1 : ["admitted", "readmitted"].includes(c.result) ? 1 : 0;
    occ.set(c.zone_id, (occ.get(c.zone_id) ?? 0) + delta);
  }
  const activePasses = passes.filter(p => p.status === "active").length;
  const liveBadges = badges.filter(b => b.status === "active");
  const activeScanners = scanners.filter(s => !s.revoked_at && (!s.expires_at || Date.parse(s.expires_at) > now));
  const zoneOpts = zones.map(z => ({ id: z.id, name: z.name }));
  const base = `/organizer/events/${e.id}`;

  return <div className="ax-wrap">
    <div className="k-grid k-g4 ax-kpis">
      <div className="k-kpi"><span className="k-tile lg"><MapPin size={20} /></span><div className="k-grow"><div className="lbl">Access zones</div><div className="val">{zones.length}</div><div className="sub">{zones.filter(z => z.status === "active").length} open for scanning</div></div></div>
      <div className="k-kpi"><span className="k-tile lg purple"><IdCard size={20} /></span><div className="k-grow"><div className="lbl">Active passes</div><div className="val">{num(activePasses)}</div><div className="sub">{passes.length - activePasses} revoked, suspended or expired</div></div></div>
      <div className="k-kpi"><span className="k-tile lg green"><BadgeCheck size={20} /></span><div className="k-grow"><div className="lbl">Badge templates</div><div className="val">{liveBadges.length}</div><div className="sub">{passes.reduce((s, p) => s + p.printed_count, 0)} badge prints recorded</div></div></div>
      <div className="k-kpi"><span className="k-tile lg amber"><ScanLine size={20} /></span><div className="k-grow"><div className="lbl">Outside door staff</div><div className="val">{canWrite ? activeScanners.length : "—"}</div><div className="sub">{canWrite ? "with check-in access to this event" : "visible to event editors"}</div></div></div>
    </div>
    {!canWrite && <p className="k-notice amber"><span>Your role can view access but not change it. Owners, managers and members manage zones, passes and door staff.</span></p>}

    <Card>
      <div className="ax-head"><div><h2 className="ov-h" style={{ fontSize: 15.5 }}>Zones & entry rules</h2><p className="k-small">Tickets enter a zone when their tier is allowed; passes when their type is allowed or the pass lists the zone.</p></div>
        {canWrite && <ZoneButton eventId={e.id} />}</div>
      {zones.length ? <div className="k-table-wrap"><table className="k-table ax-table"><thead><tr><th>Zone</th><th>Kind</th><th>Window</th><th>Re-entry</th><th>Who gets in</th><th className="num">Inside now</th><th /></tr></thead>
        <tbody>{zones.map(z => {
          const zr = rules.filter(r => r.zone_id === z.id); const inside = Math.max(0, occ.get(z.id) ?? 0);
          return <tr key={z.id}>
            <td data-label="Zone"><b className="k-strong">{z.name}</b>{z.status === "closed" && <> <Chip tone="gray">Closed</Chip></>}</td>
            <td data-label="Kind">{KIND[z.kind] ?? z.kind}</td>
            <td data-label="Window" className="k-xs">{z.opens_at || z.closes_at ? <>{when(z.opens_at) || "Any time"} → {when(z.closes_at) || "close"}</> : "Whole event"}</td>
            <td data-label="Re-entry">{z.reentry === "allow" ? "Allowed" : z.reentry === "deny" ? "No re-entry" : `Up to ${z.max_entries} entries`}</td>
            <td data-label="Who gets in"><div className="ax-chips">{zr.length ? zr.map(r => <Chip key={r.id} tone={r.tier_id ? "blue" : "purple"}>{r.tier_id ? tierName.get(r.tier_id) ?? "Tier" : `${r.pass_type} pass`}{r.valid_from || r.valid_to ? " · timed" : ""}</Chip>) : <span className="k-xs k-muted">Passes listing this zone only</span>}</div></td>
            <td data-label="Inside now" className="num" style={{ minWidth: 110 }}>{z.capacity ? <><span className="k-small">{num(inside)} / {num(z.capacity)}</span><Bar value={pct(inside, z.capacity)} thin tone={inside >= z.capacity ? "red" : inside / z.capacity > 0.85 ? "amber" : "green"} label={`${z.name} occupancy`} /></> : <span className="k-small">{num(inside)}</span>}</td>
            <td className="ax-actions">{canWrite && <><RulesButton eventId={e.id} zone={z} rules={zr} tiers={tiers} /><ZoneButton eventId={e.id} zone={z} /></>}</td>
          </tr>;
        })}</tbody></table></div>
        : <Empty icon={MapPin} title="No access zones yet" text="Add zones such as General, VIP deck or Backstage, then choose which ticket tiers and pass types can enter each one." action={canWrite ? <ZoneButton eventId={e.id} primary /> : undefined} />}
      <p className="k-xs k-muted" style={{ marginTop: 8 }}>Occupancy counts zone scans (admissions and re-entries minus exits). Door staff pick the zone in the <Link className="k-link" href={`${base}/scan`}>scanner</Link>.</p>
    </Card>

    <div className="ax-grid">
      <Card>
        <div className="ax-head"><div><h2 className="ov-h" style={{ fontSize: 15.5 }}>Passes</h2><p className="k-small">Staff, artist, supplier, press, VIP, backstage and guest passes. Revoking or suspending a pass kills every printed badge immediately.</p></div>
          {canWrite && <IssuePassButton eventId={e.id} zones={zoneOpts} badges={liveBadges} />}</div>
        {passes.length ? <div className="k-table-wrap"><table className="k-table ax-table"><thead><tr><th>Holder</th><th>Type</th><th>Zones</th><th>Valid</th><th>Status</th><th className="num">Prints</th><th /></tr></thead>
          <tbody>{passes.map(p => <tr key={p.id}>
            <td data-label="Holder"><b className="k-strong">{p.holder_name}</b><div className="k-xs k-muted">{p.code}{p.holder_email ? ` · ${p.holder_email}` : ""}</div></td>
            <td data-label="Type" style={{ textTransform: "capitalize" }}>{p.pass_type}</td>
            <td data-label="Zones"><div className="ax-chips">{p.zones.length ? p.zones.map(z => <Chip key={z} tone="gray">{zoneName.get(z) ?? "Zone"}</Chip>) : <span className="k-xs k-muted">By pass type</span>}</div></td>
            <td data-label="Valid" className="k-xs">{p.valid_from || p.valid_to ? `${when(p.valid_from) || "Now"} → ${when(p.valid_to) || "event end"}` : "Whole event"}</td>
            <td data-label="Status"><Chip tone={PASS_TONE[p.status] ?? "gray"}>{p.status}</Chip>{p.revoked_reason && <div className="k-xs k-muted">{p.revoked_reason}</div>}{p.checked_in_at && <div className="k-xs k-green">In {time(p.checked_in_at)}</div>}</td>
            <td data-label="Prints" className="num">{p.printed_count}</td>
            <td className="ax-actions">{canWrite && <PassActions pass={p} eventName={e.name} eventDate={e.starts_at} zoneNames={p.zones.map(z => zoneName.get(z) ?? "").filter(Boolean)} template={badges.find(b => b.id === p.badge_template_id) ?? liveBadges.find(b => b.pass_types.includes(p.pass_type)) ?? null} />}</td>
          </tr>)}</tbody></table></div>
          : <Empty icon={KeyRound} title="No passes issued" text="Issue passes to crew, artists, suppliers and press. Each pass gets a scannable badge code." action={canWrite ? <IssuePassButton eventId={e.id} zones={zoneOpts} badges={liveBadges} primary /> : undefined} />}
      </Card>

      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        <Card>
          <div className="ax-head"><h2 className="ov-h" style={{ fontSize: 15 }}>Badge templates</h2>{canWrite && <BadgeTemplateButton eventId={e.id} />}</div>
          <p className="k-xs k-muted">Badges never show email, phone, dietary or medical details. Every print is recorded.</p>
          {liveBadges.length ? <div className="k-list">{liveBadges.map(b => { const versions = badges.filter(x => x.family_id === b.family_id).length; return <div key={b.id} className="k-li ax-li">
            <span className="ax-swatch" style={{ background: b.layout?.accent ?? "#1b64f5" }} aria-hidden="true" />
            <div className="k-grow" style={{ minWidth: 0 }}><b className="k-small k-strong">{b.name}</b> <span className="k-xs k-muted">v{b.version}{versions > 1 ? ` · ${versions} versions` : ""}</span>
              <div className="k-xs k-muted k-ellipsis">{b.pass_types.length ? b.pass_types.join(", ") : "All pass types"} · {(b.layout?.show ?? []).length} fields · {(b.layout?.size ?? "cr80").toUpperCase()}</div></div>
            {canWrite && <BadgeTemplateButton eventId={e.id} template={b} />}</div>; })}</div>
            : <p className="k-small" style={{ marginTop: 8 }}>No templates yet — badges print with the default layout (name, pass type, zones, code and QR).</p>}
        </Card>
        <Card>
          <div className="ax-head"><h2 className="ov-h" style={{ fontSize: 15 }}>Door staff</h2>{canWrite && <ScannerButton eventId={e.id} zones={zoneOpts} />}</div>
          <p className="k-xs k-muted">Workspace owners, managers and members can always scan. Give outside door staff check-in access to this event only — optionally limited to zones and an end time. They see admission details only. Send them the scanner link: they sign in with the invited email and can scan only for this event.</p>
          {!canWrite ? <p className="k-small" style={{ marginTop: 8 }}>Event editors manage door staff.</p>
            : scanners.length ? <div className="k-list">{scanners.map(s => { const expired = !!s.expires_at && Date.parse(s.expires_at) <= now; return <div key={s.id} className="k-li ax-li">
              <span className="k-tile sm"><Users size={13} /></span>
              <div className="k-grow" style={{ minWidth: 0 }}><b className="k-small k-strong k-ellipsis">{s.name || s.email || "Gala Dock user"}</b>
                <div className="k-xs k-muted k-ellipsis">{s.name && s.email ? `${s.email} · ` : ""}{s.zones.length ? s.zones.map(z => zoneName.get(z) ?? "Zone").join(", ") : "All zones"}{s.expires_at ? ` · until ${when(s.expires_at)}` : ""}</div></div>
              {s.revoked_at ? <Chip tone="gray">Removed</Chip> : expired ? <Chip tone="amber">Expired</Chip> : <span className="k-row" style={{ gap: 4 }}><CopyPathButton path={`/door/${e.id}`} label="Copy scanner link" /><ScannerRevoke eventId={e.id} userId={s.user_id} name={s.name || s.email || "this person"} /></span>}
            </div>; })}</div>
            : <p className="k-small" style={{ marginTop: 8 }}>No outside door staff yet.</p>}
          {scannersQ.error && <p className="k-xs k-red">Couldn&apos;t load door staff.</p>}
        </Card>
      </div>
    </div>
  </div>;
}
