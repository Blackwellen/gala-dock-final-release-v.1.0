import { cn } from "@/lib/utils";

interface ResponseSparklineProps {
  points: number[]; // 0-100 scale
  width?: number;
  height?: number;
  className?: string;
  color?: string; // stroke color class
}

/** Tiny inline SVG polyline sparkline for supplier response-rate trend cells. */
export function ResponseSparkline({ points, width = 56, height = 20, className, color = "stroke-brand-500" }: ResponseSparklineProps) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const rising = points[points.length - 1] >= points[0];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("overflow-visible", className)}>
      <polyline
        points={coords.join(" ")}
        fill="none"
        className={rising ? "stroke-success-500" : color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
