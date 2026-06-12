"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Edit2, Save, Copy } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

const TEMPLATE = {
  id: "1",
  name: "Standard Wedding Run Sheet",
  type: "run-sheet",
  typeLabel: "Run Sheet",
  typeColor: "bg-brand-50 text-brand-700 border-brand-100",
  description: "A comprehensive run sheet for full-day wedding events, covering arrival through to final send-off.",
  content: `08:00 — Venue access & setup begins
09:00 — Florist arrives
10:00 — Catering team arrives, kitchen walkthrough
11:00 — AV technician sound check
12:30 — Bridal party hair & makeup complete
13:00 — Wedding ceremony rehearsal (if applicable)
14:00 — Photography team arrive, pre-ceremony shots
14:30 — Ceremony begins
15:30 — Ceremony concludes, cocktail hour begins
16:30 — Guests transition to reception room
17:00 — Reception doors open
17:15 — Bridal party entrance
17:30 — Wedding breakfast service begins
19:00 — Speeches
20:00 — First dance
20:15 — Evening buffet opens
22:00 — Last orders at bar
23:30 — Venue close, guests depart
00:00 — Supplier breakdown begins`,
  eventsUsing: [
    { name: "Hartley Wedding",     href: "/events/1" },
    { name: "Carter Wedding",      href: "/events/2" },
  ],
};

export default function TemplateDetailPage() {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(TEMPLATE.content);

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title={TEMPLATE.name}
        description={TEMPLATE.description}
        actions={
          <>
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${TEMPLATE.typeColor}`}>
              {TEMPLATE.typeLabel}
            </span>
            {isEditing ? (
              <button
                onClick={() => setIsEditing(false)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            )}
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-200 bg-white text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors">
              <Copy className="w-4 h-4" />
              Duplicate
            </button>
          </>
        }
      />

      <div className="flex-1 p-6 max-w-4xl space-y-6">
        {/* Content */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between border-b border-surface-200">
            <h3 className="text-sm font-semibold text-surface-900">Content</h3>
            {isEditing && (
              <span className="text-xs text-brand-600 font-medium">Editing…</span>
            )}
          </div>
          <div className="p-6">
            {isEditing ? (
              <textarea
                rows={20}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none font-mono leading-relaxed"
              />
            ) : (
              <pre className="text-sm text-surface-700 whitespace-pre-wrap leading-relaxed font-mono">
                {content}
              </pre>
            )}
          </div>
        </div>

        {/* Events using this template */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-card p-6">
          <h3 className="text-sm font-semibold text-surface-900 mb-4">Events Using This Template</h3>
          <div className="space-y-2">
            {TEMPLATE.eventsUsing.map((event, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface-50 border border-surface-100 hover:bg-surface-100 transition-colors">
                <span className="text-sm font-medium text-surface-900">{event.name}</span>
                <button
                  onClick={() => router.push(event.href)}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  View Event
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
