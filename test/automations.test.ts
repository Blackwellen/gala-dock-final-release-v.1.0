import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTOMATION_NODES, NODES_BY_ID, TRIGGER_NODES, AUTO_RUN_BLOCKED, nodesByCategory } from "@/lib/automations/nodes";
import { SLASH_COMMANDS, SLASH_BY_ID, searchCommands } from "@/lib/copilot/commands";

test("automation node registry is sizeable and indexed", () => {
  assert.ok(AUTOMATION_NODES.length >= 50, `expected >=50 nodes, got ${AUTOMATION_NODES.length}`);
  assert.equal(NODES_BY_ID["action.create_task"]?.kind, "action");
  assert.ok(TRIGGER_NODES.length >= 20);
});

test("payment + stripe nodes are hard-blocked from auto-run", () => {
  for (const id of ["payment.release_payout", "payment.issue_refund", "payment.capture", "integration.stripe_connect"]) {
    assert.ok(AUTO_RUN_BLOCKED.includes(id), `${id} must be auto-run blocked`);
  }
});

test("AI nodes require approval", () => {
  for (const nd of AUTOMATION_NODES.filter((x) => x.kind === "ai")) {
    assert.equal(nd.approvalRequired, true, `${nd.id} should require approval`);
  }
});

test("nodes group into categories", () => {
  const cats = nodesByCategory();
  assert.ok(cats["Triggers"]?.length >= 20);
  assert.ok(cats["Payment"]?.length === 3);
});

test("slash command registry is indexed and searchable", () => {
  assert.ok(SLASH_COMMANDS.length >= 12);
  assert.equal(SLASH_BY_ID["create-event"]?.requiresApproval, true);
  assert.ok(searchCommands("/supplier").some((c) => c.category === "Suppliers"));
});
