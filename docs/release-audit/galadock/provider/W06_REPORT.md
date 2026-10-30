# W06 — Agency supplier (provider team mode)

Run 2026-10-28 · lane B · `provider.demo@example.com` on Riverside Arena `960fab34-54fc-40a0-85ab-cc4ea6197701` (no switch). **No agency demo identity (Q38):** no workspace has manager/Staff/finance logins; Riverside's 8 crew have no logins. Evidence `artifacts/visual/w06/` (before 3, after 5, phone 2, census.json). Spec `tests/provider/w06-agency.spec.ts`.

## Summary

| Item | Result |
|---|---|
| States | 11 (team, 3 tabs, 2 dialogs, member ×5 states, settings team) |
| Fidelity | PROV-013 matched (data drift) · PROV-014 matched after F12 · phone no overflow (dense-ref drift, W12) |
| Census | 399 controls, 0 broken, 0 page errors |
| Tests | 9: 6 pass, 3 expected-fail (Q12/Q17 race, Q01/Q17 RLS bypass, Q01 revoke) |
| tsc / eslint | 0 / 0 |

## GD-07 checklist

| Area | Status |
|---|---|
| Verification | partial (workspace docs only, Q08) |
| Roles | partial (owner/manager/staff/finance; no admin/contractor) |
| Invite/accept/role change | working (tested) |
| Crew deactivation | working (tested) |
| Login revoke/suspend | missing (Q01) |
| Skills/certs/expiry | partial (no alerts/insurance) |
| Equipment/resources | missing (Q17) |
| Lead pool/assignment | missing (Q12) |
| Quote approval matrix | partial (owner/manager only, no limits) |
| Overlap prevention | partial: sequential OK, concurrent race + direct-write bypass (Q12/Q17, Q01) |
| Shifts/leave/travel | partial (warnings only; no substitution/leave approval) |
| Member vs master calendar | working |
| Assignment notifications | missing (Q05) |
| Member portal | missing (Q17) |
| Payout allocation/splits/expenses/profitability | missing (Q07/Q27) |
| Member-level reviews | missing (Q09/Q12) |
| Agent role scopes | working (code: `agent_invoke` has_permission); no per-role limits (Q43) |

## Fixes

| # | File | Change |
|---|---|---|
| F12 | `src/styles/provider-team.css:99` | upcoming-assignment status chip no longer wraps/overflows |
| F13 | `src/app/provider/team/page.tsx:30,61-66,106` | management controls owner/manager only; invite owner only |
| F14 | `src/app/provider/team/page.tsx:62-66,143-145` | fake "Invite member" (created a crew row) → real Settings invite; crew-only dialog with honest note |
| F15 | `src/app/provider/team/page.tsx:129`, css `:103-105` | unstaffed warning links to the booking |
| F16 | `src/app/provider/team/[id]/page.tsx:55,110,147` | edit/availability/deactivate/certification gated; permissions link owner-only / "Invite to Gala Dock" |
| F17 | `src/app/provider/team/[id]/page.tsx:157` | future shifts no longer "just now" |
| F18 | `src/styles/provider-team.css:61` | assignments heading spacing |
| F19 | `src/app/provider/settings/page.tsx:121-123`, `actions.ts:65`, `provider-settings.css:77` | member names instead of id fragment; owner role change (`set_member_role`) |
| F20 | `src/app/provider/settings/page.tsx:159` | Back link arrow icon |

## Tests (`tests/provider/w06-agency.spec.ts`)

Pass: invite→accept exact role + single use · wrong-recipient mismatch · escalation refused (self, manager, direct write, manager invite, staff crew RPC) · cross-agency 0 rows / 5 RPCs refused · sequential overlap refused · departure while assigned refused → reassign → deactivate → cannot reassign.

Expected-fail: **Q12/Q17** concurrent assignment by two managers doubles up (intermittent; 15 pairs) · **Q01/Q17** Staff can write crew_members/shifts directly · **Q01** owner cannot revoke a membership. (First two handed to lane A Q12 on 2026-10-28.)

## Backend gaps

| Packet | Gap |
|---|---|
| Q01 (P1 security) | crew_members/shifts write RLS = any member → owner/manager or RPC-only |
| Q01 (P1) | membership suspend/revoke/remove RPC |
| Q01 (P2) | admin/contractor roles; member directory RPC; co-owner vs owner_id inconsistency; manager invites; invite email |
| Q12/Q17 (P1) | assignment race: crew row lock or shifts exclusion constraint (also count draft) |
| Q12/Q17 | substitution RPC, leave approval, travel buffer enforcement, equipment/resources, work orders, crew↔login link + member "my shifts", lead assignee |
| Q05 | assignment / availability-request notifications |
| Q07/Q27 | member cost, payout allocation, commission splits, expenses, per-job profitability |
| Q08 | agency verification; member insurance/cert expiry jobs |
| Q09/Q12 | member-level reviews |
| Q10/Q12 | quote approval matrix (value limits / second approver) |
| Q43 | per-role agent limits; staffing tools |
| Q38 | agency seed (multi-login roles, linked crew, certs, leave); odd second owner on Riverside; Tech Meetup unstaffed |

## Left for W06

1. Agency seed (Q38), then re-capture with Staff/Finance logins. 2. Q01/Q12/Q17 fixes, then flip the 3 `test.fail`s. 3. Run the state-changing controls on a disposable agency. 4. Per-region diff %. 5. Dense phone layout (W12).

## Browser block 2026-10-29 (lane A)
Agency identity Northern Crew Agency captured as owner (6 routes × 6) and staff (5 × 6) (`artifacts/visual/w06/{after-owner,after-staff,verify}`). Fix: team member certification shapes + unique keys. F13/F16 visually confirmed: staff login sees no invite or management controls. PROV-013/014 6.1/6.5%. Census clean.
