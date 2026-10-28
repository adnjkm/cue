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

async function session(fn, contextOptions = {}) {
  const host = { newContext: (o) => browser.newContext({ ...o, ...contextOptions }) };
  const { t, context, problems } = await makeContext({ browser: host, base: server.base, root, runDir: out, integrated: false });
  try {
    await fn(t, t.page);
  } catch (e) {
    await t.page.screenshot({ path: path.join(out, "FAILED.png") }).catch(() => undefined);
    console.error(problems.join("\n"));
    throw e;
  } finally {
    await context.close();
  }
}

const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) process.exitCode = 1;
};

/** The global ring: 2px solid ink at offset 2, with the 4px it reaches past the box left visible by its scroller. */
const ringOf = (el) => {
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  let clipped = false;
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (getComputedStyle(p).overflowY === "visible" && getComputedStyle(p).overflowX === "visible") continue;
    const b = p.getBoundingClientRect();
    clipped ||= r.left - 4 < b.left || r.right + 4 > b.right || r.top - 4 < b.top;
    break;
  }
  return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset, color: s.outlineColor, ink: s.outlineColor === getComputedStyle(document.body).color, clipped };
};

async function shot(page, name, size = WIDE) {
  await page.setViewportSize(size);
  const mains = await page.locator("main").count();
  check(mains === 1, `${name}: one main landmark (${mains})`);
  await page.mouse.move(size.width / 2, size.height - 10);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(out, `${name}-${size.width}.png`), animations: "disabled" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(`wrote ${name}-${size.width}.png${overflow > 0 ? `  HORIZONTAL OVERFLOW ${overflow}px` : ""}`);
}

async function boxes(page) {
  const rect = async (loc) => {
    const b = await loc.boundingBox();
    return b ? [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 10) / 10).join(" ") : "missing";
  };
  const log = page.getByRole("list", { name: "Live transcript" });
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
  const pulse = () => page.getByRole("status").locator("span").first().evaluate((d) => `${getComputedStyle(d).animationName} ${getComputedStyle(d).animationDuration}`);
  check((await pulse()) === "breathe 1.6s", `the recording dot pulses (${await pulse()})`);
  await page.emulateMedia({ reducedMotion: "reduce" });
  check((await pulse()).startsWith("none"), `the recording dot holds still under reduced motion (${await pulse()})`);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const cardTime = await page.getByTestId("lectures-related").locator("time").first().getAttribute("datetime");
  check(cardTime === "PT33M20S", `the first related card's stamp is a valid time (${cardTime})`);
  await shot(page, "live", NARROW);
  await page.setViewportSize(WIDE);
  await page.clock.resume();
  // The switch back from the narrow tabs remounts the composer, which would drop text typed before it.
  await page.getByText("Uses the last 5 minutes").waitFor();
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

