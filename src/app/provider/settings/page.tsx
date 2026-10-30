import type { Metadata } from "next";
import Link from "next/link";
import { PlanBilling } from "@/components/billing/plan-billing";
import { Building2, BadgeCheck, UserCog, Users, ChevronRight, ArrowRight, ArrowLeft, Landmark, Wallet, Mail, Plug, Sparkles, Bell, Wrench, Package2, CircleCheck, CalendarCheck, Crown, X } from "lucide-react";
import "@/styles/provider-venue-setup.css";
import "@/styles/provider-team.css";
import "@/styles/provider-agent.css";
import "@/styles/provider-settings.css";
import { Avatar, Chip } from "@/components/workspace/kit";
import { CredentialsCard } from "./_components/credentials-card";
import { MfaCard, WorkspaceMfaPolicy } from "@/components/security/mfa-card";
import { AgentCredits } from "@/components/agent/credits";
import { AgentControls } from "@/components/agent/agent-controls";
import { DevelopersPanel } from "@/components/developer/panel";
import { DemoCard } from "@/components/demo/demo-card";
import { StorageUsage } from "@/components/storage-usage";
import { policyOf, mfaRequired } from "@/lib/mfa/policy";
import { ActionForm, ActionButton } from "@/components/workspace/actions";
import { money, relative, titleCase, requestTime } from "@/lib/workspace/format";
import { getProvider } from "@/lib/provider/context";
import { rows } from "@/lib/workspace/db";
import { workspaceListings } from "@/lib/provider/queries";
import { loadMoney, inRange } from "../money/data";
import { setCapability, saveProfile, saveBooking, saveComms, saveNotifications, saveAgent, saveTax, inviteMember, revokeInvite, changeMemberRole } from "./actions";

export const metadata: Metadata = { title: "Settings" };
const TABS: [string, string][] = [["workspace", "Workspace"], ["capabilities", "Capabilities"], ["team", "Team & Access"], ["booking", "Marketplace & Booking Rules"], ["billing", "Payments & Billing"],
  ["communications", "Communications"], ["integrations", "Integrations"], ["agent", "Agent"], ["notifications", "Notifications"], ["security", "Security"], ["developers", "Developers"], ["demo", "Demo"]];
type S = { profile?: Record<string, string>; booking?: Record<string, unknown>; communications?: Record<string, unknown>; notifications?: Record<string, { email?: boolean; in_app?: boolean; sms?: boolean }>; agent?: Record<string, boolean>; tax?: { vat_registered?: boolean; number?: string } };
const Row = ({ l, v, href }: { l: string; v: React.ReactNode; href?: string }) => <li>{href ? <Link href={href}><span>{l}</span><b>{v}</b><ChevronRight aria-hidden="true" /></Link> : <><span>{l}</span><b>{v}</b></>}</li>;
const Toggle = ({ name, label, on }: { name: string; label: string; on?: boolean }) => <label className="vw-switch ps-tg"><input type="checkbox" name={name} defaultChecked={!!on} /><i aria-hidden="true" /><span><b>{label}</b></span></label>;

