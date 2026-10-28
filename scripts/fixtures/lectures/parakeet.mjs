#!/usr/bin/env node
// Live-only check of the real Parakeet engine (docs/architecture.md 13.5). Not part of the gate.
// It downloads NVIDIA Parakeet CTC 0.6B (about 454 MB on WebGPU, 611 MB on WASM) into the browser profile,
// so it needs the operator's approval and refuses to run without --download-model.
//   pnpm build && node scripts/fixtures/lectures/parakeet.mjs --download-model [--keep-profile]
// Passes when the transcript of scripts/fixtures/audio/lecture.wav, fed as the fake microphone, says "term test 2" (or "two").
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { startServer } from "../../e2e/lib/server.mjs";

if (!process.argv.includes("--download-model")) {
  console.error("Refusing to run: this downloads the Parakeet model (about 454 MB). Rerun with --download-model once the operator approves.");
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const wav = path.join(root, "scripts/fixtures/audio/lecture.wav");
const profile = path.join(os.tmpdir(), "cue-parakeet-profile");
const server = await startServer(root);
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  baseURL: server.base,
  viewport: { width: 1440, height: 900 },
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${wav}%noloop`, "--enable-unsafe-webgpu"],
});
const page = context.pages()[0] ?? (await context.newPage());
let ok = false;
try {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the sample semester" }).click();
  await page.goto("/lectures");
  await page.evaluate(async () => {
    const open = indexedDB.open("cue");
    await new Promise((r) => (open.onsuccess = r));
    const tx = open.result.transaction("prefs", "readwrite");
    tx.objectStore("prefs").put({ owner: "lectures", engine: "parakeet", parakeetConsentAt: Date.now() });
    await new Promise((r) => (tx.oncomplete = r));
  });
  const backend = await page.evaluate(async () => ((await navigator.gpu?.requestAdapter?.()) ? "webgpu" : "wasm"));
  console.log(`backend: ${backend}`);
  await page.getByRole("button", { name: "Record a lecture" }).click();
  await page.getByRole("combobox", { name: "Course" }).click();
  await page.getByRole("option", { name: /^MAT137/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start recording" }).click();
  const started = Date.now();
  for (;;) {
    const text = (await page.getByRole("log", { name: "Live transcript" }).innerText()).toLowerCase();
    const status = await page.getByRole("status").innerText();
    if (/term test (2|two)/.test(text)) {
      ok = true;
      console.log(`PASS: "term test 2" transcribed after ${Math.round((Date.now() - started) / 1000)} s`);
      break;
    }
    if (Date.now() - started > 15 * 60_000) {
      console.log(`FAIL: no "term test 2" after 15 minutes. Status: ${status}\n${text.slice(-800)}`);
      break;
    }
    console.log(`${Math.round((Date.now() - started) / 1000)} s · ${status} · ${text.split("\n").at(-1)?.slice(0, 80)}`);
    await page.waitForTimeout(10_000);
  }
} finally {
  await context.close();
  server.stop();
  if (!process.argv.includes("--keep-profile")) fs.rmSync(profile, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
