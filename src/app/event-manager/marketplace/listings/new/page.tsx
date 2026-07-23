import { requireWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewListingForm } from "./NewListingForm";

export const dynamic = "force-dynamic";

export default async function NewListingPage() {
  await requireWorkspace();

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="New listing" description="Add a new marketplace listing." />
      <div className="flex-1 px-6 py-6 max-w-2xl">
        <NewListingForm />
      </div>
    </div>
  );
}
