import type { Metadata } from "next";
import Link from "next/link";
import {
  Shield,
  Lock,
  Eye,
  Database,
  FileSearch,
  Users,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Security — Gala Dock",
  description:
    "Enterprise-grade security built into every layer of Gala Dock. Your data is protected, compliant and always in your control.",
};

// ── Data ──────────────────────────────────────────────────────────────────────

const SECURITY_FEATURES = [
  {
    icon: Lock,
    iconBg: "bg-brand-50",
    iconColor: "text-brand-600",
    title: "Data Encryption",
    description:
      "All data is encrypted at rest using AES-256 and in transit using TLS 1.3. Database backups are encrypted separately. Encryption keys are managed via a dedicated key management service with automatic rotation.",
    points: [
      "AES-256 encryption at rest",
      "TLS 1.3 for all data in transit",
      "Separate backup encryption",
      "Automatic key rotation",
    ],
  },
  {
    icon: Users,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    title: "Row-Level Access Controls",
    description:
      "Gala Dock enforces strict row-level security (RLS) at the database layer — not just the application layer. This means even if an application-level check is bypassed, your data cannot be read or modified by another tenant's session.",
    points: [
      "Database-level RLS enforcement",
      "Role-based access within teams",
      "Granular permission scoping",
      "Tenant isolation guaranteed",
    ],
  },
  {
    icon: ShieldCheck,
    iconBg: "bg-success-50",
    iconColor: "text-success-600",
    title: "SOC 2 Type II — In Progress",
    description:
      "We are currently working towards SOC 2 Type II certification. Our controls and processes are aligned with the SOC 2 Trust Service Criteria for Security, Availability and Confidentiality. Certification is expected in Q4 2026.",
    points: [
      "Controls aligned to TSC",
      "Security & availability criteria",
      "Third-party auditor engaged",
      "Certification target: Q4 2026",
    ],
    badge: "Coming Q4 2026",
  },
  {
    icon: Eye,
    iconBg: "bg-warning-50",
    iconColor: "text-warning-600",
    title: "GDPR Compliance",
    description:
      "Gala Dock is built to comply with the UK GDPR and EU GDPR. All personal data is processed lawfully, stored in UK/EU data centres, and subject to strict data retention policies. We act as a Data Processor for your event data and provide a full Data Processing Agreement.",
    points: [
      "UK & EU GDPR compliant",
      "UK/EU data centres only",
      "Full DPA available",
      "Right to erasure supported",
    ],
  },
  {
    icon: FileSearch,
    iconBg: "bg-brand-50",
    iconColor: "text-brand-600",
    title: "Audit Logs",
    description:
      "Every significant action in Gala Dock is recorded in a tamper-evident audit log. Know exactly who did what, when, and from which IP address. Audit logs are retained for 12 months on Growth plans and 36 months on Enterprise.",
    points: [
      "Immutable audit trail",
      "IP address & device logging",
      "User action attribution",
      "12–36 month retention",
    ],
  },
  {
    icon: Database,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    title: "Infrastructure & Uptime",
    description:
      "Gala Dock is hosted on enterprise-grade cloud infrastructure with automatic failover, daily backups, and a 99.9% uptime SLA on Growth and Enterprise plans. We use read replicas and CDN distribution to keep performance consistent globally.",
    points: [
      "99.9% uptime SLA",
      "Daily automated backups",
      "Automatic failover",
      "Global CDN distribution",
    ],
  },
];

const CERTIFICATIONS = [
  { label: "GDPR", sub: "UK & EU compliant" },
  { label: "TLS 1.3", sub: "Transit encryption" },
  { label: "AES-256", sub: "At-rest encryption" },
  { label: "SOC 2", sub: "In progress" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-surface-950 pt-20 pb-20 px-6 text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/40 via-surface-950 to-violet-950/30 pointer-events-none" />
        <div className="relative max-w-3xl mx-auto">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-brand-400" strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight mb-5">
            Enterprise-grade security
          </h1>
          <p className="text-lg text-surface-400 leading-relaxed max-w-2xl mx-auto">
            Your event data is sensitive. We protect it with the same rigour as
            financial services — encryption at every layer, strict access
            controls, and a complete audit trail.
          </p>

          {/* Cert badges */}
          <div className="flex flex-wrap justify-center gap-4 mt-10">
            {CERTIFICATIONS.map((cert) => (
              <div
                key={cert.label}
                className="px-5 py-3 rounded-xl bg-white/5 border border-white/10"
              >
                <p className="text-sm font-bold text-white">{cert.label}</p>
                <p className="text-xs text-surface-400 mt-0.5">{cert.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security feature cards */}
      <section className="px-6 py-20 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 mb-3">
              Security, layer by layer
            </h2>
            <p className="text-surface-500 max-w-xl mx-auto">
              Every part of our stack is built with security as a first
              principle, not an afterthought.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SECURITY_FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="relative border border-surface-200 rounded-2xl p-6 hover:shadow-lg transition-shadow bg-white"
                >
                  {feature.badge && (
                    <span className="absolute top-4 right-4 px-2.5 py-1 text-xs font-semibold bg-warning-50 text-warning-700 border border-warning-200 rounded-full">
                      {feature.badge}
                    </span>
                  )}

                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${feature.iconBg}`}
                  >
                    <Icon
                      className={`w-5 h-5 ${feature.iconColor}`}
                      strokeWidth={1.8}
                    />
                  </div>

                  <h3 className="text-base font-semibold text-surface-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-surface-600 leading-relaxed mb-4">
                    {feature.description}
                  </p>

                  <ul className="space-y-2">
                    {feature.points.map((p) => (
                      <li key={p} className="flex items-center gap-2">
                        <CheckCircle2
                          className="w-3.5 h-3.5 text-success-600 shrink-0"
                          strokeWidth={2.5}
                        />
                        <span className="text-xs text-surface-600">{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Responsible disclosure */}
      <section className="bg-surface-50 border-y border-surface-200 px-6 py-16">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-12 h-12 mx-auto mb-5 rounded-xl bg-brand-50 flex items-center justify-center">
            <Shield className="w-6 h-6 text-brand-600" strokeWidth={1.8} />
          </div>
          <h2 className="text-2xl font-bold text-surface-900 mb-3">
            Responsible disclosure
          </h2>
          <p className="text-surface-600 leading-relaxed mb-6">
            Found a vulnerability? We take security reports seriously and
            respond within 48 hours. Please report issues to{" "}
            <a
              href="mailto:security@galadock.com"
              className="text-brand-600 font-medium hover:underline"
            >
              security@galadock.com
            </a>
            . We do not pursue legal action against good-faith researchers.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition-colors text-sm"
          >
            Contact security team
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </Link>
        </div>
      </section>

      {/* Questions CTA */}
      <section className="px-6 py-16 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl font-bold text-surface-900 mb-3">
            Have a security question?
          </h2>
          <p className="text-surface-500 mb-6">
            Our team is happy to walk you through our security posture, share
            our DPA, or arrange a technical review for enterprise customers.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 border border-surface-200 text-surface-700 font-medium rounded-xl hover:bg-surface-50 transition-colors text-sm"
          >
            Get in touch
          </Link>
        </div>
      </section>
    </div>
  );
}
