import type { ReactNode } from "react";

/** The placeholder every feature route renders until its workstream lands: an h1 and a line of status. */
export function StubPage({ title, testId, focus = false, children }: { title: string; testId: string; focus?: boolean; children?: ReactNode }) {
  return (
    <main data-testid={testId} className={focus ? "flex flex-1 flex-col gap-3 px-10 pt-7 pb-8 max-md:px-4" : "flex flex-col gap-3 px-5 pt-6 pb-10 md:px-10 md:pt-7"}>
      <h1 className="text-lg leading-6 font-normal tracking-display text-ink">{title}</h1>
      {children ?? <p className="text-sm leading-5 text-graphite">This screen arrives with its workstream.</p>}
    </main>
  );
}
