"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Lock, Plus, MoreHorizontal, CalendarCheck, Ticket, MessageSquare, Megaphone, FileText, Clock4, KeyRound, Download, Trash2, Copy, Loader2, Check, Eye, EyeOff, CreditCard } from "lucide-react";
import { Dialog, Menu, Toggle, useAction, useKitToast } from "@/components/kit/client";
import { saveProfile, saveNotifications, changePassword, accountDeletion, calendarFeed, startAddCard, setDefaultCard, removeCard } from "@/lib/actions/account";
import { passwordChecks, passwordStrength } from "@/lib/password";
import { createClient } from "@/lib/supabase/client";
import type { SavedCard } from "@/lib/payments";
import { BrandLogo } from "@/components/kit/brand-logo";

/** Small inline flag (emoji flags don't render on Windows). */
function Flag({ cc }: { cc: string }) {
  if (cc === "GB") return <svg className="ac-flag" width="20" height="14" viewBox="0 0 60 42" aria-hidden><rect width="60" height="42" fill="#012169" /><path d="M0 0l60 42M60 0L0 42" stroke="#fff" strokeWidth="8" /><path d="M0 0l60 42M60 0L0 42" stroke="#C8102E" strokeWidth="4" /><path d="M30 0v42M0 21h60" stroke="#fff" strokeWidth="12" /><path d="M30 0v42M0 21h60" stroke="#C8102E" strokeWidth="7" /></svg>;
  return <span className="ac-flag-cc">{cc}</span>;
}

export function AvatarButton({ url, name }: { url: string | null; name: string }) {
  const ref = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [src, setSrc] = useState(url); const toast = useKitToast(); const router = useRouter();
  const up = async (f: File | undefined) => {
    if (!f) return; setBusy(true); const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/account/avatar", { method: "POST", body: fd }).catch(() => null); const j = await r?.json().catch(() => null); setBusy(false);
    if (!r?.ok) { toast(j?.error ?? "Upload failed", "error"); return; } setSrc(j.url); toast("Profile photo updated"); router.refresh();
  };
  return <div className="ac-avatar">{src ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt="" /> : <span>{name.slice(0, 1)}</span>}
    <button className="ac-cam" onClick={() => ref.current?.click()} aria-label="Change profile photo" disabled={busy}>{busy ? <Loader2 size={16} className="k-spin" /> : <Camera size={17} />}</button>
    <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => void up(e.target.files?.[0])} /></div>;
}

