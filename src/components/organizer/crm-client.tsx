"use client";
import { useState } from "react";
import { Plus, Trash2, Send, PenLine, RotateCcw, Ban, Copy, CheckCircle2, XCircle, Merge, Archive, RefreshCw } from "lucide-react";
import { Dialog, useAction, useKitToast } from "@/components/kit/client";
import { saveClient, saveClientBilling, addClientContact, removeClientContact, mergeClients, setClientStatus } from "@/lib/actions/clients";
import { createContract, saveContractText, setContractParties, sendContract, requestContractApproval, decideContractApproval, signContractInternal, reviseContract, voidContract, renewContract, revokeContractLink } from "@/lib/actions/contracts";

// Minimal Clients / Contracts controls on existing kit primitives (lane B owns design fidelity later).
const val = (f: FormData, k: string) => String(f.get(k) ?? "");

export function NewClientButton() {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  return <>
    <button className="k-btn primary" onClick={() => setOpen(true)}><Plus size={15} />Add client</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Add client" sub="One record per client — leads, proposals, events and contracts link to it.">
      <form className="k-col" style={{ gap: 10 }} onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); const r = await run(() => saveClient(null, { name: val(f, "name"), kind: val(f, "kind"), email: val(f, "email"), phone: val(f, "phone"), source: "manual" })); if (r.ok) setOpen(false); }}>
        <label className="k-field"><span>Name <b>*</b></span><input className="k-input" name="name" required maxLength={160} /></label>
        <label className="k-field"><span>Type</span><select className="k-select" name="kind" defaultValue="company"><option value="company">Company</option><option value="individual">Individual</option></select></label>
        <div className="k-grid k-g2"><label className="k-field"><span>Email</span><input className="k-input" name="email" type="email" /></label><label className="k-field"><span>Phone</span><input className="k-input" name="phone" /></label></div>
        <button className="k-btn primary" disabled={pending}>Create client</button>
      </form>
    </Dialog>
  </>;
}

export function ClientEditor({ c, canBilling }: { c: { id: string; name: string; kind: string; email: string; phone: string; website: string; notes: string; billing_name: string; billing_email: string; billing_address: string; vat_number: string; status: string }; canBilling: boolean }) {
  const { run, pending } = useAction();
  return <div className="k-col" style={{ gap: 14 }}>
    <form className="k-col" style={{ gap: 10 }} onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); await run(() => saveClient(c.id, { name: val(f, "name"), kind: val(f, "kind"), email: val(f, "email"), phone: val(f, "phone"), website: val(f, "website"), notes: val(f, "notes") })); }}>
      <div className="k-grid k-g2"><label className="k-field"><span>Name</span><input className="k-input" name="name" defaultValue={c.name} required /></label><label className="k-field"><span>Type</span><select className="k-select" name="kind" defaultValue={c.kind}><option value="company">Company</option><option value="individual">Individual</option></select></label>
        <label className="k-field"><span>Email</span><input className="k-input" name="email" type="email" defaultValue={c.email} /></label><label className="k-field"><span>Phone</span><input className="k-input" name="phone" defaultValue={c.phone} /></label>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Website</span><input className="k-input" name="website" defaultValue={c.website} /></label>
        <label className="k-field" style={{ gridColumn: "1/-1" }}><span>Notes</span><textarea className="k-textarea" name="notes" defaultValue={c.notes} maxLength={4000} /></label></div>
      <div className="k-row" style={{ gap: 8 }}><button className="k-btn primary" disabled={pending}>Save client</button>
        <button type="button" className="k-btn ghost" disabled={pending} onClick={() => void run(() => setClientStatus(c.id, c.status === "archived" ? "active" : "archived"))}><Archive size={14} />{c.status === "archived" ? "Restore" : "Archive"}</button></div>
    </form>
    <form className="k-col" style={{ gap: 10 }} onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); await run(() => saveClientBilling(c.id, { billing_name: val(f, "billing_name"), billing_email: val(f, "billing_email"), billing_address: val(f, "billing_address"), vat_number: val(f, "vat_number") })); }}>
      <h3 className="ov-h">Billing details</h3>{!canBilling && <p className="k-xs k-muted">Only owners, managers or finance can change billing details.</p>}
      <fieldset disabled={!canBilling} className="k-grid k-g2" style={{ border: 0, padding: 0, margin: 0 }}>
        <label className="k-field"><span>Billing name</span><input className="k-input" name="billing_name" defaultValue={c.billing_name} /></label><label className="k-field"><span>Billing email</span><input className="k-input" name="billing_email" type="email" defaultValue={c.billing_email} /></label>
        <label className="k-field"><span>VAT number</span><input className="k-input" name="vat_number" defaultValue={c.vat_number} /></label><label className="k-field" style={{ gridColumn: "1/-1" }}><span>Billing address</span><textarea className="k-textarea" name="billing_address" defaultValue={c.billing_address} /></label>
      </fieldset>
      {canBilling && <button className="k-btn outline" disabled={pending}>Save billing</button>}
    </form>
  </div>;
}

