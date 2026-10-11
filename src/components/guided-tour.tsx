"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tourFor, type Tour } from "@/lib/tours";

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6, BUBBLE_W = 320;

/**
 * Guided tour engine (release spec §86). The Gala Dock mark is the guide: it travels to each anchored element with a spotlight, arrow,
 * progress, Back / Next / Skip / Finish. Progress is saved per user (resume), finished tours don't repeat, and `?tour=1` restarts.
 * Mount once per shell: <GuidedTour />.
 */
export function GuidedTour() {
  const path = usePathname() ?? "/", params = useSearchParams();
  const [sb] = useState(createClient);
  const [tour, setTour] = useState<Tour | null>(null), [step, setStep] = useState(0), [rect, setRect] = useState<Rect | null>(null);
  const forced = params?.get("tour") === "1";

  // Decide whether to show the tour for this page (new → start, in progress → resume, finished/skipped → only when forced).
  useEffect(() => {
    const t = tourFor(path); let live = true;
    queueMicrotask(() => { if (live) { setTour(null); setRect(null); } });
    if (!t) return;
    (async () => {
      const { data: { user } } = await sb.auth.getUser(); if (!user || !live) return;
      const { data } = await sb.from("user_tours" as never).select("step,status").eq("tour_key", t.key).maybeSingle();
      const row = data as { step: number; status: string } | null;
      if (!forced && row && row.status !== "in_progress") return;
      // Automated browsers (E2E, visual checks) only see tours when asked for explicitly with ?tour=1.
      if (!forced && !row && navigator.webdriver) return;
      if (live) { setStep(forced ? 0 : Math.min(row?.step ?? 0, t.steps.length - 1)); setTour(t); }
    })();
    return () => { live = false; };
  }, [path, forced, sb]);

  const save = useCallback(async (t: Tour, s: number, status: "in_progress" | "completed" | "skipped") => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return;
    await sb.from("user_tours" as never).upsert({ user_id: user.id, tour_key: t.key, step: s, status, updated_at: new Date().toISOString() } as never);
  }, [sb]);

  // Anchor to the step's target (or centre when there isn't one on screen); follow scroll/resize.
  useLayoutEffect(() => {
    if (!tour) return;
    const sel = tour.steps[step]?.target;
    const measure = () => {
      const el = sel ? document.querySelector(sel) as HTMLElement | null : null;
      const visible = el && el.offsetParent !== null;
      if (visible) { const r = el!.getBoundingClientRect(); setRect({ top: r.top, left: r.left, width: r.width, height: r.height }); } else setRect(null);
    };
    const el = sel ? document.querySelector(sel) as HTMLElement | null : null;
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const t = setTimeout(measure, 250);
    addEventListener("resize", measure); addEventListener("scroll", measure, true);
    return () => { clearTimeout(t); removeEventListener("resize", measure); removeEventListener("scroll", measure, true); };
  }, [tour, step]);

  useEffect(() => {
    if (!tour) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { void save(tour, step, "skipped"); setTour(null); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [tour, step, save]);

  if (!tour) return null;
  const s = tour.steps[step]!, last = step === tour.steps.length - 1;
  const go = (n: number) => { setStep(n); void save(tour, n, "in_progress"); };
  const end = (status: "completed" | "skipped") => { void save(tour, step, status); setTour(null); };
  const vw = typeof window === "undefined" ? 1200 : innerWidth, vh = typeof window === "undefined" ? 800 : innerHeight;
  const place = s.placement ?? "bottom";
  let top = vh / 2 - 90, left = vw / 2 - BUBBLE_W / 2, arrow: "left" | "top" | "right" | "bottom" | null = null;
  if (rect) {
    if (place === "right" && rect.left + rect.width + BUBBLE_W + 40 < vw) { left = rect.left + rect.width + 24; top = rect.top + rect.height / 2 - 60; arrow = "left"; }
    else if (place === "left" && rect.left - BUBBLE_W - 40 > 0) { left = rect.left - BUBBLE_W - 24; top = rect.top + rect.height / 2 - 60; arrow = "right"; }
    else if (place === "top" && rect.top > 220) { left = rect.left + rect.width / 2 - BUBBLE_W / 2; top = rect.top - 200; arrow = "bottom"; }
    else { left = rect.left + rect.width / 2 - BUBBLE_W / 2; top = rect.top + rect.height + 18; arrow = "top"; }
    left = Math.max(12, Math.min(left, vw - BUBBLE_W - 12)); top = Math.max(12, Math.min(top, vh - 220));
  }
  return <div className="gd-tour" role="dialog" aria-modal="false" aria-labelledby="gd-tour-title">
    {rect ? <div className="gd-tour-spot" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} /> : <div className="gd-tour-dim" />}
    <div className={`gd-tour-bubble ${arrow ? `arrow-${arrow}` : ""}`} style={{ top, left, width: BUBBLE_W }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="gd-tour-guide" src="/brand/favicon-48.png" alt="" width={36} height={36} />
      <p className="gd-tour-progress">{tour.title} · {step + 1} of {tour.steps.length}</p>
      <h2 id="gd-tour-title">{s.title}</h2>
      <p>{s.body}</p>
      <div className="gd-tour-actions">
        <button type="button" className="gd-tour-skip" onClick={() => end("skipped")}>Skip tour</button>
        <span style={{ flex: 1 }} />
        {step > 0 && <button type="button" className="gd-tour-btn" onClick={() => go(step - 1)}>Back</button>}
        <button type="button" className="gd-tour-btn primary" autoFocus onClick={() => (last ? end("completed") : go(step + 1))}>{last ? "Finish" : "Next"}</button>
      </div>
    </div>
    <style>{`.gd-tour{position:fixed;inset:0;z-index:90;pointer-events:none;font-family:Inter,system-ui,sans-serif}
.gd-tour-dim{position:fixed;inset:0;background:rgba(9,10,46,.35)}
.gd-tour-spot{position:fixed;border-radius:10px;box-shadow:0 0 0 9999px rgba(9,10,46,.45),0 0 0 3px #5b6bff;transition:all .35s ease}
.gd-tour-bubble{position:fixed;pointer-events:auto;background:#fff;color:#090a52;border-radius:14px;padding:16px 16px 12px 16px;box-shadow:0 22px 50px -16px rgba(9,10,46,.45);transition:top .35s ease,left .35s ease}
.gd-tour-bubble h2{margin:4px 0 6px;font-size:16px}.gd-tour-bubble p{margin:0;font-size:13.5px;line-height:1.55;color:#3a3f8f}
.gd-tour-guide{position:absolute;top:-18px;left:-18px;border-radius:50%;background:#fff;box-shadow:0 6px 16px -6px rgba(9,10,46,.5);transition:transform .35s ease}
.gd-tour-progress{font-size:11px!important;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6a70b0!important;padding-left:18px}
.gd-tour-actions{display:flex;align-items:center;gap:8px;margin-top:14px}
.gd-tour-btn{height:32px;padding:0 14px;border-radius:8px;border:1px solid #dbe3f5;background:#fff;color:#090a52;font:inherit;font-weight:600;cursor:pointer}
.gd-tour-btn.primary{background:#0038fd;border-color:#0038fd;color:#fff}.gd-tour-skip{border:0;background:none;color:#6a70b0;font:inherit;cursor:pointer;padding:0}
.gd-tour-bubble::before{content:"";position:absolute;width:14px;height:14px;background:#fff;transform:rotate(45deg)}
.gd-tour-bubble.arrow-left::before{left:-7px;top:52px}.gd-tour-bubble.arrow-right::before{right:-7px;top:52px}
.gd-tour-bubble.arrow-top::before{top:-7px;left:calc(50% - 7px)}.gd-tour-bubble.arrow-bottom::before{bottom:-7px;left:calc(50% - 7px)}
.gd-tour-bubble:not([class*=arrow-])::before{display:none}
@media (prefers-reduced-motion:reduce){.gd-tour-spot,.gd-tour-bubble,.gd-tour-guide{transition:none}}`}</style>
  </div>;
}
