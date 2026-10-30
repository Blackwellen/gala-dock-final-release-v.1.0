"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { CalendarDays, Users, BarChart3, Sparkles, Ticket, MapPin, Check, ArrowRight, ArrowLeft, Upload, ShieldCheck, CreditCard, Mail, Lightbulb, Building2, Store, Layers, Globe, CircleHelp, X, Search, Clock, AlertTriangle, Copy, LockKeyhole, Link2, Loader2, CircleCheck, CircleDashed, FileText, UserRound, CircleDollarSign, Tag, Bell, Scissors, Circle, CircleCheckBig, Info, Music, Utensils, Martini, Palette, Trophy, Briefcase, Heart, Baby, PartyPopper, Ellipsis } from "lucide-react";
import { Button, Logo, IconTile, Photo, CheckList, Modal } from "./ui";
import { TextField, TextArea, SelectField, ChoiceGroup, Toggle } from "./form";
import { assetUrl, hasRegeneratedAsset } from "@/lib/assets";
import { amenities, listingEventTypes, bookingModes, cancellationPolicies, capacityBands, countries, countryByName, currencies, customerInterests, flowSteps, holdDurations, leadTimes, memberRoles, organizerBusinessTypes, organizerEventTypes, responseTimes, ruleIssues, serviceCategories, trustRequirements, validateStep, venueTypes, type Values } from "@/lib/onboarding-schema";

export type Flow = "experience" | "customer" | "organizer" | "provider";
export type OnboardingContext = {
  capabilities?: string[]; categories?: string[]; country?: string; bookingMode?: string; currency?: string;
  payoutStatus?: string; verificationStatus?: string; logoUrl?: string | null; workspaceName?: string;
  listing?: { name: string; kind: string; location: string; description: string; detail: string; photoUrl: string | null; tags?: string[] } | null;
  readiness?: { eligible: boolean; missing: string[] } | null;
  existing?: { id: string; name: string; kind: string }[];
  invites?: { id: string; workspace_name: string; workspace_kind: string; role: string }[];
  payoutsResult?: string | null;
  summary?: { name: string; businessType: string; location: string; currency: string };
};
export type OnboardingProps = {
  flow: Flow; step: number; preview?: boolean; initial: Values; next?: string;
  user: { name: string; initials: string; email: string }; context: OnboardingContext;
};

const stepKey = (flow: Flow, step: number) => flow === "experience" ? "experience" : flowSteps[flow][step - 1].key;
const missingLabels: Record<string, string> = {
  listing_name: "Add a listing name", listing_description: "Write a description of at least 40 characters", listing_location: "Add a location",
  listing_photo: "Upload at least one photo", workspace_setup: "Finish workspace setup", verification: "Business verification by Gala Dock (in review after you submit documents)",
  payouts: "Connect a payout account with Stripe",
};
const payoutLabels: Record<string, [string, string]> = {
  not_connected: ["Not connected", "neutral"], incomplete: ["Setup incomplete", "warning"], pending: ["In review by Stripe", "warning"],
  active: ["Connected", "success"], restricted: ["Restricted — action needed", "danger"], error: ["Couldn’t check status", "danger"],
};

/* ---------- Story panel copy (left column) ---------- */
const story: Record<string, { eyebrow?: string; title: ReactNode; description: string; features: [string, string][] }> = {
  experience: { title: <>Whatever you’re planning, we’ve <em>got you covered.</em></>, description: "Gala Dock connects people, venues and trusted suppliers to make every event extraordinary — from private celebrations to global productions.", features: [["Plan & promote your events", ""], ["Find the right venues and suppliers", ""], ["Sell tickets and manage guests", ""], ["All your event ops in one place", ""]] },
  "customer-1": { eyebrow: "STEP 1 OF 1", title: <>Let’s set up<br /><em>your experience</em></>, description: "A few quick preferences help us show you the most relevant events, venues and experiences. You can always change these later.", features: [["Discover amazing events", "From local experiences to global shows"], ["Find the perfect venues", "Explore unique spaces in your area"], ["Get personalised recommendations", "Based on your interests"]] },
  "organizer-1": { title: <>Create your Organizer <em>workspace</em></>, description: "Set up your professional workspace to plan, promote and manage amazing events at any scale.", features: [["Plan and manage events", "From intimate gatherings to large festivals"], ["Work with venues and suppliers", "Find and book trusted partners"], ["Sell tickets and promote", "Reach more people across multiple channels"], ["Powerful AI assistance", "Get help from the Gala Agent"]] },
  "organizer-2": { title: <>Configure<br />your <em>event<br />operation</em></>, description: "Tell us how you typically run events so we can set the right defaults, tools and recommendations for your workspace.", features: [["Set up your event types", "From private events to large festivals"], ["Configure ticketing and client work", "Public events, private functions or both"], ["Enable multi-venue operations", "Run events across multiple locations"], ["Connect with trusted suppliers", "Access the marketplace from day one"]] },
  "organizer-3": { title: <>Brand, payments<br />and <em>communications</em></>, description: "Set your brand, connect payouts and choose your communication preferences. You can skip optional connections and finish them later.", features: [["Showcase your brand", "Use your logo and colours across your events"], ["Get paid for your events", "Connect payouts and set your defaults"], ["Stay in touch", "Set how guests and clients reach you"], ["All in one place", "Update these settings later in your workspace"]] },
  "organizer-4": { title: <>Build your team<br />and <em>launch</em></>, description: "Invite your team, set your defaults and choose your first event. You can skip this now and do it later.", features: [["Invite collaborators", "Bring your team and set permissions"], ["Set defaults", "Choose notifications for your workspace"], ["Create your first event", "Get started with an event template"], ["Go live", "Start planning, promote and sell tickets"]] },
  "provider-1": { title: <>Set up your <em>Provider workspace</em></>, description: "Showcase your venue, services or both. Reach more event organisers and get booked faster.", features: [["List your venue or services", "Get discovered by event organisers"], ["Manage bookings with ease", "Handle enquiries, quotes and payments"], ["Showcase your availability", "Set your locations, capacity and services"], ["Get AI assistance", "Let the Gala Agent recommend the best setup"]] },
  "provider-2": { title: <>Create your <em>first offer</em></>, description: "Add your first venue or service to start receiving enquiries. You can add more listings, services and details later.", features: [["Showcase what you offer", "Create a venue or service listing"], ["Add photos and key details", "Help organisers understand your offer"], ["Saved as a draft", "Nothing is published until you choose to"], ["Get AI assistance", "Let the Gala Agent help with descriptions"]] },
  "provider-3": { title: <>Set your <em>booking rules</em></>, description: "Choose how you receive enquiries, your response commitment and booking conditions. These defaults seed future listings and can be overridden per listing.", features: [["Control how you receive bookings", "Instant, request or enquiry"], ["Set response commitments", "Build trust with organisers"], ["Manage availability and lead times", "Avoid clashes and set clear expectations"], ["Use holds and standby options", "Secure dates and reduce no-shows"]] },
  "provider-4": { title: <>Complete your<br />setup and <em>go live</em></>, description: "Add your verification documents, connect payouts, invite your team and publish when every requirement is met.", features: [["Build trust with organisers", "Add insurance, licences and credentials"], ["Get paid securely", "Stripe-hosted payout onboarding"], ["Invite your team", "Bring collaborators and set permissions"], ["Preview and publish", "See how your listing will appear"]] },
};
const storyIcons = [CalendarDays, Users, BarChart3, Sparkles, ShieldCheck];
const eventTypeIcons = [Heart, Briefcase, PartyPopper, Users, Martini, Music, Music, Globe, Users, CalendarDays];
const interestIcons = [Music, Utensils, Martini, Palette, Trophy, Briefcase, Heart, Baby, PartyPopper, Ellipsis];

