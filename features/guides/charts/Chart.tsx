"use client";

import { useCallback, useState } from "react";
import type { ChartSpec } from "@/lib/domain";
import { chartGeometry, FRAME, type ChartStroke } from "./geometry";

const STROKE: Record<ChartStroke["kind"], { className: string; width: number; dash?: string; cap?: "round" }> = {
  axis: { className: "stroke-ink", width: 1 },
  guide: { className: "stroke-guide", width: 1, dash: "3 3" },
  curve: { className: "stroke-ink", width: 2, cap: "round" },
  bar: { className: "stroke-ink", width: 4 },
  series: { className: "stroke-ink", width: 2, cap: "round" },
};

/** Measures its column and redraws at that width up to 440, so 12px labels never shrink with the panel. */
function useMeasuredWidth(): [(el: HTMLDivElement | null) => void, number | null] {
  const [width, setWidth] = useState<number | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.min(FRAME.width, Math.floor(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function Chart({ spec, name }: { spec: ChartSpec; name: string }) {
  const [ref, width] = useMeasuredWidth();
  const g = width ? chartGeometry(spec, width) : null;
  return (
    <div ref={ref} className="h-[240px] w-full min-w-0 shrink-0">
      {g && (
        <svg role="img" aria-label={`${name} ${g.description}`} width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`} className="block font-sans text-xs">
          {g.strokes.map((s, i) => {
            const style = STROKE[s.kind];
            return (
              <path
                key={i}
                d={s.d}
                fill="none"
                className={style.className}
                strokeWidth={style.width}
                strokeDasharray={s.dash ?? style.dash}
                strokeLinecap={style.cap}
              />
            );
          })}
          {g.rects.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.width} height={r.height} className="fill-ink" />
          ))}
          {g.dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={3.5} className="fill-ink" />
          ))}
          {g.labels.map((l, i) => (
            <text key={i} x={l.x} y={l.y} textAnchor={l.anchor} className={l.tone === "ink" ? "fill-ink" : "fill-graphite"}>
              {l.text}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
