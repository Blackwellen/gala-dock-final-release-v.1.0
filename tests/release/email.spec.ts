import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser } from "../phase1/helpers";

// Release spec §76–77: notifications mirror into the email outbox, respecting preferences; security/payment mail is mandatory.
const db = admin as unknown as SupabaseClient;
test.describe("email outbox", () => {
  test.afterAll(async () => { await cleanup(); });
  test("preferences are honoured except for mandatory categories", async () => {
    const u = await createUser("mail");
    await db.from("profiles").update({ notifications: { quotes: false, security: false } }).eq("id", u.id);
    const ins = async (kind: string) => ((await db.from("notifications").insert({ user_id: u.id, kind, title: `T ${kind}`, body: "b", link: "/x" }).select("id").single()).data as { id: string }).id;
    const [q, s, p, m] = [await ins("quote_received"), await ins("security"), await ins("payment_due"), await ins("message")];
    const { data } = await db.from("email_outbox").select("notification_id,category,status,to_email").eq("user_id", u.id);
    const by = new Map((data ?? []).map(r => [r.notification_id, r]));
    expect(by.has(q)).toBe(false);                       // opted out
    expect(by.get(s)?.category).toBe("security");         // mandatory despite opt-out
    expect(by.get(p)?.category).toBe("payments");
    expect(by.get(m)?.category).toBe("messages");
    expect(by.get(s)?.to_email).toBe(u.email);
    await db.from("email_outbox").delete().eq("user_id", u.id);
  });
});
