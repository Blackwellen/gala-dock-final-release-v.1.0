import { Upload } from "lucide-react";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatBytes, formatLibDate, type LibraryKind } from "../library-utils";
import { FilesClient, type FileRow, type FileCategory } from "./FilesClient";

export const metadata = { title: "Files" };

const FILE_KINDS: LibraryKind[] = ["image", "video", "audio", "document", "archive"];

function categoryFor(kind: string): Exclude<FileCategory, "All"> {
  if (kind === "image") return "Images";
  if (kind === "video") return "Video";
  return "Documents";
}

function typeLabel(mime: string | null, kind: string): string {
  if (mime) {
    const sub = mime.split("/")[1];
    if (sub) return sub.split(/[.+]/).pop()!.toUpperCase().slice(0, 5);
  }
  return kind.toUpperCase();
}

export default async function FilesPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("library_assets")
    .select("id, title, kind, mime, size_bytes, created_at")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .in("kind", FILE_KINDS)
    .order("created_at", { ascending: false });

  const files: FileRow[] = (assets ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    category: categoryFor(a.kind),
    typeLabel: typeLabel(a.mime, a.kind),
    size: formatBytes(a.size_bytes),
    date: formatLibDate(a.created_at),
  }));

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Files"
        description="All uploaded files across your events and suppliers"
        actions={
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />
            Upload Files
            <input type="file" className="hidden" multiple />
          </label>
        }
      />
      <FilesClient files={files} />
    </div>
  );
}
