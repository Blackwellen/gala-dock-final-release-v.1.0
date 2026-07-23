"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Search, Undo2, ZoomIn, ZoomOut, Maximize2, Save, Send, Sparkles, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { nodesByCategory, type AutomationNode } from "@/lib/automations/nodes";
import { AutomationNodeCard, type AutomationNodeData } from "./CustomNode";
import { createDraftAutomation, saveAutomationDraft, publishAutomationForReview } from "../../actions";

type CanvasNode = Node<AutomationNodeData>;

const nodeTypes: NodeTypes = { automationNode: AutomationNodeCard };

const CATEGORY_GROUPS: Record<string, string[]> = {
  Core: ["Triggers", "Conditions", "Branch"],
  Operations: ["Action", "Approval", "Lookup", "Delay"],
  Communications: ["Communication"],
  Finance: ["Payment"],
  AI: ["AI"],
  Utilities: ["Utility", "Integration", "Webhook", "Error Handling", "End"],
};

function definitionToFlow(definition: { nodes: unknown[]; edges: unknown[] }): { nodes: CanvasNode[]; edges: Edge[] } {
  const nodes = Array.isArray(definition?.nodes)
    ? (definition.nodes as CanvasNode[]).filter((n) => n && n.id && n.position)
    : [];
  const edges = Array.isArray(definition?.edges) ? (definition.edges as Edge[]).filter((e) => e && e.id) : [];
  return { nodes, edges };
}

let idCounter = 1;
function nextId() {
  idCounter += 1;
  return `n_${Date.now().toString(36)}_${idCounter}`;
}

export function BuilderClient({
  automationId,
  initialName,
  initialStatus,
  initialVersion,
  initialDefinition,
}: {
  automationId: string | null;
  initialName: string;
  initialStatus: string;
  initialVersion: number;
  initialDefinition: { nodes: unknown[]; edges: unknown[] };
}) {
  const initial = useMemo(() => definitionToFlow(initialDefinition), [initialDefinition]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [name, setName] = useState(initialName);
  const [status] = useState(initialStatus);
  const [mode, setMode] = useState<"visual" | "json" | "code">("visual");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [lowerTab, setLowerTab] = useState<"dryrun" | "steps" | "validation" | "logs" | "outputs">("dryrun");
  const [testEvent, setTestEvent] = useState('{\n  "trigger_type": "record.created",\n  "record": {\n    "id": "demo_001"\n  }\n}');
  const [dryRunResult, setDryRunResult] = useState<{ step: string; kind: string; status: string }[] | null>(null);
  const [savedId, setSavedId] = useState(automationId);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const filteredCategories = useMemo(() => {
    const groups = nodesByCategory();
    const cats = category === "All" ? Object.keys(groups) : CATEGORY_GROUPS[category] ?? [];
    const out: Record<string, AutomationNode[]> = {};
    for (const catName of cats) {
      const items = (groups[catName] ?? []).filter((n) => !search || n.label.toLowerCase().includes(search.toLowerCase()));
      if (items.length) out[catName] = items;
    }
    return out;
  }, [category, search]);

  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    const hasTrigger = nodes.some((n) => n.data.kind === "trigger");
    if (!hasTrigger) errs.push("Workflow has no trigger node.");
    const connectedIds = new Set<string>();
    for (const e of edges) {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    }
    const orphans = nodes.filter((n) => nodes.length > 1 && !connectedIds.has(n.id));
    if (orphans.length) errs.push(`${orphans.length} node(s) not connected to the workflow.`);
    return errs;
  }, [nodes, edges]);

  const onConnect = useCallback((connection: Connection) => setEdges((eds) => addEdge({ ...connection, id: `e_${connection.source}_${connection.target}_${Date.now()}` }, eds)), [setEdges]);

  const onDragStart = (e: React.DragEvent, node: AutomationNode) => {
    e.dataTransfer.setData("application/gala-node", JSON.stringify(node));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <ReactFlowProvider>
      <BuilderInner
        {...{
          nodes, setNodes, onNodesChange, edges, setEdges, onEdgesChange, onConnect,
          name, setName, status, mode, setMode, selectedNode, selectedNodeId, setSelectedNodeId,
          search, setSearch, category, setCategory, filteredCategories, onDragStart,
          lowerTab, setLowerTab, testEvent, setTestEvent, dryRunResult, setDryRunResult,
          validationErrors, wrapperRef, automationId: savedId, setSavedId, initialVersion,
          isPending, startTransition, toast, setToast, router,
        }}
      />
    </ReactFlowProvider>
  );
}

