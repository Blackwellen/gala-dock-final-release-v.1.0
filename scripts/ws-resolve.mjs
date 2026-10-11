// Resolves {job:Name} {item:Name} {quote:Name} {quote-draft:Name} {listing:Name} {space:Name} {package:Name} placeholders in manifest URLs to current record ids (demo data only).
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cache = new Map();
async function lookup(kind, name) {
  const key = `${kind}:${name}`;
  if (cache.has(key)) return cache.get(key);
  let id = null;
  if (kind === "job") id = (await sb.from("provider_jobs").select("id").eq("event_name", name).limit(1).maybeSingle()).data?.id;
  if (kind === "item") id = (await sb.from("build_items").select("id,event:events!inner(name)").eq("event.name", name).not("listing_id", "is", null).limit(1).maybeSingle()).data?.id;
  if (kind === "listing") id = (await sb.from("listings").select("id").eq("name", name).order("created_at").limit(1).maybeSingle()).data?.id;
  if (kind === "space") id = (await sb.from("spaces").select("id").eq("name", name).limit(1).maybeSingle()).data?.id;
  if (kind === "package") id = (await sb.from("packages").select("id").eq("name", name).limit(1).maybeSingle()).data?.id;
  if (kind === "quote" || kind === "quote-draft") {
    const item = await lookup("item", name);
    id = (await sb.from("provider_quotes").select("id").eq("build_item_id", item).eq("status", kind === "quote" ? "sent" : "draft").order("version", { ascending: false }).limit(1).maybeSingle()).data?.id;
  }
  cache.set(key, id ?? "missing");
  return id ?? "missing";
}
export async function resolveUrl(url) {
  let out = url;
  for (const m of url.matchAll(/\{(job|item|quote|quote-draft|listing|space|package):([^}]+)\}/g)) out = out.replace(m[0], await lookup(m[1], m[2]));
  return out;
}
