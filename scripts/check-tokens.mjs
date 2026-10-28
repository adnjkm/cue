#!/usr/bin/env node
// Fails on any color that is not an OKLCH token, and on Base UI imported outside components/ui.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["app", "components", "features", "lib", "hooks"];
const EXT = /\.(tsx?|css|mjs|jsx?)$/;
const RULES = [
  { name: "hex color", re: /(?<![\w&/])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b(?!-)/g },
  { name: "rgb()/hsl() color", re: /\b(?:rgba?|hsla?)\(/g },
  { name: "Tailwind palette color", re: /\b(?:bg|text|border|ring|fill|stroke|outline|from|to|via|decoration|shadow|accent|caret)-(?:black|white|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})\b/g },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (EXT.test(entry.name)) out.push(p);
  }
  return out;
}

const problems = [];
for (const dir of DIRS) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const rel = path.relative(root, file);
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      for (const rule of RULES) for (const m of line.matchAll(rule.re)) problems.push(`${rel}:${i + 1}: ${rule.name} "${m[0]}"`);
      if (/from\s+["']@base-ui\/react/.test(line) && !rel.startsWith(`components${path.sep}ui${path.sep}`)) problems.push(`${rel}:${i + 1}: @base-ui/react imported outside components/ui`);
    });
  }
}

if (problems.length) {
  console.error(`check-tokens: ${problems.length} problem(s)\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("check-tokens: clean (OKLCH tokens only, Base UI only through components/ui)");