interface InnerProps {
  nodes: CanvasNode[];
  setNodes: (updater: (nds: CanvasNode[]) => CanvasNode[]) => void;
  onNodesChange: ReturnType<typeof useNodesState<CanvasNode>>[2];
  edges: Edge[];
  setEdges: (updater: (eds: Edge[]) => Edge[]) => void;
  onEdgesChange: ReturnType<typeof useEdgesState<Edge>>[2];
  onConnect: (c: Connection) => void;
  name: string;
  setName: (v: string) => void;
  status: string;
  mode: "visual" | "json" | "code";
  setMode: (m: "visual" | "json" | "code") => void;
  selectedNode: CanvasNode | null;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  search: string;
  setSearch: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  filteredCategories: Record<string, AutomationNode[]>;
  onDragStart: (e: React.DragEvent, node: AutomationNode) => void;
  lowerTab: "dryrun" | "steps" | "validation" | "logs" | "outputs";
  setLowerTab: (t: "dryrun" | "steps" | "validation" | "logs" | "outputs") => void;
  testEvent: string;
  setTestEvent: (v: string) => void;
  dryRunResult: { step: string; kind: string; status: string }[] | null;
  setDryRunResult: (r: { step: string; kind: string; status: string }[] | null) => void;
  validationErrors: string[];
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  automationId: string | null;
  setSavedId: (id: string) => void;
  initialVersion: number;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  toast: string | null;
  setToast: (t: string | null) => void;
  router: ReturnType<typeof useRouter>;
}

