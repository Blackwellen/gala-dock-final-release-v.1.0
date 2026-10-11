"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, MapPin, Crosshair, CalendarDays, ArrowRight, Calendar, Building2, Sparkles, Send, PartyPopper, Utensils, MessageSquareQuote } from "lucide-react";
import { useKitToast } from "@/components/kit/client";

export function DiscoverSearch({ tab }: { tab: "events" | "venues" | "services" }) {
  const router = useRouter(); const params = useSearchParams(); const toast = useKitToast();
  const [q, setQ] = useState(params.get("q") ?? ""); const [area, setArea] = useState(params.get("city") ?? "London, UK"); const [date, setDate] = useState(params.get("on") ?? "");
  const go = (patch: Record<string, string | null> = {}) => { const p = new URLSearchParams(params.toString()); p.set("tab", tab); q ? p.set("q", q) : p.delete("q"); const c = area.split(",")[0]!.trim(); c && c.toLowerCase() !== "anywhere" ? p.set("city", c.toLowerCase()) : p.delete("city"); date ? p.set("on", date) : p.delete("on"); for (const [k, v] of Object.entries(patch)) v == null ? p.delete(k) : p.set(k, v); p.set("results", "1"); router.push(`/discover?${p}`); };
  const locate = () => {
    if (!("geolocation" in navigator)) { toast("Location isn't available in this browser.", "error"); return; }
    navigator.geolocation.getCurrentPosition(pos => { const { latitude: la, longitude: lo } = pos.coords; const near = Object.entries({ london: [51.5, -0.12], manchester: [53.48, -2.24], birmingham: [52.49, -1.89], surrey: [51.31, -0.56] }).sort((a, b) => Math.hypot(a[1][0] - la, a[1][1] - lo) - Math.hypot(b[1][0] - la, b[1][1] - lo))[0]![0]; setArea(`${near[0]!.toUpperCase()}${near.slice(1)}, UK`); toast(`Showing results near ${near[0]!.toUpperCase()}${near.slice(1)}`); }, () => toast("Location permission was denied. You can type an area instead.", "error"), { timeout: 8000 });
  };
  return <form className="ds-search" role="search" onSubmit={e => { e.preventDefault(); go(); }}>
    <label className="ds-q"><Search size={19} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="What are you looking for?" aria-label="What are you looking for?" /></label>
    <label className="ds-area"><MapPin size={18} /><span><small>Current area</small><input value={area} onChange={e => setArea(e.target.value)} aria-label="Area" /></span><button type="button" className="ds-locate" onClick={locate} aria-label="Use my location"><Crosshair size={18} /></button></label>
    <label className="ds-date"><CalendarDays size={18} /><input type={date ? "date" : "text"} onFocus={e => (e.currentTarget.type = "date")} value={date} onChange={e => setDate(e.target.value)} placeholder="Any date" aria-label="Date" /></label>
    <button className="k-btn primary ds-go">Search <ArrowRight size={17} /></button>
  </form>;
}

export function AgentBrief() {
  const router = useRouter(); const [t, setT] = useState("");
  const go = (text: string) => router.push(`/plan?step=1&brief=${encodeURIComponent(text)}`);
  return <div className="ds-agent">
    <p className="ds-agent-q">Tell me what you&apos;re looking for...</p>
    <form className="ds-agent-box" onSubmit={e => { e.preventDefault(); if (t.trim()) go(t); }}><textarea value={t} onChange={e => setT(e.target.value)} placeholder="e.g. a rooftop venue for 100 people in July with catering and a DJ" aria-label="Describe what you need" maxLength={600} /><button aria-label="Send to Gala Agent"><Send size={15} /></button></form>
    <div className="ds-agent-acts">
      <button onClick={() => router.push("/discover?tab=events&date=weekend&results=1")}><Calendar size={18} />Find events near me this weekend</button>
      <button onClick={() => router.push("/discover?tab=venues&results=1&q=party")}><Building2 size={18} />Suggest a venue for my birthday</button>
      <button onClick={() => router.push("/discover?tab=services&results=1&q=catering")}><Utensils size={18} />Get a quote for catering &amp; drinks</button>
      <button onClick={() => router.push("/plan?step=1")}><Sparkles size={18} />Help me plan an event</button>
    </div>
  </div>;
}
export const _icons = { PartyPopper, MessageSquareQuote };
