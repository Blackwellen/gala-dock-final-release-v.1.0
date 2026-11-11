import { ogContentType, ogImage, ogSize } from "@/lib/public/og";

export const alt = "About Gala Dock";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("About Gala Dock", "Building the infrastructure that", "brings an event together.");
}
