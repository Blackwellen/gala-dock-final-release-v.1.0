import { ShieldCheck } from "lucide-react";
import { Chip } from "@/components/workspace/kit";
import { createClient } from "@/lib/supabase/server";
import { requestTime } from "@/lib/workspace/format";
import { CredentialUpload } from "./credential-upload";
import { AppealForm } from "./credential-appeal";
import { BusinessVerificationForm } from "./business-verification";
import "@/styles/provider-credentials.css";

type Row = { credential_key: string; label: string; requirement: "required" | "recommended"; gates_marketplace: boolean; status: string; expires_on: string | null;
  pending_renewal?: boolean; blocking?: boolean; reason?: string | null; category?: string; min_cover_minor?: number | null };
type Check = { kind: string; status: string; legal_name: string | null; reason: string | null; expires_at: string | null };
const CHECK: Record<string, [string, "green" | "orange" | "red" | "grey" | "blue"]> = { verified: ["Verified", "green"], submitted: ["Submitted", "blue"], pending_review: ["In review", "blue"],
  action_required: ["Needs action", "orange"], rejected: ["Not approved", "red"], expired: ["Expired", "red"], suspended: ["Suspended", "red"], unverified: ["Not started", "grey"] };
type Action = { id: string; reference: string | null; action: string; reason_code: string; note: string; status: string; appealable: boolean; appeal_deadline: string | null; appeal_case_id: string | null; created_at: string };
const STATUS: Record<string, [string, "green" | "orange" | "red" | "grey" | "blue"]> = {
  verified: ["Verified", "green"], submitted: ["Submitted", "blue"], in_review: ["In review", "blue"],
  rejected: ["Rejected", "red"], expired: ["Expired", "red"], missing: ["Not provided", "grey"], insufficient_cover: ["Cover too low", "red"],
};
const ACTION: Record<string, string> = { warning: "Warning", listing_hidden: "Listing hidden", workspace_suspended: "Workspace restricted", booking_block: "New bookings paused",
  review_removed: "Review removed", review_hidden: "Review hidden", content_removed: "Content removed" };
const date = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Trust & credentials (spec §31, Q08): status is computed from current evidence (expiry-aware); uploads are reviewed, never self-verified. */
/** canManage = settings.manage (owner): appeals and business verification. canUpload = owner or manager (listings.manage), matching the
 *  provider_documents insert policy (Q59). */
