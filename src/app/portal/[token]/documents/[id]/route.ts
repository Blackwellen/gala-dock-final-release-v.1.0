import { createClient } from "@/lib/supabase/server";
import { untyped, isUuid } from "@/lib/workspace/db";
import { hashToken, isTokenFormat } from "@/lib/security";

/** Shared-document download for a client portal link. The database validates the token hash (expiry, revocation,
 *  rate limit) and that the document belongs to the link's event; no service-role access is used. */
export async function GET(request: Request, ctx: RouteContext<"/portal/[token]/documents/[id]">) {
  const { token, id } = await ctx.params;
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (!isTokenFormat(token) || !isUuid(id)) return notFound();
  const sb = untyped(await createClient());
  const { data, error } = await sb.rpc("portal_document", { p_token_hash: hashToken(token), p_document: id });
  if (error?.message.includes("rate_limited")) return new Response("Too many requests", { status: 429 });
  const doc = (data as { title: string; mime: string; body: string }[] | null)?.[0];
  if (error || !doc) return notFound();
  const hex = doc.body.startsWith("\\x") ? doc.body.slice(2) : doc.body;
  const bytes = Buffer.from(hex, "hex");
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const name = doc.title.replace(/[^\w .()-]/g, "_");
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": doc.mime === "application/pdf" ? "application/pdf" : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
    "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
  } });
}
