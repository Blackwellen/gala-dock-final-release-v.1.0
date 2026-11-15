# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: release\event-cancellation.spec.ts >> cancellation fees by cause >> cancel dialog: organiser chooses the cause and explains force majeure
- Location: tests\release\event-cancellation.spec.ts:119:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "on_hold"
Received: undefined

Call Log:
- Timeout 20000ms exceeded while waiting on the predicate
```

# Test source

```ts
  33  |   test("cancelling queues refunds, notifies buyers and the worker records the outcome", async ({ request }) => {
  34  |     const ev = await event("Rainy Festival");
  35  |     const paid = `PAID${Date.now()}`, free = `FREE${Date.now()}`;
  36  |     await order(ev, 25, paid); await order(ev, 0, free);
  37  |     const c = await signedIn(owner.email) as unknown as SupabaseClient;
  38  |     expect((await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "short" })).error?.message).toMatch(/reason_required/);
  39  |     const { data, error } = await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "Severe weather warning closed the site." });
  40  |     expect(error).toBeNull(); expect((data as { orders_to_refund: number }).orders_to_refund).toBe(1);
  41  |     const { data: os } = await db.from("checkout_orders").select("order_ref,refund_status").eq("event_id", ev);
  42  |     expect(Object.fromEntries((os ?? []).map(o => [o.order_ref, o.refund_status]))).toEqual({ [paid]: "due", [free]: "not_required" });
  43  |     expect((await db.from("events").select("status").eq("id", ev).single()).data!.status).toBe("cancelled");
  44  |     const { data: n } = await db.from("notifications").select("title,kind").eq("user_id", buyer.id).eq("kind", "ticket_refund");
  45  |     expect((n ?? []).some(x => x.title.includes("Rainy Festival"))).toBe(true);
  46  |     // Refund notifications are mandatory email (payments category).
  47  |     expect((await db.from("email_outbox").select("category").eq("user_id", buyer.id).eq("category", "payments")).data!.length).toBeGreaterThan(0);
  48  |     // Worker: the fake session can't be refunded, so the order is marked failed with the reason (retried later), never "refunded".
  49  |     const res = await request.post(`${BASE}/api/cron/payments`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  50  |     expect(res.ok()).toBe(true);
  51  |     const { data: after } = await db.from("checkout_orders").select("refund_status,refund_error").eq("order_ref", paid).single();
  52  |     expect(after!.refund_status).toBe("failed"); expect(after!.refund_error).toBeTruthy();
  53  |     // A second cancel is refused.
  54  |     expect((await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "Severe weather warning closed the site." })).error?.message).toMatch(/invalid_state/);
  55  |   });
  56  | });
  57  | 
  58  | // Organizer Terms 2.4: buyers always refunded in full; organiser platform fees depend on why the event was cancelled.
  59  | test.describe("cancellation fees by cause", () => {
  60  |   let owner: { id: string; email: string }, buyer: { id: string }, staff: { id: string; email: string }, ws: string;
  61  |   test.beforeAll(async () => {
  62  |     [owner, buyer, staff] = await Promise.all([createUser("cf-o"), createUser("cf-b"), createUser("cf-admin")]);
  63  |     ws = await seedWorkspace(owner.id, "organizer", "Fees Org");
  64  |     await db.from("platform_admins").insert({ user_id: staff.id, title: "Test reviewer", permissions: ["tickets", "commerce"] });
  65  |   });
  66  |   test.afterAll(async () => {
  67  |     const { data: evs } = await db.from("events").select("id").eq("workspace_id", ws);
  68  |     const ids = (evs ?? []).map(e => e.id);
  69  |     await db.from("platform_charges").delete().in("event_id", ids);
  70  |     await db.from("checkout_orders").delete().in("event_id", ids);
  71  |     await db.from("events").delete().in("id", ids);
  72  |     await db.from("workspaces").delete().eq("id", ws);
  73  |     await db.from("platform_admins").delete().eq("user_id", staff.id);
  74  |     await cleanup();
  75  |   });
  76  |   // 2 tickets at £20: £2 booking fees (buyer, incl. VAT) + £2 commission (5%) + £0.40 VAT on it → £4.40 platform fees.
  77  |   const sold = async (name: string) => {
  78  |     const ev = ((await db.from("events").insert({ owner_id: owner.id, workspace_id: ws, name, status: "on_sale", starts_at: new Date(Date.now() + 10 * 864e5).toISOString() }).select("id").single()).data as { id: string }).id;
  79  |     const ref = `CF${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  80  |     const r = await db.from("checkout_orders").insert({ order_ref: ref, event_id: ev, buyer_id: buyer.id, token: `tok-${ref}`, amount: 40, fee: 2, commission: 2, currency: "GBP", status: "issued", stripe_session: `cs_test_fake_${ref}`, kind: "primary" });
  81  |     expect(r.error).toBeNull();
  82  |     return ev;
  83  |   };
  84  |   const charge = async (ev: string) => (await db.from("platform_charges").select("amount,status").eq("event_id", ev).maybeSingle()).data;
  85  |   const refund = async (ev: string) => (await db.from("checkout_orders").select("refund_status").eq("event_id", ev).single()).data?.refund_status;
  86  | 
  87  |   test("own decision: buyers refunded, fees payable", async () => {
  88  |     const ev = await sold("Low Sales Night");
  89  |     const c = await signedIn(owner.email) as unknown as SupabaseClient;
  90  |     const { data, error } = await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "Not enough tickets sold to run it.", p_cause: "organiser" });
  91  |     expect(error).toBeNull();
  92  |     expect(data).toMatchObject({ fees_due: 4.4, fees_on_hold: 0, cause: "organiser" });
  93  |     expect(await refund(ev)).toBe("due");
  94  |     expect(await charge(ev)).toEqual({ amount: 4.4, status: "due" });
  95  |   });
  96  | 
  97  |   test("force majeure: needs an explanation, fees on hold, waived when accepted", async () => {
  98  |     const ev = await sold("Flooded Fair");
  99  |     const c = await signedIn(owner.email) as unknown as SupabaseClient;
  100 |     expect((await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "The venue flooded overnight.", p_cause: "force_majeure", p_fm_detail: "flood" })).error?.message).toMatch(/fm_detail_required/);
  101 |     expect((await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "The venue flooded overnight.", p_cause: "platform" })).error?.message).toMatch(/not_authorized/);
  102 |     const { data, error } = await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "The venue flooded overnight.", p_cause: "force_majeure",
  103 |       p_fm_detail: "River burst its banks; the council closed the venue. Closure notice: https://example.org/notice" });
  104 |     expect(error).toBeNull();
  105 |     expect(data).toMatchObject({ fees_due: 0, fees_on_hold: 4.4, cause: "force_majeure" });
  106 |     expect(await refund(ev)).toBe("due");                       // buyers refunded regardless
  107 |     expect(await charge(ev)).toEqual({ amount: 4.4, status: "on_hold" });
  108 |     // The organiser can't decide their own claim; a Gala Dock reviewer can.
  109 |     expect((await c.rpc("admin_review_force_majeure", { p_event: ev, p_approve: true, p_reason: "self-approve" })).error?.message).toMatch(/not_authorized/);
  110 |     const s = await signedIn(staff.email) as unknown as SupabaseClient;
  111 |     expect((await s.rpc("admin_review_force_majeure", { p_event: ev, p_approve: true, p_reason: "Council closure notice checked." })).error).toBeNull();
  112 |     expect(await charge(ev)).toEqual({ amount: 4.4, status: "waived" });
  113 |     expect((await db.from("event_cancellations").select("fm_status").eq("event_id", ev).single()).data?.fm_status).toBe("approved");
  114 |     const { data: n } = await db.from("notifications").select("title").eq("user_id", owner.id).ilike("title", "Force majeure accepted%");
  115 |     expect(n?.length).toBe(1);
  116 |     expect((await s.rpc("admin_review_force_majeure", { p_event: ev, p_approve: false, p_reason: "second decision" })).error?.message).toMatch(/invalid_state/);
  117 |   });
  118 | 
  119 |   test("cancel dialog: organiser chooses the cause and explains force majeure", async ({ page }) => {
  120 |     const ev = await sold("Storm Gala");
  121 |     await login(page, owner.email, `/organizer/events/${ev}`);
  122 |     await page.getByRole("button", { name: "Change status" }).click({ timeout: 30_000 });
  123 |     await page.getByRole("menuitem", { name: "Cancelled" }).click();
  124 |     const dialog = page.getByRole("dialog");
  125 |     await expect(dialog.getByText("Whatever the reason, every buyer gets a full refund")).toBeVisible();
  126 |     await dialog.getByLabel("Message to attendees: why the event is cancelled").fill("A red weather warning has closed the site.");
  127 |     await dialog.getByRole("radio", { name: /Force majeure/ }).check();
  128 |     const confirm = dialog.getByRole("button", { name: "Confirm" });
  129 |     await expect(confirm).toBeDisabled();                         // explanation required
  130 |     await dialog.getByLabel(/What happened, and how it stops the event/).fill("Met Office red warning for wind covering the site; the venue has closed. https://example.org/warning");
  131 |     await expect(confirm).toBeEnabled();
  132 |     await confirm.click();
> 133 |     await expect.poll(async () => (await charge(ev))?.status, { timeout: 20_000 }).toBe("on_hold");
      |                                                                                    ^ Error: expect(received).toBe(expected) // Object.is equality
  134 |     expect((await db.from("event_cancellations").select("cause,fm_status").eq("event_id", ev).single()).data).toEqual({ cause: "force_majeure", fm_status: "pending" });
  135 |   });
  136 | 
  137 |   test("force majeure rejected: fees become payable and the organiser is told why", async () => {
  138 |     const ev = await sold("Headliner Pulled Out");
  139 |     const c = await signedIn(owner.email) as unknown as SupabaseClient;
  140 |     await c.rpc("cancel_event_with_refunds", { p_event: ev, p_reason: "Our headliner cancelled at short notice.", p_cause: "force_majeure", p_fm_detail: "The headline act cancelled their tour for personal reasons." });
  141 |     const s = await signedIn(staff.email) as unknown as SupabaseClient;
  142 |     expect((await s.rpc("admin_review_force_majeure", { p_event: ev, p_approve: false, p_reason: "A performer cancelling isn’t force majeure under 2.4(c)." })).error).toBeNull();
  143 |     expect(await charge(ev)).toEqual({ amount: 4.4, status: "due" });
  144 |     const { data: n } = await db.from("notifications").select("body").eq("user_id", owner.id).ilike("title", "Force majeure not accepted%");
  145 |     expect(n?.[0]?.body).toMatch(/performer cancelling/);
  146 |   });
  147 | });
  148 | 
```