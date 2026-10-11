import { notFound } from "next/navigation";
import { untyped } from "@/lib/workspace/db";
import { CateringBuilder, type CMenu } from "./catering-builder";
import "@/styles/marketplace.css";

/** Loads published menus of the booked provider and any existing selection; RLS decides visibility. */
export async function CateringPage({ client, itemId, eventId }: { client: unknown; itemId: string; eventId?: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) notFound();
  const db = untyped(client as never);
  const { data: item } = await db.from("build_items").select("id,title,event_id,listing_id,events(guest_count,starts_at,name)").eq("id", itemId).maybeSingle();
  if (!item || !item.listing_id || (eventId && item.event_id !== eventId)) notFound();
  const { data: listing } = await db.from("listings").select("workspace_id,name").eq("id", item.listing_id).maybeSingle();
  const { data: menus } = await db.from("menus").select("id,name,description,serving_style,pricing,price,min_guests,max_guests,final_numbers_days,listing_id").eq("workspace_id", listing?.workspace_id ?? "").eq("status", "published").order("name");
  const ids = (menus ?? []).map((m: { id: string }) => m.id);
  const [{ data: sections }, { data: items }, { data: selection }] = await Promise.all([
    ids.length ? db.from("menu_sections").select("id,name,menu_id,sort").in("menu_id", ids).order("sort") : Promise.resolve({ data: [] }),
    ids.length ? db.from("menu_items").select("id,menu_id,section_id,name,description,price,dietary,allergens,allergen_note,sort").in("menu_id", ids).eq("available", true).order("sort") : Promise.resolve({ data: [] }),
    db.from("catering_selections").select("*").eq("build_item_id", itemId).maybeSingle(),
  ]);
  const ev = item.events as unknown as { guest_count: number | null; starts_at: string | null; name: string };
  type Row = Omit<CMenu, "sections" | "items"> & { listing_id: string | null };
  const full: CMenu[] = ((menus ?? []) as Row[]).map(m => ({ ...m,
    sections: (sections ?? []).filter((s: { menu_id: string }) => s.menu_id === m.id), items: (items ?? []).filter((i: { menu_id: string }) => i.menu_id === m.id) }))
    .sort((a, b) => Number(b.listing_id === item.listing_id) - Number(a.listing_id === item.listing_id));
  return <div className="mk-page">
    <div className="mk-page-head"><div><h1>Catering · {item.title}</h1><p>{ev.name} — choose a menu, numbers and dietary needs. Prices update as you go.</p></div></div>
    <section className="mk-card"><CateringBuilder itemId={itemId} menus={full} selection={selection} defaultGuests={ev.guest_count ?? 50} eventStart={ev.starts_at} /></section>
  </div>;
}
