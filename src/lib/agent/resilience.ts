/**
 * Gala Agent turn-loop resilience rules (Q53 bug hunt). Pure — no I/O, no server imports — so the runtime, llm.ts and the specs
 * share one definition: which Azure responses are retried and how long to wait, which step failures retry / suspend / fail, and
 * which plan arguments may carry "$stepN.field" references.
 */

/** Azure OpenAI statuses worth another attempt (timeout, conflict, throttling, transient server errors). */
export const RETRYABLE_HTTP = new Set([408, 409, 429, 500, 502, 503, 504]);
export const isRetryableStatus = (status: number) => RETRYABLE_HTTP.has(status);

/** Retry-After (seconds or HTTP date) when the provider gives one, otherwise exponential backoff with jitter; always capped. */
export function retryDelayMs(attempt: number, retryAfter: string | null | undefined, capMs = 8000, now = Date.now()) {
  if (retryAfter != null && retryAfter !== "") {
    const s = Number(retryAfter);
    if (Number.isFinite(s) && s >= 0) return Math.min(Math.round(s * 1000), capMs);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, Math.min(at - now, capMs));
  }
  return Math.min(capMs, 500 * 2 ** Math.max(0, attempt)) + Math.floor(Math.random() * 250);
}

/** Azure content filtering: a 400 whose body names the filter, or a completion that stopped because of it. */
export function isContentFilter(status: number, body: string) {
  return status === 400 && /content_filter|ResponsibleAIPolicyViolation|content management policy/i.test(body);
}

export type StepOutcome = "retry" | "suspend" | "fail";
/**
 * How the runtime treats a failed step.
 * - suspend: the run was paused / cancelled / switched off, or maintenance is on — nothing went wrong with the step itself, so it
 *   goes back to pending (never "failed") and the loop stops.
 * - retry: throttling and transient infrastructure errors, with backoff (rate_limited is a refusal the person was told "retries
 *   shortly"; it used to fail the step for good).
 * - fail: everything else (validation, permission, domain refusals) — retrying can't help.
 */
export function classifyStepError(message: string): StepOutcome {
  const m = message ?? "";
  if (/^refused:\s*(run_paused|run_cancelled|platform_kill_switch|workspace_kill_switch)\b/.test(m) || /^maintenance:/.test(m)) return "suspend";
  if (/^refused:\s*rate_limited\b/.test(m)) return "retry";
  if (/^(refused:|invalid_input:)/.test(m)) return "fail";
  if (/timeout|timed out|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|(?:^|\D)50[234](?:\D|$)|deadlock detected|could not serialize|canceling statement|too many connections|call_in_progress/i.test(m)) return "retry";
  return "fail";
}

/**
 * "$stepN.field" references may only fill top-level id arguments (event_id, item_id, to …). Free-text fields (message bodies,
 * memory values, quote lines) are never filled from a previous tool's output, so retrieved content — a supplier message, a listing
 * description — can't be carried into an action or saved into memory by a plan (prompt-injection guard).
 */
export const REF = /^\$step(\d+)\.([a-z_]+)$/;
export const isRefKey = (key: string) => key === "id" || key === "to" || key === "depends_on" || /_id$/.test(key);
