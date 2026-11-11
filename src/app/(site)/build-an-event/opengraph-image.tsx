import { ogContentType, ogImage, ogSize } from "@/lib/public/og";

export const alt = "Build an event with Gala Dock";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("Build your event", "Build the whole event,", "one decision at a time.");
}
