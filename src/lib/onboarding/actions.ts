"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type PortalType = "event_manager" | "venue_manager" | "supplier" | "customer" | "affiliate";

export interface OnboardingSession {
  id: string;
  portal_type: PortalType;
  status: string;
  current_step: string | null;
  completed_steps: string[];
  draft: Record<string, unknown>;
  workspace_draft_id: string | null;
}

type ActionResult<T = undefined> = { ok: true } & (T extends undefined ? unknown : { data: T }) | { ok: false; error: string };

const SESSION_COLUMNS =
  "id, portal_type, status, current_step, completed_steps, draft, workspace_draft_id";

/**
 * Finds the caller's active (non-completed, non-abandoned) onboarding session for
 * a portal, or starts a new one. This is what makes the wizard resumable across
 * devices/refreshes instead of relying on client-only state.
 */
export async function getOrStartOnboardingSession(
  portalType: PortalType,
  firstStep: string
): Promise<ActionResult<OnboardingSession>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: existing, error: fetchError } = await supabase
    .from("onboarding_sessions")
    .select(SESSION_COLUMNS)
    .eq("user_id", user.id)
    .eq("portal_type", portalType)
    .not("status", "in", "(completed,abandoned)")
    .maybeSingle();

  if (fetchError) return { ok: false, error: fetchError.message };
  if (existing) return { ok: true, data: existing as unknown as OnboardingSession };

  const { data: created, error: createError } = await supabase
    .from("onboarding_sessions")
    .insert({ user_id: user.id, portal_type: portalType, current_step: firstStep })
    .select(SESSION_COLUMNS)
    .single();

  if (createError) return { ok: false, error: createError.message };

  await supabase
    .from("onboarding_session_events")
    .insert({ session_id: created.id, event_type: "started", payload: { step: firstStep } });

  return { ok: true, data: created as unknown as OnboardingSession };
}

/**
 * Autosaves one wizard step's values into the session draft and advances
 * current_step. Safe to call repeatedly — merges into draft rather than
 * replacing it, and de-dupes completed_steps.
 */
export async function saveOnboardingStep(
  sessionId: string,
  step: string,
  values: Record<string, unknown>,
  nextStep?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: session, error: fetchError } = await supabase
    .from("onboarding_sessions")
    .select("draft, completed_steps")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError || !session) {
    return { ok: false, error: fetchError?.message ?? "Onboarding session not found" };
  }

  const mergedDraft = { ...((session.draft as Record<string, unknown>) ?? {}), [step]: values };
  const completedSteps = Array.from(
    new Set([...(((session.completed_steps as string[]) ?? [])), step])
  );

  const { error: updateError } = await supabase
    .from("onboarding_sessions")
    .update({ draft: mergedDraft, completed_steps: completedSteps, current_step: nextStep ?? step })
    .eq("id", sessionId)
    .eq("user_id", user.id);
  if (updateError) return { ok: false, error: updateError.message };

  await supabase
    .from("onboarding_session_events")
    .insert({ session_id: sessionId, event_type: "step_saved", payload: { step } });

  revalidatePath("/onboarding", "layout");
  return { ok: true };
}

/** Records the real workspace created mid-wizard against the session, for audit/resume. */
export async function setSessionWorkspaceDraft(
  sessionId: string,
  workspaceId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { error } = await supabase
    .from("onboarding_sessions")
    .update({ workspace_draft_id: workspaceId })
    .eq("id", sessionId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("onboarding_session_events")
    .insert({ session_id: sessionId, event_type: "workspace_created", payload: { workspace_id: workspaceId } });

  return { ok: true };
}

/**
 * Marks the session (and the caller's profile) complete. Idempotent: calling
 * this again on an already-completed session is a safe no-op, so a double
 * click/retry on the final step can never create duplicate side effects.
 */
export async function completeOnboarding(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: session, error: fetchError } = await supabase
    .from("onboarding_sessions")
    .select("status, portal_type")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError || !session) {
    return { ok: false, error: fetchError?.message ?? "Onboarding session not found" };
  }

  if (session.status === "completed") {
    revalidatePath("/onboarding", "layout");
    return { ok: true };
  }

  const { error: updateError } = await supabase
    .from("onboarding_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", user.id);
  if (updateError) return { ok: false, error: updateError.message };

  await supabase
    .from("onboarding_session_events")
    .insert({ session_id: sessionId, event_type: "completed", payload: {} });

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_state")
    .eq("user_id", user.id)
    .maybeSingle();
  const priorState = (profile?.onboarding_state as Record<string, unknown>) ?? {};

  await supabase
    .from("profiles")
    .update({
      onboarding_state: {
        ...priorState,
        completed: true,
        completed_at: new Date().toISOString(),
        [session.portal_type]: { completed: true, session_id: sessionId },
      },
    })
    .eq("user_id", user.id);

  revalidatePath("/onboarding", "layout");
  return { ok: true };
}

/**
 * Creates a real workspace invitation via the existing team_invite_create RPC
 * (same one the invite-acceptance flow at /accept-invite already expects) and
 * records it against the onboarding session draft. No email is sent yet — the
 * invite link is returned so the UI can show/copy it; wiring an email send is a
 * follow-up phase.
 */
export async function createOnboardingTeamInvite(
  sessionId: string,
  workspaceId: string,
  email: string,
  role: Database["public"]["Enums"]["workspace_role"] = "member"
): Promise<ActionResult<{ inviteUrl: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // Opaque token: the accept-invite flow treats this value as the token_hash
  // directly (see src/app/(auth)/accept-invite/accept-invite-form.tsx), so no
  // separate raw-token/hash split is introduced here — matches existing behaviour.
  const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");

  const { error } = await supabase.rpc("team_invite_create", {
    _workspace_id: workspaceId,
    _email: email.trim().toLowerCase(),
    _role: role,
    _token_hash: token,
  });
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("onboarding_session_events")
    .insert({ session_id: sessionId, event_type: "team_invited", payload: { email } });

  const inviteUrl = `/accept-invite?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  return { ok: true, data: { inviteUrl } };
}
