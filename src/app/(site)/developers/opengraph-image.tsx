import { ogContentType, ogImage, ogSize } from "@/lib/public/og";

export const alt = "Gala Dock developer platform";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return ogImage("Developers", "Connect through", "API, MCP and webhooks.");
}
