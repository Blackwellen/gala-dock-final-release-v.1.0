"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { ActionResult } from "@/lib/actions/shell";

export type SessionLinks = { join_url: string | null; speaker_url: string | null; host_url: string | null; host_secret_note: string | null; external_meeting_id: string | null };

/**
 * Plan › Online sessions (Q29): join / speaker / host links are column-revoked for every client. Editors read them on demand
 * through virtual_session_links, which records an audited `virtual.host_links_viewed` event each time. Everything else uses the
 * existing commands in src/lib/virtual/sessions.ts.
 */
export async function revealSessionLinks(sessionId: string): Promise<ActionResult<SessionLinks>> {
  if (!z.string().uuid().safeParse(sessionId).success) return { ok: false, error: "Invalid session." };
  const { data, error } = await untyped(await createClient()).rpc("virtual_session_links", { p_session: sessionId });
  if (error) return { ok: false, error: /not_authorized/.test(error.message) ? "Only event editors can view session links." : "Could not load the links." };
  return { ok: true, data: data as SessionLinks };
}
