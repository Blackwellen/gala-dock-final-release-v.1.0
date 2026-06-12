"use client";

import { useState } from "react";
import { Mail, Clock, CheckCircle2, ArrowRight } from "lucide-react";

const SUBJECTS = [
  "General enquiry",
  "Sales & pricing",
  "Technical support",
  "Billing",
  "Partnership",
  "Security",
  "Other",
];

const inputCls =
  "w-full px-3 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  function handleChange(
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setSubmitted(true);
    }, 800);
  }

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-brand-50/50 to-white pt-20 pb-12 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold text-surface-900 tracking-tight mb-4">
            Get in touch
          </h1>
          <p className="text-lg text-surface-500">
            Questions about the product, pricing or your account? We would love
            to hear from you.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Contact info */}
          <div className="lg:col-span-1 space-y-6 pt-2">
            <div className="p-5 border border-surface-200 rounded-2xl bg-white shadow-card">
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
                <Mail className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
              </div>
              <h3 className="text-sm font-semibold text-surface-900 mb-1">
                Email us
              </h3>
              <a
                href="mailto:hello@galadock.com"
                className="text-sm text-brand-600 hover:underline"
              >
                hello@galadock.com
              </a>
            </div>

            <div className="p-5 border border-surface-200 rounded-2xl bg-white shadow-card">
              <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center mb-4">
                <Clock
                  className="w-5 h-5 text-success-600"
                  strokeWidth={1.8}
                />
              </div>
              <h3 className="text-sm font-semibold text-surface-900 mb-1">
                Response time
              </h3>
              <p className="text-sm text-surface-500">
                Usually within 24 hours on business days
              </p>
            </div>

            <div className="p-5 border border-surface-200 rounded-2xl bg-white shadow-card">
              <h3 className="text-sm font-semibold text-surface-900 mb-3">
                Common topics
              </h3>
              <ul className="space-y-2">
                {[
                  "Sales & pricing questions",
                  "Technical support",
                  "Billing enquiries",
                  "Partnership opportunities",
                  "Security reports",
                ].map((topic) => (
                  <li key={topic} className="flex items-center gap-2">
                    <CheckCircle2
                      className="w-3.5 h-3.5 text-brand-600 shrink-0"
                      strokeWidth={2.5}
                    />
                    <span className="text-xs text-surface-600">{topic}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-2">
            {submitted ? (
              <div className="h-full min-h-[420px] flex items-center justify-center border border-surface-200 rounded-2xl bg-white shadow-card p-10">
                <div className="text-center max-w-sm">
                  <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-success-50 flex items-center justify-center">
                    <CheckCircle2
                      className="w-8 h-8 text-success-600"
                      strokeWidth={2}
                    />
                  </div>
                  <h2 className="text-xl font-semibold text-surface-900 mb-2">
                    Message sent!
                  </h2>
                  <p className="text-sm text-surface-500">
                    Thanks for reaching out. We will be in touch within 24
                    hours.
                  </p>
                </div>
              </div>
            ) : (
              <div className="border border-surface-200 rounded-2xl bg-white shadow-card p-8">
                <h2 className="text-lg font-semibold text-surface-900 mb-6">
                  Send a message
                </h2>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1.5">
                        Name <span className="text-danger-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="name"
                        required
                        placeholder="Your full name"
                        value={form.name}
                        onChange={handleChange}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1.5">
                        Email <span className="text-danger-500">*</span>
                      </label>
                      <input
                        type="email"
                        name="email"
                        required
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={handleChange}
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-surface-600 mb-1.5">
                      Subject <span className="text-danger-500">*</span>
                    </label>
                    <select
                      name="subject"
                      required
                      value={form.subject}
                      onChange={handleChange}
                      className={inputCls}
                    >
                      <option value="" disabled>
                        Select a topic…
                      </option>
                      {SUBJECTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-surface-600 mb-1.5">
                      Message <span className="text-danger-500">*</span>
                    </label>
                    <textarea
                      name="message"
                      required
                      rows={6}
                      placeholder="Tell us how we can help…"
                      value={form.message}
                      onChange={handleChange}
                      className={inputCls + " resize-none"}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sending}
                    className="flex items-center justify-center gap-2 w-full py-3 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-colors disabled:opacity-60 shadow-lg shadow-brand-600/20"
                  >
                    {sending ? (
                      "Sending…"
                    ) : (
                      <>
                        Send message
                        <ArrowRight className="w-4 h-4" strokeWidth={2} />
                      </>
                    )}
                  </button>

                  <p className="text-xs text-surface-400 text-center">
                    By submitting this form you agree to our{" "}
                    <a
                      href="/legal/privacy"
                      className="text-brand-600 hover:underline"
                    >
                      Privacy Policy
                    </a>
                    .
                  </p>
                </form>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
