import { ogContentType, ogImage, ogSize } from "@/lib/public/og";

export const alt = "Gala Dock for venues and providers";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("For venues & event providers", "List what you provide.", "Run every booking professionally.");
}
