# RLS / definer matrix (Q01, 2026-10-28)

Enforcement: RLS on all 175 public tables; definer RPCs authorise internally; client roles are least-privilege.

**Membership rule:** workspace data requires an ACTIVE member of an ACTIVE workspace (`is_workspace_member` / `has_workspace_role` / `has_permission`). "owner_id = me" grants access only to personal rows (`workspace_id is null`).

**Client grants:** anon = SELECT only (RLS-filtered); authenticated = SELECT/INSERT/UPDATE/DELETE or column grants (RLS-filtered); no TRUNCATE/REFERENCES/TRIGGER for either.

**Service-only tables (no client privileges):** calendar_connections, calendar_sync_links, checkout_resale_allocations, launch_queue, mfa_recovery_codes, rate_limits, resale_holds, state_machines, state_transitions, state_violations, storage_attribution, storage_backups, stripe_refund_totals, ticket_holds, webhook_events.

**Protected workspace settings keys (server-side only):** entitlements, flags, security, beta, residency (trigger `guard_workspace_protected_settings`).

**Step-up (`require_step_up`):** live session; aal2 if the user has a verified factor; workspace MFA policy by role. Applies to API keys, webhooks, member roles, promoter payout method, event cancellation with refunds and all admin mutations (`admin_require`).

| Actor (backend §16) | Workspace data | Definer RPCs | Evidence |
|---|---|---|---|
| anonymous | public catalogue only; no writes | allow-list of 33 public/token RPCs | tenant-security: catalogue, anonymous |
| unrelated tenant / guessed UUID | none | not_authorized / forbidden | tenant-security: cross-tenant |
| other venue's space | slot taken only (no ids/notes) | `space_conflicts` redacted | tenant-security: space conflicts |
| revoked member | none (immediately, same JWT) | `has_permission` false | tenant-security: revoked |
| suspended workspace (incl. owner) | none except its own workspace row | false | tenant-security: suspended |
| owner/member/finance roles | per role_permissions | role-checked | rls.spec, foundation.spec |
| aal1 session of an MFA user | reads per RLS | sensitive RPCs refused | tenant-security: step-up |
| revoked session (token not expired) | reads until JWT expiry (3600 s) | sensitive RPCs refused | tenant-security: session revocation |
| service role / cron | bypass (trusted workers only) | service-only functions | catalogue audit |

## Definer audit (406 → 413 functions)

37 trigger, 77 service-only, 249 identity-checked, 43 reviewed individually.

**Fixed (migration 202610291001):** payout_eligible, cancellation_quote, space_conflicts, event_virtual_public, contact_support, can_access_event, can_edit_event, can_see_event_money, template_usable, template_used, rls_auto_enable.

**Open (low):** `record_boost_event` counter inflation (no rate limit); `event_launch_state` draft disclosure; `catering_price` / `venue_quote` on unpublished items; ~180 pattern-matched functions not line-reviewed.

**Open (medium-low):** owners can write `workspaces.capabilities` directly through REST, bypassing `provider_save_settings` validation.

## Auth configuration (read-only, 2026-10-28)

jwt_exp 3600 s (revoked session's token still passes RLS reads until expiry; sensitive RPCs refuse it); password_min_length 6; captcha OFF (release blocker T1); Supabase WebAuthn MFA off (passkeys are the app's own).

Automated check: service-only `security_catalog_audit()`; suite `tests/release/tenant-security.spec.ts`.