export async function CredentialsCard({ workspaceId, canManage, canUpload = canManage }: { workspaceId: string; canManage: boolean; canUpload?: boolean }) {
  const supabase = await createClient();
  const [{ data, error }, actions, checkRes] = await Promise.all([
    supabase.rpc("workspace_credential_status" as never, { p_workspace: workspaceId } as never),
    supabase.from("verification_checks" as never).select("kind,status,legal_name,reason,expires_at").eq("workspace_id", workspaceId).eq("subject_type", "workspace"),
    supabase.from("enforcement_actions" as never).select("id,reference,action,reason_code,note,status,appealable,appeal_deadline,appeal_case_id,created_at").eq("workspace_id", workspaceId).eq("status", "active").order("created_at", { ascending: false }),
  ]);
  const rows = (data ?? []) as Row[];
  const active = ((actions.data ?? []) as Action[]);
  const now = requestTime();
  // Q59: business identity (Stripe Connect or Gala Dock's manual review) gates publishing; show its status and the manual route.
  const checks = (checkRes.data ?? []) as Check[];
  const live = (c: Check) => c.status === "verified" && (!c.expires_at || new Date(c.expires_at).getTime() > now);
  const stripe = checks.find(c => c.kind === "stripe_connect"), manual = checks.find(c => c.kind === "business");
  const identityOk = checks.some(live);
  const identity: [string, "green" | "orange" | "red" | "grey" | "blue"] = identityOk ? ["Verified", "green"] : manual ? CHECK[manual.status] ?? [manual.status, "grey"] : stripe ? CHECK[stripe.status] ?? [stripe.status, "grey"] : CHECK.unverified;
  const canSubmitManual = !identityOk && (!manual || ["unverified", "rejected", "action_required", "expired"].includes(manual.status));
  const soon = (d: string | null) => d && new Date(d).getTime() - now < 30 * 86_400_000;
  const blocking = rows.filter(r => r.blocking ?? (r.gates_marketplace && r.status !== "verified")).length;
  return <section id="credentials" className="ws-panel pc-card" aria-labelledby="pc-title">
    <div className="ws-panel-head"><h2 id="pc-title"><span className="ps-ic"><ShieldCheck aria-hidden="true" /></span>Trust &amp; credentials</h2>
      {active.length ? <Chip tone="red" dot>Action from Trust &amp; Safety</Chip> : blocking ? <Chip tone="orange" dot>{blocking} needed to go live</Chip> : rows.length ? <Chip tone="green" dot>Requirements met</Chip> : null}</div>
    <p className="pc-intro">Requirements depend on your venue or services, categories and country. Documents are reviewed by Gala Dock and stay private — they are never shown on your public profile. Listings that need a document are hidden while it is missing, expired or under the required cover.</p>
    {active.length > 0 && <ul className="pc-list pc-actions" aria-label="Trust & Safety actions">{active.map(a => <li key={a.id}>
      <div className="pc-main"><b>{ACTION[a.action] ?? a.action}{a.reference ? ` · ${a.reference}` : ""}</b>
        <span className="pc-reason">{a.note}</span>
        <span className="pc-tags"><small>Since {date(a.created_at)}</small>{a.appeal_case_id ? <Chip tone="blue" dot>Appeal under review</Chip> : a.appealable && a.appeal_deadline ? <small>Appeal by {date(a.appeal_deadline)}</small> : <small>Not appealable</small>}</span></div>
      {canManage && a.appealable && !a.appeal_case_id && (!a.appeal_deadline || new Date(a.appeal_deadline).getTime() > now) && <AppealForm actionId={a.id} />}
    </li>)}</ul>}
    <ul className="pc-list" aria-label="Business identity"><li>
      <div className="pc-main"><b>Business identity verification</b>
        <span className="pc-tags"><Chip tone="purple">Required</Chip><Chip tone={identity[1]} dot>{identity[0]}</Chip>
          {identityOk && <small>{stripe && live(stripe) ? "Through Stripe payout setup" : "Reviewed by Gala Dock"}</small>}</span>
        {!identityOk && <span className="pc-reason">{manual?.reason && ["rejected", "action_required"].includes(manual.status) ? `${manual.reason} ` : ""}Verified automatically when Stripe confirms your payout account, or send your business details for Gala Dock to review.</span>}</div>
      {canManage && canSubmitManual && <BusinessVerificationForm workspaceId={workspaceId} legalName={manual?.legal_name ?? ""} resubmit={!!manual && manual.status !== "unverified"} />}
    </li></ul>
    {error ? <p className="pc-error" role="alert">Credentials couldn’t be loaded. Refresh to try again.</p>
      : !rows.length ? <p className="pc-intro">No credentials are required for your current setup.</p>
      : <ul className="pc-list">{rows.map(r => {
        const [label, tone] = STATUS[r.status] ?? [r.status, "grey"];
        return <li key={r.credential_key}>
          <div className="pc-main"><b>{r.label}</b>
            <span className="pc-tags"><Chip tone={r.requirement === "required" ? "purple" : "grey"}>{r.requirement === "required" ? "Required" : "Recommended"}</Chip><Chip tone={tone} dot>{label}</Chip>
              {r.pending_renewal && <Chip tone="blue">Renewal in review</Chip>}
              {r.expires_on && <small className={soon(r.expires_on) ? "pc-soon" : ""}>{r.status === "expired" ? "Expired" : "Expires"} {date(r.expires_on)}</small>}</span>
            {r.reason && r.status !== "verified" && <span className="pc-reason">{r.reason}</span>}</div>
          {canUpload && !r.pending_renewal && (r.status === "missing" || r.status === "rejected" || r.status === "expired" || r.status === "insufficient_cover" || soon(r.expires_on)) &&
            <CredentialUpload workspaceId={workspaceId} credentialKey={r.credential_key} label={r.label} expires={r.credential_key !== "accessibility_info" && r.credential_key !== "company_documents"}
              insurance={r.category === "insurance"} minCover={r.min_cover_minor ?? null} />}
        </li>;
      })}</ul>}
  </section>;
}
