"use client";

import { ArrowUp, Square } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { ChatHandle } from "@/lib/chat";
import type { AskMode } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const MODES: { value: AskMode; label: string; tip: string }[] = [
  { value: "quick", label: "Quick", tip: "Nemotron 3 Ultra, thinking off" },
  { value: "deep", label: "Deep", tip: "Nemotron 3 Ultra, thinking on" },
];

function ModeSwitch({ value, onChange, disabled }: { value: AskMode; onChange: (m: AskMode) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Answer mode" className="flex items-center gap-0.5">
      {MODES.map((m) => (
        <Tooltip key={m.value}>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-pressed={value === m.value}
                disabled={disabled}
                onClick={() => onChange(m.value)}
                className="h-6 cursor-pointer rounded-sm px-2.5 text-sm leading-4 text-graphite transition-colors duration-[120ms] ease-standard hover:text-ink aria-pressed:bg-control aria-pressed:font-medium aria-pressed:text-ink disabled:cursor-default disabled:opacity-40"
              />
            }
          >
            {m.label}
          </TooltipTrigger>
          <TooltipContent>{m.tip}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/**
 * The ask box. `stacked` is Study's (textarea over a footer with the mode switch), `inline` is the note taker's
 * one-row composer with a scope note before the send button.
 */
export function Composer({
  chat,
  placeholder,
  modes = false,
  scopeNote,
  layout = "stacked",
  label,
  className,
}: {
  chat: ChatHandle;
  placeholder: string;
  modes?: boolean;
  scopeNote?: ReactNode;
  layout?: "stacked" | "inline";
  label?: string;
  className?: string;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const blocked = chat.error?.kind === "budget";
  const busy = chat.pending !== null;
  const submit = () => {
    if (!text.trim() || busy || blocked) return;
    chat.send(text);
    setText("");
  };
  const send = busy ? (
    <Button type="button" size="icon" aria-label="Stop" onClick={chat.stop} className="bg-ink text-page hover:bg-ink-hover">
      <Square size={10} fill="currentColor" aria-hidden="true" />
    </Button>
  ) : (
    <Tooltip>
      <TooltipTrigger render={<Button type="submit" size="icon" aria-label="Ask" disabled={!text.trim() || blocked} className="bg-ink text-page hover:bg-ink-hover" />}>
        <ArrowUp size={14} strokeWidth={1.5} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>Ask</TooltipContent>
    </Tooltip>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(
        "rounded-sm border border-input bg-page transition-colors duration-[120ms] ease-standard has-[textarea:focus-visible]:border-ink",
        layout === "stacked" ? "flex flex-col gap-3 p-3.5" : "flex items-center gap-3 py-3 pr-3 pl-4",
        blocked && "opacity-60",
        className,
      )}
    >
      <textarea
        ref={ref}
        rows={layout === "stacked" ? 2 : 1}
        value={text}
        disabled={blocked}
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className="field-sizing-content max-h-40 min-w-0 flex-1 resize-none bg-transparent text-[1rem] leading-5 text-ink outline-none placeholder:text-graphite md:text-sm md:leading-5 disabled:cursor-not-allowed"
      />
      {layout === "stacked" ? (
        <div className="flex items-center justify-between gap-3">
          {modes ? <ModeSwitch value={chat.mode} onChange={chat.setMode} disabled={busy || blocked} /> : <span />}
          <div className="flex items-center gap-3">
            {scopeNote && <span className="text-sm leading-4 text-graphite">{scopeNote}</span>}
            {send}
          </div>
        </div>
      ) : (
        <>
          {scopeNote && <span className="shrink-0 text-sm leading-4 text-graphite">{scopeNote}</span>}
          {send}
        </>
      )}
    </form>
  );
}
