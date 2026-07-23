import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { r2Configured } from "@/lib/storage/r2";
import {
  SupplierDetailClient,
  type ContactRow,
  type FileRow,
  type LinkedEvent,
  type SupplierDetail,
} from "./SupplierDetailClient";
import { formatDate } from "../lib";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  logo: "Logo",
  contract: "Contract",
  cert: "Certificate",
  tnc: "Terms & Conditions",
  other: "Other",
};

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: supplier } = await supabase
    .from("suppliers")
    .select(
      `id, name, status, website, primary_email, primary_phone, notes,
       rating_internal,
       category:supplier_categories ( name )`
    )
    .eq("id", supplierId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!supplier) notFound();

  const [{ data: contacts }, { data: files }, { data: eventLinks }] =
    await Promise.all([
      supabase
        .from("supplier_contacts")
        .select("id, name, role, email, phone, is_primary")
        .eq("supplier_id", supplierId)
        .eq("workspace_id", workspaceId)
        .order("is_primary", { ascending: false })
        .order("name", { ascending: true }),
      supabase
        .from("supplier_files")
        .select("id, filename, kind, expires_at, archived_at")
        .eq("supplier_id", supplierId)
        .eq("workspace_id", workspaceId)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("event_suppliers")
        .select(
          `id, role_on_event, status,
           event:events ( id, name, start_at )`
        )
        .eq("supplier_id", supplierId)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),
    ]);

  const detail: SupplierDetail = {
    id: supplier.id,
    name: supplier.name,
    status: supplier.status,
    category: (supplier.category as { name: string } | null)?.name ?? "—",
    website: supplier.website,
    email: supplier.primary_email,
    phone: supplier.primary_phone,
    notes: supplier.notes,
    rating: supplier.rating_internal,
  };

  const contactRows: ContactRow[] = (contacts ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    email: c.email,
    phone: c.phone,
    isPrimary: c.is_primary,
  }));

  const fileRows: FileRow[] = (files ?? []).map((f) => ({
    id: f.id,
    name: f.filename,
    kind: KIND_LABEL[f.kind] ?? f.kind,
    expiry: formatDate(f.expires_at),
    archived: f.archived_at !== null,
  }));

  const events: LinkedEvent[] = (eventLinks ?? [])
    .map((link): LinkedEvent | null => {
      const ev = link.event as { id: string; name: string; start_at: string | null } | null;
      if (!ev) return null;
      return {
        id: ev.id,
        name: ev.name,
        date: formatDate(ev.start_at),
        role: link.role_on_event ?? "—",
        status: link.status,
      };
    })
    .filter((e): e is LinkedEvent => e !== null);

  return (
    <SupplierDetailClient
      supplier={detail}
      contacts={contactRows}
      files={fileRows}
      events={events}
      workspaceId={workspaceId}
      r2Ready={r2Configured()}
    />
  );
}
