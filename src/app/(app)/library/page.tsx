"use client";

import { useRouter } from "next/navigation";
import {
  Files,
  FileText,
  Package,
  Image,
  FileCheck,
  Upload,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

const HUB_CARDS = [
  {
    href: "/library/files",
    icon: Files,
    iconColor: "text-brand-600",
    iconBg: "bg-brand-50",
    title: "Files",
    count: 24,
    description: "Images, documents and videos used across events",
  },
  {
    href: "/library/templates",
    icon: FileText,
    iconColor: "text-violet-600",
    iconBg: "bg-violet-50",
    title: "Templates",
    count: 4,
    description: "Run-sheets, briefing docs and email templates",
  },
  {
    href: "/library/event-packs",
    icon: Package,
    iconColor: "text-warning-600",
    iconBg: "bg-warning-50",
    title: "Event Packs",
    count: 3,
    description: "Bundled starter packs for common event types",
  },
  {
    href: "/library/brand-assets",
    icon: Image,
    iconColor: "text-success-600",
    iconBg: "bg-success-50",
    title: "Brand Assets",
    count: 8,
    description: "Logos, colour palettes and fonts",
  },
  {
    href: "/library/supplier-docs",
    icon: FileCheck,
    iconColor: "text-danger-600",
    iconBg: "bg-danger-50",
    title: "Supplier Documents",
    count: 12,
    description: "Contracts, certificates and compliance docs",
  },
];

const RECENT_UPLOADS = [
  { name: "gala_floorplan_v3.pdf",    kind: "Document", uploadedBy: "Emma Clarke",  date: "9 Jun 2026"  },
  { name: "hartley_wedding_hero.jpg", kind: "Image",    uploadedBy: "James Smith",  date: "7 Jun 2026"  },
  { name: "techsummit_av_brief.docx", kind: "Document", uploadedBy: "Emma Clarke",  date: "5 Jun 2026"  },
  { name: "carter_catering_menu.pdf", kind: "Document", uploadedBy: "Sarah Patel",  date: "3 Jun 2026"  },
  { name: "brand_logo_primary.svg",   kind: "Image",    uploadedBy: "James Smith",  date: "1 Jun 2026"  },
];

export default function LibraryPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col min-h-full bg-surface-50">
      <PageHeader
        title="Library"
        description="Files, templates, brand assets and supplier documents"
      />

      <div className="flex-1 p-6 space-y-8">
        {/* Quick access cards */}
        <div>
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-4">Quick Access</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {HUB_CARDS.map((card) => (
              <button
                key={card.href}
                onClick={() => router.push(card.href)}
                className="group bg-white rounded-xl border border-surface-200 shadow-card p-5 text-left hover:border-brand-200 hover:shadow-md transition-all"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.iconBg} mb-4`}>
                  <card.icon className={`w-5 h-5 ${card.iconColor}`} strokeWidth={1.8} />
                </div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-surface-900">{card.title}</p>
                  <span className="text-xs font-semibold text-surface-400 tabular-nums shrink-0">{card.count}</span>
                </div>
                <p className="text-xs text-surface-500 leading-relaxed">{card.description}</p>
                <div className="mt-4 flex items-center gap-1 text-xs text-brand-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Open <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent uploads */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Recent Uploads</h2>
            <button
              onClick={() => router.push("/library/files")}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              View all files
            </button>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm divide-y divide-surface-100">
                <thead className="bg-surface-50 border-b border-surface-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Filename</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Kind</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Uploaded By</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {RECENT_UPLOADS.map((file, i) => (
                    <tr key={i} className="hover:bg-surface-50 transition-colors cursor-pointer" onClick={() => router.push(`/library/files/${i + 1}`)}>
                      <td className="px-6 py-3 font-medium text-surface-900">{file.name}</td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200">
                          {file.kind}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-surface-600">{file.uploadedBy}</td>
                      <td className="px-6 py-3 text-surface-500">{file.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
