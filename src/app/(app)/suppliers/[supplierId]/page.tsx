"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  Edit2, Star, Send, Users2, Archive, MoreHorizontal,
  MapPin, Mail, Phone, Globe, Plus, Upload,
  CheckCircle2, FileText, AlertTriangle, Download,
  Sparkles, Filter, Pin, Clock, TrendingUp, Award,
  CalendarDays, Eye,
} from "lucide-react";
import { TabNav } from "@/components/ui/TabNav";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MetricCard, KPIGrid } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

const SUPPLIER = {
  id: "s1",
  name: "Noble Kitchen Co.",
  category: "Catering",
  location: "Bristol, UK",
  status: "preferred" as const,
  website: "https://noblekitchen.co.uk",
  email: "hello@noblekitchen.co.uk",
  phone: "+44 117 900 1234",
  address: {
    street: "12 Harbour Way",
    city: "Bristol",
    county: "Avon",
    postcode: "BS1 5TR",
  },
  contact: {
    name: "Sarah Noble",
    role: "Managing Director",
    email: "sarah@noblekitchen.co.uk",
    phone: "+44 7700 900123",
  },
  services: "Full-service catering for weddings and corporate events. Canape receptions, 3-course sit-down dinners, evening buffets. Up to 400 covers.",
  notes: "Preferred for weddings. Ask about seasonal menu changes. Early booking required.",
};

const SERVICES_DATA = [
  { id: "sv1", name: "Wedding Breakfast",      desc: "3-course sit-down dinner, up to 200 covers",    price: "£65–85pp",  avail: "Fri–Sun, limited Sat" },
  { id: "sv2", name: "Evening Buffet",          desc: "Hot & cold buffet selection, up to 400 covers",  price: "£28–40pp",  avail: "Any day" },
  { id: "sv3", name: "Canape Reception",         desc: "12-piece canape selection with waiting staff",   price: "£22–30pp",  avail: "Any day" },
  { id: "sv4", name: "Corporate Lunch / Dinner", desc: "Boardroom to banquet, full AV-compatible setup", price: "£45–70pp",  avail: "Mon–Fri preferred" },
];

const QUOTES_DATA = [
  { id: "q1", event: "The Carter Wedding",    date: "1 Mar 2026", amount: "£7,800", status: "approved" as const },
  { id: "q2", event: "Thornbury Gala Dinner", date: "12 Apr 2026", amount: "£5,200", status: "pending" as const },
  { id: "q3", event: "Meridian Tech Summit",   date: "3 May 2026", amount: "£9,400", status: "sent"    as const },
  { id: "q4", event: "Hawthorn Birthday Ball", date: "20 May 2026", amount: "£3,600", status: "rejected" as const },
  { id: "q5", event: "Blake Corporate Away",  date: "5 Jun 2026",  amount: "£2,100", status: "draft"    as const },
];

const EVENTS_DATA = [
  { id: "e1", name: "The Carter Wedding",     date: "14 Jun 2026", role: "Catering",  status: "confirmed" as const },
  { id: "e2", name: "Thornbury Gala Dinner",  date: "5 Jul 2026",  role: "Catering",  status: "confirmed" as const },
  { id: "e3", name: "Meridian Tech Summit",   date: "19 Jun 2026", role: "Catering",  status: "in-delivery" as const },
  { id: "e4", name: "Hawthorn Birthday Ball", date: "28 Jun 2026", role: "Catering",  status: "quoting"   as const },
  { id: "e5", name: "Winters 40th",           date: "20 Jul 2026", role: "Catering",  status: "pending"   as const },
];

const DOCUMENTS_DATA = [
  { id: "d1", name: "Public_Liability_Insurance_2026.pdf", type: "Insurance",  expiry: "31 Dec 2026", status: "verified" as const },
  { id: "d2", name: "Food_Hygiene_Certificate_A.pdf",      type: "Certificate", expiry: "30 Jun 2027", status: "verified" as const },
  { id: "d3", name: "Supplier_Contract_2026.pdf",          type: "Contract",   expiry: "—",           status: "verified" as const },
  { id: "d4", name: "Employers_Liability_Insurance.pdf",   type: "Insurance",  expiry: "31 Dec 2025", status: "missing"  as const },
  { id: "d5", name: "GDPR_Data_Processing_Agreement.pdf",  type: "Contract",   expiry: "—",           status: "pending"  as const },
];

