"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";
import { safeNext } from "@/lib/redirects";

const ERRORS: [RegExp, string][] = [
  [/express_term_required/, "express"], [/terms_version_changed/, "changed"], [/rate_limited|54000/, "rate"], [/not_authenticated|42501/, "signin"],
];

/** Accept-updates form (/legal/updates): records acceptance of exactly the versions shown (hidden slug + version per document), with
 *  each express term's own tick. The database refuses a stale version or a missing express tick (legal_accept). */
export async function acceptLegalDocuments(form: FormData) {
  const next = safeNext(String(form.get("next") ?? ""), "/continue");
  const back = (e: string) => redirect(`/legal/updates?error=${e}&next=${encodeURIComponent(next)}`);
  if (form.get("accept") !== "on") back("tick");
  const docs = form.getAll("doc").map(String).filter(v => /^[a-z-]{2,40}\|[A-Za-z0-9.\-]{3,40}$/.test(v)).slice(0, 40);
  if (!docs.length) redirect(next);
  const items = docs.map(v => {
    const [slug, version] = v.split("|") as [string, string];
    const express = form.getAll(`express:${slug}`).map(String).filter(c => /^[a-z_]{3,40}$/.test(c));
    return { slug, version, express };
  });
  const sb = untyped(await createClient());
  const { error } = await sb.rpc("legal_accept", { p_items: items });
  if (error) back(ERRORS.find(([re]) => re.test(`${error.message} ${error.code ?? ""}`))?.[1] ?? "failed");
  redirect(next);
}
