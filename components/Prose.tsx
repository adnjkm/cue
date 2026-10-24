import type { ReactNode } from "react";

/** Renders the small Markdown subset the parser emits: paragraphs, fenced code, `inline code` and **bold**. */
export function Prose({ text, className }: { text: string; className?: string }) {
  const parts = text.split("```");
  return (
    <div className={className}>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const newline = part.indexOf("\n");
          const code = (newline < 0 ? part : part.slice(newline + 1)).replace(/\n+$/, "");
          return (
            <pre key={i} className="code">
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
    if (t.startsWith("`") && t.endsWith("`") && t.length > 2) return <code key={i}>{t.slice(1, -1)}</code>;
    if (t.startsWith("**") && t.endsWith("**") && t.length > 4) return <strong key={i}>{t.slice(2, -2)}</strong>;
    return t;
  });
}
