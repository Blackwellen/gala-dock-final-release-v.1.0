/* eslint-disable @next/next/no-img-element -- small, fixed-size illustration thumbnails with reserved dimensions; next/image adds nothing */
import type { CSSProperties, ReactNode } from "react";
import { CircleAlert, CircleCheck, Clock3, type LucideIcon } from "lucide-react";

/** Server-safe building blocks for the public pages (public-site.css). */
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
/** Inline custom properties (e.g. animation delay `--d` in ms, or `--i`). */
export const vars = (v: Record<string, string | number>) => v as CSSProperties;

export function Eyebrow({ children, center = false, className = "" }: { children: ReactNode; center?: boolean; className?: string }) {
  return <p className={cx("gp-eyebrow", center && "is-center", className)}>{children}</p>;
}

export function SectionHead({ id, eyebrow, title, lead, center = false, className = "", children }: { id: string; eyebrow: string; title: ReactNode; lead?: ReactNode; center?: boolean; className?: string; children?: ReactNode }) {
  return <header className={cx("gp-head", center && "is-center", className)}>
    <Eyebrow center={center}>{eyebrow}</Eyebrow>
    <h2 id={id} className="gp-h2">{title}</h2>
    {lead && <p className="gp-lead">{lead}</p>}
    {children}
  </header>;
}

export type Tone = "ok" | "wait" | "info" | "crit" | "plain" | "violet";
export function Chip({ tone = "plain", children, dot = false, className = "" }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return <span className={cx("gp-chip", `is-${tone}`, className)}>{dot && <i aria-hidden="true" />}{children}</span>;
}

const STATE_ICON: Record<"ok" | "wait" | "info" | "crit" | "plain", LucideIcon> = { ok: CircleCheck, wait: Clock3, info: Clock3, crit: CircleAlert, plain: Clock3 };
/** Status as text + icon (never colour alone). */
export function State({ tone, children, icon }: { tone: "ok" | "wait" | "info" | "crit" | "plain"; children: ReactNode; icon?: LucideIcon }) {
  const Icon = icon ?? STATE_ICON[tone];
  return <span className={`gp-state is-${tone}`}><Icon size={15} aria-hidden="true" />{children}</span>;
}

export function Thumb({ src, w, h, className = "", alt = "" }: { src: string; w: number; h: number; className?: string; alt?: string }) {
  return <img className={cx("gp-thumb", className)} src={src} alt={alt} width={w} height={h} loading="lazy" decoding="async" />;
}

/** Marks a composition as product illustration (owner rule: demo UI must never read as live inventory, counts or testimonials). */
export function DemoTag({ children = "Illustrative example", className = "" }: { children?: ReactNode; className?: string }) {
  return <span className={cx("gp-demo", className)}>{children}</span>;
}

export function Sr({ children, as: As = "span" }: { children: ReactNode; as?: "span" | "p" | "div" | "h3" }) {
  return <As className="gp-sr">{children}</As>;
}

export function Feature({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <li className="gp-feat"><span className="gp-feat-ic"><Icon size={20} aria-hidden="true" /></span><span><b>{title}</b><small>{text}</small></span></li>;
}

/** Structured data (blueprint §1.6): only for entities that are semantically correct for the page. `<` is escaped (Next.js JSON-LD guide). */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const gbp = (minor: number) => `£${(minor / 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
export const pounds = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
export const ph = (name: string) => `/assets/gd/${name}`;
