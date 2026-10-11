/**
 * Accepts only same-origin relative paths. Rejects protocol-relative URLs, backslashes,
 * encoded slashes and control characters that browsers may normalise into external hosts.
 */
export function safeNext(value: string | null | undefined, fallback = "/continue") {
  if (!value || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return fallback;
  if (/^\/(%2f|%5c)/i.test(value)) return fallback;
  try {
    const url = new URL(value, "https://gala-dock.invalid");
    if (url.origin !== "https://gala-dock.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** Human summary of a preserved return journey, shown on auth screens. Derived only from the path. */
export function describeIntent(next: string | null | undefined, titles: Record<string, string>) {
  const path = safeNext(next, "");
  if (!path) return null;
  const [pathname, query = ""] = path.split("?");
  const event = new URLSearchParams(query).get("event");
  if (pathname === "/checkout") {
    const title = event ? titles[`/events/${event}`] : undefined;
    return { kind: "checkout", title: "Returning to checkout", detail: title ? `Complete your ${title} tickets` : "Complete your ticket purchase", href: path };
  }
  if (pathname.startsWith("/events/")) return { kind: "event", title: "Returning to your event", detail: titles[pathname] ?? "Continue where you left off", href: path };
  if (pathname.startsWith("/invite/")) return { kind: "invite", title: "Accepting a workspace invite", detail: "You’ll return to your invitation after signing in", href: path };
  if (pathname.startsWith("/onboarding")) return { kind: "onboarding", title: "Continuing your setup", detail: "Your progress is saved and will resume", href: path };
  if (pathname.startsWith("/venues/") || pathname.startsWith("/services/")) return { kind: "booking", title: "Returning to your booking", detail: titles[pathname] ?? "Continue your enquiry", href: path };
  return null;
}
