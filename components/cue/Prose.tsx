import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Renders the small Markdown subset the models emit: paragraphs, fenced code, `inline code` and **bold**. */
export function Prose({ text, className, codeClassName }: { text: string; className?: string; codeClassName?: string }) {
  const parts = text.split("```");
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const newline = part.indexOf("\n");
          const code = (newline < 0 ? part : part.slice(newline + 1)).replace(/\n+$/, "");
          return (
            <pre key={i} className={cn("max-w-full overflow-x-auto rounded-sm bg-wash px-4 py-3 font-mono text-[13px] leading-5 tracking-normal [tab-size:4]", codeClassName)}>
              <code>{code}</code>
            </pre>
          );
        }
        return part
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p, j) => <p key={`${i}-${j}`}>{inline(p)}</p>);
      })}
    </div>
  );
}

export function inline(text: string): ReactNode[] {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/).map((t, i) => {
    if (t.startsWith("`") && t.endsWith("`") && t.length > 2)
      return (
        <code key={i} className="font-mono tracking-normal">
          {t.slice(1, -1)}
        </code>
      );
    if (t.startsWith("**") && t.endsWith("**") && t.length > 4) return <strong key={i}>{t.slice(2, -2)}</strong>;
    return t;
  });
}
