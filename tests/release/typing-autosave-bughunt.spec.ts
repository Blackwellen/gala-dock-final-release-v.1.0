import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Typing / auto-save bug hunt (owner report 2026-11-15: "help tours refresh break field entry or auto saves break field entries,
// shouldn't be auto saves"). Owner rule: forms never auto-save to the server; saves happen on an explicit Save / Next / Publish.
// Background work (guided tour, polling refreshes, prop re-syncs) must never steal focus, re-mount, or overwrite a field being typed.
// Source-level checks only: no browser, no network.
const src = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");   // working tree may be CRLF (core.autocrlf)
const files = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : []; });

/** Every useEffect(() => …, [deps]) body in a source file. */
function effects(s: string) {
  const out: string[] = []; const re = /useEffect\(\s*\(\)\s*=>/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) { let i = m.index + "useEffect(".length, depth = 1; while (i < s.length && depth) { const c = s[i]; if (c === "(") depth++; else if (c === ")") depth--; i++; } out.push(s.slice(m.index, i)); }
  return out;
}

test.describe("no server auto-save of form fields", () => {
  test("no effect anywhere debounces a server write (save/update/upsert/persist/patch action inside a timer)", () => {
    const offenders: string[] = [];
    for (const f of files("src").filter(f => f.endsWith(".tsx"))) {
      const s = src(f);
      // Identifiers imported from server-action modules in this file.
      const actions = new Set<string>();
      for (const im of s.matchAll(/import \{([^}]+)\} from "@\/[^"]*actions[^"]*"/g)) for (const n of im[1]!.split(",")) { const id = n.trim().split(/\s+as\s+/).pop()!.replace(/^type\s+/, ""); if (id) actions.add(id); }
      const writes = [...actions].filter(a => /^(save|update|upsert|persist|patch|write|autosave)/i.test(a));
      for (const body of effects(s)) {
        if (!/setTimeout\(|setInterval\(/.test(body)) continue;
        for (const w of writes) if (new RegExp(`\\b${w}\\(`).test(body)) offenders.push(`${f}: ${w}`);
        if (/fetch\([^)]*\{[^}]*method:\s*"(POST|PATCH|PUT)"/.test(body) && /save|draft/i.test(body)) offenders.push(`${f}: fetch write in timer`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("studio: the design is written to the server only from explicit actions; unsaved edits stay on this device", () => {
    const s = src("src/components/media/studio.tsx");
    // saveDesign is called in exactly one place (saveNow), and saveNow is never called from an effect.
    expect(s.match(/\bsaveDesign\(/g)).toHaveLength(1);
    expect(s).toMatch(/const saveNow = \(label\?: string\) => \{\n\s+const snap = doc, snapTitle = title, run = inflight\.current\.then\(async \(\) => \{[\s\S]{0,200}saveDesign\(/);
    // (The keyboard listener effect may call saveClick, but only for Ctrl/⌘+S.)
    for (const body of effects(s)) { expect(body).not.toMatch(/saveNow\(|saveDesign\(/); expect(body.replace(/e\.key\.toLowerCase\(\) === "s"\) \{ e\.preventDefault\(\); void saveClick\(\);/, "")).not.toMatch(/saveClick\(/); }
    // The local-draft effect only touches localStorage.
    expect(s).toMatch(/\/\/ Local draft only: written on every edit[^\n]*\n\s+useEffect\(\(\) => \{\n\s+if \(save !== "dirty"\) return;\n\s+try \{ localStorage\.setItem\(`gd_design_\$\{design\.id\}`/);
    // Explicit Save button + Ctrl/⌘+S (works inside fields too), visible Unsaved status, leave guards.
    expect(s).toMatch(/onClick=\{\(\) => void saveClick\(\)\}[^>]*>\s*<Save size=\{15\} \/>Save<\/button>/);
    expect(s).toMatch(/if \(\(e\.metaKey \|\| e\.ctrlKey\) && !e\.altKey && e\.key\.toLowerCase\(\) === "s"\) \{ e\.preventDefault\(\); void saveClick\(\); return; \}\n\s+if \(target\.isContentEditable/);
    expect(s).toMatch(/dirty: "Unsaved"/);
    expect(s).toMatch(/addEventListener\("beforeunload", h\)/);
    expect(s).toMatch(/const leave = \(e: React\.MouseEvent\) => \{[^}]*\n\s+if \(!window\.confirm\("You have unsaved changes\./);
    expect(s).not.toMatch(/autosave/i);
    // A save that finishes after more typing leaves the design "Unsaved" (doc and title both compared).
    expect(s).toMatch(/if \(latest\.current === snap && latestTitle\.current === snapTitle\) \{ setSave\("saved"\)/);
    // The device draft is offered once on open, not again when a save revalidates the page.
    expect(s).toMatch(/if \(!design\.canEdit \|\| draftChecked\.current === design\.id\) return;\n\s+draftChecked\.current = design\.id;/);
    expect(src("src/lib/help/articles.ts")).not.toMatch(/Changes save automatically/);
    expect(src("src/components/media/design-menu.tsx")).not.toMatch(/autosave/i);
  });

  test("RFQ wizard and onboarding keep drafts on the device only; the server is written on Send / Continue", () => {
    const r = src("src/components/organizer/rfq-wizard.tsx");
    expect(r).not.toMatch(/autosave/i);
    expect(r).toMatch(/const store = \{ get<T>\(k: string\): T \| null \{ try \{ return JSON\.parse\(localStorage\.getItem\(k\)/);
    for (const body of effects(r)) expect(body).not.toMatch(/sendRequest\(|fetch\(/);
    // Dirty-flag pattern: the device draft is read once per scope, so a re-render with new props never overwrites typing.
    expect(r).toMatch(/useEffect\(\(\) => \{ if \(readFor\.current === scope\) return; readFor\.current = scope;/);
    expect(r).toMatch(/useEffect\(\(\) => \{ if \(readFor\.current === key\) return; readFor\.current = key;/);
    const o = src("src/components/onboarding.tsx");
    for (const body of effects(o)) expect(body).not.toMatch(/fetch\(|post\(/);
    expect(o).toMatch(/if \(preview \|\| restored\.current\) return;\n\s+restored\.current = true;/);
    expect(o).toMatch(/sessionStorage\.setItem\(draftKey, JSON\.stringify\(values\)\)/);
  });
});

test.describe("guided tour never interrupts typing", () => {
  const t = src("src/components/guided-tour.tsx");
  test("no autoFocus; focus moves to Next only when no field is focused", () => {
    expect(t).not.toMatch(/autoFocus/);
    expect(t).toMatch(/useEffect\(\(\) => \{ if \(tour && !isEditingField\(\)\) nextRef\.current\?\.focus\(\{ preventScroll: true \}\); \}, \[tour\]\);/);
  });
  test("waits while a field has focus, and doesn't scroll a field away", () => {
    expect(t).toMatch(/if \(!isEditingField\(\)\) \{ open\(\); return; \}/);
    expect(t).toMatch(/document\.addEventListener\("focusout", later\)/);
    expect(t).toMatch(/return \(\) => \{ live = false; cleanup\(\); \};/);
    expect(t).toMatch(/if \(!isEditingField\(\)\) el\?\.scrollIntoView/);
    expect(t).toMatch(/e\.key === "Escape" && !e\.defaultPrevented && !isEditingField\(e\.target as Element\)/);
  });
  test("finished or skipped stays closed: saved per user and on the device, and ?tour=1 is dropped", () => {
    expect(t).toMatch(/if \(!forced && row && row\.status !== "in_progress"\) return;\n\s+if \(!forced && locallyDone\(t\.key\)\) return;/);
    expect(t).toMatch(/markLocallyDone\(t\.key\); void save\(t, s, status\); setTour\(null\);/);
    expect(t).toMatch(/u\.searchParams\.delete\("tour"\); history\.replaceState\(/);
    expect(t).toMatch(/const end = \(status: "completed" \| "skipped"\) => close\(tour, step, status\);/);
  });
  test("mounted once at the root, outside the page tree, so it can't re-mount a form", () => {
    expect(src("src/app/layout.tsx")).toMatch(/\{children\}<Suspense fallback=\{null\}><GuidedTour \/><\/Suspense>/);
  });
});

test.describe("background refreshes skip a tick while someone is typing", () => {
  test("typing guard helper", () => {
    const e = src("src/lib/ui/editing.ts");
    expect(e).toMatch(/export function isEditingField/);
    expect(e).toMatch(/return isEditingField\(\) && Date\.now\(\) - lastInput < RECENT_MS;/);
  });
  test("live board, message thread fallback poll and agent run log", () => {
    expect(src("src/components/live/live-client.tsx")).toMatch(/document\.visibilityState === "visible" && !isTyping\(\)\) router\.refresh\(\); \}, 20_000\)/);
    expect(src("src/components/messaging/messaging-client.tsx")).toMatch(/document\.visibilityState === "visible" && !isTyping\(\)\) router\.refresh\(\); \}, 30_000\)/);
    expect(src("src/components/agent/run-controls.tsx")).toMatch(/navigator\.onLine && !isTyping\(\)\) router\.refresh\(\)/);
  });
  test("no setInterval anywhere calls router.refresh() without a visibility or typing guard", () => {
    const bad: string[] = [];
    for (const f of files("src").filter(f => f.endsWith(".tsx"))) for (const m of src(f).matchAll(/setInterval\(([^\n]*?)router\.refresh\(\)/g)) if (!/isTyping\(\)|\+\+n > \d+/.test(m[1]!)) bad.push(f);
    expect(bad).toEqual([]);
  });
});