export function ClientContacts({ clientId, contacts }: { clientId: string; contacts: { id: string; name: string; email: string; phone: string; role: string; is_primary: boolean }[] }) {
  const { run, pending } = useAction();
  return <div className="k-col" style={{ gap: 8 }}>
    <ul className="k-col" style={{ gap: 6, listStyle: "none", padding: 0, margin: 0 }}>{contacts.map(x => <li key={x.id} className="k-between k-small"><span><b>{x.name || x.email}</b>{x.role ? ` · ${x.role}` : ""}{x.email && x.name ? ` · ${x.email}` : ""}{x.is_primary && <span className="k-chip blue" style={{ marginLeft: 6 }}>Primary</span>}</span><button className="k-icon-btn plain" aria-label={`Remove ${x.name || x.email}`} disabled={pending} onClick={() => void run(() => removeClientContact(clientId, x.id))}><Trash2 size={14} /></button></li>)}{!contacts.length && <li className="k-small k-muted">No contacts yet.</li>}</ul>
    <form className="k-row k-wrap" style={{ gap: 6 }} onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); const r = await run(() => addClientContact(clientId, { name: val(f, "name"), email: val(f, "email"), role: val(f, "role"), is_primary: f.get("primary") === "on" })); if (r.ok) form.reset(); }}>
      <input className="k-input" name="name" placeholder="Name" aria-label="Contact name" style={{ width: 150 }} /><input className="k-input" name="email" type="email" placeholder="Email" aria-label="Contact email" style={{ width: 190 }} /><input className="k-input" name="role" placeholder="Role" aria-label="Contact role" style={{ width: 120 }} />
      <label className="k-check"><input type="checkbox" name="primary" /><span>Primary</span></label><button className="k-btn outline sm" disabled={pending}><Plus size={13} />Add contact</button>
    </form>
  </div>;
}

