/** Only allow same-origin relative redirects — never an absolute/external URL (open-redirect guard). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}
