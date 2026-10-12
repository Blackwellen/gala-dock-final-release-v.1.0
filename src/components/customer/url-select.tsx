"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** A select that writes its value into the URL (?param=value) so server pages can filter. Empty value removes the param. */
export function UrlSelect({ param, value, options, label, className = "k-select" }: { param: string; value: string; options: { value: string; label: string }[]; label: string; className?: string }) {
  const router = useRouter(), pathname = usePathname(), sp = useSearchParams();
  return <select className={className} aria-label={label} value={value} onChange={e => { const n = new URLSearchParams(sp.toString()); if (e.target.value) n.set(param, e.target.value); else n.delete(param); router.replace(`${pathname}${n.size ? `?${n}` : ""}`, { scroll: false }); }}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}