export function MergeClientButton({ keepId, others }: { keepId: string; others: { id: string; name: string }[] }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false); const [pick, setPick] = useState("");
  if (!others.length) return null;
  return <>
    <button className="k-btn ghost" onClick={() => setOpen(true)}><Merge size={14} />Merge duplicate</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="Merge a duplicate into this client" sub="Its leads, proposals, events, invoices and contracts move here. The duplicate is kept as a merged record for the audit trail."
      footer={<><button className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn danger" disabled={!pick || pending} onClick={async () => { const r = await run(() => mergeClients(keepId, pick)); if (r.ok) setOpen(false); }}>Merge</button></>}>
      <select className="k-select" aria-label="Duplicate client" value={pick} onChange={e => setPick(e.target.value)}><option value="">Choose the duplicate…</option>{others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
    </Dialog>
  </>;
}

export function NewContractButton({ clients, proposals, templates }: { clients: { id: string; name: string }[]; proposals: { id: string; number: string; title: string }[]; templates: { id: string; name: string }[] }) {
  const { run, pending } = useAction(); const [open, setOpen] = useState(false);
  return <>
    <button className="k-btn primary" onClick={() => setOpen(true)}><Plus size={15} />New contract</button>
    <Dialog open={open} onClose={() => setOpen(false)} title="New contract" sub="Start from an accepted proposal, a template or blank text. Client and event come from the proposal.">
      <form className="k-col" style={{ gap: 10 }} onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget);
        const parties = val(f, "client_email") ? [{ role: "client", name: val(f, "client_signer") || val(f, "client_email"), email: val(f, "client_email"), signs: true, signing_order: 2 }] : [];
        const r = await run(() => createContract({ title: val(f, "title"), client_id: val(f, "client_id"), proposal_id: val(f, "proposal_id"), template_id: val(f, "template_id"), body: val(f, "body"), expires_at: val(f, "expires_at"), parties })); if (r.ok) setOpen(false); }}>
        <label className="k-field"><span>Title <b>*</b></span><input className="k-input" name="title" required minLength={2} maxLength={160} /></label>
        <div className="k-grid k-g2">
          <label className="k-field"><span>From proposal</span><select className="k-select" name="proposal_id" defaultValue=""><option value="">None</option>{proposals.map(p => <option key={p.id} value={p.id}>{p.number} · {p.title}</option>)}</select></label>
          <label className="k-field"><span>Client</span><select className="k-select" name="client_id" defaultValue=""><option value="">From proposal / none</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="k-field"><span>Template</span><select className="k-select" name="template_id" defaultValue=""><option value="">Blank</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label className="k-field"><span>Sign by</span><input className="k-input" name="expires_at" type="date" /></label>
          <label className="k-field"><span>Client signer name</span><input className="k-input" name="client_signer" /></label><label className="k-field"><span>Client signer email</span><input className="k-input" name="client_email" type="email" /></label>
        </div>
        <label className="k-field"><span>Contract text</span><textarea className="k-textarea" name="body" rows={6} placeholder="Use {{client_name}}, {{event_name}}, {{contract_value}} as variables." /></label>
        <button className="k-btn primary" disabled={pending}>Create draft</button>
      </form>
    </Dialog>
  </>;
}

type Party = { id: string; role: "organizer" | "client" | "other"; name: string; email: string; organisation: string; signs: boolean; signing_order: number; status: string };
export function ContractEditor({ id, body, parties, status }: { id: string; body: string; parties: Party[]; status: string }) {
  const { run, pending } = useAction(); const [rows, setRows] = useState(parties.map(({ role, name, email, organisation, signs, signing_order }) => ({ role, name, email, organisation, signs, signing_order })));
  const draft = status === "draft";
  return <div className="k-col" style={{ gap: 14 }}>
    <form className="k-col" style={{ gap: 8 }} onSubmit={async e => { e.preventDefault(); await run(() => saveContractText(id, val(new FormData(e.currentTarget), "body"))); }}>
      <label className="k-field"><span>Contract text {draft ? "(saving creates a new immutable version)" : "(locked)"}</span><textarea className="k-textarea" name="body" rows={14} defaultValue={body} disabled={!draft} maxLength={100000} /></label>
      {draft && <button className="k-btn outline" disabled={pending}><PenLine size={14} />Save new version</button>}
    </form>
    <div className="k-col" style={{ gap: 6 }}><h3 className="ov-h">Parties</h3>
      {rows.map((r, i) => <div key={i} className="k-row k-wrap" style={{ gap: 6 }}>
        <select className="k-select" aria-label="Role" value={r.role} disabled={!draft} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, role: e.target.value as Party["role"] } : x))} style={{ width: 120 }}><option value="organizer">Organiser</option><option value="client">Client</option><option value="other">Other</option></select>
        <input className="k-input" aria-label="Name" value={r.name} disabled={!draft} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" style={{ width: 160 }} />
        <input className="k-input" aria-label="Email" value={r.email} disabled={!draft} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} placeholder="Email" style={{ width: 200 }} />
        <label className="k-check"><input type="checkbox" checked={r.signs} disabled={!draft} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, signs: e.target.checked } : x))} /><span>Signs</span></label>
        {draft && <button className="k-icon-btn plain" aria-label="Remove party" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
      </div>)}
      {draft && <div className="k-row" style={{ gap: 8 }}><button className="k-btn ghost sm" onClick={() => setRows([...rows, { role: "client", name: "", email: "", organisation: "", signs: true, signing_order: 2 }])}><Plus size={13} />Add party</button><button className="k-btn outline sm" disabled={pending} onClick={() => void run(() => setContractParties(id, rows))}>Save parties</button></div>}
    </div>
  </div>;
}

