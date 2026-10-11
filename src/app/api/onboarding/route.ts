import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasRequiredAssurance } from "@/lib/supabase/assurance";
import { safeNext } from "@/lib/redirects";
import { createInviteToken, rateLimit, sameOrigin } from "@/lib/security";
import { flowSteps, ruleIssues, validateStep, type Flow, type Values } from "@/lib/onboarding-schema";
import type { Json } from "@/types/database";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Your session has expired. Please log in again." }, 401);
  if (!(await hasRequiredAssurance(supabase))) return json({ error: "Complete multi-factor authentication first." }, 403);
  if (!(await rateLimit(`onboarding:${user.id}`, 60, 60))) return json({ error: "You’re saving too quickly. Please wait a moment and try again." }, 429);

  const body = await request.json().catch(() => null) as { flow?: string; step?: string; values?: Values; action?: string; next?: string } | null;
  if (!body || typeof body.values !== "object" || !body.values || JSON.stringify(body.values).length > 50_000) return json({ error: "Invalid setup data." }, 400);
  const flow = body.flow as Flow;
  const steps = flowSteps[flow];
  const index = steps?.findIndex(s => s.key === body.step) ?? -1;
  if (!steps || index < 0) return json({ error: "Unknown setup step." }, 400);
  const step = steps[index].key;
  const ownsPath = (path: unknown) => typeof path !== "string" || !path || path.startsWith(`${user.id}/`);

  if (flow === "customer" && body.action === "skip") {
    // Preferences are optional: skipping never blocks discovery or ticket purchases.
    await supabase.rpc("complete_customer_onboarding");
    return json({ next: safeNext(body.next, "/discover") });
  }
  if (flow === "customer") {
    const { values, errors } = validateStep("customer", step, body.values);
    if (Object.keys(errors).length) return json({ errors }, 422);
    const { error } = await supabase.from("profiles").update(values as never).eq("id", user.id);
    if (error) return json({ error: "Could not save your preferences. Please try again." }, 500);
    await supabase.rpc("complete_customer_onboarding");
    return json({ next: safeNext(body.next, "/discover") });
  }

  const { data: draft } = await supabase.from("workspaces").select("id,settings,capabilities")
    .eq("owner_id", user.id).eq("kind", flow).eq("onboarding_complete", false).maybeSingle();
  if (!draft && index === steps.length - 1 && body.action) {
    // Retried completion: the workspace is already active, so report it rather than creating another.
    const { data: done } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).eq("kind", flow)
      .eq("onboarding_complete", true).gte("created_at", new Date(Date.now() - 86_400_000).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (done) return json({ workspaceId: done.id, complete: true, next: `/${flow}`, invites: [], publish: null });
  }
  if (!draft && index > 0) return json({ error: "Start with step 1 to create your workspace.", next: `/onboarding/${flow}?step=1` }, 409);

  const capabilities = flow === "provider" ? (index === 0 ? undefined : draft?.capabilities ?? []) : undefined;
  const { values, errors } = validateStep(flow, step, body.values, { capabilities, ownerEmail: user.email?.toLowerCase() });
  if (Object.keys(errors).length) return json({ errors }, 422);
  if (!ownsPath(values.logo) || ![...((values.photos as string[]) ?? []), ...Object.values((values.documents as Values) ?? {})].every(ownsPath)) return json({ error: "Upload files again before saving." }, 400);

  if (flow === "provider" && step === "rules") {
    // Requested settings are stored as-is; effective eligibility is decided here, never by the toggle.
    values.effective = {
      booking_mode: values.booking_mode === "Instant Book" ? "Request to Book" : values.booking_mode,
      instant_book_eligible: false, emergency_eligible: false,
      reason: "Instant Book and emergency requests unlock after verification and a connected availability calendar.",
    };
    values.warnings = ruleIssues(values, capabilities ?? []).map(i => i.message);
  }

  let workspaceId = draft?.id;
  const settings = { ...((draft?.settings as Record<string, Json>) ?? {}), [step]: values as Json };
  if (!workspaceId) {
    const name = String(values.name);
    const insert = await supabase.from("workspaces").insert({ owner_id: user.id, kind: flow, name, settings, onboarding_step: step, capabilities: (values.capabilities as string[]) ?? [] }).select("id").single();
    if (insert.error?.code === "23505") {
      // A concurrent request created the draft first; reuse it.
      const { data } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).eq("kind", flow).eq("onboarding_complete", false).single();
      workspaceId = data?.id;
    } else if (insert.error) return json({ error: "Could not create your workspace. Please try again." }, 500);
    else workspaceId = insert.data.id;
    if (!workspaceId) return json({ error: "Could not create your workspace. Please try again." }, 500);
  }
  const update: { settings: Json; onboarding_step: string; name?: string; capabilities?: string[] } = { settings, onboarding_step: step };
  if (index === 0) { update.name = String(values.name); if (flow === "provider") update.capabilities = values.capabilities as string[]; }
  const saved = await supabase.from("workspaces").update(update).eq("id", workspaceId);
  if (saved.error) return json({ error: "Could not save this step. Please try again." }, 500);

  if (flow === "provider" && step === "offer") {
    const record = { workspace_id: workspaceId, name: String(values.listing_name), kind: String(values.kind), description: String(values.description), location: String(values.location), details: { ...values, source: "onboarding" } as Json };
    const { data: listing } = await supabase.from("listings").select("id").eq("workspace_id", workspaceId).eq("details->>source", "onboarding").limit(1).maybeSingle();
    const result = listing ? await supabase.from("listings").update(record).eq("id", listing.id) : await supabase.from("listings").insert(record);
    if (result.error) return json({ error: "Your workspace was saved, but the draft listing could not be saved." }, 500);
  }

  if (index < steps.length - 1) return json({ workspaceId, next: `/onboarding/${flow}?step=${index + 2}` });
  if (body.action !== "complete" && body.action !== "publish") return json({ workspaceId, saved: true });

  const completed = await supabase.rpc("complete_workspace_onboarding", { p_workspace: workspaceId });
  if (completed.error) return json({ error: completed.error.message.includes("capability") ? "Choose at least one capability in step 1." : "Could not activate your workspace. Please try again." }, 500);

  // Uploaded credentials become reviewable provider documents (never self-verified). Retries skip existing paths.
  if (flow === "provider") {
    const credentialKey: Record<string, string> = { public_liability: "public_liability", premises_licence: "premises_licence", food_hygiene: "food_hygiene", security_licence: "security_licence", pat_testing: "electrical_safety", health_safety: "fire_safety" };
    const docs = Object.entries((values.documents as Record<string, string>) ?? {}).filter(([k]) => credentialKey[k]);
    if (docs.length) {
      const { data: existing } = await supabase.from("provider_documents" as never).select("file_path").eq("workspace_id", workspaceId);
      const known = new Set(((existing ?? []) as { file_path: string }[]).map(d => d.file_path));
      const rows = docs.filter(([, path]) => !known.has(path)).map(([k, path]) => ({ workspace_id: workspaceId, credential_key: credentialKey[k], file_path: path, uploaded_by: user.id }));
      if (rows.length) {
        const { error } = await supabase.from("provider_documents" as never).insert(rows as never);
        if (error) return json({ error: "Your workspace is active, but your documents could not be submitted for review. Upload them again from Settings." }, 500);
      }
    }
  }

  // Invitations are created only now, after the workspace is committed. Retries skip existing pending invites.
  const origin = new URL(request.url).origin;
  const invites: { email: string; role: string; url: string }[] = [];
  for (const member of (values.members as { email: string; role: string }[]) ?? []) {
    const { token, hash } = createInviteToken();
    const { error } = await supabase.from("workspace_invites").insert({ workspace_id: workspaceId, email: member.email, role: member.role, token_hash: hash, invited_by: user.id });
    if (!error) invites.push({ ...member, url: `${origin}/invite/${token}` });
  }

  let publish: Json | null = null;
  if (flow === "provider" && body.action === "publish") {
    const { data: listing } = await supabase.from("listings").select("id").eq("workspace_id", workspaceId).eq("details->>source", "onboarding").maybeSingle();
    if (listing) publish = (await supabase.rpc("publish_listing", { p_listing: listing.id })).data;
  }
  return json({ workspaceId, complete: true, next: `/${flow}`, invites, publish });
}
