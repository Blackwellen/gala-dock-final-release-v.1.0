"use client";

import { Download, Package, FileText, Image, CheckSquare } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

const PACKS = [
  {
    id: "1",
    name: "Wedding Essentials Pack",
    description: "Everything you need to run a full-day wedding event. Includes ceremony run sheet, catering brief template, photography checklist, and supplier confirmation emails.",
    fileCount: 8,
    icon: Package,
    iconColor: "text-brand-600",
    iconBg: "bg-brand-50",
    tags: ["Run Sheet", "Brief", "Checklist", "Email Templates"],
  },
  {
    id: "2",
    name: "Corporate Event Pack",
    description: "Comprehensive pack for corporate conferences and seminars. Includes AV technical rider, delegate management sheet, speaker brief, and post-event survey template.",
    fileCount: 6,
    icon: FileText,
    iconColor: "text-violet-600",
    iconBg: "bg-violet-50",
    tags: ["Technical Rider", "Speaker Brief", "Survey", "Run Sheet"],
  },
  {
    id: "3",
    name: "Birthday Party Pack",
    description: "Starter pack for private birthday events. Includes party timeline, venue layout guide, catering preferences form, and entertainment briefing template.",
    fileCount: 4,
    icon: CheckSquare,
    iconColor: "text-success-600",
    iconBg: "bg-success-50",
    tags: ["Timeline", "Venue Layout", "Catering", "Entertainment"],
  },
];

export default function EventPacksPage() {
  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Event Packs"
        description="Bundled starter packs of templates and documents for common event types"
      />

      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {PACKS.map((pack) => (
            <div
              key={pack.id}
              className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="p-6 border-b border-surface-100">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${pack.iconBg} mb-4`}>
                  <pack.icon className={`w-6 h-6 ${pack.iconColor}`} strokeWidth={1.8} />
                </div>
                <h3 className="text-base font-semibold text-surface-900 mb-2">{pack.name}</h3>
                <p className="text-sm text-surface-500 leading-relaxed">{pack.description}</p>
              </div>

              {/* Tags */}
              <div className="px-6 py-4 border-b border-surface-100">
                <div className="flex flex-wrap gap-1.5">
                  {pack.tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 flex items-center justify-between">
                <span className="text-xs text-surface-400">{pack.fileCount} files included</span>
                <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors">
                  <Download className="w-3.5 h-3.5" />
                  Download Pack
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
