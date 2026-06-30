"use client";

import { useRef, useState } from "react";
import { isTable, specFor, type FloorPlanElement } from "./lib";

interface DragState {
  id: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  moved: boolean;
}

interface FloorPlanCanvasProps {
  elements: FloorPlanElement[];
  width: number;
  height: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  readOnly?: boolean;
  seatedCountById?: Map<string, number>;
}

const GRID = 10;
const snap = (v: number) => Math.round(v / GRID) * GRID;

export function FloorPlanCanvas({
  elements,
  width,
  height,
  selectedId,
  onSelect,
  onMove,
  readOnly = false,
  seatedCountById,
}: FloorPlanCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  /** Convert a client pointer position into SVG user-space coordinates. */
  function toSvgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const rect = svg.getBoundingClientRect();
    const sx = width / rect.width;
    const sy = height / rect.height;
    return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
  }

  function onPointerDown(e: React.PointerEvent, el: FloorPlanElement) {
    if (readOnly || el.locked) {
      onSelect(el.id);
      return;
    }
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toSvgPoint(e.clientX, e.clientY);
    onSelect(el.id);
    setDrag({
      id: el.id,
      startX: p.x,
      startY: p.y,
      origX: el.x,
      origY: el.y,
      moved: false,
    });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const p = toSvgPoint(e.clientX, e.clientY);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
    const nx = Math.max(0, Math.min(width, snap(drag.origX + dx)));
    const ny = Math.max(0, Math.min(height, snap(drag.origY + dy)));
    if (!drag.moved) setDrag({ ...drag, moved: true });
    onMove(drag.id, nx, ny);
  }

  function onPointerUp() {
    setDrag(null);
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto block touch-none select-none"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerDown={() => !readOnly && onSelect(null)}
      role="img"
      aria-label="Floor plan canvas"
    >
      <defs>
        <pattern id="fp-grid" width={GRID * 5} height={GRID * 5} patternUnits="userSpaceOnUse">
          <path
            d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`}
            fill="none"
            stroke="#ece9f5"
            strokeWidth="1"
          />
        </pattern>
        <pattern id="fp-stripe" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="#475569" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="#334155" strokeWidth="6" />
        </pattern>
      </defs>

      <rect x="0" y="0" width={width} height={height} fill="#faf9fd" />
      {!readOnly && <rect x="0" y="0" width={width} height={height} fill="url(#fp-grid)" />}

      {elements.map((el) => (
        <ElementNode
          key={el.id}
          el={el}
          selected={el.id === selectedId}
          onPointerDown={(e) => onPointerDown(e, el)}
          seated={seatedCountById?.get(el.id) ?? el.guest_ids.length}
        />
      ))}
    </svg>
  );
}

function ElementNode({
  el,
  selected,
  onPointerDown,
  seated,
}: {
  el: FloorPlanElement;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  seated: number;
}) {
  const spec = specFor(el.type);
  const shape = spec?.shape ?? "rect";
  const fill = el.color ?? "#7c5cff";
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const table = isTable(el.type);

  return (
    <g
      transform={`rotate(${el.rotation} ${cx} ${cy})`}
      onPointerDown={onPointerDown}
      style={{ cursor: el.locked ? "not-allowed" : "move" }}
    >
      {shape === "circle" ? (
        <ellipse
          cx={cx}
          cy={cy}
          rx={el.width / 2}
          ry={el.height / 2}
          fill={table ? "#ffffff" : fill}
          stroke={fill}
          strokeWidth={table ? 3 : 1.5}
          opacity={table ? 1 : 0.85}
        />
      ) : (
        <rect
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          rx={table ? 8 : 6}
          fill={el.type === "stage" ? "url(#fp-stripe)" : table ? "#ffffff" : fill}
          stroke={fill}
          strokeWidth={table ? 3 : 1.5}
          opacity={table || el.type === "stage" ? 1 : 0.85}
        />
      )}

      {/* Label */}
      <text
        x={cx}
        y={cy + (table ? 0 : 4)}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={table ? 13 : 12}
        fontWeight={600}
        fill={table || el.type === "text-label" ? "#1e1b2e" : "#ffffff"}
        style={{ pointerEvents: "none" }}
      >
        {el.label}
      </text>

      {/* Seated pill for tables */}
      {table && el.capacity !== null && (
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          fontSize={10}
          fontWeight={600}
          fill={seated >= (el.capacity ?? 0) && el.capacity ? "#16a34a" : "#8b85a3"}
          style={{ pointerEvents: "none" }}
        >
          {seated}/{el.capacity}
        </text>
      )}

      {/* Selection outline */}
      {selected && (
        <rect
          x={el.x - 4}
          y={el.y - 4}
          width={el.width + 8}
          height={el.height + 8}
          rx={10}
          fill="none"
          stroke="#7c5cff"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          style={{ pointerEvents: "none" }}
        />
      )}

      {el.locked && (
        <circle cx={el.x + el.width - 6} cy={el.y + 6} r={4} fill="#94a3b8" style={{ pointerEvents: "none" }} />
      )}
    </g>
  );
}