const ACTIVITY_DATA = [
  { id: "a1", type: "quote",    text: "Quote accepted for The Carter Wedding (£7,800)",  user: "JT", time: "2 days ago" },
  { id: "a2", type: "doc",      text: "Public_Liability_Insurance_2026.pdf uploaded & verified", user: "KL", time: "5 days ago" },
  { id: "a3", type: "invite",   text: "Portal invite sent to sarah@noblekitchen.co.uk",  user: "JT", time: "1 week ago" },
  { id: "a4", type: "note",     text: "Confirmed seasonal spring menu available until Sep. Pricing held.", user: "JT", time: "2 weeks ago" },
  { id: "a5", type: "quote",    text: "RFQ sent for Thornbury Gala Dinner",              user: "MR", time: "3 weeks ago" },
  { id: "a6", type: "status",   text: "Supplier marked as Preferred",                   user: "JT", time: "1 month ago" },
];

const TABS = [
  { id: "overview",  label: "Overview" },
  { id: "services",  label: "Services",  count: SERVICES_DATA.length },
  { id: "quotes",    label: "Quotes",    count: QUOTES_DATA.length },
  { id: "events",    label: "Events",    count: EVENTS_DATA.length },
  { id: "documents", label: "Documents", count: 1, badge: "danger" as const },
  { id: "activity",  label: "Activity",  count: ACTIVITY_DATA.length },
];

// ── Supplier Hero ──────────────────────────────────────────────────────────

