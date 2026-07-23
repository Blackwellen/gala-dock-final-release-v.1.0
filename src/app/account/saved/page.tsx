import Link from "next/link";
import { Bookmark, Search } from "lucide-react";

export default function SavedEventsPage() {
  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-6 shadow-card sm:p-8">
      <Bookmark className="h-7 w-7 text-brand-700" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-surface-900">Saved events & organisers</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-surface-600">Your saved events and followed organisers will appear here. This account-level shell keeps discovery separate from ticket orders and workspace access.</p>
      <div className="mt-6 rounded-xl border border-dashed border-surface-300 bg-surface-50 p-6 text-center">
        <Search className="mx-auto h-6 w-6 text-surface-400" />
        <h2 className="mt-3 font-medium text-surface-800">Nothing saved yet</h2>
        <p className="mt-1 text-sm text-surface-500">Browse public events and save the ones you want to revisit.</p>
        <Link href="/discover" className="mt-4 inline-flex rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">Discover events</Link>
      </div>
    </section>
  );
}
