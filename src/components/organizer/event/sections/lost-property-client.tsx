"use client";
import { useState, type ReactNode } from "react";
import { PackageSearch, Plus, Search, CheckCircle2, XCircle, HelpCircle, Hand, Info, Trash2 } from "lucide-react";
import { Card, CardHead, Chip, Empty, Btn, Stat } from "@/components/kit";
import { Dialog, useAction } from "@/components/kit/client";
import { num, dateShort, time } from "@/lib/format";
import { logFoundItem, recordLostReport, claimFoundItem, decideLostPropertyClaim, disposeFoundItem } from "@/lib/actions/composition-ui";

export type FoundRow = { id: string; category: string; description: string; colour: string | null; brand: string | null; location: string | null; storage_location: string | null; found_at: string; dispose_after: string; status: string; disposed_at?: string | null; disposal_method?: string | null };
export type LostRow = { id: string; category: string; description: string; colour: string | null; brand: string | null; location: string | null; lost_from: string | null; lost_to: string | null; status: string; contact_email: string | null; created_at: string; self_reported?: boolean };
export type ClaimRow = { id: string; report_id: string; item_id: string; status: string; score: number | null; features: { colour: number; brand: number; shared_words: number; location: number } | null; evidence: { note?: string }; decided_at: string | null; created_at: string };
export type MatchSet = { model: string; hard_filters: string[]; matches: { item_id: string; description: string; found_at: string; storage_location: string | null; score: number; features: { colour: number; brand: number; shared_words: number; location: number } }[] };

const DISPOSAL: [string, string][] = [["donated", "Donated to charity"], ["recycled", "Recycled"], ["destroyed", "Destroyed (e.g. data-bearing or unsafe)"], ["handed_to_police", "Handed to the police"], ["returned_to_venue", "Returned to the venue"], ["other", "Other"]];
const CATS = ["phone", "wallet", "bag", "keys", "clothing", "jewellery", "documents", "electronics", "other"];
const RST: Record<string, [string, "blue" | "amber" | "green" | "gray" | "red"]> = { submitted: ["Searching", "blue"], matched: ["Possible match", "amber"], verified: ["Ready to collect", "green"], collected: ["Collected", "green"], closed: ["Closed", "gray"], expired: ["Expired", "gray"] };
const FST: Record<string, [string, "blue" | "amber" | "green" | "gray"]> = { logged: ["Logged", "blue"], matched: ["Matched", "amber"], claimed: ["Claimed", "green"], collected: ["Collected", "green"], disposed: ["Disposed", "gray"] };
const CST: Record<string, [string, "blue" | "amber" | "green" | "gray" | "red"]> = { pending: ["Pending check", "blue"], manual_review: ["Manual review", "amber"], verified: ["Verified", "green"], failed: ["Not the owner", "red"], expired: ["Expired", "gray"], collected: ["Collected", "green"] };
const why = (f: { colour: number; brand: number; shared_words: number; location: number }) => [f.colour && "same colour (+2)", f.brand && "same brand (+2)", f.shared_words && `${f.shared_words} shared word${f.shared_words > 1 ? "s" : ""} (+${f.shared_words})`, f.location && "same location (+1)"].filter(Boolean).join(" · ") || "category and time window only";
const local = (iso?: string) => { const d = iso ? new Date(iso) : new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };

export function LostPropertyClient({ eventId, now, found, lost, claims, matches, canWrite }: { eventId: string; now: number; found: FoundRow[]; lost: LostRow[]; claims: ClaimRow[]; matches: Record<string, MatchSet>; canWrite: boolean }) {
  const { run, pending } = useAction();
  const [fd, setFd] = useState<null | { category: string; description: string; colour: string; brand: string; location: string; storage_location: string; found_at: string }>(null);
  const [lr, setLr] = useState<null | { category: string; description: string; colour: string; brand: string; location: string; contact_email: string }>(null);
  const [decide, setDecide] = useState<{ claim: ClaimRow; decision: string; note: string } | null>(null);
  const [claim, setClaim] = useState<{ report: string; item: string; note: string } | null>(null);
  const [dispose, setDispose] = useState<{ item: FoundRow; method: string; reason: string } | null>(null);
  const openClaim = (id: string) => claims.some(c => c.item_id === id && ["pending", "manual_review", "verified"].includes(c.status));
  const disposeBlock = (f: FoundRow) => ["claimed", "collected"].includes(f.status) ? "Claimed or returned items can't be disposed of." : openClaim(f.id) ? "Decide the open claim on this item first."
    : Date.parse(f.dispose_after) > now ? `Held until ${dateShort(f.dispose_after)} (retention period).` : null;
  const [sel, setSel] = useState<string | null>(lost.find(r => ["submitted", "matched", "verified"].includes(r.status))?.id ?? lost[0]?.id ?? null);
  const foundById = new Map(found.map(f => [f.id, f])); const r = lost.find(x => x.id === sel) ?? null; const m = r ? matches[r.id] : null; const rc = claims.filter(c => c.report_id === sel);
  const dueDisposal = found.filter(f => ["logged", "matched"].includes(f.status) && Date.parse(f.dispose_after) < now).length;
  return <div className="oc">
    <div className="oc-kpis">
      <Stat label="Found items" value={num(found.length)} sub={`${found.filter(f => ["logged", "matched"].includes(f.status)).length} waiting for an owner`} />
      <Stat label="Lost reports" value={num(lost.length)} sub={`${lost.filter(x => ["submitted", "matched"].includes(x.status)).length} open`} />
      <Stat label="Ready to collect" value={num(lost.filter(x => x.status === "verified").length)} tone="green" />
      <Stat label="Due for disposal" value={num(dueDisposal)} sub="held past 90 days" tone={dueDisposal ? "amber" : undefined} />
    </div>
    <div className="oc-split">
      <Card><CardHead title="Lost reports" sub="From attendees or logged by your team at the desk.">{canWrite && <Btn size="sm" variant="outline" icon={Plus} onClick={() => setLr({ category: "phone", description: "", colour: "", brand: "", location: "", contact_email: "" })}>Record a report</Btn>}</CardHead>
        {lost.length ? <ul className="oc-list">{lost.map(x => <li key={x.id}><button type="button" aria-pressed={x.id === sel} className={`oc-li ${x.id === sel ? "on" : ""}`} onClick={() => setSel(x.id)}>
          <span className="k-grow"><b>{x.category} · {x.description}</b><small>{dateShort(x.created_at)}{x.colour ? ` · ${x.colour}` : ""}{x.brand ? ` · ${x.brand}` : ""}{x.location ? ` · ${x.location}` : ""}{matches[x.id]?.matches.length ? ` · ${matches[x.id]!.matches.length} candidate(s)` : ""}</small></span>
          <Chip tone={RST[x.status]?.[1]}>{RST[x.status]?.[0] ?? x.status}</Chip></button></li>)}</ul>
          : <Empty icon={Search} title="No lost reports" text="Attendees report lost items from their ticket; your team can also record one here." />}
      </Card>
      {r ? <Card>
        <div className="k-between oc-wrap"><div><h2 className="oc-h">{r.category} · {r.description}</h2><p className="k-small k-muted">Reported {dateShort(r.created_at)}{r.lost_from ? ` · lost between ${dateShort(r.lost_from)} ${time(r.lost_from)} and ${r.lost_to ? time(r.lost_to) : "?"}` : ""}{r.contact_email ? ` · contact ${r.contact_email}` : r.self_reported ? " · reported by a signed-in attendee" : ""}</p></div><Chip lg tone={RST[r.status]?.[1]}>{RST[r.status]?.[0]}</Chip></div>
        {rc.length > 0 && <><h3 className="oc-h3" style={{ marginTop: 10 }}>Claims</h3><ul className="oc-list">{rc.map(c => { const it = foundById.get(c.item_id); return <li key={c.id} className="oc-li static"><span className="k-grow"><b>{it?.description ?? "Found item"}</b>
          <small>Score {c.score ?? 0} · {c.features ? why(c.features) : ""}{c.evidence?.note ? ` · note: ${c.evidence.note}` : ""}</small></span><Chip tone={CST[c.status]?.[1]}>{CST[c.status]?.[0] ?? c.status}</Chip>
          {canWrite && ["pending", "manual_review"].includes(c.status) && <span className="k-row" style={{ gap: 4 }}><Btn size="sm" icon={CheckCircle2} onClick={() => setDecide({ claim: c, decision: "verified", note: "" })}>Verify owner</Btn><Btn size="sm" variant="ghost" icon={XCircle} onClick={() => setDecide({ claim: c, decision: "failed", note: "" })}>Not theirs</Btn>{c.status === "pending" && <Btn size="sm" variant="ghost" icon={HelpCircle} onClick={() => setDecide({ claim: c, decision: "manual_review", note: "" })}>Review</Btn>}</span>}
          {canWrite && c.status === "verified" && <Btn size="sm" icon={Hand} onClick={() => setDecide({ claim: c, decision: "collected", note: "" })}>Hand over</Btn>}</li>; })}</ul></>}
        <h3 className="oc-h3" style={{ marginTop: 12 }}>Possible matches {m && <span className="k-xs k-muted">({m.model}: same event and category, found inside the loss window + 24 h)</span>}</h3>
        {["submitted", "matched"].includes(r.status) ? (m?.matches.length ? <ul className="oc-list">{m.matches.map(x => { const done = rc.some(c => c.item_id === x.item_id); return <li key={x.item_id} className="oc-li static"><span className="k-grow"><b>{x.description}</b>
          <small>Score {x.score} · {why(x.features)} · found {dateShort(x.found_at)} {time(x.found_at)}{x.storage_location ? ` · stored at ${x.storage_location}` : ""}</small></span>
          {canWrite && !done && <Btn size="sm" variant="outline" onClick={() => setClaim({ report: r.id, item: x.item_id, note: "" })}>Open claim</Btn>}{done && <Chip>claim open</Chip>}</li>; })}</ul>
          : <p className="k-small k-muted">No matching found items yet. Matches appear as items are logged.</p>) : <p className="k-small k-muted">This report is {RST[r.status]?.[0].toLowerCase()}.</p>}
      </Card> : <Card><Empty icon={PackageSearch} title="Select a report" text="Its candidate matches and claims appear here." /></Card>}
    </div>
    <Card><CardHead title="Found items log" sub="Held for 90 days, then due for disposal.">{canWrite && <Btn size="sm" icon={Plus} onClick={() => setFd({ category: "phone", description: "", colour: "", brand: "", location: "", storage_location: "", found_at: local() })}>Log found item</Btn>}</CardHead>
      {found.length ? <div className="k-table-wrap"><table className="k-table"><thead><tr><th>Found</th><th>Item</th><th>Where found</th><th>Stored</th><th>Dispose after</th><th>Status</th>{canWrite && <th><span className="k-sr">Actions</span></th>}</tr></thead><tbody>
        {found.map(f => <tr key={f.id}><td>{dateShort(f.found_at)} {time(f.found_at)}</td><td><b>{f.category}</b> · {f.description}{f.colour ? ` · ${f.colour}` : ""}{f.brand ? ` · ${f.brand}` : ""}</td><td>{f.location ?? "—"}</td><td>{f.storage_location ?? "—"}</td>
          <td className={Date.parse(f.dispose_after) < now && ["logged", "matched"].includes(f.status) ? "k-amber" : ""}>{dateShort(f.dispose_after)}</td><td><Chip tone={FST[f.status]?.[1]}>{FST[f.status]?.[0] ?? f.status}</Chip>{f.status === "disposed" && f.disposal_method && <small className="k-muted"> {DISPOSAL.find(d => d[0] === f.disposal_method)?.[1] ?? f.disposal_method}{f.disposed_at ? ` · ${dateShort(f.disposed_at)}` : ""}</small>}</td>
          {canWrite && <td>{["logged", "matched"].includes(f.status) && (() => { const block = disposeBlock(f); return <Btn size="sm" variant="ghost" icon={Trash2} disabled={!!block} title={block ?? undefined} aria-label={block ? `Dispose — ${block}` : undefined} onClick={() => setDispose({ item: f, method: "donated", reason: "" })}>Dispose</Btn>; })()}</td>}</tr>)}</tbody></table></div>
        : <Empty icon={PackageSearch} title="Nothing logged" text="Log items handed in at the venue so they can be matched to reports." action={canWrite ? <Btn size="sm" icon={Plus} onClick={() => setFd({ category: "phone", description: "", colour: "", brand: "", location: "", storage_location: "", found_at: local() })}>Log the first item</Btn> : undefined} />}
      {!canWrite && <p className="k-xs k-muted">Read only — event edit permission is needed to log items and decide claims.</p>}
    </Card>
    <Dialog open={!!fd} onClose={() => setFd(null)} title="Log a found item" footer={<><Btn variant="ghost" onClick={() => setFd(null)}>Cancel</Btn><Btn disabled={pending || !fd || fd.description.trim().length < 3} onClick={async () => { if (!fd) return; const res = await run(() => logFoundItem(eventId, { category: fd.category, description: fd.description, ...(fd.colour ? { colour: fd.colour } : {}), ...(fd.brand ? { brand: fd.brand } : {}), ...(fd.location ? { location: fd.location } : {}), ...(fd.storage_location ? { storage_location: fd.storage_location } : {}), found_at: new Date(fd.found_at).toISOString() })); if (res.ok) setFd(null); }}>Log item</Btn></>}>
      {fd && <ItemFields v={fd} set={v => setFd({ ...fd, ...v })} extra={<><label className="k-field"><span>Stored at</span><input className="k-input" maxLength={120} value={fd.storage_location} onChange={e => setFd({ ...fd, storage_location: e.target.value })} placeholder="e.g. Box 3, info desk" /></label>
        <label className="k-field"><span>Found at</span><input type="datetime-local" className="k-input" value={fd.found_at} onChange={e => setFd({ ...fd, found_at: e.target.value })} /></label></>} />}
    </Dialog>
    <Dialog open={!!lr} onClose={() => setLr(null)} title="Record a lost report" sub="For someone reporting at the desk. Their email is only used to tell them when the item is ready."
      footer={<><Btn variant="ghost" onClick={() => setLr(null)}>Cancel</Btn><Btn disabled={pending || !lr || lr.description.trim().length < 3} onClick={async () => { if (!lr) return; const res = await run(() => recordLostReport(eventId, { category: lr.category, description: lr.description, ...(lr.colour ? { colour: lr.colour } : {}), ...(lr.brand ? { brand: lr.brand } : {}), ...(lr.location ? { location: lr.location } : {}), ...(lr.contact_email ? { contact_email: lr.contact_email.trim().toLowerCase() } : {}) })); if (res.ok) setLr(null); }}>Record report</Btn></>}>
      {lr && <ItemFields v={lr} set={v => setLr({ ...lr, ...v })} extra={<label className="k-field oc-span2"><span>Contact email (optional)</span><input type="email" className="k-input" maxLength={200} value={lr.contact_email} onChange={e => setLr({ ...lr, contact_email: e.target.value })} /></label>} />}
    </Dialog>
    <Dialog open={!!claim} onClose={() => setClaim(null)} title="Open a claim" sub="Links the report to this found item. Verify ownership (for example a lock-screen photo or a distinctive detail) before handing it over."
      footer={<><Btn variant="ghost" onClick={() => setClaim(null)}>Cancel</Btn><Btn disabled={pending} onClick={async () => { if (!claim) return; const res = await run(() => claimFoundItem(eventId, claim.report, claim.item, claim.note)); if (res.ok) setClaim(null); }}>Open claim</Btn></>}>
      {claim && <label className="k-field"><span>Evidence note (optional)</span><input className="k-input" maxLength={500} value={claim.note} onChange={e => setClaim({ ...claim, note: e.target.value })} /></label>}
    </Dialog>
    <Dialog open={!!decide} onClose={() => setDecide(null)} title={decide?.decision === "verified" ? "Verify the owner" : decide?.decision === "failed" ? "Not the owner" : decide?.decision === "collected" ? "Hand the item over" : "Send for manual review"}
      sub={decide?.decision === "verified" ? "Other open claims on this item are closed automatically." : decide?.decision === "collected" ? "Confirm the owner has collected the item." : undefined}
      footer={<><Btn variant="ghost" onClick={() => setDecide(null)}>Cancel</Btn><Btn variant={decide?.decision === "failed" ? "danger" : "primary"} disabled={pending || (!!decide && ["verified", "failed"].includes(decide.decision) && decide.note.trim().length < 3)} onClick={async () => { if (!decide) return; const res = await run(() => decideLostPropertyClaim(eventId, decide.claim.id, decide.decision, decide.note)); if (res.ok) setDecide(null); }}>Confirm</Btn></>}>
      {decide && <label className="k-field"><span>How was ownership checked?{["verified", "failed"].includes(decide.decision) ? " (required)" : " (optional)"}</span><input className="k-input" maxLength={500} value={decide.note} onChange={e => setDecide({ ...decide, note: e.target.value })} /></label>}
    </Dialog>
    <Dialog open={!!dispose} onClose={() => setDispose(null)} title="Dispose of this item?" sub={dispose ? `${dispose.item.category} · ${dispose.item.description}. Its retention period ended ${dateShort(dispose.item.dispose_after)}. This can't be undone and is recorded in the audit log.` : undefined}
      footer={<><Btn variant="ghost" onClick={() => setDispose(null)}>Keep item</Btn><Btn variant="danger" disabled={pending || !dispose || dispose.reason.trim().length < 5} onClick={async () => { if (!dispose) return; const res = await run(() => disposeFoundItem(eventId, dispose.item.id, dispose.method, dispose.reason)); if (res.ok) setDispose(null); }}>Mark as disposed</Btn></>}>
      {dispose && <div className="oc-form">
        <label className="k-field oc-span2"><span>How</span><select className="k-select" value={dispose.method} onChange={e => setDispose({ ...dispose, method: e.target.value })}>{DISPOSAL.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="k-field oc-span2"><span>Reason (at least 5 characters)</span><input className="k-input" maxLength={500} value={dispose.reason} onChange={e => setDispose({ ...dispose, reason: e.target.value })} placeholder="e.g. Unclaimed after 90 days" /></label>
      </div>}
    </Dialog>
    <p className="k-xs k-muted"><Info size={12} aria-hidden /> Attendees only see a status (searching, possible match, ready to collect) — never other items, scores or notes.</p>
  </div>;
}

function ItemFields<T extends { category: string; description: string; colour: string; brand: string; location: string }>({ v, set, extra }: { v: T; set: (p: Partial<T>) => void; extra?: ReactNode }) {
  return <div className="oc-form">
    <label className="k-field"><span>Category</span><select className="k-select" value={v.category} onChange={e => set({ category: e.target.value } as Partial<T>)}>{CATS.map(c => <option key={c}>{c}</option>)}</select></label>
    <label className="k-field"><span>Colour</span><input className="k-input" maxLength={40} value={v.colour} onChange={e => set({ colour: e.target.value } as Partial<T>)} /></label>
    <label className="k-field oc-span2"><span>Description</span><input className="k-input" maxLength={1000} value={v.description} onChange={e => set({ description: e.target.value } as Partial<T>)} placeholder="e.g. Black leather wallet with a gold zip" /></label>
    <label className="k-field"><span>Brand</span><input className="k-input" maxLength={60} value={v.brand} onChange={e => set({ brand: e.target.value } as Partial<T>)} /></label>
    <label className="k-field"><span>Location</span><input className="k-input" maxLength={120} value={v.location} onChange={e => set({ location: e.target.value } as Partial<T>)} placeholder="e.g. Main bar" /></label>
    {extra}
  </div>;
}
