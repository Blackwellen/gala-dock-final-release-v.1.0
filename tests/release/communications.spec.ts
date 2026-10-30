import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, BASE, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";
import { isReservedRecipient, mailboxStatus, mapResendEvent, signSvix, verifySvix } from "../../src/lib/email/rules";

// Q05 Communications & Notification Foundation (migration 202610291020). Exit gate: event/booking/quote threads round-trip without
// duplication. No real email is sent: every address here is on a reserved test domain, which the outbox suppresses.
const db = admin as unknown as SupabaseClient;
type Id = { id: string };

test.describe("Q05 rules (unit)", () => {
  test("reserved test domains are never deliverable; real domains are", () => {
    for (const e of ["a@example.com", "b@example.org", "c@x.example", "d@gala-dock.test", "e@foo.invalid", "f@localhost", "bad"]) expect(isReservedRecipient(e), e).toBe(true);
    for (const e of ["owner@galadock.com", "someone@gmail.com"]) expect(isReservedRecipient(e), e).toBe(false);
    const send = fs.readFileSync(path.resolve(__dirname, "../../src/lib/email/send.ts"), "utf8");
    // Suppression (reserved domain, then bounce/complaint list) happens before the provider call.
    expect(send.indexOf("isReservedRecipient(r.to_email)")).toBeGreaterThan(0);
    expect(send.indexOf("email_suppressions")).toBeGreaterThan(send.indexOf("isReservedRecipient(r.to_email)"));
    expect(send.indexOf("https://api.resend.com/emails")).toBeGreaterThan(send.indexOf("email_suppressions"));
  });

  test("Resend/Svix webhook signatures: valid, tampered, replayed-old and wrong-secret cases", () => {
    const secret = `whsec_${Buffer.from("q05-test-secret-0123456789").toString("base64")}`, now = 1_800_000_000, body = '{"type":"email.bounced"}';
    const sig = signSvix(secret, "msg_1", now, body);
    expect(verifySvix({ secret, id: "msg_1", timestamp: String(now), signature: sig, body, nowSeconds: now })).toBe(true);
    expect(verifySvix({ secret, id: "msg_1", timestamp: String(now), signature: `v1,bogus ${sig}`, body, nowSeconds: now })).toBe(true);   // rotated secrets: any v1 match
    expect(verifySvix({ secret, id: "msg_1", timestamp: String(now), signature: sig, body: body + " ", nowSeconds: now })).toBe(false);
    expect(verifySvix({ secret, id: "msg_2", timestamp: String(now), signature: sig, body, nowSeconds: now })).toBe(false);
    expect(verifySvix({ secret, id: "msg_1", timestamp: String(now), signature: sig, body, nowSeconds: now + 301 })).toBe(false);
    expect(verifySvix({ secret: `whsec_${Buffer.from("other").toString("base64")}`, id: "msg_1", timestamp: String(now), signature: sig, body, nowSeconds: now })).toBe(false);
    expect(mapResendEvent("e1", { type: "email.bounced", data: { email_id: "re_1", to: ["X@Example.com"], bounce: { type: "Permanent", message: "mailbox does not exist" } } }))
      .toEqual({ id: "e1", type: "email.bounced", email: "x@example.com", providerId: "re_1", detail: "mailbox does not exist" });
    expect(mapResendEvent("e2", { type: "email.bounced", data: { email_id: "re_2", to: "y@example.com", bounce: { type: "Transient" } } }).type).toBe("email.bounced_soft");
  });

  test("mailbox contract: env validation reports configured / partial / not_configured without values", () => {
    const s = mailboxStatus({ SMTP_HOST: "h", SMTP_PORT: "587", SMTP_USER: "u", SMTP_PASSWORD: "p", IMAP_HOST: "h", GMAIL_CLIENT_ID: "x", RESEND_WEBHOOK_SECRET: "nope" });
    expect(s.smtp.status).toBe("configured");
    expect(s.imap).toMatchObject({ status: "partial", missing: ["IMAP_PORT", "IMAP_USER", "IMAP_PASSWORD"] });
    expect(s.gmail.status).toBe("partial");
    expect(s.resend_webhook).toMatchObject({ status: "partial" });
    expect(mailboxStatus({}).gmail.status).toBe("not_configured");
    expect(JSON.stringify(s)).not.toContain('"p"');
  });
});

