import Link from "next/link";
import { MapPin, Clock, Star } from "lucide-react";
import { AdBeacon } from "./beacon";
import { clickHref } from "@/lib/ads/core";
import type { Sponsored } from "@/lib/ads/serve";
import { dateBadge, time12, money } from "@/lib/format";
import "@/styles/sponsored.css";

/** Always-visible "Sponsored" label (backend §13.17: sponsored placements are explicitly labelled). */
export function SponsoredLabel() { return <span className="gd-sponsored" aria-label="Sponsored">Sponsored</span>; }

/** One sponsored event or listing card. Links go through /api/ads/click (one counted click per served token). */
export function SponsoredCard({ s }: { s: Sponsored }) {
  const e = s.event, l = s.listing;
  const img = e?.cover_image ?? l?.image ?? "/assets/gd/covers/summer-sessions.webp";
  return <AdBeacon token={s.token} className="gd-sp-card" as="article">
    <Link href={clickHref(s.token)} prefetch={false} rel="sponsored nofollow" className="gd-sp-link">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt="" loading="lazy" />
      <span className="gd-sp-body">
        <SponsoredLabel />
        <b>{e?.name ?? l?.name}</b>
        {e ? <><small><Clock size={12} aria-hidden="true" /> {e.starts_at ? `${dateBadge(e.starts_at).day} ${dateBadge(e.starts_at).mon} · ${time12(e.starts_at)}` : "Date to be confirmed"}</small>
          {e.location && <small><MapPin size={12} aria-hidden="true" /> {e.location}</small>}</>
          : l ? <><small>{l.rating ? <><Star size={12} aria-hidden="true" /> {Number(l.rating).toFixed(1)} ({l.review_count ?? 0}) · </> : null}{l.location}</small>
            {l.price_from != null && <small>From {money(l.price_from)}{l.price_unit ? ` ${l.price_unit}` : ""}</small>}</> : null}
      </span>
    </Link>
  </AdBeacon>;
}

/** A labelled row of sponsored cards, rendered only when the placement served something. Kept apart from organic results. */
export function SponsoredRow({ items, title = "Sponsored" }: { items: Sponsored[]; title?: string }) {
  if (!items.length) return null;
  return <section className="gd-sp-row" aria-label={title}><h2 className="gd-sp-row-h">{title}</h2><div className="gd-sp-grid">{items.map(s => <SponsoredCard key={s.token} s={s} />)}</div></section>;
}
