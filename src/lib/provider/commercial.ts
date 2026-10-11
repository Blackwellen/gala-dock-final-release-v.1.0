import "server-only";
import { cache } from "react";
import { rows } from "@/lib/workspace/db";
import { getProvider } from "./context";
import type { Block } from "./fit";

export type Quote = {
  id: string; build_item_id: string; reference: string; version: number; status: string; total: number; deposit_pct: number; valid_until: string | null;
  sent_at: string | null; created_at: string; items: { label: string; detail?: string; qty: number; unit: string; unit_price: number; kind: string; ref?: string; image?: string }[];
  terms: Record<string, unknown>; message: string; subtotal: number; tax: number;
};

export const workspaceBlocks = cache(async () => {
  const { db, workspace } = await getProvider();
  return rows<Block>(db.from("availability_blocks").select("id,kind,listing_id,space_id,crew_id,starts_at,ends_at,note").eq("workspace_id", workspace.id).order("starts_at"));
});
export const workspaceQuotes = cache(async () => {
  const { db, workspace } = await getProvider();
  return rows<Quote>(db.from("provider_quotes").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }));
});
