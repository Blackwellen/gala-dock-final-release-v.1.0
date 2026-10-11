import { preload } from "react-dom";

/** Satoshi is only used on auth and onboarding, so those routes request it (React 19 resource hints) instead of every page. */
export function preloadSatoshi() {
  for (const w of ["700", "400"]) preload(`/fonts/satoshi-${w}.woff2`, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
}