/* ---------- Gala Agent panel: suggestions only, applied explicitly by the user ---------- */
type Suggestion = { field: string; value: string; reason: string };
function useAgent(step: string, context: () => Values, preview?: boolean) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error" | "unavailable">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ summary: string; suggestions: Suggestion[] } | null>(null);
  async function ask() {
    if (preview) { setStatus("error"); setMessage("Preview only — sign in to get Gala Agent suggestions."); return; }
    setStatus("loading"); setMessage("");
    try {
      const response = await fetch("/api/agent/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step, context: context() }) });
      const data = await response.json();
      if (!response.ok) { setStatus(data.unavailable ? "unavailable" : "error"); setMessage(data.error); return; }
      setResult(data); setStatus("done");
    } catch { setStatus("error"); setMessage("The Gala Agent couldn’t be reached. You can keep going without it."); }
  }
  return { status, message, result, ask };
}
function AgentResults({ agent, onApply }: { agent: ReturnType<typeof useAgent>; onApply: (s: Suggestion) => void }) {
  const [applied, setApplied] = useState<number[]>([]);
  const { status, message, result } = agent;
  if (status === "unavailable") return <p className="agent-state warning"><AlertTriangle size={16} aria-hidden="true" />{message}</p>;
  if (status === "error") return <p className="agent-state danger" role="alert"><AlertTriangle size={16} aria-hidden="true" />{message}</p>;
  if (status !== "done" || !result) return null;
  return <div className="agent-results">
    <p>{result.summary}</p>
    {!result.suggestions.length && <small>No changes suggested — your current settings look good.</small>}
    {result.suggestions.map((s, i) => <div className="agent-suggestion" key={`${s.field}-${i}`}>
      <span><b>{s.field.replaceAll("_", " ")}</b><small>{s.value.length > 140 ? `${s.value.slice(0, 140)}…` : s.value}</small><small className="muted">{s.reason}</small></span>
      <Button variant={applied.includes(i) ? "soft" : "outline"} disabled={applied.includes(i)} onClick={() => { onApply(s); setApplied(a => [...a, i]); }}>{applied.includes(i) ? <><Check size={15} aria-hidden="true" />Applied</> : "Apply"}</Button>
    </div>)}
    <small className="muted">Suggestions only change this form. Nothing is saved until you continue.</small>
  </div>;
}
function AgentPanel({ step, context, onApply, preview, heading, text, action = "Suggest settings for me" }: {
  step: string; context: () => Values; onApply: (s: Suggestion) => void; preview?: boolean; heading: string; text: string; action?: string;
}) {
  const agent = useAgent(step, context, preview);
  return <section className="setup-panel agent-panel" aria-live="polite">
    <h3><IconTile icon={Sparkles} />Gala Agent<span className="badge purple">BETA</span></h3>
    <h4>{heading}</h4>
    <p>{text}</p>
    <Button variant="outline" onClick={agent.ask} disabled={agent.status === "loading"}>{agent.status === "loading" ? <><Loader2 size={18} className="spin" aria-hidden="true" />Thinking…</> : <><Sparkles size={18} aria-hidden="true" />{agent.status === "done" ? "Suggest again" : action}{action !== "Suggest settings for me" && agent.status !== "done" && <ArrowRight size={16} aria-hidden="true" />}</>}</Button>
    <AgentResults agent={agent} onApply={onApply} />
  </section>;
}

/* ---------- Upload ---------- */
function UploadBox({ label, purpose, onUploaded, preview, current, compact = false }: { label: string; purpose: "image" | "document"; onUploaded: (file: { path: string; name: string; url: string | null }) => void; preview?: boolean; current?: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <label className={`upload-box ${compact ? "compact" : ""} ${message ? "has-error" : ""}`}>
    {busy ? <Loader2 className="spin" aria-hidden="true" /> : current ? <CircleCheck aria-hidden="true" /> : <Upload aria-hidden="true" />}
    <b>{busy ? "Uploading…" : current || label}</b>
    <small className={message ? "field-error" : ""} role={message ? "alert" : undefined}>{message || `${purpose === "image" ? "PNG, JPG or WebP" : "PDF, JPG or PNG"} (max 10MB)`}</small>
    <input type="file" accept={purpose === "image" ? "image/png,image/jpeg,image/webp" : "application/pdf,image/png,image/jpeg"} aria-label={label} disabled={busy}
      onChange={async e => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (preview) { setMessage("Preview only — sign in to upload."); return; }
        if (file.size > 10 * 1024 * 1024) { setMessage("Choose a file under 10MB."); return; }
        setBusy(true); setMessage("");
        const body = new FormData(); body.set("file", file); body.set("purpose", purpose);
        try {
          const response = await fetch("/api/uploads", { method: "POST", body });
          const data = await response.json();
          if (!response.ok) setMessage(data.error); else onUploaded(data);
        } catch { setMessage("Upload failed. Check your connection and try again."); }
        setBusy(false);
      }} />
  </label>;
}

/* ---------- Team invitations (queued; created only after the workspace is committed) ---------- */
function TeamPanel({ members, onChange, ownerEmail, ownerNote = true, title = "Invite team members" }: { members: { email: string; role: string }[]; onChange: (m: { email: string; role: string }[]) => void; ownerEmail: string; ownerNote?: boolean; title?: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("manager");
  const [error, setError] = useState("");
  function add() {
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return setError("Enter a valid email address.");
    if (value === ownerEmail.toLowerCase()) return setError("You’re already the workspace owner.");
    if (members.some(m => m.email === value)) return setError("This person is already on your list.");
    if (members.length >= 25) return setError("You can invite up to 25 people during setup.");
    onChange([...members, { email: value, role }]); setEmail(""); setError("");
  }
  return <section className="setup-panel">
    <h3>{title} <span className="muted">(optional)</span></h3>
    <p className="muted">Invitations are sent when you finish setup, after your workspace is created. Each person accepts with their own Gala Dock account.</p>
    <div className="invite-form">
      <TextField label="Email address" type="email" value={email} onChange={setEmail} placeholder="colleague@company.com" autoComplete="off" error={error} />
      <SelectField label="Role" value={role} onChange={setRole} options={memberRoles} />
      <Button variant="soft" onClick={add}>Add</Button>
    </div>
    {members.length > 0 && <ul className="team-list">{members.map(m => <li className="team-row" key={m.email}>
      <span className="initial-avatar small" aria-hidden="true">{m.email.slice(0, 1).toUpperCase()}</span>
      <div><b>{m.email.split("@")[0]}</b><small>{m.email}</small></div>
      <span>{memberRoles.find(r => r.value === m.role)?.label}</span><span className="badge">Invite on launch</span>
      <button type="button" onClick={() => onChange(members.filter(x => x.email !== m.email))} aria-label={`Remove ${m.email}`}><X size={16} /></button>
    </li>)}</ul>}
    {ownerNote && <div className="setup-note"><LockKeyhole size={18} aria-hidden="true" /><span>You remain the workspace owner. Invited members can never change ownership.</span></div>}
  </section>;
}

function PayoutPanel({ kind, status, preview, step }: { kind: "organizer" | "provider"; status: string; preview?: boolean; step: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [label, tone] = payoutLabels[status] ?? payoutLabels.not_connected;
  async function connect() {
    if (preview) { setError("Preview only — sign in to connect payouts."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, step }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error); setBusy(false); return; }
      window.location.assign(data.url);
    } catch { setError("Couldn’t reach Stripe. Please try again."); setBusy(false); }
  }
  if (kind === "provider") return <div className="stripe-panel stripe-brand">
    <strong className="stripe-word" aria-label="Stripe">stripe</strong>
    <CheckList items={["Secure and regulated payments", "Automatic payouts to your bank", "Support for multiple currencies", "Full transaction history"]} />
    <div className="stripe-actions"><Button onClick={connect} disabled={busy || status === "active"}>{busy ? "Opening Stripe…" : status === "active" ? "Connected" : status === "not_connected" ? "Connect with Stripe" : "Continue Stripe setup"}</Button>
      <span className={`status-pill ${tone}`}>{label}</span>
      {error && <p className="field-error" role="alert">{error}</p>}</div>
  </div>;
  return <div className="stripe-panel">
    <IconTile icon={CreditCard} />
    <div><b>Payments and payouts</b><p>Stripe hosts payout onboarding, so your bank details never touch Gala Dock. Payment-dependent actions stay blocked until Stripe confirms your account.</p>
      <span className={`status-pill ${tone}`}>{label}</span>
      {error && <p className="field-error" role="alert">{error}</p>}</div>
    <Button onClick={connect} disabled={busy || status === "active"}>{busy ? "Opening Stripe…" : status === "active" ? "Connected" : status === "not_connected" ? "Connect with Stripe" : "Continue Stripe setup"}</Button>
  </div>;
}