test.describe("Q05 threads, notifications, email events, consent, contact", () => {
  test.describe.configure({ mode: "serial" });
  let org: { id: string; email: string }, prov: { id: string; email: string }, out: { id: string; email: string };
  let provWs: string, orgWs: string, listing: string, event: string, item: string, legacyThread: string;
  let orgC: SupabaseClient, provC: SupabaseClient, outC: SupabaseClient;
  test.beforeAll(async () => {
    [org, prov, out] = await Promise.all([createUser("q05-org"), createUser("q05-prov"), createUser("q05-out")]);
    provWs = await seedWorkspace(prov.id, "provider", "Q05 Sound Co");
    orgWs = await seedWorkspace(org.id, "organizer", "Q05 Events Ltd");
    listing = ((await db.from("listings").insert({ workspace_id: provWs, name: "Q05 DJ", kind: "service", category: "dj", published: true, response_hours: 4, lat: 51.5, lng: -0.12 }).select("id").single()).data as Id).id;
    event = ((await db.from("events").insert({ owner_id: org.id, workspace_id: orgWs, name: "Q05 Gala", starts_at: new Date(Date.now() + 20 * 864e5).toISOString() }).select("id").single()).data as Id).id;
    item = ((await db.from("build_items").insert({ event_id: event, listing_id: listing, category: "dj", title: "Q05 DJ", status: "quoted", amount: 1000 }).select("id").single()).data as Id).id;
    // A legacy (pre-Q05) marketplace thread about the same build item, with one message.
    legacyThread = ((await db.from("threads").insert({ event_id: event, listing_id: listing, build_item_id: item, kind: "supplier", title: "Q05 DJ" }).select("id").single()).data as Id).id;
    await db.from("messages").insert({ thread_id: legacyThread, sender_id: prov.id, sender_name: "Q05 Sound Co", from_provider: true, body: "Legacy hello", attachments: [] });
    [orgC, provC, outC] = await Promise.all([org, prov, out].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    await db.from("conversations").delete().eq("build_item_id", item);
    await db.from("threads").delete().eq("id", legacyThread);
    await db.from("build_items").delete().eq("id", item);
    await db.from("events").delete().eq("id", event);
    await db.from("listings").delete().eq("id", listing);
    for (const w of [provWs, orgWs]) await db.from("workspaces").delete().eq("id", w);
    await db.from("marketing_subscriptions").delete().like("email", "q05-%@example.com");
    await db.from("email_outbox").delete().like("to_email", "q05-%@example.com");
    await db.from("contact_submissions").delete().like("email", "q05-%@example.com");
    await db.from("email_suppressions").delete().like("email", "q05-%@example.com");
    await cleanup();
  });

  test("booking/quote thread round-trip: one canonical thread under concurrency, idempotent retries, legacy thread merged once", async () => {
    const send = (c: SupabaseClient, body: string, extra: Record<string, unknown> = {}) =>
      c.rpc("send_context_message", { p_context: "quote", p_context_id: item, p_body: body, p_attachments: [], p_as_workspace: null, p_to_workspace: null, p_client_msg_id: null, p_subject: null, ...extra });
    // Two concurrent first messages from the organizer side → one thread.
    const [a, b] = await Promise.all([send(orgC, "Hi, is the 20th free?", { p_as_workspace: orgWs }), send(orgC, "Also, what about lighting?", { p_as_workspace: orgWs })]);
    expect(a.error).toBeNull(); expect(b.error).toBeNull();
    const ta = (a.data as { thread_id: string }).thread_id, tb = (b.data as { thread_id: string }).thread_id;
    expect(ta).toBe(tb);
    // Provider replies in the same context → same thread; retry with the same client id → same message, no duplicate.
    const cm = randomUUID();
    const r1 = await send(provC, "Yes, the 20th works.", { p_as_workspace: provWs, p_client_msg_id: cm });
    const r2 = await send(provC, "Yes, the 20th works.", { p_as_workspace: provWs, p_client_msg_id: cm });
    expect(r1.error).toBeNull(); expect((r1.data as { thread_id: string }).thread_id).toBe(ta);
    expect(r2.data).toMatchObject({ thread_id: ta, message_id: (r1.data as { message_id: string }).message_id, duplicate: true });
    const { count } = await db.from("conversations").select("id", { count: "exact", head: true }).eq("build_item_id", item);
    expect(count).toBe(1);
    expect(((await db.from("conversation_messages").select("id").eq("conversation_id", ta)).data ?? []).length).toBe(3);
    // Legacy thread linked to the canonical conversation: the inbox shows one thread and every message exactly once.
    expect(((await db.from("message_thread_links").select("conversation_id").eq("thread_id", legacyThread).single()).data as { conversation_id: string }).conversation_id).toBe(ta);
    for (const c of [orgC, provC]) {
      const threads = ((await c.from("inbox_threads").select("id,source,legacy_thread_id").eq("build_item_id", item)).data ?? []) as { id: string; legacy_thread_id: string | null }[];
      expect(threads).toEqual([expect.objectContaining({ id: ta, legacy_thread_id: legacyThread })]);
      const msgs = ((await c.from("inbox_messages").select("id,body,source").eq("thread_id", ta).order("created_at")).data ?? []) as { id: string; body: string; source: string }[];
      expect(msgs.map(m => m.body).sort()).toEqual(["Also, what about lighting?", "Hi, is the 20th free?", "Legacy hello", "Yes, the 20th works."]);
      expect(new Set(msgs.map(m => m.id)).size).toBe(msgs.length);
    }
    // An unrelated user sees nothing and cannot post into the context.
    expect(((await outC.from("inbox_threads").select("id").eq("build_item_id", item)).data ?? []).length).toBe(0);
    expect(((await outC.from("inbox_messages").select("id").eq("thread_id", ta)).data ?? []).length).toBe(0);
    expect((await send(outC, "let me in")).error?.message).toMatch(/not_authorized/);
    expect((await (anon() as unknown as SupabaseClient).rpc("send_context_message", { p_context: "quote", p_context_id: item, p_body: "x" })).error).not.toBeNull();
  });

  test("attachments must be the sender's own uploads; event context needs access", async () => {
    const bad = await provC.rpc("send_context_message", { p_context: "booking", p_context_id: item, p_body: "see file", p_attachments: [{ path: `${org.id}/${randomUUID()}.pdf`, name: "x.pdf" }], p_as_workspace: provWs });
    expect(bad.error?.message).toMatch(/invalid_attachment/);
    expect((await outC.rpc("send_context_message", { p_context: "event", p_context_id: event, p_body: "hello", p_to_workspace: provWs })).error?.message).toMatch(/not_authorized/);
  });

  test("notify(): one notification per dedupe key, marketing refused, service-only; notifications.send job is idempotent", async () => {
    const key = `q05:${randomUUID()}`;
    const n1 = (await db.rpc("notify", { p_user: org.id, p_kind: "quote.update", p_title: "Quote updated", p_body: "x", p_link: "/organizer", p_dedupe_key: key })).data;
    const n2 = (await db.rpc("notify", { p_user: org.id, p_kind: "quote.update", p_title: "Quote updated", p_body: "x", p_link: "/organizer", p_dedupe_key: key })).data;
    expect(n1).toBeTruthy(); expect(n2).toBe(n1);
    expect(((await db.from("notifications").select("id").eq("dedupe_key", key)).data ?? []).length).toBe(1);
    expect((await db.rpc("notify", { p_user: org.id, p_kind: "newsletter", p_title: "Promo" })).error?.message).toMatch(/marketing_not_allowed/);
    expect((await orgC.rpc("notify", { p_user: out.id, p_kind: "x", p_title: "spoof" })).error).not.toBeNull();
    const cats = (await orgC.from("notification_categories").select("category,class")).data as { category: string; class: string }[];
    expect(cats.filter(c => c.class === "marketing").map(c => c.category).sort()).toEqual(["newsletter", "product_updates"]);
    const { data: kind } = await db.from("job_kinds").select("runtime").eq("kind", "notifications.send").single();
    expect((kind as { runtime: string }).runtime).toBe("app");
  });

  test("bounce/complaint events suppress the address once; replays are no-ops; queued mail to it is suppressed", async () => {
    const email = `q05-bounce-${randomUUID().slice(0, 8)}@example.com`;
    await db.from("email_outbox").insert({ to_email: email, category: "quotes", subject: "x", body: "x" });
    const id = `msg_q05_${randomUUID()}`;
    const r1 = (await db.rpc("email_record_event", { p_id: id, p_type: "email.bounced", p_email: email, p_provider_id: null, p_detail: "hard" })).data;
    expect(r1).toMatchObject({ duplicate: false, suppressed: true });
    expect((await db.rpc("email_record_event", { p_id: id, p_type: "email.bounced", p_email: email, p_provider_id: null, p_detail: "hard" })).data).toMatchObject({ duplicate: true });
    expect(((await db.from("email_suppressions").select("reason").eq("email", email).single()).data as { reason: string }).reason).toBe("hard_bounce");
    expect(((await db.from("email_outbox").select("status").eq("to_email", email).single()).data as { status: string }).status).toBe("suppressed");
    const soft = `q05-soft-${randomUUID().slice(0, 8)}@example.com`;
    expect((await db.rpc("email_record_event", { p_id: `msg_q05_${randomUUID()}`, p_type: "email.bounced_soft", p_email: soft, p_provider_id: null })).data).toMatchObject({ suppressed: false });
    // Webhook endpoint trusts nothing unsigned (503 until RESEND_WEBHOOK_SECRET is configured, 401 with a bad signature after).
    const hook = await fetch(`${BASE}/api/webhooks/resend`, { method: "POST", body: JSON.stringify({ type: "email.complained", data: { to: [email] } }) });
    expect([401, 503]).toContain(hook.status);
    // No mail to a reserved test domain has been sent since the reserved-domain guard shipped (9 historic rows to gala-dock.test on
    // 2026-10-11 predate it — Q05 finding).
    const { count } = await db.from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "sent").gte("created_at", "2026-10-12T00:00:00Z").or("to_email.ilike.%.test,to_email.ilike.%@example.com,to_email.ilike.%@example.org,to_email.ilike.%.example.com");
    expect(count).toBe(0);
  });

  test("newsletter double opt-in works signed out; nothing is confirmed without the link; contact form works signed out", async () => {
    const email = `q05-news-${randomUUID().slice(0, 8)}@example.com`;
    const sub = await fetch(`${BASE}/api/subscriptions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, topic: "newsletter", consent: true }) });
    expect(sub.status).toBe(200); expect(await sub.json()).toMatchObject({ ok: true, status: "pending" });
    expect((await fetch(`${BASE}/api/subscriptions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, topic: "newsletter" }) })).status).toBe(400);   // consent required
    const row = (await db.from("marketing_subscriptions").select("status,consent_version,token_hash,ip_hash").eq("email", email).single()).data as { status: string; consent_version: string; ip_hash: string };
    expect(row).toMatchObject({ status: "pending", consent_version: "2026-10-28" });
    expect(row.ip_hash).toMatch(/^[a-f0-9]{64}$/);
    const mail = (await db.from("email_outbox").select("category,link").eq("to_email", email).single()).data as { category: string; link: string };
    expect(mail.category).toBe("consent_confirmation");
    const token = new URL(mail.link).searchParams.get("token")!;
    // GET only renders a button (mail scanners do not confirm); POST confirms.
    expect((await fetch(`${BASE}/api/subscriptions/confirm?token=${token}`)).status).toBe(200);
    expect(((await db.from("marketing_subscriptions").select("status").eq("email", email).single()).data as { status: string }).status).toBe("pending");
    const f = new FormData(); f.set("token", token); f.set("action", "confirm");
    expect(await (await fetch(`${BASE}/api/subscriptions/confirm`, { method: "POST", body: f })).text()).toContain("Subscription confirmed");
    expect(((await db.from("marketing_subscriptions").select("status,confirmed_at").eq("email", email).single()).data as { status: string }).status).toBe("confirmed");
    const u = new FormData(); u.set("token", token); u.set("action", "unsubscribe");
    expect(await (await fetch(`${BASE}/api/subscriptions/confirm`, { method: "POST", body: u })).text()).toContain("Unsubscribed");
    // Contact form, signed out.
    const c = await fetch(`${BASE}/api/contact`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Q05 Tester", email: `q05-contact-${randomUUID().slice(0, 6)}@example.com`, topic: "sales", message: "Hello, I would like a demo please." }) });
    expect(c.status).toBe(200);
    const ref = ((await c.json()) as { reference: string }).reference; expect(ref).toMatch(/^GD-C-/);
    expect(((await db.from("contact_submissions").select("topic,status").eq("reference", ref).single()).data as { topic: string }).topic).toBe("sales");
    expect((await fetch(`${BASE}/api/contact`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x", email: "bad", message: "short" }) })).status).toBe(400);
    // Service-only tables: anon and other users cannot read them.
    for (const t of ["marketing_subscriptions", "contact_submissions", "email_suppressions", "email_events"]) expect(((await anon().from(t as never).select("*").limit(1)).data ?? []).length, t).toBe(0);
    expect(((await outC.from("contact_submissions").select("id").limit(1)).data ?? []).length).toBe(0);
  });
});
