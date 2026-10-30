import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/styles/kit.css";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenPageAllowed } from "@/lib/security";
import { untyped } from "@/lib/workspace/db";
import { money, dateShort } from "@/lib/format";
import { SignContractForm } from "./sign-form";

export const metadata: Metadata = { title: "Contract · Gala Dock", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";
type View = { number: string; title: string; status: string; version: number; expires_at: string | null; value: number; currency: string; workspace: string; body: string | null; document_hash: string | null; signed_at: string | null;
  parties: { id: string; role: string; name: string; organisation: string; signs: boolean; status: string; signed_at: string | null }[] };

/** Client signing page. Reads the sent version through the service-only contract_by_token() on the server; the browser never
 *  gets database access. Signing is a typed-name simple electronic signature recorded against the exact version hash. */
export default async function ContractSigning({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; if (!/^[0-9a-f]{48}$/.test(token)) notFound();
  if (!(await tokenPageAllowed("contract", await headers()))) throw new Error("Too many requests. Please try again shortly.");
  const { data } = await untyped(createAdminClient() as never).rpc("contract_by_token", { p_token: token });
  const c = data as View | null; if (!c || !c.body) notFound();
  const expired = c.status === "expired" || (!!c.expires_at && c.expires_at < new Date().toISOString().slice(0, 10));
  return <div className="k-root" style={{ padding: "32px 16px", minHeight: "100dvh" }}><main style={{ maxWidth: 860, margin: "0 auto" }} className="k-col">
    <div className="k-between"><b style={{ color: "var(--k-blue)", fontSize: 18 }}>{c.workspace}</b><span className="k-small k-muted">{c.number} · version {c.version}</span></div>
    <section className="k-card" style={{ padding: 28 }}>
      <h1 style={{ fontSize: 26 }}>{c.title}</h1>
      <p className="k-small" style={{ marginTop: 4 }}>Value {money(c.value, c.currency, { decimals: true })}{c.expires_at ? ` · sign by ${dateShort(`${c.expires_at}T12:00:00Z`)}` : ""}</p>
      <div style={{ whiteSpace: "pre-wrap", marginTop: 16, lineHeight: 1.6, color: "var(--k-ink-2)" }}>{c.body}</div>
      <p className="k-xs k-muted" style={{ marginTop: 16, wordBreak: "break-all" }}>Document fingerprint (SHA-256): {c.document_hash}</p>
    </section>
    <section className="k-card" style={{ padding: 24 }}>
      <h2 style={{ fontSize: 17, marginBottom: 8 }}>Signatures</h2>
      <ul className="k-col" style={{ gap: 6, listStyle: "none", padding: 0, margin: "0 0 14px" }}>{c.parties.filter(p => p.signs).map(p => <li key={p.id} className="k-between k-small"><span>{p.name}{p.organisation ? ` · ${p.organisation}` : ""} <span className="k-muted">({p.role})</span></span><span className={`k-chip ${p.status === "signed" ? "green" : p.status === "declined" ? "red" : "gray"}`}>{p.status === "signed" && p.signed_at ? `Signed ${dateShort(p.signed_at)}` : p.status}</span></li>)}</ul>
      {c.status === "signed" ? <div className="k-notice green"><b>Signed by all parties{c.signed_at ? ` on ${dateShort(c.signed_at)}` : ""}.</b></div>
        : c.status === "declined" ? <div className="k-notice red">This contract was declined. Contact {c.workspace} if this was a mistake.</div>
        : expired ? <div className="k-notice amber">The signing window has passed. Ask {c.workspace} to send an updated contract.</div>
        : <SignContractForm token={token} version={c.version} />}
    </section>
  </main></div>;
}
