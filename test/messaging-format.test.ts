import { test } from "node:test";
import assert from "node:assert/strict";
import { formatFileSize } from "@/lib/messaging/format";
import { badgeForConversationType, isInternalType } from "@/lib/messaging/types";

test("formatFileSize renders bytes/KB/MB thresholds", () => {
  assert.equal(formatFileSize(512), "512 B");
  assert.equal(formatFileSize(2048), "2 KB");
  assert.equal(formatFileSize(1_258_291), "1.2 MB");
});

test("badgeForConversationType maps every conversation type to Client/Supplier/Internal", () => {
  assert.equal(badgeForConversationType("client_direct"), "Client");
  assert.equal(badgeForConversationType("client_group"), "Client");
  assert.equal(badgeForConversationType("event_client"), "Client");
  assert.equal(badgeForConversationType("supplier_direct"), "Supplier");
  assert.equal(badgeForConversationType("supplier_group"), "Supplier");
  assert.equal(badgeForConversationType("event_supplier"), "Supplier");
  assert.equal(badgeForConversationType("direct_internal"), "Internal");
  assert.equal(badgeForConversationType("group_internal"), "Internal");
  assert.equal(badgeForConversationType("event_internal"), "Internal");
  assert.equal(badgeForConversationType("internal_note_thread"), "Internal");
  assert.equal(badgeForConversationType("mixed_external"), "Internal");
});

test("isInternalType agrees with badgeForConversationType", () => {
  assert.equal(isInternalType("direct_internal"), true);
  assert.equal(isInternalType("client_direct"), false);
  assert.equal(isInternalType("supplier_group"), false);
});
