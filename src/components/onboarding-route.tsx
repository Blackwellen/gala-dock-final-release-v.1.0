import "server-only";
import { redirect } from "next/navigation";
import { OnboardingPage, type Flow, type OnboardingContext } from "./onboarding";
import { requireUser, listWorkspaceAccess } from "@/lib/auth";
import { safeNext } from "@/lib/redirects";
import { countryByName, flowSteps, type Values } from "@/lib/onboarding-schema";
import { previewOnboardingProps } from "@/lib/preview-data";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export function initialsOf(name: string, email: string) {
  const parts = (name || email.split("@")[0]).split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "GD";
}

/** Defaults for each step, seeded from earlier steps so locale and currency stay consistent. */
function defaults(flow: Flow, key: string, settings: Record<string, Values>, user: { name: string; email: string }): Values {
  const base = settings.organisation ?? settings.business ?? {};
  const c = countryByName(base.country);
  switch (key) {
    case "preferences": return { full_name: user.name, home_area: "", currency: "GBP", interests: [], notifications: ["recommendations", "updates"] };
    case "organisation": return { name: "", legal_name: "", business_type: "Event Management Company", website: "", country: c.name, timezone: c.timezones[0].value, currency: c.currency };
    case "operating": return { event_types: [], event_access: "Both", ticketing: true, client_work: true, multi_venue: false, capacity: "51–250", procurement: "Both" };
    case "brand": return { logo: "", brand_color: "#2563EB", support_email: user.email, invoice_prefix: String(base.name ?? "INV").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(2, "X"), tax_setting: c.tax[0], payment_terms: "14 days" };
    case "team": return { members: [], notifications: ["enquiries", "payments", "team"], first_event_template: "" };
    case "business": return { name: "", legal_name: "", country: c.name, timezone: c.timezones[0].value, currency: c.currency, location: "", coverage: "Within 50 miles", capabilities: [], service_categories: [] };
    case "offer": {
      const caps = (base.capabilities as string[]) ?? ["venue"];
      return { kind: caps[0] ?? "venue", listing_name: "", description: "", location: String(base.location ?? ""), photos: [], event_types: [], venue_type: "Event hall", capacity: "", amenities: [],
        category: ((base.service_categories as string[]) ?? [])[0] ?? "", subcategory: "", delivery_mode: "On-site at the event", coverage: String(base.coverage ?? "Within 50 miles"), pricing_mode: "Quote on request" };
    }
    case "rules": return { booking_mode: "Request to Book", response_time: "Within 4 hours", lead_time: "At least 7 days", cancellation_policy: "Standard – 50% refund up to 14 days before", conditional_holds: true, hold_duration: "48 hours", standby: false, emergency: false, response_notifications: ["email"], payout_currency: String(base.currency ?? c.currency) };
    case "trust": return { documents: {}, members: [] };
    default: return {};
  }
}

