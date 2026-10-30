"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import type { ActionResult } from "./shell";
import { untyped } from "@/lib/workspace/db";

/** Registers an uploaded object against an event the caller can access. The object must live in the caller's own folder. */
export async function registerEventFile(eventId: string, path: string, title: string, kind: "file" | "poster" | "image" = "file"): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(eventId); if (!id.success) return { ok: false, error: "Invalid event." };
  const { supabase, user } = await requireUser();
  if ((!path.startsWith(`${user.id}/events/${id.data}/`) && !new RegExp(`^${user.id}/[0-9a-f-]{36}\\.(png|jpg|webp|pdf)$`,"i").test(path)) || path.includes("..")) return { ok: false, error: "Invalid upload location." };
  const proof=await untyped(supabase).from("verified_private_uploads").select("path").eq("path",path).eq("owner_id",user.id).not("object_id","is",null).maybeSingle();
  if(proof.error||!proof.data)return {ok:false,error:"Upload this file through the secure upload form first."};
  const { data: ok } = await supabase.rpc("can_access_event", { target: id.data });
  if (!ok) return { ok: false, error: "You don't have access to this event." };
  const folder = path.slice(0, path.lastIndexOf("/")), name = path.slice(path.lastIndexOf("/") + 1);
  const { data: listed } = await supabase.storage.from("workspace-files").list(folder, { search: name, limit: 1 });
  if (!listed?.some(o => o.name === name)) return { ok: false, error: "Upload not found — please try again." };
  const { data: ev } = await supabase.from("events").select("workspace_id").eq("id", id.data).single();
  const { error } = await supabase.from("media_assets").insert({ event_id: id.data, workspace_id: ev?.workspace_id ?? null, kind, title: title.slice(0, 160), url: path, rights: "owned", status: "draft" });
  if (error) return { ok: false, error: "Could not save the file record." };
  revalidatePath(`/organizer/events/${id.data}`); revalidatePath(`/account/events/${id.data}`);
  return { ok: true, message: "File uploaded." };
}
