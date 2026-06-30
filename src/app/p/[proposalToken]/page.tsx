import { createAdminClient } from "@/lib/supabase/admin";
import type { Proposal, ProposalLineItem } from "@/lib/supabase/types";
import { ProposalDocument } from "@/app/event-manager/proposals/_components/ProposalDocument";
import { SignPanel } from "./SignPanel";

export const metadata = { title: "Proposal", robots: { index: false } };
// Public, token-based, mutates on load — always render dynamically.
export const dynamic = "force-dynamic";

type State = "sign" | "signed" | "declined" | "expired" | "not-found" | "converted";

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ proposalToken: string }>;
}) {
  const { proposalToken } = await params;
  const supabase = createAdminClient();

  const { data: proposalRow } = await supabase
    .from("proposals")
    .select("*")
    .eq("share_token", proposalToken)
    .maybeSingle();

  if (!proposalRow || proposalRow.deleted_at) {
    return <Shell><Message title="Proposal not found" body="This link is invalid or the proposal is no longer available." /></Shell>;
  }

  const proposal = proposalRow as Proposal;

  // Auto-advance sent → viewed on first open.
  if (proposal.status === "sent") {
    const now = new Date().toISOString();
    await supabase
      .from("proposals")
      .update({ status: "viewed", viewed_at: proposal.viewed_at ?? now, updated_at: now })
      .eq("id", proposal.id);
    proposal.status = "viewed";
    proposal.viewed_at = proposal.viewed_at ?? now;
  }

  // Determine expiry.
  let expired = false;
  if (proposal.valid_until && !["signed", "converted", "declined"].includes(proposal.status)) {
    const due = new Date(proposal.valid_until);
    due.setHours(23, 59, 59, 999);
    expired = due.getTime() < Date.now();
  }

  let state: State = "sign";
  if (proposal.status === "converted") state = "converted";
  else if (proposal.status === "signed") state = "signed";
  else if (proposal.status === "declined") state = "declined";
  else if (expired) state = "expired";

  const { data: lineData } = await supabase
    .from("proposal_line_items")
    .select("*")
    .eq("proposal_id", proposal.id)
    .order("sort_order", { ascending: true });
  const lineItems = (lineData ?? []) as ProposalLineItem[];

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", proposal.workspace_id)
    .maybeSingle();
  const workspaceName = workspace?.name ?? "";

  return (
    <Shell>
      <div className="rounded-xl border border-surface-200 bg-white p-8 shadow-sm sm:p-10">
        <ProposalDocument proposal={proposal} lineItems={lineItems} workspaceName={workspaceName} />

        <div className="mt-10">
          {state === "sign" && (
            <SignPanel token={proposalToken} />
          )}

          {state === "signed" && (
            <Banner tone="success" title="This proposal has been signed">
              {proposal.signed_by_name && proposal.signed_at ? (
                <>Signed by <strong>{proposal.signed_by_name}</strong> on{" "}
                {new Date(proposal.signed_at).toLocaleString("en-GB")}.</>
              ) : (
                "Thank you — your acceptance has been recorded."
              )}
            </Banner>
          )}

          {state === "converted" && (
            <Banner tone="success" title="This proposal has been accepted">
              Your event planner has been notified and is preparing the next steps.
            </Banner>
          )}

          {state === "declined" && (
            <Banner tone="neutral" title="This proposal was declined">
              If this was a mistake, please contact your event planner.
            </Banner>
          )}

          {state === "expired" && (
            <Banner tone="warning" title="This proposal has expired">
              {proposal.valid_until
                ? `This proposal was valid until ${new Date(proposal.valid_until).toLocaleDateString("en-GB")}. Please contact your event planner for an updated version.`
                : "Please contact your event planner for an updated version."}
            </Banner>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-xs leading-relaxed text-surface-400">
        Under the Electronic Communications Act 2000 (UK), a typed name combined with explicit
        acceptance of these terms constitutes a valid electronic signature for a commercial
        contract.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-surface-50 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight text-brand-700">Gala Dock</span>
        </div>
        {children}
      </div>
    </main>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-10 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-surface-900">{title}</h1>
      <p className="mt-2 text-sm text-surface-500">{body}</p>
    </div>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "success" | "warning" | "neutral";
  title: string;
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-success-200 bg-success-50 text-success-800"
      : tone === "warning"
      ? "border-warning-200 bg-warning-50 text-warning-800"
      : "border-surface-200 bg-surface-50 text-surface-700";
  return (
    <div className={`rounded-lg border p-5 ${cls}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm opacity-90">{children}</p>
    </div>
  );
}
