import { test } from "node:test";
import assert from "node:assert/strict";
import { meetsPlan, upgradeMessage, PLAN_RANK } from "@/lib/billing/entitlements";

test("meetsPlan ranks plans correctly", () => {
  assert.equal(meetsPlan("business", "pro"), true);
  assert.equal(meetsPlan("starter", "business"), false);
  assert.equal(meetsPlan("enterprise", "enterprise"), true);
  assert.equal(meetsPlan("pro", "pro"), true);
});

test("upgradeMessage uses marketing labels", () => {
  assert.match(upgradeMessage("business"), /Scale/);
  assert.match(upgradeMessage("pro"), /Growth/);
  assert.match(upgradeMessage("enterprise"), /Enterprise/);
});

test("trial and free share the floor rank", () => {
  assert.equal(PLAN_RANK.trial, PLAN_RANK.free);
  assert.ok(PLAN_RANK.starter > PLAN_RANK.free);
  assert.ok(PLAN_RANK.enterprise > PLAN_RANK.business);
});
