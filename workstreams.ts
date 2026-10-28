import type { Owner } from "./lib/domain/prefs";
import type { TableName } from "./lib/db/schema";

export interface Workstream {
  key: Owner;
  /** Globs this workstream may change after the foundation commit. `!` excludes. Every tracked file has exactly one owner. */
  owns: readonly string[];
  /** The tables this workstream writes. TABLE_WRITERS is derived from this, never written by hand. */
  writes: readonly TableName[];
  /** Task-name prefix; features/<x>/tasks.ts must use defineTasks(prefix, …). */
  tasks: string | null;
  /** scripts/e2e/steps/<file>.mjs, run in manifest order. */
  e2eStep: string;
}

/** The only ownership list. eslint.config.mjs, check-ownership.mjs, lib/db and the walkthrough all read it. */
export const WORKSTREAMS = [
  {
    key: "foundation",
    owns: [
      "app/layout.tsx", "app/globals.css", "app/fonts/**", "app/(browse)/layout.tsx", "app/(focus)/layout.tsx", "app/api/**",
      "components/**", "hooks/**", "lib/**", "!lib/domain/payload/{study,lectures,practice,guides}.ts", "!lib/sample/{study,lectures,practice,guides}.ts",
      "eslint-rules/**", "scripts/check-*.mjs", "scripts/e2e/walkthrough.mjs", "scripts/e2e/lib/**", "scripts/e2e/steps/boot.mjs",
      "scripts/fixtures/audio/**", "workstreams.ts", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "next.config.ts", "tsconfig.json",
      "eslint.config.mjs", "vitest.config.ts", "components.json", ".env.example", ".gitignore", ".mcp.json", "AGENTS.md", "README.md", "LICENSE",
      "docs/**", "!docs/change-requests/*-*.md",
    ],
    writes: ["prefs", "courses", "overrides", "materials", "pages", "blobs", "chunks", "messages"],
    tasks: null,
    e2eStep: "boot",
  },
  {
    key: "today",
    owns: ["app/(browse)/page.tsx", "features/today/**", "scripts/e2e/steps/today.mjs", "docs/change-requests/today-*.md"],
    writes: [],
    tasks: "today",
    e2eStep: "today",
  },
  {
    key: "calendar",
    owns: ["app/(browse)/calendar/**", "features/calendar/**", "scripts/e2e/steps/calendar.mjs", "scripts/fixtures/calendar/**", "docs/change-requests/calendar-*.md"],
    writes: ["events", "imports"],
    tasks: "calendar",
    e2eStep: "calendar",
  },
  {
    key: "lectures",
    owns: [
      "app/(browse)/lectures/**", "app/(focus)/lectures/**", "features/lectures/**", "public/lectures/**", "lib/domain/payload/lectures.ts",
      "lib/sample/lectures.ts", "scripts/e2e/steps/lectures.mjs", "scripts/e2e/parakeet.mjs", "scripts/fixtures/lectures/**", "docs/change-requests/lectures-*.md",
    ],
    writes: ["lectures", "segments", "links", "audio"],
    tasks: "lecture",
    e2eStep: "lectures",
  },
  {
    key: "study",
    owns: [
      "app/(browse)/study/**", "app/(focus)/study/**", "features/study/**", "lib/domain/payload/study.ts", "lib/sample/study.ts",
      "scripts/e2e/steps/study.mjs", "docs/change-requests/study-*.md",
    ],
    writes: ["sessions"],
    tasks: "study",
    e2eStep: "study",
  },
  {
    key: "practice",
    owns: [
      "app/(browse)/practice/**", "app/(focus)/practice/**", "features/practice/**", "lib/domain/payload/practice.ts", "lib/sample/practice.ts",
      "scripts/e2e/steps/practice.mjs", "scripts/fixtures/practice/**", "docs/change-requests/practice-*.md",
    ],
    writes: ["practiceSets", "questions", "attempts", "solutions"],
    tasks: "practice",
    e2eStep: "practice",
  },
  {
    key: "guides",
    owns: [
      "app/(browse)/guides/**", "app/(focus)/export/**", "features/guides/**", "lib/domain/payload/guides.ts", "lib/sample/guides.ts",
      "scripts/e2e/steps/guides.mjs", "scripts/fixtures/guides/**", "docs/change-requests/guides-*.md",
    ],
    writes: ["guides", "guideSections"],
    tasks: "guide",
    e2eStep: "guides",
  },
] as const satisfies readonly Workstream[];

type WriterIn<W, T> = W extends { key: infer K; writes: readonly (infer X)[] } ? (T extends X ? K : never) : never;
/** The workstream that writes table T, derived from WORKSTREAMS. */
export type TableWriter<T extends TableName> = WriterIn<(typeof WORKSTREAMS)[number], T>;

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
type OwnershipError = {
  [T in TableName]: [TableWriter<T>] extends [never] ? `${T}: no writer` : true extends IsUnion<TableWriter<T>> ? `${T}: more than one writer` : never;
}[TableName];
/** Fails typecheck, naming the table, when a table has no writer or two. */
export const OWNERSHIP_CHECK: [OwnershipError] extends [never] ? true : OwnershipError = true;

/** Read by the generated table-writer lint rule and by check-ownership. */
export const TABLE_WRITERS = Object.fromEntries(
  WORKSTREAMS.flatMap((w) => (w.writes as readonly TableName[]).map((t) => [t, w.key] as const)),
) as { [T in TableName]: TableWriter<T> };
