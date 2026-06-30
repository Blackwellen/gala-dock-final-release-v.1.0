"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Globe, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveEventPublicPage, type PublishInput } from "./actions";

export function PublishForm({
  eventId,
  initial,
}: {
  eventId: string;
  initial: { published: boolean; headline: string; summary: string; startsAt: string; city: string; slug: string | null; hasTickets: boolean };
}) {
  const [form, setForm] = useState<PublishInput>({
    published: initial.published,
    headline: initial.headline,
    summary: initial.summary,
    startsAt: initial.startsAt,
    city: initial.city,
    ticketsEnabled: initial.hasTickets,
  });
  const [slug, setSlug] = useState(initial.slug);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function set<K extends keyof PublishInput>(k: K, v: PublishInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  function save() {
    start(async () => {
      const res = await saveEventPublicPage(eventId, form);
      if (res.ok) {
        setSlug(res.slug);
        setSaved(true);
      }
    });
  }

  const input = "w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="max-w-xl space-y-5">
      {/* Public / private toggle */}
      <div className="flex items-center justify-between rounded-xl border border-surface-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-brand-600" />
          <div>
            <p className="text-sm font-medium text-surface-900">{form.published ? "Public" : "Private"}</p>
            <p className="text-xs text-surface-400">{form.published ? "Listed on Discover and shareable." : "Hidden from the public site."}</p>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={form.published}
          onClick={() => set("published", !form.published)}
          className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors", form.published ? "bg-brand-600" : "bg-surface-300")}
        >
          <span className={cn("inline-block h-4 w-4 rounded-full bg-white transition-transform", form.published ? "translate-x-6" : "translate-x-1")} />
        </button>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-surface-700">Public headline</span>
        <input className={cn(input, "mt-1")} value={form.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Event title shown publicly" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-surface-700">Summary</span>
        <textarea className={cn(input, "mt-1 min-h-[88px]")} value={form.summary} onChange={(e) => set("summary", e.target.value)} placeholder="Short description for the public page" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm font-medium text-surface-700">Public date</span>
          <input type="date" className={cn(input, "mt-1")} value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-surface-700">City</span>
          <input className={cn(input, "mt-1")} value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="London" />
        </label>
      </div>

      <label className="flex items-center gap-2.5 rounded-xl border border-surface-200 bg-white p-4">
        <input type="checkbox" checked={form.ticketsEnabled} onChange={(e) => set("ticketsEnabled", e.target.checked)} className="w-4 h-4" />
        <span className="text-sm text-surface-700">Publicise ticket sales (put draft ticket types on sale when published)</span>
      </label>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={pending} className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {pending ? "Saving…" : form.published ? "Save & publish" : "Save"}
        </button>
        {saved && <span className="text-sm text-success-600 font-medium">Saved!</span>}
        {form.published && slug && (
          <Link href={`/e/${slug}`} target="_blank" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
            View public page <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
