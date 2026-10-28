#!/usr/bin/env node
// node scripts/check-ownership.mjs <key>   fails when this branch touches a path outside <key>'s globs
// node scripts/check-ownership.mjs --all   fails unless every tracked file has exactly one owner
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORKSTREAMS } from "../workstreams.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);

export function owns(workstream, file) {
  const positive = workstream.owns.filter((g) => !g.startsWith("!"));
  const negative = workstream.owns.filter((g) => g.startsWith("!")).map((g) => g.slice(1));
  return positive.some((g) => path.matchesGlob(file, g)) && !negative.some((g) => path.matchesGlob(file, g));
}

export function ownersOf(file) {
  return WORKSTREAMS.filter((w) => owns(w, file)).map((w) => w.key);
}

const arg = process.argv[2];
if (!arg) {
  console.error("usage: check-ownership.mjs <workstream key> | --all");
  process.exit(2);
}

const problems = [];
if (arg === "--all") {
  const files = git("ls-files");
  for (const file of files) {
    const owners = ownersOf(file);
    if (owners.length !== 1) problems.push(`${file}: ${owners.length ? `owned by ${owners.join(" and ")}` : "no owner"}`);
  }
  const routes = files.filter((f) => /^app\/.*\/(page|route|layout)\.tsx?$/.test(f));
  for (const r of routes) if (ownersOf(r).length === 0) problems.push(`${r}: route folder has no owner`);
  if (problems.length === 0) console.log(`check-ownership --all: ${files.length} tracked files, each with exactly one owner`);
} else {
  const ws = WORKSTREAMS.find((w) => w.key === arg);
  if (!ws) {
    console.error(`Unknown workstream "${arg}". Known: ${WORKSTREAMS.map((w) => w.key).join(", ")}`);
    process.exit(2);
  }
  const base = git("merge-base", "main", "HEAD")[0];
  const changed = new Set([...git("diff", "--name-only", `${base}...HEAD`), ...git("diff", "--name-only", "HEAD"), ...git("ls-files", "--others", "--exclude-standard")]);
  for (const file of changed) if (!owns(ws, file)) problems.push(`${file}: outside ${arg}'s paths (owned by ${ownersOf(file).join(", ") || "nobody"})`);
  if (problems.length === 0) console.log(`check-ownership ${arg}: ${changed.size} changed path(s), all inside ${arg}'s globs`);
}

if (problems.length) {
  console.error(`check-ownership: ${problems.length} problem(s)\n${problems.join("\n")}`);
  process.exit(1);
}