/* ---------- Main component ---------- */
export function OnboardingPage({ flow, step, preview = false, initial, next, user, context }: OnboardingProps) {
  const router = useRouter();
  const key = stepKey(flow, step);
  const draftKey = `gd-draft:${flow}:${key}`;
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [names, setNames] = useState<Record<string, string>>({});
  const [logoUrl, setLogoUrl] = useState(context.logoUrl ?? null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [done, setDone] = useState<{ invites: { email: string; role: string; url: string }[]; publish: { eligible?: boolean; published?: boolean; missing?: string[] } | null; next: string } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  // Restore an unsaved draft for this step after a refresh (non-sensitive values only, this browser tab).
  useEffect(() => {
    if (preview || restored.current) return;
    restored.current = true;
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved) setValues(v => ({ ...v, ...JSON.parse(saved) }));
    } catch { /* storage unavailable */ }
  }, [draftKey, preview]);
  useEffect(() => {
    if (preview || !restored.current) return;
    try { sessionStorage.setItem(draftKey, JSON.stringify(values)); } catch { /* storage unavailable */ }
  }, [values, draftKey, preview]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const str = (k: string) => typeof values[k] === "string" ? values[k] as string : values[k] == null ? "" : String(values[k]);
  const arr = (k: string) => Array.isArray(values[k]) ? values[k] as string[] : [];
  const bool = (k: string) => values[k] === true;
  const set = (k: string, v: unknown) => { setValues(prev => ({ ...prev, [k]: v })); setErrors(e => { const { [k]: _, ...rest } = e; void _; return rest; }); };
  const yesNo = (k: string) => ({ value: [bool(k) ? "Yes" : "No"], onChange: (v: string[]) => set(k, v[0] === "Yes") });
  const country = countryByName(str("country") || context.country);

  function applySuggestion(s: Suggestion) {
    const listFields = ["interests", "event_types", "service_categories"];
    set(s.field, listFields.includes(s.field) ? s.value.split(",").map(v => v.trim()).filter(Boolean) : s.value);
  }
  function changeCountry(name: string) {
    const c = countryByName(name);
    // Seed locale defaults from the country; the user can still change each one.
    setValues(v => ({ ...v, country: c.name, timezone: c.timezones[0].value, currency: c.currency, ...(key === "brand" ? { tax_setting: c.tax[0] } : {}) }));
  }

  async function post(action?: "complete" | "publish" | "skip") {
    if (busy) return;
    setError("");
    if (preview) { setError("Preview only — sign in to save your setup."); return; }
    const apiFlow = flow === "experience" ? "customer" : flow;
    if (action !== "skip") {
      const { errors: found } = validateStep(apiFlow, key === "experience" ? "preferences" : key, values, { capabilities: context.capabilities, ownerEmail: user.email });
      if (Object.keys(found).length) { setErrors(found); setError("Please fix the highlighted fields."); return; }
    }
    setBusy(true);
    try {
      const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flow: apiFlow, step: key === "experience" ? "preferences" : key, values, action, next }) });
      const data = await response.json();
      if (response.status === 422) { setErrors(data.errors ?? {}); setError("Please fix the highlighted fields."); return; }
      if (!response.ok) { setError(data.error ?? "Your setup could not be saved."); if (data.next) router.push(data.next); return; }
      try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }
      if (data.complete && (data.invites?.length || data.publish)) { setDone({ invites: data.invites ?? [], publish: data.publish, next: data.next }); return; }
      router.push(data.next ?? "/continue");
      router.refresh();
    } catch {
      setError("You appear to be offline. Your progress on this step is kept in this tab — try again when you’re connected.");
    } finally { setBusy(false); }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const last = flow !== "experience" && flow !== "customer" && step === flowSteps[flow].length;
    void post(last ? "complete" : undefined);
  }
  const agentContext = () => values;

  const s = story[flow === "experience" ? "experience" : `${flow}-${step}`];
  const steps = flow === "organizer" || flow === "provider" ? flowSteps[flow] : null;
  const progress = flow === "experience" ? { current: 1, total: 3 } : steps ? { current: step, total: steps.length } : { current: 1, total: 1 };
  const stepAsset = flow === "organizer" ? ["business", "events", "brand", "team"][step - 1] : flow === "provider" ? ["business", "listing", "rules", "publish"][step - 1] : "";
  const storyAsset = flow === "experience" ? "story-experience" : flow === "customer" ? "story-preferences" : `story-${flow}-${stepAsset}`;
  const pageClass = flow === "experience" ? "experience" : flow === "customer" ? "preferences" : `${flow}-${stepAsset}`;
  const prevHref = flow === "experience" ? null : flow === "customer" || step === 1 ? `/${preview ? "preview/" : ""}onboarding` : `/${preview ? "preview/" : ""}onboarding/${flow}?step=${step - 1}`;
  const buttons: Record<string, string> = {
    preferences: "Complete setup", organisation: "Continue to Operating Model", operating: "Continue to Brand & Payments", brand: "Continue to Team & Launch", team: "Complete Setup & Go to My Workspace",
    business: "Continue to First Offer", offer: "Continue to Booking Rules", rules: "Continue to Trust & Publish", trust: "Finish setup — keep listing as draft",
  };
  const headings: Record<string, ReactNode> = {
    experience: <>Choose <em>your experience</em></>, preferences: <>Your <em>preferences</em></>, organisation: <>Set up your <em>organization</em></>,
    operating: <>How do you <em>run events?</em></>, brand: <>Brand, payments <em>and communications</em></>, team: <>Invite your team and <em>get started</em></>,
    business: <>Tell us about your <em>business</em></>, offer: <>Add your first <em>{arr("capabilities").length === 1 && context.capabilities?.[0] === "service" ? "service" : "venue or service"}</em></>,
    rules: <>Booking rules and <em>response commitment</em></>, trust: <>Trust, team <em>and publish</em></>,
  };
  const subtitles: Record<string, string> = {
    experience: "Tell us what you want to do with Gala Dock. You can always add more access later from your account.",
    preferences: "Tell us a bit about yourself so we can personalise your Gala Dock experience.",
    organisation: "Create a new Organizer workspace for your events. You can invite team members and customise more settings after setup.",
    operating: "Choose the types of events you run and the features you need. This tailors your templates, defaults and recommendations — all events still share one event system.",
    brand: "These settings are used across your events, invoices, ticketing and communications.",
    team: "Add team members, set your defaults and choose your first event. You can always change these settings later.",
    business: "Create your Provider workspace and tell us what you offer. Venues and services live in the same workspace.",
    offer: "Create a listing to showcase what you offer. It’s saved as a private draft until you choose to publish.",
    rules: "Set your default booking behaviour and availability rules. They seed new listings; existing bookings are never changed.",
    trust: "Add verification documents, connect payouts, invite your team and review your listing before going live.",
  };

  const issues = key === "rules" ? ruleIssues(values, context.capabilities ?? []) : [];
  const requirements = key === "trust" ? trustRequirements({ country: context.country, capabilities: context.capabilities ?? [], categories: context.categories ?? [], bookingMode: context.bookingMode }) : [];
  const documents = (values.documents as Record<string, string>) ?? {};

  if (done) return <OnboardingShell {...{ flow, pageClass, storyAsset, s, steps, step, user, preview }}>
    <section className="completion-panel" aria-live="polite">
      <IconTile icon={CircleCheck} color="green" />
      <h2>Your workspace is <em>ready</em></h2>
      <p className="setup-subtitle">{flow === "provider" ? "Your Provider workspace is active." : "Your Organizer workspace is active and you’re the owner."}</p>
      {done.publish && <div className={`setup-panel ${done.publish.published ? "success" : "warning"}`}>
        <h3>{done.publish.published ? "Your listing is live" : "Your listing is saved as a draft"}</h3>
        {!done.publish.published && <><p className="muted">It can be published once these requirements are complete:</p><ul className="readiness-list">{(done.publish.missing ?? []).map(m => <li key={m}><CircleDashed size={16} aria-hidden="true" />{missingLabels[m] ?? m}</li>)}</ul></>}
      </div>}
      {done.invites.length > 0 && <div className="setup-panel">
        <h3>Team invitations created</h3>
        <p className="muted">Email delivery isn’t configured for this environment yet, so share each single-use link directly. Links expire in 7 days and work only for the invited email address.</p>
        {done.invites.map(invite => <div className="invite-link" key={invite.email}><span><b>{invite.email}</b><small>{memberRoles.find(r => r.value === invite.role)?.label}</small></span>
          <input aria-label={`Invitation link for ${invite.email}`} readOnly value={invite.url} /><Button variant="outline" onClick={() => void navigator.clipboard.writeText(invite.url)}><Copy size={16} aria-hidden="true" />Copy</Button></div>)}
      </div>}
      <Button href={done.next} arrow>Go to my workspace</Button>
    </section>
  </OnboardingShell>;

  return <OnboardingShell {...{ flow, pageClass, storyAsset, s, steps, step, user, preview }}>
    <div className="setup-progress-row">
      {flow === "customer" ? <Link href={prevHref ?? "/onboarding"} className="back-link"><ArrowLeft size={15} aria-hidden="true" />Back</Link> : <div><span>Step {progress.current} of {progress.total}</span><div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.current} aria-label="Setup progress"><i style={{ width: `${progress.current / progress.total * 100}%` }} /></div></div>}
      {flow === "experience" ? <Link href="#invites" onClick={e => { e.preventDefault(); document.getElementById("invites")?.scrollIntoView({ behavior: "smooth" }); }}><Mail size={15} aria-hidden="true" /> Have an invite?</Link>
        : flow === "customer" ? <button type="button" className="link-button" onClick={() => post("skip")}>Skip for now <ArrowRight size={15} aria-hidden="true" /></button>
        : <Link href="/discover">Save &amp; exit <ArrowRight size={15} aria-hidden="true" /></Link>}
    </div>

    <div className="setup-columns">
      <form method="post" className="setup-form" onSubmit={submit} aria-busy={busy} noValidate>
        <div className="form-main">
        <h2>{headings[key]}</h2>
        <p className="setup-subtitle">{subtitles[key]}</p>

        {flow === "experience" && <>
          {!!context.existing?.length && <div className="setup-panel existing-workspaces"><h3>Your workspaces</h3>{context.existing.map(w => <div key={w.id} className="team-row"><IconTile icon={w.kind === "provider" ? Store : Building2} /><div><b>{w.name}</b><small>{w.kind === "provider" ? "Provider workspace" : "Organizer workspace"}</small></div><Button variant="outline" href={`/${w.kind}`} arrow>Open</Button></div>)}<p className="muted">The same account can add another experience at any time.</p></div>}
          <div className="experience-grid">{([
            ["Plan an Event", "Find venues, suppliers and sell tickets for your next event.", ["Browse venues and suppliers", "Create and promote your event", "Sell tickets and manage guests", "Free to get started"], "customer", "Continue as a Customer", Users],
            ["Run Events Professionally", "Create an organiser workspace to manage events at scale.", ["Advanced event planning tools", "Team collaboration", "Budgets, proposals and contracts", "Ticketing and promotion", "Access to the Gala Agent"], "organizer", "Continue as an Organizer", Building2],
            ["Sell Venue / Services", "List your venue, services or supplies and get booked.", ["Create listings and manage availability", "Receive and respond to enquiries", "Manage bookings and payments", "Grow your business with less admin", "Access to the Gala Agent"], "provider", "Continue as a Provider", Store],
          ] as const).map(([name, text, items, target, cta, Icon], i) => <section key={name} className={`experience-card ${i === 0 ? "selected" : ""}`}>
            <Photo name={`experience-${i}`} alt="" />{i === 0 && <span className="card-check" aria-hidden="true"><Check size={14} /></span>}<IconTile icon={Icon} /><h3>{name}</h3><p>{text}</p><CheckList items={[...items]} />
            <Button variant={i === 0 ? "primary" : "outline"} href={`${preview ? "/preview" : ""}/onboarding/${target}?step=1${next ? `&next=${encodeURIComponent(next)}` : ""}`} arrow>{cta}</Button>
            {i === 0 && <button type="button" className="skip-business" onClick={() => post("skip")}><Ticket size={22} aria-hidden="true" /><span>Just buying tickets?<br /><u>Skip business setup →</u></span></button>}
          </section>)}</div>
          <div className="invite-callout" id="invites"><IconTile icon={Users} /><div><b>Using an invite?</b><p>{context.invites?.length ? "You have pending invitations for this email address:" : "If you’ve been invited to join a workspace, you can accept the invite instead."}</p>
            {context.invites?.map(invite => <PendingInvite key={invite.id} invite={invite} preview={preview} />)}</div>
            {!context.invites?.length && <Button variant="outline" href="/help"><Mail size={17} aria-hidden="true" />Join with invite</Button>}</div>
          <p className="setup-bottom-help"><Sparkles aria-hidden="true" />Not sure which is right for you? <button type="button" onClick={() => setHelpOpen(true)}>Chat with the Gala Agent <ArrowRight size={15} aria-hidden="true" /></button></p>
          <Modal title="Which experience fits you?" open={helpOpen} onClose={() => setHelpOpen(false)}>
            <ExperienceHelp preview={preview} />
          </Modal>
        </>}

        {key === "preferences" && <>
          <div className="two-columns"><TextField label="Display name" required hintAbove value={str("full_name")} onChange={v => set("full_name", v)} error={errors.full_name} hint="This is how you’ll appear on Gala Dock." autoComplete="name" icon={<UserRound size={18} aria-hidden="true" />} />
            <TextField label="Home area" optional hintAbove value={str("home_area")} onChange={v => set("home_area", v)} hint="Helps us show you local events and venues." autoComplete="address-level2" icon={<MapPin size={18} aria-hidden="true" />} /></div>
          <SelectField label="Default currency" hintAbove value={str("currency")} onChange={v => set("currency", v)} options={currencies} hint="Used for ticket prices and bookings." icon={<CircleDollarSign size={18} aria-hidden="true" />} />
          <div className="setup-group interests-group"><div className="group-heading"><span><h3 id="interests-heading">What are you interested in?</h3><p className="muted">Select as many as you like. We’ll use this to personalise your recommendations.</p></span>
            </div>{/* No Gala Agent on customer preferences (owner decision: no AI in the customer workspace). */}
            <ChoiceGroup legend="What are you interested in?" hideLegend name="interests" items={customerInterests} images={customerInterests.map((_, i) => `interest-${i}`)} icons={interestIcons.map((Icon, i) => <Icon key={i} size={17} aria-hidden="true" />)} multi value={arr("interests")} onChange={v => set("interests", v)} columns={5} /></div>
        </>}

        {key === "organisation" && <section className="setup-panel">
          <h3>Workspace details</h3><p className="muted">This will be the main workspace for your events and team.</p>
          {!!context.existing?.length && <p className="setup-note"><Building2 size={18} aria-hidden="true" /><span>You already own {context.existing.map(w => w.name).join(", ")}. Continuing creates an additional Organizer workspace. <Link href="/organizer">Open existing workspace</Link></span></p>}
          <TextField label="Workspace name" required value={str("name")} onChange={v => set("name", v)} error={errors.name} maxLength={60} hint="This is the name your team will see inside Gala Dock." autoComplete="organization" />
          <TextField label="Legal business name" optional value={str("legal_name")} onChange={v => set("legal_name", v)} />
          <div className="two-columns"><SelectField label="Business type" value={str("business_type")} onChange={v => set("business_type", v)} options={organizerBusinessTypes} icon={<Building2 size={18} aria-hidden="true" />} />
            <TextField label="Website" optional type="url" value={str("website")} onChange={v => set("website", v)} error={errors.website} placeholder="https://" icon={<Link2 size={18} aria-hidden="true" />} autoComplete="url" inputMode="url" /></div>
          <hr /><h3>Location &amp; defaults</h3><p className="muted">These settings help us personalise your workspace and suggest the right tools and suppliers.</p>
          <LocaleFields country={country} values={values} set={set} changeCountry={changeCountry} errors={errors} />
        </section>}

        {key === "operating" && <>
          <ChoiceGroup legend="Event types" question="Select all that apply. At least one, or Mixed / Custom." name="event_types" maxVisible={10} moreLabel="More event types" items={organizerEventTypes} images={organizerEventTypes.map((t, i) => t === "Mixed / Custom" ? "" : `type-${i % 9}`)} icons={eventTypeIcons.map((Icon, i) => <Icon key={i} size={17} aria-hidden="true" />)} multi value={arr("event_types")} onChange={v => set("event_types", v)} error={errors.event_types} columns={5} />
          <div className="setup-option-grid">
            <ChoiceGroup legend="Event access" question="Do you typically run public, private or both?" name="event_access" items={["Public", "Private", "Both"]} descriptions={["(Open to all)", "(By invitation)", "(Choose per event)"]} value={[str("event_access")]} onChange={v => set("event_access", v[0])} />
            <ChoiceGroup legend="Ticketing" question="Do you sell tickets for your events?" name="ticketing" items={["Yes", "No"]} descriptions={["(Use Gala Dock ticketing)", "(Registrations or invite only)"]} {...yesNo("ticketing")} />
            <ChoiceGroup legend="Client work" question="Do you take on client events and manage them?" name="client_work" items={["Yes", "No"]} descriptions={["(Client projects & proposals)", "(Only our own events)"]} {...yesNo("client_work")} />
            <ChoiceGroup legend="Multi-venue operations" question="Do you run events across multiple venues?" name="multi_venue" items={["Yes", "No"]} descriptions={["(Multiple venues/locations)", "(Single venue focus)"]} {...yesNo("multi_venue")} />
            <ChoiceGroup legend="Typical capacity band" question="What is the usual size of your events?" name="capacity" items={capacityBands} value={[str("capacity")]} onChange={v => set("capacity", v[0])} />
            <ChoiceGroup legend="Supplier procurement" question="Where will you source suppliers by default?" name="procurement" items={[{ value: "Marketplace suppliers", label: "Marketplace" }, { value: "My own suppliers", label: "My own" }, { value: "Both", label: "Both" }]} descriptions={["(Gala Dock suppliers)", "(We use our own)", "(Mix of both)"]} value={[str("procurement")]} onChange={v => set("procurement", v[0])} />
          </div>
        </>}

        {key === "brand" && <section className="setup-panel">
          <h3>Branding</h3><p className="muted">This will appear on your events, tickets, invoices and guest communications.</p>
          <div className="brand-grid">
            <div><h4>Logo</h4><UploadBox label="Upload logo" purpose="image" preview={preview} current={names.logo} onUploaded={f => { set("logo", f.path); setNames(n => ({ ...n, logo: f.name })); setLogoUrl(f.url); }} /></div>
            <div><h4 id="brand-color-label">Brand colour</h4><div className="color-options" role="radiogroup" aria-labelledby="brand-color-label">{["#2563EB", "#8B5CF6", "#D946EF", "#F43F5E", "#F59E0B", "#22C55E", "#0891B2"].map(c =>
              <button type="button" role="radio" aria-checked={str("brand_color").toUpperCase() === c} key={c} style={{ background: c }} className={str("brand_color").toUpperCase() === c ? "selected" : ""} onClick={() => set("brand_color", c)} aria-label={`Brand colour ${c}`}>{str("brand_color").toUpperCase() === c && <Check aria-hidden="true" />}</button>)}</div>
              <input aria-label="Custom brand colour (hex)" value={str("brand_color")} onChange={e => set("brand_color", e.target.value)} maxLength={7} /></div>
            <div className="brand-preview" style={{ "--brand": /^#[0-9a-f]{6}$/i.test(str("brand_color")) ? str("brand_color") : "#2563EB" } as CSSProperties} aria-label="Brand preview">
              {logoUrl ? <img src={logoUrl} alt="" className="brand-logo" /> : <Logo small />}<Photo name="dash-0" /><b>{context.workspaceName ?? "Your Event Title"}</b><small>Your next event<br />{country.name}</small><span className="brand-button">Book Tickets</span></div>
          </div>
          <hr /><h3>Contact &amp; organisation details</h3>
          <div className="two-columns"><TextField label="Support email" required type="email" value={str("support_email")} onChange={v => set("support_email", v)} error={errors.support_email} autoComplete="email" inputMode="email" />
            <TextField label="Invoice prefix" required value={str("invoice_prefix")} onChange={v => set("invoice_prefix", v.toUpperCase())} error={errors.invoice_prefix} maxLength={8} hint="e.g. INV-0001" /></div>
          <hr /><h3>Financial defaults</h3>
          <div className="two-columns"><SelectField label={`Default tax setting (${country.name})`} value={str("tax_setting")} onChange={v => set("tax_setting", v)} options={country.tax} hint="Tax options follow your workspace country. Confirm with your accountant." />
            <SelectField label="Payment terms" value={str("payment_terms")} onChange={v => set("payment_terms", v)} options={["Due on receipt", "7 days", "14 days", "30 days"]} /></div>
          <p className="muted">Default currency: <b>{context.currency}</b> (set in step 1)</p>
          <PayoutPanel kind="organizer" status={context.payoutStatus ?? "not_connected"} preview={preview} step={3} />
          <div className="integration-row unavailable"><IconTile icon={Mail} /><span><b>Connected email</b><small>Connecting your own Gmail or Outlook mailbox isn’t available yet. Guest and client emails are sent by Gala Dock on your behalf.</small></span><span className="status-pill neutral">Not available</span></div>
        </section>}

        {key === "team" && <>
          <TeamPanel members={(values.members as { email: string; role: string }[]) ?? []} onChange={m => set("members", m)} ownerEmail={user.email} ownerNote={false} />
          <section className="setup-panel"><h3>Default event owner</h3>
            <div className="two-columns"><SelectField label="Default owner on new events" value="owner" onChange={() => undefined} options={[{ value: "owner", label: `${user.name || user.email} (you)` }]} hint="Team members can be chosen after they accept their invitation." />
              <div className="setup-note"><LockKeyhole size={20} aria-hidden="true" />You will remain the workspace owner and cannot be removed.</div></div>
            <hr /><fieldset className="notification-grid"><legend>Notifications</legend>{([["enquiries", "New enquiries", "Event enquiries and leads", Mail], ["payments", "Bookings & payments", "Tickets and client payments", CreditCard], ["team", "Team activity", "Invites, updates and changes", Users]] as const).map(([value, label, hint, Icon]) =>
              <label key={value}><IconTile icon={Icon} /><span><b>{label}</b><small>{hint}</small></span><input type="checkbox" role="switch" checked={arr("notifications").includes(value)} onChange={e => set("notifications", e.target.checked ? [...arr("notifications"), value] : arr("notifications").filter(n => n !== value))} /></label>)}</fieldset></section>
          <section className="setup-panel"><h3>Create your first event <span className="muted">(optional)</span></h3><p className="muted">Pick a template to start from in your workspace. Nothing is created until you choose to.</p>
            <ChoiceGroup legend="First event template" hideLegend name="first_event_template" items={["Wedding", "Corporate Event", "Festival / Concert", "Private Party"]} descriptions={["Start with a template", "Start with a template", "Start with a template", "Start with a template"]} images={["type-0", "type-1", "type-2", "type-4"]} value={[str("first_event_template")]} onChange={v => set("first_event_template", v[0] === str("first_event_template") ? "" : v[0])} columns={4} /></section>
        </>}

        {key === "business" && <section className="setup-panel">
          <h3>Business details</h3><p className="muted">This information is shown to event organisers on Gala Dock.</p>
          {!!context.existing?.length && <p className="setup-note"><Store size={18} aria-hidden="true" /><span>You already own {context.existing.map(w => w.name).join(", ")}. Venues and services can both live in that workspace — <Link href="/provider">open it</Link> instead of creating another.</span></p>}
          <div className="two-columns"><TextField label="Business display name" required value={str("name")} onChange={v => set("name", v)} error={errors.name} maxLength={80} autoComplete="organization" />
            <TextField label="Legal business name" optional value={str("legal_name")} onChange={v => set("legal_name", v)} /></div>
          <LocaleFields country={country} values={values} set={set} changeCountry={changeCountry} errors={errors} />
          <hr /><ChoiceGroup legend="What do you offer?" name="capabilities" items={[{ value: "venue", label: "Venues" }, { value: "service", label: "Services" }, { value: "both", label: "Both" }]}
            value={arr("capabilities").length === 2 ? ["both"] : arr("capabilities")} onChange={v => set("capabilities", v[0] === "both" ? ["venue", "service"] : v)}
            descriptions={["Event spaces, halls, unique locations", "Catering, photography, DJs, décor, staffing", "One workspace, team, calendar and payouts for both"]} icons={[<IconTile key="v" icon={Building2} />, <IconTile key="s" icon={Store} />, <IconTile key="b" icon={Layers} />]} error={errors.capabilities} />
          {arr("capabilities").includes("service") && <ChoiceGroup legend="Service categories" name="service_categories" maxVisible={10} moreLabel="More categories" items={serviceCategories} multi value={arr("service_categories")} onChange={v => set("service_categories", v)} error={errors.service_categories} />}
          <div className="two-columns"><TextField label="Primary location" required value={str("location")} onChange={v => set("location", v)} error={errors.location} icon={<MapPin size={18} aria-hidden="true" />} autoComplete="address-level2" />
            <SelectField label="Travel / coverage area" value={str("coverage")} onChange={v => set("coverage", v)} options={["Venue location only", "Within 25 miles", "Within 50 miles", "Within 100 miles", "Nationwide", "International"]} /></div>
        </section>}

        {key === "offer" && <>
          {(context.capabilities?.length ?? 0) > 1 && <section className="setup-panel"><ChoiceGroup legend="What would you like to add first?" name="kind" items={[{ value: "venue", label: "Venue" }, { value: "service", label: "Service" }, { value: "both", label: "Both" }]} descriptions={["Event spaces, halls, unique locations", "Catering, photography, DJs, decor, staffing etc.", "Start with your venue, add services next"]} icons={[<Building2 key="v" size={24} aria-hidden="true" />, <Scissors key="s" size={24} aria-hidden="true" />, <Layers key="b" size={24} aria-hidden="true" />]}
            value={[bool("add_services_next") ? "both" : str("kind")]} onChange={v => { setValues(prev => ({ ...prev, kind: v[0] === "both" ? "venue" : v[0], add_services_next: v[0] === "both" })); }} columns={3} /></section>}
          <section className="setup-panel"><h3>{str("kind") === "service" ? "Service details" : "Venue details"}</h3><p className="muted">Add the key information about your {str("kind") === "service" ? "service" : "venue"}. You can add more details later.</p>
            <div className="two-columns">
              <TextField label={str("kind") === "service" ? "Service name" : "Venue name"} required value={str("listing_name")} onChange={v => set("listing_name", v)} error={errors.listing_name} maxLength={80} />
              {str("kind") === "service" ? <SelectField label="Category" required value={str("category")} onChange={v => set("category", v)} options={serviceCategories} placeholder="Choose a category" error={errors.category} />
                : <SelectField label="Venue type" required value={str("venue_type")} onChange={v => set("venue_type", v)} options={venueTypes} />}
              <TextArea label={str("kind") === "service" ? "Description" : "Short description"} required value={str("description")} onChange={v => set("description", v)} error={errors.description} maxLength={500} rows={3} hint={str("description").length < 40 ? `At least 40 characters (${str("description").length}/40)` : undefined} />
              {str("kind") === "service" ? <div className="stack"><TextField label="Subcategory" optional value={str("subcategory")} onChange={v => set("subcategory", v)} placeholder="e.g. Wedding photography" />
                <SelectField label="Indicative pricing" value={str("pricing_mode")} onChange={v => set("pricing_mode", v)} options={["Fixed price", "Per hour", "Per person", "Quote on request"]} /></div>
                : <fieldset className="capacity-fieldset"><legend>Venue capacity</legend><div className="two-columns">
                  <TextField label="Min capacity" optional inputMode="numeric" value={str("min_capacity")} onChange={v => set("min_capacity", v.replace(/\D/g, "").slice(0, 6))} />
                  <TextField label="Max capacity" required inputMode="numeric" value={str("capacity")} onChange={v => set("capacity", v.replace(/\D/g, "").slice(0, 6))} error={errors.capacity} /></div></fieldset>}
              <TextField label="Location" required value={str("location")} onChange={v => set("location", v)} error={errors.location} icon={<MapPin size={18} aria-hidden="true" />} autoComplete="address-level2" />
              {str("kind") === "service" ? <div className="two-columns"><SelectField label="Delivery mode" value={str("delivery_mode")} onChange={v => set("delivery_mode", v)} options={["On-site at the event", "Remote / digital", "Both"]} />
                <SelectField label="Coverage / travel" value={str("coverage")} onChange={v => set("coverage", v)} options={["Within 25 miles", "Within 50 miles", "Within 100 miles", "Nationwide", "International"]} /></div>
                : <TextField label="Address" optional value={str("address")} onChange={v => set("address", v)} autoComplete="street-address" />}
              <ChoiceGroup legend="Event types (select all that apply)" variant="chips" maxVisible={6} moreLabel="More event types" name="event_types" items={listingEventTypes} multi value={arr("event_types")} onChange={v => set("event_types", v)} />
              {str("kind") !== "service" && <ChoiceGroup legend="Key features" variant="chips" maxVisible={5} moreLabel="Add feature" name="amenities" items={amenities} multi value={arr("amenities")} onChange={v => set("amenities", v)} />}
            </div>
            <hr /><h3>Photos</h3><p className="muted">Add high quality photos to showcase {str("kind") === "service" ? "your work" : "the space"}. At least one is required before publishing.</p>
            <div className="photo-upload-row"><UploadBox label="Upload photos" purpose="image" preview={preview} onUploaded={f => { set("photos", [...arr("photos"), f.path]); if (f.url) setPhotoUrls(u => [...u, f.url!]); }} />
              {(preview ? ["sample-listing-1", "sample-listing-2", "sample-listing-3", "sample-listing-4"] : []).map(name => <Photo name={name} key={name} />)}
              {photoUrls.map(url => <img src={url} alt="Uploaded listing photo" key={url} className="photo" />)}
              {!preview && arr("photos").length > photoUrls.length && <span className="photo-count"><FileText size={18} aria-hidden="true" />{arr("photos").length - photoUrls.length} saved photo{arr("photos").length - photoUrls.length === 1 ? "" : "s"}</span>}</div>
          </section>
        </>}

        {key === "rules" && <section className="setup-panel">
          <h3>Booking &amp; enquiry settings</h3><p className="muted">Choose how you want to receive and confirm bookings by default.</p>
          <ChoiceGroup legend="Booking mode" hideLegend name="booking_mode" items={bookingModes} value={[str("booking_mode")]} onChange={v => set("booking_mode", v[0])} descriptions={["Confirm automatically when eligible", "Review each request before accepting", "Receive enquiries, quote separately"]} />
          <hr /><ChoiceGroup legend="Response commitment" name="response_time" items={responseTimes.filter(t => t !== "Up to 24 hours" || context.capabilities?.includes("venue"))} value={[str("response_time")]} onChange={v => set("response_time", v[0])} error={errors.response_time} />
          <p className="muted">{context.capabilities?.includes("venue") ? "Up to 24 hours is available for complex venue requests." : "Choose how quickly you’ll respond to new requests."}</p>
          <hr /><div className="two-columns">
            <SelectField label="Minimum lead time" value={str("lead_time")} onChange={v => set("lead_time", v)} options={leadTimes} error={errors.lead_time} />
            <SelectField label="Cancellation policy (default)" value={str("cancellation_policy")} onChange={v => set("cancellation_policy", v)} options={cancellationPolicies} /></div>
          <hr /><div className="two-columns">
            <Toggle label="Enable conditional holds" description="Hold dates for a limited time while a booking is completed." checked={bool("conditional_holds")} onChange={v => set("conditional_holds", v)} />
            <SelectField label="Hold duration" value={str("hold_duration")} onChange={v => set("hold_duration", v)} options={holdDurations} /></div>
          <hr /><div className="two-columns">
            <Toggle label="Standby availability" description="Let organisers request you as a standby option." checked={bool("standby")} onChange={v => set("standby", v)} />
            <Toggle label="Emergency availability" description="Short-notice requests. Eligibility is confirmed by Gala Dock after verification." checked={bool("emergency")} onChange={v => set("emergency", v)} error={errors.emergency} /></div>
          <hr /><div className="two-columns">
            <fieldset className="checkbox-row"><legend>Response notifications</legend>{([["email", "Email"], ["push", "Push (installed app)"]] as const).map(([value, label]) => <label key={value} className="check-row"><input type="checkbox" checked={arr("response_notifications").includes(value)} onChange={e => set("response_notifications", e.target.checked ? [...arr("response_notifications"), value] : arr("response_notifications").filter(n => n !== value))} /><span>{label}</span></label>)}</fieldset>
            <SelectField label="Payout currency" value={str("payout_currency")} onChange={v => set("payout_currency", v)} options={currencies} /></div>
          <div className="policy-summary"><h4>Booking policy summary</h4><p>{str("booking_mode")} · responds {str("response_time").toLowerCase()} · {str("lead_time").toLowerCase()} notice · {str("cancellation_policy").split(" –")[0]} cancellation{bool("conditional_holds") ? ` · ${str("hold_duration")} holds` : ""}{bool("standby") ? " · standby" : ""}{bool("emergency") ? " · emergency requests (pending eligibility)" : ""}.</p></div>
        </section>}

        {key === "trust" && <>
          <section className="setup-panel" id="trust-documents"><h3>1. Verification and credentials</h3><p className="muted">Add relevant documents to build trust with organisers. Requirements depend on your category and location.</p>
            <div className="three-columns credentials">{requirements.filter(r => r.kind === "document").slice(0, 3).map((r, i) => <div key={r.key} className="credential" title={r.detail}>
              <div className="credential-head"><IconTile icon={[ShieldCheck, Building2, FileText][i % 3]} /><span><b>{r.label}</b><span className={`badge ${r.required ? "required" : "muted"}`}>{r.required ? "Required" : "Recommended"}</span></span></div>
              <UploadBox label="Upload document" purpose="document" preview={preview} compact current={names[r.key] ?? (documents[r.key] ? "Submitted for review" : undefined)} onUploaded={f => { set("documents", { ...documents, [r.key]: f.path }); setNames(n => ({ ...n, [r.key]: f.name })); }} />
            </div>)}</div></section>
          <section className="setup-panel" id="trust-payouts"><h3>2. Payout connection</h3><p className="muted">Connect your bank account through Stripe to receive payments from bookings on Gala Dock.</p><PayoutPanel kind="provider" status={context.payoutStatus ?? "not_connected"} preview={preview} step={4} />
            {context.payoutsResult && <p className="muted" role="status">Stripe status updated: {(payoutLabels[context.payoutsResult] ?? payoutLabels.error)[0]}.</p>}</section>
          <TeamPanel members={(values.members as { email: string; role: string }[]) ?? []} onChange={m => set("members", m)} ownerEmail={user.email} ownerNote={false} title="3. Invite your team" />
        </>}

        </div>
        {flow !== "experience" && <div className="form-wide">
          {key === "preferences" && <fieldset className="notification-grid"><legend>Notifications<small>Choose what you’d like to hear about.</small></legend>{([["recommendations", "Event recommendations", "New events in your area", Mail], ["offers", "Special offers", "Exclusive deals and early access", Tag], ["updates", "Important updates", "Bookings, tickets and account", Bell]] as const).map(([value, label, hint, Icon]) =>
            <label key={value}><IconTile icon={Icon} /><span><b>{label}</b><small>{hint}</small></span><input type="checkbox" checked={arr("notifications").includes(value)} onChange={e => set("notifications", e.target.checked ? [...arr("notifications"), value] : arr("notifications").filter(n => n !== value))} /></label>)}</fieldset>}
          <div ref={errorRef} tabIndex={-1} className="form-error" role="alert" hidden={!error}>{error}</div>
          <div className="setup-actions">
            {prevHref && flow !== "customer" && <Button variant="outline" href={prevHref}><ArrowLeft size={16} aria-hidden="true" />Back</Button>}
            {key === "trust" && <Button variant="outline" type="button" disabled={busy || !context.readiness?.eligible} onClick={() => post("publish")} title={context.readiness?.eligible ? undefined : "Complete the readiness checklist to publish"}>Publish listing</Button>}
            <Button type="submit" disabled={!hydrated || busy} arrow>{busy ? "Saving…" : buttons[key]}</Button>
          </div>
          {key === "preferences" && <p className="setup-disclaimer">You can update these preferences at any time in your account settings.</p>}
        </div>}
      </form>

      {flow !== "experience" && <aside className="setup-assistant" aria-label="Setup help">
        {key === "rules" && <section className="setup-panel setup-checks" aria-live="polite"><h3><IconTile icon={ShieldCheck} />Setup checks</h3>
          {!issues.length ? <p className="agent-state success"><Check size={16} aria-hidden="true" />No conflicts found in these rules.</p> : issues.map(issue => <div key={issue.message} className={`agent-state ${issue.severity === "error" ? "danger" : "warning"}`}>
            <AlertTriangle size={16} aria-hidden="true" /><span>{issue.message}{issue.fix && <button type="button" className="link-button" onClick={() => set(issue.fix!.field, issue.fix!.value)}>{issue.fix.label}</button>}</span></div>)}</section>}
        {key === "trust" && (() => {
          const missing = context.readiness?.missing ?? [];
          const docsDone = requirements.filter(r => r.kind === "document" && r.required).every(r => documents[r.key]);
          const items: [string, boolean, string][] = [
            ["Business details completed", true, ""], ["First offer added", !!context.listing && !missing.some(m => m.startsWith("listing_")), ""], ["Booking rules configured", true, ""],
            [`Insurance & licences ${docsDone ? "submitted" : "(required)"}`, docsDone, "trust-documents"], ["Gala Dock verification", context.verificationStatus === "verified", "trust-documents"],
            ["Connect payouts (required)", context.payoutStatus === "active", "trust-payouts"],
            ["Team invited (optional)", ((values.members as unknown[]) ?? []).length > 0, ""], ["Publish listing", !!context.readiness?.eligible, ""],
          ];
          const firstGap = items.find(([, met, target]) => !met && target)?.[2];
          return <section className="setup-panel agent-panel readiness"><h3><IconTile icon={Sparkles} />Gala Agent<span className="badge purple">BETA</span></h3>
            <h4>Your readiness checklist</h4><p>I’ve checked your setup and here’s what’s left to go live. I can help you complete any missing items.</p>
            <ul className="readiness-list">{items.map(([label, met]) => <li key={label} className={met ? "met" : ""}>{met ? <CircleCheckBig className="tick" size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}{label}<span className="sr-only">{met ? " (done)" : " (to do)"}</span></li>)}</ul>
            <Button variant="outline" disabled={!firstGap} onClick={() => firstGap && document.getElementById(firstGap)?.scrollIntoView({ behavior: "smooth", block: "start" })} arrow>{firstGap ? "Help me complete setup" : "All set"}</Button></section>;
        })()}
        {key === "preferences" && <section className="setup-panel why-panel"><h3><IconTile icon={Lightbulb} />Why we ask this</h3><p>Your preferences help us:</p>
          <CheckList items={["Show you relevant events and venues", "Suggest experiences you’ll love", "Alert you to special offers you opt into", "Make ticket booking faster"]} /><hr />
          <h4>Prefer to set this up later?</h4><p>You can skip this step and start exploring now. You’ll always be able to add your preferences in your account settings.</p>
          <Button variant="outline" onClick={() => post("skip")} arrow>Skip for now</Button></section>}
        {key !== "trust" && key !== "preferences" && <AgentPanel step={key} context={agentContext} onApply={applySuggestion} preview={preview}
          heading={key === "offer" ? "I can help you write this listing" : key === "rules" ? "Check my booking rules" : key === "operating" ? "Get a head start" : key === "team" ? "Need help getting started?" : "Need a hand setting up?"}
          text={key === "offer" ? "The Gala Agent can write your venue description and suggest the best event types and category based on the details you’ve entered." : key === "rules" ? "The Gala Agent can explain these policies and suggest safer alternatives when settings conflict." : key === "operating" ? "The Gala Agent can recommend settings based on your event types, including ticketing, risk management and useful tools for your dashboard." : key === "team" ? "I can suggest the best team structure, permissions and even a first event template based on your goals." : "The Gala Agent can suggest the best settings for your location and event type, and even recommend a starting event template."}
          action={key === "operating" ? "Suggest best setup for me" : key === "team" ? "Suggest a first event for me" : key === "offer" ? "Generate description for me" : "Suggest settings for me"} />}
        {(key === "offer" || key === "trust") && context.listing !== undefined && <section className="setup-panel listing-preview"><h3>Listing preview<span className="status-pill warning">Draft</span></h3>
          {context.listing ? <>{context.listing.photoUrl ? <img src={context.listing.photoUrl} alt="" className="photo" /> : <Photo name="venue-2" />}<h4>{context.listing.name}</h4><p><MapPin size={14} aria-hidden="true" />{context.listing.location}</p><div className="tags">{(context.listing.tags ?? [context.listing.kind === "service" ? "Service" : "Venue", context.listing.detail]).map(t => <span key={t}>{t}</span>)}</div></>
            : <><Photo name="venue-2" /><h4>{str("listing_name") || "Your listing"}</h4><p><MapPin size={14} aria-hidden="true" />{str("location") || "Location"}</p><div className="tags"><span>{str("kind") === "service" ? str("category") || "Service" : str("venue_type")}</span>{str("capacity") && <span>Up to {str("capacity")}</span>}</div>{arr("amenities").length > 0 && <div className="tags">{arr("amenities").slice(0, 3).map(a => <span key={a}>{a}</span>)}{arr("amenities").length > 3 && <span>+{arr("amenities").length - 3} more</span>}</div>}</>}
          {key === "trust" ? <div className="preview-actions"><Button variant="outline" onClick={() => setError("Your public listing page goes live once the listing is published.")}>View listing</Button><Button disabled={busy} onClick={() => context.readiness?.eligible ? post("publish") : setError(`Publishing unlocks once these are done: ${(context.readiness?.missing ?? []).map(m => missingLabels[m] ?? m).join("; ")}.`)}>Publish now</Button></div>
            : <p className="setup-note small"><LockKeyhole size={16} aria-hidden="true" /><span>This listing is saved as a draft and isn’t visible to organisers yet.</span></p>}
        </section>}
        {key === "offer" && <section className="setup-panel tips-panel"><h4><Lightbulb size={18} aria-hidden="true" /> Tips for a great listing</h4>
          <CheckList items={["Add at least 5 high quality photos", "Choose the most relevant event types", "Highlight what makes you unique", "You can edit everything later"]} /></section>}
        {key === "operating" && <OperatingPreview values={values} />}
        {key === "team" && context.summary && <section className="setup-panel workspace-summary"><h4>Your workspace summary</h4>
          <div className="recommend-list">{([[Building2, "Workspace name", context.summary.name], [BarChart3, "Business type", context.summary.businessType], [MapPin, "Location", context.summary.location], [CircleDollarSign, "Currency", context.summary.currency], [Users, "Team members", `${((values.members as unknown[]) ?? []).length + 1} including you`]] as const).map(([Icon, title, text]) =>
            <div className="assistant-feature" key={title}><IconTile icon={Icon} /><span><b>{title}</b><small>{text}</small></span></div>)}</div>
          <Link href="/onboarding/organizer?step=1" className="link-button">Edit details</Link></section>}
        {key === "organisation" && <section className="setup-panel"><h4>Popular organizer types</h4>{["Event Management Company", "Venue Operator", "Promoter", "Community Organisation"].map((name, i) => <button type="button" className="organizer-type" key={name} onClick={() => set("business_type", name)} aria-pressed={str("business_type") === name}><Photo name={`organizer-type-${i}`} /><span><b>{name}</b><small>{["Weddings, corporate, festivals", "Run your own venue(s)", "Concerts, nightlife, live shows", "Local events, fundraisers"][i]}</small></span></button>)}</section>}
        {key !== "preferences" && key !== "offer" && <section className="setup-panel"><div className="assistant-feature"><IconTile icon={key === "trust" ? Info : Lightbulb} /><span><b>{key === "organisation" ? "You can always change this later" : key === "operating" ? "You can change this anytime" : key === "trust" ? "You can edit this later" : "You can change this later"}</b><p>{key === "operating" ? "These settings only set your defaults. You can update them at any time in your workspace settings." : key === "trust" ? "You can update your documents, team members and listing details at any time from your workspace." : "Add team members, connect integrations and customise your workspace after setup."}</p></span></div></section>}
      </aside>}
    </div>
  </OnboardingShell>;
}

function LocaleFields({ country, values, set, changeCountry, errors }: { country: ReturnType<typeof countryByName>; values: Values; set: (k: string, v: unknown) => void; changeCountry: (name: string) => void; errors: Record<string, string> }) {
  return <div className="two-columns">
    <SelectField label="Country" required value={String(values.country ?? "")} onChange={changeCountry} options={countries.map(c => c.name)} error={errors.country} icon={<Globe size={18} aria-hidden="true" />} />
    <SelectField label="Timezone" required value={String(values.timezone ?? "")} onChange={v => set("timezone", v)} options={country.timezones} error={errors.timezone} icon={<Clock size={18} aria-hidden="true" />} />
    <SelectField label="Default currency" required value={String(values.currency ?? "")} onChange={v => set("currency", v)} options={currencies} error={errors.currency} />
    <div className="setup-note"><MapPin size={20} aria-hidden="true" /><span>These defaults can be changed later in workspace settings and will be used for events, contracts and payments.</span></div>
  </div>;
}

/** Live preview of what the selections switch on. All events still share one event model. */
function OperatingPreview({ values }: { values: Values }) {
  const types = (values.event_types as string[]) ?? [];
  const items: [typeof CalendarDays, string, string][] = [
    [FileText, "Event planning playbooks", types.length ? `Templates for ${types.slice(0, 2).join(" and ")}${types.length > 2 ? ` +${types.length - 2}` : ""}` : "Pick event types to see templates"],
    [Ticket, values.ticketing ? "Ticketing & pricing guide" : "Registrations & guest lists", values.ticketing ? "Recommended ticket tiers and pricing" : "Invite-only and RSVP tools"],
    [ShieldCheck, "Risk & compliance checklist", `Sized for ${String(values.capacity ?? "your")} guests`],
    [BarChart3, "Suggested dashboard widgets", [values.client_work && "proposals", values.multi_venue && "venues", values.procurement !== "My own suppliers" && "suppliers", "tasks"].filter(Boolean).join(", ")],
  ];
  return <section className="setup-panel operating-preview" aria-live="polite"><h4>Recommended for you</h4>
    <div className="recommend-list">{items.map(([Icon, title, text]) => <div className="assistant-feature" key={title}><IconTile icon={Icon} /><span><b>{title}</b><small>{text}</small></span></div>)}</div>
  </section>;
}

function PendingInvite({ invite, preview }: { invite: { id: string; workspace_name: string; workspace_kind: string; role: string }; preview?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function respond(accept: boolean) {
    if (preview) return;
    setBusy(true); setError("");
    const response = await fetch("/api/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inviteId: invite.id, accept }) });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(data.error ?? "Couldn’t respond to this invitation.");
    router.push(accept ? data.next : "/onboarding"); router.refresh();
  }
  return <div className="pending-invite"><span><b>{invite.workspace_name}</b><small>{invite.workspace_kind === "provider" ? "Provider" : "Organizer"} · {memberRoles.find(r => r.value === invite.role)?.label}</small></span>
    <Button variant="outline" disabled={busy} onClick={() => respond(false)}>Decline</Button><Button disabled={busy} onClick={() => respond(true)}>Accept</Button>
    {error && <small className="field-error" role="alert">{error}</small>}</div>;
}

function ExperienceHelp({ preview }: { preview: boolean }) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [answer, setAnswer] = useState<{ summary: string; path?: string } | null>(null);
  const [message, setMessage] = useState("");
  async function ask(e: FormEvent) {
    e.preventDefault();
    if (preview) { setState("error"); setMessage("Preview only — sign in to ask the Gala Agent."); return; }
    if (question.trim().length < 5) return;
    setState("loading");
    try {
      const response = await fetch("/api/agent/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "experience", context: { question } }) });
      const data = await response.json();
      if (!response.ok) { setState("error"); setMessage(data.error); return; }
      setAnswer({ summary: data.summary, path: data.suggestions?.[0]?.value }); setState("done");
    } catch { setState("error"); setMessage("The Gala Agent couldn’t be reached."); }
  }
  return <div className="experience-help">
    <ul className="comparison">
      <li><b>Customer</b> — buy tickets, plan a personal event, find venues and suppliers. No business setup.</li>
      <li><b>Organizer</b> — run events professionally for clients or the public: teams, proposals, ticketing and suppliers.</li>
      <li><b>Provider</b> — list a venue, services or both in one workspace and take bookings.</li>
    </ul>
    <form onSubmit={ask}><TextField label="Describe what you want to do" value={question} onChange={setQuestion} placeholder="e.g. I run a wedding venue and also offer catering" maxLength={300} />
      <Button type="submit" disabled={state === "loading"}>{state === "loading" ? "Thinking…" : "Ask the Gala Agent"}</Button></form>
    {state === "error" && <p className="agent-state warning" role="alert"><AlertTriangle size={16} aria-hidden="true" />{message} The summary above covers each option.</p>}
    {state === "done" && answer && <div className="agent-results"><p>{answer.summary}</p>{answer.path && <Button href={`/onboarding/${answer.path}?step=1`} arrow>Continue as {answer.path}</Button>}</div>}
  </div>;
}

function OnboardingShell({ flow, pageClass, storyAsset, s, steps, step, user, preview, children }: {
  flow: Flow; pageClass: string; storyAsset: string; s: (typeof story)[string]; steps: readonly { key: string; label: string }[] | null; step: number;
  user: OnboardingProps["user"]; preview?: boolean; children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const router = useRouter();
  return <div className={`onboarding-page setup-${pageClass} ${flow === "experience" ? "experience-page" : ""}`}>
    <header className="setup-header">
      <Logo />
      {flow !== "experience" && <><form className="setup-search" role="search" onSubmit={e => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q"); router.push(`/discover${q ? `?q=${encodeURIComponent(String(q))}` : ""}`); }}>
        <Search size={17} aria-hidden="true" /><input name="q" aria-label="Search events, venues and suppliers" placeholder="Search events, venues, suppliers and more..." /></form>
        <nav aria-label="Marketplace"><Link href="/events/london">Explore Events</Link><Link href="/venues/riverside-arena">Find Venues</Link><Link href="/onboarding/organizer?step=1">For Organizers</Link><Link href="/onboarding/provider?step=1">For Providers</Link></nav></>}
      {flow === "experience" ? <Link href="/help" className="setup-help"><CircleHelp size={18} aria-hidden="true" />Need help?</Link> : <Link href="/help" className="header-icon" aria-label="Help centre"><CircleHelp size={22} aria-hidden="true" /></Link>}
      <div className="account-menu"><button type="button" className="initial-avatar" aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu" onClick={() => setMenu(!menu)}>{user.initials}</button>
        {menu && <div role="menu" className="account-dropdown"><span><b>{user.name || "Your account"}</b><small>{user.email}</small></span>
          <Link role="menuitem" href="/discover">Discover events</Link>
          {!preview && <form action="/auth/signout" method="post"><button role="menuitem" type="submit">Sign out</button></form>}</div>}</div>
    </header>
    <div className="onboarding-body">
      <aside style={{ "--story-art": `url(${assetUrl(storyAsset, "png")})` } as CSSProperties} className={`setup-story ${hasRegeneratedAsset(storyAsset) ? "regenerated-story" : ""} ${flow === "provider" ? "provider-story" : ""} ${flow === "customer" ? "preferences-story" : ""}`}>
        <div className="setup-story-content">
          {flow === "experience" ? <p className="eyebrow">EVENTS. PEOPLE. PLACES. ALL TOGETHER.</p> : <>
            <p className="eyebrow">{s.eyebrow ?? (flow === "provider" ? "PROVIDER SETUP" : "ORGANIZER SETUP")}</p>
            {flow === "customer" && <div className="story-progress" aria-hidden="true"><i /></div>}
            {steps && <ol className="setup-steps">{steps.map((item, i) => <li key={item.key} aria-current={i + 1 === step ? "step" : undefined}><span className={i < step ? "active" : ""}>{i + 1 < step ? <Check size={15} aria-label="Completed" /> : i + 1}</span><small>{item.label}</small></li>)}</ol>}</>}
          <h1>{s.title}</h1>
          <p className="setup-story-description">{s.description}</p>
          <div className={`setup-features ${flow === "experience" ? "two-columns" : ""}`}>{s.features.map(([title, text], i) => { const Icon = storyIcons[i % storyIcons.length]; return <div key={title}><IconTile icon={Icon} /><span><b>{title}</b>{text && <small>{text}</small>}</span></div>; })}</div>
        </div>
        <div className="setup-photo-strip"><Photo name={flow === "customer" ? "preferences-party" : flow === "provider" ? "onboard-venue" : "onboard-party"} /></div>
        <div className="setup-proof"><span className="proof-icon" aria-hidden="true"><ShieldCheck size={22} /></span><span><b>Free to start</b><small>No card needed to set up</small></span><span><b>One account</b><small>Add more experiences anytime</small></span></div>
      </aside>
      <main className="setup-main">{children}</main>
    </div>
  </div>;
}
