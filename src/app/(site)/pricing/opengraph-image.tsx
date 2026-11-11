import { ogContentType, ogImage, ogSize } from "@/lib/public/og";

export const alt = "Gala Dock pricing";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("Pricing", "From one event to", "an entire operation.");
}
