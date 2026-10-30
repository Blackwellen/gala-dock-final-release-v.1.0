# Licensing, compliance, safety, accessibility and weather (Q26, domains 158–162)

Migration 202610293017. Tests: `tests/compliance/q26-licensing-safety.spec.ts` (7).

## Rule packs (data, per jurisdiction)
`compliance_rule_packs` (country, region, version, effective_from, active) → `compliance_rules`: `applies` {event_types, min/max_attendance, all/any facts, public}, `satisfied_by` {licence_types, venue/supplier/organizer credential (Q08), safety_plans, contingency, accessibility}, severity required | recommended, lead_days, fix_text. Seeded `gb-eng-wal` (England & Wales, 15 rules; **legal review needed — not a statement of compliance**): premises licence or TEN, 499 TEN cap, DPS alcohol supervision, late-night refreshment, PRS for Music + PPL, child performance licences, SIA door supervision, event safety plan (500+ / outdoor), crowd plan (2,000+), Safety Advisory Group (5,000+, recommended), safeguarding, outdoor weather contingency, accessibility information (recommended), insurance (recommended). Add a country by inserting a pack.

## Facts
`event_compliance_profiles` (`compliance_profile_save`): country/region, alcohol, live/recorded music, late night, hot food, children performing, outdoor, attendance. Unanswered facts derived (`event_compliance_facts`) from capacity/guests, end time, outdoor spaces, bookings, artists, format, visibility. Country default: workspace `settings.country`, else GB.

## Licences
`event_licences` machine `event_licence`: draft → submitted → granted | refused; granted → expired | revoked; not_required needs a reason; granting needs a reference (and valid_to for expiring types). Requirement status per rule: met | waived | pending | missing | expired | refused.

## Safety plans
`safety_plans` (9 kinds), machine `safety_plan`, versioned, immutable once submitted; `safety_plan_decide` (manager, not the author unless owner; approval supersedes the previous version).

## Accessibility
`event_accessibility` (step-free, toilets, Changing Places, hearing loop, BSL, captioning, quiet space, accessible + companion seats, route = Q19 map refs). Public summary only after `accessibility_approve_summary`; `event_compliance_public(event)` is authenticated-only (anon needs coordinator approval). Guest needs = counts from `guest_care` flags → blockers for missing step-free access / too few accessible seats.

## Weather and contingency
`weather_watches`, `weather_alerts` (deduplicated), `contingency_plans`. Adapter `src/lib/weather/provider.ts` (env `WEATHER_PROVIDER`, `WEATHER_API_KEY`; health in `/api/health` → contracts.weather). App job `weather.poll` every 3 h while watches are active; no provider → watches `not_configured` → readiness warning BLOCKED_EXTERNAL. Severe alert without an approved contingency plan = blocker.

## Expiry monitoring
Job `compliance.expiry_daily` (cron 02:35): expire lapsed licences, reminders 30/14/7/1 days (deduplicated), safety-plan review dates, end past watches.

## Readiness (exit gate)
Every failed REQUIRED rule → blocker with fix text, deadline and fix link; pending → warning (blocker < 2 days); recommended → warning. Visible in `event_ops_readiness`, `event_feasibility` → `event_readiness`, `event_ops_blockers`. Upcoming organiser events only. Live impact: 8 live organiser events now show compliance blockers.

## Open
BLOCKED_EXTERNAL weather provider; legal review of the rule pack; UI (Plan › Compliance / Accessibility, Operations › Weather); lifecycle gating via `event_ops_blockers`; anon access for `event_compliance_public`; demo seed (Q38).
