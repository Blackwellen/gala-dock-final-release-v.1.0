// Typing guard shared by background work (guided tour, polling refreshes). Owner rule (2026-11-15): nothing that runs on its own may
// interrupt someone typing: no focus steal, no re-mount, no re-sync of a field, and forms never auto-save to the server.

/** True when keyboard focus is in a text-entry control (input, textarea, select, contenteditable). Browser only. */
export function isEditingField(el: Element | null = typeof document === "undefined" ? null : document.activeElement): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return !el.disabled;
  if (el instanceof HTMLInputElement) return !el.disabled && !el.readOnly && !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image", "hidden"].includes(el.type);
  return false;
}

let lastInput = 0;
const RECENT_MS = 4000;
// Registered as soon as a client module imports this, so typing before the first poll is seen too.
if (typeof document !== "undefined") document.addEventListener("input", () => { lastInput = Date.now(); }, true);

/** True while the person is actively typing: focus is in a field and they changed it within the last few seconds. Polling
 *  refreshes skip a tick then, so a background re-render never lands mid-word (they still refresh once typing pauses). */
export function isTyping(): boolean {
  if (typeof document === "undefined") return false;
  return isEditingField() && Date.now() - lastInput < RECENT_MS;
}
