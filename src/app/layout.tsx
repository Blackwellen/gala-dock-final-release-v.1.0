import type { CSSProperties } from "react";
import regeneratedAssets from "@/lib/regenerated-assets.json";
import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { Providers } from "@/components/ui";
import { PwaLifecycle } from "@/components/pwa";

export const metadata: Metadata = {
  title: "Gala Dock",
  description: "Discover extraordinary events. Find venues, plan unforgettable experiences, and grow your event business with Gala Dock.",
  manifest: "/gala-dock.webmanifest",
  appleWebApp: { capable: true, title: "Gala Dock", statusBarStyle: "default" },
  icons: { icon: [{ url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/brand/favicon-48.png", sizes: "48x48", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#1b64f5", viewportFit: "cover", width: "device-width", initialScale: 1 };


// Scales the desktop auth and onboarding layouts so a full design screen fits the viewport at 100% browser zoom.
// Fits the design height where possible, but never widens the layout beyond 1.3x (onboarding) / 1.6x (auth card) the design width
// (so forms keep their proportions) and never scales below 0.7 so text stays readable. Runs before first paint.
const fitScript = `(function(){function f(){var w=innerWidth,h=innerHeight,c=function(v){return Math.max(.7,Math.min(1,v)).toFixed(3)},d=document.documentElement.style;
if(w<1101){d.setProperty("--gd-fit-auth","1");d.setProperty("--gd-fit-setup","1");return}
var z=function(dw,dh,k){return c(Math.max(Math.min(w/dw,h/dh),w/(dw*k)))};d.setProperty("--gd-fit-auth",z(1448,1086,1.6));d.setProperty("--gd-fit-setup",z(1536,1024,1.3))}f();addEventListener("resize",f)})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: fitScript }} /></head>
      <body style={Object.fromEntries(Object.entries(regeneratedAssets).map(([name,url])=>[`--asset-${name}`,`url(${url})`])) as CSSProperties}><Providers>{children}<PwaLifecycle /></Providers></body>
    </html>
  );
}