type P = { full_name: string; phone: string; country: string; language: string; bio: string; date_of_birth: string };
export function ProfileDetails({ profile, email, verified, countries, langs }: { profile: P; email: string; verified: boolean; countries: Record<string, string>; langs: Record<string, string> }) {
  const [open, setOpen] = useState(false); const [v, setV] = useState(profile); const { run, pending } = useAction(); const [now] = useState(() => Date.now());
  const dob = profile.date_of_birth ? new Date(`${profile.date_of_birth}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "Not set";
  return <section className="ce-card ac-card">
    <div className="k-between" style={{ alignItems: "flex-start" }}><div><h2>Profile details</h2><p className="ac-hint">Keep your personal information up to date.</p></div><button className="k-btn outline ac-edit" onClick={() => { setV(profile); setOpen(true); }}>Edit</button></div>
    <div className="ac-fields">
      <div className="ac-f"><small>Full name</small><b>{profile.full_name}</b></div>
      <div className="ac-f"><small>Email address</small><b className="k-between">{email}{verified && <i className="ac-ver">✓ Verified</i>}</b></div>
      <div className="ac-f"><small>Phone number</small><b>{profile.phone ? <><Flag cc={profile.country} />{profile.phone}</> : <span className="k-muted">Not added</span>}</b></div>
      <div className="ac-f"><small>Date of birth</small><b className="k-between">{dob}<Lock size={15} /></b><em>Only visible when required</em></div>
      <div className="ac-f"><small>Country</small><b><Flag cc={profile.country} />{countries[profile.country] ?? profile.country}</b></div>
      <div className="ac-f"><small>Preferred language</small><b>{langs[profile.language] ?? "English"}</b></div>
      <div className="ac-f wide"><small>Bio (optional)</small><b className="ac-bio">{profile.bio || <span className="k-muted">Tell providers a little about you.</span>}</b><em className="ac-count">{profile.bio.length}/250</em></div>
    </div>
    <Dialog open={open} onClose={() => setOpen(false)} title="Edit profile details" wide>
      <form className="ac-form" onSubmit={async e => { e.preventDefault(); const r = await run(() => saveProfile(v)); if (r.ok) setOpen(false); }}>
        <label className="k-field"><span>Full name</span><input className="k-input" required minLength={2} maxLength={120} value={v.full_name} onChange={e => setV(p => ({ ...p, full_name: e.target.value }))} autoComplete="name" /></label>
        <label className="k-field"><span>Phone number</span><input className="k-input" type="tel" maxLength={20} value={v.phone} onChange={e => setV(p => ({ ...p, phone: e.target.value }))} autoComplete="tel" placeholder="+44 7700 900000" /></label>
        <label className="k-field"><span>Date of birth</span><input className="k-input" type="date" value={v.date_of_birth} onChange={e => setV(p => ({ ...p, date_of_birth: e.target.value }))} max={new Date(now - 13 * 365.25 * 864e5).toISOString().slice(0, 10)} /></label>
        <label className="k-field"><span>Country</span><select className="k-input" value={v.country} onChange={e => setV(p => ({ ...p, country: e.target.value }))}>{Object.entries(countries).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="k-field"><span>Preferred language</span><select className="k-input" value={v.language} onChange={e => setV(p => ({ ...p, language: e.target.value }))}>{Object.entries(langs).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="k-field wide"><span>Bio (optional)</span><textarea className="k-textarea" maxLength={250} value={v.bio} onChange={e => setV(p => ({ ...p, bio: e.target.value }))} /><small className="k-muted">{v.bio.length}/250</small></label>
        <div className="k-row wide" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending}>{pending && <Loader2 size={15} className="k-spin" />}Save changes</button></div>
      </form>
    </Dialog>
  </section>;
}

declare global { interface Window { Stripe?: (pk: string) => StripeJs } }
type StripeJs = { elements: (o: { clientSecret: string; appearance?: unknown }) => { create: (t: "payment", o?: unknown) => { mount: (el: HTMLElement) => void; destroy: () => void } }; confirmSetup: (o: { elements: unknown; redirect: "if_required"; confirmParams?: unknown }) => Promise<{ error?: { message?: string } }> };
function loadStripe(): Promise<void> { if (window.Stripe) return Promise.resolve(); return new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://js.stripe.com/v3/"; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error("stripe")); document.head.appendChild(s); }); }

function AddCard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null); const [state, setState] = useState<"loading" | "ready" | "saving" | "error">("loading"); const [err, setErr] = useState("");
  const api = useRef<{ stripe: StripeJs; elements: unknown } | null>(null); const toast = useKitToast(); const router = useRouter();
  useEffect(() => {
    if (!open) return; let el: { destroy: () => void } | null = null; let dead = false;
    (async () => {
      await Promise.resolve(); if (dead) return; setState("loading"); setErr("");
      const r = await startAddCard(); if (!r.ok || !r.data) { setState("error"); setErr(r.error ?? "Could not start."); return; }
      try { await loadStripe(); } catch { setState("error"); setErr("Couldn't load the secure card form. Check your connection."); return; }
      if (dead || !host.current || !window.Stripe) return;
      const stripe = window.Stripe(r.data.publishableKey); const elements = stripe.elements({ clientSecret: r.data.clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#2563eb", borderRadius: "8px", fontFamily: "Inter, system-ui, sans-serif" } } });
      const pe = elements.create("payment", { layout: "tabs" }); pe.mount(host.current); el = pe; api.current = { stripe, elements }; setState("ready");
    })();
    return () => { dead = true; el?.destroy(); };
  }, [open]);
  const save = async () => { if (!api.current) return; setState("saving"); const { error } = await api.current.stripe.confirmSetup({ elements: api.current.elements, redirect: "if_required" }); if (error) { setState("ready"); setErr(error.message ?? "Card couldn't be saved."); return; } toast("Card saved"); onClose(); router.refresh(); };
  return <Dialog open={open} onClose={onClose} title="Add a payment method" sub="Card details go straight to Stripe — Gala Dock never sees your full card number.">
    <div ref={host} className="ac-stripe" />{state === "loading" && <p className="k-small"><Loader2 size={14} className="k-spin" /> Loading secure form…</p>}{err && <div className="k-notice red" role="alert">{err}</div>}
    <div className="k-row" style={{ justifyContent: "flex-end", marginTop: 14 }}><button className="k-btn ghost" onClick={onClose}>Cancel</button><button className="k-btn primary" disabled={state !== "ready"} onClick={() => void save()}>{state === "saving" && <Loader2 size={15} className="k-spin" />}Save card</button></div>
  </Dialog>;
}
const BRAND: Record<string, string> = { visa: "VISA", mastercard: "MC", amex: "AMEX", discover: "DISC" };
export function CardsPanel({ cards, compact }: { cards: SavedCard[]; compact?: boolean }) {
  const [add, setAdd] = useState(false); const { run } = useAction();
  return <section className="ce-card ac-card">
    <div className="k-between" style={{ alignItems: "flex-start" }}><div><h2>Payment methods</h2><p className="ac-hint">Securely store your payment methods for faster checkout.</p></div><button className="k-btn primary ac-addpm" onClick={() => setAdd(true)}><Plus size={17} />Add payment method</button></div>
    <ul className="ac-pms">{cards.slice(0, compact ? 4 : 10).map(c => <li key={c.id}><span className={`ac-brand ${c.brand}`}>{c.wallet === "apple_pay" ? "Pay" : BRAND[c.brand] ?? <CreditCard size={18} />}</span><span className="k-grow"><b>{c.wallet === "apple_pay" ? "Apple Pay" : c.wallet === "google_pay" ? "Google Pay" : `${c.brand[0]!.toUpperCase()}${c.brand.slice(1)} ending in ${c.last4}`}</b><small>Expires {c.exp}</small></span>{c.isDefault && <span className="ac-default">Default</span>}
      <Menu label={`Options for card ending ${c.last4}`} width={200} trigger={({ toggle, open, id }) => <button className="k-icon-btn ac-pm-more" onClick={toggle} aria-expanded={open} aria-controls={id} aria-label={`Options for card ending ${c.last4}`}><MoreHorizontal size={17} /></button>}>{close => <>
        {!c.isDefault && <button role="menuitem" className="k-menu-item" onClick={() => { close(); void run(() => setDefaultCard(c.id)); }}><Check size={14} />Make default</button>}
        <button role="menuitem" className="k-menu-item k-red" onClick={() => { close(); if (confirm(`Remove card ending ${c.last4}?`)) void run(() => removeCard(c.id)); }}><Trash2 size={14} />Remove card</button></>}</Menu></li>)}
      {!cards.length && <li className="ac-pm-empty"><CreditCard size={20} /><span>No saved cards yet. Add one for faster bookings and ticket checkout.</span></li>}</ul>
    <AddCard open={add} onClose={() => setAdd(false)} />
  </section>;
}

export function CalendarConnect() {
  const [url, setUrl] = useState<string | null>(null); const [which, setWhich] = useState<string | null>(null); const { run, pending } = useAction(); const toast = useKitToast();
  const open = async (w: string) => { setWhich(w); if (!url) { const r = await run(() => calendarFeed(), { refresh: false }); if (r.ok && r.data) setUrl(`${location.origin}${(r.data as { url: string }).url}`); } };
  const webcal = url?.replace(/^https?:/, "webcal:");
  const go: Record<string, string> = { google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal ?? "")}`, outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url ?? "")}&name=Gala%20Dock`, apple: webcal ?? "" };
  return <><ul className="ac-cals">{([["google", "Google Calendar", "gcal"], ["outlook", "Outlook Calendar", "ocal"], ["apple", "Apple Calendar", "acal"]] as const).map(([k, l]) => <li key={k}><BrandLogo brand={k === "google" ? "google-calendar" : k} size={40} tile /><span className="k-grow"><b>{l}</b><small>Sync your events and bookings</small></span><button className="k-btn outline ac-connect" onClick={() => void open(k)}>Connect</button></li>)}</ul>
    <Dialog open={!!which} onClose={() => setWhich(null)} title={`Subscribe in ${which === "google" ? "Google Calendar" : which === "outlook" ? "Outlook" : "Apple Calendar"}`} sub="Your events and tickets stay in sync automatically. This private link is your key — don't share it.">
      {pending || !url ? <p className="k-small"><Loader2 size={14} className="k-spin" /> Creating your private link…</p> : <div className="k-col" style={{ gap: 10 }}>
        <a className="k-btn primary" href={go[which ?? "google"]} target="_blank" rel="noopener noreferrer">Open {which === "google" ? "Google Calendar" : which === "outlook" ? "Outlook" : "Calendar app"}</a>
        <div className="ac-feed"><code>{url}</code><button className="k-icon-btn" aria-label="Copy calendar link" onClick={async () => { try { await navigator.clipboard.writeText(url); toast("Calendar link copied"); } catch { toast("Couldn't copy", "error"); } }}><Copy size={15} /></button></div>
        <p className="k-xs k-muted">Creating a new link invalidates the old one.</p></div>}
    </Dialog></>;
}

export function IdentityList({ identities }: { identities: { id: string; provider: string; email: string }[] }) {
  const toast = useKitToast(); const router = useRouter(); const [busy, setBusy] = useState<string | null>(null);
  const label: Record<string, string> = { google: "Google", apple: "Apple", email: "Email & password", azure: "Microsoft", facebook: "Facebook" };
  const unlink = async (id: string) => { setBusy(id); const sb = createClient(); const { data } = await sb.auth.getUserIdentities(); const ident = data?.identities.find(i => (i.identity_id ?? i.id) === id); const { error } = ident ? await sb.auth.unlinkIdentity(ident) : { error: new Error("missing") }; setBusy(null); if (error) toast("Couldn't disconnect this account", "error"); else { toast("Account disconnected"); router.refresh(); } };
  return <ul className="ac-ids">{identities.map(i => <li key={i.id}><span className={`ac-idico ${i.provider}`}>{i.provider === "google" ? "G" : i.provider === "apple" ? "" : "@"}</span><span className="k-grow"><b>{label[i.provider] ?? i.provider}</b><small>{i.email}</small></span>{i.provider !== "email" && <button className="k-btn outline ac-connect" disabled={identities.length < 2 || busy === i.id} title={identities.length < 2 ? "Add another sign-in method first" : undefined} onClick={() => void unlink(i.id)}>{busy === i.id ? <Loader2 size={14} className="k-spin" /> : "Disconnect"}</button>}</li>)}</ul>;
}

const ICON: Record<string, typeof Ticket> = { event_updates: CalendarCheck, tickets: Ticket, messages: MessageSquare, marketing: Megaphone, quotes: FileText, reminders: Clock4 };
export function NotificationPrefs({ prefs, rows, editable }: { prefs: Record<string, boolean>; rows: { key: string; title: string; desc: string }[]; editable?: boolean }) {
  const [v, setV] = useState(prefs); const { run } = useAction();
  const flip = (k: string, val: boolean) => { const next = { ...v, [k]: val }; setV(next); void run(() => saveNotifications(next), { refresh: false }); };
  return <section className="ce-card ac-card">
    <div className="k-between" style={{ alignItems: "flex-start" }}><div><h2>Notification preferences</h2><p className="ac-hint">Choose what you want to be notified about.</p></div>{!editable && <Link className="k-btn outline ac-edit" href="/account?tab=notifications">Edit</Link>}</div>
    <ul className="ac-notifs">{rows.map(r => { const I = ICON[r.key] ?? CalendarCheck; return <li key={r.key}><span className="ac-nico"><I size={18} /></span><span className="k-grow"><b>{r.title}</b><small>{r.desc}</small></span><Toggle checked={!!v[r.key]} onChange={val => flip(r.key, val)} label={r.title} /></li>; })}</ul>
  </section>;
}

export function PasswordCard() {
  const [open, setOpen] = useState(false); const [cur, setCur] = useState(""); const [next, setNext] = useState(""); const [show, setShow] = useState(false); const { run, pending } = useAction();
  const s = passwordStrength(next);
  return <section className="ce-card ac-card"><div className="k-between"><div><h2>Password</h2><p className="ac-hint">Use a strong password you don&apos;t use anywhere else.</p></div><button className="k-btn outline" onClick={() => setOpen(true)}><KeyRound size={15} />Change password</button></div>
    <Dialog open={open} onClose={() => setOpen(false)} title="Change password">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => changePassword(cur, next)); if (r.ok) { setOpen(false); setCur(""); setNext(""); } }}>
        <label className="k-field"><span>Current password</span><input className="k-input" type="password" required value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" /></label>
        <label className="k-field"><span>New password</span><span className="k-input-icon right"><input className="k-input" type={show ? "text" : "password"} required value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" /><button type="button" onClick={() => setShow(x => !x)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button></span></label>
        {next && <><div className="ac-meter"><i className={s.level} style={{ width: `${s.percent}%` }} /></div><ul className="ac-pwrules">{passwordChecks(next).map(c => <li key={c.label} className={c.met ? "ok" : ""}><Check size={13} />{c.label}</li>)}</ul></>}
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="k-btn primary" disabled={pending || passwordChecks(next).some(c => !c.met)}>{pending && <Loader2 size={15} className="k-spin" />}Update password</button></div>
      </form>
    </Dialog></section>;
}

export function DeletionCard({ scheduled, inline }: { scheduled: boolean; inline?: boolean }) {
  const [open, setOpen] = useState(false); const [txt, setTxt] = useState(""); const { run, pending } = useAction();
  if (inline) return <button className="k-link" onClick={() => void run(() => accountDeletion(true, ""))}>Cancel deletion</button>;
  return <section className="ce-card ac-card ac-danger"><h2>Delete account</h2><p className="ac-hint">{scheduled ? "Deletion is scheduled. You can cancel any time in the next 30 days." : "Your account and personal data are erased after a 30-day grace period. Bookings with providers and tickets for upcoming events are cancelled under their terms."}</p>
    {scheduled ? <button className="k-btn outline" disabled={pending} onClick={() => void run(() => accountDeletion(true, ""))}>Cancel deletion</button> : <button className="k-btn danger" onClick={() => setOpen(true)}><Trash2 size={15} />Delete account</button>}
    <Dialog open={open} onClose={() => setOpen(false)} title="Delete your account?" sub="Type DELETE to confirm. You'll have 30 days to change your mind.">
      <form className="k-col" style={{ gap: 12 }} onSubmit={async e => { e.preventDefault(); const r = await run(() => accountDeletion(false, txt)); if (r.ok) setOpen(false); }}><input className="k-input" value={txt} onChange={e => setTxt(e.target.value)} aria-label="Type DELETE to confirm" autoComplete="off" />
        <div className="k-row" style={{ justifyContent: "flex-end" }}><button type="button" className="k-btn ghost" onClick={() => setOpen(false)}>Keep my account</button><button className="k-btn danger" disabled={pending || txt.trim().toUpperCase() !== "DELETE"}>Schedule deletion</button></div></form>
    </Dialog></section>;
}

export function QuickActions() {
  return <section className="ac-quick"><b>Quick actions</b><div className="ac-qrow"><Link className="k-btn outline" href="/account?tab=security"><Lock size={15} />Change password</Link><a className="k-btn outline" href="/api/account/export" download><Download size={15} />Download my data</a><Link className="k-btn outline ac-del-btn" href="/account?tab=security#delete"><Trash2 size={15} />Delete account</Link></div></section>;
}
