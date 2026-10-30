import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, anon, cleanup, createUser, seedWorkspace, signedIn } from "../phase1/helpers";
import { COUNTRIES, CURRENCIES, TAXONOMIES, TIMEZONES, buildCategoryOf, resolveTerm, spellings, type TaxonomyName } from "../../src/lib/master-data";
import { catalogIssues } from "../../src/lib/master-data/catalog";
import { amenities, countries, currencies, listingEventTypes, organizerEventTypes, serviceCategories, venueTypes } from "../../src/lib/onboarding-schema";
import { MORE_OCCASIONS, MUST_HAVES, OCCASIONS, OPTIONALS, buildCat } from "../../src/lib/plan-model";
import { LEGAL } from "../../src/lib/legal";

// Q02 exit gate: one canonical master-data definition (src/lib/master-data) used by UI and server, mirrored in the
// database for SQL validation, with no drift and no unresolved stored values.
const db = admin as unknown as SupabaseClient;
const all = async <T>(table: string, cols: string) => { const { data, error } = await db.from(table).select(cols).limit(5000); expect(error).toBeNull(); return data as unknown as T[]; };

test.describe("Q02 canonical master data", () => {
  test.afterAll(cleanup);

  test("the catalog is internally consistent (no ambiguous spellings, unknown parents or surface keys)", () => {
    expect(catalogIssues()).toEqual([]);
  });

  test("screens keep their designed wording and order while reading the canonical catalog", () => {
    // The designed lists these screens showed before consolidation lead, unchanged (stored label values must not change);
    // onboarding lists then offer every remaining term (behind "More …"), so no valid value is unreachable.
    expect(organizerEventTypes.slice(0, 10)).toEqual(["Weddings", "Corporate Events", "Festivals", "Conferences", "Private Events", "Nightclubs", "Concerts & Live Shows", "Remote / Hybrid", "Community Events", "Mixed / Custom"]);
    expect(listingEventTypes.slice(0, 6)).toEqual(["Weddings", "Corporate Events", "Private Parties", "Conferences", "Exhibitions", "Other"]);
    expect(serviceCategories.slice(0, 10)).toEqual(["Catering", "Photography & Video", "DJs & Music", "Live Entertainment", "Décor & Florals", "Staffing", "Security", "AV & Production", "Transport", "Planning & Coordination"]);
    expect(venueTypes.slice(0, 7)).toEqual(["Event hall", "Hotel or conference centre", "Outdoor venue", "Bar or nightclub", "Restaurant", "Unique space", "Arena or stadium"]);
    for (const [list, taxonomy] of [[organizerEventTypes, "event_type"], [listingEventTypes, "event_type"], [serviceCategories, "service_category"], [venueTypes, "venue_type"]] as const)
      expect(new Set(list.map(v => resolveTerm(taxonomy, v))).size, taxonomy).toBe(TAXONOMIES[taxonomy].terms.length);
    expect(amenities).toEqual(["Step-free access", "On-site parking", "In-house catering", "AV equipment", "Outdoor space", "Licensed bar", "Accommodation", "Wi-Fi"]);
    expect(countries.map(c => c.code)).toEqual(["GB", "IE", "US", "CA", "DE", "FR", "AE", "ZA", "AU"]);
    expect(countries.find(c => c.code === "US")!.timezones.map(z => z.value)).toEqual(["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"]);
    expect(currencies).toEqual([{ value: "GBP", label: "GBP (£) – British Pound" }, { value: "EUR", label: "EUR (€) – Euro" }, { value: "USD", label: "USD ($) – US Dollar" },
      { value: "CAD", label: "CAD ($) – Canadian Dollar" }, { value: "AED", label: "AED – UAE Dirham" }, { value: "ZAR", label: "ZAR (R) – South African Rand" }, { value: "AUD", label: "AUD ($) – Australian Dollar" }]);
    expect(OCCASIONS.map(o => [o.key, o.label, o.img])).toEqual([["wedding", "Wedding", "type-wedding"], ["birthday", "Birthday", "type-birthday"], ["corporate", "Corporate", "type-corporate"],
      ["party", "Party", "type-party"], ["festival", "Festival", "type-festival"], ["nightlife", "Nightclub", "type-nightclub"], ["private_dinner", "Private Dinner", "type-private_dinner"], ["childrens_party", "Children's Party", "type-childrens_party"]]);
    // Wizard completeness sweep (2026-10-29): Gala, Charity and Webinar (online) added after Conference; existing labels unchanged.
    expect(MORE_OCCASIONS.map(o => o.label)).toEqual(["Conference", "Gala", "Charity", "Webinar (online)", "Awards", "Community", "Food & Drink", "Comedy", "Something else"]);
    expect(MUST_HAVES.map(o => o.label)).toEqual(["Venue", "Catering", "Drinks / Bar", "Entertainment", "Photography", "Decor & Styling"]);
    expect(OPTIONALS.map(o => o.key)).toEqual(["transport", "accommodation", "security", "staff", "invitations", "activities"]);
    expect(["accommodation", "security", "invitations", "activities", "venue"].map(buildCat)).toEqual(["transport", "staff", "extras", "extras", "venue"]);
  });

  test("legacy free-text categories map exactly as the old build-category table did", () => {
    const legacy: Record<string, string> = { catering: "food", food: "food", "private chef": "food", drinks: "drinks", bar: "drinks", "mobile bar": "drinks", dj: "entertainment", "dj & sound": "entertainment",
      "live music": "entertainment", band: "entertainment", performers: "entertainment", photography: "media", videography: "media", "photo booth": "media", "live streaming": "media", decor: "styling",
      flowers: "styling", florist: "styling", styling: "styling", security: "staff", staffing: "staff", "event staff": "staff", entertainment: "entertainment", music: "entertainment", "private dining": "food",
      media: "media", video: "media", hire: "hire", production: "production", lighting: "production", "sound & lighting": "production", av: "production", marquees: "hire", furniture: "hire",
      "equipment hire": "hire", transport: "transport", accommodation: "transport", "Entertainment > DJ": "entertainment", "Catering > Street food": "food", "something unheard of": "extras" };
    for (const [value, build] of Object.entries(legacy)) expect(buildCategoryOf("service", value), value).toBe(build);
    expect(buildCategoryOf("venue", "anything")).toBe("venue");
  });

  test("database mirror equals the TypeScript catalog (terms, spellings, currencies, countries, timezones)", async () => {
    const terms = await all<{ taxonomy: string; key: string; label: string; plural: string | null; parent_key: string | null; meta: object; deprecated: boolean }>("taxonomy_terms", "taxonomy,key,label,plural,parent_key,meta,deprecated");
    const live = terms.filter(t => !t.deprecated).map(t => `${t.taxonomy}|${t.key}|${t.label}|${t.plural ?? ""}|${t.parent_key ?? ""}|${JSON.stringify(t.meta)}`).sort();
    const want = (Object.keys(TAXONOMIES) as TaxonomyName[]).flatMap(n => TAXONOMIES[n].terms.map(t => `${n}|${t.key}|${t.label}|${t.plural ?? ""}|${t.parent ?? ""}|${JSON.stringify(t.meta ?? {})}`)).sort();
    expect(live).toEqual(want);
    const sp = await all<{ taxonomy: string; spelling: string; key: string }>("taxonomy_spellings", "taxonomy,spelling,key");
    expect(sp.map(s => `${s.taxonomy}|${s.spelling}|${s.key}`).sort()).toEqual((Object.keys(TAXONOMIES) as TaxonomyName[]).flatMap(n => [...spellings(n)].map(([s, k]) => `${n}|${s}|${k}`)).sort());
    const cur = await all<{ code: string; symbol: string; transactional: boolean; active: boolean }>("ref_currencies", "code,symbol,transactional,active");
    expect(cur.filter(c => c.active).map(c => `${c.code}|${c.symbol}|${c.transactional}`).sort()).toEqual(CURRENCIES.map(c => `${c.code}|${c.symbol}|${c.transactional}`).sort());
    const ctry = await all<{ code: string; name: string; currency: string; business: boolean; active: boolean }>("ref_countries", "code,name,currency,business,active");
    expect(ctry.filter(c => c.active).map(c => `${c.code}|${c.name}|${c.currency}|${c.business}`).sort()).toEqual(COUNTRIES.map(c => `${c.code}|${c.name}|${c.currency}|${c.business}`).sort());
    const tz = await all<{ tz: string; country: string; active: boolean }>("ref_timezones", "tz,country,active");
    expect(tz.filter(z => z.active).map(z => `${z.tz}|${z.country}`).sort()).toEqual(TIMEZONES.map(z => `${z.tz}|${z.country}`).sort());
  });

  test("SQL and TypeScript resolve the same values to the same canonical keys", async () => {
    const samples: [TaxonomyName, string][] = [["service_category", "Entertainment > DJ"], ["service_category", "Décor & Florals"], ["service_category", "Photo Booth"], ["service_category", "  live_music "],
      ["venue_type", "Rooftop"], ["venue_type", "Event Space / Multi-Purpose"], ["venue_type", "Hotel or conference centre"], ["event_type", "Children’s Parties"], ["event_type", "Nightclub / DJ Event"],
      ["event_type", "corporate_event"], ["event_type", "Mixed / Custom"], ["build_category", "catering"], ["event_type", "no such thing"]];
    const { data: listings } = await db.from("listings").select("kind,category").neq("category", "").limit(200);
    for (const l of (listings ?? []) as { kind: string; category: string }[]) samples.push([l.kind === "venue" ? "venue_type" : "service_category", l.category]);
    for (const [taxonomy, value] of samples) {
      const { data, error } = await anon().rpc("taxonomy_resolve" as never, { p_taxonomy: taxonomy, p_value: value } as never);
      expect(error).toBeNull();
      expect(data, `${taxonomy}: ${value}`).toBe(resolveTerm(taxonomy, value));
    }
    const { data: b } = await db.rpc("build_category_of", { p_kind: "service", p_category: "Sound & Lighting" });
    expect(b).toBe(buildCategoryOf("service", "Sound & Lighting"));
  });

  test("every stored taxonomy/currency/timezone value resolves; plan commission matches the published fee schedule; legal version is registered", async () => {
    const { data, error } = await db.rpc("master_data_audit");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    expect((await db.rpc("legal_terms_version")).data).toBe(LEGAL.version);
    const { data: at, error: e2 } = await db.rpc("setting_at", { p_section: "commerce", p_at: new Date(Date.now() + 864e5).toISOString() });
    expect(e2).toBeNull();
    const { data: pub } = await db.from("platform_settings").select("version").eq("section", "commerce").eq("status", "published").single();
    expect((at as { version: number }[])[0]!.version).toBe((pub as { version: number }).version);
    // Before the first commerce version existed, nothing applies.
    expect((await db.rpc("setting_at", { p_section: "commerce", p_at: "2000-01-01T00:00:00Z" })).data).toEqual([]);
  });

  test("reference tables are public read-only; the database validates settings against master data", async () => {
    const a = anon();
    expect(((await a.from("ref_currencies" as never).select("code")).data as unknown[]).length).toBe(CURRENCIES.length);
    expect((await a.from("ref_currencies" as never).insert({ code: "XXX", name: "x", symbol: "x", catalog_version: 1 } as never)).error).not.toBeNull();
    expect((await a.rpc("master_data_audit" as never)).error).not.toBeNull();   // service-only

    const owner = await createUser("md-owner");
    const ws = await seedWorkspace(owner.id, "organizer", "Master Data Org");
    const c = await signedIn(owner.email);
    expect((await c.rpc("update_workspace_settings", { p_ws: ws, p: { currency: "EUR", timezone: "Europe/Paris" } })).error).toBeNull();
    expect((await c.rpc("update_workspace_settings", { p_ws: ws, p: { currency: "AED" } })).error?.message).toMatch(/invalid_currency/);   // listed, not transactional
    expect((await c.rpc("update_workspace_settings", { p_ws: ws, p: { timezone: "Mars/Olympus" } })).error?.message).toMatch(/invalid_timezone/);
    expect(((await db.from("workspaces").select("settings").eq("id", ws).single()).data as { settings: Record<string, string> }).settings).toMatchObject({ currency: "EUR", timezone: "Europe/Paris" });
    await db.from("workspaces").delete().eq("id", ws);
  });
});