function SupplierHero({ supplierId }: { supplierId: string }) {
  return (
    <div className="bg-white border-b border-surface-200">
      <div className="px-6 py-5">
        <div className="flex items-start gap-4 justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
              <span className="text-brand-700 text-lg font-bold">NK</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-surface-900 tracking-tight">{SUPPLIER.name}</h1>
                <StatusBadge status={SUPPLIER.status} />
                <span className="px-2 py-0.5 text-xs font-medium bg-surface-100 text-surface-600 border border-surface-200 rounded-full">
                  {SUPPLIER.category}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-sm text-surface-500">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                  {SUPPLIER.location}
                </span>
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                  {SUPPLIER.email}
                </span>
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                  {SUPPLIER.phone}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Archive className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span className="hidden sm:inline">Archive</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Users2 className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span className="hidden sm:inline">Invite to Portal</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
              <Send className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span className="hidden sm:inline">Send RFQ</span>
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors">
              <Star className="w-3.5 h-3.5" strokeWidth={1.8} />
              <span className="hidden sm:inline">Mark Preferred</span>
            </button>
            <Link
              href={`/app/suppliers/${supplierId}/edit`}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand"
            >
              <Edit2 className="w-3.5 h-3.5" strokeWidth={2} />
              Edit
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Overview ──────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <KPIGrid className="grid-cols-2 sm:grid-cols-4">
        <MetricCard label="Events Worked"        value="8"    icon={CalendarDays} iconColor="text-brand-600"   iconBg="bg-brand-50" />
        <MetricCard label="Avg Response Time"    value="2.1d" icon={Clock}        iconColor="text-warning-600" iconBg="bg-warning-50" />
        <MetricCard label="Quote Acceptance"     value="85%"  icon={TrendingUp}   iconColor="text-success-600" iconBg="bg-success-50" />
        <MetricCard label="Compliance Score"     value="92%"  icon={Award}        iconColor="text-brand-600"   iconBg="bg-brand-50" />
      </KPIGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Contact card */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-4">Primary Contact</h3>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                <span className="text-brand-700 text-sm font-bold">SN</span>
              </div>
              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-sm font-semibold text-surface-900">{SUPPLIER.contact.name}</p>
                  <p className="text-xs text-surface-400">{SUPPLIER.contact.role}</p>
                </div>
                <div className="space-y-1.5">
                  <a href={`mailto:${SUPPLIER.contact.email}`} className="flex items-center gap-2 text-xs text-brand-600 hover:underline">
                    <Mail className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                    {SUPPLIER.contact.email}
                  </a>
                  <a href={`tel:${SUPPLIER.contact.phone}`} className="flex items-center gap-2 text-xs text-surface-500 hover:text-surface-800">
                    <Phone className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                    {SUPPLIER.contact.phone}
                  </a>
                  <a href={SUPPLIER.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-surface-500 hover:text-surface-800">
                    <Globe className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
                    {SUPPLIER.website.replace("https://", "")}
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Address card */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Address</h3>
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-surface-400 mt-0.5 shrink-0" strokeWidth={1.8} />
              <div className="text-sm text-surface-700 space-y-0.5">
                <p>{SUPPLIER.address.street}</p>
                <p>{SUPPLIER.address.city}, {SUPPLIER.address.county}</p>
                <p>{SUPPLIER.address.postcode}</p>
              </div>
            </div>
          </div>

          {/* Recent activity mini-timeline */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-surface-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900">Recent Activity</h3>
              <button className="text-xs text-brand-600 hover:text-brand-700 font-medium">View all</button>
            </div>
            <div className="divide-y divide-surface-100">
              {ACTIVITY_DATA.slice(0, 3).map((item) => (
                <div key={item.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-brand-400 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-surface-700">{item.text}</p>
                    <p className="text-xs text-surface-400 mt-0.5">{item.user} · {item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {/* Services summary */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card p-5">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Services</h3>
            <p className="text-sm text-surface-700 leading-relaxed">{SUPPLIER.services}</p>
          </div>

          {/* Doc status */}
          <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-100">
              <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Document Status</h3>
            </div>
            <div className="divide-y divide-surface-100">
              {DOCUMENTS_DATA.slice(0, 3).map((d) => (
                <div key={d.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <p className="text-xs text-surface-600 truncate">{d.type}</p>
                  <StatusBadge status={d.status} />
                </div>
              ))}
            </div>
          </div>

          {/* AI summary card */}
          <div className="bg-gradient-to-br from-brand-900 to-brand-800 rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4" strokeWidth={1.8} />
              <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">AI Summary</span>
            </div>
            <p className="text-xs text-white/70 leading-relaxed mb-3">
              Noble Kitchen Co. is a Preferred supplier with 8 events delivered. 85% quote acceptance. One insurance document outstanding.
            </p>
            <button className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-medium rounded-lg transition-colors">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.8} />
              Generate Supplier Summary
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Services ──────────────────────────────────────────────────────────

function ServicesTab() {
  return (
    <div className="p-6 space-y-5 max-w-[1000px]">
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add Service
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SERVICES_DATA.map((svc) => (
          <div key={svc.id} className="bg-white rounded-xl border border-surface-200 shadow-card p-5 group">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-sm font-semibold text-surface-900">{svc.name}</h3>
              <button className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2 py-1 text-xs border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-all">
                <Edit2 className="w-3 h-3" strokeWidth={2} />
                Edit
              </button>
            </div>
            <p className="text-sm text-surface-500 leading-relaxed mb-3">{svc.desc}</p>
            <div className="flex flex-wrap gap-3">
              <span className="flex items-center gap-1.5 text-xs font-medium text-success-700 bg-success-50 border border-success-200 px-2.5 py-1 rounded-full">
                {svc.price}
              </span>
              <span className="text-xs text-surface-400">{svc.avail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Quotes ────────────────────────────────────────────────────────────

function QuotesTab() {
  return (
    <div className="p-6 space-y-5 max-w-[1000px]">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
          <Send className="w-4 h-4" strokeWidth={1.8} />
          Request Quote
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <FileText className="w-4 h-4" strokeWidth={1.8} />
          Compare Quotes
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <Send className="w-4 h-4" strokeWidth={1.8} />
          Chase Quote
        </button>
      </div>
      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 bg-surface-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Date Sent</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Amount</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {QUOTES_DATA.map((q) => (
              <tr key={q.id} className="hover:bg-surface-50 transition-colors group">
                <td className="px-4 py-3.5 font-medium text-surface-900">{q.event}</td>
                <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{q.date}</td>
                <td className="px-4 py-3.5 font-semibold text-surface-900">{q.amount}</td>
                <td className="px-4 py-3.5"><StatusBadge status={q.status} /></td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors">
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                    <button className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors">
                      <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Events ────────────────────────────────────────────────────────────

function EventsTab() {
  return (
    <div className="p-6 space-y-5 max-w-[1000px]">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Link to Event
        </button>
      </div>
      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 bg-surface-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Event Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Role</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {EVENTS_DATA.map((ev) => (
              <tr key={ev.id} className="hover:bg-surface-50 transition-colors group">
                <td className="px-4 py-3.5 font-medium text-surface-900 hover:text-brand-600 transition-colors cursor-pointer">
                  {ev.name}
                </td>
                <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell whitespace-nowrap">{ev.date}</td>
                <td className="px-4 py-3.5 text-surface-500 hidden lg:table-cell">{ev.role}</td>
                <td className="px-4 py-3.5"><StatusBadge status={ev.status} /></td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors">
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                    <button className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors">
                      <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Documents ─────────────────────────────────────────────────────────

function DocumentsTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="p-6 space-y-5 max-w-[1000px]">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand cursor-pointer">
          <Upload className="w-4 h-4" strokeWidth={2} />
          Upload Document
          <input type="file" className="hidden" ref={fileInputRef} accept=".pdf,.doc,.docx,.jpg,.png" />
        </label>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <Send className="w-4 h-4" strokeWidth={1.8} />
          Request Document
        </button>
      </div>

      <div className="bg-white rounded-xl border border-surface-200 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 bg-surface-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Document Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden md:table-cell">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider hidden lg:table-cell">Expiry</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 w-28" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {DOCUMENTS_DATA.map((doc) => (
              <tr key={doc.id} className="hover:bg-surface-50 transition-colors group">
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-surface-400 shrink-0" strokeWidth={1.8} />
                    <span className="font-medium text-surface-900 text-xs">{doc.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-surface-500 hidden md:table-cell">{doc.type}</td>
                <td className="px-4 py-3.5 text-surface-400 text-xs hidden lg:table-cell">{doc.expiry}</td>
                <td className="px-4 py-3.5"><StatusBadge status={doc.status} /></td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {doc.status !== "verified" && (
                      <button className="p-1.5 rounded-lg text-success-600 hover:bg-success-50 transition-colors" title="Mark Verified">
                        <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
                      </button>
                    )}
                    <button className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors" title="Download">
                      <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                    <button className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 transition-colors" title="Archive">
                      <Archive className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Missing docs warning */}
      <div className="flex items-start gap-3 p-4 bg-danger-50 border border-danger-200 rounded-xl">
        <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" strokeWidth={2} />
        <div>
          <p className="text-sm font-semibold text-danger-700">1 document missing</p>
          <p className="text-xs text-danger-600 mt-0.5">Employers Liability Insurance has expired. Request an updated copy from the supplier.</p>
        </div>
      </div>

      <p className="text-xs text-surface-400">All documents are upload-only. No external URL fields are permitted.</p>
    </div>
  );
}

// ── Tab: Activity ──────────────────────────────────────────────────────────

function ActivityTab() {
  const iconForType = (type: string) => {
    const map: Record<string, { bg: string; char: string }> = {
      quote:  { bg: "bg-success-500",  char: "£" },
      doc:    { bg: "bg-surface-500",  char: "F" },
      invite: { bg: "bg-brand-500",   char: "→" },
      note:   { bg: "bg-violet-500",  char: "✎" },
      status: { bg: "bg-brand-600",   char: "★" },
    };
    return map[type] ?? { bg: "bg-surface-400", char: "•" };
  };

  return (
    <div className="p-6 max-w-[800px]">
      <div className="flex items-center gap-2 mb-5">
        <button className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors shadow-brand">
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Add Note
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <Filter className="w-4 h-4" strokeWidth={1.8} />
          Filter
        </button>
        <button className="flex items-center gap-2 px-3 py-2 text-sm border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
          <Download className="w-4 h-4" strokeWidth={1.8} />
          Export
        </button>
      </div>

      {/* Note input */}
      <div className="bg-white rounded-xl border border-surface-200 shadow-card p-4 mb-5">
        <textarea
          placeholder="Add a note or comment about this supplier…"
          className="w-full text-sm text-surface-800 placeholder:text-surface-400 resize-none bg-transparent focus:outline-none"
          rows={3}
        />
        <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-surface-100">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-surface-200 text-surface-600 rounded-lg hover:bg-surface-50 transition-colors">
            <Pin className="w-3 h-3" strokeWidth={2} />
            Pin
          </button>
          <button className="px-4 py-1.5 text-xs font-semibold text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors">
            Post Note
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-5 top-2 bottom-2 w-px bg-surface-100" />
        <div className="space-y-4">
          {ACTIVITY_DATA.map((item) => {
            const { bg, char } = iconForType(item.type);
            return (
              <div key={item.id} className="flex items-start gap-4 group">
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 text-white text-xs font-bold", bg)}>
                  {char}
                </div>
                <div className="flex-1 bg-white rounded-xl border border-surface-200 shadow-card p-4 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-surface-800">{item.text}</p>
                    <button className="opacity-0 group-hover:opacity-100 p-1 rounded text-surface-400 hover:bg-surface-100 transition-all shrink-0">
                      <Pin className="w-3 h-3" strokeWidth={2} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="w-5 h-5 rounded-full bg-surface-200 flex items-center justify-center">
                      <span className="text-[9px] font-bold text-surface-600">{item.user.slice(0, 2)}</span>
                    </div>
                    <span className="text-xs text-surface-400">{item.user} · {item.time}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function SupplierDetailPage({ params }: { params: { supplierId: string } }) {
  const [activeTab, setActiveTab] = useState("overview");

  const tabContent: Record<string, React.ReactNode> = {
    overview:  <OverviewTab />,
    services:  <ServicesTab />,
    quotes:    <QuotesTab />,
    events:    <EventsTab />,
    documents: <DocumentsTab />,
    activity:  <ActivityTab />,
  };

  return (
    <div className="animate-fade-in">
      <SupplierHero supplierId={params.supplierId} />
      <div className="bg-white border-b border-surface-200 sticky top-14 z-20">
        <div className="px-6">
          <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />
        </div>
      </div>
      <div key={activeTab} className="animate-fade-in">
        {tabContent[activeTab]}
      </div>
    </div>
  );
}
