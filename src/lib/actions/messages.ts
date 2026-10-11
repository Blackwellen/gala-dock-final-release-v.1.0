"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/security";
import type { ActionResult } from "./shell";

/** Sends a human message in a thread the caller can access (RLS: event participants only). */
export async function sendMessage(threadId: string, body: string): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(threadId); const text = body.trim();
  if (!id.success) return { ok: false, error: "Conversation not found." };
  if (!text || text.length > 5000) return { ok: false, error: "Write a message (up to 5,000 characters)." };
  const { supabase, user } = await requireUser();
  if (!(await rateLimit(`msg:${user.id}`, 60, 300))) return { ok: false, error: "You're sending messages too quickly." };
  const { data: th } = await supabase.from("threads").select("id,event_id").eq("id", id.data).maybeSingle();
  if (!th) return { ok: false, error: "Conversation not found." };
  const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  const { error } = await supabase.from("messages").insert({ thread_id: th.id, sender_id: user.id, sender_name: prof?.full_name || user.email || "You", body: text });
  if (error) return { ok: false, error: "Message not sent — try again." };
  await supabase.from("threads").update({ updated_at: new Date().toISOString() }).eq("id", th.id);
  revalidatePath(`/account/events/${th.event_id}/messages`);
  return { ok: true };
}
export async function markThreadRead(threadId: string): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(threadId); if (!id.success) return { ok: false };
  const { supabase } = await requireUser();
  await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("thread_id", id.data).eq("from_provider", true).is("read_at", null);
  return { ok: true };
}
