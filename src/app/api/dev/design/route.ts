import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { designMap } from "@/lib/workspace/design-map";

/** Development-only: serves reference design images for the overlay tool. Only files listed in the design map are served. */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") return new NextResponse("Not found", { status: 404 });
  const file = request.nextUrl.searchParams.get("file") ?? "";
  if (!designMap.some(d => d.file === file)) return new NextResponse("Not found", { status: 404 });
  const root = path.join(process.cwd(), "Designs");
  const full = path.resolve(root, file);
  if (!full.startsWith(root + path.sep)) return new NextResponse("Not found", { status: 404 });
  try {
    const bytes = await readFile(full);
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" } });
  } catch { return new NextResponse("Not found", { status: 404 }); }
}
