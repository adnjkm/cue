"use client";

import { useEffect, useMemo, useRef, type KeyboardEvent, type SVGProps } from "react";
import { db, useLive } from "@/lib/db";
import type { Attempt, BlobId, Option, Question, QuestionId, SourceRef, TreeNode } from "@/lib/domain";
import { gradeOf } from "@/lib/domain";
import { sourceLabel, useOpenSource } from "@/lib/sources";
import { cn } from "@/lib/utils";
import { Prose } from "@/components/cue";
import { groupByTopic, ROW_NOTE, rowState, tileState, type TileState } from "./model";
import { tid } from "./testids";

/** Paper's chevron, drawn on a 16 grid: a 5×10 stroke that lucide's 24-grid chevron draws a fifth smaller. */
export function Chevron({ dir, size = 16, stroke = 1.5, ...rest }: { dir: "left" | "right"; size?: number; stroke?: number } & Omit<SVGProps<SVGSVGElement>, "stroke">) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={dir === "left" ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"} />
    </svg>
  );
}

/** A binary tree drawn the way Paper does: 360×200, edges in border gray, ink rings, 13px labels. */
export function TreeFigure({ root, label }: { root: TreeNode; label: string }) {
  const offsets = [84, 48, 26, 14];
  const nodes: { v: string; x: number; y: number }[] = [];
  const edges: [number, number, number, number][] = [];
  const walk = (n: TreeNode, x: number, depth: number) => {
    const y = 26 + depth * 74;
    nodes.push({ v: n.v, x, y });
    const off = offsets[Math.min(depth, offsets.length - 1)];
    for (const [child, dx] of [
      [n.l, -off],
      [n.r, off],
    ] as const) {
      if (!child) continue;
      edges.push([x, y, x + dx, y + 74]);
      walk(child, x + dx, depth + 1);
    }
  };
  walk(root, 180, 0);
  return (
    <svg viewBox="0 0 360 200" width="360" height="200" role="img" aria-label={label} className="h-auto max-w-full">
      {edges.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={1} style={{ stroke: "var(--line)" }} />
      ))}
      {nodes.map((n) => (
        <g key={`${n.v}-${n.x}-${n.y}`}>
          <circle cx={n.x} cy={n.y} r={24} strokeWidth={1} style={{ fill: "var(--page)", stroke: "var(--ink)" }} />
          <text x={n.x} y={n.y + 4.5} textAnchor="middle" fontSize={13} style={{ fill: "var(--ink)" }}>
            {n.v}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function CropFigure({ blob, label }: { blob: BlobId; label: string }) {
  const row = useLive(() => db.blobs.get(blob), [blob]);
  const url = useMemo(() => (row ? URL.createObjectURL(row.blob) : null), [row]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- a local Blob URL, which next/image cannot optimize
  return <img src={url} alt={label} className="block h-auto max-h-[420px] w-auto max-w-full" />;
}

export function OptionRow({
  option,
  index,
  question,
  attempt,
  hint,
  onChoose,
}: {
  option: Option;
  index: number;
  question: Question;
  attempt: Attempt | undefined;
  hint?: string;
  onChoose: (label: string) => void;
}) {
  const state = rowState(gradeOf(question, attempt), option.label, question.key);
  const note = ROW_NOTE[state] ?? (state === "other" ? hint : undefined);
  const strong = state === "correct-choice" || state === "wrong-choice" || state === "correct-answer";
  return (
    <button
      type="button"
      data-state={state}
      disabled={state !== "idle"}
      onClick={() => onChoose(option.label)}
      aria-keyshortcuts={`${index + 1} ${option.label}`}
      className={cn(
        "flex min-h-14 cursor-pointer items-center gap-3 rounded-sm border border-border bg-page px-5 py-2 text-left text-sm leading-4 text-ink transition-colors duration-[120ms] ease-standard enabled:hover:bg-wash enabled:active:bg-fill disabled:cursor-default max-md:grid max-md:grid-cols-[16px_minmax(0,1fr)] max-md:content-center max-md:gap-y-1 max-md:px-4 max-md:py-3",
        (state === "correct-choice" || state === "correct-answer") && "border-ink bg-fill",
        state === "wrong-choice" && "border-dashed border-ink",
        state === "checking" && "border-ink",
      )}
    >
      <span className={cn("w-4 shrink-0 text-graphite", (strong || state === "checking") && "font-medium text-ink")}>{option.label}</span>
      <Prose text={option.text} className={cn("min-w-0 flex-1 gap-1", strong && "font-medium")} codeClassName="px-3 py-2" />
      {note && (
        <span title={note} className={cn("max-w-1/2 min-w-0 truncate text-graphite max-md:col-start-2 max-md:max-w-none max-md:whitespace-normal", strong && "font-medium text-ink")}>
          {note}
        </span>
      )}
    </button>
  );
}

/** A Relevant resources row: title over meta, chevron right. Opens the source over the paper. */
export function ResourceRow({ source }: { source: SourceRef }) {
  const open = useOpenSource();
  const title = source.kind === "page" ? (source.title ?? sourceLabel(source, "chip")) : source.kind === "transcript" ? (source.quote ? `“${source.quote}”` : sourceLabel(source, "chip")) : sourceLabel(source, "chip");
  // sourceLabel gives a section only its title, which the row already shows as its title.
  const meta = source.kind === "section" ? `${source.courseId} study guide` : sourceLabel(source, "meta");
  return (
    <li>
      <button
        type="button"
        onClick={() => open(source)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm border border-border bg-page px-4 py-3 text-left transition-colors duration-[120ms] ease-standard hover:bg-wash"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm leading-4 font-medium text-ink">{title}</span>
          <span className="truncate text-sm leading-4 text-graphite">{meta}</span>
        </span>
        <Chevron dir="right" className="shrink-0 text-graphite" />
      </button>
    </li>
  );
}

const TILE_WORDS: Record<TileState, string> = { current: "current", correct: "correct", missed: "missed", unanswered: "not answered", checking: "checking" };

const FADE = 48;

/** Centres a tile that sits under, or past, the bar's 48px edge fade. Only the bar scrolls, never the page. */
function reveal(scroller: HTMLElement, tile: Element | null) {
  if (!tile) return;
  const t = tile.getBoundingClientRect();
  const s = scroller.getBoundingClientRect();
  if (t.left >= s.left + FADE && t.right <= s.right - FADE) return;
  scroller.scrollLeft += t.left + t.width / 2 - (s.left + s.width / 2);
}

/** Roving focus: one Tab stop for the bar, arrows and Home/End move between tiles. */
function moveFocus(e: KeyboardEvent<HTMLElement>) {
  const keys: Record<string, (i: number, n: number) => number> = {
    ArrowRight: (i, n) => Math.min(n - 1, i + 1),
    ArrowLeft: (i) => Math.max(0, i - 1),
    Home: () => 0,
    End: (_, n) => n - 1,
  };
  const to = keys[e.key];
  if (!to) return;
  const tiles = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-tile]")];
  const i = tiles.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const target = tiles[to(i, tiles.length)];
  target.focus({ preventScroll: true });
  reveal(e.currentTarget, target);
}

/** The bottom bar: every question grouped by topic, with its result. Scrolls sideways with faded edges. */
export function QuestionBar({
  questions,
  current,
  attempts,
  generating,
  generatingTopic,
  onSelect,
}: {
  questions: readonly Question[];
  current: QuestionId | null;
  attempts: ReadonlyMap<QuestionId, Attempt>;
  generating: number;
  generatingTopic: string | null;
  onSelect: (q: Question) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => {
      el.toggleAttribute("data-more-start", el.scrollLeft > 1);
      el.toggleAttribute("data-more-end", el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    update();
    reveal(el, el.querySelector('[aria-current="true"]'));
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [questions, current, generating]);
  const groups = groupByTopic(questions);
  if (generating > 0 && generatingTopic && !groups.some((g) => g.topic === generatingTopic)) groups.push({ topic: generatingTopic, questions: [] });
  const tabStop = questions.some((q) => q.id === current) ? current : questions[0]?.id;
  return (
    <nav aria-label="Questions" data-testid={tid.bar} className="min-w-0 flex-1">
      <div
        ref={scroller}
        onKeyDown={moveFocus}
        className="-m-0.5 flex items-center gap-10 overflow-x-auto p-0.5 [scrollbar-width:none] data-more-end:[mask-image:linear-gradient(to_right,var(--ink)_calc(100%_-_48px),transparent)] data-more-start:[mask-image:linear-gradient(to_left,var(--ink)_calc(100%_-_48px),transparent)] [&[data-more-start][data-more-end]]:[mask-image:linear-gradient(to_right,transparent,var(--ink)_48px,var(--ink)_calc(100%_-_48px),transparent)] max-md:gap-6 [&::-webkit-scrollbar]:hidden"
      >
        {groups.map((g) => (
          <div key={g.topic} role="group" aria-label={g.topic} className="flex shrink-0 items-center gap-3">
            <span aria-hidden="true" className="text-sm leading-4 tracking-caps whitespace-nowrap text-graphite uppercase">
              {g.topic}
            </span>
            <div className="flex gap-1.5">
              {g.questions.map((q) => {
                const state = tileState(q, current, attempts.get(q.id));
                const grade = gradeOf(q, attempts.get(q.id));
                const result = grade.status === "answered" ? (grade.correct ? "correct" : "missed") : null;
                const words = state === "current" ? `current${result ? `, ${result}` : ""}` : TILE_WORDS[state];
                const generated = q.origin.kind === "generated";
                return (
                  <button
                    key={q.id}
                    type="button"
                    data-tile=""
                    data-state={state}
                    tabIndex={q.id === tabStop ? 0 : -1}
                    aria-current={state === "current" ? "true" : undefined}
                    aria-label={`Question ${q.number}, ${words}${generated ? ", written by Cue" : ""}`}
                    onClick={() => onSelect(q)}
                    className={cn(
                      "relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-sm border border-border bg-page text-sm leading-4 text-graphite tabular-nums transition-colors duration-[120ms] ease-standard hover:bg-wash",
                      state === "correct" && "border-transparent bg-fill text-ink hover:border-border hover:bg-fill",
                      state === "missed" && "border-dashed border-ink text-ink",
                      state === "checking" && "border-ink text-ink",
                      state === "current" && "border-ink bg-ink text-page hover:bg-ink",
                    )}
                  >
                    {q.number}
                    {/* 3px inside the 1px border puts the dot 4px from the tile's outer corner, as the spec measures it. */}
                    {generated &&<span aria-hidden="true" className={cn("absolute top-[3px] right-[3px] size-1 rounded-full", state === "current" ? "bg-page" : "bg-graphite")} />}
                  </button>
                );
              })}
              {g.topic === generatingTopic &&
                Array.from({ length: generating }, (_, i) => (
                  <span key={`gen-${i}`} data-state="generating" aria-label="Question being written" role="img" className="size-9 shrink-0 animate-breathe rounded-sm bg-control" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}
