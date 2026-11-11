import { ogContentType, ogImage, ogSize } from "@/lib/public/og";

export const alt = "Gala Dock — the connected event platform";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("The connected event platform", "Everything an event needs.", "One place to build it.");
}
