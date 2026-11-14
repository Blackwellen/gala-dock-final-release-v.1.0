"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, useAction } from "@/components/kit/client";
import { approvePromoterSales, createPromoterPayout, invitePromoterLogin, promoterPayoutAction } from "@/lib/actions/promotion";

const gbp = (n: number) => `£${n.toFixed(2)}`;

export function InvitePromoter({ promoterId, email }: { promoterId: string; email: string }) {
  const [v, setV] = useState(email); const { run, pending } = useAction();
  return <form className="k-row" style={{ gap: 8, flexWrap: "wrap" }} onSubmit={async e => { e.preventDefault(); await run(() => invitePromoterLogin(promoterId, v)); }}>
    <label className="k-field k-grow"><span>Promoter’s email</span><input className="k-input" type="email" required maxLength={254} value={v} onChange={e => setV(e.target.value)} /></label>
    <button className="k-btn primary sm" disabled={pending} style={{ alignSelf: "flex-end" }}>{pending && <Loader2 size={14} className="k-spin" />}Send login invitation</button>
    <small className="k-small" style={{ flexBasis: "100%" }}>The link works for 14 days, only for this email. Accepting links their portal to this promoter.</small>
  </form>;
}

export function ApproveSales({ promoterId, sales }: { promoterId: string; sales: { id: string; label: string; commission: number }[] }) {
  const [sel, setSel] = useState<string[]>([]); const { run, pending } = useAction();
  const total = sales.filter(s => sel.includes(s.id)).reduce((a, s) => a + s.commission, 0);
  return <div className="pr-approve">
    <ul className="pr-approve-list">{sales.map(s => <li key={s.id}><label><input type="checkbox" checked={sel.includes(s.id)} onChange={e => setSel(x => e.target.checked ? [...x, s.id] : x.filter(i => i !== s.id))} /> {s.label} · commission {gbp(s.commission)}</label></li>)}</ul>
    <div className="k-row" style={{ gap: 8 }}>
      <button className="k-btn primary sm" disabled={pending || !sel.length} onClick={async () => { const r = await run(() => approvePromoterSales(promoterId, sel)); if (r.ok) setSel([]); }}>Approve selected{sel.length ? ` (${gbp(total)})` : ""}</button>
      <button className="k-btn outline sm" disabled={pending} onClick={() => run(() => approvePromoterSales(promoterId, null))}>Approve all {sales.length}</button>
    </div>
  </div>;
}

export function CreatePayoutRun({ promoterId, disabled }: { promoterId: string; disabled: boolean }) {
  const [note, setNote] = useState(""); const { run, pending } = useAction();
  return <form className="k-row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }} onSubmit={async e => { e.preventDefault(); const r = await run(() => createPromoterPayout(promoterId, note)); if (r.ok) setNote(""); }}>
    <input className="k-input k-grow" placeholder="Note (optional, e.g. October run)" maxLength={120} value={note} onChange={e => setNote(e.target.value)} aria-label="Payout run note" />
    <button className="k-btn primary sm" disabled={pending || disabled} title={disabled ? "Approve sales first" : undefined}>{pending && <Loader2 size={14} className="k-spin" />}Create payout run</button>
  </form>;
}

export function PayoutActions({ payoutId, promoterId, status, amount }: { payoutId: string; promoterId: string; status: string; amount: number }) {
  const [open, setOpen] = useState<"" | "paid" | "fail">(""); const [ref, setRef] = useState(""); const [method, setMethod] = useState("bank_transfer"); const { run, pending } = useAction();
  const act = (action: "approve" | "mark_paid" | "fail") => run(() => promoterPayoutAction({ payout: payoutId, promoter: promoterId, action, reference: ref || undefined, method: action === "mark_paid" ? method : undefined }));
  return <span className="k-row" style={{ gap: 6 }}>
    {status === "held" && <button className="k-btn outline sm" disabled={pending} onClick={() => act("approve")}>Approve</button>}
    {status === "payable" && <button className="k-btn primary sm" disabled={pending} onClick={() => { setRef(""); setOpen("paid"); }}>Mark paid</button>}
    <button className="k-btn ghost sm" disabled={pending} onClick={() => { setRef(""); setOpen("fail"); }}>Mark failed</button>
    <Dialog open={!!open} onClose={() => setOpen("")} title={open === "paid" ? `Mark ${gbp(amount)} paid` : "Mark payout failed"}
      sub={open === "paid" ? "Record how you paid the promoter. Gala Dock doesn’t move this money." : "Its sales go back to approved, ready for the next run."}>
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await act(open === "paid" ? "mark_paid" : "fail"); if (r.ok) setOpen(""); }}>
        {open === "paid" && <label className="k-field"><span>How you paid</span><select className="k-input" value={method} onChange={e => setMethod(e.target.value)}>
          <option value="bank_transfer">Bank transfer</option><option value="paypal">PayPal</option><option value="cash">Cash</option><option value="other">Other</option></select></label>}
        <label className="k-field"><span>{open === "paid" ? "Payment reference" : "What went wrong"}</span><input className="k-input" required minLength={3} maxLength={120} value={ref} onChange={e => setRef(e.target.value)} /></label>
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen("")}>Cancel</button>
          <button className={`k-btn ${open === "paid" ? "primary" : "danger"}`} disabled={pending}>{pending && <Loader2 size={14} className="k-spin" />}{open === "paid" ? "Mark paid" : "Mark failed"}</button></div>
      </form>
    </Dialog>
  </span>;
}
