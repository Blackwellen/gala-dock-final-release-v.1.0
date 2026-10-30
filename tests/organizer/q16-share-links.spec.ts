import { createHash } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Q16 P3: proposal / contract share links — hashed at rest (plaintext fallback during transition), "viewed" only from a post-load
// beacon by a real browser (never on server render, never for preview bots), owner revoke / reissue, revoked links 404.
// API/HTTP level, disposable identities. The service role is used for fixtures and for reading state back.

type U = { id: string; email: string };
const db = admin as unknown as SupabaseClient;
const as = async (u: U) => (await signedIn(u.email)) as unknown as SupabaseClient;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const HUMAN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const BOTS = ["Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", "WhatsApp/2.23.20.0 A", "Mozilla/5.0 (compatible; Microsoft Office/16.0; SafeLinks preview)", "facebookexternalhit/1.1"];
const page = (path: string, ua = HUMAN) => fetch(`${BASE}${path}`, { headers: { "user-agent": ua } });
const beacon = (token: string, ua = HUMAN) => fetch(`${BASE}/api/proposals/viewed`, { method: "POST", headers: { "user-agent": ua, "content-type": "application/json" }, body: JSON.stringify({ token }) });

test.describe.configure({ mode: "serial" });

test.describe("Q16 share links", () => {
  let O: U, M: U; let oc: SupabaseClient, mc: SupabaseClient; let W: string;
  let P: string, token: string;
  const status = async () => ((await db.from("proposals").select("status").eq("id", P).single()).data as { status: string }).status;

  test.beforeAll(async () => {
    [O, M] = await Promise.all([createUser("q16s-owner"), createUser("q16s-member")]);
    W = await seedWorkspace(O.id, "organizer", "Q16 Share Co");
    await db.from("workspace_members").insert({ workspace_id: W, user_id: M.id, role: "member", status: "active" });
    [oc, mc] = await Promise.all([as(O), as(M)]);
    P = ((await oc.from("proposals").insert({ workspace_id: W, number: "PR-S-001", title: "Share link gala", client_name: "Share Client", status: "draft", subtotal: 100, tax: 20, total: 120,
      content: { line_items: [["Item", "", 1, 100]], tax_rate: 20 } }).select("id").single()).data as { id: string }).id;
    expect((await oc.rpc("issue_proposal", { p_proposal: P })).error).toBeNull();
    token = ((await db.from("proposals").select("share_token").eq("id", P).single()).data as { share_token: string }).share_token;
  });
  test.afterAll(async () => {
    await db.from("contracts").delete().eq("workspace_id", W);
    await db.from("proposals").delete().eq("workspace_id", W);
    await db.from("workspaces").delete().eq("id", W);
    await cleanup();
  });

  test("tokens are hashed at rest and the hash is derived (not writable)", async () => {
    const row = (await db.from("proposals").select("share_token_hash").eq("id", P).single()).data as { share_token_hash: string };
    expect(row.share_token_hash).toBe(sha(token));
    await oc.from("proposals").update({ share_token_hash: "0".repeat(64) } as never).eq("id", P);
    expect(((await db.from("proposals").select("share_token_hash").eq("id", P).single()).data as { share_token_hash: string }).share_token_hash).toBe(sha(token));
  });

  test("server render (human or bot) never changes status; bots' beacons are ignored; a browser beacon marks viewed", async () => {
    for (const ua of [HUMAN, ...BOTS]) { const r = await page(`/proposal/${token}`, ua); expect(r.status, ua).toBe(200); }
    expect(await status()).toBe("sent");
    for (const ua of BOTS) expect((await beacon(token, ua)).status).toBe(204);
    expect(await status()).toBe("sent");
    expect((await beacon("f".repeat(36))).status).toBe(204);                       // unknown token: same answer
    expect(await status()).toBe("sent");
    expect((await beacon(token)).status).toBe(204);
    expect(await status()).toBe("viewed");
    // the RPC itself is service-only now
    expect((await (anon() as unknown as SupabaseClient).rpc("mark_proposal_viewed", { p_token: token })).error).not.toBeNull();
    expect((await oc.rpc("mark_proposal_viewed", { p_token: token })).error).not.toBeNull();
  });

  test("owner revokes: link 404s like an unknown one, acceptance refused, revocation is sticky; reissue gives a new working link", async () => {
    expect((await mc.rpc("proposal_share_revoke", { p_proposal: P })).error?.message).toMatch(/not_authorized/);
    expect((await oc.rpc("proposal_share_revoke", { p_proposal: P })).error).toBeNull();
    expect((await page(`/proposal/${token}`)).status).toBe(404);
    expect((await page(`/proposal/${"e".repeat(36)}`)).status).toBe(404);
    const a = anon() as unknown as SupabaseClient;
    expect((await a.rpc("proposal_by_token", { p_token: token })).data).toBeNull();
    expect((await a.rpc("accept_proposal", { p_token: token, p_name: "Share Client", p_email: "c@example.com", p_version: 1 })).error?.message).toMatch(/not_found/);
    await mc.from("proposals").update({ share_revoked_at: null } as never).eq("id", P);           // a member can't quietly un-revoke
    expect((await page(`/proposal/${token}`)).status).toBe(404);
    const re = await oc.rpc("proposal_share_revoke", { p_proposal: P, p_reissue: true });
    expect(re.error).toBeNull();
    const fresh = (re.data as { share_token: string }).share_token;
    expect(fresh).toMatch(/^[0-9a-f]{36}$/); expect(fresh).not.toBe(token);
    expect((await page(`/proposal/${fresh}`)).status).toBe(200);
    expect((await page(`/proposal/${token}`)).status).toBe(404);
    expect((await a.rpc("accept_proposal", { p_token: fresh, p_name: "Share Client", p_email: "c@example.com", p_version: 1 })).data).toBe("accepted");
  });

  test("expired links stop resolving", async () => {
    const t = ((await db.from("proposals").select("share_token").eq("id", P).single()).data as { share_token: string }).share_token;
    expect((await oc.rpc("proposal_share_revoke", { p_proposal: P, p_reissue: false, p_expires_at: new Date(Date.now() - 60_000).toISOString() })).error).toBeNull();
    expect((await page(`/proposal/${t}`)).status).toBe(404);
  });

  test("contract signing link: hashed, renders, owner revoke 404s it and the service resolver returns nothing", async () => {
    const C = (await oc.rpc("contract_create", { p_ws: W, p: { title: "Share link agreement", body: "Agreement for {{client_name}}.", expires_at: new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10),
      parties: [{ role: "organizer", name: "Owner Person", email: O.email }, { role: "client", name: "Cli Ent", email: "cli@example.com" }] } })).data as string;
    const sent = await oc.rpc("contract_send", { p_contract: C });
    expect(sent.error).toBeNull();
    const ct = (sent.data as { share_token: string }).share_token;
    expect(((await db.from("contracts").select("share_token_hash").eq("id", C).single()).data as { share_token_hash: string }).share_token_hash).toBe(sha(ct));
    expect((await page(`/contract/${ct}`)).status).toBe(200);
    expect((await mc.rpc("contract_share_revoke", { p_contract: C })).error?.message).toMatch(/not_authorized/);
    expect((await oc.rpc("contract_share_revoke", { p_contract: C })).error).toBeNull();
    expect((await page(`/contract/${ct}`)).status).toBe(404);
    expect((await db.rpc("contract_by_token", { p_token: ct })).data).toBeNull();
    expect((await db.rpc("contract_sign_by_token", { p_token: ct, p_name: "Cli Ent", p_email: "cli@example.com", p_version: 1, p_accept: true })).error?.message).toMatch(/not_found/);
  });
});
