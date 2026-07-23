import { requireWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewSupplierBillForm } from "./NewSupplierBillForm";

export const metadata = { title: "Finance — Supplier Payments" };
export const dynamic = "force-dynamic";

export default async function NewSupplierBillPage() {
  const { workspaceId } = await requireWorkspace();
  const supabase = await createClient();

  const [{ data: supplierData }, { data: eventData }] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("workspace_id", workspaceId).order("name", { ascending: true }),
    supabase
      .from("events")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);

  const suppliers = (supplierData ?? []).map((s) => ({ id: s.id, name: s.name ?? "Unnamed supplier" }));
  const events = (eventData ?? []).map((e) => ({ id: e.id, name: e.name }));

  return (
    <div className="min-h-full bg-surface-50">
      <PageHeader title="Add Supplier Bill" description="Record a new accounts-payable bill from a supplier for approval." />
      <div className="p-6 max-w-2xl">
        <NewSupplierBillForm suppliers={suppliers} events={events} />
      </div>
    </div>
  );
}
