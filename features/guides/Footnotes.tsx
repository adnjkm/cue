"use client";

import type { GuideDraft } from "@/lib/domain";
import { useOpenSource } from "@/lib/sources";
import { jumpTo } from "./Blocks";
import { footnoteParts } from "./cites";
import { tid } from "./testids";

/** Footnotes at the foot of the section: "Lecture 7 at 4:15. Textbook ch. 5, p. 92.", each source opening where it came from. */
export function Footnotes({ footnotes, interactive = true }: { footnotes: GuideDraft["footnotes"]; interactive?: boolean }) {
  const open = useOpenSource();
  if (footnotes.length === 0) return null;
  return (
    <section aria-label="Sources" className="border-t border-rule pt-4 break-inside-avoid">
      <ol role="list" className="flex flex-col gap-1.5">
        {footnotes.map((f) => (
          <li
            key={f.n}
            id={interactive ? `fn-${f.n}` : undefined}
            tabIndex={interactive ? -1 : undefined}
            className="flex gap-2 rounded-xs text-sm leading-5 text-graphite transition-colors duration-[120ms] ease-standard data-reached:text-ink"
          >
            <span aria-hidden="true" className="w-4 shrink-0">
              {f.n}
            </span>
            <p data-testid={tid.footnoteText} className="min-w-0">
              {footnoteParts(f.sources).map((part, i) => (
                <span key={i}>
                  {i > 0 && " "}
                  {interactive ? (
                    // A <button> is laid out as inline-block, so a long source would break the footnote's line; this flows like text.
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => open(part.source.ref)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        open(part.source.ref);
                      }}
                      className="cursor-pointer rounded-xs decoration-graphite underline-offset-2 transition-colors duration-[120ms] ease-standard hover:text-ink hover:underline"
                    >
                      {part.text}
                    </span>
                  ) : (
                    part.text
                  )}
                </span>
              ))}
            </p>
            {interactive && (
              <a
                href={`#fnref-${f.n}`}
                aria-label="Back to text"
                onClick={(e) => {
                  e.preventDefault();
                  jumpTo(`fnref-${f.n}`);
                }}
                className="sr-only shrink-0 rounded-xs text-graphite focus-visible:not-sr-only"
              >
                ↩
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
