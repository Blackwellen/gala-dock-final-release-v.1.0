// Gala Dock malware scanner — a tiny HTTP front for ClamAV's clamd (INSTREAM over TCP). No dependencies.
//   POST /scan    body: raw file bytes   → { clean: boolean, signature?: string }
//   GET  /health                          → { ok: true, clamd: "PONG", version }
// Auth: Authorization: Bearer $SCAN_TOKEN on every request. Env: SCAN_TOKEN (required), CLAMD_HOST=clamav, CLAMD_PORT=3310, PORT=8080,
// MAX_BYTES=26214400. Runs on the Oracle Cloud VM next to the clamav container (see docs/operations/oracle-setup.md).
import http from "node:http";
import net from "node:net";
import { timingSafeEqual } from "node:crypto";

const TOKEN = process.env.SCAN_TOKEN ?? "";
if (TOKEN.length < 32) { console.error("SCAN_TOKEN must be set (32+ chars)"); process.exit(1); }
const HOST = process.env.CLAMD_HOST ?? "clamav", PORT = Number(process.env.CLAMD_PORT ?? 3310), MAX = Number(process.env.MAX_BYTES ?? 25 * 1024 * 1024);

const authed = req => { const h = Buffer.from(req.headers.authorization ?? ""), w = Buffer.from(`Bearer ${TOKEN}`); return h.length === w.length && timingSafeEqual(h, w); };
const clamd = (cmd, body) => new Promise((resolve, reject) => {
  const s = net.createConnection({ host: HOST, port: PORT }); let out = "";
  s.setTimeout(30_000, () => { s.destroy(); reject(new Error("clamd_timeout")); });
  s.on("error", reject); s.on("data", d => { out += d.toString(); }); s.on("end", () => resolve(out.replace(/\0/g, "").trim()));
  s.on("connect", () => {
    s.write(`z${cmd}\0`);
    if (body) { for (let i = 0; i < body.length; i += 64 * 1024) { const chunk = body.subarray(i, i + 64 * 1024); const len = Buffer.alloc(4); len.writeUInt32BE(chunk.length); s.write(len); s.write(chunk); } s.write(Buffer.alloc(4)); }
    else s.end();
  });
});
const send = (res, status, obj) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  if (!authed(req)) return send(res, 401, { error: "unauthorised" });
  try {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, clamd: await clamd("PING"), version: await clamd("VERSION") });
    if (req.method === "POST" && req.url === "/scan") {
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > MAX) return send(res, 413, { error: "too_large" }); chunks.push(c); }
      const result = await clamd("INSTREAM", Buffer.concat(chunks));   // "stream: OK" | "stream: Eicar-Signature FOUND"
      if (/OK$/.test(result)) return send(res, 200, { clean: true });
      const m = result.match(/^stream: (.+) FOUND$/);
      if (m) return send(res, 200, { clean: false, signature: m[1] });
      return send(res, 502, { error: "scan_error", detail: result.slice(0, 200) });
    }
    send(res, 404, { error: "not_found" });
  } catch (e) { send(res, 503, { error: "clamd_unavailable", detail: String(e.message ?? e).slice(0, 120) }); }
}).listen(Number(process.env.PORT ?? 8080), () => console.log("av-scanner listening"));
