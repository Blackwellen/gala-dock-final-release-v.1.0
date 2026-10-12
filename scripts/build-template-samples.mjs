// Sample photography for starter templates (project-owned art from public/assets/regenerated), resized to web WebP in
// public/design-assets/samples/. Templates show these until the design is linked to an event, then the event's cover photo.
// Usage: node scripts/build-template-samples.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
const MAP = { "artist-man": "event-0", "artist-woman": "event-1", "artist-fire": "event-2", "performer": "event-4", "concert-crowd": "event-5", "concert-silhouette": "event-7", "festival-fire": "event-8",
  "dinner": "event-9", "carnival": "event-10", "fireworks": "event-hero", "wedding-table": "experience-0", "banquet": "experience-1", "rooftop-dining": "experience-2", "stage-lights": "home-0",
  "garden-lounge": "home-1", "skyline-gathering": "home-2", "street-art": "home-3", "beach-sunset": "home-4", "brides": "home-5", "festival-sunset": "home-6", "gala-dinner": "home-7",
  "london-night": "london-hero", "dj": "neon-aftermovie", "venue-waterfront": "venue-hero", "party-smile": "home-hero", "crowd-hands": "home-action-0", "garden-wedding": "home-action-1" };
mkdirSync("public/design-assets/samples", { recursive: true });
for (const [name, src] of Object.entries(MAP)) {
  const info = await sharp(`public/assets/regenerated/${src}.png`).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 78 }).toFile(`public/design-assets/samples/${name}.webp`);
  console.log(name, `${info.width}x${info.height}`, `${(info.size / 1024) | 0}KB`);
}
