import { test, expect } from "@playwright/test";
import { parseVideo, embedUrl } from "../../src/lib/public/video";
import { safeMerchUrl } from "../../src/lib/public/ticket-cta";

// Owner decisions 2026-10-29 (lane C): video embeds are built from a strictly parsed id in privacy mode; merch links are https only.
test("parseVideo accepts YouTube / Vimeo links and builds privacy-mode embeds", () => {
  const ok: [string, string][] = [
    ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?"],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?"],
    ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871?dnt=1"],
    ["https://vimeo.com/76979871/abc123def0", "https://player.vimeo.com/video/76979871?dnt=1&autoplay=1&h=abc123def0"],
    ["https://player.vimeo.com/video/76979871?h=abc123def0", "https://player.vimeo.com/video/76979871?dnt=1&autoplay=1&h=abc123def0"],
  ];
  for (const [raw, prefix] of ok) { const v = parseVideo(raw); expect(v, raw).not.toBeNull(); expect(embedUrl(v!).startsWith(prefix), raw).toBe(true); }
});

test("parseVideo refuses everything else", () => {
  for (const raw of ["http://youtu.be/dQw4w9WgXcQ", "javascript:alert(1)", "data:text/html,x", "https://youtu.be/dQw4w9WgXc", "https://youtu.be/dQw4w9WgXcQ/x",
    "https://evil.com/watch?v=dQw4w9WgXcQ", "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ\"><script>",
    "https://user:pw@youtu.be/dQw4w9WgXcQ", "https://vimeo.com/abc", "https://vimeo.com/76979871/<x>", "https://player.vimeo.com/video/76979871?h=../../x", "", 42])
    expect(parseVideo(raw), String(raw)).toBeNull();
});

test("safeMerchUrl is https only", () => {
  expect(safeMerchUrl("https://shop.example.com/neon")).toBe("https://shop.example.com/neon");
  for (const raw of ["http://shop.example.com", "javascript:alert(1)", "data:text/html,x", "https://u:p@shop.example.com", "https://shop.example.com/\"onmouseover=x", 7, null])
    expect(safeMerchUrl(raw), String(raw)).toBeNull();
});
