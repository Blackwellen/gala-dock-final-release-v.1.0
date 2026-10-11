"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** A select bound to one URL search param (deep-linkable filters/periods). */
export function ParamSelect({ param, options, value, label, className = "ws-select", resetParams = [] }: {
  param: string; options: { value: string; label: string }[]; value: string; label: string; className?: string; resetParams?: string[];
}) {
  const router = useRouter(), pathname = usePathname(), sp = useSearchParams();
  return <select aria-label={label} className={className} value={value} onChange={e => {
    const next = new URLSearchParams(sp.toString());
    if (e.target.value === options[0]?.value) next.delete(param); else next.set(param, e.target.value);
    for (const p of resetParams) next.delete(p);
    const q = next.toString();
    router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}