export function ContractActions({ id, status, shareUrl, organizerParties, approval, canDecide, value, linkRevoked = false }: { id: string; status: string; shareUrl: string | null; linkRevoked?: boolean; organizerParties: { id: string; name: string; status: string }[]; approval: { id: string; status: string; mine: boolean } | null; canDecide: boolean; value: number }) {
  const { run, pending } = useAction(); const toast = useKitToast(); const [dlg, setDlg] = useState<"" | "void" | "sign" | "approval">(""); const [text, setText] = useState(""); const [party, setParty] = useState(organizerParties.find(p => p.status !== "signed")?.id ?? "");
  const close = () => { setDlg(""); setText(""); };
  return <div className="k-col" style={{ gap: 8 }}>
    {status === "draft" && <button className="k-btn primary block" disabled={pending} onClick={() => void run(() => sendContract(id))}><Send size={15} />Send for signature</button>}
    {status === "draft" && !approval?.status.match(/pending/) && <button className="k-btn outline block" disabled={pending} onClick={() => setDlg("approval")}>Request internal approval</button>}
    {approval?.status === "pending" && canDecide && !approval.mine && <div className="k-row" style={{ gap: 6 }}><button className="k-btn green" disabled={pending} onClick={() => void run(() => decideContractApproval(id, approval.id, true, ""))}><CheckCircle2 size={14} />Approve</button><button className="k-btn danger" disabled={pending} onClick={() => void run(() => decideContractApproval(id, approval.id, false, ""))}><XCircle size={14} />Reject</button></div>}
    {status === "sent" && shareUrl && <button className="k-btn outline block" onClick={async () => { try { await navigator.clipboard.writeText(location.origin + shareUrl); toast("Signing link copied"); } catch { toast(location.origin + shareUrl); } }}><Copy size={14} />Copy client signing link</button>}
    {status === "sent" && shareUrl && <button className="k-btn ghost block" disabled={pending} onClick={() => void run(() => revokeContractLink(id))}><Ban size={14} />Revoke signing link</button>}
    {status === "sent" && linkRevoked && <p className="k-xs k-muted" role="status">The signing link was revoked. Revise and send again to issue a new link.</p>}
    {status === "sent" && organizerParties.some(p => p.status !== "signed") && <button className="k-btn outline block" onClick={() => setDlg("sign")}><PenLine size={14} />Sign for the organiser</button>}
    {["sent", "declined", "expired"].includes(status) && <button className="k-btn ghost block" disabled={pending} onClick={() => void run(() => reviseContract(id))}><RotateCcw size={14} />Revise</button>}
    {status === "signed" && <button className="k-btn outline block" disabled={pending} onClick={() => void run(() => renewContract(id))}><RefreshCw size={14} />Renew</button>}
    {!["signed", "void"].includes(status) && <button className="k-btn danger block" onClick={() => setDlg("void")}><Ban size={14} />Void</button>}
    <Dialog open={dlg !== ""} onClose={close} title={dlg === "void" ? "Void this contract?" : dlg === "sign" ? "Sign for the organiser" : "Request approval"} sub={dlg === "sign" ? "Your typed name, the version fingerprint and the time are recorded." : dlg === "approval" ? `Value £${value.toLocaleString("en-GB")}. An owner, manager or finance member decides.` : "Voided contracts can't be signed. The history is kept."}
      footer={<><button className="k-btn ghost" onClick={close}>Cancel</button><button className={`k-btn ${dlg === "void" ? "danger" : "primary"}`} disabled={pending || (dlg !== "approval" && text.trim().length < 2)} onClick={async () => { const r = await run(() => dlg === "void" ? voidContract(id, text) : dlg === "sign" ? signContractInternal(id, party, text) : requestContractApproval(id, text)); if (r.ok) close(); }}>{dlg === "void" ? "Void" : dlg === "sign" ? "Sign" : "Request"}</button></>}>
      {dlg === "sign" && organizerParties.length > 1 && <select className="k-select" aria-label="Party" value={party} onChange={e => setParty(e.target.value)} style={{ marginBottom: 8 }}>{organizerParties.filter(p => p.status !== "signed").map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      <input className="k-input" aria-label={dlg === "sign" ? "Your full name" : "Reason"} placeholder={dlg === "sign" ? "Your full name" : "Reason"} value={text} onChange={e => setText(e.target.value)} />
    </Dialog>
  </div>;
}
