import type { Metadata } from "next";
import { PartyPopper } from "lucide-react";
import { startBuild } from "./actions";
import { BUILD_EVENT_TYPES } from "./event-types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Plan your event",
  description: "Pick your suppliers and pay once — Gala Dock splits the money automatically.",
};

const inputCls =
  "w-full px-3.5 py-2.5 text-sm border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all";

export default function BuildStartPage() {
  return (
    <div className="bg-surface-50 min-h-[calc(100vh-64px)]">
      <header className="bg-[#0e0c27] text-white">
        <div className="mx-auto max-w-2xl px-6 py-12 text-center">
          <PartyPopper className="mx-auto w-10 h-10 text-brand-400" />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">Plan your event in minutes</h1>
          <p className="mt-2 text-white/70">
            Pick a venue, entertainment, catering and more — pay once, we split it automatically.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-6 py-10">
        <form action={startBuild} className="bg-white rounded-2xl border border-surface-200 shadow-card p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1.5">What are you celebrating?</label>
            <select name="eventType" required defaultValue="childrens_party" className={inputCls}>
              {BUILD_EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1.5">Date</label>
              <input name="eventDate" type="date" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1.5">Guests</label>
              <input name="guestCount" type="number" min="1" placeholder="e.g. 20" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1.5">Budget (£)</label>
              <input name="budget" type="number" min="0" step="10" placeholder="e.g. 500" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1.5">Postcode</label>
              <input name="postcode" placeholder="e.g. SW1A 1AA" className={inputCls} />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors shadow-brand"
          >
            Start building
          </button>
          <p className="text-xs text-center text-surface-400">No account needed to start — only to pay.</p>
        </form>
      </div>
    </div>
  );
}
