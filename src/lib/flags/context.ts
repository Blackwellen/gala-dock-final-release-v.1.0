// Gala Dock — server-side persona + flag context (F3).
//
// Resolves the active workspace's persona (workspace_type), release stage and plan,
// then computes the flag map via the F1 resolver. Reads the new columns defensively so
// it works both before the F1 migration is applied (falls back to organizer / env stage)
// and after (uses the real values). Resolve this ONCE in a server layout and pass the
// serializable result down to the client shell.
//
// See docs/specs/README.md (F3) and ./resolve.

import { requireWorkspace, getActiveWorkspaceId } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { resolveFlags, type FlagMap } from "./resolve";
import { type ReleaseStage, type WorkspaceType } from "./registry";

const VALID_TYPES: readonly WorkspaceType[] = ["organizer", "venue", "supplier"];
const VALID_STAGES: readonly ReleaseStage[] = ["v1", "v1_5", "v2"];

/** Global rollout stage from env; defaults to v1. */
export function globalReleaseStage(env: Record<string, string | undefined> = process.env): ReleaseStage {
  const v = env.RELEASE_STAGE ?? env.NEXT_PUBLIC_RELEASE_STAGE;
  return VALID_STAGES.includes(v as ReleaseStage) ? (v as ReleaseStage) : "v1";
}

export interface PersonaContext {
  workspaceId: string | null;
  workspaceType: WorkspaceType;
  releaseStage: ReleaseStage;
  plan: string;
  flags: FlagMap;
  workspaceName: string | null;
}

function personaFromRow(workspaceId: string | null, row: Record<string, unknown> | null): PersonaContext {
  const workspaceType: WorkspaceType = VALID_TYPES.includes(row?.workspace_type as WorkspaceType)
    ? (row!.workspace_type as WorkspaceType)
    : "organizer";
  const releaseStage: ReleaseStage = VALID_STAGES.includes(row?.release_stage as ReleaseStage)
    ? (row!.release_stage as ReleaseStage)
    : globalReleaseStage();
  const plan = typeof row?.plan === "string" ? (row.plan as string) : "free";
  const workspaceName = typeof row?.name === "string" ? (row.name as string) : null;
  return {
    workspaceId,
    workspaceType,
    releaseStage,
    plan,
    workspaceName,
    flags: resolveFlags({ workspaceType, releaseStage, plan }),
  };
}

/**
 * Resolve persona context WITHOUT redirecting. Returns safe organizer defaults when there is
 * no authenticated workspace (the proxy/middleware already enforces auth at the edge). Use this
 * in the app layout so the shell renders persona-aware nav without owning the auth redirect.
 */
export async function getOptionalPersonaContext(): Promise<PersonaContext> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return personaFromRow(null, null);
  const supabase = await createClient();
  const { data } = await supabase.from("workspaces").select("*").eq("id", workspaceId).maybeSingle();
  return personaFromRow(workspaceId, (data as Record<string, unknown>) ?? null);
}

/**
 * Require a workspace and resolve its persona context + flags.
 * Redirects (via requireWorkspace) when unauthenticated / no workspace.
 */
export async function getPersonaContext(): Promise<PersonaContext> {
  const { workspaceId, workspace } = await requireWorkspace();
  // workspace_type / release_stage read defensively via personaFromRow.
  return personaFromRow(workspaceId, workspace as unknown as Record<string, unknown>);
}
