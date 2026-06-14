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
