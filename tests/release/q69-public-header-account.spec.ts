import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { buildAccountLinks, countLabel, initialOf, nextMenuIndex, seatsFrom, usableSeat, type SiteAccount } from "../../src/components/site/account-links";

// Q69 public header account menu (Phase A). Pure link building + source checks only: no network, no dev server.
const src = (f: string) => readFileSync(f, "utf8");
const none: SiteAccount["seats"] = { organizer: false, provider: false, partner: false, admin: false };
const ws = (kind: string, over: Record<string, unknown> = {}) => ({ kind, member_status: "active", workspace_status: "active", onboarding_complete: true, ...over });

test("customer-only visitor: Go to my events, then Messages, Notifications, Account settings, Help (no workspace links)", () => {
  const l = buildAccountLinks({ seats: none });
  expect(l.map(x => x.label)).toEqual(["Go to my events", "Messages", "Notifications", "Account settings", "Help"]);
  expect(l.map(x => x.href)).toEqual(["/home", "/account/inbox", "/home", "/account", "/help"]);
});

test("one workspace link per seat held, in a fixed order after Go to my events", () => {
  const all = buildAccountLinks({ seats: { organizer: true, provider: true, partner: true, admin: true } }).filter(x => x.group === "workspace");
  expect(all.map(x => x.href)).toEqual(["/home", "/organizer", "/provider", "/partner", "/admin"]);
  expect(buildAccountLinks({ seats: { ...none, provider: true } }).filter(x => x.group === "workspace").map(x => x.href)).toEqual(["/home", "/provider"]);
  expect(buildAccountLinks({ seats: { ...none, admin: true } }).some(x => x.href === "/organizer")).toBe(false);
});

test("a seat only counts when it can be opened: active member, active workspace, onboarding finished", () => {
  expect(seatsFrom([ws("organizer")], { partner: false, admin: false })).toEqual({ ...none, organizer: true });
  expect(seatsFrom([ws("organizer", { member_status: "suspended" }), ws("provider", { workspace_status: "suspended" })], { partner: false, admin: false })).toEqual(none);
  expect(seatsFrom([ws("organizer", { onboarding_complete: false }), ws("provider", { member_status: "revoked" })], { partner: false, admin: false })).toEqual(none);
  expect(seatsFrom([ws("provider"), ws("provider")], { partner: true, admin: true })).toEqual({ organizer: false, provider: true, partner: true, admin: true });
  expect(seatsFrom(null, { partner: false, admin: false })).toEqual(none);
  expect(usableSeat(ws("provider"), "organizer")).toBe(false);
});

test("notification badge: hidden at 0 and on junk, capped at 99+; initials fall back to G", () => {
  expect(countLabel(0)).toBe("");
  expect(countLabel(-3)).toBe("");
  expect(countLabel(Number.NaN)).toBe("");
  expect(countLabel(7)).toBe("7");
  expect(countLabel(120)).toBe("99+");
  expect(initialOf("ada lovelace")).toBe("A");
  expect(initialOf("  ")).toBe("G");
  expect(initialOf("@x")).toBe("G");
  expect(initialOf("élodie")).toBe("É");
});

test("menu keys: arrows wrap, Home/End jump, start from the edge when nothing is focused, other keys ignored", () => {
  expect(nextMenuIndex("ArrowDown", -1, 6)).toBe(0);
  expect(nextMenuIndex("ArrowUp", -1, 6)).toBe(5);
  expect(nextMenuIndex("ArrowDown", 5, 6)).toBe(0);
  expect(nextMenuIndex("ArrowUp", 0, 6)).toBe(5);
  expect(nextMenuIndex("Home", 3, 6)).toBe(0);
  expect(nextMenuIndex("End", 1, 6)).toBe(5);
  expect(nextMenuIndex("a", 1, 6)).toBeNull();
  expect(nextMenuIndex("ArrowDown", 0, 0)).toBeNull();
});

test("server loader: one cached round per request, failures fall back to the signed-out header, counts only", () => {
  const s = src("src/components/site/site-account.ts");
  expect(s).toMatch(/import "server-only"/);
  expect(s).toMatch(/export const loadSiteAccount = cache\(/);
  expect(s).toMatch(/Promise\.all\(\[/);
  expect(s).toMatch(/rpc\("my_workspace_access"\)/);
  expect(s).toMatch(/from\("platform_admins"\)\.select\("user_id"\)\.eq\("user_id", user\.id\)/);
  expect(s).toMatch(/from\("partners"\)\.select\("id"\)\.eq\("user_id", user\.id\)\.neq\("status", "terminated"\)/);
  expect(s).toMatch(/count: "exact", head: true \}\)\.eq\("user_id", user\.id\)\.is\("read_at", null\)/);
  expect(s).toMatch(/if \(profile === undefined\) return null/);
  expect(s).toMatch(/catch \{\s*return null;/);
  expect(s).not.toMatch(/admin\.ts|service_role|SERVICE_ROLE|createAdminClient/);
  const h = src("src/components/site/site-header.tsx");
  expect(h).toMatch(/loadSiteAccount\(\)/);
  expect(h).not.toMatch(/auth\.getUser/);                                  // one loader, not a second session read
});

test("header: menu button pattern, signed-out actions unchanged, phone panel inside the mobile menu, sign out is a POST", () => {
  const m = src("src/components/site/account-menu.tsx");
  expect(m).toMatch(/^"use client";/);
  expect(m).toMatch(/aria-haspopup="menu"/);
  expect(m).toMatch(/aria-expanded=\{open\}/);
  expect(m).toMatch(/role="menu"/);
  expect(m).toMatch(/role="menuitem" tabIndex=\{-1\}/);
  expect(m).toMatch(/e\.key === "Escape"\) \{ e\.preventDefault\(\); close\(true\)/);      // Esc closes and returns focus
  expect(m).toMatch(/button\.current\?\.focus\(\)/);
  expect(m).toMatch(/nextMenuIndex\(e\.key/);
  expect(m.match(/<form action="\/auth\/signout" method="post">/g)?.length).toBe(2); // desktop menu + phone panel
  expect(m).not.toMatch(/href="\/auth\/signout"/);
  const b = src("src/components/site/site-header-bar.tsx");
  expect(b).toMatch(/<AccountMenu account=\{account\} \/>/);
  expect(b).toMatch(/<AccountMenuPanel account=\{account\}/);
  expect(b).toMatch(/href=\{HREF\.signIn\}[^>]*>Sign in<\/Link>/);
  expect(b).toMatch(/href=\{HREF\.getStarted\}[^>]*>Get Started/);
  expect(b).not.toMatch(/zoom/);
  const css = src("src/styles/public-site.css");
  expect(css).toMatch(/@media \(max-width: 640px\) \{\s*\.gp-acct \{ display: none; \}\s*\.gp-acct-panel \{ display: block; \}/);
  expect(css.slice(css.indexOf("Q69 account menu"))).not.toMatch(/zoom|scale\(/);
  expect(src("src/components/pwa/mobile-nav.tsx")).not.toMatch(/AccountMenu/);    // workspace chrome untouched
});
