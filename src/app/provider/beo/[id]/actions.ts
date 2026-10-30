"use server";

import { revalidatePath } from "next/cache";
import { syncBeoHospitality } from "@/lib/venue/hospitality";

/** Writes a new BEO version whose hospitality section is generated from the booking's structured lines (Q13). */
export async function syncHospitalityToBeo(jobId: string, buildItemId: string, send: boolean): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const r = await syncBeoHospitality(buildItemId, send, send ? "Hospitality synced and sent for approval" : "Hospitality synced");
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/provider/beo/${jobId}`);
  return { ok: true, message: send ? `Version ${r.data.version} sent to the client for approval` : `Hospitality synced into version ${r.data.version}` };
}
