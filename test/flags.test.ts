import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFlags, isFlagEnabled, type ResolveInput } from "@/lib/flags/resolve";

const base: ResolveInput = {
  workspaceType: "organizer",
  releaseStage: "v1",
  plan: "business",
  env: {},
};

test("aiCopilot ON for business plan at v1", () => {
  assert.equal(isFlagEnabled("aiCopilot", base), true);
});

test("aiCopilot BLOCKED for starter plan (plan gate)", () => {
  assert.equal(isFlagEnabled("aiCopilot", { ...base, plan: "starter" }), false);
});

test("ticketing BLOCKED at v1 even with env on (version gate)", () => {
  assert.equal(
    isFlagEnabled("ticketing", { ...base, env: { NEXT_PUBLIC_TICKETING_ENABLED: "true" } }),
    false
  );
});

test("ticketing BLOCKED at v1_5 without env switch (dark by default)", () => {
  assert.equal(isFlagEnabled("ticketing", { ...base, releaseStage: "v1_5", env: {} }), false);
});

test("ticketing ON at v1_5 with env switch + business plan", () => {
  assert.equal(
    isFlagEnabled("ticketing", {
      ...base,
      releaseStage: "v1_5",
      env: { NEXT_PUBLIC_TICKETING_ENABLED: "true" },
    }),
    true
  );
});

test("marketplaceVenue HIDDEN from supplier persona", () => {
  assert.equal(
    isFlagEnabled("marketplaceVenue", {
      workspaceType: "supplier",
      releaseStage: "v2",
      plan: "business",
      env: { NEXT_PUBLIC_MARKETPLACE_ENABLED: "true" },
    }),
    false
  );
});

test("marketplaceVenue ON for organizer at v2 with env", () => {
  assert.equal(
    isFlagEnabled("marketplaceVenue", {
      workspaceType: "organizer",
      releaseStage: "v2",
      plan: "starter",
      env: { NEXT_PUBLIC_MARKETPLACE_ENABLED: "true" },
    }),
    true
  );
});

test("override CANNOT bypass the plan gate", () => {
  assert.equal(
    isFlagEnabled("aiCopilot", { ...base, plan: "starter", overrides: { aiCopilot: true } }),
    false
  );
});

test("override CAN turn off an otherwise-entitled flag", () => {
  assert.equal(isFlagEnabled("aiCopilot", { ...base, overrides: { aiCopilot: false } }), false);
});

test("resolveFlags returns a complete boolean map", () => {
  const m = resolveFlags(base);
  assert.equal(typeof m.calendarHub, "boolean");
  assert.equal(typeof m.escrow, "boolean");
});
