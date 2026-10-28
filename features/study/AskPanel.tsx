"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import type { ChatHandle } from "@/lib/chat";
import type { ChatMessage, CourseId, SourceRef } from "@/lib/domain";
import { href } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { SectionLabel } from "@/components/cue";
import { ChatThread, Composer } from "@/components/cue/chat";
import { Button, buttonVariants } from "@/components/ui/button";

/** Paper's follow-up pills are 12px inline; the button's transparent 1px border takes one of them. */
const PILL = "px-[11px]";

function FollowUps({ message, chat, courseId }: { message: ChatMessage; chat: ChatHandle; courseId: CourseId | null }) {
  const saved = message.savedToGuideAt !== undefined;
  return (
    <>
      {courseId && (
        <Link href={href.practice({ generate: { kind: "message", courseId, messageId: message.id } })} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), PILL)}>
          Quiz me on this
        </Link>
      )}
      <Button
        variant="secondary"
        size="sm"
        aria-disabled={saved || undefined}
        onClick={() => {
          if (!saved) void chat.saveToGuide(message.id);
        }}
        className={cn(PILL, saved && "cursor-default gap-1.5 aria-disabled:pointer-events-auto aria-disabled:opacity-100 hover:bg-control")}
      >
        {saved && <Check size={12} strokeWidth={2.625} aria-hidden="true" />}
        {saved ? "Added to study guide" : "Add to study guide"}
      </Button>
    </>
  );
}

/**
 * The study scope's chat column: caps label, the thread (scrolls, sticks to the newest message unless the
 * student scrolled up) and the composer pinned under it.
 */
export function AskPanel({
  chat,
  label,
  placeholder,
  courseId,
  prompts,
  onOpenSource,
  hideLabel = false,
  className,
}: {
  chat: ChatHandle;
  label: string;
  placeholder: string;
  courseId: CourseId | null;
  prompts: readonly string[];
  onOpenSource: (ref: SourceRef) => boolean;
  hideLabel?: boolean;
  className?: string;
}) {
  const labelId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const { messages, pending, error } = chat;
  useEffect(() => {
    const box = scrollRef.current;
    if (box && pinned.current) box.scrollTop = box.scrollHeight;
  }, [messages.length, pending?.text, pending?.phase, error]);

  return (
    <section aria-labelledby={labelId} data-composer-host className={cn("flex min-h-0 flex-col gap-6", className)}>
      <div className={cn("flex flex-col items-start gap-1 pt-1.5", hideLabel && "sr-only")}>
        <SectionLabel id={labelId}>{label}</SectionLabel>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const box = e.currentTarget;
          pinned.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
        }}
        className="-mr-2 -ml-1 min-h-0 flex-1 overflow-y-auto pr-2 pl-1"
      >
        <ChatThread
          chat={chat}
          onOpenSource={onOpenSource}
          followUps={(m) => <FollowUps message={m} chat={chat} courseId={courseId} />}
          empty={
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm leading-5 text-graphite">Ask about the slides, the transcript or your notes. Every answer says where it comes from.</p>
              <div className="flex flex-wrap gap-2">
                {prompts.map((p) => (
                  <Button key={p} variant="secondary" size="sm" className={cn(PILL, "h-auto min-h-7 py-1.5 text-left whitespace-normal")} onClick={() => chat.send(p)}>
                    {p}
                  </Button>
                ))}
              </div>
            </div>
          }
        />
      </div>
      <Composer chat={chat} modes placeholder={placeholder} label={label} className="shrink-0 pb-[max(14px,env(safe-area-inset-bottom))]" />
    </section>
  );
}
