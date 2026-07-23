// Tiny client-side event bus so the top-bar Copilot button can open the
// persistent GalaCopilot bubble (sibling components, no shared parent state).

const EVENT = "gala:copilot:open";

/** Opens the Copilot bubble. Pass `prefill` to seed the chat input — e.g. a
 *  "send briefing" quick action that hands the user a ready-to-send prompt
 *  instead of a decorative dead end. */
export function openCopilot(prefill?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<{ prefill?: string }>(EVENT, { detail: { prefill } }));
  }
}

export function onOpenCopilot(handler: (prefill?: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<{ prefill?: string }>).detail?.prefill);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
