import { test, expect } from "@playwright/test";
import { parseSchedule, nextRunAt, describeSchedule, londonOffset, FAR_FUTURE_ISO } from "../../src/lib/agent/schedule";

// Q41/Q43 (W13 follow-up): routine due times. Pure computation — never touches the worker, the database or the model.
const at = (iso: string) => new Date(iso);
const next = (s: string, from: string, o: Parameters<typeof nextRunAt>[2] = {}) => nextRunAt(parseSchedule(s)!, at(from), o)!.at.toISOString();

test.describe("routine schedule parser", () => {
  test("a 30-minute routine is due 30 minutes after its last run", () => {
    expect(next("Every 30 min", "2026-10-29T17:30:10Z", { lastRun: at("2026-10-29T17:30:00Z") })).toBe("2026-10-29T18:00:00.000Z");
    // overdue (worker was down): next is 30 min from now, not a burst of catch-up runs
    expect(next("Every 30 min", "2026-10-29T20:00:00Z", { lastRun: at("2026-10-29T17:30:00Z") })).toBe("2026-10-29T20:30:00.000Z");
  });

  test("daily 08:00 is 08:00 Europe/London in both BST and GMT", () => {
    expect(next("Daily 08:00", "2026-07-01T09:00:00Z")).toBe("2026-07-02T07:00:00.000Z"); // BST → 07:00Z
    expect(next("Daily 08:00", "2026-12-01T09:00:00Z")).toBe("2026-12-02T08:00:00.000Z"); // GMT → 08:00Z
    expect(next("Daily 08:00", "2026-12-02T07:59:00Z")).toBe("2026-12-02T08:00:00.000Z"); // later the same day
  });

  test("the three Riverside routines no longer share one due time", () => {
    const from = "2026-10-29T17:30:05Z", last = { lastRun: at("2026-10-29T17:30:02Z"), occurrences: [{ id: "bk", starts_at: "2026-11-05T18:00:00Z", ends_at: "2026-11-05T23:00:00Z" }] };
    const due = ["Every 30 min", "Daily 08:00", "48h before events"].map(s => next(s, from, last));
    expect(new Set(due).size).toBe(3);
    expect(due).toEqual(["2026-10-29T18:00:02.000Z", "2026-10-30T08:00:00.000Z", "2026-11-03T18:00:00.000Z"]);
  });

  test("cron (organiser) is evaluated in London time", () => {
    expect(next("0 10 * * *", "2026-07-01T12:00:00Z")).toBe("2026-07-02T09:00:00.000Z");
    expect(next("0 9 1 * *", "2026-10-29T12:00:00Z")).toBe("2026-11-01T09:00:00.000Z");
    expect(next("0 9 * * 1", "2026-10-29T12:00:00Z")).toBe("2026-11-02T09:00:00.000Z");
    expect(next("*/15 * * * *", "2026-10-29T12:07:00Z")).toBe("2026-10-29T12:15:00.000Z");
  });

  test("weekly / monthly phrases", () => {
    expect(next("Weekly Monday", "2026-10-29T12:00:00Z")).toBe("2026-11-02T09:00:00.000Z");
    expect(next("Weekly Friday at 17:30", "2026-10-29T12:00:00Z")).toBe("2026-10-30T17:30:00.000Z");
    expect(next("Monthly on the 15th at 08:00", "2026-10-29T12:00:00Z")).toBe("2026-11-15T08:00:00.000Z");
  });

  test("event-relative: one due time per upcoming occurrence, earliest first; none → parked", () => {
    const occurrences = [{ id: "late", starts_at: "2026-12-10T19:00:00Z" }, { id: "soon", starts_at: "2026-11-10T19:00:00Z", ends_at: "2026-11-10T23:00:00Z" }];
    const r = nextRunAt(parseSchedule("event-7d")!, at("2026-10-29T12:00:00Z"), { occurrences })!;
    expect([r.at.toISOString(), r.occurrence]).toEqual(["2026-11-03T19:00:00.000Z", "soon"]);
    // after the first fires, the next occurrence is due
    expect(nextRunAt(parseSchedule("event-7d")!, r.at, { occurrences })!.occurrence).toBe("late");
    const after = nextRunAt(parseSchedule("Day after event")!, at("2026-10-29T12:00:00Z"), { occurrences })!;
    expect([after.at.toISOString(), after.occurrence]).toEqual(["2026-11-11T09:00:00.000Z", "soon"]);
    expect(nextRunAt(parseSchedule("48h before events")!, at("2026-10-29T12:00:00Z"), { occurrences: [] })!.at.toISOString()).toBe(new Date(FAR_FUTURE_ISO).toISOString());
  });

  test("event triggers park; unparseable schedules return null (never a silent +24h)", () => {
    expect(nextRunAt(parseSchedule(null, { type: "event", event: "booking.confirmed" })!, at("2026-10-29T12:00:00Z"))!.at.toISOString()).toBe(new Date(FAR_FUTURE_ISO).toISOString());
    for (const bad of ["", "whenever", "61 * * * *", "Every 1 min"]) expect(parseSchedule(bad)).toBeNull();
  });

  test("DST: offsets and the repeated autumn hour", () => {
    expect(londonOffset(at("2026-07-01T12:00:00Z"))).toBe(60);
    expect(londonOffset(at("2026-12-01T12:00:00Z"))).toBe(0);
    expect(next("30 1 * * *", "2026-10-24T12:00:00Z")).toBe("2026-10-25T00:30:00.000Z"); // first 01:30 (BST) on change day
    expect(next("0 8 * * *", "2026-03-28T12:00:00Z")).toBe("2026-03-29T07:00:00.000Z"); // spring-forward day
  });

  test("plain-English descriptions for the routine UIs", () => {
    expect(describeSchedule(parseSchedule("Every 30 min"))).toBe("Every 30 minutes");
    expect(describeSchedule(parseSchedule("Daily 08:00"))).toBe("Daily at 08:00");
    expect(describeSchedule(parseSchedule("0 9 * * 1"))).toBe("Weekly on Monday at 09:00");
    expect(describeSchedule(parseSchedule("48h before events"))).toBe("2 days before each event");
    expect(describeSchedule(parseSchedule("Day after event"))).toBe("1 day after each event at 09:00");
  });
});
