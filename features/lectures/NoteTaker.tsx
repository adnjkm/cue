"use client";

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { errorCopy } from "@/lib/ai";
import { useChat, threadKey, type ChatHandle } from "@/lib/chat";
import type { CalendarEvent, EngineId, EpochMs, Lecture, RelatedLink, Segment } from "@/lib/domain";
import { lectureElapsedMs } from "@/lib/domain";
import { setPrefs } from "@/lib/prefs";
import { fmtStamp } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { SectionLabel, TimerBar, TranscriptLine } from "@/components/cue";
import { ChatThread, Composer } from "@/components/cue/chat";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { chooseEngine, type EngineChoice } from "./engine";
import { PARAKEET_WEIGHTS } from "./engine/protocol";
import { lectureTitle, orderLinks, slotText, spokenDuration } from "./format";
import { Columns, composerClass, NoteLine, NoticeRow, RelatedList, revealFlag, StatusPill, Toolbar, TranscriptRow, useStickToEnd, type StatusKind } from "./parts";
import { recorder, useRecorder, type RecorderState } from "./recorder";
import { tid } from "./testids";

type View =
  | { kind: "ready" }
  | { kind: "starting" }
  | { kind: "preparing"; loadedBytes: number; totalBytes: number }
  | { kind: "recording" }
  | { kind: "pausing" }
  | { kind: "paused" }
  | { kind: "interrupted" }
  | { kind: "saving" }
  | { kind: "failed"; reason: Extract<RecorderState["phase"], { kind: "failed" }>["reason"] };

/** The recorder speaks for the lecture it runs; otherwise the stored state decides. A stored `recording` with no recorder attached is a closed tab. */
function viewOf(lecture: Lecture, rec: RecorderState): View {
  if (rec.lectureId === lecture.id) {
    const p = rec.phase;
    if (p.kind === "stopping") return p.to === "saved" ? { kind: "saving" } : { kind: "pausing" };
    if (p.kind === "starting") return { kind: "starting" };
    if (p.kind === "preparing") return { kind: "preparing", loadedBytes: p.loadedBytes, totalBytes: p.totalBytes };
    if (p.kind === "running") return { kind: "recording" };
    if (p.kind === "failed") return { kind: "failed", reason: p.reason };
  }
  switch (lecture.state.status) {
    case "recording":
      return { kind: "interrupted" };
    case "paused":
      return { kind: "paused" };
    default:
      return { kind: "ready" };
  }
}

const STATUS: Record<View["kind"], [StatusKind, string]> = {
  ready: ["ring", "Ready"],
  starting: ["ring", "Starting…"],
  preparing: ["ring", "Loading model"],
  recording: ["recording", "Recording"],
  pausing: ["recording", "Recording"],
  paused: ["ring", "Paused"],
  interrupted: ["ring", "Stopped"],
  saving: ["ring", "Saving"],
  failed: ["ring", "Not recording"],
};

function elapsedOf(lecture: Lecture, now: EpochMs, attached: boolean): number {
  const s = lecture.state;
  if (s.status === "recording" && !attached) return s.capturedMs + Math.max(0, s.heartbeatAt - s.since);
  return lectureElapsedMs(lecture, now);
}

/** Lecture time in whole seconds, ticking on the lecture's own second boundaries rather than the wall clock's. */
function useElapsed(lecture: Lecture, attached: boolean): number {
  const read = useCallback(() => Math.floor(elapsedOf(lecture, Date.now() as EpochMs, attached) / 1000) * 1000, [lecture, attached]);
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (lecture.state.status !== "recording" || !attached) return () => {};
      let timer: ReturnType<typeof setTimeout>;
      const tick = () => {
        onChange();
        timer = setTimeout(tick, 1000 - (elapsedOf(lecture, Date.now() as EpochMs, attached) % 1000));
      };
      timer = setTimeout(tick, 1000 - (elapsedOf(lecture, Date.now() as EpochMs, attached) % 1000));
      return () => clearTimeout(timer);
    },
    [lecture, attached],
  );
  return useSyncExternalStore(subscribe, read, () => 0);
}

