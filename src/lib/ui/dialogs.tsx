"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, Check, Copy, Info, X } from "lucide-react";
import "@/styles/dialogs.css";

/**
 * In-app replacements for window.confirm / prompt / alert. Each call mounts its own dialog (no provider or layout change needed),
 * returns a promise, and cleans up after itself. Accessible: role="dialog"/"alertdialog", aria-modal, labelled, focus moves in and
 * back to the trigger, Tab is trapped, Esc cancels, Enter confirms (Ctrl/⌘+Enter in multi-line fields).
 */
type Base = { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
export type PromptOptions = Base & { label?: string; placeholder?: string; defaultValue?: string; multiline?: boolean; maxLength?: number; required?: boolean;
  /** Optional reason picker shown above the text field (e.g. report reasons). */
  choices?: { value: string; label: string }[]; choiceLabel?: string };
export type PromptResult = { value: string; choice: string | null };

function mount<T>(render: (done: (v: T) => void) => React.ReactNode): Promise<T> {
  if (typeof document === "undefined") return Promise.reject(new Error("no_document"));
  const opener = document.activeElement as HTMLElement | null;
  const host = document.createElement("div"); host.className = "gd-dialog-host"; document.body.appendChild(host);
  const root = createRoot(host);
  return new Promise<T>(resolve => {
    const done = (v: T) => { resolve(v); setTimeout(() => { root.unmount(); host.remove(); opener?.focus?.(); }, 0); };
    root.render(render(done));
  });
}

function Shell({ kind, title, message, danger, onCancel, children, footer }: { kind: "dialog" | "alertdialog"; title: string; message?: string; danger?: boolean; onCancel: () => void; children?: React.ReactNode; footer: React.ReactNode }) {
  const id = useId(), box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current!; const first = el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>("input,textarea,select,button");
    first?.focus(); document.body.classList.add("gd-dialog-open");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      if (e.key === "Tab") { const f = [...el.querySelectorAll<HTMLElement>("input,textarea,select,button:not([disabled])")]; if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1]!.focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0]!.focus(); } }
    };
    document.addEventListener("keydown", onKey); return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("gd-dialog-open"); };
  }, [onCancel]);
  const Icon = danger ? AlertTriangle : Info;
  return <div className="gd-dialog-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
    <div ref={box} className={`gd-dialog ${danger ? "danger" : ""}`} role={kind} aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={message ? `${id}-m` : undefined}>
      <div className="gd-dialog-head"><span className="gd-dialog-icon" aria-hidden="true"><Icon size={18} /></span><h2 id={`${id}-t`}>{title}</h2>
        <button type="button" className="gd-dialog-x" aria-label="Close" onClick={onCancel}><X size={16} /></button></div>
      {message && <p id={`${id}-m`} className="gd-dialog-msg">{message}</p>}
      {children}
      <div className="gd-dialog-foot">{footer}</div>
    </div>
  </div>;
}

/** Confirm an action. Resolves true when confirmed. */
export function confirmDialog(o: Base): Promise<boolean> {
  return mount<boolean>(done => <Shell kind="alertdialog" title={o.title} message={o.message} danger={o.danger} onCancel={() => done(false)}
    footer={<><button type="button" className="gd-btn" onClick={() => done(false)}>{o.cancelLabel ?? "Cancel"}</button>
      <button type="button" className={`gd-btn ${o.danger ? "danger" : "primary"}`} data-autofocus onClick={() => done(true)}>{o.confirmLabel ?? "Confirm"}</button></>} />);
}

/** Show a message. */
export function alertDialog(o: Omit<Base, "cancelLabel" | "danger"> & { danger?: boolean }): Promise<void> {
  return mount<void>(done => <Shell kind="alertdialog" title={o.title} message={o.message} danger={o.danger} onCancel={() => done()}
    footer={<button type="button" className="gd-btn primary" data-autofocus onClick={() => done()}>{o.confirmLabel ?? "OK"}</button>} />);
}

function PromptBody({ o, done }: { o: PromptOptions; done: (v: PromptResult | null) => void }) {
  const [value, setValue] = useState(o.defaultValue ?? ""), [choice, setChoice] = useState<string | null>(null), id = useId();
  const ok = (!o.choices || choice !== null) && (!o.required || value.trim().length > 0);
  const submit = () => { if (ok) done({ value: value.trim(), choice }); };
  return <Shell kind="dialog" title={o.title} message={o.message} danger={o.danger} onCancel={() => done(null)}
    footer={<><button type="button" className="gd-btn" onClick={() => done(null)}>{o.cancelLabel ?? "Cancel"}</button>
      <button type="button" className={`gd-btn ${o.danger ? "danger" : "primary"}`} disabled={!ok} onClick={submit}>{o.confirmLabel ?? "Save"}</button></>}>
    <form className="gd-dialog-form" onSubmit={e => { e.preventDefault(); submit(); }}>
      {o.choices && <fieldset className="gd-choices"><legend>{o.choiceLabel ?? "Choose one"}</legend>
        {o.choices.map((c, i) => <label key={c.value} className={choice === c.value ? "on" : ""}><input type="radio" name={`${id}-c`} value={c.value} checked={choice === c.value} onChange={() => setChoice(c.value)} data-autofocus={i === 0 ? true : undefined} />{c.label}</label>)}</fieldset>}
      {(o.label || !o.choices) && <label className="gd-field"><span>{o.label ?? "Your answer"}{o.required ? "" : " (optional)"}</span>
        {o.multiline ? <textarea rows={3} value={value} maxLength={o.maxLength ?? 1000} placeholder={o.placeholder} onChange={e => setValue(e.target.value)} data-autofocus={o.choices ? undefined : true}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }} />
          : <input value={value} maxLength={o.maxLength ?? 200} placeholder={o.placeholder} onChange={e => setValue(e.target.value)} data-autofocus={o.choices ? undefined : true} />}</label>}
    </form>
  </Shell>;
}
/** Ask for text (and optionally a reason). Resolves null when cancelled. */
export function promptDialog(o: PromptOptions): Promise<PromptResult | null> {
  return mount<PromptResult | null>(done => <PromptBody o={o} done={done} />);
}

function CopyBody({ title, text, done }: { title: string; text: string; done: () => void }) {
  const [copied, setCopied] = useState(false), ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  return <Shell kind="dialog" title={title} message="Your browser blocked automatic copying. Copy the text below." onCancel={done}
    footer={<><button type="button" className="gd-btn" onClick={done}>Close</button>
      <button type="button" className="gd-btn primary" onClick={() => { ref.current?.select(); try { document.execCommand("copy"); setCopied(true); } catch { /* user can copy manually */ } }}>{copied ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy</>}</button></>}>
    <input ref={ref} className="gd-copy" readOnly value={text} aria-label="Text to copy" onFocus={e => e.currentTarget.select()} data-autofocus />
  </Shell>;
}
/** Clipboard with an in-app fallback dialog (replaces window.prompt("Copy this:", …)). Resolves true if copied automatically. */
export async function copyText(text: string, title = "Copy link"): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { await mount<void>(done => <CopyBody title={title} text={text} done={() => done()} />); return false; }
}
