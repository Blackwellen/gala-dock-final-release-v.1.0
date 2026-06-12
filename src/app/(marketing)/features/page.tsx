import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarDays,
  Users2,
  BarChart3,
  FileText,
  Sparkles,
  Globe,
  ArrowRight,
  Zap,
  CheckCircle2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features — Gala Dock",
  description:
    "Everything you need to run great events. Explore the full feature set of Gala Dock.",
};

// ── Data ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    id: "pipeline",
    icon: CalendarDays,
    iconBg: "bg-brand-50",
    iconColor: "text-brand-600",
    tag: "Event Pipeline",
    heading: "Manage every event through a structured pipeline",
    paragraphs: [
      "Gala Dock gives every event a clear lifecycle — from first enquiry through proposal, confirmation, production, on-site delivery, and final sign-off. Each stage has its own checklist, team assignments and document requirements so nothing falls through the cracks.",
      "Kanban and list views let you see all your events at a glance, filter by status, type or date, and spot bottlenecks before they become problems.",
      "Custom pipeline stages mean you can tailor the workflow to your exact process — whether you run corporate events, weddings, or large-scale festivals.",
    ],
    highlights: [
      "7-stage structured pipeline",
      "Kanban & list views",
      "Custom stage configuration",
    ],
  },
  {
    id: "suppliers",
    icon: Users2,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    tag: "Supplier Management",
    heading: "Your entire supplier network in one place",
    paragraphs: [
      "Store, rate, and manage every supplier across all your events. Gala Dock's supplier register tracks contact details, categories, insurance status, contracts, and bank details — all in one secure, searchable record.",
      "Send digital onboarding links so suppliers can upload their own documents and confirm event details without back-and-forth emails. Track who has responded and who still needs chasing from a single dashboard.",
      "Preferred supplier lists, internal ratings, and availability tracking make it easy to build and maintain the reliable network that great events depend on.",
    ],
    highlights: [
      "Centralised supplier register",
      "Digital onboarding portal",
      "Insurance & document tracking",
    ],
  },
  {
    id: "finance",
    icon: BarChart3,
    iconBg: "bg-success-50",
    iconColor: "text-success-600",
    tag: "Finance Suite",
    heading: "Quotes, invoices and P&L — all in one place",
    paragraphs: [
      "Raise branded quotes and convert them to invoices with a single click. Track payments, send reminders, and see your true profit and loss on every event in real time — no more end-of-month spreadsheet reconciliation.",
      "Multi-currency support, VAT handling and export-ready reports make Gala Dock's finance suite powerful enough for complex agencies while staying simple enough for solo planners.",
    ],
    highlights: [
      "Quote & invoice generation",
      "Real-time P&L per event",
      "Payment tracking & reminders",
    ],
  },
  {
    id: "runsheets",
    icon: FileText,
    iconBg: "bg-warning-50",
    iconColor: "text-warning-600",
    tag: "Task & Run Sheet",
    heading: "From task list to live run sheet",
    paragraphs: [
      "Assign tasks across your team and suppliers with due dates, owners and priorities. Gala Dock's task engine rolls up into a live run sheet for event day — a timeline view that your whole team can tick off in real time, even from mobile.",
      "Event Day Mode strips away all the noise and shows only what matters: the run sheet, the clock, and quick actions to add notes, contact suppliers or flag issues.",
      "Automatic reminders and smart escalations mean the right person always knows what's next, without you having to chase manually.",
    ],
    highlights: [
      "Team & supplier task assignment",
      "Live event day run sheet",
      "Automatic reminders",
    ],
  },
  {
    id: "ai",
    icon: Sparkles,
    iconBg: "bg-brand-50",
    iconColor: "text-brand-600",
    tag: "Gala Copilot AI",
    heading: "Your AI delivery partner",
    paragraphs: [
      "Gala Copilot is built into every part of Gala Dock — not bolted on as an afterthought. It drafts event briefs and supplier emails, answers questions about your events in natural language, and surfaces the next actions you should take based on where each event is in its lifecycle.",
      "Risk flagging identifies supplier gaps, missing documents, and budget overruns before they become issues. Smart suggestions help you build run sheets faster and catch the tasks that are easy to forget.",
    ],
    highlights: [
      "Event brief & email drafting",
      "Risk & gap flagging",
      "Natural language queries",
    ],
  },
  {
    id: "portals",
    icon: Globe,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    tag: "Client & Supplier Portals",
    heading: "A professional face for every stakeholder",
    paragraphs: [
      "Give clients a branded, read-only view of their event — timeline, documents, contacts and progress updates — without ever needing to log into your internal system. The client portal looks like it was built for your agency, not for Gala Dock.",
      "The supplier portal lets your supplier network confirm availability, sign documents, and upload insurance certificates digitally. Fewer emails, faster confirmations, and a complete audit trail.",
    ],
    highlights: [
      "White-labelled client portal",
      "Supplier digital onboarding",
      "Audit trail for every action",
    ],
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FeaturesPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50/50 to-white pt-20 pb-16 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold mb-6">
            <Zap className="w-3.5 h-3.5" strokeWidth={2.5} />
            Purpose-built for event professionals
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-surface-900 tracking-tight mb-5">
            Everything you need to run
            <br />
            <span className="text-brand-600">great events</span>
          </h1>
          <p className="text-lg text-surface-500 leading-relaxed max-w-2xl mx-auto">
            Gala Dock brings together the tools, workflows and intelligence that
            event agencies and planners need — in one cohesive platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            <Link
              href="/signup"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition-colors text-sm shadow-lg shadow-brand-600/20"
            >
              Start free trial
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
            <Link
              href="/book-demo"
              className="flex items-center justify-center gap-2 px-6 py-3 border border-surface-200 text-surface-700 font-medium rounded-xl hover:bg-surface-50 transition-colors text-sm"
            >
              See a live demo
            </Link>
          </div>
        </div>
      </section>

      {/* Feature sections */}
      <div className="max-w-6xl mx-auto px-6 py-16 space-y-24">
        {FEATURES.map((feature, i) => {
          const Icon = feature.icon;
          const isEven = i % 2 === 0;

          return (
            <section
              key={feature.id}
              className={`flex flex-col ${isEven ? "lg:flex-row" : "lg:flex-row-reverse"} gap-12 lg:gap-20 items-center`}
            >
              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${feature.iconBg}`}
                  >
                    <Icon
                      className={`w-5 h-5 ${feature.iconColor}`}
                      strokeWidth={1.8}
                    />
                  </div>
                  <span className="text-sm font-semibold text-surface-500 uppercase tracking-wide">
                    {feature.tag}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 leading-tight mb-5">
                  {feature.heading}
                </h2>
                <div className="space-y-4 mb-6">
                  {feature.paragraphs.map((p, pi) => (
                    <p key={pi} className="text-base text-surface-600 leading-relaxed">
                      {p}
                    </p>
                  ))}
                </div>
                <ul className="space-y-2">
                  {feature.highlights.map((h) => (
                    <li key={h} className="flex items-center gap-2.5">
                      <CheckCircle2
                        className="w-4.5 h-4.5 text-brand-600 shrink-0"
                        strokeWidth={2}
                      />
                      <span className="text-sm font-medium text-surface-700">
                        {h}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Visual placeholder */}
              <div className="flex-1 w-full lg:max-w-lg">
                <div className="aspect-[4/3] rounded-2xl border border-surface-200 bg-gradient-to-br from-surface-50 to-brand-50/30 flex items-center justify-center shadow-card">
                  <div className="text-center p-8">
                    <div
                      className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${feature.iconBg}`}
                    >
                      <Icon
                        className={`w-8 h-8 ${feature.iconColor}`}
                        strokeWidth={1.5}
                      />
                    </div>
                    <p className="text-sm font-medium text-surface-500">
                      {feature.tag}
                    </p>
                    <p className="text-xs text-surface-400 mt-1">
                      Screenshot coming soon
                    </p>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* CTA */}
      <section className="bg-surface-900 px-6 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to see it in action?
          </h2>
          <p className="text-surface-400 mb-8 text-lg">
            Start your free 14-day trial or book a personalised demo.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="flex items-center justify-center gap-2 px-8 py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition-colors text-sm"
            >
              Start free trial
              <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </Link>
            <Link
              href="/book-demo"
              className="flex items-center justify-center gap-2 px-8 py-3 border border-surface-700 text-surface-300 font-medium rounded-xl hover:border-surface-500 hover:text-white transition-colors text-sm"
            >
              Book a demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
