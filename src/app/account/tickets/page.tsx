import Link from "next/link";
import { Ticket, CalendarRange } from "lucide-react";
import { requireCustomer } from "@/lib/customer";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { claimPastOrders } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Tickets" };

export default async function MyTicketsPage() {
  const { customer } = await requireCustomer();
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("ticket_orders")
    .select("id, quantity, amount_cents, currency, status, created_at, event_id, ticket_type_id")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false });

  const list = orders ?? [];

  const [{ data: ticketTypes }, { data: pages }] = await Promise.all([
    supabase
      .from("ticket_types")
      .select("id, name")
      .in("id", list.map((o) => o.ticket_type_id).filter(Boolean)),
    supabase
      .from("event_public_pages")
      .select("event_id, slug, headline, starts_at")
      .in("event_id", list.map((o) => o.event_id).filter(Boolean)),
  ]);

  const ticketTypeById = new Map((ticketTypes ?? []).map((t) => [t.id, t]));
  const pageByEventId = new Map((pages ?? []).map((p) => [p.event_id, p]));

  function fmtMoney(cents: number, currency: string) {
    return (cents / 100).toLocaleString("en-GB", { style: "currency", currency });
  }
  function fmtDate(d: string | null) {
    if (!d) return "Date TBC";
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-surface-900">My Tickets</h1>
          <p className="mt-1 text-sm text-surface-500">Every ticket order linked to this account.</p>
        </div>
        <form action={claimPastOrders}>
          <button type="submit" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
            Find orders from before I had an account
          </button>
        </form>
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card">
          <EmptyState
            icon={Ticket}
            title="No tickets yet"
            description="Tickets you buy on Gala Dock will show up here."
            action={
              <Link href="/discover" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
                Discover events
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((o) => {
            const page = pageByEventId.get(o.event_id);
            const ticketType = ticketTypeById.get(o.ticket_type_id);
            return (
              <div key={o.id} className="bg-white rounded-xl border border-surface-200 p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-surface-900">{page?.headline ?? "Event"}</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-surface-500">
                    <CalendarRange className="w-3.5 h-3.5" /> {fmtDate(page?.starts_at ?? null)} · {ticketType?.name ?? "Ticket"} × {o.quantity}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-surface-900">{fmtMoney(o.amount_cents, o.currency)}</p>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize ${
                      o.status === "paid"
                        ? "bg-success-50 text-success-700 border-success-200"
                        : "bg-surface-100 text-surface-600 border-surface-200"
                    }`}
                  >
                    {o.status}
                  </span>
                  {page?.slug && (
                    <Link href={`/e/${page.slug}`} className="block mt-1 text-xs text-brand-600 hover:text-brand-700">
                      View event
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
