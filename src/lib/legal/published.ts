import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import type { LegalRole, Published } from "./registry";

/** Published versions and dates for every legal document (legal_current_versions; anon-readable). Empty before the pack is published. */
export const loadPublished = cache(async (): Promise<Record<string, Published>> => {
  try {
    const sb = untyped(await createClient());
    const { data, error } = await sb.rpc("legal_current_versions");
    if (error || !Array.isArray(data)) return {};
    return Object.fromEntries((data as (Published & { slug: string })[]).map(r => [r.slug, r]));
  } catch { return {}; }
});

/** One document the signed-in user still has to accept (legal_pending_for_me). */
export type PendingDoc = {
  slug: string; title: string; href: string; version: string; label: string; role: LegalRole; workspace_name: string | null;
  effective_at: string; required: boolean; express: string[]; previously_accepted: boolean;
};

/** Documents the signed-in user must accept at their current version. Never throws: an error means "nothing to show". */
export const loadPending = cache(async (): Promise<PendingDoc[]> => {
  try {
    const sb = untyped(await createClient());
    const { data, error } = await sb.rpc("legal_pending_for_me");
    if (error || !Array.isArray(data)) return [];
    return data as PendingDoc[];
  } catch { return []; }
});

export const BUSINESS: LegalRole[] = ["organiser", "supplier", "venue", "partner", "promoter"];
/** Business shells gate only on business documents that are already required; consumer documents show the banner instead. */
export const businessGate = (p: PendingDoc[]) => p.some(d => d.required && BUSINESS.includes(d.role));
