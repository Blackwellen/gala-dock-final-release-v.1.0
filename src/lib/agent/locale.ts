// Q72 · Gala Agent locale behaviour (prompt text only; Azure via llm.ts; no customer-workspace AI). The agent answers in the
// user's language preference (profiles.language) and reads/writes times in the event's own zone (events.timezone), else the
// workspace's. Pure module so the routes, the runtime and tests share it.
import { languageName } from "@/lib/i18n/messages";
import { DEFAULT_TZ, safeTz, todayIn, tzAbbrev } from "@/lib/i18n/tz";

export type AgentLocale = { language?: string | null; timezone?: string | null; currency?: string | null };

/** System-prompt lines: today's date in the zone, the zone to use for times, the reply language, and the currency rule. */
export function localeDirective(l: AgentLocale, now: Date = new Date()): string {
  const tz = safeTz(l.timezone ?? DEFAULT_TZ), lang = languageName(l.language);
  return [
    `Today is ${todayIn(tz, now)} in ${tz} (${tzAbbrev(now, tz)}).`,
    `Read and write every date and time in ${tz} unless a record names another zone; say the zone when you give a time.`,
    lang === "English" ? "Reply in British English." : `Reply in ${lang} (the user's language preference). Keep names, codes and amounts exactly as written in the records.`,
    l.currency ? `Money: amounts are in ${String(l.currency).toUpperCase()} unless a record states another currency; never add amounts in different currencies together.` : "Money: never add amounts in different currencies together.",
  ].join("\n");
}
