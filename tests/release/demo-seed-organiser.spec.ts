// Depth seed pass 3 (lane D · SEED, scripts/seed-depth-pass3.mjs): organiser-workspace depth on Alex Events. Read-only checks of the
// seeded state (the seed itself is run by hand; this spec never writes). Uses the Management API SQL endpoint like demo-seed.spec.ts.
import { test, expect } from "@playwright/test";

const SQL = async (query: string) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, { method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_PAT_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  expect(r.ok, await r.clone().text()).toBe(true);
  return (await r.json()) as Record<string, unknown>[];
};
const WS = "75e6c471-8d5e-4b9f-b076-ff10cf209f01", NEON = "392fdf17-4e5c-4473-987c-251dc0a97228", GTC = "69a0c90c-1b4d-42f1-ab0a-4bdcbba71ca7",
  COMEDY = "b52e0eae-5de4-46f7-8ba2-2e8861aa8555", AVA = "37390853-e3a7-4166-b3c9-f5d6b39f6f50";

test.describe("Depth seed pass 3 (organiser)", () => {
  test("a completed depth-pass3 run is recorded and the last run created nothing", async () => {
    const runs = await SQL(`select status, summary from sandbox_seed_runs where seed = 'depth-pass3' and status in ('completed','partial') order by started_at desc limit 1`);
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe("completed");
    const s = (runs[0].summary as Record<string, Record<string, unknown>>).organiser;
    expect(s.error).toBeUndefined();
    for (const [k, v] of Object.entries(s)) if (typeof v === "number" && k !== "resale_eligible_tickets") expect(v, `${k} on re-run`).toBe(0);
  });

  test("team: Ava is linked by an accepted crew invite; leave in three states", async () => {
    const [c] = await SQL(`select
      (select count(*) from crew_members c join auth.users u on u.id = c.user_id where c.id = '${AVA}' and u.email = 'ava.thompson@example.com')::int linked,
      (select count(*) from workspace_invites where crew_id = '${AVA}' and accepted_at is not null)::int accepted,
      (select count(*) from workspace_members m join crew_members c on c.user_id = m.user_id where c.id = '${AVA}' and m.workspace_id = '${WS}' and m.status = 'active')::int member,
      (select count(*) from leave_requests where workspace_id = '${WS}' and status = 'pending')::int pending,
      (select count(*) from leave_requests where workspace_id = '${WS}' and status = 'approved' and block_id is not null)::int approved,
      (select count(*) from leave_requests where workspace_id = '${WS}' and status = 'rejected' and decided_by is not null)::int rejected`);
    expect(c).toMatchObject({ linked: 1, accepted: 1, member: 1 });
    for (const k of ["pending", "approved", "rejected"]) expect(Number(c[k]), k).toBeGreaterThanOrEqual(1);
  });

  test("Global Tech: registrations in several states, venues + day, online session with replay", async () => {
    const regs = await SQL(`select r.status, count(*)::int n from registrations r join registration_forms f on f.id = r.form_id
      where f.event_id = '${GTC}' and f.status = 'published' and f.approval_required group by 1`);
    const by = Object.fromEntries(regs.map(r => [r.status, r.n]));
    for (const s of ["approved", "rejected", "pending_approval", "waitlisted"]) expect(Number(by[s] ?? 0), s).toBeGreaterThanOrEqual(1);
    const [g] = await SQL(`select (select count(*) from event_venues where event_id = '${GTC}')::int venues,
      (select count(*) from event_days d join event_venues v on v.id = d.event_venue_id where d.event_id = '${GTC}' and v.role = 'primary')::int bound_days,
      (select count(*) from virtual_recordings r join virtual_sessions s on s.id = r.session_id where s.event_id = '${GTC}' and s.title = 'Online track: Scaling live-event platforms')::int replays`);
    expect(g).toMatchObject({ venues: 3, bound_days: 1, replays: 1 });
  });

  test("Neon: purchase-limit risk flags, forms with responses, dependencies with a pending approval, estimated sustainability", async () => {
    const [n] = await SQL(`select
      (select count(*) from ticket_risk_flags where event_id = '${NEON}' and kind = 'purchase_limit' and status = 'open')::int flags,
      (select count(*) from ticket_holds where event_id = '${NEON}' and expires_at > now() and qty = 9)::int stray_holds,
      (select count(*) from event_forms where event_id = '${NEON}' and status = 'published')::int forms,
      (select count(*) from form_responses where event_id = '${NEON}')::int responses,
      (select count(*) from form_responses where event_id = '${NEON}' and status = 'accepted')::int accepted,
      (select count(*) from event_dependencies where event_id = '${NEON}')::int deps,
      (select count(*) from event_dependencies where event_id = '${NEON}' and prerequisite_kind = 'approval' and approval_status = 'pending')::int pending_approval,
      (select count(*) from sustainability_entries where event_id = '${NEON}' and method = 'estimated')::int estimated`);
    expect(Number(n.flags)).toBeGreaterThanOrEqual(2);
    expect(n.stray_holds).toBe(0);   // the seed always releases its reservation
    expect(n).toMatchObject({ forms: 2, responses: 4, accepted: 2, deps: 5, pending_approval: 1 });
    expect(Number(n.estimated)).toBeGreaterThan(0);
  });

  test("Summer Sessions: lost report matched to a found item; measured sustainability", async () => {
    const [l] = await SQL(`with e as (select id from events where slug = 'summer-sessions-2026')
      select (select count(*) from lost_reports where event_id = (select id from e) and status = 'matched')::int matched,
             (select count(*) from found_items where event_id = (select id from e))::int found,
             (select count(*) from lost_claims c join lost_reports r on r.id = c.report_id where r.event_id = (select id from e))::int claims,
             (select count(*) from sustainability_entries where event_id = (select id from e) and method = 'measured')::int measured`);
    expect(l).toMatchObject({ matched: 1, found: 3, claims: 1 });
    expect(Number(l.measured)).toBeGreaterThan(0);
  });

  test("Comedy Central: sponsor + talent with slots and riders, logistics, test-fixture portal login", async () => {
    const [c] = await SQL(`select
      (select count(*) from event_parties where event_id = '${COMEDY}')::int parties,
      (select count(*) from event_parties where event_id = '${COMEDY}' and kind = 'sponsor' and status = 'confirmed')::int sponsors,
      (select count(*) from event_party_slots where event_id = '${COMEDY}')::int slots,
      (select count(*) from event_party_slots where event_id = '${COMEDY}' and role = 'headline' and status = 'confirmed')::int headline,
      (select count(*) from talent_riders where event_id = '${COMEDY}')::int riders,
      (select count(*) from transport_movements where event_id = '${COMEDY}')::int transport,
      (select count(*) from parking_permits where event_id = '${COMEDY}')::int permits,
      (select count(*) from room_allocations where event_id = '${COMEDY}')::int rooms,
      (select count(*) from logistics_windows where event_id = '${COMEDY}')::int windows,
      (select count(*) from event_parties p join auth.users u on u.id = p.portal_user_id where p.event_id = '${COMEDY}' and public.is_test_identity_email(u.email))::int fixture_portal,
      (select count(*) from event_parties p join auth.users u on u.id = p.portal_user_id join workspace_members m on m.user_id = u.id where p.event_id = '${COMEDY}')::int portal_memberships`);
    expect(c).toMatchObject({ parties: 4, sponsors: 1, slots: 3, headline: 1, riders: 2, transport: 1, permits: 1, rooms: 1, windows: 2, fixture_portal: 1, portal_memberships: 0 });
  });

  test("marketplace detail pages have seeded ids: an emergency request with candidates and an open dispute (no money)", async () => {
    const [m] = await SQL(`select
      (select count(*) from emergency_requests r where r.event_id = '${NEON}' and r.failure_reason like 'Demo:%' and exists (select 1 from emergency_candidates c where c.request_id = r.id))::int emergencies,
      (select count(*) from booking_disputes d join events e on e.id = d.event_id where e.workspace_id = '${WS}' and d.status = 'opened' and d.amount_claimed is null)::int disputes,
      (select count(*) from booking_dispute_entries x join booking_disputes d on d.id = x.dispute_id join events e on e.id = d.event_id where e.workspace_id = '${WS}')::int entries`);
    expect(m).toMatchObject({ emergencies: 1, disputes: 1 });
    expect(Number(m.entries)).toBeGreaterThanOrEqual(1);
  });
});
