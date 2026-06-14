import type { MetadataRoute } from "next";

/**
 * PWA manifest (Next 16 metadata route). Served at /manifest.webmanifest.
 * Icons reference existing assets in /public. No service-worker library added.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gala Dock",
    short_name: "Gala Dock",
    description: "The Event Delivery OS — plan, deliver and manage events end to end.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0e0c27",
    theme_color: "#4F46E5",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/gala-dock-favicon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/gala-dock-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/gala-dock-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