export default async function Settings(props: PageProps<"/provider/settings">) {
  const sp = await props.searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? String(sp.tab) : "workspace";
  const [ctx, listings, { txs, plans }] = await Promise.all([getProvider(), workspaceListings(), loadMoney()]);
  const ws = ctx.workspace, s = (ws.settings ?? {}) as S, owner = ctx.role === "owner";
  const [members, invites, crewAv] = await Promise.all([
    rows<{ user_id: string; role: string; status: string }>(ctx.db.from("workspace_members").select("user_id,role,status").eq("workspace_id", ws.id)),
    owner ? rows<{ id: string; email: string; role: string; created_at: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }>(ctx.db.from("workspace_invites").select("id,email,role,created_at,expires_at,accepted_at,revoked_at").eq("workspace_id", ws.id).order("created_at", { ascending: false })) : Promise.resolve([]),
    rows<{ name: string; avatar: string; user_id: string | null }>(ctx.db.from("crew_members").select("name,avatar,user_id").eq("workspace_id", ws.id).neq("status", "deactivated").limit(40)),
  ]);
  const venue = listings.find(l => l.kind === "venue");
  const p = s.profile ?? {}, b = s.booking ?? {}, c = s.communications ?? {}, n = s.notifications ?? {}, ag = s.agent ?? {}, tax = s.tax ?? {};
  const bps = ws.commission_bps ?? plans[ws.plan]?.commission_bps ?? 1500;
  const now = requestTime(), g30 = txs.filter(t => t.kind === "income" && inRange(t, now - 30 * 864e5, now)).reduce((a, t) => a + t.amount, 0);
  const better = Object.entries(plans).filter(([, x]) => x.commission_bps < bps).map(([k, x]) => ({ k, save: Math.round((g30 * (bps - x.commission_bps)) / 10000 - (x.monthly - (plans[ws.plan]?.monthly ?? 0))) })).sort((x, y) => y.save - x.save)[0];
  const roleCount = (r: string) => members.filter(m => m.role === r && m.status === "active").length;
  const chan = (k: string) => { const x = n[k] ?? { email: true, in_app: true }; return [x.email && "Email", x.in_app && "In-app", x.sms && "SMS"].filter(Boolean).join(" + ") || "Off"; };
  const pending = invites.filter(i => !i.accepted_at && !i.revoked_at && new Date(i.expires_at).getTime() > now);
  const base = "/provider/settings";
  const cancelLabel = String(b.cancellation ?? "Standard (7 days)");

  return <div className="ps">
    <header className="ws-page-head ps-head"><div><h1>Settings</h1><p>Manage your provider identity, capabilities, integrations and preferences.</p></div></header>
    <nav className="ws-tabs underline ps-tabs" aria-label="Settings sections">{TABS.map(([k, l]) => <Link key={k} href={k === "workspace" ? base : `${base}?tab=${k}`} className={tab === k ? "active" : ""} aria-current={tab === k ? "page" : undefined}>{l}</Link>)}</nav>
    {!owner && <p className="ps-note">Only the workspace owner can change settings. You can view them here.</p>}

    {tab === "workspace" && <div className="ps-grid">
      <section className="ws-panel ps-profile"><h2><span className="ps-ic"><Building2 aria-hidden="true" /></span>Workspace profile</h2>
        <div className="ps-id">{/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="ps-cover">{ws.cover_image ? <img src={ws.cover_image} alt="" /> : null}{owner && venue && <Link href={`/provider/venues/new?venue=${venue.id}&step=1`}>Change photo</Link>}</span>
          <div><p className="ps-name"><b>{ws.name}</b>{ws.verification_status === "verified" && <Chip tone="green" dot><BadgeCheck aria-hidden="true" />Verified</Chip>}</p><small>{ws.capabilities.map(x => x === "venue" ? "Venue" : "Services").join(" + ")}</small><p className="ps-tag">{p.tagline || venue?.description?.slice(0, 110) || ""}</p></div>
          {owner && <Link href={`${base}?tab=workspace&edit=1`} className="ws-btn outline sm">Edit</Link>}</div>
        {sp.edit && owner ? <ActionForm action={saveProfile} className="pt-form ps-form">
          <label>Legal name<input name="legal_name" defaultValue={p.legal_name ?? ""} /></label><label>Trading name<input name="trading_name" defaultValue={ws.name} required /></label>
          <label className="wide">Address<input name="address" defaultValue={p.address ?? (venue?.location ?? "")} /></label><label>Phone<input name="phone" defaultValue={p.phone ?? ""} /></label>
          <label>Email<input name="email" type="email" defaultValue={p.email ?? ""} /></label><label>Website<input name="website" defaultValue={p.website ?? ""} /></label><label>Language<select name="language" className="ws-select" defaultValue={p.language ?? "English (UK)"}><option>English (UK)</option></select></label>
          <label className="wide">Tagline<input name="tagline" defaultValue={p.tagline ?? ""} maxLength={160} /></label>
          <div className="wide pv-form-foot"><Link href={base} className="ws-btn outline">Cancel</Link><button className="ws-btn primary">Save profile</button></div></ActionForm>
        : <><dl className="ps-dl">{([["Legal name", p.legal_name], ["Trading name", ws.name], ["Workspace type", ws.capabilities.map(x => x === "venue" ? "Venue" : "Services").join(" + ")], ["Address", p.address ?? venue?.location], ["Phone", p.phone], ["Email", p.email], ["Website", p.website], ["Time zone", "Europe/London"], ["Language", p.language ?? "English (UK)"]] as const).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v || "—"}</dd></div>)}</dl>
          {owner && <Link href={`${base}?edit=1`} className="ws-btn outline sm ps-end">Edit details</Link>}</>}
      </section>
      <section className="ws-panel ps-caps"><h2><span className="ps-ic"><UserCog aria-hidden="true" /></span>Capability settings<small>Enable and configure the services you offer on Gala Dock.</small></h2>
        <div className="ps-capgrid">{([["venue", Landmark, "Venue operations", "List and manage your venue spaces, packages and venue bookings.", "/provider/listings/venues", ["Multiple spaces and layouts", "Venue packages", "Venue booking rules", "Map and seating plans", "Licences and compliance"]],
          ["service", Wrench, "Supplier services", "List and manage your services on the marketplace.", "/provider/listings/services", ["Create service listings", "Service packages", "Travel and coverage areas", "Equipment and staffing", "Service booking rules"]]] as const).map(([k, I, l, d, href, feats]) => {
          const onCap = ws.capabilities.includes(k); return <div key={k} className="ps-cap"><div className="ps-caph"><span className="ps-ic sm"><I aria-hidden="true" /></span><span><b>{l}</b><small>{d}</small></span>
            {owner ? <ActionButton action={setCapability} args={[k, !onCap]} variant="ghost" className={`pa-sw${onCap ? " on" : ""}`}><i aria-hidden="true" /><span className="sr-only">{onCap ? "Turn off" : "Turn on"}</span></ActionButton> : <span className={`pa-sw${onCap ? " on" : ""}`}><i /></span>}</div>
            <Link href={href} className="ws-btn outline block sm">Configure {k} settings <ArrowRight aria-hidden="true" /></Link>
            <ul>{feats.map(f => <li key={f} className={onCap ? "" : "off"}><CircleCheck aria-hidden="true" />{f}</li>)}</ul></div>; })}</div></section>
      <section className="ws-panel ps-plan"><div className="ws-panel-head"><h2><span className="ps-ic"><Package2 aria-hidden="true" /></span>Your plan</h2><Link href={`${base}?tab=billing`} className="ws-btn outline sm">Manage plan</Link></div>
        <div className="ps-planbox"><p><Crown aria-hidden="true" /><b>{titleCase(ws.plan)} Plan</b><Chip tone="blue" dot>Current</Chip></p><strong>{(bps / 100).toFixed(0)}%<small>Platform commission</small></strong>
          <ul>{[`Team members included`, ws.plan === "starter" ? "Standard analytics" : "Advanced analytics", "Gala Agent (standard)", "Marketplace placement"].map(x => <li key={x}><CircleCheck aria-hidden="true" />{x}</li>)}</ul>
          <Link href={`${base}?tab=billing`} className="ws-btn outline block sm">View plan details <ArrowRight aria-hidden="true" /></Link></div>
        <div className="ps-save"><b><Sparkles aria-hidden="true" />Estimated savings</b>{better && better.save > 0 ? <><p>Based on your last 30 days, upgrading to {titleCase(better.k)} could save you:</p><strong>{money(better.save)}<small> / month</small></strong></> : <p>You’re on the most cost-effective plan for your current volume.</p>}
          <Link href={`${base}?tab=billing`} className="ws-btn outline block sm">Compare plans</Link></div></section>
      <section className="ws-panel ps-card"><h2><span className="ps-ic"><Users aria-hidden="true" /></span>Team &amp; access<small>Manage team members and their permissions.</small></h2>
        <div className="ps-faces">{crewAv.slice(0, 5).map(x => <Avatar key={x.name} src={x.avatar} name={x.name} size={38} />)}{crewAv.length > 5 && <span>+{crewAv.length - 5}</span>}<Link href="/provider/team" className="ws-btn outline sm">Manage team</Link></div>
        <p className="ps-roles"><i className="o">Owner</i><i>Manager ({roleCount("manager")})</i><i>Staff ({roleCount("member")})</i><i>Finance ({roleCount("finance")})</i></p></section>
      <section className="ws-panel ps-card"><h2><span className="ps-ic"><CalendarCheck aria-hidden="true" /></span>Marketplace &amp; booking rules<small>Set your default rules for enquiries, quotes and bookings.</small></h2>
        <ul className="ps-rows"><Row l="Default response commitment" v={`${Number(b.response_hours ?? 4)} hours`} href={`${base}?tab=booking`} /><Row l="Cancellation policy" v={cancelLabel} href={`${base}?tab=booking`} />
          <Row l="Hold/standby policy" v={b.holds === false ? "Off" : "Enabled"} href={`${base}?tab=booking`} /><Row l="Emergency bookings" v={b.emergency ? "Allowed" : "Off"} href={`${base}?tab=booking`} /></ul>
        <Link href={`${base}?tab=booking`} className="ws-btn outline sm ps-end">Edit booking rules</Link></section>
      <section className="ws-panel ps-card"><h2><span className="ps-ic"><Wallet aria-hidden="true" /></span>Payments &amp; billing<small>Manage payouts, payment settings and your subscription.</small></h2>
        <ul className="ps-rows"><Row l="Payout account" v={ws.payout_status === "active" ? <><Chip tone="green" dot>Connected</Chip> Stripe Express</> : <Chip tone="amber" dot>Not connected</Chip>} href={`${base}?tab=billing`} />
          <Row l="Payout currency" v="GBP (£)" /><Row l="Tax configuration" v={tax.vat_registered ? "UK VAT registered" : "Not VAT registered"} href={`${base}?tab=billing`} /><Row l="Invoice settings" v="Monthly statements" href="/provider/money?tab=statements" /></ul>
        <Link href={`${base}?tab=billing`} className="ws-btn outline sm ps-end">Manage billing &amp; payouts</Link></section>
      <section className="ws-panel ps-card"><h2><span className="ps-ic"><Mail aria-hidden="true" /></span>Communications<small>Configure how you communicate with customers.</small></h2>
        <ul className="ps-rows"><Row l="From name" v={String(c.from_name ?? ws.name)} href={`${base}?tab=communications`} /><Row l="Email address" v={String(c.email ?? p.email ?? "—")} href={`${base}?tab=communications`} />
          <Row l="Reply-to" v={String(c.reply_to ?? "—")} href={`${base}?tab=communications`} /><Row l="Customer notifications" v={c.customer_notifications === false ? "Off" : "Enabled"} href={`${base}?tab=communications`} /></ul>
        <Link href={`${base}?tab=communications`} className="ws-btn outline sm ps-end">Edit communications</Link></section>
      <section className="ws-panel ps-card"><h2><span className="ps-ic"><Plug aria-hidden="true" /></span>Integrations<small>Connect your tools and calendars.</small></h2>
        <ul className="ps-rows"><Row l="Google Calendar" v={<Chip tone="grey">Not available yet</Chip>} href={`${base}?tab=integrations`} /><Row l="Outlook Calendar" v={<Chip tone="grey">Not available yet</Chip>} href={`${base}?tab=integrations`} />
          <Row l="Payments (Stripe)" v={ws.payout_status === "active" ? <Chip tone="green" dot>Connected</Chip> : <Chip tone="grey">Not connected</Chip>} href={`${base}?tab=billing`} /><Row l="API keys &amp; webhooks" v="Developers" href={`${base}?tab=developers`} /></ul>
        <Link href={`${base}?tab=integrations`} className="ws-btn outline sm ps-end">Manage integrations</Link></section>
      <section className="ws-panel ps-card"><h2><span className="ps-ic"><Sparkles aria-hidden="true" /></span>Agent settings<small>Configure how Gala Agent works for your workspace.</small></h2>
        <ul className="ps-rows">{([["response_automation", "Response automation"], ["quote_generation", "Quote generation"], ["availability_management", "Availability management"], ["pre_event_confirmations", "Pre-event confirmations"]] as const).map(([k, l]) =>
          <Row key={k} l={l} v={ag[k] === false ? "Off" : "Enabled"} href={`${base}?tab=agent`} />)}</ul>
        <Link href={`${base}?tab=agent`} className="ws-btn outline sm ps-end">Configure Gala Agent</Link></section>
      <section className="ws-panel ps-card"><h2><span className="ps-ic"><Bell aria-hidden="true" /></span>Notifications<small>Set your notification preferences.</small></h2>
        <ul className="ps-rows"><Row l="New enquiries" v={chan("enquiries")} href={`${base}?tab=notifications`} /><Row l="Booking updates" v={chan("bookings")} href={`${base}?tab=notifications`} /><Row l="Agent notifications" v={chan("agent")} href={`${base}?tab=notifications`} /><Row l="Team mentions" v={chan("mentions")} href={`${base}?tab=notifications`} /></ul>
        <Link href={`${base}?tab=notifications`} className="ws-btn outline sm ps-end">Manage notifications</Link></section>
      {/* Not in PROV-017 (added for Q08 trust & documents): kept last so the designed card grid above stays intact. */}
      <CredentialsCard workspaceId={ws.id} canManage={owner} />
    </div>}

    {tab !== "workspace" && <section className="ws-panel ps-detail">
      {tab === "capabilities" && <><h2>Capabilities</h2><p className="ps-sub">Switching a capability off is refused while you still have live listings of that type.</p>
        <ul className="ps-rows">{(["venue", "service"] as const).map(k => <li key={k} className="ps-li"><span>{k === "venue" ? "Venue operations" : "Supplier services"}</span><b>{ws.capabilities.includes(k) ? "On" : "Off"}</b>
          {owner && <ActionButton action={setCapability} args={[k, !ws.capabilities.includes(k)]} variant="outline">{ws.capabilities.includes(k) ? "Switch off" : "Switch on"}</ActionButton>}</li>)}</ul></>}
      {tab === "team" && <><h2>Team &amp; access</h2><p className="ps-sub">People with a Gala Dock login and their role in this workspace. Staff without logins are managed on the <Link href="/provider/team">Team</Link> page.</p>
        {/* Other members' names come from their linked Team profile; profiles are self-read only (member directory RPC: Q01). */}
        <ul className="ps-rows">{members.map(m => <li key={m.user_id} className="ps-li"><span>{m.user_id === ctx.userId ? `${ctx.userName} (you)` : crewAv.find(x => x.user_id === m.user_id)?.name ?? "Workspace member"}</span>
          {owner && m.role !== "owner" && m.status === "active" ? <ActionForm action={changeMemberRole.bind(null, m.user_id)} className="ps-invite ps-role"><select name="role" className="ws-select" defaultValue={m.role} aria-label="Role"><option value="manager">Manager</option><option value="member">Staff</option><option value="finance">Finance</option></select><button className="ws-btn outline sm">Change role</button></ActionForm>
            : <b>{m.role === "member" ? "Staff" : titleCase(m.role)}</b>}<Chip tone={m.status === "active" ? "green" : "grey"}>{titleCase(m.status)}</Chip></li>)}</ul>
        {owner && <><h3>Invite someone</h3><ActionForm action={inviteMember} className="ps-invite" resetOnSuccess><input name="email" type="email" placeholder="name@company.com" required aria-label="Email" />
          <select name="role" className="ws-select" aria-label="Role"><option value="manager">Manager</option><option value="member">Staff</option><option value="finance">Finance</option></select><button className="ws-btn primary">Create invite</button></ActionForm>
          <ul className="ps-rows">{pending.map(i => <li key={i.id} className="ps-li"><span>{i.email}</span><b>{titleCase(i.role)} · sent {relative(i.created_at, now)}</b><ActionButton action={revokeInvite} args={[i.id]} variant="ghost"><X aria-hidden="true" />Revoke</ActionButton></li>)}</ul></>}</>}
      {tab === "booking" && <><h2>Marketplace &amp; booking rules</h2><p className="ps-sub">Defaults for new listings. Each venue, space, service and package can override them. Accepted bookings keep the terms they were agreed on.</p>
        <ActionForm action={saveBooking} className="pt-form ps-form"><label>Default response commitment<select name="response_hours" className="ws-select" defaultValue={Number(b.response_hours ?? 4)}>{[2, 4, 8, 12, 24].map(h => <option key={h} value={h}>Within {h} hours</option>)}</select></label>
          <label>Cancellation policy<select name="cancellation" className="ws-select" defaultValue={cancelLabel}><option>Flexible (48 hours)</option><option>Standard (7 days)</option><option>Strict (30 days)</option></select></label>
          <Toggle name="holds" label="Allow conditional holds" on={b.holds !== false} /><Toggle name="standby" label="Offer standby" on={!!b.standby} /><Toggle name="emergency" label="Accept emergency bookings" on={!!b.emergency} /><Toggle name="auto_response" label="Auto-acknowledge new enquiries" on={b.auto_response !== false} />
          {owner && <div className="wide pv-form-foot"><button className="ws-btn primary">Save booking rules</button></div>}</ActionForm></>}
      {tab === "billing" && <><h2>Payments &amp; billing</h2>
        <ul className="ps-rows"><li className="ps-li"><span>Payout account</span><b>{ws.payout_status === "active" ? "Connected (Stripe Express)" : "Not connected"}</b>{ws.payout_status !== "active" && <Link className="ws-btn primary sm" href="/onboarding/provider?step=4">Connect payouts</Link>}</li>
          <li className="ps-li"><span>Plan</span><b>{titleCase(ws.plan)} · {(bps / 100).toFixed(0)}% commission</b></li><li className="ps-li"><span>Statements</span><b><Link href="/provider/money?tab=statements">Monthly statements</Link></b></li></ul>
        <StorageUsage db={ctx.db} workspaceId={ws.id} />
        {/* Q28 provider self-serve plans (W10 finding): live catalogue (plan_prices) replaces the static list; Stripe Checkout in TEST MODE only; the plan changes only on the signed webhook. */}
        <PlanBilling db={ctx.db} workspaceId={ws.id} kind="provider" plan={ws.plan ?? "starter"} isOwner={owner} />
        <h3>Tax</h3><ActionForm action={saveTax} className="pt-form ps-form"><Toggle name="vat_registered" label="VAT registered (UK)" on={tax.vat_registered} /><label>VAT number<input name="vat_number" defaultValue={tax.number ?? ""} placeholder="GB 123 4567 89" /></label>
          {owner && <div className="wide pv-form-foot"><button className="ws-btn primary">Save tax settings</button></div>}</ActionForm></>}
      {tab === "security" && <><h2>Security</h2><p className="ps-sub">Two-step verification for your own login, and the policy for who in this workspace must use it.</p>
        <MfaCard required={mfaRequired(policyOf(ws.settings), ctx.role) ? ws.name : null} />
        <WorkspaceMfaPolicy workspaceId={ws.id} policy={policyOf(ws.settings)} owner={owner} /></>}
      {tab === "developers" && <><h2>Developers</h2><p className="ps-sub">API keys, webhooks and integrations for this workspace.</p><DevelopersPanel db={ctx.db} workspaceId={ws.id} canManage={ctx.can.manage} /></>}
      {tab === "demo" && <><h2>Demo workspace</h2><p className="ps-sub">Create a separate practice workspace with sample data to try features safely. It never affects this workspace.</p><DemoCard /></>}
      {tab === "communications" && <><h2>Communications</h2><ActionForm action={saveComms} className="pt-form ps-form"><label>From name<input name="from_name" defaultValue={String(c.from_name ?? ws.name)} /></label><label>Email address<input name="email" type="email" defaultValue={String(c.email ?? p.email ?? "")} /></label>
        <label>Reply-to<input name="reply_to" type="email" defaultValue={String(c.reply_to ?? "")} /></label><Toggle name="customer_notifications" label="Customer notifications" on={c.customer_notifications !== false} />
        {owner && <div className="wide pv-form-foot"><button className="ws-btn primary">Save</button></div>}</ActionForm></>}
      {tab === "integrations" && <><h2>Integrations</h2><p className="ps-sub">Provider workspaces can’t connect external calendars or accounting tools yet, so nothing here can be switched on. Your Gala Dock calendar already blocks every booking, hold and buffer automatically, and payouts run through <Link href={`${base}?tab=billing`}>Payments &amp; billing</Link>.</p>
        <ul className="ps-rows">{([["Google Calendar", "Two-way booking sync"], ["Outlook Calendar", "Two-way booking sync"], ["Apple Calendar", "Subscribe to bookings"], ["Xero", "Export payouts and fees"], ["QuickBooks", "Export payouts and fees"]] as const).map(([x, d]) => <li key={x} className="ps-li ps-off"><span>{x}<small>{d}</small></span><b>Not available yet</b><Chip tone="grey">Unavailable</Chip></li>)}</ul>
        <p className="ps-sub">Need data in another tool today? Use <Link href="/provider/bookings/export?tab=upcoming">bookings CSV</Link>, <Link href="/provider/money?tab=statements">monthly statements</Link> or <Link href={`${base}?tab=developers`}>API keys &amp; webhooks</Link>.</p></>}
      {tab === "agent" && <><h2>Gala Agent</h2><p className="ps-sub">Gala Agent only proposes changes — every action needs approval on the <Link href="/provider/agent?tab=approvals">Approvals</Link> tab.</p>
        <ActionForm action={saveAgent} className="pt-form ps-form">{([["response_automation", "Response automation"], ["quote_generation", "Quote generation"], ["availability_management", "Availability management"], ["pre_event_confirmations", "Pre-event confirmations"]] as const).map(([k, l]) => <Toggle key={k} name={k} label={l} on={ag[k] !== false} />)}
          {owner && <div className="wide pv-form-foot"><button className="ws-btn primary">Save</button></div>}</ActionForm>
        <AgentCredits db={ctx.db} workspaceId={ws.id} canEdit={ctx.can.manage} canSeeUsage={ctx.can.finance} />
        <AgentControls db={ctx.db} workspaceId={ws.id} surface="provider" canManage={ctx.can.manage} /></>}
      {tab === "notifications" && <><h2>Notifications</h2><ActionForm action={saveNotifications} className="ps-notif"><table className="ws-table"><thead><tr><th>Event</th><th>Email</th><th>In-app</th><th>SMS</th></tr></thead>
        <tbody>{([["enquiries", "New enquiries"], ["bookings", "Booking updates"], ["agent", "Agent notifications"], ["mentions", "Team mentions"]] as const).map(([k, l]) => { const x = n[k] ?? { email: true, in_app: true }; return <tr key={k}><td>{l}</td>
          <td><input type="checkbox" name={`${k}_email`} defaultChecked={!!x.email} aria-label={`${l} email`} /></td><td><input type="checkbox" name={`${k}_app`} defaultChecked={x.in_app !== false} aria-label={`${l} in-app`} /></td><td><input type="checkbox" name={`${k}_sms`} defaultChecked={!!x.sms} aria-label={`${l} SMS`} /></td></tr>; })}</tbody></table>
        {owner && <div className="pv-form-foot"><button className="ws-btn primary">Save preferences</button></div>}</ActionForm></>}
    </section>}
    {tab !== "workspace" && <Link href={base} className="ws-back"><ArrowLeft aria-hidden="true" />Back to overview</Link>}
  </div>;
}
