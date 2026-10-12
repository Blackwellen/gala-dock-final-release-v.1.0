import Link from "next/link";
import { StorageUsage } from "@/components/storage-usage";
import { DemoCard } from "@/components/demo/demo-card";
import { DevelopersPanel } from "@/components/developer/panel";
import { AgentCredits } from "@/components/agent/credits";
import { MfaCard, WorkspaceMfaPolicy } from "@/components/security/mfa-card";
import { mfaRequired, policyOf } from "@/lib/mfa/policy";
import { ClipboardList, CheckCircle2, ExternalLink, Users, CreditCard, Mail, Plug, Sparkles, Bell, CalendarDays, CircleSlash, ShieldCheck, Gauge, KeyRound, Globe2, Clock, ArrowRight, MessageSquare } from "lucide-react";
import { getOrganizer } from "@/lib/data/context";
import { Crumbs, LinkTabs } from "@/components/kit";
import { EditCard, NotifToggles, RoleSelect } from "@/components/organizer/settings-client";
import { BrandLogo } from "@/components/kit/brand-logo";
import { requestTime } from "@/lib/workspace/format";

export const metadata = { title: "Settings" };
type S = Record<string, unknown>;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const ctx = await getOrganizer(); const sb = ctx.supabase; const ws = ctx.workspace.id;
  const tab = ["team", "security", "brand", "billing", "communications", "integrations", "agent", "notifications", "developers", "demo"].includes(sp.tab ?? "") ? sp.tab! : "workspace";
  const [{ data: w }, { data: members }, { data: crew }, { count: events }, { data: runs }, { data: audit }] = await Promise.all([
    sb.from("workspaces").select("id,name,kind,settings,status,verification_status,payout_status,plan,cover_image,created_at").eq("id", ws).single(),
    sb.from("workspace_members").select("user_id,role,status,created_at").eq("workspace_id", ws),
    sb.from("crew_members").select("id,avatar,member_type,role").eq("workspace_id", ws).neq("status", "deactivated"),
    sb.from("events").select("id", { count: "exact", head: true }).eq("workspace_id", ws).not("status", "in", "(archived,completed,cancelled)"),
    sb.from("agent_runs").select("id,cost_cents,created_at").eq("workspace_id", ws).gte("created_at", new Date(requestTime() - 30 * 864e5).toISOString()),
    tab === "team" ? sb.from("audit_events").select("event,created_at,metadata").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
  ]);
  const s = (w?.settings ?? {}) as S; const can = ["owner", "manager"].includes(String(ctx.role)); const owner = ctx.role === "owner";
  const { data: profiles } = (members ?? []).length ? await sb.from("profiles").select("id,full_name,avatar_url").in("id", (members ?? []).map(m => m.user_id)) : { data: [] };
  const name = (id: string) => (profiles ?? []).find(p => p.id === id)?.full_name || "Member";
  const roleCounts = (members ?? []).reduce<Record<string, number>>((a, m) => ({ ...a, [m.role]: (a[m.role] ?? 0) + 1 }), {});
  const crewN = (crew ?? []).filter(c => c.member_type === "crew").length;
  const spend = (runs ?? []).reduce((a, r) => a + Number(r.cost_cents ?? 0), 0) / 100;
  const notif = { in_app: true, email: true, sms: false, agent: true, marketing: false, ...((s.notifications ?? {}) as Record<string, boolean>) };
  const agent = { approval_policy: "Require approval for high-impact actions", autopilot: "Limited (suggest & draft only)", access_scope: "All events and workspace data", ...((s.agent ?? {}) as Record<string, string>) };
  const integrations = [
    { b: ["stripe"], n: "Stripe payouts", ok: w?.payout_status === "active", d: w?.payout_status === "active" ? "Payouts active" : "Finish payout setup", href: "/organizer/money?tab=settlements" },
    { b: ["google-calendar", "outlook", "apple"], n: "Calendar subscription", ok: true, d: "Subscribe from My Account", href: "/account?tab=profile" },
    { b: ["resend"], n: "Transactional email", ok: !!(process.env.RESEND_API_KEY || process.env.RESEND_API), d: (process.env.RESEND_API_KEY || process.env.RESEND_API) ? "Resend (production)" : "Not configured", href: "#" },
    { b: ["microsoft"], n: "Gala Agent (Azure OpenAI)", ok: !!(process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_OPENAI_KEY), d: "AI model access", href: "/organizer/agent" },
  ];
  const plan = String(s.plan ?? (w?.plan === "starter" ? "Starter" : "Pro Plan")); const price = Number(s.plan_price ?? 0);
  const limits = [[CalendarDays, "Events", events ?? 0, 100], [Users, "Team members", (members ?? []).length + crewN, 25], [Gauge, "AI runs (30d)", (runs ?? []).length, 2000]] as const;
  const fields = (keys: [string, string][]) => keys.map(([k, l]) => ({ key: k, label: l, value: String(s[k] ?? "") }));

  return <div className="st">
    <Crumbs items={[{ label: "Organizer", href: "/organizer" }, { label: "Settings" }]} />
    <div className="k-page-head"><div className="k-grow"><h1>Settings</h1><p className="sub">Manage your workspace, team, billing, integrations and more.</p></div><Link className="k-btn outline" href="/organizer/settings?tab=team#audit"><ClipboardList size={16} />View audit logs</Link></div>
    <LinkTabs current={tab} tabs={[["workspace", "Workspace"], ["team", "Team & Access"], ["security", "Security"], ["brand", "Brand"], ["billing", "Payments & Billing"], ["communications", "Communications"], ["integrations", "Integrations"], ["agent", "Agent"], ["notifications", "Notifications"], ["developers", "Developers"], ["demo", "Demo"]].map(([k, l]) => ({ key: k, label: l, href: k === "workspace" ? "/organizer/settings" : `/organizer/settings?tab=${k}` }))} />
    {!can && <div className="k-notice amber">You can view settings. Ask an owner or manager to make changes.</div>}
    {tab === "workspace" && <>
      <div className="st-r1">
        <section className="k-card st-c st-profile"><div className="k-between"><h2>Workspace profile</h2><EditCard can={can} title="Edit workspace profile" fields={[{ key: "name", label: "Workspace name", value: w?.name ?? "" }, ...fields([["description", "Description"], ["website", "Workspace URL"], ["contact_email", "Contact email"], ["contact_phone", "Contact phone"]])]} /></div>
          <div className="st-id">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={w?.cover_image || "/assets/gd/av-alex-organizer.webp"} alt="" /><div><div className="k-row" style={{ gap: 10 }}><b>{w?.name}</b><span className="st-ok"><CheckCircle2 size={13} />{w?.status === "active" ? "Active" : w?.status}</span></div><p>{String(s.description ?? "")}</p></div></div>
          <dl className="st-g">{([["Workspace type", w?.kind === "organizer" ? "Organizer" : String(w?.kind)], ["Workspace", String(s.website ?? "—")], ["Default country", String(s.country ?? "United Kingdom")], ["Default currency", `${String(s.currency ?? "GBP")} (${s.currency === "EUR" ? "€" : s.currency === "USD" ? "$" : "£"})`], ["Default timezone", String(s.timezone ?? "Europe/London")], ["Contact email", String(s.contact_email ?? "—")], ["Contact phone", String(s.contact_phone ?? "—")]] as const).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{k === "Workspace" && v !== "—" ? <span className="k-row" style={{ gap: 6 }}>{v}<ExternalLink size={13} className="k-blue" /></span> : v}</dd></div>)}</dl></section>
        <section className="k-card st-c st-plan"><div><h2>Subscription &amp; plan</h2><div className="st-pl"><span className="st-pro">{plan.slice(0, 3)}</span><span className="k-grow"><b>{plan}</b><small>Everything you need to run multiple events at scale.</small></span><Link className="k-btn outline" href="/organizer/settings?tab=billing">Change plan</Link></div>
          {price > 0 && <p className="st-price"><b>£{price}</b> / month</p>}
          <div className="st-limits">{limits.map(([I, l, v, max]) => <div key={l}><span><I size={18} /><small>{l}</small></span><b>{v.toLocaleString("en-GB")} / {max.toLocaleString("en-GB")}</b><span className="st-bar"><i style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></span></div>)}</div></div>
          <aside className="st-incl"><b>Plan includes</b>{["Up to 100 active events", "25 team members", "Advanced ticketing", "Venue and supplier management", "Gala Agent (full access)", "Priority support"].map(x => <span key={x}><CheckCircle2 size={14} />{x}</span>)}</aside></section>
      </div>
      <div className="st-r2">
        <section className="k-card st-c"><div className="k-between"><h2>Legal &amp; business information</h2><EditCard can={can} title="Legal & business information" fields={fields([["legal_name", "Business name"], ["registration", "Registration number"], ["vat", "VAT number"], ["address", "Registered address"]])} /></div>
          <dl className="st-dl">{([["Business name", s.legal_name], ["Registration number", s.registration], ["VAT number", s.vat], ["Registered address", s.address]] as const).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v ?? "—")}</dd></div>)}</dl></section>
        <section className="k-card st-c"><div className="k-between"><h2>Locale &amp; defaults</h2><EditCard can={can} title="Locale & defaults" fields={[...fields([["country", "Default country"], ["timezone", "Default timezone"], ["date_format", "Date format"], ["time_format", "Time format"]]), { key: "currency", label: "Default currency", value: String(s.currency ?? "GBP"), options: ["GBP", "EUR", "USD"] }]} /></div>
          <dl className="st-dl ic">{([[Globe2, "Default country", s.country], [CreditCard, "Default currency", `${String(s.currency ?? "GBP")}`], [Clock, "Default timezone", s.timezone], [CalendarDays, "Date format", s.date_format], [CalendarDays, "Time format", s.time_format]] as const).map(([I, k, v]) => <div key={k}><dt>{k}</dt><dd><I size={15} />{String(v ?? "—")}</dd></div>)}</dl></section>
        <section className="k-card st-c st-brand"><div className="k-between"><h2>Workspace cover &amp; branding</h2><EditCard can={can} title="Branding" fields={[{ key: "cover_image", label: "Cover image URL", value: w?.cover_image ?? "" }, { key: "brand_color", label: "Brand colour (hex)", value: String(s.brand_color ?? "#2563eb") }]} /></div>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img className="st-cover" src="/assets/gd/hero-neon.webp" alt="" /><div className="st-bid">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={w?.cover_image || "/assets/gd/av-alex-organizer.webp"} alt="" /><span><b>{w?.name}</b><small>Primary brand for public pages and communications.</small></span></div></section>
      </div>
      <div className="st-r3">
        <section className="k-card st-c st-mini"><div className="st-mh"><span className="st-mi blue"><Users size={18} /></span><span className="k-grow"><b>Team &amp; access</b><small>{(members ?? []).length} members · {crewN} external crew</small></span><Link className="k-btn outline sm" href="/organizer/settings?tab=team">Manage</Link></div>
          <div className="st-team"><span className="tm-avs">{(crew ?? []).filter(c => c.avatar).slice(0, 5).map(c => /* eslint-disable-next-line @next/next/no-img-element */ <img key={c.id} src={c.avatar} alt="" />)}</span><dl>{Object.entries({ Owner: roleCounts.owner ?? 0, Manager: roleCounts.manager ?? 0, Member: roleCounts.member ?? 0, Finance: roleCounts.finance ?? 0, "Crew (external)": crewN }).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>
          <Link className="k-link st-more" href="/organizer/settings?tab=team">Manage roles &amp; permissions <ArrowRight size={13} /></Link></section>
        <section className="k-card st-c st-mini"><div className="st-mh"><span className="st-mi purple"><CreditCard size={18} /></span><span className="k-grow"><b>Payments &amp; billing</b><small className={w?.payout_status === "active" ? "k-green" : "k-amber"}>{w?.payout_status === "active" ? "Connected · Stripe" : "Payout setup incomplete"}</small></span><Link className="k-btn outline sm" href="/organizer/money?tab=settlements">Manage</Link></div>
          <ul className="st-chk">{[["Payouts configured (Connect)", w?.payout_status === "active"], ["Identity verified", w?.verification_status === "verified"], ["Event and ticket payments enabled", w?.payout_status === "active"], ["VAT handling (UK)", !!s.vat]].map(([l, ok]) => <li key={String(l)}>{ok ? <CheckCircle2 size={16} className="ok" /> : <CircleSlash size={16} className="no" />}{String(l)}</li>)}</ul></section>
        <section className="k-card st-c st-mini"><div className="st-mh"><span className="st-mi blue"><Mail size={18} /></span><span className="k-grow"><b>Communications</b><small>{String(s.contact_email ?? "No sender email")}</small></span></div>
          <ul className="st-chk">{integrations.slice(2, 3).map(i => <li key={i.n}>{i.ok ? <CheckCircle2 size={16} className="ok" /> : <CircleSlash size={16} className="no" />}{i.n} — {i.d}</li>)}<li><MessageSquare size={16} className="ok" />In-app messaging with clients and providers</li></ul></section>
        <section className="k-card st-c st-mini"><div className="st-mh"><span className="st-mi blue"><Plug size={18} /></span><span className="k-grow"><b>Integrations</b><small>{integrations.filter(i => i.ok).length} connected</small></span><Link className="k-btn outline sm" href="/organizer/settings?tab=integrations">Manage</Link></div>
          <ul className="st-int">{integrations.map(i => <li key={i.n}><span className="st-ib">{i.b.map(x => <BrandLogo key={x} brand={x} size={22} tile />)}</span><span className="k-grow">{i.n}</span><span className={`st-pill ${i.ok ? "ok" : ""}`}>{i.ok ? <CheckCircle2 size={12} /> : <CircleSlash size={12} />}{i.ok ? "Connected" : "Not connected"}</span></li>)}</ul></section>
        <section className="k-card st-c st-mini"><div className="st-mh"><span className="st-mi blue"><Sparkles size={18} /></span><span className="k-grow"><b>Gala Agent</b><small>Configure behaviour and approvals.</small></span><Link className="k-btn outline sm" href="/organizer/settings?tab=agent">Manage</Link></div>
          <dl className="st-ag">{([[ShieldCheck, "Approval policy", agent.approval_policy], [Gauge, "Autopilot", agent.autopilot], [KeyRound, "Access scope", agent.access_scope], [ClipboardList, "Usage (30 days)", `${(runs ?? []).length} runs${spend ? ` · £${spend.toFixed(2)}` : ""}`]] as const).map(([I, k, v]) => <div key={k}><dt><I size={15} />{k}</dt><dd>{v}</dd></div>)}</dl></section>
        <section className="k-card st-c st-mini"><div className="st-mh"><span className="st-mi blue"><Bell size={18} /></span><span className="k-grow"><b>Notifications</b><small>5 channels</small></span></div><NotifToggles can={can} prefs={notif} /></section>
      </div>
    </>}
    {tab === "team" && <section className="k-card st-c"><h2>Workspace members</h2><table className="mn-t"><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead><tbody>{(members ?? []).map(m => <tr key={m.user_id}><td><b>{name(m.user_id)}</b></td><td>{owner && m.role !== "owner" ? <RoleSelect userId={m.user_id} role={m.role} /> : m.role}</td><td>{m.status}</td><td>{new Date(m.created_at).toLocaleDateString("en-GB")}</td></tr>)}</tbody></table>
      <p className="k-small" style={{ marginTop: 10 }}>External crew are managed in <Link href="/organizer/team">Team</Link>.</p>
      <h2 id="audit" style={{ marginTop: 20 }}>Audit log</h2><ul className="iv-comm">{(audit ?? []).map((a, i) => <li key={i}><span className="tm-ci green"><ClipboardList size={15} /></span><span className="k-grow"><b>{a.event}</b></span><small>{new Date(a.created_at).toLocaleString("en-GB")}</small></li>)}</ul></section>}
    {tab === "demo" && <div style={{ maxWidth: 760 }}><DemoCard /></div>}
    {tab === "developers" && <DevelopersPanel db={ctx.supabase} workspaceId={ctx.workspace.id} canManage={["owner", "manager"].includes(ctx.role)} />}
    {tab === "security" && <div className="st-sec" style={{ display: "grid", gap: 16, maxWidth: 720 }}><MfaCard required={mfaRequired(policyOf(ctx.workspace.settings), ctx.role) ? ctx.workspace.name : null} /><WorkspaceMfaPolicy workspaceId={ctx.workspace.id} policy={policyOf(ctx.workspace.settings)} owner={ctx.role === "owner"} /></div>}
    {tab === "notifications" && <section className="k-card st-c st-narrow"><h2>Notification channels</h2><NotifToggles can={can} prefs={notif} /></section>}
    {tab === "agent" && <AgentCredits db={ctx.supabase} workspaceId={ctx.workspace.id} canEdit={["owner", "manager"].includes(ctx.role)} canSeeUsage={ctx.canMoney} />}
    {tab === "agent" && <section className="k-card st-c st-narrow"><div className="k-between"><h2>Gala Agent behaviour</h2><EditCard can={can} title="Agent settings" fields={[{ key: "agent.approval_policy", label: "Approval policy", value: agent.approval_policy, options: ["Require approval for high-impact actions", "Require approval for all actions"] }, { key: "agent.autopilot", label: "Autopilot", value: agent.autopilot, options: ["Off", "Limited (suggest & draft only)", "Standard (low-risk actions)"] }, { key: "agent.access_scope", label: "Access scope", value: agent.access_scope, options: ["All events and workspace data", "Assigned events only"] }]} /></div><dl className="st-ag">{Object.entries(agent).map(([k, v]) => <div key={k}><dt>{k.replace(/_/g, " ")}</dt><dd>{v}</dd></div>)}</dl></section>}
    {tab === "billing" && <div style={{ maxWidth: 760 }}><StorageUsage db={ctx.supabase} workspaceId={ctx.workspace.id} /></div>}
    {["brand", "billing", "communications", "integrations"].includes(tab) && <section className="k-card st-c st-narrow"><h2>{tab === "integrations" ? "Integrations" : tab === "billing" ? "Payments & Billing" : tab === "brand" ? "Brand" : "Communications"}</h2>
      {tab === "integrations" ? <ul className="st-int lg">{integrations.map(i => <li key={i.n}><span className="st-ib">{i.b.map(x => <BrandLogo key={x} brand={x} size={34} tile />)}</span><span className="k-grow"><b>{i.n}</b><small>{i.d}</small></span><span className={`st-pill ${i.ok ? "ok" : ""}`}>{i.ok ? "Connected" : "Not connected"}</span>{i.href !== "#" && <Link className="k-link" href={i.href}>Open</Link>}</li>)}</ul>
        : tab === "billing" ? <><p className="k-small">Current plan: <b>{plan}</b>{price ? ` · £${price}/month` : ""}. Plan changes are handled by Gala Dock support during the beta.</p><Link className="k-btn outline" href="/help?topic=billing">Contact billing support</Link></>
        : <p className="k-small">Manage these from the Workspace tab cards. <Link href="/organizer/settings">Back to workspace</Link>.</p>}</section>}
  </div>;
}
