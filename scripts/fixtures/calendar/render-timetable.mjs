#!/usr/bin/env node
// Renders timetable.html to timetable.png with the cached Playwright Chromium: node scripts/fixtures/calendar/render-timetable.mjs
// It also writes a small JPEG of the same page as calendar.read's live example, so check-nemotron sends a real timetable.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../../e2e/lib/browser.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 700 }, deviceScaleFactor: 1 });
  await page.goto(`file://${path.join(here, "timetable.html")}`);
  const body = page.locator("body");
  await body.screenshot({ path: path.join(here, "timetable.png") });
  const small = await body.screenshot({ type: "jpeg", quality: 60, scale: "css" });
  const dataUrl = `data:image/jpeg;base64,${small.toString("base64")}`;
  fs.writeFileSync(
    path.join(root, "features/calendar/example-timetable.ts"),
    `import "server-only";\n\n/** scripts/fixtures/calendar/timetable.html as a JPEG, written by render-timetable.mjs: calendar.read's live example. */\nexport const EXAMPLE_TIMETABLE = "${dataUrl}";\n`,
  );
  console.log(`timetable.png and the ${Math.round(dataUrl.length / 1024)} KB example written`);
} finally {
  await browser.close();
}
