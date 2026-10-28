#!/usr/bin/env node
// Calls every AI task's example against the live provider and checks each answer passed its schema.
// node scripts/check-nemotron.mjs [--base http://localhost:3000] [--only ask,embed]
// Without --base it starts `next start` (production build, real keys from .env.local) on a free port.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freePort } from "./e2e/lib/server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const value = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : argv.find((a) => a.startsWith(`${name}=`))?.split("=")[1];
};
const only = value("--only")?.split(",");

async function startServer() {
  if (!fs.existsSync(path.join(root, ".next/BUILD_ID"))) throw new Error("No production build. Run pnpm build first.");
  const port = await freePort();
  const env = { ...process.env, PORT: String(port) };
  delete env.CUE_AI;
  const child = spawn("node_modules/.bin/next", ["start", "-p", String(port)], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const base = `http://localhost:${port}`;
  for (const deadline = Date.now() + 60_000; Date.now() < deadline; await new Promise((r) => setTimeout(r, 300))) {
    if (child.exitCode !== null) throw new Error(`next start exited:\n${log}`);
    try {
      if ((await fetch(`${base}/api/status`)).ok) return { base, stop: () => child.kill() };
    } catch {
      // Not listening yet.
    }
  }
  child.kill();
  throw new Error(`Server did not start:\n${log}`);
}

async function readLines(res) {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const server = value("--base") ? { base: value("--base"), stop: () => undefined } : await startServer();
let failed = 0;
try {
  const status = await (await fetch(`${server.base}/api/status`)).json();
  if (status.mode === "mock") {
    console.error("REFUSED: /api/status says the server is in mock mode, so nothing here would test Nemotron.");
    process.exit(1);
  }
  const { tasks } = await (await fetch(`${server.base}/api/ai`)).json();
  console.log(`Mode: ${status.mode}. Spend before: ${status.spend ? `$${status.spend.spentUsd.toFixed(6)} of $${status.spend.capUsd}` : "n/a"}`);
  for (const task of tasks.filter((t) => !only || only.includes(t.name))) {
    if (status.mode !== "token-factory" && task.kind === "embed") {
      console.log(`SKIP ${task.name}: embeddings run on Token Factory only`);
      continue;
    }
    const started = Date.now();
    let verdict;
    try {
      const res = await fetch(`${server.base}/api/ai/${task.name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(task.example) });
      if (task.kind === "json" || task.kind === "embed") {
        const body = await res.json();
        if (!res.ok) throw new Error(`${res.status} ${body.error?.kind}: ${body.error?.message}`);
        verdict = task.kind === "embed" ? `${body.vectors.length} vector(s)` : JSON.stringify(body).slice(0, 140);
      } else {
        if (!res.ok) throw new Error(`${res.status} ${(await res.json()).error?.kind}`);
        const lines = await readLines(res);
        const error = lines.find((l) => l.t === "error");
        if (error) throw new Error(`error line ${error.error.kind}: ${error.error.message}`);
        if (lines.at(-1)?.t !== "done") throw new Error("stream ended without a done line");
        verdict =
          task.kind === "list"
            ? `${lines.filter((l) => l.t === "item").length} item(s)${lines.at(-1).dropped ? `, ${lines.at(-1).dropped} dropped` : ""}`
            : `${lines.filter((l) => l.t === "text").map((l) => l.d).join("").slice(0, 120)}…`;
      }
      console.log(`PASS ${task.name} (${task.profile}, ${((Date.now() - started) / 1000).toFixed(1)} s): ${verdict}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${task.name} (${((Date.now() - started) / 1000).toFixed(1)} s): ${e instanceof Error ? e.message : e}`);
    }
  }
  const after = await (await fetch(`${server.base}/api/status`)).json();
  if (after.spend && status.spend) console.log(`Spend after: $${after.spend.spentUsd.toFixed(6)} (this run: $${(after.spend.spentUsd - status.spend.spentUsd).toFixed(6)})`);
  if (status.mode === "openrouter") console.log("Token Factory: INCONCLUSIVE (no NEBIUS_API_KEY, so these ran on OpenRouter's free models).");
} finally {
  server.stop();
}
process.exit(failed ? 1 : 0);
