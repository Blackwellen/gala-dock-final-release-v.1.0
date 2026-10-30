import "@/styles/public-availability.css";
import type { ReactNode } from "react";
import { TrainFront, Bus, ParkingSquare, Accessibility, MapPin, Car, Bike, Navigation } from "lucide-react";
import { hasGettingThere, type GettingThere } from "@/lib/public/getting-there";

const TZ = "Europe/London";
const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const KIND: Record<string, string> = { general: "Public car park", accessible: "Accessible parking", mixed: "Car park" };

/**
 * "Getting there" on the public event page and the ticket holder page: only what the organiser marked public in
 * Ops › Logistics (public_event_getting_there). Renders nothing when there is nothing public.
 */
export function EventGettingThere({ data, maps, id = "getting-there", heading = "h2" }: { data: GettingThere | null; maps: string; id?: string; heading?: "h2" | "h3" }) {
  if (!hasGettingThere(data)) return null;
  const n = data.notes; const H = heading;
  const accessibleAreas = data.parking.filter(p => p.accessible_spaces > 0 || p.kind === "accessible");
  const items: [string, typeof Car, string, ReactNode][] = [];
  if (n.transit) items.push(["transit", TrainFront, "Public transport", <p key="t">{n.transit}</p>]);
  if (n.shuttle || data.shuttles.length) items.push(["shuttle", Bus, "Shuttles", <>{n.shuttle && <p>{n.shuttle}</p>}
    {data.shuttles.length > 0 && <ul className="gt-list">{data.shuttles.map((s, i) => <li key={`${s.departs_at}${i}`}><b>{day(s.departs_at)} · {time(s.departs_at)}{s.arrives_at ? `–${time(s.arrives_at)}` : ""}</b>
      <small>{[s.from, s.to].filter(Boolean).join(" → ")}{s.pickup ? ` · pickup ${s.pickup}` : ""}</small></li>)}</ul>}</>]);
  if (n.parking || data.parking.length) items.push(["parking", ParkingSquare, "Parking", <>{n.parking && <p>{n.parking}</p>}
    {data.parking.length > 0 && <ul className="gt-list">{data.parking.map(p => <li key={p.name}><b>{p.name}</b>
      <small>{[KIND[p.kind] ?? "Car park", p.opens_at ? `opens ${day(p.opens_at)} ${time(p.opens_at)}` : "", p.closes_at ? `closes ${time(p.closes_at)}` : ""].filter(Boolean).join(" · ")}</small></li>)}</ul>}</>]);
  if (n.accessible || accessibleAreas.length) items.push(["accessible", Accessibility, "Accessible parking", <>{n.accessible && <p>{n.accessible}</p>}
    {accessibleAreas.length > 0 && <ul className="gt-list">{accessibleAreas.map(p => <li key={p.name}><b>{p.name}</b><small>{p.accessible_spaces > 0 ? `${p.accessible_spaces} accessible space${p.accessible_spaces === 1 ? "" : "s"}` : "Accessible parking"}</small></li>)}</ul>}</>]);
  if (n.dropoff) items.push(["dropoff", MapPin, "Drop-off point", <p key="d">{n.dropoff}</p>]);
  if (n.rideshare) items.push(["rideshare", Car, "Taxis & rideshare", <p key="r">{n.rideshare}</p>]);
  if (n.cycle) items.push(["cycle", Bike, "Cycle parking", <p key="c">{n.cycle}</p>]);
  return <section id={id} className="ce-card gt" aria-labelledby={`${id}-h`}>
    <div className="k-between"><H id={`${id}-h`}>Getting there</H><a className="k-btn outline sm" href={maps} target="_blank" rel="noopener noreferrer"><Navigation size={14} aria-hidden />Get directions</a></div>
    <div className="gt-g">{items.map(([k, I, title, body]) => <div key={k} className="gt-item"><span><I size={18} aria-hidden /></span><div className="k-grow"><h3>{title}</h3>{body}</div></div>)}</div>
    <p className="gt-foot">Travel details from the organiser. Check with your transport provider on the day.</p>
  </section>;
}
