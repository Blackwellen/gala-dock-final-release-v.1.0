// Friendly text for Gala Agent refusal and error codes (agent_governance_refusal, agent_execute_tool, decide_agent_approval,
// start_agent_run, the run engine). Shared by the organiser and provider run / approval pages. Pure (no server or AI imports).

const TEXT: Record<string, string> = {
  // agent_governance_refusal (4029 / 4032)
  platform_kill_switch: "Gala Agent is switched off by Gala Dock while an issue is investigated. Nothing was changed.",
  workspace_kill_switch: "Gala Agent is switched off for this workspace. An owner or manager can switch it back on in Settings › Agent.",
  tool_disabled: "This action is temporarily disabled by Gala Dock. Do it yourself from the relevant page.",
  surface_not_allowed: "Gala Agent isn't available here.",
  tool_not_exposed: "This action isn't available to Gala Agent in this workspace type.",
  risk_r5_never: "Gala Agent never does this kind of action. Do it yourself from the relevant page.",
  workspace_required: "This run isn't attached to a workspace.",
  workspace_inactive: "This workspace isn't active, so Gala Agent can't act in it.",
  surface_mismatch: "This action belongs to a different kind of workspace.",
  plan_not_entitled: "Your plan doesn't include Gala Agent actions. Upgrade to Pro to let it carry out approved actions, or do this step yourself.",
  not_a_member: "The person this run acts for is no longer an active member of the workspace.",
  policy_blocks_tool: "Your workspace's Agent policy doesn't allow this action. An owner can change it in Settings › Agent.",
  approval_mismatch: "The approval doesn't belong to this step, so nothing was done.",
  approval_not_approved: "This step needs an approval first. Nothing was done.",
  approval_actor_mismatch: "Approved actions run as the person who approved them; this one was approved by someone else.",
  approval_args_mismatch: "The action changed after it was approved (different details from the approval card), so it was stopped. Review and approve it again.",
  exceeds_booking_authority: "This is above your workspace's booking authority, so only the workspace owner can approve it.",
  approval_required: "This step needs your approval before Gala Agent can carry it out.",
  rate_limited: "Too many of these actions in a short time. Gala Agent will retry shortly.",
  run_cancelled: "The run was cancelled, so this step wasn't carried out.",
  run_completed: "The run had already finished.",
  run_failed: "The run had already failed.",
  run_paused: "The run is paused. Resume it to continue.",
  // decide_agent_approval / step-up
  owner_approval_required: "This is above your workspace's booking authority, so only the workspace owner can approve it.",
  already_decided: "This approval has already been decided.",
  expired: "This approval expired. Ask Gala Agent to prepare it again.",
  step_up_required: "Verify your second factor, then approve again.",
  mfa_required: "This workspace requires two-step verification for your role.",
  session_revoked: "Your session has ended. Sign in again.",
  not_authorized: "You don't have permission to do this.",
  permission_denied: "You don't have the permission this action needs.",
  // start_agent_run / runtime
  agent_not_available_for_customers: "Gala Agent isn't available in personal accounts.",
  agent_disabled: "Gala Agent is switched off.",
  agent_paused_for_workspace: "Gala Agent is paused for this workspace.",
  agent_run_rate_limited: "Too many runs started recently. Try again in a little while.",
  ai_hard_cap: "This workspace has used its AI allowance for the period.",
  unknown_skill: "That skill isn't available for this workspace type.",
  skill_retired: "That skill has been retired. Pick another one.",
  goal_required: "Describe what you want Gala Agent to do.",
  tool_not_permitted: "One of the requested areas isn't available to Gala Agent here.",
  idempotency_key_reused: "That run was already started.",
  unsupported_surface: "Gala Agent can't start runs from here.",
  unknown_tool: "This step uses an action Gala Agent no longer has.",
  runtime_control_tool: "This step is handled by the run engine.",
  tool_failed: "The action failed. Nothing was changed; try again or do it yourself.",
};

/** Extracts a known code from a raw error ("refused: plan_not_entitled", "permission_denied:events.write", "plan_not_entitled — …"). */
export function agentRefusalCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /(?:^|refused:\s*|\b)([a-z][a-z0-9_]{2,60})(?=\b|:|\s|—|$)/g;
  for (const x of raw.matchAll(m)) if (TEXT[x[1]!]) return x[1]!;
  return null;
}

/** Friendly sentence for a refusal or error; unknown text is passed through trimmed (it is already human-written). */
export function agentRefusalText(raw: string | null | undefined, fallback = "Gala Agent couldn't complete this step."): string {
  if (!raw) return fallback;
  const code = agentRefusalCode(raw);
  if (code) return TEXT[code]!;
  const plain = raw.replace(/^refused:\s*/, "").trim();
  return /^[a-z0-9_:.]+$/.test(plain) ? fallback : plain.slice(0, 300);
}