function BuilderInner(props: InnerProps) {
  const {
    nodes, setNodes, onNodesChange, edges, onEdgesChange, onConnect,
    name, setName, status, mode, setMode, selectedNode, selectedNodeId, setSelectedNodeId,
    search, setSearch, category, setCategory, filteredCategories, onDragStart,
    lowerTab, setLowerTab, testEvent, setTestEvent, dryRunResult, setDryRunResult,
    validationErrors, wrapperRef, automationId, setSavedId, initialVersion,
    isPending, startTransition, toast, setToast, router,
  } = props;
  const { screenToFlowPosition, zoomIn, zoomOut, fitView, getZoom } = useReactFlow();
  const [inspectorTab, setInspectorTab] = useState<"settings" | "inputs" | "json" | "test">("settings");
  const [fullscreen, setFullscreen] = useState(false);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/gala-node");
      if (!raw) return;
      const nodeDef: AutomationNode = JSON.parse(raw);
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = nextId();
      const newNode: CanvasNode = {
        id,
        type: "automationNode",
        position,
        data: {
          nodeId: nodeDef.id,
          label: nodeDef.label,
          kind: nodeDef.kind,
          category: nodeDef.category,
          risk: nodeDef.risk,
          approvalRequired: nodeDef.approvalRequired,
          autoRunBlocked: nodeDef.autoRunBlocked,
          description: nodeDef.description,
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(id);
    },
    [screenToFlowPosition, setNodes, setSelectedNodeId]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const definition = useMemo(
    () => ({
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
    }),
    [nodes, edges]
  );

  async function ensureAutomationId(): Promise<string | null> {
    if (automationId) return automationId;
    const res = await createDraftAutomation(name);
    if (!res.ok || !res.automationId) {
      setToast(res.error ?? "Could not create automation");
      return null;
    }
    setSavedId(res.automationId);
    router.replace(`/event-manager/automations/builder/${res.automationId}`);
    return res.automationId;
  }

  function handleSaveDraft() {
    startTransition(async () => {
      const id = await ensureAutomationId();
      if (!id) return;
      const res = await saveAutomationDraft(id, definition);
      setToast(res.ok ? "Draft saved" : res.error ?? "Save failed");
    });
  }

  function handlePublish() {
    if (validationErrors.length > 0) {
      setToast("Fix validation errors before publishing for review.");
      setLowerTab("validation");
      return;
    }
    startTransition(async () => {
      const id = await ensureAutomationId();
      if (!id) return;
      const res = await publishAutomationForReview(id, definition, "Updated via Canvas Builder");
      setToast(res.ok ? "Submitted for review" : res.error ?? "Publish failed");
    });
  }

  function runDryRun() {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(testEvent);
    } catch {
      setToast("Test event JSON is invalid");
      return;
    }
    const triggers = nodes.filter((n) => n.data.kind === "trigger");
    if (triggers.length === 0) {
      setDryRunResult([]);
      setToast("Add a trigger node before running a dry-run.");
      return;
    }
    // Simple linear walk following outgoing edges from the first trigger — a
    // read-only client-side simulation, no real records are affected.
    const order: CanvasNode[] = [];
    const visited = new Set<string>();
    let current: CanvasNode | undefined = triggers[0];
    while (current && !visited.has(current.id)) {
      order.push(current);
      visited.add(current.id);
      const nextEdge = edges.find((e) => e.source === current!.id);
      current = nodes.find((n) => n.id === nextEdge?.target);
    }
    setDryRunResult(
      order.map((n) => ({ step: n.data.label, kind: n.data.kind, status: n.data.autoRunBlocked ? "blocked (manual only)" : "would run" }))
    );
    setLowerTab("steps");
    void parsed;
  }

  return (
    <div className={cn("flex-1 flex flex-col min-h-0 bg-surface-50", fullscreen && "fixed inset-0 z-50 bg-white")}>
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-surface-200 bg-white">
        <Link href="/event-manager/automations/my-automations" className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-sm font-semibold text-surface-900 bg-transparent border-none outline-none focus:ring-1 focus:ring-brand-200 rounded px-1 min-w-[160px]"
        />
        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium capitalize", status === "active" ? "bg-success-50 text-success-700" : "bg-surface-100 text-surface-500")}>
          {status.replace("_", " ")}
        </span>
        <span className="text-xs text-surface-400">v{initialVersion}.0.0</span>
        <div className="flex-1" />
        <button onClick={() => fitView()} className="p-1.5 rounded hover:bg-surface-100 text-surface-500" title="Fit view"><Undo2 className="w-4 h-4 opacity-0" /></button>
        <button onClick={() => zoomOut()} className="p-1.5 rounded hover:bg-surface-100 text-surface-500"><ZoomOut className="w-4 h-4" /></button>
        <span className="text-xs text-surface-500 tabular-nums w-10 text-center">{Math.round(getZoom() * 100)}%</span>
        <button onClick={() => zoomIn()} className="p-1.5 rounded hover:bg-surface-100 text-surface-500"><ZoomIn className="w-4 h-4" /></button>
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-surface-100 ml-2">
          {(["visual", "json", "code"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn("px-2.5 py-1 text-xs font-medium rounded-md capitalize", mode === m ? "bg-white text-surface-900 shadow-sm" : "text-surface-500")}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          onClick={handleSaveDraft}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-surface-200 text-surface-700 rounded-lg hover:bg-surface-50 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> Save draft
        </button>
        <button
          onClick={handlePublish}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" /> Publish for review
        </button>
        <button onClick={() => setFullscreen((f) => !f)} className="p-1.5 rounded hover:bg-surface-100 text-surface-500">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {toast && (
        <div className="shrink-0 px-4 py-1.5 text-xs bg-brand-50 text-brand-700 border-b border-brand-100 flex items-center justify-between">
          {toast}
          <button onClick={() => setToast(null)} className="text-brand-500 hover:text-brand-700">×</button>
        </div>
      )}

      {mode === "visual" && (
        <div className="flex-1 flex min-h-0">
          {/* Node library */}
          <aside className="w-64 shrink-0 border-r border-surface-200 bg-white flex flex-col">
            <div className="p-3 border-b border-surface-100">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-400 mb-2">Node library</p>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-surface-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search nodes..."
                  className="w-full pl-8 pr-2 py-1.5 text-xs border border-surface-200 rounded-lg outline-none focus:ring-1 focus:ring-brand-200"
                />
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {["All", ...Object.keys(CATEGORY_GROUPS)].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={cn("px-2 py-1 text-[11px] font-medium rounded-md", category === c ? "bg-brand-50 text-brand-700" : "text-surface-500 hover:bg-surface-100")}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {Object.entries(filteredCategories).map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-400 mb-1.5">
                    {cat} <span className="text-surface-300">({items.length})</span>
                  </p>
                  <div className="space-y-1">
                    {items.map((n) => (
                      <div
                        key={n.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, n)}
                        className="px-2.5 py-2 rounded-lg border border-surface-200 bg-white text-xs cursor-grab hover:border-brand-300 hover:bg-brand-50/40 transition-colors"
                      >
                        <p className="font-medium text-surface-800">{n.label}</p>
                        {n.description && <p className="text-[10px] text-surface-400 mt-0.5 line-clamp-1">{n.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* Canvas */}
          <div ref={wrapperRef} className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              onNodeClick={(_, n) => setSelectedNodeId(n.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} color="#e5e7eb" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable className="!bg-white !border !border-surface-200" nodeColor={() => "#c4b5fd"} />
            </ReactFlow>
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center max-w-xs">
                  <Sparkles className="w-8 h-8 text-brand-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-surface-600">Drag a trigger from the library to start</p>
                  <p className="text-xs text-surface-400 mt-1">Every workflow needs one trigger node.</p>
                </div>
              </div>
            )}
          </div>

          {/* Inspector */}
          <aside className="w-72 shrink-0 border-l border-surface-200 bg-white flex flex-col">
            <div className="flex items-center gap-1 p-1 border-b border-surface-100">
              {(["settings", "inputs", "json", "test"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setInspectorTab(t)}
                  className={cn("flex-1 px-2 py-1.5 text-[11px] font-medium rounded-md capitalize", inspectorTab === t ? "bg-surface-100 text-surface-900" : "text-surface-400")}
                >
                  {t === "json" ? "JSON" : t}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!selectedNode ? (
                <div className="text-center py-10">
                  <div className="w-10 h-10 rounded-lg bg-surface-100 mx-auto mb-3 flex items-center justify-center">
                    <Search className="w-4 h-4 text-surface-400" />
                  </div>
                  <p className="text-sm font-medium text-surface-700">Select a node</p>
                  <p className="text-xs text-surface-400 mt-1">Click any node on the canvas to inspect and configure it here.</p>
                </div>
              ) : inspectorTab === "json" ? (
                <pre className="text-[11px] bg-surface-50 border border-surface-200 rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(selectedNode.data, null, 2)}
                </pre>
              ) : inspectorTab === "settings" ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-surface-400">Label</label>
                    <input
                      value={selectedNode.data.label}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNodes((nds) => nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, label: value } } : n)));
                      }}
                      className="w-full mt-1 px-2.5 py-1.5 text-sm border border-surface-200 rounded-lg outline-none focus:ring-1 focus:ring-brand-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-surface-400">Kind</label>
                    <p className="text-sm text-surface-700 mt-1 capitalize">{selectedNode.data.kind}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-surface-400">Risk</label>
                    <p className="text-sm text-surface-700 mt-1 capitalize">{selectedNode.data.risk}</p>
                  </div>
                  {selectedNode.data.approvalRequired && (
                    <p className="text-xs text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-2.5 py-2">Requires human approval before this step can run.</p>
                  )}
                  {selectedNode.data.autoRunBlocked && (
                    <p className="text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-2.5 py-2">Blocked from auto-run — must be triggered manually.</p>
                  )}
                  <button
                    onClick={() => {
                      setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
                      setSelectedNodeId(null);
                    }}
                    className="w-full mt-4 px-3 py-1.5 text-xs font-semibold text-danger-600 border border-danger-200 rounded-lg hover:bg-danger-50"
                  >
                    Remove node
                  </button>
                </div>
              ) : inspectorTab === "inputs" ? (
                <p className="text-xs text-surface-400">This node has no configurable input mapping yet in this release.</p>
              ) : (
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-surface-400">Sample test data for this node</label>
                  <textarea readOnly value={JSON.stringify({ nodeId: selectedNode.data.nodeId, label: selectedNode.data.label }, null, 2)} className="w-full h-32 text-[11px] font-mono border border-surface-200 rounded-lg p-2 bg-surface-50" />
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {mode === "json" && (
        <div className="flex-1 overflow-y-auto p-6">
          <pre className="text-xs bg-surface-900 text-surface-100 rounded-xl p-4 overflow-x-auto max-w-4xl mx-auto">{JSON.stringify(definition, null, 2)}</pre>
        </div>
      )}

      {mode === "code" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto rounded-xl border border-surface-200 bg-white p-5">
            <p className="text-sm font-semibold text-surface-900 mb-2">Compiled trigger → action summary</p>
            <p className="text-xs text-surface-500 mb-4">Read-only view of how this canvas compiles to the live automation engine.</p>
            <ol className="space-y-2 text-sm">
              {nodes.map((n, i) => (
                <li key={n.id} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-surface-100 text-surface-500 text-[10px] font-semibold flex items-center justify-center">{i + 1}</span>
                  <span className="font-medium text-surface-800">{n.data.label}</span>
                  <span className="text-surface-400 text-xs">({n.data.kind})</span>
                </li>
              ))}
              {nodes.length === 0 && <p className="text-xs text-surface-400">No nodes yet.</p>}
            </ol>
          </div>
        </div>
      )}

      {/* Lower testing panel */}
      {mode === "visual" && (
        <div className="shrink-0 border-t border-surface-200 bg-white" style={{ height: 220 }}>
          <div className="flex items-center gap-1 px-3 pt-2 border-b border-surface-100">
            {([
              { id: "dryrun" as const, label: "Dry-run Preview" },
              { id: "steps" as const, label: "Execution Steps" },
              { id: "validation" as const, label: `Validation${validationErrors.length ? ` (${validationErrors.length})` : ""}` },
              { id: "logs" as const, label: "Logs" },
              { id: "outputs" as const, label: "Outputs" },
            ]).map((t) => (
              <button
                key={t.id}
                onClick={() => setLowerTab(t.id)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium border-b-2 -mb-px",
                  lowerTab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-surface-500",
                  t.id === "validation" && validationErrors.length > 0 && lowerTab !== t.id && "text-danger-600"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-3 h-[calc(100%-38px)] overflow-y-auto">
            {lowerTab === "dryrun" && (
              <div className="flex gap-3 h-full">
                <div className="flex-1 flex flex-col">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-400 mb-1">Test event</p>
                  <textarea
                    value={testEvent}
                    onChange={(e) => setTestEvent(e.target.value)}
                    className="flex-1 text-[11px] font-mono border border-surface-200 rounded-lg p-2 outline-none focus:ring-1 focus:ring-brand-200"
                  />
                </div>
                <div className="flex flex-col items-center justify-center gap-2 px-4">
                  <button onClick={runDryRun} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700">
                    <Play className="w-3.5 h-3.5" /> Run dry-run
                  </button>
                  <p className="text-[10px] text-surface-400 text-center max-w-[140px]">Read-only simulation — no real records are affected</p>
                </div>
              </div>
            )}
            {lowerTab === "steps" && (
              <div className="space-y-1.5">
                {!dryRunResult ? (
                  <p className="text-xs text-surface-400">Run a dry-run to see the simulated execution path.</p>
                ) : dryRunResult.length === 0 ? (
                  <p className="text-xs text-surface-400">No steps — add and connect a trigger node first.</p>
                ) : (
                  dryRunResult.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-surface-50">
                      <span className="w-5 h-5 rounded-full bg-white border border-surface-200 text-surface-500 text-[10px] font-semibold flex items-center justify-center">{i + 1}</span>
                      <span className="font-medium text-surface-800">{s.step}</span>
                      <span className="text-surface-400">({s.kind})</span>
                      <span className={cn("ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium", s.status === "would run" ? "bg-success-50 text-success-700" : "bg-danger-50 text-danger-700")}>
                        {s.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
            {lowerTab === "validation" && (
              <div className="space-y-1.5">
                {validationErrors.length === 0 ? (
                  <p className="text-xs text-success-700">No validation issues found.</p>
                ) : (
                  validationErrors.map((e, i) => (
                    <p key={i} className="text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-2.5 py-1.5">{e}</p>
                  ))
                )}
              </div>
            )}
            {lowerTab === "logs" && <p className="text-xs text-surface-400">Logs appear here after this automation has real runs — see Runs &amp; Logs.</p>}
            {lowerTab === "outputs" && <p className="text-xs text-surface-400">Node outputs appear here after a dry-run or a real execution.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
