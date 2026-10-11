"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Search box bound to the `q` param; submits on Enter and keeps the other filters. */
export function SearchParam({ placeholder, param = "q", resetParams = ["page"] }: { placeholder: string; param?: string; resetParams?: string[] }) {
  const router = useRouter(), pathname = usePathname(), sp = useSearchParams();
  return <form role="search" className="ws-search-sm" onSubmit={e => {
    e.preventDefault();
    const v = String(new FormData(e.currentTarget).get(param) ?? "").trim();
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(param, v); else next.delete(param);
    for (const p of resetParams) next.delete(p);
    router.push(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
  }}>
    <Search aria-hidden="true" /><label className="sr-only" htmlFor={`sp-${param}`}>{placeholder}</label>
    <input id={`sp-${param}`} name={param} type="search" placeholder={placeholder} defaultValue={sp.get(param) ?? ""} />
  </form>;
}
