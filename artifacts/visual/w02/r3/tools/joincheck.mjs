// Q29 route checks as the demo customer: each GET must 303 to the expected place, never exposing a link on a refusal.
import { chromium } from "file:///C:/Users/PC/Documents/Blackwellen/Built/Gala%20Dock/node_modules/@playwright/test/index.mjs";
const B = "http://localhost:3107", T = "aff95ac1-edca-43e1-a71a-c7ad014f0ceb";
const cases = [
  ["open session → provider", `/tickets/${T}/join?session=b460c456-5b79-4242-8dbc-33255943f046`, /^https:\/\/example\.com\/w02-fixture-main/],
  ["not open yet", `/tickets/${T}/join?session=be15f4da-37b3-4321-9935-dcdd9e959827`, /\/account\/tickets\/.*join=The\+session|join=The%20session/],
  ["ended", `/tickets/${T}/join?session=3350a45c-f6f2-4212-bcd2-fa0c2fb3b59a`, /join=/],
  ["tier not included", `/tickets/${T}/join?session=c521a6cc-31be-4c55-95fb-355189fb4c11`, /join=/],
  ["replay available", `/virtual/replay/01441e02-cae8-47a6-872e-f7f558c9ccb4`, /^https:\/\/example\.com\/w02-fixture-replay/],
  ["replay window closed", `/virtual/replay/0fb5e9e1-392b-4429-be66-09035c089f23`, /join=The\+replay|join=The%20replay/],
  ["replay not entitled", `/virtual/replay/14afd5f9-a98f-4d78-9a68-a0852b3eaaa9`, /join=/],
];
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
try {
  const ctx = await browser.newContext({ storageState: "C:/Users/PC/AppData/Local/Temp/claude/c--Users-PC-Documents-Blackwellen-Built-Gala-Dock/92185747-57a6-40fb-ba41-cf24f325ddad/scratchpad/b3-w02/.state-customer.json" });
  let pass = 0;
  for (const [n, p, want] of cases) {
    const r = await ctx.request.get(B + p, { maxRedirects: 0, timeout: 120000 });
    const loc = r.headers()["location"] ?? "";
    const ok = r.status() === 303 && want.test(loc) && (want.source.includes("example") || !/example\.com/.test(loc));
    if (ok) pass++;
    console.log(`${ok ? "PASS" : "FAIL"} ${n}: ${r.status()} ${decodeURIComponent(loc.replace(/\+/g, " ")).slice(0, 140)} | cache=${r.headers()["cache-control"] ?? ""} ref=${r.headers()["referrer-policy"] ?? ""}`);
  }
  const anon = await (await browser.newContext()).request.get(B + `/tickets/${T}/join`, { maxRedirects: 0 });
  console.log(`${anon.status() === 303 && /\/login/.test(anon.headers().location ?? "") ? "PASS" : "FAIL"} signed out → login (${anon.status()})`);
  console.log(`${pass}/${cases.length} + anon`);
} finally { await browser.close(); }
