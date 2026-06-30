import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RegisterForm } from "./RegisterForm";
import { TicketPurchase } from "./TicketPurchase";

export const dynamic = "force-dynamic";

// EB-L: public event page. Reads the PUBLISHED public page (anon-readable via RLS). All copy comes
// from event_public_pages (set by the organizer) — no members-only event rows are read here.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: page } = await supabase
    .from("event_public_pages")
    .select("seo_title, seo_description, headline")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!page) return { title: "Event" };
  return {
    title: page.seo_title ?? page.headline ?? "Event",
    description: page.seo_description ?? undefined,
  };
}

export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: page } = await supabase
    .from("event_public_pages")
    .select("event_id, workspace_id, headline, summary, hero_path")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (!page) notFound();

  const { data: tickets } = await supabase
    .from("ticket_types")
    .select("id, name, price_cents, currency, quantity, sold")
    .eq("event_id", page.event_id)
    .eq("status", "on_sale")
    .order("price_cents", { ascending: true });

  return (
    <div className="bg-surface-50">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm">
          <div className="h-40 bg-gradient-to-br from-brand-600 to-indigo-700" />
          <div className="p-8">
            <h1 className="text-2xl font-bold text-surface-900">{page.headline ?? "You're invited"}</h1>
            {page.summary && <p className="mt-3 text-surface-600 leading-relaxed whitespace-pre-wrap">{page.summary}</p>}
            <TicketPurchase slug={slug} tickets={tickets ?? []} />
            <div className="mt-6 border-t border-surface-100 pt-6">
              <h2 className="text-sm font-semibold text-surface-900 mb-3">Register your interest</h2>
              <RegisterForm eventId={page.event_id} workspaceId={page.workspace_id} />
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-surface-400">Powered by Gala Dock</p>
      </div>
    </div>
  );
}
