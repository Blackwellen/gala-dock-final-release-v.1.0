import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";

/** "Download my data": everything the signed-in user can read about themselves, as JSON (RLS-scoped). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await rateLimit(`export:${user.id}`, 5, 3600))) return NextResponse.json({ error: "Too many exports. Try again later." }, { status: 429 });
  const [profile, events, tickets, reviews, saved, messages] = await Promise.all([
    supabase.from("profiles").select("full_name,phone,country,language,bio,date_of_birth,notifications,marketing_opt_in,created_at").eq("id", user.id).single(),
    supabase.from("events").select("id,name,event_type,status,starts_at,ends_at,location,guest_count,budget_total,created_at").eq("owner_id", user.id),
    supabase.from("tickets").select("code,status,order_ref,attendee_name,attendee_email,price_paid,created_at,events(name,starts_at)").eq("holder_id", user.id),
    supabase.from("reviews").select("rating,ratings,body,created_at").eq("user_id", user.id),
    supabase.from("saved_items").select("item_key,created_at").eq("user_id", user.id),
    supabase.from("messages").select("body,created_at,thread_id").eq("sender_id", user.id),
  ]);
  const out = { exported_at: new Date().toISOString(), account: { id: user.id, email: user.email, created_at: user.created_at }, profile: profile.data, events: events.data, tickets: tickets.data, reviews: reviews.data, saved: saved.data, messages: messages.data };
  return new NextResponse(JSON.stringify(out, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="gala-dock-data-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "private, no-store" } });
}
