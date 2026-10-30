# Platform admin access (Q31, 2026-10-29)

Migrations 202610292001–2002, 2007. Tests: `tests/admin/w08-admin-tiers.spec.ts`, `tests/release/maintenance.spec.ts`.

## Every admin mutation needs MFA

`admin_mfa_required()` refuses any platform admin whose session is not aal2 (`step_up_required`). aal2 implies a verified factor, so an admin who never enrolled cannot mutate. It runs inside `admin_require(perm, reason)` and is the first statement of every admin mutation that checked only a permission (17 functions). Non-admin callers fall through to `not_authorized`; service role / cron is unaffected. M4/M5 maintenance and break-glass opens also need a fresh factor (`bg_step_up_ok`, 10 min). Tests: enrol a factor with `enrolTotp(client)` (`tests/phase1/helpers.ts`).

## Reasons

`admin_require` needs a reason of at least 5 characters. Maintenance start/end use it. Legacy start payloads without a `reason` key are accepted and audited `legacy_reason=true` until the new form deploys — **remove that fallback after deploy**. Credit grants use the reference as the reason.

## Email outbox

Members read their own emails. Admins never read `email_outbox` through REST:

- metadata: `admin_email_deliveries(status, category, user, limit)` and `admin_email_backlog()` (support / settings / agent_ops); no subject, body or link;
- bodies: `admin_open_email(grant, email)` — own ACTIVE break-glass grant, recipient must be one of the grant's affected users, fresh factor, audited `admin.break_glass_email_opened`.

Message-notification emails carry no message text, only a link to the inbox (PECR / minimisation). The 7 pre-fix message emails still hold previews — redaction is a Q32 decision.

## Admin directory

`platform_admins`: own row for every admin; all rows only with `users` or `settings`. The break-glass page uses `admin_break_glass_approvers()` (a count).

## Maintenance

Windows have an audience (all / customers / organizers / providers / admins). Proxy `decide()` filters by the request surface (`audiencesFor`); the database uses `maintenance_level(module, audiences[])` / `assert_writable(module, audiences[])` with the writer's audiences (`maintenance_audiences`, service-only). Audience `qa` is test-only: never in `maintenance_state()`, never in the one-argument functions, never a real user's audience, refused by `start_maintenance`. `tests/release/maintenance.spec.ts` uses only qa windows and is safe on the shared database.

## Other

`admin_set_partner_status` raises `not_found` for unknown ids without auditing.