await session(async (t, page) => {
  const focused = () => page.evaluate(() => (document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? "").trim());
  await t.clock.setSystemTime("2026-10-27T09:47:30-04:00");
  await t.reseed({ scenario: "liveLecture" });
  await page.goto(`/lectures/${t.sample.lectures.mat137Tue}`);
  const status = page.getByRole("status");
  await status.filter({ hasText: "Paused" }).waitFor();
  await page.keyboard.press("p");
  await status.filter({ hasText: "Recording" }).waitFor();
  check(true, "keyboard: P resumes");
  await page.keyboard.press("p");
  await status.filter({ hasText: "Paused" }).waitFor();
  check(true, "keyboard: P pauses");
  const order = [];
  const at = {};
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    order.push(await focused());
    if (i === 0) at.tooltip = (await page.locator('[data-slot="tooltip-content"]').textContent({ timeout: 2_000 }).catch(() => null))?.trim();
    if (i >= 4) await page.waitForTimeout(250);
    if (i === 4) {
      at.composer = await page.evaluate((ring) => {
        const area = document.activeElement;
        const form = area.closest("form");
        return { ring: new Function(`return ${ring}`)()(form), keys: area.getAttribute("aria-keyshortcuts"), send: getComputedStyle(form.querySelector('button[aria-label="Ask"]')).opacity };
      }, ringOf.toString());
    }
    if (i === 5) at.card = await page.evaluate((ring) => ({ state: document.activeElement.dataset.state, ring: new Function(`return ${ring}`)()(document.activeElement) }), ringOf.toString());
  }
  check(
    order[0] === "Scheduled Tue 9–10am" && order[1] === "Resume" && order[2] === "End and save notes" && order[3] === "Flag the line at 37:10" && order[4] === "Ask about the last 5 minutes",
    `keyboard: tab order ${JSON.stringify(order)}`,
  );
  check(at.tooltip === "Scheduled Tue 9–10am", `keyboard: focusing the lecture time shows the slot (${at.tooltip})`);
  const ringOk = (r) => r && r.style === "solid" && r.width === "2px" && r.offset === "2px" && r.ink && !r.clipped;
  check(ringOk(at.composer?.ring), `keyboard: the composer shows the 2px ink ring ${JSON.stringify(at.composer?.ring)}`);
  check(at.composer?.keys === "/", "keyboard: the composer declares aria-keyshortcuts=/");
  check(at.composer?.send === "1", `the empty composer's send button is ink like Paper (opacity ${at.composer?.send})`);
  check(at.card?.state === "emphasized" && ringOk(at.card.ring), `keyboard: the emphasized card shows an unclipped 2px ink ring ${JSON.stringify(at.card)}`);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("ArrowUp");
  check((await focused()) === "Flag the line at 35:47", "keyboard: ArrowUp moves to the previous line");
  await page.keyboard.press("Enter");
  const row = page.getByRole("list", { name: "Live transcript" }).getByRole("listitem").filter({ hasText: "35:47" });
  await row.filter({ hasText: "Flagged by you" }).waitFor();
  check(true, "keyboard: Enter flags the focused line");
  await page.keyboard.press("f");
  await row.filter({ hasNotText: "Flagged" }).waitFor();
  check(true, "keyboard: F unflags the focused line");
  await page.keyboard.press("/");
  check((await focused()) === "Ask about the last 5 minutes", "keyboard: / focuses the composer");
  await page.keyboard.press("Escape");
  check(await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "lectures-main"), "keyboard: Escape leaves the composer for the screen");
  await page.keyboard.press("p");
  await status.filter({ hasText: "Recording" }).waitFor({ timeout: 3_000 });
  check(true, "keyboard: P still answers after Escape leaves the composer");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await status.filter({ hasText: "Paused" }).waitFor();
  check((await focused()) === "Resume", `pointer: the Pause button keeps focus through pausing and reads Resume (${await focused()})`);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("p");
  await status.filter({ hasText: "Recording" }).waitFor({ timeout: 3_000 });
  check(true, "keyboard: P answers with focus on the page body");
  await page.keyboard.press("p");
  await status.filter({ hasText: "Paused" }).waitFor({ timeout: 3_000 });
  await page.goto("/lectures");
  await page.getByRole("button", { name: "Record a lecture" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  await page.waitForFunction(() => !!document.activeElement?.closest('[role="dialog"]'), null, { timeout: 2_000 }).catch(() => undefined);
  check(await page.evaluate(() => document.activeElement?.getAttribute("role") === "combobox" && !!document.activeElement.closest('[role="dialog"]')), "keyboard: the record dialog opens on its Course picker");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  check(true, "keyboard: Escape closes the record dialog");
});

await session(
  async (t, page) => {
    await t.clock.setSystemTime("2026-10-27T09:47:30-04:00");
    await t.reseed({ scenario: "liveLecture" });
    await page.setViewportSize(NARROW);
    await page.goto(`/lectures/${t.sample.lectures.mat137Tue}`);
    await page.getByRole("status").filter({ hasText: "Paused" }).waitFor();
    const row = page.getByRole("list", { name: "Live transcript" }).getByRole("listitem").filter({ hasText: "35:47" });
    const flag = row.getByRole("button", { name: "Flag the line at 35:47" });
    const hidden = await flag.evaluate((b) => [getComputedStyle(b).opacity, getComputedStyle(b).pointerEvents]);
    check(hidden[0] === "0" && hidden[1] === "none", `touch: the flag action starts hidden and ignores taps (${hidden})`);
    await row.getByText("So the answer is").tap();
    await page.waitForTimeout(200);
    const shown = await flag.evaluate((b) => [getComputedStyle(b).opacity, b.getBoundingClientRect().height]);
    check(shown[0] === "1" && shown[1] >= 32, `touch: a tap on the row shows Flag with a 32px target (${shown})`);
    await shot(page, "touch-row", NARROW);
    await flag.tap();
    await row.filter({ hasText: "Flagged by you" }).waitFor();
    check(true, "touch: tapping Flag flags the line");
  },
  { hasTouch: true },
);

await browser.close();
server.stop();
