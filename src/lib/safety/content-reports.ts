// Q74 (owner decision D8; Online Safety Act 2023 s.20): Report on listings, events, reviews and business profiles. Pure (no I/O).
// Messages use the messaging lane's report_message / message_reports (Q52); everything feeds the one queue at /admin/moderation.

export const REPORT_SUBJECTS = ["listing", "event", "review", "workspace"] as const;
export type ReportSubject = typeof REPORT_SUBJECTS[number];

/** Reasons offered per subject: active codes of public.moderation_reason_codes whose applies_to includes the subject. */
const ALL = [
  ["illegal_content", "Illegal content (fraud, threats, hate, intimate images)"],
  ["scam_or_payment_diversion", "Scam, fake listing or asks to pay outside Gala Dock"],
  ["child_safety", "Child safety concern"],
  ["misleading_listing", "Misleading or inaccurate"],
  ["prohibited_item", "Prohibited item or service"],
  ["safety_concern", "Safety concern"],
  ["abusive_content", "Abusive, hateful or harassing"],
  ["fake_review", "Fake or paid-for review"],
  ["personal_data", "Shares someone’s personal data"],
  ["spam", "Spam"],
  ["other_policy", "Something else (explain below)"],
] as const;
const APPLIES: Record<ReportSubject, readonly string[]> = {
  listing: ["illegal_content", "scam_or_payment_diversion", "child_safety", "misleading_listing", "prohibited_item", "safety_concern", "abusive_content", "personal_data", "spam", "other_policy"],
  event: ["illegal_content", "scam_or_payment_diversion", "child_safety", "misleading_listing", "prohibited_item", "safety_concern", "abusive_content", "other_policy"],
  review: ["illegal_content", "scam_or_payment_diversion", "child_safety", "fake_review", "abusive_content", "personal_data", "spam", "other_policy"],
  workspace: ["illegal_content", "scam_or_payment_diversion", "child_safety", "misleading_listing", "safety_concern", "abusive_content", "other_policy"],
};
export function reportReasons(subject: ReportSubject): { code: string; label: string }[] {
  return ALL.filter(([c]) => APPLIES[subject].includes(c)).map(([code, label]) => ({ code, label }));
}
export const isReportSubject = (v: unknown): v is ReportSubject => typeof v === "string" && (REPORT_SUBJECTS as readonly string[]).includes(v);

export const REPORT_ERRORS: [RegExp, string][] = [
  [/already_reported|23505/, "You’ve already reported this — our team is looking at it."], [/cannot_report_own/, "You can’t report your own content."],
  [/rate_limited|54000/, "You’ve sent a lot of reports — try again later."], [/not_found|P0002/, "This content isn’t available any more."],
  [/invalid_reason_code/, "Choose a reason."], [/not_authorized|42501/, "Please sign in to report."],
];

export const SUBJECT_LABEL: Record<ReportSubject, string> = { listing: "listing", event: "event", review: "review", workspace: "profile" };
