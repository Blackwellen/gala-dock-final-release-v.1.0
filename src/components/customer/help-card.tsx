import Link from "next/link";
import { ArrowRight, Lightbulb, type LucideIcon } from "lucide-react";
import "@/styles/cu-help.css";

export type HelpLink = { href: string; label: string; icon?: LucideIcon; sub?: string };

/** Customer helper card: practical next steps and shortcuts into existing flows. No AI — Gala Agent is an Organizer /
 *  Provider feature paid for with workspace credits, so customer screens point people at the tools that do the job. */
export function HelpCard({ title, text, links = [], tips = [], icon: Icon = Lightbulb, className = "" }: { title: string; text?: string; links?: HelpLink[]; tips?: string[]; icon?: LucideIcon; className?: string }) {
  return <section className={`ce-card cu-help ${className}`} aria-label={title}>
    <div className="cu-help-head"><span className="cu-help-ic"><Icon size={18} aria-hidden="true" /></span><div><b>{title}</b>{text && <p>{text}</p>}</div></div>
    {tips.length > 0 && <ul className="cu-help-tips">{tips.map(t => <li key={t}>{t}</li>)}</ul>}
    {links.length > 0 && <ul className="cu-help-links">{links.map(l => { const I = l.icon; return <li key={l.href + l.label}><Link href={l.href}>{I && <I size={15} aria-hidden="true" />}<span>{l.label}{l.sub && <small>{l.sub}</small>}</span><ArrowRight size={14} aria-hidden="true" /></Link></li>; })}</ul>}
  </section>;
}
