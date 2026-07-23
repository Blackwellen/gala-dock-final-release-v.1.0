import Link from "next/link";
import { PartyPopper, CalendarRange } from "lucide-react";
import { requireCustomer } from "@/lib/customer";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Events" };

export default async function MyEventsPage() {
  const { customer } = await requireCustomer();
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("marketplace_events")
    .select("id, event_type, event_date, guest_count, status, budget_cents")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false });

  const list = events ?? [];

  function fmtDate(d: string | null) {
    if (!d) return "Date TBC";
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-surface-900">My Events</h1>
          <p className="mt-1 text-sm text-surface-500">Events you&apos;ve built with Gala Dock.</p>
        </div>
        <Link href="/build" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
          Plan a new event
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-200 shadow-card">
          <EmptyState
            icon={PartyPopper}
            title="No events yet"
            description="Build your first event — pick a venue, entertainment and catering, and pay once."
            action={
              <Link href="/build" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
                Start building
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((e) => (
            <Link
              key={e.id}
              href={`/build/${e.id}`}
              className="block bg-white rounded-xl border border-surface-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-surface-900 capitalize">{e.event_type.replace(/_/g, " ")}</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-surface-500">
                    <CalendarRange className="w-3.5 h-3.5" /> {fmtDate(e.event_date)}
                    {e.guest_count ? ` · ${e.guest_count} guests` : ""}
                  </p>
                </div>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize ${
                    e.status === "checked_out"
                      ? "bg-success-50 text-success-700 border-success-200"
                      : "bg-surface-100 text-surface-600 border-surface-200"
                  }`}
                >
                  {e.status === "checked_out" ? "booked" : e.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