const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

/** The engine line on the ready screen: what will listen, what it costs, and the other choice. */
function EngineNotice({ choice, onChoose }: { choice: EngineChoice; onChoose: (engine: EngineId) => void }) {
  if (choice.engine === "demo") {
    return (
      <NoticeRow
        title="Demo transcript"
        detail={`${choice.why === "sample" ? "The sample semester replays a recorded lecture, so your microphone stays off." : "Cue replays a recorded lecture instead of listening to your microphone."} To transcribe your own lectures, Cue downloads NVIDIA Parakeet once (${mb(PARAKEET_WEIGHTS.webgpu.bytes)}) and runs it on this device.`}
        action={
          <Button variant="secondary" onClick={() => onChoose("parakeet")}>
            Use Parakeet instead
          </Button>
        }
      />
    );
  }
  return (
    <NoticeRow
      title="Cue transcribes on this device with NVIDIA Parakeet."
      detail={
        choice.consented
          ? "Audio never leaves this browser."
          : `The first recording downloads the speech model once (${mb(PARAKEET_WEIGHTS.webgpu.bytes)}, or ${mb(PARAKEET_WEIGHTS.wasm.bytes)} without WebGPU). Audio never leaves this browser.`
      }
      action={
        <Button variant="secondary" onClick={() => onChoose("demo")}>
          Use the demo transcript
        </Button>
      }
    />
  );
}

const FAILURE: Record<Extract<View, { kind: "failed" }>["reason"], { title: string; detail: string; retry: string }> = {
  micDenied: { title: "Cue can't hear your microphone.", detail: "Allow microphone access for this site, then try again.", retry: "Try again" },
  noMic: { title: "No microphone was found.", detail: "Connect a microphone or headset, then try again.", retry: "Try again" },
  noBackend: { title: "This browser can't run the speech model.", detail: "Open Cue in a recent Chrome or Edge, or use the demo transcript.", retry: "Try again" },
  download: { title: "The speech model didn't download.", detail: "Check your connection, then try again. Anything recorded so far is kept.", retry: "Try again" },
  runtime: { title: "Transcription stopped.", detail: "Your audio is saved on this device. Try again to continue where it stopped.", retry: "Try again" },
};

/** Shows only the latest question and its answer above the composer; every exchange is kept for the saved notes. */
function latestExchange(chat: ChatHandle, onSend: () => void): ChatHandle {
  const lastUser = chat.messages.findLastIndex((m) => m.role === "user" && (!chat.pending || m.text === chat.pending.question));
  return {
    ...chat,
    messages: lastUser >= 0 ? chat.messages.slice(lastUser) : [],
    send: (text) => {
      onSend();
      chat.send(text);
    },
  };
}

