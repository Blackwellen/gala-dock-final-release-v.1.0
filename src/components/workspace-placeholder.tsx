import Link from "next/link";
import { Logo } from "./ui";

/** Authorised landing for each context. Full dashboards are delivered in a later phase. */
export function WorkspacePlaceholder({ title, subtitle }: { title: string; subtitle: string }) {
  return <main className="workspace-placeholder" aria-labelledby="workspace-title">
    <header><Logo small /><form action="/auth/signout" method="post"><button type="submit" className="button outline">Sign out</button></form></header>
    <section><h1 id="workspace-title">{title}</h1><p>{subtitle}</p>
      <nav aria-label="Switch context"><Link href="/discover">Discover</Link><Link href="/organizer">Organizer</Link><Link href="/provider">Provider</Link><Link href="/onboarding">Add an experience</Link></nav></section>
  </main>;
}
