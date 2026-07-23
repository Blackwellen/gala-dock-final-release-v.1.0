// Shared display-logic helpers for the Templates screen (list/grid/detail).
// Kept local to this route since these decisions are specific to how
// `library_assets` rows are re-purposed as design templates (category comes
// from `metadata.category` because the DB `kind` enum doesn't have a distinct
// value per reference-image chip — see actions.ts TEMPLATE_CATEGORIES).

import type { TemplateCategory } from "./actions";

export type TemplateMetadata = {
  category?: string;
  event_type?: string;
  variables?: string[];
  status?: "draft" | "in_review" | "approved";
  content?: string;
  shared_team?: string;
  source_template_id?: string;
  duplicated_from?: string;
  favourited_by?: string[];
};

export function asTemplateMetadata(metadata: unknown): TemplateMetadata {
  return (metadata && typeof metadata === "object" ? metadata : {}) as TemplateMetadata;
}

const KIND_TO_CATEGORY: Record<string, TemplateCategory> = {
  flyer: "Flyers",
  menu: "Menus",
  poster: "Posters",
  presentation: "Decks",
  signage: "Signage",
  invoice_template: "Documents",
};

export function templateCategory(kind: string, metadata: TemplateMetadata): string {
  return metadata.category || KIND_TO_CATEGORY[kind] || "Documents";
}

export function templateStatus(
  lockedAt: string | null,
  metadata: TemplateMetadata
): { label: string; tone: "approved" | "draft" | "review" | "locked" } {
  if (lockedAt) return { label: "Locked", tone: "locked" };
  if (metadata.status === "draft") return { label: "Draft", tone: "draft" };
  if (metadata.status === "in_review") return { label: "In Review", tone: "review" };
  return { label: "Approved", tone: "approved" };
}

export function visibilityLabel(visibility: string, metadata: TemplateMetadata): string {
  if (visibility === "workspace") return metadata.shared_team || "Everyone";
  if (visibility === "restricted") return metadata.shared_team || "Restricted";
  if (visibility === "link") return "Link Shared";
  return "Public Link";
}

export function formatLabel(mime: string | null, storagePath: string | null, title: string): string {
  const fromExt = (name: string) => name.split(".").pop()?.toUpperCase().slice(0, 5);
  if (storagePath) {
    const ext = fromExt(storagePath);
    if (ext) return ext;
  }
  if (mime) {
    const sub = mime.split("/")[1];
    if (sub) {
      if (sub.includes("presentation")) return "PPTX";
      if (sub.includes("word")) return "DOCX";
      if (sub.includes("spreadsheet") || sub.includes("excel")) return "XLSX";
      if (sub === "zip" || sub.includes("zip")) return "ZIP";
      return sub.split(/[.+]/).pop()!.toUpperCase().slice(0, 5);
    }
  }
  const ext = fromExt(title);
  return ext || "FILE";
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const STATUS_TONE_CLASSES: Record<string, string> = {
  approved: "bg-success-50 text-success-700 border-success-100",
  draft: "bg-warning-50 text-warning-700 border-warning-100",
  review: "bg-info-50 text-info-600 border-info-200",
  locked: "bg-surface-100 text-surface-600 border-surface-200",
};

export const CATEGORY_TONE_CLASSES = "bg-brand-600 text-white";
