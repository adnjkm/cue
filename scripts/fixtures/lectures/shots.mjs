#!/usr/bin/env node
// Screenshots of every Lecture notes screen and state, for comparing with Paper artboard 22E-0:
// node scripts/fixtures/lectures/shots.mjs   (after pnpm build; writes .verify/lectures/)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../../e2e/lib/browser.mjs";
import { makeContext } from "../../e2e/lib/context.mjs";
import { startServer } from "../../e2e/lib/server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const out = path.join(root, ".verify/lectures");
fs.mkdirSync(out, { recursive: true });
const server = await startServer(root);
const browser = await launch();
const NARROW = { width: 375, height: 812 };
const WIDE = { width: 1440, height: 900 };

async function session(fn) {
  const { t, context } = await makeContext({ browser, base: server.base, root, runDir: out, integrated: false });
  try {
    await fn(t, t.page);
  } finally {
    await context.close();
  }
}

async function shot(page, name, size = WIDE) {
  await page.setViewportSize(size);
  await page.mouse.move(size.width / 2, size.height - 10);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(out, `${name}-${size.width}.png`) });
  console.log(`wrote ${name}-${size.width}.png`);
}

async function boxes(page) {
  const rect = async (loc) => {
    const b = await loc.boundingBox();
    return b ? [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 10) / 10).join(" ") : "missing";
  };
  const log = page.getByRole("log", { name: "Live transcript" });
  for (const [label, loc] of [
    ["h1", page.getByRole("heading", { level: 1 })],
    ["status", page.getByRole("status")],
    ["progress", page.getByRole("progressbar")],
    ["pause", page.getByRole("button", { name: "Pause", exact: true })],
    ["end", page.getByRole("button", { name: "End and save notes" })],
    ["log", log],
    ["composer", page.locator("form").first()],
    ["first card", page.getByTestId("lectures-related").getByRole("listitem").first()],
  ]) console.log(`  ${label.padEnd(11)} x y w h = ${await rect(loc)}`);
}

await session(async (t, page) => {
  await t.clock.setSystemTime("2026-10-27T09:47:30-04:00");
  await t.reseed({ scenario: "liveLecture" });
  await page.goto(`/lectures/${t.sample.lectures.mat137Tue}`);
  await page.getByRole("status").filter({ hasText: "Paused" }).waitFor();
  await shot(page, "paused");
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Recording" }).waitFor();
  await t.clock.runFor(42_000);
  await shot(page, "live");
  await boxes(page);
  await shot(page, "live", NARROW);
  await page.setViewportSize(WIDE);
  await page.clock.resume();
  const ask = page.getByRole("textbox", { name: "Ask about the last 5 minutes" });
  await ask.fill("Which choice of u was the mistake?");
  await ask.press("Enter");
  await page.getByRole("button", { name: "Transcript 33:20" }).waitFor();
  await shot(page, "live-answer");
});

await session(async (t, page) => {
  await t.reseed();
  await page.goto(`/lectures/${t.sample.lectures.mat137Tue}`);
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  await shot(page, "saved");
  await shot(page, "saved", NARROW);
  await page.setViewportSize(WIDE);
  await page.getByRole("button", { name: /^Full transcript/ }).click();
  await shot(page, "saved-transcript");
  await page.goto(`/lectures/${t.sample.lectures.mat137Thu}`);
  await page.getByRole("button", { name: "Start recording" }).waitFor();
  await shot(page, "ready");
  await shot(page, "ready", NARROW);
  await page.setViewportSize(WIDE);
  await page.goto("/lectures");
  await page.getByRole("heading", { level: 1, name: "Lecture notes" }).waitFor();
  await shot(page, "index");
  await shot(page, "index", NARROW);
  await page.setViewportSize(WIDE);
  await page.getByRole("button", { name: "Record a lecture" }).click();
  await page.getByRole("dialog").waitFor();
  await shot(page, "record-dialog");
  await page.keyboard.press("Escape");
  await page.goto("/lectures/lec.evt_missing");
  await page.getByText("This lecture isn't on this device.").waitFor();
  await shot(page, "not-found");
});

await session(async (t, page) => {
  await t.page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
  await t.reseed();
  await page.evaluate(async () => {
    const open = indexedDB.open("cue");
    await new Promise((r) => (open.onsuccess = r));
    const tx = open.result.transaction("prefs", "readwrite");
    tx.objectStore("prefs").put({ owner: "lectures", engine: "parakeet", parakeetConsentAt: Date.now() });
    await new Promise((r) => (tx.oncomplete = r));
  });
  await page.goto(`/lectures/${t.sample.lectures.mat137Thu}`);
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.getByText("Cue can't hear your microphone.").waitFor();
  await shot(page, "mic-blocked");
});

await session(async (t, page) => {
  await page.goto("/");
  await page.getByRole("heading", { level: 1, name: "Add your schedule to plan today." }).waitFor();
  await page.goto("/lectures");
  try {
    await page.getByText("No lectures yet.").waitFor({ timeout: 10_000 });
  } finally {
    await shot(page, "index-empty");
  }
});

await browser.close();
server.stop();
