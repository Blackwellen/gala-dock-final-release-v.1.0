import "server-only";
import { cookies } from "next/headers";

/** Wizard draft for a direct venue booking. Stored in an httpOnly cookie scoped to the wizard route; re-validated on create. */
export type BookingDraft = {
  venueId?: string; eventName?: string; eventType?: string; guests?: number; date?: string; start?: string; end?: string; description?: string; requirements?: string[];
  clientName?: string; clientOrg?: string; contactName?: string; contactEmail?: string; contactPhone?: string; source?: string;
  spaceId?: string; layout?: string; packageId?: string; setupHours?: number; breakdownHours?: number; hold?: boolean; holdHours?: number;
  hire?: number; hireBasis?: "fixed" | "hourly"; minimumSpend?: number; includes?: string[]; fnbMode?: "none" | "package" | "custom"; fnbPerGuest?: number; fnbIncludes?: string[];
  services?: { listingId: string; label: string; detail: string; qty: number; unitPrice: number; image: string }[];
  depositPct?: number; secondPct?: number; secondDays?: number; finalPct?: number; finalDays?: number; policy?: string; notes?: string;
};
export const DRAFT_COOKIE = "gd_booking_draft";

export async function readDraft(): Promise<BookingDraft> {
  const raw = (await cookies()).get(DRAFT_COOKIE)?.value;
  if (!raw) return {};
  try { const d = JSON.parse(raw); return d && typeof d === "object" ? d as BookingDraft : {}; } catch { return {}; }
}

export const POLICIES: Record<string, { label: string; tiers: { window: string; refund: number }[] }> = {
  standard: { label: "Standard Venue Policy (30/15/7 days)", tiers: [{ window: "30+ days", refund: 100 }, { window: "15–30 days", refund: 50 }, { window: "7–14 days", refund: 25 }, { window: "<7 days", refund: 0 }] },
  flexible: { label: "Flexible (7 days)", tiers: [{ window: "7+ days", refund: 100 }, { window: "<7 days", refund: 0 }] },
  strict: { label: "Strict (60/30 days)", tiers: [{ window: "60+ days", refund: 100 }, { window: "30–60 days", refund: 50 }, { window: "<30 days", refund: 0 }] },
};
