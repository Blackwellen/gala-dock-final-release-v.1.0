import Link from "next/link";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Crumbs } from "@/components/kit";

/** Organizer wizard chrome: breadcrumb, title, horizontal numbered stepper (URL step), content grid. */
export function WizardFrame({ crumbs, title, sub, steps, step, hrefFor, actions, children }: { crumbs: { label: string; href?: string }[]; title: string; sub: string; steps: { title: string; sub: string }[]; step: number; hrefFor: (n: number) => string | null; actions?: ReactNode; children: ReactNode }) {
  return <>
    <Crumbs items={crumbs} />
    <div className="k-page-head" style={{ marginTop: -6 }}><div><h1 style={{ fontSize: 28 }}>{title}</h1><p className="sub" style={{ fontSize: 14.5 }}>{sub}</p></div>{actions}</div>
    <ol className="wz-steps" aria-label="Steps">{steps.map((s, i) => { const n = i + 1, state = n < step ? "done" : n === step ? "current" : "todo"; const href = n < step ? hrefFor(n) : null; const inner = <><span className="n">{state === "done" ? <Check size={15} /> : n}</span><span><b>{s.title}</b><small>{s.sub}</small></span></>; return <li key={s.title} data-state={state} aria-current={state === "current" ? "step" : undefined}>{href ? <Link href={href}>{inner}</Link> : inner}</li>; })}</ol>
    {children}
  </>;
}
export function WizardFooter({ back, children }: { back?: { href: string; label?: string }; children: ReactNode }) {
  return <div className="wz-foot">{back ? <Link className="k-btn ghost lg" href={back.href}>{back.label ?? "Back"}</Link> : <span />}<div className="k-row" style={{ gap: 10 }}>{children}</div></div>;
}