export async function OnboardingRoute({ flow, searchParams, preview = false }: { flow: Flow; searchParams: Promise<Search>; preview?: boolean }) {
  const search = await searchParams;
  const requested = Number(one(search.step) ?? 1);
  const steps = flow === "experience" ? null : flowSteps[flow];
  const step = steps ? (Number.isInteger(requested) && requested >= 1 && requested <= steps.length ? requested : 1) : 0;
  if (preview) return <OnboardingPage key={`${flow}-${step}`} {...previewOnboardingProps(flow, step)} />;

  const next = safeNext(one(search.next), "");
  const self = `/onboarding${flow === "experience" ? "" : `/${flow}?step=${step}`}`;
  const { supabase, user } = await requireUser(self);
  const { data: profile } = await supabase.from("profiles").select("full_name,home_area,currency,interests,notifications").eq("id", user.id).maybeSingle();
  const name = profile?.full_name || String(user.user_metadata?.full_name ?? "");
  const identity = { name, initials: initialsOf(name, user.email ?? ""), email: user.email ?? "" };
  const context: OnboardingContext = {};

  if (flow === "experience") {
    const [access, { data: invites }] = await Promise.all([listWorkspaceAccess(supabase), supabase.rpc("my_pending_invites")]);
    context.existing = access.filter(w => w.member_status === "active" && w.workspace_status === "active" && w.onboarding_complete).map(w => ({ id: w.id, name: w.name, kind: w.kind }));
    context.invites = invites ?? [];
    return <OnboardingPage key={`${flow}-${step}`} flow={flow} step={0} initial={{}} next={next} user={identity} context={context} />;
  }
  if (flow === "customer") {
    const initial = { ...defaults(flow, "preferences", {}, identity), ...(profile ? { full_name: name, home_area: profile.home_area, currency: profile.currency, interests: profile.interests, notifications: Array.isArray(profile.notifications) ? profile.notifications : ["recommendations", "updates"] } : {}) };
    return <OnboardingPage key={`${flow}-${step}`} flow={flow} step={1} initial={initial} next={next} user={identity} context={context} />;
  }

  const key = steps![step - 1].key;
  const { data: draft } = await supabase.from("workspaces").select("id,name,settings,capabilities,payout_status,verification_status")
    .eq("owner_id", user.id).eq("kind", flow).eq("onboarding_complete", false).maybeSingle();
  const settings = (draft?.settings as Record<string, Values>) ?? {};
  // Steps must be completed in order; jumping ahead returns to the first unsaved step.
  const firstUnsaved = steps!.findIndex(s => !settings[s.key]) + 1 || steps!.length;
  if (!draft && step > 1) redirect(`/onboarding/${flow}?step=1`);
  if (draft && step > firstUnsaved) redirect(`/onboarding/${flow}?step=${firstUnsaved}`);
  if (step === 1 && !draft) {
    const access = await listWorkspaceAccess(supabase);
    context.existing = access.filter(w => w.kind === flow && w.role === "owner" && w.onboarding_complete).map(w => ({ id: w.id, name: w.name, kind: w.kind }));
  }

  const base = settings.organisation ?? settings.business ?? {};
  Object.assign(context, {
    capabilities: draft?.capabilities ?? [], categories: (base.service_categories as string[]) ?? [], country: countryByName(base.country).name,
    currency: String(base.currency ?? "GBP"), bookingMode: String(settings.rules?.booking_mode ?? "Request to Book"),
    payoutStatus: draft?.payout_status ?? "not_connected", verificationStatus: draft?.verification_status ?? "unverified",
    workspaceName: draft?.name, payoutsResult: one(search.payouts),
  } satisfies OnboardingContext);

  const signed = async (path: unknown) => typeof path === "string" && path.startsWith(`${user.id}/`)
    ? (await supabase.storage.from("workspace-files").createSignedUrl(path, 3600)).data?.signedUrl ?? null : null;
  if (key === "brand") context.logoUrl = await signed(settings.brand?.logo);
  if (key === "team") {
    const org = settings.organisation ?? {};
    const c = countryByName(org.country);
    context.summary = { name: draft?.name ?? String(org.name ?? ""), businessType: String(org.business_type ?? "—"), location: `${c.name} (${c.timezones.find(t => t.value === org.timezone)?.label ?? org.timezone ?? ""})`, currency: String(org.currency ?? c.currency) };
  }
  if ((key === "offer" || key === "trust") && draft) {
    const { data: listing } = await supabase.from("listings").select("id,name,kind,location,description,details").eq("workspace_id", draft.id).eq("details->>source", "onboarding").maybeSingle();
    const details = (listing?.details ?? {}) as Values;
    context.listing = listing ? {
      name: listing.name, kind: listing.kind, location: listing.location, description: listing.description,
      detail: listing.kind === "venue" ? `Up to ${details.capacity ?? "—"} guests` : String(details.category ?? "Service"),
      photoUrl: await signed((details.photos as string[] | undefined)?.[0]),
    } : null;
    if (listing && key === "trust") {
      const { data } = await supabase.rpc("listing_readiness", { p_listing: listing.id });
      context.readiness = data as { eligible: boolean; missing: string[] };
    } else if (key === "trust") context.readiness = { eligible: false, missing: ["listing_name"] };
  }
  const initial = { ...defaults(flow, key, settings, identity), ...(settings[key] ?? {}) };
  return <OnboardingPage key={`${flow}-${step}`} flow={flow} step={step} initial={initial} next={next} user={identity} context={context} />;
}
