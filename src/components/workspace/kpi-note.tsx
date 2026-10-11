import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconTile } from "./kit";

/** KPI card with a caption line instead of a delta (e.g. "17% effective rate"). Same frame as Kpi. */
export function KpiNote({ icon, tone = "blue", label, value, note }: { icon: LucideIcon; tone?: Parameters<typeof IconTile>[0]["tone"]; label: string; value: ReactNode; note: ReactNode }) {
  return <div className="ws-kpi"><IconTile icon={icon} tone={tone} size={36} /><div className="ws-kpi-text"><span>{label}</span><strong>{value}</strong><small className="ws-kpi-note">{note}</small></div></div>;
}
