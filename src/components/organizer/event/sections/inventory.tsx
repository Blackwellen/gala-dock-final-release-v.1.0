import Link from "next/link";
import { Boxes, Ticket, Lock, Users, ArrowRight } from "lucide-react";
import { Card, Chip, Bar, Empty } from "@/components/kit";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { num, pct, dateShort, time } from "@/lib/format";
import type { SectionProps } from "./types";
import { AllocationButton, AllocationActions, AccessCodeButton, CodeToggle, PromoterSync, type Alloc } from "./inventory-client";

const WRITE = ["owner", "manager", "member"];
type InvTier = { tier_id: string; name: string; status: string; release_kind: string | null; release_name: string | null; after_tier: string | null; access_code_required: boolean; per_customer_limit: number | null;
  order_limit: number | null; sale_start: string | null; sale_end: string | null; quantity: number; sold: number; held_live: number; reserved_remaining: number; public_available: number;
  seats: { total: number; available: number; held: number; sold: number; blocked: number; accessible: number }; allocations: Alloc[] };
type Code = { id: string; code: string; allocation_id: string | null; max_uses: number | null; used: number; status: string; valid_from: string | null; valid_until: string | null; per_customer_limit: number | null };
const KIND: Record<string, string> = { promoter: "Promoter", accessible: "Accessible", guest: "Guest list", comp: "Comps", vip: "VIP", partner: "Partner", hold: "Hold" };
const STATUS: Record<string, [string, "green" | "blue" | "gray" | "amber" | "red"]> = { on_sale: ["On sale", "green"], scheduled: ["Scheduled", "blue"], draft: ["Draft", "gray"], paused: ["Paused", "amber"], sold_out: ["Sold out", "red"], hidden: ["Hidden", "gray"] };
const COLORS = { sold: "#1b64f5", held: "#f59e0b", reserved: "#8b5cf6", pass: "#0ea5e9", free: "#cbd5e1" };
const when = (iso?: string | null) => (iso ? `${dateShort(iso)} ${time(iso)}` : "");

