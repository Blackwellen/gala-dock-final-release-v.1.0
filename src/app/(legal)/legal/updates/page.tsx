import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { safeNext } from "@/lib/redirects";
import { loadPending, type PendingDoc } from "@/lib/legal/published";
import { legalDoc } from "@/lib/legal/registry";
import { acceptLegalDocuments } from "@/lib/legal/actions";

export const metadata: Metadata = { title: "Updated terms · Gala Dock", robots: { index: false, follow: false } };

const ROLE: Record<string, string> = { customer: "Your account", organiser: "Organiser workspace", supplier: "Supplier workspace", venue: "Venue", partner: "Partner programme", promoter: "Promoter" };
const ERROR: Record<string, string> = {
  tick: "Tick the box to confirm you accept the documents.", express: "Each separately listed term needs its own tick.",
  changed: "One of the documents was updated while you were reading. Review the current version below.", rate: "Too many attempts. Try again later.",
  signin: "Please sign in again.", failed: "We couldn't record your acceptance. Please try again.",
};
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

/** Re-acceptance of changed legal documents (R3): shown at sign-in (/continue) and linked from the workspace banner. Business users may
 *  defer until the 15-day notice period ends; consumer documents and new roles must be accepted now. */
export default async function LegalUpdatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : "", "/continue");
  await requireUser(`/legal/updates?next=${encodeURIComponent(next)}`);
  const pending = await loadPending();
  if (!pending.length) redirect(next === "/continue" ? "/legal" : next);
  const required = pending.some(p => p.required);
  const later = pending.filter(p => !p.required).map(p => p.effective_at).sort()[0];
  const err = typeof sp.error === "string" ? ERROR[sp.error] : undefined;
  const groups = Object.entries(pending.reduce<Record<string, PendingDoc[]>>((a, p) => { (a[p.role] ??= []).push(p); return a; }, {}));
  return <article>
    <p className="lg-eyebrow">Legal</p>
    <h1>We&apos;ve updated our terms</h1>
    <p className="lg-summary">Please review the documents below and confirm you accept them. Each link opens the full text, its version and the date it applies from.</p>
    {later && <p className="lg-note" role="note">For your business, the changes take effect on <b>{day(later)}</b>. You can accept now or before then. If you don&apos;t agree, you can close your account before that date.</p>}
    {err && <p className="lg-err" role="alert">{err}</p>}
    <form action={acceptLegalDocuments}>
      <input type="hidden" name="next" value={next} />
      {groups.map(([role, docs]) => <section key={role}>
        <h2 id={`role-${role}`}>{ROLE[role] ?? role}{docs[0]?.workspace_name ? `: ${docs[0].workspace_name}` : ""}</h2>
        <ul className="lg-pending">{docs.map(d => <li key={d.slug}>
          <input type="hidden" name="doc" value={`${d.slug}|${d.version}`} />
          <Link href={d.href} target="_blank">{d.title}</Link> · version {d.label} · {d.required ? "applies now" : `applies from ${day(d.effective_at)}`}
          {d.previously_accepted && <small> (replaces the version you accepted)</small>}
          {d.express.length > 0 && <div className="lg-accept">{d.express.map(code => {
            const term = legalDoc(d.slug)?.express?.find(e => e.code === code);
            return <label key={code}><input type="checkbox" name={`express:${d.slug}`} value={code} required /><span>{term?.label ?? code}</span></label>;
          })}</div>}
        </li>)}</ul>
      </section>)}
      <div className="lg-accept">
        <label><input type="checkbox" name="accept" required /><span>I have read and accept the documents listed above{pending.some(p => p.role !== "customer") ? ", for myself and for the business I act for" : ""}.</span></label>
      </div>
      <div className="lg-actions">
        <button type="submit" className="lg-btn">Accept and continue</button>
        {!required && <Link className="lg-btn ghost" href={next}>Not now</Link>}
      </div>
    </form>
    <p className="lg-meta">Questions: <a href="mailto:legal@galadock.com">legal@galadock.com</a>. You can close your account at any time from Settings.</p>
  </article>;
}
