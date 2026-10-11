import { HardDrive } from "lucide-react";
import type { Db } from "@/lib/workspace/db";
import { untyped } from "@/lib/workspace/db";

type U = { bytes: number; files: number; limit_bytes: number; pct: number; grace_bytes: number };
const fmt = (b: number) => b >= 1073741824 ? `${(b / 1073741824).toFixed(b >= 10737418240 ? 0 : 1)} GB` : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;

/** Storage used vs the plan allowance (release spec §115). Uploads stop at 110%; owners are warned at 80% and 100%. */
export async function StorageUsage({ db, workspaceId }: { db: Db; workspaceId: string }) {
  const { data } = await untyped(db as never).rpc("my_storage_usage", { p_workspace: workspaceId });
  const u = data as U | null; if (!u) return null;
  const pct = Math.min(100, Number(u.pct)), over = u.bytes >= u.limit_bytes;
  const tone = over ? "#c4142b" : pct >= 80 ? "#e27a00" : "#0038fd";
  return <section className="k-card st-c" style={{ display: "grid", gap: 10 }} aria-labelledby="stor-h">
    <h2 id="stor-h" style={{ display: "flex", gap: 8, alignItems: "center" }}><HardDrive size={18} aria-hidden="true" />Storage</h2>
    <div role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used" style={{ height: 10, borderRadius: 99, background: "#eef2fb", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: tone }} /></div>
    <p className="k-small" style={{ margin: 0 }}><b>{fmt(u.bytes)}</b> of {fmt(u.limit_bytes)} used · {u.files.toLocaleString("en-GB")} file{u.files === 1 ? "" : "s"} (event media, listing photos, designs, documents and uploads).</p>
    {over ? <p role="alert" style={{ margin: 0, color: "#c4142b", fontWeight: 600 }}>You’ve reached your allowance. Uploads stop at {fmt(u.grace_bytes)} — delete files you no longer need or upgrade your plan.</p>
      : pct >= 80 ? <p style={{ margin: 0, color: "#b45f00", fontWeight: 600 }}>You’ve used {Math.round(pct)}% of your storage.</p> : null}
  </section>;
}
