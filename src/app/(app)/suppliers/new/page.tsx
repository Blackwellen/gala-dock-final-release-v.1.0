import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { NewSupplierForm, type CategoryOption } from "./NewSupplierForm";

export const dynamic = "force-dynamic";

export default async function NewSupplierPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("supplier_categories")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });

  return <NewSupplierForm categories={(categories ?? []) as CategoryOption[]} />;
}
