import { test } from "node:test";
import assert from "node:assert/strict";
import { detectRoomConflicts, overlaps, durationMinutes } from "@/lib/events/scheduling";

test("overlap is half-open (touching edges do not overlap)", () => {
  assert.equal(overlaps("2026-07-01T22:00:00Z", "2026-07-01T23:00:00Z", "2026-07-01T23:00:00Z", "2026-07-02T00:00:00Z"), false);
  assert.equal(overlaps("2026-07-01T22:00:00Z", "2026-07-01T23:30:00Z", "2026-07-01T23:00:00Z", "2026-07-02T00:00:00Z"), true);
});

test("conflicts only within the same room", () => {
  const conflicts = detectRoomConflicts([
    { id: "a", roomId: "main", startsAt: "2026-07-01T22:00:00Z", endsAt: "2026-07-01T23:30:00Z" },
    { id: "b", roomId: "main", startsAt: "2026-07-01T23:00:00Z", endsAt: "2026-07-02T00:30:00Z" }, // overlaps a
    { id: "c", roomId: "garden", startsAt: "2026-07-01T23:00:00Z", endsAt: "2026-07-02T00:30:00Z" }, // diff room, no conflict
    { id: "d", roomId: "main", startsAt: "2026-07-02T00:30:00Z", endsAt: "2026-07-02T01:30:00Z" }, // after b, no conflict
  ]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].roomId, "main");
});

test("sets with no room are ignored", () => {
  assert.equal(detectRoomConflicts([{ id: "x", roomId: null, startsAt: "2026-07-01T22:00:00Z", endsAt: "2026-07-01T23:00:00Z" }]).length, 0);
});

test("duration in minutes", () => {
  assert.equal(durationMinutes("2026-07-01T22:00:00Z", "2026-07-01T23:30:00Z"), 90);
});
