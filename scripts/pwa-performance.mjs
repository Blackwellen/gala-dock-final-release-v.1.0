// Representative lab measurements, not field Core Web Vitals or physical-device certification.
import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';
const base = process.env.E2E_BASE_URL ?? 'http://localhost:3119';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = [];
try {
 for (const [role, route] of [['customer','/account'],['customer','/discover'],['organizer','/organizer'],['provider','/provider']].filter(([,route]) => !process.env.PWA_PERF_ROUTE || route === process.env.PWA_PERF_ROUTE)) {
  const ctx = await browser.newContext({ storageState: `artifacts/auth/pwa-resume-${role}.json`, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, reducedMotion: 'reduce' });
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8 });
  await page.addInitScript(() => {
   window.__pwaLab = { lcp: null, cls: 0, longTasks: 0, shifts: [] };
   new PerformanceObserver(list => { for (const e of list.getEntries()) window.__pwaLab.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
   new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) { window.__pwaLab.cls += e.value; window.__pwaLab.shifts.push({ value: e.value, sources: e.sources.map(s => ({ node: s.node?.className ?? s.node?.nodeName, previous: s.previousRect.toJSON(), current: s.currentRect.toJSON() })) }); } }).observe({ type: 'layout-shift', buffered: true });
   new PerformanceObserver(list => { window.__pwaLab.longTasks += list.getEntries().length; }).observe({ type: 'longtask', buffered: true });
  });
  const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 120000 });
  if (response?.status() !== 200 || new URL(page.url()).pathname !== route) throw new Error(`Unusable performance fixture ${role} ${route}`);
  const metrics = await page.evaluate(() => ({ ...window.__pwaLab, ttfb: performance.getEntriesByType('navigation')[0].responseStart, bytes: performance.getEntriesByType('resource').reduce((n, e) => n + e.transferSize, 0) }));
  const started = Date.now(); await page.getByRole('button', { name: 'Menu', exact: true }).click(); await page.getByRole('dialog', { name: 'Menu', exact: true }).waitFor();
  const automationMenuMs = Date.now() - started; await page.keyboard.press('Escape');
  report.push({ role, route, ...metrics, automationMenuMs }); console.log(JSON.stringify(report.at(-1)));
  await ctx.close();
 }
} finally { await browser.close(); }
await fs.writeFile(process.env.PWA_PERF_REPORT ?? 'artifacts/pwa/finish-performance.json', JSON.stringify({ mode: 'local production, Chrome lab, 390x844 DPR3, 4x CPU, 1.6Mbps/150ms', limits: 'Single sample per route; automation menu duration is not INP; no field or physical-device certification.', report }, null, 2));
