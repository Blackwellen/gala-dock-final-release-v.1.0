"use client";

import { useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ArrowRight,
  Clock,
  Monitor,
  Users2,
} from "lucide-react";

const TEAM_SIZES = [
  "Just me",
  "2–5 people",
  "6–15 people",
  "16–50 people",
  "50+ people",
];

const WHAT_TO_EXPECT = [
  {
    icon: Clock,
    title: "45-minute live session",
    description:
      "A personalised walkthrough of Gala Dock with a product specialist — tailored to your team size and event types.",
  },
  {
    icon: Monitor,
    title: "See real workflows in action",
    description:
      "We will walk you through the full pipeline, supplier management, finance suite and AI features using a realistic demo account.",
  },
  {
    icon: Users2,
    title: "Ask anything",
    description:
      "Bring your team. Bring your questions. We will cover pricing, migration from your current tools, and anything else on your mind.",
  },
];

const inputCls =
  "w-full px-3 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 border border-surface-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all";

export default function BookDemoPage() {
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    teamSize: "",
    challenge: "",
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
      <section className="bg-gradient-to-b from-brand-50/50 to-white pt-20 pb-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Left: info */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold mb-6">
                <CalendarDays className="w-3.5 h-3.5" strokeWidth={2.5} />
                Book a live demo
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold text-surface-900 tracking-tight mb-5">
                See Gala Dock in
                <br />
                <span className="text-brand-600">your context</span>
              </h1>
              <p className="text-lg text-surface-500 leading-relaxed mb-10">
                A personalised, 45-minute live demo with a product specialist.
                No slides, no sales pitch — just a real walkthrough built around
                your events.
              </p>

              {/* What to expect */}
              <div className="space-y-5">
                {WHAT_TO_EXPECT.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="flex items-start gap-4">
                      <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon
                          className="w-4.5 h-4.5 text-brand-600"
                          strokeWidth={1.8}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-surface-900">
                          {item.title}
                        </p>
                        <p className="text-sm text-surface-500 mt-0.5 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 p-4 bg-surface-50 border border-surface-200 rounded-xl">
                <p className="text-xs text-surface-500">
                  After submitting, a member of our team will email you within
                  one business day to schedule a time that works for you.
                </p>
              </div>
            </div>

            {/* Right: form */}
            <div>
              {submitted ? (
                <div className="border border-surface-200 rounded-2xl bg-white shadow-card p-10 text-center">
                  <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-success-50 flex items-center justify-center">
                    <CheckCircle2
                      className="w-8 h-8 text-success-600"
                      strokeWidth={2}
                    />
                  </div>
                  <h2 className="text-xl font-semibold text-surface-900 mb-2">
                    Demo booked!
                  </h2>
                  <p className="text-sm text-surface-500">
                    Thanks — we will be in touch within one business day to
                    confirm a time.
                  </p>
                </div>
              ) : (
                <div className="border border-surface-200 rounded-2xl bg-white shadow-card p-8">
                  <h2 className="text-lg font-semibold text-surface-900 mb-6">
                    Book your demo
                  </h2>
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1.5">
                        Full name <span className="text-danger-500">*</span>
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
                        Work email <span className="text-danger-500">*</span>
                      </label>
                      <input
                        type="email"
                        name="email"
                        required
                        placeholder="you@youragency.com"
                        value={form.email}
                        onChange={handleChange}
                        className={inputCls}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1.5">
                        Company / agency name
                      </label>
                      <input
                        type="text"
                        name="company"
                        placeholder="Your company or studio name"
                        value={form.company}
                        onChange={handleChange}
                        className={inputCls}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1.5">
                        Team size <span className="text-danger-500">*</span>
                      </label>
                      <select
                        name="teamSize"
                        required
                        value={form.teamSize}
                        onChange={handleChange}
                        className={inputCls}
                      >
                        <option value="" disabled>
                          Select team size…
                        </option>
                        {TEAM_SIZES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-surface-600 mb-1.5">
                        What are you trying to solve?
                      </label>
                      <textarea
                        name="challenge"
                        rows={4}
                        placeholder="e.g. We are managing 30+ events across a team of 8 and everything is still in spreadsheets…"
                        value={form.challenge}
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
                          Book demo
                          <ArrowRight className="w-4 h-4" strokeWidth={2} />
                        </>
                      )}
                    </button>

                    <p className="text-xs text-surface-400 text-center">
                      No commitment required. Cancel or reschedule any time.
                    </p>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
