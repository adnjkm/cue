import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import cue from "./eslint-rules/index.mjs";
import { TABLE_WRITERS, WORKSTREAMS } from "./workstreams.ts";

// Boundary and writer rules are generated from workstreams.ts, so ownership lives in one manifest.
const FEATURES = WORKSTREAMS.filter((w) => w.key !== "foundation").map((w) => w.key);
const BASE_UI = { group: ["@base-ui/react", "@base-ui/react/*"], message: "Use the shadcn components in @/components/ui." };
const INTERNAL = { group: ["@/lib/*/internal", "@/lib/*/internal/**"], message: "lib modules expose their index only." };
const SOURCE = ["**/*.{ts,tsx,mjs}"];

function featureImports(key) {
  return [
    BASE_UI,
    INTERNAL,
    { group: FEATURES.filter((f) => f !== key).flatMap((f) => [`@/features/${f}`, `@/features/${f}/**`]), message: "Features meet through @/lib, the database and URLs, never each other's code." },
    {
      group: ["@/lib/*/*", "!@/lib/ai/define", "!@/lib/ai/passages", `!@/lib/domain/payload/${key}`],
      message: "Import a lib module through its index (task files may import @/lib/ai/define and @/lib/ai/passages).",
    },
  ];
}

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".verify/**", ".data/**", "docs/**"]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
  { files: SOURCE, ignores: ["components/ui/**"], rules: { "no-restricted-imports": ["error", { patterns: [BASE_UI, INTERNAL] }] } },
  ...WORKSTREAMS.map((w) => ({
    files: w.owns.filter((g) => !g.startsWith("!")).filter((g) => /\.(ts|tsx|mjs)$|\*\*$/.test(g)),
    ignores: [...w.owns.filter((g) => g.startsWith("!")).map((g) => g.slice(1)), "**/*.test.ts", "lib/sample/index.ts", "lib/db/**"],
    plugins: { cue },
    rules: {
      "cue/table-writers": ["error", { owner: w.key, tableWriters: TABLE_WRITERS }],
      ...(w.key === "foundation" ? {} : { "cue/prefs-owner": ["error", { owner: w.key }], "no-restricted-imports": ["error", { patterns: featureImports(w.key) }] }),
    },
  })),
]);
