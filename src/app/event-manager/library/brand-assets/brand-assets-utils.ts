// Brand Assets — shared types + helpers for the metadata-jsonb-backed brand
// taxonomy and approval workflow. There is no `brands` or `brand_kits` table
// in the live schema, so "Brand" grouping and approval state are both modeled
// directly on `library_assets.metadata` (jsonb) rather than new columns —
// see the summary notes on this build for the schema-gap this leaves for a
// future migration phase.

import type { Json } from "@/lib/supabase/types";

// Brand assets reuse the existing "event-files" Supabase Storage bucket (the
// same bucket already used by Templates/documents/mood-boards) under a
// `brand-assets/{workspaceId}/...` prefix — this constant lives in a plain
// (non "use server") module since a "use server" file may only export async
// server actions.
export const BRAND_ASSET_BUCKET = "event-files";

export type BrandAssetType =
  | "logo"
  | "brand_kit"
  | "colour_palette"
  | "typography"
  | "social_artwork"
  | "sponsor_asset"
  | "template"
  | "photography"
  | "video"
  | "other";

export const BRAND_ASSET_TYPES: BrandAssetType[] = [
  "logo",
  "brand_kit",
  "colour_palette",
  "typography",
  "social_artwork",
  "sponsor_asset",
  "template",
  "photography",
  "video",
  "other",
];

export const ASSET_TYPE_LABELS: Record<BrandAssetType, string> = {
  logo: "Logo",
  brand_kit: "Brand Kit",
  colour_palette: "Colour Palette",
  typography: "Typography",
  social_artwork: "Social Artwork",
  sponsor_asset: "Sponsor Asset",
  template: "Template",
  photography: "Photography",
  video: "Video",
  other: "Other",
};

export type ApprovalStatus = "draft" | "pending_review" | "approved" | "rejected" | "locked" | "archived";

export const APPROVAL_STATUSES: ApprovalStatus[] = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "locked",
  "archived",
];

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  draft: "Draft",
  pending_review: "In Review",
  approved: "Approved",
  rejected: "Needs Update",
  locked: "Locked",
  archived: "Archived",
};

export const APPROVAL_BADGE_CLASSES: Record<ApprovalStatus, string> = {
  draft: "bg-surface-100 text-surface-600",
  pending_review: "bg-warning-50 text-warning-700",
  approved: "bg-success-50 text-success-700",
  rejected: "bg-danger-50 text-danger-700",
  locked: "bg-info-50 text-info-700",
  archived: "bg-surface-100 text-surface-500",
};

export interface BrandAssetMetadata {
  asset_type: BrandAssetType;
  brand_name: string | null;
  approval_status: ApprovalStatus;
  hex_colors: string[];
  font_names: string[];
  starred: boolean;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
}

function isPlainObject(v: Json): v is { [key: string]: Json } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse the free-form `metadata` jsonb into a typed shape with safe fallbacks.
 *  Pre-existing rows created before this feature have no `approval_status` —
 *  they default to "approved" per the product decision (existing brand
 *  collateral is treated as already-approved unless explicitly reset). */
export function parseBrandMetadata(metadata: Json): BrandAssetMetadata {
  const m = isPlainObject(metadata) ? metadata : {};

  const assetTypeRaw = typeof m.asset_type === "string" ? m.asset_type : "other";
  const asset_type: BrandAssetType = (BRAND_ASSET_TYPES as string[]).includes(assetTypeRaw)
    ? (assetTypeRaw as BrandAssetType)
    : "other";

  const approvalRaw = typeof m.approval_status === "string" ? m.approval_status : "approved";
  const approval_status: ApprovalStatus = (APPROVAL_STATUSES as string[]).includes(approvalRaw)
    ? (approvalRaw as ApprovalStatus)
    : "approved";

  const hex_colors = Array.isArray(m.hex_colors) ? m.hex_colors.filter((c): c is string => typeof c === "string") : [];
  const font_names = Array.isArray(m.font_names) ? m.font_names.filter((c): c is string => typeof c === "string") : [];

  return {
    asset_type,
    brand_name: typeof m.brand_name === "string" ? m.brand_name : null,
    approval_status,
    hex_colors,
    font_names,
    starred: m.starred === true,
    approved_by: typeof m.approved_by === "string" ? m.approved_by : null,
    approved_at: typeof m.approved_at === "string" ? m.approved_at : null,
    rejected_reason: typeof m.rejected_reason === "string" ? m.rejected_reason : null,
  };
}

/** Merge a partial patch into existing metadata jsonb, preserving unknown keys. */
export function mergeBrandMetadata(existing: Json, patch: Record<string, Json>): Json {
  const base = isPlainObject(existing) ? existing : {};
  return { ...base, ...patch } as Json;
}

/** Map a file's mime type to the closest existing `library_asset_kind` enum
 *  value — the DB `kind` column stays a plain file-type signal (image/video/
 *  document/asset) while `metadata.asset_type` carries the brand taxonomy. */
export function kindFromMime(mime: string | null): "image" | "video" | "document" | "asset" {
  if (!mime) return "asset";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf" || mime.startsWith("text/") || mime.includes("word") || mime.includes("sheet") || mime.includes("presentation")) return "document";
  return "asset";
}

export function formatLabelFromMime(mime: string | null, kind: string): string {
  if (mime) {
    const sub = mime.split("/")[1];
    if (sub) return sub.split(/[.+]/).pop()!.toUpperCase().slice(0, 5);
  }
  return kind.toUpperCase();
}

export function visibilityLabel(v: string): string {
  switch (v) {
    case "workspace": return "Internal";
    case "restricted": return "Restricted";
    case "link": return "Shared";
    case "public_token": return "Public";
    default: return v;
  }
}

export function visibilityBadgeClass(v: string): string {
  switch (v) {
    case "workspace": return "bg-surface-100 text-surface-600";
    case "restricted": return "bg-danger-50 text-danger-700";
    case "link": return "bg-info-50 text-info-700";
    case "public_token": return "bg-success-50 text-success-700";
    default: return "bg-surface-100 text-surface-500";
  }
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** The five expected brand-kit categories used for the completeness meter. */
export const COMPLETENESS_CATEGORIES: BrandAssetType[] = ["logo", "colour_palette", "typography", "template", "social_artwork"];
