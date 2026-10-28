import { tid } from "../../../features/lectures/testids.ts";

/** Lecture notes main path, docs/architecture.md section 13.3 (lectures). */
export default async function lectures(t) {
  const { page, expect } = t;
  const status = page.getByRole("status");
  const log = page.getByRole("log", { name: "Live transcript" });
  const row = (stamp) => log.getByRole("listitem").filter({ has: page.locator("time", { hasText: new RegExp(`^${stamp}$`) }) });

  await t.clock.setSystemTime("2026-10-27T09:47:30-04:00");
  await t.reseed({ scenario: "liveLecture" });
  await page.goto(`/lectures/${t.sample.lectures.mat137Tue}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("MAT137 · Integration by parts");
  await expect(status).toHaveText("Paused");
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();

  // The page clock stands still from here, so 42 s of lecture time is exactly 42 s.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(status).toHaveText("Recording");
  await t.clock.runFor(42_000);
  await expect(status).toHaveText("Recording");
  const progress = page.getByRole("progressbar", { name: "Lecture time" });
  await expect(progress).toHaveAttribute("aria-valuetext", "38 minutes 12 seconds of 50 minutes");
  await expect(page.getByText("38:12 of 50:00", { exact: true })).toBeVisible();
  await expect(log.locator("li time")).toHaveText(["0:45", "6:40", "12:15", "17:05", "24:30", "29:30", "30:02", "30:41", "31:58", "33:20", "35:47", "37:10"]);
  await expect(row("29:30")).toContainText("Okay, let's actually do one. The integral of x e to the x, dx.");
  await expect(row("33:20")).toHaveAttribute("data-state", "flagged");
  await expect(row("33:20")).toContainText("Flagged · on Term Test 2");
  await expect(log.getByRole("listitem").last()).toHaveText(/^Live…the same trick comes back/);
  await expect(log.getByRole("listitem").last()).toHaveText("Live…the same trick comes back, we just apply it a second time to the");

  const firstCard = page.getByTestId(tid.related).getByRole("listitem").first();
  await expect(firstCard).toContainText("33:20");
  await expect(firstCard).toContainText("Term Test 2");
  await expect(firstCard).toContainText("Nov 13 · Prof. Chen says this will be on it");
  await expect(firstCard.locator('[data-state="emphasized"]')).toHaveCount(1);
  await expect(page.getByTestId(tid.related).getByRole("listitem")).toHaveCount(5);
  await page.mouse.move(700, 800);
  await t.shot("lectures-live");
  await page.clock.resume();

  const ask = page.getByRole("textbox", { name: "Ask about the last 5 minutes" });
  await ask.fill("Which choice of u was the mistake?");
  await ask.press("Enter");
  await expect(page.getByRole("button", { name: "Transcript 33:20" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(status).toHaveText("Paused");
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await expect(log.getByRole("listitem").last()).toHaveText(/^Paused at 38:\d\d$/);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(status).toHaveText("Recording");

  await row("35:47").hover();
  await row("35:47").getByRole("button", { name: /^Flag/ }).click();
  await expect(row("35:47")).toHaveAttribute("data-state", "flagged");
  await expect(row("35:47")).toContainText("Flagged by you");
  await row("35:47").getByRole("button", { name: /^Unflag/ }).click();
  await expect(row("35:47")).toHaveAttribute("data-state", "final");
  await expect(row("35:47")).not.toContainText("Flagged");

  const end = page.getByRole("button", { name: "End and save notes" });
  await end.click();
  await expect(page.getByRole("button", { name: "Saving…" })).toBeVisible();
  await expect(status).toHaveText("Saved", { timeout: 15_000 });
  for (const name of ["Summary", "Exam hints · 1", "Key points", "Your questions · 1"]) await expect(page.getByRole("heading", { level: 2, name, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Full transcript · \d+ lines$/ })).toBeVisible();
  await expect(page.getByPlaceholder("Ask about this lecture…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review now" })).toBeVisible();
  await expect(page.getByText("Writing summary…")).toHaveCount(0, { timeout: 15_000 });
  await page.mouse.move(700, 880);
  await t.shot("lectures-saved");
  await t.integrated("Review now opens a started session", async () => {
    await page.getByRole("button", { name: "Review now" }).click();
    await expect(page).toHaveURL(/\/study\/custom\./);
    await expect(page.getByRole("button", { name: "End session" })).toBeVisible();
  });

  await t.clock.setSystemTime("2026-10-27T10:12:00-04:00");
  await t.reseed();
  await page.goto("/lectures");
  await page.getByRole("button", { name: "Record a lecture" }).click();
  const dialog = page.getByRole("dialog", { name: "Record a lecture" });
  await dialog.getByRole("combobox", { name: "Course" }).click();
  await page.getByRole("option", { name: /^CSC148/ }).click();
  await dialog.getByRole("button", { name: "Start recording" }).click();
  await expect(page).toHaveURL(/\/lectures\/lec\.adhoc\./);
  await expect(status).toHaveText("Recording");
  await t.clock.runFor(60_000);
  await expect(row("0:45")).toBeVisible();
  await expect(row("0:45")).toContainText("Okay everyone, let's get started.");
  page.on("dialog", (d) => void d.accept());
  await t.checkNarrow();
}
