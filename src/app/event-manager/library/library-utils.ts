import type { Enums } from "@/lib/supabase/types";

export type LibraryKind = Enums<"library_asset_kind">;

const KIND_LABELS: Record<LibraryKind, string> = {
  template: "Template",
  asset: "Asset",
  snippet: "Snippet",
  checklist: "Checklist",
  email: "Email",
  playbook: "Playbook",
  menu: "Menu",
  poster: "Poster",
  flyer: "Flyer",
  signage: "Signage",
  presentation: "Presentation",
  floorplan: "Floorplan",
  contract: "Contract",
  invoice_template: "Invoice Template",
  rider: "Rider",
  video: "Video",
  audio: "Audio",
  image: "Image",
  document: "Document",
  archive: "Archive",
};

export function kindLabel(kind: string): string {
  return (KIND_LABELS as Record<string, string>)[kind] ?? kind;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatLibDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Date + time, e.g. "8 May 2025, 10:42" — used where the reference UI shows a
 *  timestamp rather than just a date (Event Packs list view "Last Updated" column). */
export function formatLibDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString(
    "en-GB",
    { hour: "2-digit", minute: "2-digit" }
  )}`;
}

/** "2 minutes ago" / "3 hours ago" / "Yesterday" / "5 days ago" style relative label,
 *  used in the Files "Recent activity" rail. Falls back to a short date once older
 *  than a week so the list doesn't read oddly for month-old records. */
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) {
    const m = Math.floor(diffMs / minute);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const h = Math.floor(diffMs / hour);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (diffMs < 2 * day) return "Yesterday";
  if (diffMs < 7 * day) {
    const d = Math.floor(diffMs / day);
    return `${d} days ago`;
  }
  return formatLibDate(iso);
}

/** Broad, filter-friendly file-type bucket derived from kind + mime — used to
 *  drive the "File type" filter checkboxes and the colour-coded thumbnails on
 *  the Files screen. Kept independent of `kindLabel` (which describes the raw
 *  `library_asset_kind` enum) since several distinct mimes share a kind. */
export type FileTypeBucket =
  | "pdf"
  | "presentation"
  | "spreadsheet"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "document";

export function fileTypeBucket(kind: string, mime: string | null): FileTypeBucket {
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m.includes("presentation")) return "presentation";
  if (m.includes("spreadsheet") || m.includes("excel") || m === "text/csv") return "spreadsheet";
  if (kind === "image") return "image";
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  if (kind === "archive") return "archive";
  return "document";
}

export const FILE_TYPE_BUCKET_LABELS: Record<FileTypeBucket, string> = {
  pdf: "PDFs",
  presentation: "Presentations",
  spreadsheet: "Spreadsheets",
  image: "Images",
  video: "Video",
  audio: "Audio",
  archive: "Archives",
  document: "Documents",
};
