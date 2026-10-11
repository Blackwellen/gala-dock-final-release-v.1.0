import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security";

/**
 * Launch waiting room (release spec §52). POST joins the queue, GET polls position. The browser holds an opaque random token in an
 * httpOnly cookie; only its hash is stored. Positions and admission come from the database (queue_status), never the client.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cookieName = (id: string) => `gd_q_${id.replace(/-/g, "").slice(0, 12)}`;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

async function handle(request: Request, id: string, join: boolean) {
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimit(`queue:${ip}:${id}`, join ? 10 : 120, 60))) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "30" } });
  const jar = await cookies();
  let token = jar.get(cookieName(id))?.value;
  const fresh = !token && join;
  if (fresh) token = randomBytes(24).toString("base64url");
  const sb = await createClient();
  const { data, error } = await sb.rpc((join ? "queue_join" : "queue_status") as never, { p_event: id, p_token_hash: token ? hash(token) : "0".repeat(64) } as never);
  if (error) return NextResponse.json({ error: "Queue unavailable" }, { status: 503 });
  const res = NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  if (fresh) res.cookies.set(cookieName(id), token!, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", maxAge: 6 * 3600, path: "/" });
  return res;
}

export async function POST(request: Request, ctx: RouteContext<"/api/events/[id]/queue">) { return handle(request, (await ctx.params).id, true); }
export async function GET(request: Request, ctx: RouteContext<"/api/events/[id]/queue">) { return handle(request, (await ctx.params).id, false); }