export function NoteTaker({
  lecture,
  segments,
  links,
  event,
  prefs,
  sampleLoaded,
  focusAtMs,
}: {
  lecture: Lecture;
  segments: readonly Segment[];
  links: readonly RelatedLink[];
  event: CalendarEvent | null;
  prefs: { engine: EngineId; parakeetConsentAt?: EpochMs };
  sampleLoaded: boolean;
  focusAtMs: number | null;
}) {
  const rec = useRecorder();
  const view = viewOf(lecture, rec);
  const attached = rec.lectureId === lecture.id;
  const ticking = view.kind === "recording" || view.kind === "pausing";
  const elapsed = useElapsed(lecture, attached && ticking);
  const wide = useMediaQuery("(min-width: 768px)", true);
  const twoColumns = useMediaQuery("(min-width: 1024px)", true);
  const choice = chooseEngine(prefs, sampleLoaded);
  const resumeEngine = lecture.state.status === "paused" || lecture.state.status === "recording" ? lecture.state.engine : null;

  const chat = useChat({ thread: threadKey.lecture(lecture.id), scope: { kind: "liveLecture", lectureId: lecture.id, windowMs: 5 * 60_000 } });
  const [showAnswer, setShowAnswer] = useState(false);
  const answerChat = latestExchange(chat, () => setShowAnswer(true));

  const root = useRef<HTMLDivElement>(null);
  const answer = useRef<HTMLDivElement>(null);
  const { ref: listRef, stuck, onScroll: onListScroll, toEnd, hold } = useStickToEnd<HTMLOListElement>();
  const flagButtons = useRef(new Map<number, HTMLButtonElement>());
  const [rovingSeq, setRovingSeq] = useState<number | null>(null);
  const ordered = useMemo(() => [...segments].sort((a, b) => a.atMs - b.atMs || a.seq - b.seq), [segments]);
  const activeSeq = rovingSeq ?? ordered.at(-1)?.seq ?? null;
  const partial = attached && rec.partial ? rec.partial : null;

  useEffect(() => root.current?.focus({ preventScroll: true }), []);

  useLayoutEffect(() => {
    if (stuck) toEnd();
  });

  useEffect(() => {
    // The shared Composer takes no textarea attributes yet (lectures-6); `/` focuses it from anywhere on the screen.
    root.current?.querySelector("form textarea")?.setAttribute("aria-keyshortcuts", "/");
  });

  useEffect(() => {
    if (focusAtMs === null) return;
    const target = [...ordered].reverse().find((s) => s.atMs <= focusAtMs + 999);
    const line = flagButtons.current.get(target?.seq ?? -1)?.closest("li");
    if (!line) return;
    hold();
    line.scrollIntoView({ block: "center" });
    // Only on arrival: later lines must not pull the reader back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    const engine = resumeEngine ?? choice.engine;
    if (engine === "parakeet" && prefs.parakeetConsentAt === undefined) await setPrefs("lectures", { engine: "parakeet", parakeetConsentAt: Date.now() as EpochMs });
    await recorder.start(lecture.id, engine);
  }

  function choose(engine: EngineId) {
    void setPrefs("lectures", engine === "demo" ? { engine } : { engine, parakeetConsentAt: Date.now() as EpochMs });
  }

  const togglePause = () => {
    if (view.kind === "recording") void recorder.pause();
    else if (view.kind === "paused" || view.kind === "interrupted") void start();
  };
  const endAndSave = () => void recorder.end(lecture.id);

  function moveRow(e: React.KeyboardEvent<HTMLButtonElement>, seq: number) {
    const i = ordered.findIndex((s) => s.seq === seq);
    const next = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : e.key === "Home" ? 0 : e.key === "End" ? ordered.length - 1 : null;
    if (next === null || !ordered[next]) return;
    e.preventDefault();
    setRovingSeq(ordered[next].seq);
    flagButtons.current.get(ordered[next].seq)?.focus();
  }

  const composerBox = () => root.current?.querySelector<HTMLTextAreaElement>("form textarea");

  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || e.repeat) return;
    const target = e.target as HTMLElement;
    if (document.querySelector('[role="dialog"], [role="alertdialog"]') || target.closest("[role=listbox], [role=menu]")) return;
    const editing = target.closest("input, textarea, select, [contenteditable]");
    if (e.key === "Escape") {
      if (showAnswer) {
        if (answer.current?.contains(document.activeElement)) composerBox()?.focus();
        setShowAnswer(false);
      } else if (editing && root.current?.contains(editing)) root.current.focus({ preventScroll: true });
      return;
    }
    if (editing) return;
    const key = e.key.toLowerCase();
    if (key === "p") togglePause();
    else if (key === "j") toEnd("smooth");
    else if (key === "/") composerBox()?.focus();
    else if (key === "f") {
      const focused = ordered.find((s) => flagButtons.current.get(s.seq) === document.activeElement) ?? ordered.at(-1);
      if (focused) void recorder.toggleFlag(focused);
    } else return;
    e.preventDefault();
  });

  useEffect(() => {
    // Listens on the window, not the screen, because focus falls to body whenever its element goes away (a closing answer, a disabled button).
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const [statusKind, statusLabel] = STATUS[view.kind];
  const canPause = view.kind === "recording" || view.kind === "paused" || view.kind === "interrupted";
  const hasCapture = elapsed > 0 || segments.length > 0;
  const showEnd = view.kind !== "ready" && !(view.kind === "failed" && !hasCapture);
  const liveLinks = orderLinks(links, "live");
  const transcribing = rec.backend === "wasm" && attached ? (rec.backlog > 0 ? `Transcribing late · ${rec.backlog} waiting` : "Transcribing late, without WebGPU") : null;

  const slot = event ? `Scheduled ${slotText(event)}` : null;
  const time = (
    <>
      <TimerBar
        fraction={lecture.scheduledMs ? Math.min(1, elapsed / lecture.scheduledMs) : 0}
        label="Lecture time"
        valueText={`${spokenDuration(elapsed)} of ${spokenDuration(lecture.scheduledMs)}`}
        className="max-lg:hidden"
      />
      <span className="w-max text-sm leading-4 text-graphite tabular-nums">{wide ? `${fmtStamp(elapsed)} of ${fmtStamp(lecture.scheduledMs)}` : fmtStamp(elapsed)}</span>
    </>
  );
  const controls = (
    <>
      <StatusPill kind={statusKind} label={statusLabel} />
      {view.kind !== "ready" &&
        (slot ? (
          <Tooltip>
            <TooltipTrigger render={<div role="group" tabIndex={0} aria-label={slot} className="flex items-center gap-3 rounded-xs" />}>{time}</TooltipTrigger>
            <TooltipContent>{slot}</TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-3">{time}</div>
        ))}
      <div className="flex items-center gap-3 max-md:ml-auto">
        {view.kind === "ready" || view.kind === "failed" ? (
          <Button
            onClick={() => {
              if (view.kind === "failed") recorder.reset();
              void start();
            }}
            variant={showEnd ? "secondary" : "default"}
          >
            {view.kind === "failed" ? FAILURE[view.reason].retry : "Start recording"}
          </Button>
        ) : (
          <Button variant="secondary" aria-keyshortcuts="p" disabled={!canPause} focusableWhenDisabled onClick={togglePause}>
            {view.kind === "paused" || view.kind === "interrupted" ? "Resume" : "Pause"}
          </Button>
        )}
        {showEnd && (
          <Button disabled={view.kind === "saving" || view.kind === "starting" || view.kind === "preparing" || view.kind === "pausing"} onClick={endAndSave}>
            {view.kind === "saving" ? "Saving…" : wide ? "End and save notes" : "End and save"}
          </Button>
        )}
      </div>
    </>
  );

  let liveRow: React.ReactNode = null;
  if (view.kind === "recording" || view.kind === "starting" || view.kind === "pausing") {
    const text = partial?.text ? `…${partial.text}` : rec.backend === "wasm" && attached ? "Listening… each line appears once its 15 seconds of audio are transcribed." : "Listening…";
    liveRow = <TranscriptLine atMs={partial?.atMs ?? elapsed} text={text} state="live" className="max-md:gap-3 max-md:px-3" />;
  } else if (view.kind === "preparing") {
    liveRow = <NoteLine>{view.totalBytes ? `Downloading the speech model · ${mb(view.loadedBytes)} of ${mb(view.totalBytes)}` : "Loading the speech model…"}</NoteLine>;
  } else if (view.kind === "paused") {
    liveRow = <NoteLine>Paused at {fmtStamp(elapsed)}</NoteLine>;
  } else if (view.kind === "saving") {
    liveRow = <NoteLine>Finishing the last lines…</NoteLine>;
  } else if (view.kind === "interrupted") {
    liveRow = <NoticeRow title={`Recording stopped at ${fmtStamp(elapsed)} when this page closed.`} detail="Resume to keep recording, or end and save the notes." />;
  } else if (view.kind === "failed") {
    const f = FAILURE[view.reason];
    liveRow = (
      <NoticeRow
        title={f.title}
        detail={f.detail}
        action={
          view.reason === "noBackend" ? (
            <Button
              variant="secondary"
              onClick={() => {
                recorder.reset();
                choose("demo");
              }}
            >
              Use the demo transcript
            </Button>
          ) : undefined
        }
      />
    );
  } else if (view.kind === "ready") {
    liveRow = <EngineNotice choice={choice} onChoose={choose} />;
  }

  const transcript = (
    <section aria-labelledby="live-transcript-label" className="relative flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-3">
      {twoColumns || transcribing ? (
        <div className="flex h-7 shrink-0 items-center justify-between gap-3 px-4 max-md:px-3">
          <SectionLabel id="live-transcript-label" className={cn(!twoColumns && "sr-only")}>
            Live transcript
          </SectionLabel>
          {transcribing && <span className="truncate text-sm leading-4 text-graphite">{transcribing}</span>}
        </div>
      ) : (
        <h2 id="live-transcript-label" className="sr-only">
          Live transcript
        </h2>
      )}
      <ol
        ref={listRef}
        onScroll={onListScroll}
        onClick={(e) => {
          const seq = revealFlag(e, flagButtons.current);
          if (seq !== null) setRovingSeq(seq);
        }}
        role="log"
        aria-labelledby="live-transcript-label"
        aria-live="off"
        className="flex min-h-0 shrink flex-col gap-1.5 overflow-y-auto overscroll-contain max-h-[max(240px,calc(100%-434px))] max-lg:max-h-none max-lg:flex-1"
      >
        {ordered.map((s) => (
          <TranscriptRow
            key={s.seq}
            segment={s}
            labelStyle="live"
            onToggleFlag={(seg) => void recorder.toggleFlag(seg)}
            focusable={s.seq === activeSeq}
            onRowKey={(e) => moveRow(e, s.seq)}
            buttonRef={(el) => {
              if (el) flagButtons.current.set(s.seq, el);
              else flagButtons.current.delete(s.seq);
            }}
          />
        ))}
        {liveRow}
      </ol>
      {showAnswer && (chat.messages.length > 0 || chat.pending || chat.error) && (
        <div ref={answer} className="max-h-80 shrink-0 overflow-y-auto px-4 max-md:px-3">
          <ChatThread chat={answerChat} />
        </div>
      )}
      <div className={cn("relative shrink-0", (view.kind === "ready" || (view.kind === "failed" && !hasCapture)) && "hidden")}>
        {!stuck && (view.kind === "recording" || view.kind === "pausing") && (
          <Button variant="secondary" size="sm" aria-keyshortcuts="j" onClick={() => toEnd("smooth")} className="absolute bottom-full left-1/2 mb-2 h-7 -translate-x-1/2 px-3 py-1.5">
            Jump to live
          </Button>
        )}
        <Composer
          chat={answerChat}
          layout="inline"
          label="Ask about the last 5 minutes"
          placeholder={wide ? "Ask about what was just said…" : "Ask about the last 5 minutes…"}
          scopeNote={wide ? "Uses the last 5 minutes" : undefined}
          className={composerClass(answerChat)}
        />
        {rec.aiError && attached && (
          <p role="alert" className="pt-2 text-sm leading-5">
            <span className="text-ink">{errorCopy(rec.aiError).title}</span>{" "}
            <span className="text-graphite">{rec.aiError.kind === "budget" ? "Recording continues. Lines stay as heard and questions pause until the cap is raised." : "Lines stay as heard until Nemotron answers again."}</span>
          </p>
        )}
      </div>
    </section>
  );

  return (
    <div
      ref={root}
      tabIndex={-1}
      data-testid={tid.main}
      className="flex min-h-0 flex-1 flex-col gap-6 px-10 pt-7 pb-8 outline-none max-xl:px-8 max-md:gap-4 max-md:px-4 max-md:pt-4 max-md:pb-[max(16px,env(safe-area-inset-bottom))]"
    >
      <Toolbar title={lectureTitle(lecture)}>{controls}</Toolbar>
      <Columns main={transcript} mainLabel="Transcript" related={<RelatedList links={liveLinks} style="live" />} relatedCount={links.length} />
      <p aria-live="polite" className="sr-only">
        {attached ? rec.announcement : ""}
      </p>
    </div>
  );
}
