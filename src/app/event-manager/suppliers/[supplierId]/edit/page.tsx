import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { EditSupplierForm, type EditSupplierData } from "./EditSupplierForm";
import type { CategoryOption } from "../../new/NewSupplierForm";

export const dynamic = "force-dynamic";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: supplier }, { data: categories }] = await Promise.all([
    supabase
      .from("suppliers")
      .select(
        "id, name, category_id, status, rating_internal, notes, primary_email, primary_phone, website"
      )
      .eq("id", supplierId)
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("supplier_categories")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .order("sort", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  if (!supplier) notFound();

  const data: EditSupplierData = {
    id: supplier.id,
    name: supplier.name,
    categoryId: supplier.category_id ?? "",
    status: supplier.status,
    rating: supplier.rating_internal ?? 0,
    notes: supplier.notes ?? "",
    email: supplier.primary_email ?? "",
    phone: supplier.primary_phone ?? "",
    website: supplier.website ?? "",
  };

  return <EditSupplierForm supplier={data} categories={(categories ?? []) as CategoryOption[]} />;
}
