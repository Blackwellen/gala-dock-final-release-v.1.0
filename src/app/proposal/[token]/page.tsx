import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/styles/kit.css";
import "@/styles/org-wizard.css";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { tokenPageAllowed } from "@/lib/security";
import { AcceptForm } from "./accept-form";
import { ViewedBeacon } from "./viewed-beacon";
import { ProposalPreview } from "@/components/organizer/proposal-forms";
import type { LineItem, OptionItem, ProposalPackage, ProposalPresentation } from "@/lib/actions/proposals";
import { money, dateShort } from "@/lib/format";

export const metadata: Metadata = { title: "Proposal · Gala Dock", robots: { index: false, follow: false }, referrer: "no-referrer" };
type Snap = { number: string; title: string; client_name: string; status: string; version: number; valid_until: string | null; subtotal: number; tax: number; total: number; deposit_pct: number; workspace: string;
  accepted: { name: string; package?: { name: string } | null; total?: number } | null;
  content: { summary?: string; date?: string; venue?: string; location?: string; attendance?: string; line_items?: LineItem[]; options?: OptionItem[]; packages?: ProposalPackage[]; terms?: Record<string, string>; tax_rate?: number; presentation?: Partial<ProposalPresentation> } | null };
const DEFAULT_PRES: ProposalPresentation = { template: "modern", color: "#2563EB", cover: "", headline: "", sections: ["overview", "items", "options", "terms", "next_steps"] };

/** Client-facing proposal: renders the immutable issued snapshot only, in the organiser's chosen presentation (content.presentation). */
export default async function PublicProposal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; if (!/^[0-9a-f]{36}$/.test(token)) notFound();
  if (!(await tokenPageAllowed("proposal", await headers()))) throw new Error("Too many requests. Please try again shortly.");
  const sb = await createClient();
  const { data } = await sb.rpc("proposal_by_token", { p_token: token }); const p = data as Snap | null;
  if (!p) notFound();
  // Q16: no status change on render (link-preview bots fetch this URL); <ViewedBeacon> reports a real view after load.
  const c = p.content ?? {};
  const pres: ProposalPresentation = { ...DEFAULT_PRES, ...(c.presentation ?? {}) };
  const packages = (c.packages ?? []).filter(x => x && x.key && x.name);
  const taxRate = Number(c.tax_rate ?? 20);
  const expired = p.status === "expired" || (!!p.valid_until && p.valid_until < new Date().toISOString().slice(0, 10));
  const date = c.date ? dateShort(c.date.length > 10 ? c.date : `${c.date}T12:00:00Z`) : "";
  return <div className="k-root" style={{ padding: "32px 16px", minHeight: "100dvh" }}><main style={{ maxWidth: 860, margin: "0 auto" }} className="k-col">{p.status === "sent" && <ViewedBeacon token={token} />}
    <div className="k-between"><span className="k-small k-muted">Prepared for {p.client_name}</span><span className="k-small k-muted">{p.number} · v{p.version}</span></div>
    <ProposalPreview v={pres} p={{ workspace: p.workspace, number: p.number, title: p.title, client: p.client_name, date, place: c.venue || c.location || "", attendance: c.attendance ? `${c.attendance} guests` : "", summary: c.summary ?? "", items: c.line_items ?? [], options: c.options ?? [], total: Number(p.total), deposit: p.deposit_pct, terms: c.terms ?? {} }} />
    {packages.length > 0 && <section className="k-card" style={{ padding: 24 }} aria-label="Packages">
      <h2 style={{ fontSize: 17, marginBottom: 4 }}>Choose a package</h2><p className="k-small" style={{ marginBottom: 12 }}>Each package is added to the items above. Package prices exclude VAT ({taxRate}%).</p>
      <div className="k-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>{packages.map(x => <article key={x.key} className="k-card" style={{ padding: 16, borderColor: x.recommended ? pres.color : undefined }}>
        <div className="k-between"><b>{x.name}</b>{x.recommended && <span className="k-chip blue">Recommended</span>}</div>
        <div style={{ fontSize: 22, fontWeight: 700, margin: "6px 0" }}>{money(x.price, "GBP", { decimals: true })}</div>
        <p className="k-xs k-muted">Total with items: {money((Number(p.subtotal) + Number(x.price)) * (1 + taxRate / 100), "GBP", { decimals: true })} inc. VAT</p>
        {x.description && <p className="k-small" style={{ marginTop: 6 }}>{x.description}</p>}
        {x.items.length > 0 && <ul className="k-small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>{x.items.map(i => <li key={i}>{i}</li>)}</ul>}
      </article>)}</div>
    </section>}
    <section className="k-card" style={{ padding: 24 }}>
      {p.status === "accepted" || p.status === "converted" ? <div className="k-notice green"><b>Accepted{p.accepted?.name ? ` by ${p.accepted.name}` : ""}{p.accepted?.package?.name ? ` — ${p.accepted.package.name}` : ""}.</b> Thank you.</div>
        : expired ? <div className="k-notice amber">This proposal has expired. Please contact {p.workspace} for an updated version.</div>
        : <><h2 style={{ fontSize: 17, marginBottom: 4 }}>Accept this proposal</h2><p className="k-small" style={{ marginBottom: 12 }}>Valid until {p.valid_until ? dateShort(`${p.valid_until}T12:00:00Z`) : "—"}. Your name, email, the version and the time of acceptance are recorded.</p><AcceptForm token={token} version={p.version} packages={packages.map(x => ({ key: x.key, name: x.name, recommended: x.recommended }))} /></>}
    </section>
  </main></div>;
}
