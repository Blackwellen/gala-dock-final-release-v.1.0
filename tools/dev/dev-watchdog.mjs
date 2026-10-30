#!/usr/bin/env node
/**
 * Local dev-server watchdog (ported from Gigvora; owner 2026-10-28: "be careful with the ram and storage").
 * Starts `next dev` on one port with a JS heap cap that reaches the server child too, then every 30 s checks the server's
 * working set, the machine's free RAM and free disk on the checkout's drive.
 *  - Server over --max-mb, or free RAM under --min-free-mb while the server is big: stop the whole tree and restart.
 *  - Server exits (crash, or Next's one-off "upgrade" notice): restart.
 *  - Free disk under --warn-disk-gb: warn. Under --min-disk-gb: stop the server, delete `.next/dev` (Turbopack's
 *    rebuildable cache, which grew to several GB in a few hours of page loads on 2026-10-26) and restart.
 * Windows only (wmic/taskkill). Usage:
 *   node tools/dev/dev-watchdog.mjs [--port 3107] [--max-mb 6000] [--min-free-mb 1000] [--heap-mb 3072] [--warn-disk-gb 8] [--min-disk-gb 3]
 */
import { spawn, execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : dflt; };
const PORT = arg("port", 3107), MAX_MB = arg("max-mb", 6000), MIN_FREE_MB = arg("min-free-mb", 1000), HEAP_MB = arg("heap-mb", 3072);
const WARN_DISK_GB = arg("warn-disk-gb", 8), MIN_DISK_GB = arg("min-disk-gb", 3);
const DRIVE = path.parse(process.cwd()).root.slice(0, 2).toUpperCase(); // e.g. "C:"
const log = (m) => console.log(`[watchdog ${new Date().toISOString().slice(11, 19)}] ${m}`);

let child = null, stopping = false, restarts = 0, lastDiskWarn = 0;

function start() {
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT)], {
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=${HEAP_MB}`.trim() },
  });
  log(`started next dev pid ${child.pid} on :${PORT} (heap cap ${HEAP_MB} MB, restart above ${MAX_MB} MB, free RAM below ${MIN_FREE_MB} MB or ${DRIVE} below ${MIN_DISK_GB} GB)`);
  child.on("exit", (code) => {
    if (stopping) return;
    log(`next dev exited (${code}); restarting in 3 s`);
    setTimeout(start, 3000);
  });
}

function wmicNumber(args) {
  try {
    const out = execFileSync("wmic", args, { encoding: "utf8", windowsHide: true });
    return out.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^\d+$/.test(l)).map(Number);
  } catch { return []; }
}

/** Working set (MB) of next's server processes under this checkout. */
function serverMb() {
  try {
    const out = execFileSync("wmic", ["process", "where", "name='node.exe'", "get", "ProcessId,WorkingSetSize,CommandLine", "/format:csv"], { encoding: "utf8", windowsHide: true, maxBuffer: 8 << 20 });
    let mb = 0;
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("start-server.js") || !line.includes(process.cwd().replace(/\//g, "\\"))) continue;
      const parts = line.split(",");
      mb = Math.max(mb, Math.round(Number(parts[parts.length - 1]) / 1048576));
    }
    return mb;
  } catch { return 0; }
}

const freeDiskGb = () => { const b = wmicNumber(["logicaldisk", "where", `DeviceID='${DRIVE}'`, "get", "FreeSpace"])[0]; return b ? b / 1073741824 : null; };

function stopTree() {
  stopping = true;
  if (child) try { execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); } catch { /* already gone */ }
  child = null;
}

function restart(reason, { clearCache = false } = {}) {
  if (!child) return;
  restarts++;
  log(`restart #${restarts}: ${reason}`);
  stopTree();
  setTimeout(() => {
    if (clearCache) { try { rmSync(".next/dev", { recursive: true, force: true }); log("cleared .next/dev (rebuildable dev cache)"); } catch (e) { log(`could not clear .next/dev: ${e.message}`); } }
    stopping = false; start();
  }, 3000);
}

setInterval(() => {
  if (!child || stopping) return;
  const mb = serverMb();
  const freeMb = Math.round((wmicNumber(["OS", "get", "FreePhysicalMemory"])[0] ?? 0) / 1024);
  const disk = freeDiskGb();
  if (disk !== null && disk < MIN_DISK_GB) return restart(`${DRIVE} has ${disk.toFixed(1)} GB free`, { clearCache: true });
  if (disk !== null && disk < WARN_DISK_GB && Date.now() - lastDiskWarn > 600_000) { lastDiskWarn = Date.now(); log(`WARNING: ${DRIVE} has ${disk.toFixed(1)} GB free — pause captures/builds and clean up`); }
  if (mb > MAX_MB) restart(`server at ${mb} MB`);
  else if (freeMb && freeMb < MIN_FREE_MB && mb > 2500) restart(`free RAM ${freeMb} MB, server at ${mb} MB`);
}, 30_000);

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopTree(); process.exit(0); });
start();
