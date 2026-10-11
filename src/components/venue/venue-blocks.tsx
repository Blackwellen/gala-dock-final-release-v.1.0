import Link from "next/link";
import { Building2, ClipboardList, UtensilsCrossed } from "lucide-react";
import { untyped } from "@/lib/workspace/db";
import { money, dateShort, time } from "@/lib/format";
import { VenueResponse, AlternativeDecision } from "./venue-response";
import { ApproveBeo } from "./beo";
import { BEO_SECTIONS } from "./beo-fields";

type Viewer = "organizer" | "provider" | "customer";
type Alt = { id: string; kind: string; space_id: string | null; starts_at: string | null; ends_at: string | null; price: number | null; note: string; status: string };

/** Venue, BEO and catering blocks for the lifecycle panel (§61, §62, §64). Returns the blocks plus whether there is anything to show. */
export async function venueBlocks(client: unknown, opts: { itemId: string; listingId: string | null; status: string; eventId: string; viewer: Viewer; starts: string | null; ends: string | null }) {
  if (!opts.listingId) return { node: null, active: false };
  const db = untyped(client as never);
  const [{ data: listing }, { data: alts }, { data: order }, { data: catering }, { data: job }] = await Promise.all([
    db.from("listings").select("kind,workspace_id").eq("id", opts.listingId).maybeSingle(),
    db.from("venue_alternatives").select("id,kind,space_id,starts_at,ends_at,price,note,status").eq("build_item_id", opts.itemId).order("created_at", { ascending: false }).limit(5),
    db.from("event_orders").select("id,reference,status,current_version,approved_version").eq("build_item_id", opts.itemId).maybeSingle(),
    db.from("catering_selections").select("guest_count,status,price_snapshot,final_numbers_due,menus(name)").eq("build_item_id", opts.itemId).maybeSingle(),
    opts.viewer === "provider" ? db.from("provider_jobs").select("id").eq("build_item_id", opts.itemId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const isVenue = listing?.kind === "venue";
  const { data: spaces } = isVenue ? await db.from("spaces").select("id,name").eq("venue_id", opts.listingId).order("name") : { data: [] };
  const { data: menuCount } = !isVenue || opts.viewer !== "provider" ? await db.from("menus").select("id").eq("status", "published").eq("workspace_id", listing?.workspace_id ?? "00000000-0000-0000-0000-000000000000").limit(1) : { data: [] };
  const { data: version } = order && order.status !== "draft" && opts.viewer !== "provider"
    ? await db.from("event_order_versions").select("version,content,financial").eq("order_id", order.id).eq("version", order.current_version).maybeSingle() : { data: null };
  const S = new Map(((spaces ?? []) as { id: string; name: string }[]).map(s => [s.id, s.name]));
  const isEvent = opts.viewer !== "provider";
  const openForVenue = ["sent", "awaiting", "awaiting_provider", "available", "quoted", "quote_received", "clarification", "conditional_hold_requested"].includes(opts.status);
  const offered = ((alts ?? []) as Alt[]).filter(a => a.status === "offered");
  const cateringHref = opts.viewer === "customer" ? `/account/events/${opts.eventId}/bookings/${opts.itemId}/catering` : `/organizer/marketplace/bookings/${opts.itemId}/catering`;
  const showCatering = !!catering || (isEvent && (menuCount ?? []).length > 0);
  const venueBlock = isVenue && ((opts.viewer === "provider" && openForVenue) || (alts ?? []).length > 0);
  const beoBlock = !!order && (opts.viewer === "provider" || order.status !== "draft") || (opts.viewer === "provider" && !!job && ["confirmed", "active", "fulfilled"].includes(opts.status));
  const active = venueBlock || beoBlock || showCatering;
  if (!active) return { node: null, active: false };
  const altText = (a: Alt) => [a.space_id ? S.get(a.space_id) ?? "Another space" : null, a.starts_at ? `${dateShort(a.starts_at)} ${time(a.starts_at)}–${time(a.ends_at)}` : null, a.price != null ? money(a.price) : null].filter(Boolean).join(" · ");
  const node = <>
    {venueBlock && <div className="mk-block"><h3><Building2 size={15} aria-hidden="true" />Venue</h3>
      {((alts ?? []) as Alt[]).map(a => <p key={a.id} className="mk-line"><span className={`mk-tag ${a.status === "accepted" ? "green" : a.status === "offered" ? "purple" : "grey"}`}>Alternative {a.status}</span><span>{altText(a)}{a.note ? ` — “${a.note}”` : ""}</span>
        {isEvent && a.status === "offered" && <AlternativeDecision altId={a.id} />}</p>)}
      {opts.viewer === "provider" && openForVenue && !offered.length && <VenueResponse itemId={opts.itemId} spaces={(spaces ?? []) as { id: string; name: string }[]} starts={opts.starts} ends={opts.ends} />}
    </div>}
    {beoBlock && <div className="mk-block"><h3><ClipboardList size={15} aria-hidden="true" />Event order (BEO)</h3>
      {order && <p className="mk-line"><span className={`mk-tag ${order.status === "approved" ? "green" : order.status === "draft" ? "grey" : "orange"}`}>{order.status === "approved" ? `Approved v${order.approved_version}` : order.status === "draft" ? "Draft" : `Awaiting approval · v${order.current_version}`}</span><span>{order.reference}</span></p>}
      {opts.viewer === "provider" && job && <Link className="mk-link" href={`/provider/beo/${job.id}`}>{order ? "Open event order" : "Create event order"}</Link>}
      {isEvent && version && <details><summary className="mk-link" style={{ cursor: "pointer" }}>Review version {version.version}</summary>
        <dl className="mk-dl" style={{ marginTop: 8 }}>{BEO_SECTIONS.filter(([k]) => (version.content as Record<string, string>)[k]).map(([k, l]) => <div key={k}><dt>{l}</dt><dd style={{ whiteSpace: "pre-wrap", fontWeight: 500 }}>{(version.content as Record<string, string>)[k]}</dd></div>)}</dl></details>}
      {isEvent && order && ["sent", "revised"].includes(order.status) && <ApproveBeo orderId={order.id} version={order.current_version} />}
    </div>}
    {showCatering && <div className="mk-block"><h3><UtensilsCrossed size={15} aria-hidden="true" />Catering</h3>
      {catering ? <p className="mk-line"><span className={`mk-tag ${catering.status === "confirmed" ? "green" : catering.status === "locked" ? "grey" : "orange"}`}>{catering.status === "draft" ? "Draft" : catering.status === "submitted" ? "Sent to caterer" : catering.status === "locked" ? "Final numbers locked" : "Confirmed"}</span>
        <span>{(catering.menus as unknown as { name: string } | null)?.name} · {catering.guest_count} guests · {money((catering.price_snapshot as { total?: number }).total)}{catering.final_numbers_due ? ` · final numbers by ${dateShort(catering.final_numbers_due)}` : ""}</span></p> : <p className="mk-note">Choose a menu, guest numbers and dietary needs.</p>}
      {isEvent && <Link className="mk-link" href={cateringHref}>{catering ? "Edit catering" : "Build your catering"}</Link>}
    </div>}
  </>;
  return { node, active };
}
