import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { untyped } from "@/lib/workspace/db";

/** Partner resource downloads, personalised with the caller's referral code. Partners only (RLS on partners). */
export async function GET(request: Request, ctx: RouteContext<"/partner/resources/[slug]">) {
  const { slug } = await ctx.params;
  const sb = untyped(await createClient());
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const { data } = await sb.from("partners").select("name,referral_code,commission_bps,commission_basis").eq("user_id", user.id).neq("status", "terminated").limit(1).maybeSingle();
  const p = data as { name: string; referral_code: string | null; commission_bps: number; commission_basis: string } | null;
  if (!p?.referral_code) return new Response("Not found", { status: 404 });
  const origin = new URL(request.url).origin, link = `${origin}/?ref=${encodeURIComponent(p.referral_code)}`, rate = `${p.commission_bps / 100}%`;
  const text = (name: string, body: string, type = "text/plain; charset=utf-8") => new Response(body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" } });
  switch (slug) {
    case "brand-guidelines": return text("gala-dock-brand-guidelines.md", `# Gala Dock brand guidelines (partners)

Logo: use the supplied Gala·Dock lockup on white or very light backgrounds. Keep clear space equal to the height of the "G" mark on every side. Never stretch, recolour or add effects.

Colours
- Gala Dock blue: #0038FD
- Electric blue: #1A1AF2
- Ink: #02032E
- Canvas: #FCFDFE

Typography: Inter for web and documents.

Naming: write "Gala Dock" (two words) in body copy; the lockup uses a middle dot.

Claims: describe Gala Dock as a platform to plan, book and sell events. Don't promise prices, availability or commission levels on Gala Dock's behalf.

Your referral link: ${link}
`, "text/markdown; charset=utf-8");
    case "banner-assets": {
      const png = await readFile(path.join(process.cwd(), "public", "brand", "gala-dock-logo.png"));
      return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": 'attachment; filename="gala-dock-logo.png"', "Cache-Control": "private, max-age=3600" } });
    }
    case "partner-guide": return text("gala-dock-partner-guide.txt", `Gala Dock Partner Guide — ${p.name}

1. Share your link: ${link}
   Sign-ups that arrive through this link are attributed to your partner account.
2. Who to refer: event organisers, venues and suppliers who run or serve events in the UK.
3. What you earn: ${rate} of ${p.commission_basis.replaceAll("_", " ")} from accounts you refer, while they stay active.
4. When you're paid: commission clears after a 14-day refund window and is paid monthly after the statement closes.
5. Not allowed: paid search on the Gala Dock brand, self-referrals, incentivised sign-ups or misleading claims.

Questions? Use Contact Support in the partner portal.
`);
    case "embed-widgets": return text("gala-dock-widgets.html", `<!-- Gala Dock search widget — attributed to ${p.name} -->
<a href="${link}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:8px;background:#0038fd;color:#fff;font:600 14px/1 Inter,Arial,sans-serif;text-decoration:none">
  Find venues &amp; suppliers on Gala Dock
</a>

<!-- Event discovery link -->
<a href="${origin}/events?ref=${encodeURIComponent(p.referral_code)}" target="_blank" rel="noopener">Browse events on Gala Dock</a>
`, "text/html; charset=utf-8");
    case "email-templates": return text("gala-dock-email-templates.txt", `Subject: The easier way to plan your next event

Hi {first name},

I've been using Gala Dock to plan and book events — venues, suppliers and ticketing in one place. If you're organising something soon, it's worth a look:
${link}

Best,
{your name}

---

Subject: List your venue (or services) on Gala Dock

Hi {first name},

Gala Dock connects venues and suppliers with organisers who are ready to book. You can set up a listing in a few minutes here:
${link}

Thanks,
{your name}
`);
    default: return new Response("Not found", { status: 404 });
  }
}
