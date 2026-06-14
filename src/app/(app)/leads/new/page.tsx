import { EmptyState } from "@/components/ui/EmptyState";

export default function NewLeadPage() {
  return (
    <div className="p-6">
      <EmptyState
        title="New Lead"
        description="This section is being brought online."
      />
    </div>
  );
}
