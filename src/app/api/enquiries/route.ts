import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in to send your enquiry." }, { status: 401 });
  if (!(await hasRequiredAssurance(supabase))) return NextResponse.json({ error: "Complete multi-factor authentication first." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.listing_key !== "string" || body.listing_key.length > 120 || !body.event_date || Number.isNaN(Date.parse(body.event_date))) return NextResponse.json({ error: "Choose an event date." }, { status: 400 });
  const { error } = await supabase.from("enquiries").insert({ user_id: user.id, listing_key: body.listing_key, event_date: body.event_date, details: body.details ?? {} });
  return NextResponse.json(error ? { error: "Your enquiry could not be sent." } : { message: "Your enquiry has been saved. You can track it in your workspace." }, { status: error ? 500 : 200 });
}
