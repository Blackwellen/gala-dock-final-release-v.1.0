/* Simplified social network glyphs for share buttons and channel rows (lucide no longer ships brand marks). */
export type Network = "instagram" | "tiktok" | "facebook" | "x" | "email" | "whatsapp" | "linkedin" | "link" | "direct" | "other";

export function BrandGlyph({ network }: { network: Network }) {
  const common = { viewBox: "0 0 24 24", "aria-hidden": true as const, className: "pt-brand-glyph" };
  switch (network) {
    case "instagram": return <svg {...common} fill="none" stroke="currentColor" strokeWidth="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" /></svg>;
    case "tiktok": return <svg {...common} fill="currentColor"><path d="M15.2 3h-3v11.6a2.7 2.7 0 1 1-2.7-2.7c.3 0 .6 0 .9.1V8.9a5.8 5.8 0 1 0 4.8 5.7V9a7 7 0 0 0 4 1.3V7.2A4 4 0 0 1 15.2 3z" /></svg>;
    case "facebook": return <svg {...common} fill="currentColor"><path d="M13.6 21v-7.4h2.5l.4-3h-2.9V8.8c0-.9.3-1.5 1.5-1.5h1.5V4.6c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.3H8.2v3h2.5V21h2.9z" /></svg>;
    case "x": return <svg {...common} fill="currentColor"><path d="M17.8 3.5h3l-6.6 7.6L22 20.5h-6.1l-4.8-6.2-5.5 6.2h-3l7.1-8.1L2.3 3.5h6.2l4.3 5.7 5-5.7zm-1 15.3h1.7L7.3 5.1H5.5l11.3 13.7z" /></svg>;
    case "linkedin": return <svg {...common} fill="currentColor"><path d="M4.5 9h3v10.5h-3V9zM6 4.2a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5zM10 9h2.9v1.5c.4-.8 1.4-1.7 3-1.7 3.1 0 3.6 2 3.6 4.7v6h-3v-5.3c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8v5.4H10V9z" /></svg>;
    case "whatsapp": return <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4.2 19.8l1.1-3.9A8.3 8.3 0 1 1 8.4 19z" strokeLinejoin="round" /><path d="M9 8.6c.2-.5.6-.5.9-.5l.6 1.5-.6.8c.5 1 1.3 1.8 2.3 2.3l.8-.6 1.5.6c0 .3 0 .7-.5.9-.9.5-2.6.1-4-1.3S8.5 9.5 9 8.6z" fill="currentColor" stroke="none" /></svg>;
    case "email": return <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></svg>;
    case "link": return <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>;
    default: return <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" /></svg>;
  }
}
export const NETWORK_LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", x: "X (Twitter)", email: "Email", whatsapp: "WhatsApp", linkedin: "LinkedIn", direct: "Direct", other: "Other" };
