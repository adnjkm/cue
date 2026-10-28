#!/usr/bin/env node
// Walks every screen of the production build in mock mode: node scripts/e2e/walkthrough.mjs [--only boot,practice] [--integrated] [--keep-server]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./lib/browser.mjs";
import { makeContext } from "./lib/context.mjs";
import { startServer } from "./lib/server.mjs";
import { WORKSTREAMS } from "../../workstreams.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const onlyArg = argv.find((a, i) => argv[i - 1] === "--only" || a.startsWith("--only="));
const only = onlyArg ? onlyArg.replace(/^--only=/, "").split(",").filter(Boolean) : null;

if (!fs.existsSync(path.join(root, ".next/BUILD_ID"))) {
  console.error("No production build. Run pnpm build first.");
  process.exit(2);
}

const order = WORKSTREAMS.map((w) => w.e2eStep).filter((s) => !only || only.includes(s));
const runDir = path.join(root, ".verify/e2e", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(runDir, { recursive: true });

const server = await startServer(root);
const browser = await launch();
const results = [];
try {
  for (const name of order) {
    const file = path.join(root, "scripts/e2e/steps", `${name}.mjs`);
    const step = (await import(file)).default;
    const started = Date.now();
    const { t, context, problems } = await makeContext({ browser, base: server.base, root, runDir, integrated: flag("--integrated") });
    let error = null;
    try {
      await step(t);
      await t.page.waitForTimeout(200);
      if (problems.length) error = new Error(`Problems during the step:\n${problems.join("\n")}`);
    } catch (e) {
      error = e;
      await t.page.screenshot({ path: path.join(runDir, `${name}-FAILED-1440.png`) }).catch(() => undefined);
      fs.writeFileSync(path.join(runDir, `${name}-FAILED.txt`), `${t.page.url()}\n${String(error?.stack ?? error)}\n`);
    } finally {
      await context.close();
    }
    results.push({ name, ok: !error, ms: Date.now() - started, error });
    console.log(`${error ? "FAIL" : "PASS"} ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)${error ? `\n${String(error.stack ?? error).split("\n").slice(0, 12).join("\n")}` : ""}`);
  }
} finally {
  await browser.close();
  if (!flag("--keep-server")) server.stop();
  else console.log(`Server still running at ${server.base}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} steps passed. Screenshots: ${path.relative(root, runDir)}`);
process.exit(failed.length ? 1 : 0);