/** Sell › Inventory & allocations (Q20): per-tier inventory, reserved allocations with linked access codes, promoter mirror. */
export async function InventorySection({ e, d, role }: SectionProps) {
  const db = untyped(await createClient());
  const canWrite = WRITE.includes(role);
  const [invQ, codesQ, srcQ, refQ] = await Promise.all([
    db.rpc("event_ticket_inventory", { p_event: e.id }),
    db.from("discount_codes").select("id,code,allocation_id,max_uses,used,status,valid_from,valid_until,per_customer_limit").eq("event_id", e.id).eq("purpose", "access").order("code"),
    db.from("ticket_allocations").select("id,source").eq("event_id", e.id),
    db.rpc("promoter_allocation_referrals", { p_event: e.id }),
  ]);
  if (invQ.error) return <Card><Empty icon={Boxes} title="Inventory unavailable" text="You don't have access to this event's inventory, or it couldn't be loaded. Try again shortly." /></Card>;
  const inv = (invQ.data ?? []) as InvTier[], codes = (codesQ.data ?? []) as Code[];
  // D4/B2 (202610294042): promoter referral-link sales are drawn from the promoter's synced allocation.
  const referral = new Map(((refQ.data ?? []) as { allocation_id: string; referral_used: number }[]).map(r => [r.allocation_id, Number(r.referral_used) || 0]));
  const source = new Map(((srcQ.data ?? []) as { id: string; source: string }[]).map(r => [r.id, r.source]));
  const passCommitted = new Map(d.tiers.map(t => [t.id as string, Number((t as { pass_committed?: number }).pass_committed ?? 0)]));
  const tierName = new Map(inv.map(t => [t.tier_id, t.name]));
  const promoters = (d.promoters as { id: string; name: string; status: string; ticket_allocation: number | null; tickets_sold: number }[]).map(p => ({ id: p.id, name: p.name, status: p.status, allocation: p.ticket_allocation ?? 0, sold: p.tickets_sold ?? 0 }));
  const allAlloc = inv.flatMap(t => t.allocations.map(a => ({ ...a, tier_id: t.tier_id, source: source.get(a.id) ?? "manual" })));
  const totals = inv.reduce((s, t) => ({ q: s.q + t.quantity, sold: s.sold + t.sold, held: s.held + t.held_live, res: s.res + t.reserved_remaining, free: s.free + t.public_available }), { q: 0, sold: 0, held: 0, res: 0, free: 0 });
  const tiers = inv.map(t => ({ id: t.tier_id, name: t.name, quantity: t.quantity }));
  const base = `/organizer/events/${e.id}`;

  return <div className="ax-wrap">
    <div className="k-grid k-g4 ax-kpis">
      <div className="k-kpi"><span className="k-tile lg"><Ticket size={20} /></span><div className="k-grow"><div className="lbl">Sold</div><div className="val">{num(totals.sold)} / {num(totals.q)}</div><Bar value={pct(totals.sold, totals.q)} thin label="Sold" /></div></div>
      <div className="k-kpi"><span className="k-tile lg amber"><Lock size={20} /></span><div className="k-grow"><div className="lbl">Held in checkouts</div><div className="val">{num(totals.held)}</div><div className="sub">10-minute holds, released automatically</div></div></div>
      <div className="k-kpi"><span className="k-tile lg purple"><Boxes size={20} /></span><div className="k-grow"><div className="lbl">Reserved (unused)</div><div className="val">{num(totals.res)}</div><div className="sub">{allAlloc.filter(a => a.status === "active").length} active allocations · incl. pass commitments</div></div></div>
      <div className="k-kpi"><span className="k-tile lg green"><Users size={20} /></span><div className="k-grow"><div className="lbl">Publicly available</div><div className="val">{num(totals.free)}</div><div className="sub">What buyers can still pick</div></div></div>
    </div>
    {!canWrite && <p className="k-notice amber"><span>Your role can view inventory but not change allocations or codes.</span></p>}

    <div className="ax-grid">
      <Card>
        <div className="ax-head"><div><h2 className="ov-h" style={{ fontSize: 15.5 }}>Ticket inventory</h2><p className="k-small">Reserved units come off public sale and are sold only through an access code linked to their allocation.</p></div>
          <div className="k-row" style={{ gap: 8 }}><Link className="k-btn outline sm" href={`${base}/tickets/setup?step=2`}>Edit tiers <ArrowRight size={12} /></Link>{canWrite && tiers.length > 0 && <AllocationButton eventId={e.id} tiers={tiers} promoters={promoters} />}</div></div>
        <div className="ax-legend" style={{ marginBottom: 10 }}><span><i style={{ background: COLORS.sold }} />Sold</span><span><i style={{ background: COLORS.held }} />Held</span><span><i style={{ background: COLORS.reserved }} />Reserved</span><span><i style={{ background: COLORS.pass }} />Pass-committed</span><span><i style={{ background: COLORS.free }} />Available</span></div>
        {inv.length ? inv.map(t => {
          const pc = passCommitted.get(t.tier_id) ?? 0, reservedAlloc = Math.max(0, t.reserved_remaining - pc), allocated = t.allocations.filter(a => a.status === "active").reduce((s, a) => s + a.quantity, 0);
          const w = (n: number) => `${t.quantity ? Math.max(0, (100 * n) / t.quantity) : 0}%`;
          const [sl, st] = STATUS[t.status] ?? [t.status, "gray"];
          return <section key={t.tier_id} className="ax-tier" aria-label={t.name}>
            <div className="k-between" style={{ gap: 8, flexWrap: "wrap" }}>
              <div><b className="k-strong">{t.name}</b> <Chip tone={st}>{sl}</Chip>{t.access_code_required && <> <Chip tone="purple">Code only</Chip></>}
                <div className="k-xs k-muted">{[t.release_kind && t.release_kind !== "standard" ? t.release_kind.replace("_", " ") : null, t.release_name || null, t.after_tier ? `opens when ${tierName.get(t.after_tier) ?? "the previous tier"} sells out` : null,
                  t.sale_start || t.sale_end ? `sale ${when(t.sale_start) || "now"} → ${when(t.sale_end) || "event"}` : null, t.per_customer_limit ? `${t.per_customer_limit} per customer` : null].filter(Boolean).join(" · ") || "Standard release"}</div></div>
              {canWrite && <AllocationButton eventId={e.id} tiers={tiers} promoters={promoters} tierId={t.tier_id} />}
            </div>
            <div className="ax-stack" role="img" aria-label={`${t.name}: ${t.sold} sold, ${t.held_live} held, ${reservedAlloc} reserved, ${pc} pass-committed, ${t.public_available} available of ${t.quantity}`}>
              <i style={{ width: w(t.sold), background: COLORS.sold }} /><i style={{ width: w(t.held_live), background: COLORS.held }} /><i style={{ width: w(reservedAlloc), background: COLORS.reserved }} /><i style={{ width: w(pc), background: COLORS.pass }} /><i style={{ width: w(t.public_available), background: COLORS.free }} />
            </div>
            <div className="ax-mini">
              <div><b>{num(t.quantity)}</b><span>Quantity</span></div><div><b>{num(t.sold)}</b><span>Sold</span></div><div><b>{num(t.held_live)}</b><span>Held</span></div>
              <div><b>{num(allocated)}</b><span>Allocated</span></div><div><b>{num(pc)}</b><span>Pass-committed</span></div><div><b>{num(t.public_available)}</b><span>Available</span></div>
            </div>
            {t.seats.total > 0 && <p className="k-xs k-muted" style={{ margin: 0 }}>Seats: {t.seats.available} available · {t.seats.held} held · {t.seats.sold} sold · {t.seats.blocked} blocked · {t.seats.accessible} accessible</p>}
            {t.allocations.length > 0 && <div className="k-table-wrap"><table className="k-table ax-table"><thead><tr><th>Allocation</th><th>Used</th><th>Access codes</th><th /></tr></thead>
              <tbody>{t.allocations.map(a => { const ac = codes.filter(c => c.allocation_id === a.id); const src = source.get(a.id) ?? "manual"; return <tr key={a.id}>
                <td data-label="Allocation"><b className="k-strong">{a.label || KIND[a.kind] || a.kind}</b> <Chip tone={a.status === "active" ? "blue" : "gray"}>{KIND[a.kind] ?? a.kind}</Chip>{a.status !== "active" && <> <Chip tone="gray">Released</Chip></>}{src === "promoter_mirror" && <> <Chip tone="purple">Synced</Chip></>}</td>
                <td data-label="Used" style={{ minWidth: 120 }}><span className="k-small">{num(a.used)} / {num(a.quantity)}</span><Bar value={pct(a.used, a.quantity)} thin tone="purple" label={`${a.label || a.kind} used`} />{a.promoter_id && <div className="k-xs k-muted">{num(referral.get(a.id) ?? 0)} via referral link · {num(Math.max(0, a.used - (referral.get(a.id) ?? 0)))} via code or held</div>}</td>
                <td data-label="Access codes"><div className="ax-chips">{ac.map(c => <span key={c.id} className="k-row" style={{ gap: 4 }}><span className="ax-code">{c.code}</span><span className="k-xs k-muted">{c.used}{c.max_uses ? `/${c.max_uses}` : ""} uses</span>
                  {c.status !== "active" && <Chip tone="gray">{c.status}</Chip>}{canWrite && <CodeToggle eventId={e.id} code={c} />}</span>)}
                  {canWrite && a.status === "active" && <AccessCodeButton eventId={e.id} allocationId={a.id} label={a.label || KIND[a.kind] || a.kind} />}{!ac.length && !canWrite && <span className="k-xs k-muted">None</span>}</div></td>
                <td className="ax-actions">{canWrite && <AllocationActions eventId={e.id} alloc={{ ...a, tier_id: t.tier_id }} synced={src === "promoter_mirror"} tiers={tiers} promoters={promoters} />}</td>
              </tr>; })}</tbody></table></div>}
          </section>;
        }) : <Empty icon={Ticket} title="No ticket tiers yet" text="Create tiers first; then reserve allocations for promoters, guests, comps or accessible seating." action={<Link className="k-btn primary sm" href={`${base}/tickets/setup?step=1`}>Set up tickets</Link>} />}
      </Card>
      <div className="k-col" style={{ gap: 14, minWidth: 0 }}>
        <PromoterSync eventId={e.id} canWrite={canWrite} tiers={tiers} promoters={promoters.map(p => ({ ...p, mirror: allAlloc.find(a => a.promoter_id === p.id && a.source === "promoter_mirror" && a.status === "active") ?? null }))} />
        <Card><h2 className="ov-h" style={{ fontSize: 15 }}>How reserved inventory works</h2>
          <ul className="k-small" style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>Allocations on a tier can never add up to more than the tier.</li>
            <li>Unused reserved units are hidden from public sale.</li>
            <li>Buyers draw from an allocation only with its linked access code; uses are counted when the order is created.</li>
            <li>Sales through a promoter&apos;s referral link count against that promoter&apos;s synced allocation once the order is issued.</li>
            <li>Releasing an allocation returns its unused units to public sale.</li>
          </ul></Card>
      </div>
    </div>
  </div>;
}
