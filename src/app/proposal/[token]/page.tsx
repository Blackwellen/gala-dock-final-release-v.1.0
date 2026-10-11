import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/styles/kit.css";
import { createClient } from "@/lib/supabase/server";
import { AcceptForm } from "./accept-form";
import { money, dateShort } from "@/lib/format";

export const metadata: Metadata = { title: "Proposal · Gala Dock", robots: { index: false, follow: false } };
type Snap = { number: string; title: string; client_name: string; status: string; version: number; valid_until: string | null; subtotal: number; tax: number; total: number; deposit_pct: number; workspace: string; accepted: { name: string } | null; content: { summary?: string; date?: string; venue?: string; line_items?: [string, string, number, number][]; options?: [string, string, number, boolean][]; terms?: Record<string, string> } | null };

/** Client-facing proposal: renders the immutable issued snapshot only. */
export default async function PublicProposal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; if (!/^[0-9a-f]{36}$/.test(token)) notFound();
  const sb = await createClient();
  const { data } = await sb.rpc("proposal_by_token", { p_token: token }); const p = data as Snap | null;
  if (!p) notFound();
  if (p.status === "sent") await sb.rpc("mark_proposal_viewed", { p_token: token });
  const c = p.content ?? {};
  const expired = p.status === "expired" || (!!p.valid_until && p.valid_until < new Date().toISOString().slice(0, 10));
  return <div className="k-root" style={{ padding: "32px 16px", minHeight: "100dvh" }}><main style={{ maxWidth: 860, margin: "0 auto" }} className="k-col">
    <div className="k-between"><b style={{ color: "var(--k-blue)", fontSize: 18 }}>{p.workspace}</b><span className="k-small k-muted">{p.number} · v{p.version}</span></div>
    <section className="k-card" style={{ padding: 28 }}>
      <h1 style={{ fontSize: 28 }}>{p.title}</h1>
      <p className="k-small" style={{ marginTop: 4 }}>Prepared for {p.client_name}{c.date ? ` · ${dateShort(c.date.length > 10 ? c.date : `${c.date}T12:00:00Z`)}` : ""}{c.venue ? ` · ${c.venue}` : ""}</p>
      {c.summary && <p style={{ marginTop: 14, color: "var(--k-ink-2)", lineHeight: 1.6 }}>{c.summary}</p>}
      <table className="k-table" style={{ marginTop: 18 }}><thead><tr><th>Item</th><th>Description</th><th className="num">Total</th></tr></thead>
        <tbody>{(c.line_items ?? []).map((i, k) => <tr key={k}><td>{i[0]}</td><td>{i[1]}</td><td className="num">{money(i[2] * i[3])}</td></tr>)}{(c.options ?? []).filter(o => o[3]).map((o, k) => <tr key={`o${k}`}><td>{o[0]} (option)</td><td>{o[1]}</td><td className="num">{money(o[2])}</td></tr>)}</tbody></table>
      <div className="k-col" style={{ alignItems: "flex-end", gap: 4, marginTop: 12, fontSize: 13 }}><span>Subtotal {money(p.subtotal, "GBP", { decimals: true })}</span><span>VAT {money(p.tax, "GBP", { decimals: true })}</span><b style={{ fontSize: 18 }}>Total {money(p.total, "GBP", { decimals: true })}</b><span className="k-muted">Deposit on acceptance: {p.deposit_pct}% ({money(p.total * p.deposit_pct / 100, "GBP", { decimals: true })})</span></div>
      {c.terms && <div className="k-col k-small" style={{ gap: 4, marginTop: 16 }}>{Object.entries(c.terms).filter(([, v]) => v).map(([k, v]) => <span key={k}><b style={{ textTransform: "capitalize" }}>{k}:</b> {v}</span>)}</div>}
    </section>
    <section className="k-card" style={{ padding: 24 }}>
      {p.status === "accepted" || p.status === "converted" ? <div className="k-notice green"><b>Accepted{p.accepted?.name ? ` by ${p.accepted.name}` : ""}.</b> Thank you.</div>
        : expired ? <div className="k-notice amber">This proposal has expired. Please contact {p.workspace} for an updated version.</div>
        : <><h2 style={{ fontSize: 17, marginBottom: 4 }}>Accept this proposal</h2><p className="k-small" style={{ marginBottom: 12 }}>Valid until {p.valid_until ? dateShort(`${p.valid_until}T12:00:00Z`) : "—"}. Your name, email and the time of acceptance are recorded.</p><AcceptForm token={token} version={p.version} /></>}
    </section>
  </main></div>;
}
