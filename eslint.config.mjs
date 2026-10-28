import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The pre-shell practice app, linted again once it moves into features/practice.
const LEGACY = ["components/App.tsx", "components/Practice.tsx", "components/AskChat.tsx", "components/Intake.tsx", "components/Navigator.tsx", "lib/mock.ts"];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".verify/**", ".data/**", "docs/**"]),
  globalIgnores(LEGACY),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
]);
