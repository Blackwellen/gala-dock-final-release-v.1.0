// Tiny client-side event bus so the top-bar Copilot button can open the
// persistent GalaCopilot bubble (sibling components, no shared parent state).

const EVENT = "gala:copilot:open";

export function openCopilot() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT));
  }
}

export function onOpenCopilot(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
