import { ShieldCheck } from "lucide-react";
import { Chip } from "@/components/workspace/kit";
import { createClient } from "@/lib/supabase/server";
import { CredentialUpload } from "./credential-upload";
import "@/styles/provider-credentials.css";

type Row = { credential_key: string; label: string; requirement: "required" | "recommended"; gates_marketplace: boolean; status: string; expires_on: string | null };
const STATUS: Record<string, [string, "green" | "orange" | "red" | "grey" | "blue"]> = {
  verified: ["Verified", "green"], submitted: ["Submitted", "blue"], in_review: ["In review", "blue"],
  rejected: ["Rejected", "red"], expired: ["Expired", "red"], missing: ["Not provided", "grey"],
};

/** Trust & credentials (spec §31): requirements adapt to capability, category and country; uploads are reviewed, never self-verified. */
export async function CredentialsCard({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("workspace_credential_status" as never, { p_workspace: workspaceId } as never);
  const rows = (data ?? []) as Row[];
  const soon = (d: string | null) => d && new Date(d).getTime() - Date.now() < 30 * 86_400_000;
  const blocking = rows.filter(r => r.gates_marketplace && r.status !== "verified").length;
  return <section className="ws-panel pc-card" aria-labelledby="pc-title">
    <div className="ws-panel-head"><h2 id="pc-title"><span className="ps-ic"><ShieldCheck aria-hidden="true" /></span>Trust &amp; credentials</h2>
      {blocking ? <Chip tone="orange" dot>{blocking} needed to go live</Chip> : rows.length ? <Chip tone="green" dot>Requirements met</Chip> : null}</div>
    <p className="pc-intro">Requirements depend on your venue or services, categories and country. Documents are reviewed by Gala Dock and stay private — they are never shown on your public profile.</p>
    {error ? <p className="pc-error" role="alert">Credentials couldn’t be loaded. Refresh to try again.</p>
      : !rows.length ? <p className="pc-intro">No credentials are required for your current setup.</p>
      : <ul className="pc-list">{rows.map(r => {
        const [label, tone] = STATUS[r.status] ?? [r.status, "grey"];
        return <li key={r.credential_key}>
          <div className="pc-main"><b>{r.label}</b>
            <span className="pc-tags"><Chip tone={r.requirement === "required" ? "purple" : "grey"}>{r.requirement === "required" ? "Required" : "Recommended"}</Chip><Chip tone={tone} dot>{label}</Chip>
              {r.expires_on && <small className={soon(r.expires_on) ? "pc-soon" : ""}>Expires {new Date(r.expires_on).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</small>}</span></div>
          {canManage && (r.status === "missing" || r.status === "rejected" || r.status === "expired" || soon(r.expires_on)) &&
            <CredentialUpload workspaceId={workspaceId} credentialKey={r.credential_key} label={r.label} expires={r.credential_key !== "accessibility_info" && r.credential_key !== "company_documents"} />}
        </li>;
      })}</ul>}
  </section>;
}
