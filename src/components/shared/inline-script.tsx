"use client";
/**
 * Runs `html` synchronously while the browser parses the server HTML (before first paint), and renders an inert
 * `text/plain` copy on the client so React doesn't warn about rendering a <script> (seen on not-found / client-rendered
 * boundaries). Pattern from node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
 */
export function InlineScript({ html, id, nonce }: { html: string; id?: string; nonce?: string }) {
  // `nonce` (from the proxy's CSP, read in the root layout) lets the script run under the nonce Content-Security-Policy.
  return <script id={id} nonce={nonce} type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
