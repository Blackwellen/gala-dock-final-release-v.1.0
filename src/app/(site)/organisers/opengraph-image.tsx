import { ogContentType, ogImage, ogSize } from "@/lib/public/og";

export const alt = "Gala Dock for organisers";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("For professional organisers", "Run the whole event from", "one operating system.");
}
