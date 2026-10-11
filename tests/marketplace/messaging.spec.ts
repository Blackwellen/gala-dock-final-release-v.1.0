import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";

// Messaging between accounts and portals: contact rules, workspace seats shared by teammates, isolation, unread, attachments.
const db = admin as unknown as SupabaseClient;
type Conv = { id: string; unread: boolean; counterpart: string };

test.describe.configure({ mode: "serial" });
test.describe("messaging", () => {
  let org: { id: string; email: string }, orgMate: { id: string; email: string }, prov: { id: string; email: string }, stranger: { id: string; email: string }, shopper: { id: string; email: string };
  let orgC: SupabaseClient, mateC: SupabaseClient, provC: SupabaseClient, strC: SupabaseClient, shopC: SupabaseClient;
  let orgWs: string, provWs: string, event: string, conv: string;

  test.beforeAll(async () => {
    [org, orgMate, prov, stranger, shopper] = await Promise.all(["ms-org", "ms-mate", "ms-prov", "ms-str", "ms-shop"].map(l => createUser(l)));
    orgWs = await seedWorkspace(org.id, "organizer", "Msg Org");
    provWs = await seedWorkspace(prov.id, "provider", "Msg Caterers");
    await db.from("workspace_members").insert({ workspace_id: orgWs, user_id: orgMate.id, role: "member" });
    const listing = ((await db.from("listings").insert({ workspace_id: provWs, name: "Msg Caterers", kind: "service", category: "catering", published: true }).select("id").single()).data as { id: string }).id;
    event = ((await db.from("events").insert({ owner_id: org.id, workspace_id: orgWs, name: "Msg event" }).select("id").single()).data as { id: string }).id;
    await db.from("build_items").insert({ event_id: event, listing_id: listing, category: "catering", title: "Msg Caterers", status: "quoted", amount: 900 });
    [orgC, mateC, provC, strC, shopC] = await Promise.all([org, orgMate, prov, stranger, shopper].map(u => signedIn(u.email))) as unknown as SupabaseClient[];
  });
  test.afterAll(async () => {
    await db.from("listings").update({ published: false }).eq("workspace_id", provWs);
    await db.from("conversations").delete().in("id", conv ? [conv] : []);
    await db.from("events").delete().eq("id", event);
    await db.from("workspaces").delete().in("id", [orgWs, provWs]);
    await cleanup();
  });

  test("contacts come from real relationships; strangers can't be messaged", async () => {
    const { data } = await orgC.rpc("my_contacts", { p_workspace: orgWs });
    const labels = (data as { label: string; context: string }[]).map(c => c.context);
    expect(labels).toEqual(expect.arrayContaining(["Supplier · Msg Caterers"]));
    expect((await orgC.rpc("start_conversation", { p_kind: "direct", p_subject: "", p_to_type: "user", p_to: stranger.id, p_body: "hi", p_as_workspace: null, p_event: null, p_listing: null, p_item: null })).error?.message).toMatch(/not_allowed/);
    // Anyone may enquire with a workspace that has a published listing.
    const { error } = await shopC.rpc("start_conversation", { p_kind: "enquiry", p_subject: "Wedding in June", p_to_type: "workspace", p_to: provWs, p_body: "Do you cater 120?", p_as_workspace: null, p_event: null, p_listing: null, p_item: null });
    expect(error).toBeNull();
  });

  test("workspace seat: organizer team shares the thread with the provider team; outsiders see nothing", async () => {
    const { data, error } = await orgC.rpc("start_conversation", { p_kind: "booking", p_subject: "Menu tasting", p_to_type: "workspace", p_to: provWs, p_body: "Can we book a tasting?", p_as_workspace: orgWs, p_event: event, p_listing: null, p_item: null });
    expect(error).toBeNull();
    conv = data as string;
    // Re-using the same context returns the same conversation.
    expect((await orgC.rpc("start_conversation", { p_kind: "booking", p_subject: "Menu tasting", p_to_type: "workspace", p_to: provWs, p_body: "Following up", p_as_workspace: orgWs, p_event: event, p_listing: null, p_item: null })).data).toBe(conv);
    const provInbox = (await provC.rpc("my_conversations", { p_workspace: provWs, p_limit: 50 })).data as Conv[];
    expect(provInbox.find(c => c.id === conv)).toMatchObject({ unread: true, counterpart: "Msg Org" });
    expect(((await mateC.from("conversation_messages").select("id").eq("conversation_id", conv)).data ?? []).length).toBe(2);
    expect((await strC.from("conversation_messages").select("id").eq("conversation_id", conv)).data).toEqual([]);
    expect((await strC.rpc("post_message", { p_conv: conv, p_body: "let me in", p_attachments: [], p_as_workspace: null })).error?.message).toMatch(/not_authorized/);
    // Can't speak for a workspace you don't belong to.
    expect((await mateC.rpc("post_message", { p_conv: conv, p_body: "x", p_attachments: [], p_as_workspace: provWs })).error?.message).toMatch(/not_authorized/);
    expect((await provC.rpc("post_message", { p_conv: conv, p_body: "Tuesday works", p_attachments: [], p_as_workspace: provWs })).error).toBeNull();
    await provC.rpc("mark_conversation_read", { p_conv: conv });
    expect(((await provC.rpc("my_conversations", { p_workspace: provWs, p_limit: 50 })).data as Conv[]).find(c => c.id === conv)?.unread).toBe(false);
    const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", prov.id).eq("kind", "message");
    expect(count).toBeGreaterThan(0);
  });

  test("attachments must be the sender's own private uploads", async () => {
    const theirs = `${stranger.id}/${randomUUID()}.pdf`, mine = `${org.id}/${randomUUID()}.pdf`;
    expect((await orgC.rpc("post_message", { p_conv: conv, p_body: "", p_attachments: [{ path: theirs, name: "x.pdf" }], p_as_workspace: orgWs })).error?.message).toMatch(/invalid_attachment/);
    expect((await orgC.rpc("post_message", { p_conv: conv, p_body: "Menu attached", p_attachments: [{ path: mine, name: "menu.pdf" }], p_as_workspace: orgWs })).error).toBeNull();
  });
});
