"use server";

import { createClient } from "@/lib/supabase/server";

// EB-L: public registration. Anon insert is gated by RLS (a published public page must exist for
// the event). Returns a simple ok/error result for the client form.
export async function registerInterest(input: {
  eventId: string;
  workspaceId: string;
  name: string;
  email: string;
}): Promise<{ ok: boolean }> {
  const name = input.name.trim();
  if (!name) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("event_registrations").insert({
    workspace_id: input.workspaceId,
    event_id: input.eventId,
    name,
    email: input.email.trim() || null,
    status: "registered",
  });
  return { ok: !error };
}
