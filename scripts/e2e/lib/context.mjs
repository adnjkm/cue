import path from "node:path";
import { expect } from "@playwright/test";
import { SAMPLE } from "../../../lib/sample/ids.ts";
import { TID } from "../../../lib/testids.ts";

export const CLOCK = "2026-10-27T10:12:00-04:00";
const WIDE = { width: 1440, height: 900 };
const NARROW = { width: 375, height: 812 };

/** The StepContext from docs/architecture/types.ts section 18, plus failure bookkeeping for the runner. */
export async function makeContext({ browser, base, root, runDir, integrated }) {
  const context = await browser.newContext({ baseURL: base, viewport: WIDE, timezoneId: "America/Toronto", locale: "en-US" });
  const page = await context.newPage();
  await page.clock.install({ time: new Date(CLOCK) });
  const problems = [];
  const allowed = [];
  const isAllowed = (url) => allowed.some((re) => re.test(url));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const url = m.location()?.url ?? "";
    if (m.text().startsWith("Failed to load resource") && isAllowed(url)) return;
    problems.push(`console: ${m.text()}${url ? ` (${url})` : ""}`);
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText ?? "";
    if (isAllowed(r.url()) || reason.includes("ERR_ABORTED")) return;
    problems.push(`request failed: ${r.url()} ${reason}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !isAllowed(r.url())) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });

  const t = {
    page,
    expect,
    clock: {
      setSystemTime: (time) => page.clock.setSystemTime(new Date(time)),
      runFor: (ms) => page.clock.runFor(ms),
    },
    async reseed(opts = {}) {
      await page.goto(opts.scenario ? `/?sampleScenario=${opts.scenario}` : "/");
      await page.getByRole("button", { name: "Data", exact: true }).click();
      await page.getByRole("menuitem", { name: "Reset all data" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Reset all data" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add your schedule to plan today.");
      await page.getByRole("button", { name: "Data", exact: true }).click();
      await page.getByRole("menuitem", { name: "Load sample semester" }).click();
      await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Add your schedule to plan today.", { timeout: 15_000 });
    },
    async shot(name) {
      await page.screenshot({ path: path.join(runDir, `${name}-1440.png`) });
    },
    async integrated(label, fn) {
      if (integrated) await fn();
      else console.log(`    skipped [integrated] ${label}`);
    },
    async checkNarrow() {
      await page.setViewportSize(NARROW);
      await page.reload();
      await page.waitForLoadState("load");
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await page.screenshot({ path: path.join(runDir, `${await name(page)}-375.png`) });
      await page.setViewportSize(WIDE);
      await page.reload();
      if (overflow > 0) throw new Error(`Horizontal overflow of ${overflow}px at 375 on ${page.url()}`);
    },
    fixture: (rel) => path.join(root, "scripts/fixtures", rel),
    /** A step that stubs a route on purpose names it here, so its 4xx does not fail the step. */
    allowFailures: (re) => allowed.push(re),
    sample: SAMPLE,
    tid: TID,
  };
  return { t, context, problems };
}

async function name(page) {
  const p = new URL(page.url()).pathname.replace(/^\//, "").replace(/[^\w.-]+/g, "_");
  return p || "today";
}
