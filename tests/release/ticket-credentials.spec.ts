import { randomBytes, createHash } from "node:crypto";
import * as nodeCrypto from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn, insertEventFixture } from "../phase1/helpers";

// Q21 Ticket Credential / Scanner / Transfer (domains 96–98). Exit gate: a stale credential is rejected after transfer,
// refund, resale, cancellation and reissue. API level with disposable identities. The real credential module
// (src/lib/tickets/credentials.ts) is loaded with the server-only guard stubbed; the signing secret is read from the env and
// never printed.
type Db = SupabaseClient;
type Id = { id: string };
type Scan = { result: string; reason: string; conflict: string | null; replayed?: boolean };
const db = admin as unknown as Db;
const rpc = <T = Record<string, unknown>>(c: Db, fn: string, args: Record<string, unknown>) => c.rpc(fn, args) as unknown as Promise<{ data: T; error: { message: string } | null }>;
type Cred = {
  walletCredential: (id: string, nonce: string, now?: number) => { payload: string };
  printCredential: (id: string, nonce: string, epoch?: number) => string;
  badgeCredential: (id: string, nonce: string) => string;
  parseCredential: (raw: string) => { kind: string; ticketId?: string; passId?: string; sig?: string; window?: number };
  verifySignature: (p: unknown, nonce: string, now?: number, epoch?: number) => boolean;
  signSnapshot: (c: string) => string; verifySnapshot: (c: string, s: string) => boolean;
};
function credentials(): Cred {
  const loaded = { exports: {} as Cred };
  const require = (n: string) => n === "server-only" ? {} : n === "node:crypto" ? nodeCrypto : (() => { throw new Error(`Unexpected dependency ${n}`); })();
  const js = ts.transpileModule(readFileSync("src/lib/tickets/credentials.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(js, { module: loaded, exports: loaded.exports, require, process, Buffer, Date, Math });
  return loaded.exports;
}

test.describe.configure({ mode: "serial" });

test.describe("Q21 ticket credentials, scanner, transfer", () => {
  let owner: { id: string; email: string }, buyer: { id: string; email: string }, friend: { id: string; email: string }, finance: { id: string; email: string }, door: { id: string; email: string };
  let ownerC: Db, buyerC: Db, friendC: Db, financeC: Db, doorC: Db;
  let ws: string, ev: string, tier: string;
  const C = credentials();
  const mk = async (row: Record<string, unknown> = {}) => ((await db.from("tickets").insert({ event_id: ev, tier_id: tier, holder_id: buyer.id, code: `Q21-${randomBytes(5).toString("hex").toUpperCase()}`,
    order_ref: `Q21-${randomBytes(3).toString("hex")}`, attendee_name: "Bea Buyer", attendee_email: buyer.email, status: "valid", ...row }).select("id,qr_nonce,code").single()).data as { id: string; qr_nonce: string; code: string });
  const keyOf = async (id: string) => (await db.from("tickets").select("qr_nonce,print_epoch,credential_version,status,replaced_by").eq("id", id).single()).data as { qr_nonce: string; print_epoch: number; credential_version: number; status: string; replaced_by: string | null };
  const scan = (c: Db, args: Record<string, unknown>) => rpc<Scan>(c, "scan_admission", { p_event: ev, p_zone: null, p_ticket: null, p_pass: null, p_code: null, p_nonce: null, p_credential: "wallet", ...args });
  /** What the server-side scanner does with a raw QR: verify with the current nonce/epoch, else send a non-matching nonce. */
  const scanRaw = async (c: Db, raw: string, extra: Record<string, unknown> = {}) => {
    const p = C.parseCredential(raw) as { kind: string; ticketId: string };
    const k = await keyOf(p.ticketId);
    const ok = C.verifySignature(p, k.qr_nonce, Date.now(), k.print_epoch);
    return scan(c, { p_ticket: p.ticketId, p_nonce: ok ? k.qr_nonce : "stale-or-forged", p_credential: p.kind, ...extra });
  };

  test.beforeAll(async () => {
    [owner, buyer, friend, finance, door] = await Promise.all(["q21-o", "q21-b", "q21-f", "q21-fin", "q21-d"].map(l => createUser(l)));
    ws = await seedWorkspace(owner.id, "organizer", "Q21 Events");
    await db.from("workspace_members").insert({ workspace_id: ws, user_id: finance.id, role: "finance" });
    ev = ((await insertEventFixture({ owner_id: owner.id, workspace_id: ws, management: "professional", name: "Q21 Night", status: "on_sale", starts_at: new Date(Date.now() + 36e5).toISOString(), settings: { reentry: false } }, "ticket-credentials").select("id").single()).data as Id).id;
    tier = ((await db.from("ticket_tiers").insert({ event_id: ev, name: "GA", price: 25, quantity: 500, status: "on_sale" }).select("id").single()).data as Id).id;
    [ownerC, buyerC, friendC, financeC, doorC] = (await Promise.all([owner, buyer, friend, finance, door].map(u => signedIn(u.email)))) as unknown as Db[];
  });
  test.afterAll(async () => {
    await db.from("resale_holds").delete().in("ticket_id", ((await db.from("tickets").select("id").eq("event_id", ev)).data ?? []).map(x => (x as Id).id));
    await db.from("checkout_orders").delete().eq("event_id", ev);
    await db.from("events").delete().eq("id", ev); await db.from("workspaces").delete().eq("id", ws); await cleanup();
  });

  test("credential formats: wallet rotates, print is static and distinct, signing domains don't overlap", async () => {
    const t = await mk();
    const w = C.walletCredential(t.id, t.qr_nonce).payload, pr = C.printCredential(t.id, t.qr_nonce), b = C.badgeCredential(t.id, t.qr_nonce);
    expect(w).toMatch(/^GD2\./); expect(pr).toMatch(/^GD2P\./); expect(b).toMatch(/^GD2B\./);
    expect(C.verifySignature(C.parseCredential(w), t.qr_nonce)).toBe(true);
    expect(C.verifySignature(C.parseCredential(pr), t.qr_nonce)).toBe(true);
    // A wallet code from 5 minutes ago is dead (screenshots stop working); a print signature can't pose as a badge.
    expect(C.verifySignature(C.parseCredential(C.walletCredential(t.id, t.qr_nonce, Date.now() - 5 * 60e3).payload), t.qr_nonce)).toBe(false);
    const forged = { ...C.parseCredential(b), kind: "print", ticketId: t.id };
    expect(C.verifySignature(forged, t.qr_nonce)).toBe(false);
    expect(C.verifySnapshot("abc", C.signSnapshot("abc"))).toBe(true); expect(C.verifySnapshot("abd", C.signSnapshot("abc"))).toBe(false);
  });

  test("exit gate: refund, transfer, resale, cancellation and reissue each kill every prior credential", async () => {
    // Refund (as the Q07 refund worker writes it: a direct status update with the service role).
    const r = await mk(); const rw = C.walletCredential(r.id, r.qr_nonce).payload, rp = C.printCredential(r.id, r.qr_nonce);
    await db.from("tickets").update({ status: "refunded" }).eq("order_ref", (await db.from("tickets").select("order_ref").eq("id", r.id).single()).data!.order_ref).in("status", ["cancelled", "valid"]);
    const rk = await keyOf(r.id);
    expect(rk.qr_nonce).not.toBe(r.qr_nonce); expect(rk.credential_version).toBe(2);
    expect((await scanRaw(ownerC, rw)).data).toMatchObject({ result: "refunded" });
    expect((await scanRaw(ownerC, rp)).data).toMatchObject({ result: "refunded" });
    expect((await scan(ownerC, { p_ticket: r.id, p_nonce: r.qr_nonce })).data).toMatchObject({ result: "refunded" });
    // Refunded is terminal (machine enforced for every writer).
    expect((await db.from("tickets").update({ status: "valid" }).eq("id", r.id)).error?.message).toMatch(/illegal ticket transition refunded -> valid/);

    // Two-step transfer: old credentials rejected as transferred, the new holder's ticket admits once; one ownership chain.
    const t = await mk(); const tw = C.walletCredential(t.id, t.qr_nonce).payload;
    const token = randomBytes(32).toString("hex"); const th = createHash("sha256").update(token).digest("hex");
    expect((await rpc(buyerC, "offer_ticket_transfer", { p_ticket: t.id, p_email: friend.email, p_name: "Fran Friend", p_token_hash: th })).error).toBeNull();
    const newId = (await rpc<string>(friendC, "accept_ticket_transfer", { p_token_hash: th })).data as unknown as string;
    const tk = await keyOf(t.id);
    expect(tk).toMatchObject({ status: "transferred", replaced_by: newId });
    expect((await scanRaw(ownerC, tw)).data).toMatchObject({ result: "transferred" });
    const nk = await keyOf(newId);
    expect((await scanRaw(ownerC, C.walletCredential(newId, nk.qr_nonce).payload)).data).toMatchObject({ result: "admitted" });
    expect(((await db.from("tickets").select("holder_id").eq("id", newId).single()).data as { holder_id: string }).holder_id).toBe(friend.id);
    expect((await rpc(friendC, "accept_ticket_transfer", { p_token_hash: th })).error).not.toBeNull();   // single-use

    // Resale listing then completion: the listed code is locked, the completed one is dead.
    // (Q22's guard requires an original paid order and a live resale hold; the fixture provides both, no money moves.)
    const sref = `Q21R-${randomBytes(3).toString("hex")}`;
    expect((await db.from("checkout_orders").insert({ order_ref: sref, event_id: ev, buyer_id: buyer.id, token: randomBytes(12).toString("hex"), amount: 25, fee: 0, currency: "GBP", status: "issued", lines: [], kind: "primary", stripe_session: `cs_test_${randomBytes(6).toString("hex")}` } as never)).error).toBeNull();
    const s = await mk({ order_ref: sref }); const sw = C.walletCredential(s.id, s.qr_nonce).payload;
    expect((await db.from("tickets").update({ status: "resale_listed" }).eq("id", s.id)).error).toBeNull();
    expect((await scanRaw(ownerC, sw)).data).toMatchObject({ result: "invalid" });                // nonce rotated on listing
    const sk = await keyOf(s.id);
    expect((await scan(ownerC, { p_ticket: s.id, p_nonce: sk.qr_nonce })).data).toMatchObject({ result: "resale_locked" });
    await db.from("resale_holds").insert({ ticket_id: s.id, token: randomBytes(12).toString("hex"), expires_at: new Date(Date.now() + 6e5).toISOString() } as never);
    expect((await db.from("tickets").update({ status: "resold" }).eq("id", s.id)).error).toBeNull();
    expect((await scan(ownerC, { p_ticket: s.id, p_nonce: sk.qr_nonce })).data).toMatchObject({ result: "resold" });

    // Event-cancellation sweep: cancelled tickets are revoked.
    const c = await mk(); const cw = C.walletCredential(c.id, c.qr_nonce).payload;
    await db.from("tickets").update({ status: "cancelled" }).eq("id", c.id);
    expect((await scanRaw(ownerC, cw)).data).toMatchObject({ result: "revoked" });

    // Reissue: print scope kills printouts only; all scope kills wallet too. Holder or ticket managers only.
    const q = await mk(); const qw = () => C.walletCredential(q.id, q.qr_nonce).payload; const qp = C.printCredential(q.id, q.qr_nonce);
    expect((await rpc(friendC, "reissue_ticket_credentials", { p_ticket: q.id, p_scope: "print" })).error?.message).toMatch(/not_authorized/);
    expect((await rpc(buyerC, "reissue_ticket_credentials", { p_ticket: q.id, p_scope: "print", p_reason: "Lost printout" })).error).toBeNull();
    expect((await scanRaw(ownerC, qp)).data).toMatchObject({ result: "invalid" });
    const qk = await keyOf(q.id);
    expect(qk.qr_nonce).toBe(q.qr_nonce); expect(qk.print_epoch).toBe(1);
    expect(C.verifySignature(C.parseCredential(C.printCredential(q.id, qk.qr_nonce, 1)), qk.qr_nonce, Date.now(), 1)).toBe(true);
    expect(C.verifySignature(C.parseCredential(qw()), qk.qr_nonce)).toBe(true);                    // wallet untouched
    expect((await rpc(ownerC, "reissue_ticket_credentials", { p_ticket: q.id, p_scope: "all", p_reason: "Phone stolen" })).error).toBeNull();
    expect((await scanRaw(ownerC, qw())).data).toMatchObject({ result: "invalid" });
    expect(((await db.from("notifications").select("title").eq("user_id", buyer.id).eq("link", `/account/tickets/${q.id}`)).data ?? []).length).toBe(1);
    // Every rotation is on the outbox.
    expect(((await db.from("domain_outbox" as never).select("event_type").eq("aggregate_id", r.id).eq("event_type", "ticket.credential_rotated")).data ?? []).length).toBe(1);
  });

  test("scanner: role-scoped permission and exactly one admission under concurrent duplicate scans", async () => {
    const t = await mk();
    expect((await scan(financeC, { p_ticket: t.id, p_nonce: t.qr_nonce })).error?.message).toMatch(/not_authorized/);
    expect((await scan(doorC, { p_ticket: t.id, p_nonce: t.qr_nonce })).error?.message).toMatch(/not_authorized/);
    await rpc(ownerC, "assign_event_scanner", { p_event: ev, p_user: door.id });
    const both = await Promise.all([...Array(6)].map((_, i) => scan(i % 2 ? doorC : ownerC, { p_ticket: t.id, p_nonce: t.qr_nonce, p_device: `gate-${i}` })));
    const results = both.map(x => (x.data as Scan).result);
    expect(results.filter(r => r === "admitted")).toHaveLength(1);
    expect(results.filter(r => r === "duplicate")).toHaveLength(5);
    expect(((await db.from("check_ins").select("result").eq("ticket_id", t.id)).data ?? []).length).toBe(6);   // every attempt recorded
    // The legacy RPC (deployed scanner) uses the same engine and permission.
    expect((await rpc<Scan>(ownerC, "scan_ticket", { p_event: ev, p_ticket: t.id, p_code: null, p_nonce: t.qr_nonce, p_credential: "wallet" })).data).toMatchObject({ result: "duplicate" });
    expect((await rpc(financeC, "scan_ticket", { p_event: ev, p_ticket: t.id, p_code: null, p_nonce: null, p_credential: "manual" })).error?.message).toMatch(/not_authorized/);
  });

  test("offline: signed snapshot without secrets; sync is idempotent and deterministic — first valid scan wins", async () => {
    const snap = (await rpc<{ snapshot_id: string; tickets: Record<string, unknown>[] }>(doorC, "create_scan_snapshot", { p_event: ev, p_device: "door-1" })).data;
    const text = JSON.stringify(snap);
    expect(text).not.toContain("qr_nonce"); expect(text).not.toContain(buyer.email);
    expect((await rpc(financeC, "create_scan_snapshot", { p_event: ev })).error?.message).toMatch(/not_authorized/);
    expect((await rpc<boolean>(doorC, "scan_snapshot_valid", { p_snapshot: snap.snapshot_id, p_event: ev })).data).toBe(true);
    expect((await rpc<boolean>(ownerC, "scan_snapshot_valid", { p_snapshot: snap.snapshot_id, p_event: ev })).data).toBe(false);   // not issued to them

    // Two devices admit the same ticket offline; device B (earlier) syncs AFTER device A (later). Outcome is order-independent.
    const t = await mk();
    const early = new Date(Date.now() - 20 * 60e3).toISOString(), late = new Date(Date.now() - 5 * 60e3).toISOString();
    const a = await scan(doorC, { p_ticket: t.id, p_nonce: t.qr_nonce, p_device: "dev-A", p_offline_at: late, p_client_scan_id: "A-1", p_snapshot: snap.snapshot_id, p_local_result: "offline_ok" });
    expect(a.data).toMatchObject({ result: "admitted" });
    const b = await scan(doorC, { p_ticket: t.id, p_nonce: t.qr_nonce, p_device: "dev-B", p_offline_at: early, p_client_scan_id: "B-1", p_snapshot: snap.snapshot_id, p_local_result: "offline_ok" });
    expect(b.data).toMatchObject({ result: "admitted", conflict: "offline_earlier_wins" });
    const rows = ((await db.from("check_ins").select("device,result,conflict").eq("ticket_id", t.id).order("id")).data ?? []) as { device: string; result: string; conflict: string | null }[];
    expect(rows).toEqual([{ device: "dev-A", result: "duplicate", conflict: "superseded_by_offline" }, { device: "dev-B", result: "admitted", conflict: "offline_earlier_wins" }]);
    expect(Date.parse(((await db.from("tickets").select("checked_in_at").eq("id", t.id).single()).data as { checked_in_at: string }).checked_in_at)).toBe(Date.parse(early));
    // Replaying the same queued scan (retry after a dropped connection) returns the stored outcome without a new row.
    expect((await scan(doorC, { p_ticket: t.id, p_nonce: t.qr_nonce, p_device: "dev-B", p_offline_at: early, p_client_scan_id: "B-1" })).data).toMatchObject({ result: "admitted", replayed: true });
    expect(((await db.from("check_ins").select("id").eq("ticket_id", t.id)).data ?? []).length).toBe(2);
    // A later third offline scan is a flagged duplicate.
    expect((await scan(doorC, { p_ticket: t.id, p_nonce: t.qr_nonce, p_device: "dev-C", p_offline_at: late, p_client_scan_id: "C-1", p_local_result: "offline_ok" })).data).toMatchObject({ result: "duplicate", conflict: "offline_duplicate" });

    // Admitted offline, refunded before sync: flagged for review, never counted as an admission.
    const r = await mk();
    await db.from("tickets").update({ status: "refunded" }).eq("id", r.id);
    expect((await scan(doorC, { p_ticket: r.id, p_nonce: r.qr_nonce, p_device: "dev-A", p_offline_at: late, p_client_scan_id: "A-2", p_local_result: "offline_ok" })).data)
      .toMatchObject({ result: "refunded", conflict: "offline_admitted_revoked" });
    // Offline times in the future or far past are refused.
    expect((await scan(doorC, { p_ticket: r.id, p_offline_at: new Date(Date.now() + 36e5).toISOString() })).error?.message).toMatch(/invalid_offline_time/);
    expect((await scan(doorC, { p_ticket: r.id, p_offline_at: new Date(Date.now() - 30 * 864e5).toISOString() })).error?.message).toMatch(/invalid_offline_time/);
  });
});
