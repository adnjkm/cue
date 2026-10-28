"use client";

import type { ReactNode } from "react";
import type { ChatHandle } from "@/lib/chat";
import type { ChatMessage, SourceRef } from "@/lib/domain";
import { errorCopy } from "@/lib/ai";
import { TID } from "@/lib/testids";
import { cn } from "@/lib/utils";
import { useMountTime } from "@/hooks/use-mount-time";
import { Button } from "@/components/ui/button";
import { BudgetNotice } from "../BudgetNotice";
import { ErrorLine } from "../bits";
import { Prose } from "../Prose";
import { SourceChips } from "./SourceChip";

function UserBubble({ text, fresh }: { text: string; fresh: boolean }) {
  return (
    <div className={cn("flex justify-end", fresh && "animate-rise")}>
      <p className="max-w-[280px] rounded-sm bg-fill px-3.5 py-2.5 text-sm leading-5 text-ink">{text}</p>
    </div>
  );
}

/** Messages, the streaming reply, citations as chips and per-message follow-ups. onOpenSource returns true when the screen handled the ref. */
export function ChatThread({
  chat,
  followUps,
  onOpenSource,
  empty,
  className,
}: {
  chat: ChatHandle;
  followUps?: (message: ChatMessage) => ReactNode;
  onOpenSource?: (ref: SourceRef) => boolean;
  empty?: ReactNode;
  className?: string;
}) {
  const { messages, pending, error } = chat;
  const mountedAt = useMountTime();
  return (
    <div data-testid={TID.chat.thread} role="log" aria-label="Conversation" aria-live="polite" className={cn("flex flex-col gap-5", className)}>
      {messages.length === 0 && !pending && empty}
      {messages.map((m) =>
        m.role === "user" ? (
          <UserBubble key={m.id} text={m.text} fresh={m.at > mountedAt} />
        ) : (
          <article key={m.id} className="flex flex-col gap-3 text-sm leading-5 text-ink">
            <Prose text={m.text} />
            <SourceChips sources={m.citations} onOpenSource={onOpenSource} />
            {followUps && <div className="flex flex-wrap gap-2">{followUps(m)}</div>}
          </article>
        ),
      )}
      {pending && (
        <article aria-busy="true" className="flex flex-col gap-3 text-sm leading-5 text-ink">
          {pending.text ? (
            <Prose text={pending.text.replace(/\s*\[S\d+(?:\s*,\s*S\d+)*\]/g, "")} />
          ) : (
            <p className="animate-breathe text-graphite">{pending.phase === "retrieving" ? "Reading your material…" : "Thinking…"}</p>
          )}
        </article>
      )}
      {error &&
        (error.kind === "budget" ? (
          <BudgetNotice error={error} />
        ) : (
          <ErrorLine
            title={errorCopy(error).title}
            detail={errorCopy(error).detail}
            action={
              errorCopy(error).retry ? (
                <Button variant="secondary" size="sm" onClick={chat.retry}>
                  Try again
                </Button>
              ) : undefined
            }
          />
        ))}
    </div>
  );
}
