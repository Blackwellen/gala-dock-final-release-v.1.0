import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Q16 Organizer CRM / proposals / contracts (domains 51–56) — API-level, disposable identities, RLS-bound user clients.
// The service role is used for fixtures, back-dating history rows and calling the service-only signing/capture functions
// exactly as the server routes do. Every authorization assertion goes through a user/anon client.
type U = { id: string; email: string };
type Id = { id: string };
const db = admin as unknown as SupabaseClient;
const as = async (u: U) => (await signedIn(u.email)) as unknown as SupabaseClient;
const anonC = () => anon() as unknown as SupabaseClient;
const day = 864e5;

test.describe.configure({ mode: "serial" });

test.describe("Q16 CRM, proposals & contracts", () => {
  let O: U, M: U, X: U; let oc: SupabaseClient, mc: SupabaseClient, xc: SupabaseClient;
  let W: string, XW: string;
  let clientId: string, proposalId: string, shareToken: string, leadId: string;

  test.beforeAll(async () => {
    [O, M, X] = await Promise.all([createUser("q16-owner"), createUser("q16-member"), createUser("q16-other")]);
    W = await seedWorkspace(O.id, "organizer", "Q16 Events Co");
    XW = await seedWorkspace(X.id, "organizer", "Q16 Rival Co");
    await db.from("workspace_members").insert({ workspace_id: W, user_id: M.id, role: "member", status: "active" });
    [oc, mc, xc] = await Promise.all([as(O), as(M), as(X)]);
  });
  test.afterAll(async () => {
    await db.from("events").delete().in("workspace_id", [W, XW]);
    await db.from("workspaces").delete().in("id", [W, XW]);
    await cleanup();
  });

  test("clients: free-text names resolve to ONE canonical client per workspace; tenants are isolated", async () => {
    const l1 = await oc.from("leads").insert({ workspace_id: W, reference: "LD-T-001", name: "Summer gala", client_name: "Acme  Events ", contact_email: "Ops@Acme.test", contact_name: "Ana" }).select("id,client_id").single();
    expect(l1.error).toBeNull();
    leadId = (l1.data as { id: string }).id; clientId = (l1.data as { client_id: string }).client_id;
    expect(clientId).toBeTruthy();
    const l2 = await mc.from("leads").insert({ workspace_id: W, reference: "LD-T-002", name: "Winter party", client_name: "acme events" }).select("client_id").single();
    expect((l2.data as { client_id: string }).client_id).toBe(clientId);
    const p = await oc.from("proposals").insert({ workspace_id: W, number: "PR-T-001", title: "Acme summer gala", client_name: "ACME EVENTS", lead_id: leadId, status: "draft" }).select("client_id").single();
    expect((p.data as { client_id: string }).client_id).toBe(clientId);
    const { data: list } = await oc.from("clients").select("id,name,email").eq("workspace_id", W);
    expect(list).toHaveLength(1);
    expect((list as { email: string }[])[0]!.email).toBe("ops@acme.test");
    expect(((await oc.from("client_contacts").select("email").eq("client_id", clientId)).data ?? []).map(r => (r as { email: string }).email)).toEqual(["ops@acme.test"]);
    // Other tenant: cannot read, cannot link.
    expect((await xc.from("clients").select("id").eq("id", clientId)).data).toEqual([]);
    const cross = await xc.from("leads").insert({ workspace_id: XW, reference: "LD-X-1", name: "Steal", client_name: "x", client_id: clientId });
    expect(cross.error?.message).toMatch(/client_not_in_workspace/);
    expect((await xc.rpc("client_overview", { p_client: clientId })).data).toBeNull();
    expect((await anonC().from("clients").select("id").limit(1)).data ?? []).toEqual([]);
  });

  test("clients: billing is finance-gated; merge is manager-only and re-points every reference", async () => {
    const bad = await mc.from("clients").update({ billing_name: "Acme Ltd", vat_number: "GB1" }).eq("id", clientId);
    expect(bad.error?.message).toMatch(/finance_permission_required/);
    expect((await mc.from("clients").update({ notes: "Prefers email" }).eq("id", clientId)).error).toBeNull();
    expect((await oc.from("clients").update({ billing_name: "Acme Ltd" }).eq("id", clientId)).error).toBeNull();
    // A near-duplicate created separately, with its own lead.
    const dup = ((await mc.from("clients").insert({ workspace_id: W, name: "Acme Events Ltd" }).select("id").single()).data as Id).id;
    await mc.from("leads").insert({ workspace_id: W, reference: "LD-T-003", name: "Dup lead", client_name: "Acme Events Ltd" });
    expect((await mc.rpc("merge_clients", { p_keep: clientId, p_merge: dup })).error?.message).toMatch(/not_authorized/);
    const r = await oc.rpc("merge_clients", { p_keep: clientId, p_merge: dup });
    expect(r.error).toBeNull();
    expect((r.data as { leads: number }).leads).toBe(1);
    expect(((await oc.from("leads").select("client_id").eq("workspace_id", W)).data ?? []).every(l => (l as { client_id: string }).client_id === clientId)).toBe(true);
    const ov = (await oc.rpc("client_overview", { p_client: dup })).data as { client: { id: string }; leads: unknown[] };
    expect(ov.client.id).toBe(clientId);                                  // merged id resolves to the kept record
    expect(ov.leads.length).toBe(3);
    // Merge status can't be faked by a plain update.
    const fake = await oc.from("clients").update({ status: "merged", merged_into: dup }).eq("id", clientId);
    expect(fake.error).not.toBeNull();
  });

  test("pipeline: stage history drives KPI deltas against the previous period", async () => {
    const big = ((await oc.from("leads").insert({ workspace_id: W, reference: "LD-T-010", name: "Big win", client_name: "Acme Events", value: 2000 }).select("id").single()).data as Id).id;
    const old = ((await oc.from("leads").insert({ workspace_id: W, reference: "LD-T-011", name: "Old win", client_name: "Acme Events", value: 1000 }).select("id").single()).data as Id).id;
    await oc.from("leads").update({ stage: "qualified" }).eq("id", big);
    await oc.from("leads").update({ stage: "won", event_id: null }).eq("id", big);
    await oc.from("leads").update({ stage: "won" }).eq("id", old);
    const hist = (await oc.from("lead_stage_history").select("from_stage,to_stage").eq("lead_id", big).order("id")).data as { from_stage: string | null; to_stage: string }[];
    expect(hist.map(h => h.to_stage)).toEqual(["new", "qualified", "won"]);
    // Move the old lead (creation + win) into the previous 30-day window.
    const t = new Date(Date.now() - 40 * day).toISOString();
    await db.from("leads").update({ created_at: new Date(Date.now() - 45 * day).toISOString() }).eq("id", old);
    await db.from("lead_stage_history").update({ changed_at: t }).eq("lead_id", old).eq("to_stage", "won");
    await db.from("lead_stage_history").update({ changed_at: new Date(Date.now() - 45 * day).toISOString() }).eq("lead_id", old).eq("to_stage", "new");
    const k = (await mc.rpc("sales_kpis", { p_ws: W, p_days: 30 })).data as { current: { closed_value: number; won: number }; previous: { closed_value: number; won: number }; delta: { closed_value: number } };
    expect(k.current.closed_value).toBe(2000);
    expect(k.previous.closed_value).toBe(1000);
    expect(k.delta.closed_value).toBe(100);
    expect((await xc.rpc("sales_kpis", { p_ws: W, p_days: 30 })).error?.message).toMatch(/not_authorized/);
  });

  test("proposals: packages are chosen at acceptance, totals computed from the snapshot; old 4-argument acceptance still works", async () => {
    const content = { line_items: [["Venue hire", "", 1, 1000]], options: [["Photo booth", "", 300, true], ["Fireworks", "", 900, false]], tax_rate: 20, date: "2027-06-12", venue: "Riverside Hall", attendance: "150", summary: "Summer gala",
      packages: [{ key: "bronze", tier: "bronze", name: "Bronze", price: 0, items: [], recommended: false }, { key: "gold", tier: "gold", name: "Gold", price: 500, items: ["Band"], recommended: true }] };
    proposalId = ((await oc.from("proposals").select("id").eq("number", "PR-T-001").eq("workspace_id", W).single()).data as Id).id;
    expect((await oc.from("proposals").update({ content, subtotal: 1300, tax: 260, total: 1560 }).eq("id", proposalId)).error).toBeNull();
    expect((await oc.rpc("issue_proposal", { p_proposal: proposalId })).error).toBeNull();
    shareToken = ((await db.from("proposals").select("share_token").eq("id", proposalId).single()).data as { share_token: string }).share_token;
    const a = anonC();
    expect((await a.rpc("accept_proposal", { p_token: shareToken, p_name: "Ana Client", p_email: "ana@acme.test", p_version: 1 })).error?.message).toMatch(/package_required/);
    expect((await a.rpc("accept_proposal", { p_token: shareToken, p_name: "Ana Client", p_email: "ana@acme.test", p_version: 1, p_package: "platinum" })).error?.message).toMatch(/invalid_package/);
    const acc = await a.rpc("accept_proposal", { p_token: shareToken, p_name: "Ana Client", p_email: "ana@acme.test", p_version: 1, p_package: "gold" });
    expect(acc.error).toBeNull(); expect(acc.data).toBe("accepted");
    const p = (await oc.from("proposals").select("status,accepted_total,acceptance").eq("id", proposalId).single()).data as { status: string; accepted_total: number; acceptance: { package: { key: string }; subtotal: number } };
    expect(p.status).toBe("accepted");
    expect(Number(p.accepted_total)).toBe(2160);                         // (1000 + 300 option + 500 Gold) × 1.2
    expect(p.acceptance.package.key).toBe("gold");
    // A proposal without packages: the deployed 4-argument call resolves to the new function.
    const p2 = ((await oc.from("proposals").insert({ workspace_id: W, number: "PR-T-002", title: "Simple", client_name: "Acme Events", status: "draft", subtotal: 100, tax: 20, total: 120, content: { line_items: [["Item", "", 1, 100]], tax_rate: 20 } }).select("id").single()).data as Id).id;
    await oc.rpc("issue_proposal", { p_proposal: p2 });
    const t2 = ((await db.from("proposals").select("share_token").eq("id", p2).single()).data as { share_token: string }).share_token;
    expect((await a.rpc("accept_proposal", { p_token: t2, p_name: "Ana Client", p_email: "ana@acme.test", p_version: 1 })).data).toBe("accepted");
    expect(Number(((await oc.from("proposals").select("accepted_total").eq("id", p2).single()).data as { accepted_total: number }).accepted_total)).toBe(120);
  });

  test("conversion: concurrent converts create ONE event linked to the canonical client and lead, with budget lines", async () => {
    const other = await xc.rpc("convert_proposal_to_event", { p_proposal: proposalId });
    expect(other.error?.message).toMatch(/not_authorized/);
    const [r1, r2] = await Promise.all([oc.rpc("convert_proposal_to_event", { p_proposal: proposalId }), mc.rpc("convert_proposal_to_event", { p_proposal: proposalId })]);
    expect(r1.error).toBeNull(); expect(r2.error).toBeNull();
    const e1 = (r1.data as { event_id: string }).event_id, e2 = (r2.data as { event_id: string }).event_id;
    expect(e1).toBe(e2);
    expect([(r1.data as { created: boolean }).created, (r2.data as { created: boolean }).created].filter(Boolean)).toHaveLength(1);
    const evs = (await oc.from("events").select("id,client_id,client_name,lead_id,status,guest_count,revenue_goal,settings").eq("workspace_id", W).eq("lead_id", leadId)).data as { id: string; client_id: string; lead_id: string; status: string; guest_count: number; revenue_goal: number; settings: { budget_lines: Record<string, number>; proposal_id: string } }[];
    expect(evs).toHaveLength(1);
    expect(evs[0]!.client_id).toBe(clientId);
    expect(evs[0]!.status).toBe("planning");
    expect(evs[0]!.guest_count).toBe(150);
    expect(Number(evs[0]!.revenue_goal)).toBe(2160);
    expect(evs[0]!.settings.budget_lines).toEqual({ "Venue hire": 1000, "Photo booth": 300, Gold: 500 });
    expect(evs[0]!.settings.proposal_id).toBe(proposalId);
    const lead = (await oc.from("leads").select("stage,event_id").eq("id", leadId).single()).data as { stage: string; event_id: string };
    expect(lead).toEqual({ stage: "won", event_id: e1 });
    const again = (await oc.rpc("convert_proposal_to_event", { p_proposal: proposalId })).data as { event_id: string; already_converted: boolean };
    expect(again).toMatchObject({ event_id: e1, already_converted: true });
  });

  test("contracts: approval gate, typed-name signatures, immutable after signing, renewal; signing functions are service-only", async () => {
    await db.from("workspaces").update({ settings: { contracts: { require_approval: true } } }).eq("id", W);
    const create = await mc.rpc("contract_create", { p_ws: W, p: { title: "Acme gala services agreement", proposal_id: proposalId, expires_at: new Date(Date.now() + 10 * day).toISOString().slice(0, 10),
      body: "Agreement between {{workspace_name}} and {{client_name}} for {{event_name}}. Value £{{contract_value}}.",
      parties: [{ role: "organizer", name: "Owner Person", email: O.email }, { role: "client", name: "Ana Client", email: "ana@acme.test" }] } });
    expect(create.error).toBeNull();
    const C = create.data as string;
    const c0 = (await mc.from("contracts").select("status,client_id,event_id,value,number,current_version").eq("id", C).single()).data as { status: string; client_id: string; event_id: string; value: number; number: string; current_version: number };
    expect(c0).toMatchObject({ status: "draft", client_id: clientId, current_version: 1 });
    expect(Number(c0.value)).toBe(2160);
    expect(c0.number).toMatch(/^CT-\d{4}-001$/);
    const v1 = (await mc.from("contract_versions").select("body").eq("contract_id", C).single()).data as { body: string };
    expect(v1.body).toContain("Acme Events"); expect(v1.body).toContain("2,160.00");
    expect((await xc.from("contracts").select("id").eq("id", C)).data).toEqual([]);
    expect((await mc.rpc("contract_send", { p_contract: C })).error?.message).toMatch(/approval_required/);
    const ap = (await mc.rpc("contract_request_approval", { p_contract: C, p_reason: "Over threshold" })).data as string;
    expect((await mc.rpc("contract_decide_approval", { p_approval: ap, p_approve: true })).error?.message).toMatch(/not_authorized/);
    expect((await oc.rpc("contract_decide_approval", { p_approval: ap, p_approve: true })).data).toBe("approved");
    const sent = (await mc.rpc("contract_send", { p_contract: C })).data as { share_token: string; version: number };
    expect(sent.version).toBe(1);
    // Editing a sent contract is refused; the old text is immutable.
    expect((await mc.rpc("contract_save_version", { p_contract: C, p_body: "changed" })).error?.message).toMatch(/contract_not_draft/);
    expect((await db.from("contract_versions").update({ body: "tampered" }).eq("contract_id", C)).error?.message).toMatch(/append_only/);
    // Token functions are not exposed to browsers.
    expect((await anonC().rpc("contract_by_token", { p_token: sent.share_token })).error).not.toBeNull();
    expect((await oc.rpc("contract_sign_by_token", { p_token: sent.share_token, p_name: "Ana", p_email: "ana@acme.test", p_version: 1, p_accept: true })).error).not.toBeNull();
    const view = (await db.rpc("contract_by_token", { p_token: sent.share_token })).data as { body: string; parties: { email?: string }[] };
    expect(view.body).toContain("Acme Events"); expect(view.parties.every(p => p.email === undefined)).toBe(true);
    expect((await db.rpc("contract_sign_by_token", { p_token: sent.share_token, p_name: "Mallory", p_email: "mallory@evil.test", p_version: 1, p_accept: true })).error?.message).toMatch(/not_a_signer/);
    expect((await db.rpc("contract_sign_by_token", { p_token: sent.share_token, p_name: "Ana Client", p_email: "ana@acme.test", p_version: 1, p_accept: true, p_ip_hash: "h" })).data).toBe("partially_signed");
    const orgParty = ((await oc.from("contract_parties").select("id").eq("contract_id", C).eq("role", "organizer").single()).data as Id).id;
    expect((await mc.rpc("contract_sign_internal", { p_contract: C, p_party: orgParty, p_typed_name: "Member Person" })).error?.message).toMatch(/not_authorized/);
    expect((await oc.rpc("contract_sign_internal", { p_contract: C, p_party: orgParty, p_typed_name: "Owner Person" })).data).toBe("signed");
    const sigs = (await oc.from("contract_signatures").select("method,version,document_hash").eq("contract_id", C)).data as { document_hash: string }[];
    expect(sigs).toHaveLength(2); expect(new Set(sigs.map(s => s.document_hash)).size).toBe(1);
    // Immutable after signature — even for the service role; illegal transitions are refused by the state guard.
    expect((await db.from("contracts").update({ title: "Rewritten" }).eq("id", C)).error?.message).toMatch(/contract_signed_immutable/);
    expect((await oc.rpc("contract_void", { p_contract: C, p_reason: "change of heart" })).error?.message).toMatch(/contract_not_voidable/);
    expect((await oc.rpc("contract_revise", { p_contract: C })).error?.message).toMatch(/contract_not_revisable/);
    const renewal = (await oc.rpc("contract_renew", { p_contract: C })).data as string;
    const rn = (await oc.from("contracts").select("status,renewal_of,current_version").eq("id", renewal).single()).data;
    expect(rn).toMatchObject({ status: "draft", renewal_of: C, current_version: 1 });
    const draftC = ((await oc.rpc("contract_create", { p_ws: W, p: { title: "Blank" } })).data) as string;
    expect((await db.from("contracts").update({ status: "signed" }).eq("id", draftC)).error?.message).toMatch(/illegal contract transition/);
  });

  test("lead capture: key-gated, service-only, deduped per email within 24 hours", async () => {
    expect((await oc.rpc("capture_lead", { p_ws: W, p_key: "k", p: {} })).error).not.toBeNull();   // not callable by clients
    expect((await db.rpc("capture_lead", { p_ws: W, p_key: "wrong-key-000000", p: { name: "Bo", email: "bo@x.test" } })).error?.message).toMatch(/capture_disabled/);
    await db.from("workspaces").update({ settings: { lead_capture: { enabled: true, key: "q16-capture-key-123456" } } }).eq("id", W);
    const r1 = (await db.rpc("capture_lead", { p_ws: W, p_key: "q16-capture-key-123456", p: { name: "Bo Visitor", email: "Bo@X.test", company: "Bo Co", message: "Wedding in May" } })).data as { lead_id: string; result: string; reference: string };
    expect(r1.result).toBe("created"); expect(r1.reference).toMatch(/^LD-\d{4}-\d{3}$/);
    const r2 = (await db.rpc("capture_lead", { p_ws: W, p_key: "q16-capture-key-123456", p: { name: "Bo Visitor", email: "bo@x.test", message: "Also June?" } })).data as { lead_id: string; result: string };
    expect(r2).toEqual({ lead_id: r1.lead_id, result: "duplicate" });
    const lead = (await oc.from("leads").select("captured_via,client_id,contact_email").eq("id", r1.lead_id).single()).data as { captured_via: string; client_id: string; contact_email: string };
    expect(lead.captured_via).toBe("form"); expect(lead.client_id).toBeTruthy(); expect(lead.contact_email).toBe("bo@x.test");
    expect(((await oc.from("lead_activities").select("id").eq("lead_id", r1.lead_id)).data ?? []).length).toBe(2);
  });
});
