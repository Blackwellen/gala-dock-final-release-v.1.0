"use client";
// Q70 wizard tracer: client helpers shared by every multi-step flow.
import { useEffect, useState, type InputHTMLAttributes } from "react";
import { cleanDecimalText, decimalValue } from "@/lib/ui/wizard";

// The last step shown per pathname, kept for the life of the tab (a hard reload starts fresh, so the first render never steals focus).
let lastStep: { path: string; step: string } | null = null;

/**
 * Moves keyboard and screen-reader focus to the new step after Back/Next/stepper navigation (WCAG 2.4.3). The URL-driven wizards
 * keep the same page heading on every step, so nothing was announced and focus stayed on the button that no longer exists.
 * Target: the step's `[data-step-heading]`, else the stepper item marked `aria-current="step"`.
 */
export function StepFocus({ step }: { step: number | string }) {
  useEffect(() => {
    const path = window.location.pathname, now = String(step);
    const moved = !!lastStep && lastStep.path === path && lastStep.step !== now;
    lastStep = { path, step: now };
    if (!moved) return;
    const el = document.querySelector<HTMLElement>("[data-step-heading]") ?? document.querySelector<HTMLElement>('[aria-current="step"]');
    if (!el) return;
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
  }, [step]);
  return null;
}

type DecimalProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "defaultValue"> & {
  value: number; onValue: (n: number) => void; /** decimal places allowed (0 = whole numbers) */ decimals?: number; /** show n.toFixed(decimals) when not editing */ fixed?: boolean;
};
/** A money / decimal field that keeps what the user is typing ("12.", "0.5") instead of re-rendering the parsed number. */
export function DecimalInput({ value, onValue, decimals = 2, fixed = false, onBlur, ...rest }: DecimalProps) {
  const show = (n: number) => (fixed ? n.toFixed(decimals) : String(n));
  const [text, setText] = useState(() => show(value));
  const [seen, setSeen] = useState(value);
  // The parent changed the number (±buttons, presets, clamping): show it, unless the text already means that number.
  if (value !== seen) { setSeen(value); if (decimalValue(text) !== value) setText(show(value)); }
  return <input inputMode={decimals > 0 ? "decimal" : "numeric"} {...rest} value={text}
    onChange={e => { const t = cleanDecimalText(e.target.value, decimals), n = decimalValue(t); setText(t); setSeen(n); onValue(n); }}
    onBlur={e => { if (fixed) setText(show(value)); onBlur?.(e); }} />;
}
