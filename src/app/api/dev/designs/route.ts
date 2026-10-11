import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const DIRS = ["customer & Organizer workspace", "platform shell", "ticket checkout"];
/** Dev-only: lists design references for the overlay tool. Disabled in production. */
export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const name = new URL(req.url).searchParams.get("file");
  if (name) {
    const [dir, file] = name.split("/");
    if (!dir || !file || !DIRS.includes(dir) || file.includes("..") || !/\.(png|jpe?g)$/i.test(file)) return NextResponse.json({ error: "Bad file" }, { status: 400 });
    const buf = await fs.readFile(path.join(process.cwd(), "Designs", dir, file)).catch(() => null);
    if (!buf) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(buf), { headers: { "content-type": file.toLowerCase().endsWith("png") ? "image/png" : "image/jpeg", "cache-control": "no-store" } });
  }
  const out: string[] = [];
  for (const d of DIRS) for (const f of await fs.readdir(path.join(process.cwd(), "Designs", d)).catch(() => [] as string[])) if (/\.(png|jpe?g)$/i.test(f)) out.push(`${d}/${f}`);
  return NextResponse.json({ files: out.sort() });
}
