// Event Packs — smart-pack rule shape & pack-level metadata.
//
// `library_collections` has no dedicated columns for "audience", pack-level
// "visibility" (public/shared/internal) or download/share counters — only
// `auto_filter` (jsonb, originally intended as a smart-pack rule definition)
// is free-form enough to carry them without a migration. We deliberately
// widen its shape to a small typed envelope: `rules` holds the actual smart
// -pack filter (only populated for smart packs), while `audience`,
// `visibility` and `stats` are pack-level metadata that both manual and
// smart packs use. This is a pragmatic reuse of an existing jsonb column,
// not a full DSL — see the Event Packs release notes for the schema-gap
// writeup recommending real columns (`audience`, `visibility`,
// `download_count`, `share_count`) in a future migration.
import type { Json, Enums } from "@/lib/supabase/types";
import type { LibraryKind } from "../library-utils";

export type PackAudience =
  | "guests"
  | "staff"
  | "suppliers"
  | "speakers"
  | "sponsors"
  | "vips"
  | "press"
  | "exhibitors"
  | "internal"
  | "all";

export type PackVisibility = "public" | "shared" | "internal";

export type AssetVisibility = Enums<"library_visibility">;

export interface PackSmartRules {
  eventId?: string | null;
  kind?: LibraryKind | null;
  tag?: string | null;
  assetVisibility?: AssetVisibility | null;
}

export interface PackStats {
  downloads: number;
  shares: number;
  lastDownloadAt: string | null;
  lastSharedAt: string | null;
}

export interface PackMeta {
  smart: boolean;
  audience: PackAudience;
  visibility: PackVisibility;
  rules: PackSmartRules | null;
  stats: PackStats;
}

const DEFAULT_STATS: PackStats = {
  downloads: 0,
  shares: 0,
  lastDownloadAt: null,
  lastSharedAt: null,
};

export const DEFAULT_PACK_META: PackMeta = {
  smart: false,
  audience: "all",
  visibility: "internal",
  rules: null,
  stats: DEFAULT_STATS,
};

/** Parse a `library_collections.auto_filter` jsonb value into a typed PackMeta, tolerating null/legacy/empty values. */
export function parsePackMeta(raw: Json | null | undefined): PackMeta {
  const obj: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  const statsRaw: Record<string, unknown> =
    obj.stats && typeof obj.stats === "object" && !Array.isArray(obj.stats)
      ? (obj.stats as Record<string, unknown>)
      : {};

  const rulesRaw =
    obj.rules && typeof obj.rules === "object" && !Array.isArray(obj.rules)
      ? (obj.rules as Record<string, unknown>)
      : null;

  return {
    smart: Boolean(obj.smart),
    audience: (obj.audience as PackAudience) ?? "all",
    visibility: (obj.visibility as PackVisibility) ?? "internal",
    rules: rulesRaw
      ? {
          eventId: (rulesRaw.eventId as string) ?? null,
          kind: (rulesRaw.kind as LibraryKind) ?? null,
          tag: (rulesRaw.tag as string) ?? null,
          assetVisibility: (rulesRaw.assetVisibility as AssetVisibility) ?? null,
        }
      : null,
    stats: {
      downloads: Number(statsRaw.downloads ?? 0) || 0,
      shares: Number(statsRaw.shares ?? 0) || 0,
      lastDownloadAt: (statsRaw.lastDownloadAt as string) ?? null,
      lastSharedAt: (statsRaw.lastSharedAt as string) ?? null,
    },
  };
}

export function serializePackMeta(meta: PackMeta): Json {
  return meta as unknown as Json;
}

export const AUDIENCE_OPTIONS: { value: PackAudience; label: string }[] = [
  { value: "all", label: "All" },
  { value: "guests", label: "Guests" },
  { value: "staff", label: "Staff" },
  { value: "suppliers", label: "Suppliers" },
  { value: "speakers", label: "Speakers" },
  { value: "sponsors", label: "Sponsors" },
  { value: "vips", label: "VIPs" },
  { value: "press", label: "Press" },
  { value: "exhibitors", label: "Exhibitors" },
  { value: "internal", label: "Internal" },
];

export function audienceLabel(value: string): string {
  return AUDIENCE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export const VISIBILITY_OPTIONS: { value: PackVisibility; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "shared", label: "Shared" },
  { value: "internal", label: "Internal" },
];

export function visibilityLabel(value: string): string {
  return VISIBILITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export const ASSET_VISIBILITY_OPTIONS: { value: AssetVisibility; label: string }[] = [
  { value: "workspace", label: "Workspace" },
  { value: "restricted", label: "Restricted" },
  { value: "link", label: "Link only" },
  { value: "public_token", label: "Public" },
];
