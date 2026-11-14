"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; message: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const KEY = /^(\*|[a-z][a-z0-9_]{2,40})$/;
const deny = (m: string) => /not_authorized|step_up|session_revoked/.test(m) ? "You need the commerce permission and two-step verification." : null;

/**
 * Q56 ads admin. Pause / resume one boost (policy takedown) — the advertiser is told why, and paused time is refunded at the end
 * of the flight. adm_boost_pause re-checks commerce + aal2 + reason and audits it.
 */
export async function setBoostPaused(boostId: string, pause: boolean, reason: string): Promise<Result> {
  if (!UUID.test(boostId)) return { ok: false, error: "Not found." };
  if (reason.trim().length < 5) return { ok: false, error: "Give a reason of at least 5 characters (the advertiser sees it when pausing)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("adm_boost_pause" as never, { p_boost: boostId, p_pause: pause, p_reason: reason.trim().slice(0, 500) } as never);
  if (error) return { ok: false, error: deny(error.message) ?? (/not_found/.test(error.message) ? "This boost is not running (or is already in that state)." : "Could not update the boost.") };
  revalidatePath("/admin/commerce/advertising", "page");
  return { ok: true, message: pause ? "Boost paused. The advertiser has been told." : "Boost resumed." };
}

/** One placement on/off, or '*' for every placement (the ads kill switch). Audited with the reason. */
export async function setPlacementActive(key: string, active: boolean, reason: string): Promise<Result> {
  if (!KEY.test(key)) return { ok: false, error: "Unknown placement." };
  if (reason.trim().length < 5) return { ok: false, error: "Give a reason of at least 5 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adm_ad_placement_set" as never, { p_key: key, p_active: active, p_reason: reason.trim().slice(0, 500) } as never);
  if (error) return { ok: false, error: deny(error.message) ?? (/not_found/.test(error.message) ? "Unknown placement." : "Could not update the placement.") };
  revalidatePath("/admin/commerce/advertising", "page");
  const n = Number(data ?? 0);
  return { ok: true, message: n ? `${n} placement${n === 1 ? "" : "s"} switched ${active ? "on" : "off"}.` : "Nothing changed." };
}
