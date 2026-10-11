/** Admin permission that unlocks break-glass conversation access (release-readiness §5). */
export const PERM = "support.break_glass_conversation.read" as const;

/** [key, label, needs a second administrator's approval] */
export const REASONS: [string, string, boolean][] = [["safeguarding", "Safeguarding", true], ["fraud", "Fraud", false], ["abuse", "Abuse", true], ["payment_dispute", "Payment dispute", false],
  ["legal_request", "Legal request", true], ["critical_support", "Critical support investigation", false]];
