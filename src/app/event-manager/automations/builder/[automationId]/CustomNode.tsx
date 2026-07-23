"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { ShieldAlert, CircleCheck } from "lucide-react";
import type { NodeKind } from "@/lib/automations/nodes";

export interface AutomationNodeData {
  nodeId: string;
  label: string;
  kind: NodeKind;
  category: string;
  risk: string;
  approvalRequired?: boolean;
  autoRunBlocked?: boolean;
  description?: string;
  summary?: string;
  [key: string]: unknown;
}

const KIND_STYLES: Record<string, { header: string; badge: string; label: string }> = {
  trigger: { header: "bg-success-500", badge: "bg-success-50 text-success-700", label: "Trigger" },
  condition: { header: "bg-warning-500", badge: "bg-warning-50 text-warning-700", label: "Condition" },
  branch: { header: "bg-warning-500", badge: "bg-warning-50 text-warning-700", label: "Branch" },
  delay: { header: "bg-surface-400", badge: "bg-surface-100 text-surface-600", label: "Delay" },
  lookup: { header: "bg-info-500", badge: "bg-info-50 text-info-700", label: "Lookup" },
  ai: { header: "bg-violet-500", badge: "bg-violet-50 text-violet-700", label: "AI" },
  action: { header: "bg-brand-500", badge: "bg-brand-50 text-brand-700", label: "Action" },
  comm: { header: "bg-brand-500", badge: "bg-brand-50 text-brand-700", label: "Communication" },
  payment: { header: "bg-danger-500", badge: "bg-danger-50 text-danger-700", label: "Payment" },
  approval: { header: "bg-warning-500", badge: "bg-warning-50 text-warning-700", label: "Approval" },
  legal: { header: "bg-danger-500", badge: "bg-danger-50 text-danger-700", label: "Legal" },
  integration: { header: "bg-info-500", badge: "bg-info-50 text-info-700", label: "Integration" },
  webhook: { header: "bg-info-500", badge: "bg-info-50 text-info-700", label: "Webhook" },
  utility: { header: "bg-surface-400", badge: "bg-surface-100 text-surface-600", label: "Utility" },
  error: { header: "bg-danger-500", badge: "bg-danger-50 text-danger-700", label: "Error Handling" },
  end: { header: "bg-surface-700", badge: "bg-surface-100 text-surface-600", label: "End" },
};

export const AutomationNodeCard = memo(function AutomationNodeCard({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AutomationNodeData;
  const style = KIND_STYLES[nodeData.kind] ?? KIND_STYLES.action;
  const isTrigger = nodeData.kind === "trigger";

  return (
    <div
      className={cn(
        "w-56 rounded-lg border bg-white shadow-sm overflow-hidden transition-all",
        selected ? "border-brand-500 ring-2 ring-brand-100" : "border-surface-200"
      )}
    >
      {!isTrigger && <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-surface-400 !border-white" />}
      <div className={cn("px-3 py-1.5 flex items-center justify-between", style.header)}>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white">{style.label}</span>
        {nodeData.approvalRequired && (
          <span title="Requires approval">
            <ShieldAlert className="w-3 h-3 text-white" />
          </span>
        )}
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-semibold text-surface-900 leading-snug">{nodeData.label}</p>
        {nodeData.summary && <p className="text-xs text-surface-500 mt-0.5 leading-snug">{nodeData.summary}</p>}
        <div className="flex items-center gap-1.5 mt-2">
          <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium", style.badge)}>
            <CircleCheck className="w-2.5 h-2.5" /> Ready
          </span>
          {nodeData.autoRunBlocked && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-danger-50 text-danger-700">Manual only</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-surface-400 !border-white" />
    </div>
  );
});
