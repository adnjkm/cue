import { tid } from "../../../features/calendar/testids.ts";

/** The 25 buttons of the Paper week (docs/design/calendar.md), as accessible-name prefixes. */
const PAPER_WEEK = [
  "CSC148 A2 due 11:59pm, Wednesday 28 October",
  "ECO101 PS4 due 5pm, Thursday 29 October",
  "PSY100 quiz due 12pm, Friday 30 October",
  "CSC148 Lecture, Monday 26 October, 10 to 11am, BA 1160",
  "Review · Trees, Monday 26 October, 11:15am to 12pm",
  "PSY100 Lecture, Monday 26 October, 2 to 3pm, MS 2158",
  "Review · Memory, Monday 26 October, 3 to 3:30pm",
  "MAT137 Lecture, Tuesday 27 October, 9 to 10am, MP 102",
  "Review · Recursion, Tuesday 27 October, 10:30 to 11:15am",
  "Mid-week · PSY, Tuesday 27 October, 2 to 2:30pm",
  "Work block · PS4, Tuesday 27 October, 7 to 9pm",
  "CSC148 Lecture, Wednesday 28 October, 10 to 11am, BA 1160",
  "Review · Lec 9, Wednesday 28 October, 11:15am to 12pm",
  "ECO101 Lecture, Wednesday 28 October, 1 to 2pm, SS 2102",
  "Review · Elasticity, Wednesday 28 October, 2 to 2:30pm",
  "A2 final push, Wednesday 28 October, 6 to 8pm",
  "MAT137 Lecture, Thursday 29 October, 9 to 10am, MP 102",
  "Review · By parts, Thursday 29 October, 10:15 to 11am",
  "Mid-week · CSC, Thursday 29 October, 4 to 4:45pm",
  "CSC148 Lecture, Friday 30 October, 10 to 11am, BA 1160",
  "PSY100 Lecture, Friday 30 October, 2 to 3pm, MS 2158",
  "Review · Ch. 8, Friday 30 October, 3 to 3:30pm",
  "End-of-week review, Saturday 31 October, 11am to 12:30pm",
  "Test 2 prep · 1 of 4, Sunday 1 November, 1 to 2pm",
  "Midterm prep · 3 of 6, Sunday 1 November, 3 to 5pm, Past paper, timed",
];

// Calendar: the Paper week at 10:40, block and lecture popovers, day and month, ICS import with Undo, the vision import preview.
export default async function calendar(t) {
  const { page, expect } = t;
  await t.clock.setSystemTime("2026-10-27T10:40:00-04:00");
  await t.reseed();

  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/calendar\?view=week&date=2026-10-27$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("October 2026");
  await expect(page.getByRole("columnheader", { name: "Tuesday 27 October" })).toHaveAttribute("aria-current", "date");
  await expect(page.locator('[role="columnheader"][aria-current="date"]')).toHaveCount(1);
  await expect.poll(() => page.getByTestId(tid.hours).evaluate((el) => el.scrollTop)).toBe(360);

  const week = page.getByTestId(tid.weekGrid);
  await expect(week.getByRole("button")).toHaveCount(25);
  await expect(week.locator('[data-kind="lecture"]')).toHaveCount(8);
  await expect(week.locator('[data-kind="block"]')).toHaveCount(14);
  await expect(week.locator('[data-kind="deadline"]')).toHaveCount(3);
  const names = await week.getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  for (const expected of PAPER_WEEK) {
    const matches = names.filter((n) => n === expected || n.startsWith(`${expected}, `));
    if (matches.length !== 1) throw new Error(`Paper week row "${expected}" matched ${matches.length} buttons:\n${names.join("\n")}`);
  }

  const recursion = page.getByRole("button", { name: "Review · Recursion, Tuesday 27 October, 10:30 to 11:15am" });
  await expect(recursion).toContainText("10:30–11:15am · now");
  await expect(recursion).toHaveAttribute("data-state", "now");
  await expect(page.getByRole("button", { name: "CSC148 A2 due 11:59pm" })).toBeVisible();
  await t.shot("calendar-week");

  const midweek = week.getByRole("button", { name: /^Mid-week · PSY, Tuesday 27 October/ });
  await midweek.click();
  const blockPopover = page.getByRole("dialog");
  await expect(blockPopover.getByRole("link", { name: "Start session" })).toHaveAttribute("href", "/study/midweek.PSY100.2026-W44?start=1");
  await expect(blockPopover.getByRole("button", { name: "Reschedule" })).toBeVisible();
  await blockPopover.getByRole("button", { name: "Mark done" }).click();
  await expect(blockPopover).toHaveCount(0);
  await expect(midweek).toContainText("Mid-week · PSY · done");
  await expect(midweek).toHaveAttribute("data-state", "done");
  await expect(midweek).toHaveAccessibleName(/, done$/);
  await t.integrated("Start session from another block opens the session screen", async () => {
    await week.getByRole("button", { name: /^Review · By parts, Thursday 29 October/ }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Start session" }).click();
    await expect(page).toHaveURL(/\/study\/review\.evt_sample_mat137_thu\.1/);
    await expect(page.getByRole("button", { name: "End session" })).toBeVisible({ timeout: 15_000 });
    await page.goBack();
    await expect(page.getByTestId(tid.weekGrid)).toBeVisible();
  });

  await page.getByRole("button", { name: "MAT137 Lecture, Thursday 29 October, 9 to 10am, MP 102" }).click();
  const lecturePopover = page.getByRole("dialog");
  await expect(lecturePopover.getByRole("link", { name: "Take notes" })).toHaveAttribute("href", "/lectures/lec.evt_sample_mat137_thu");
  await t.integrated("Take notes opens the note taker ready to record", async () => {
    await lecturePopover.getByRole("link", { name: "Take notes" }).click();
    await expect(page.getByRole("button", { name: "Start recording" })).toBeVisible({ timeout: 15_000 });
    await page.goBack();
    await expect(page.getByTestId(tid.weekGrid)).toBeVisible();
  });
  if (await lecturePopover.count()) await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const view = page.getByRole("combobox", { name: "View" });
  await view.click();
  await page.getByRole("option", { name: "Day" }).click();
  await expect(page).toHaveURL(/view=day&date=2026-10-27/);
  const day = page.getByTestId(tid.dayGrid);
  await expect(day.getByRole("button")).toHaveCount(4);
  await expect(day.getByRole("button", { name: /^Review · Recursion,/ })).toContainText("10:30–11:15am · now");
  await expect.poll(() => page.getByTestId(tid.hours).evaluate((el) => el.scrollTop)).toBe(360);
  await t.shot("calendar-day");

  await view.click();
  await page.getByRole("option", { name: "Month" }).click();
  await expect(page).toHaveURL(/view=month&date=2026-10-27/);
  const month = page.getByTestId(tid.monthGrid);
  const wed = month.locator('[data-date="2026-10-28"]');
  await expect(wed.getByRole("button", { name: "+2 more" })).toBeVisible();
  await expect(wed.locator("[data-kind]")).toHaveText(["CSC148 A2 due 11:59pm", "Review · Lec 9"]);
  const tue = month.locator('[data-date="2026-10-27"]');
  await expect(tue.getByRole("button")).toHaveCount(3);
  await expect(tue.getByRole("button")).toHaveText(["Review · Recursion · now", "Mid-week · PSY · done", "Work block · PS4"]);
  await expect(tue.getByText(/more$/)).toHaveCount(0);
  await expect(month.getByRole("link", { name: /^Tuesday 27 October/ })).toHaveAttribute("aria-current", "date");
  await t.shot("calendar-month");

  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("November 2026");
  await page.getByRole("button", { name: "Previous month" }).click();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("September 2026");
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("October 2026");
  await expect(page).toHaveURL(/view=month&date=2026-10-27/);

  await view.click();
  await page.getByRole("option", { name: "Week" }).click();
  await expect(page).toHaveURL(/view=week&date=2026-10-27/);
  await page.getByRole("button", { name: "Add schedule" }).click();
  const dialog = page.getByRole("dialog", { name: "Add schedule" });
  await dialog.locator('input[type="file"]').setInputFiles(t.fixture("calendar/timetable.ics"));
  const ast = dialog.getByRole("checkbox", { name: /^AST101 · Tue, Thu 3–4pm · / });
  await expect(ast).toBeChecked();
  await dialog.getByRole("button", { name: "Add 1 course" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/^Added 1 course\. Cue planned \d+ study blocks\.$/)).toBeVisible();
  await expect(week.getByRole("button", { name: /^AST101 Lecture, Tuesday 27 October, 3 to 4pm/ })).toBeVisible();
  const overlaps = await week.locator('[role="rowgroup"] [role="cell"]').evaluateAll((cells) =>
    cells.flatMap((cell, col) => {
      const box = (el) => el.getBoundingClientRect();
      const lectures = [...cell.querySelectorAll('[data-kind="lecture"]')].map(box);
      return [...cell.querySelectorAll('[data-kind="block"]')].map(box).flatMap((b) => lectures.filter((l) => b.x < l.x + l.width && l.x < b.x + b.width && b.y < l.y + l.height && l.y < b.y + b.height).map(() => col));
    }),
  );
  if (overlaps.length) throw new Error(`Study blocks overlap lectures in day columns ${overlaps.join(", ")}`);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(week.getByText("AST101")).toHaveCount(0);
  await expect(week.getByRole("button", { name: /AST101/ })).toHaveCount(0);
  await expect(week.getByRole("button")).toHaveCount(25);

  await page.getByRole("button", { name: "Add schedule" }).click();
  await dialog.locator('input[type="file"]').setInputFiles(t.fixture("calendar/timetable.png"));
  await expect(dialog.getByRole("checkbox", { name: /^BIO130 · Mon, Wed 1–2pm · MS 2172$/ })).toBeChecked({ timeout: 15_000 });
  await expect(dialog.getByRole("checkbox", { name: /^PHL100 · Tue, Thu 11am–12pm · SS 2117$/ })).toBeChecked();
  await expect(dialog.getByRole("button", { name: "Add 2 courses" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(week.getByRole("button", { name: /BIO130|PHL100/ })).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/calendar\?view=day&date=2026-10-27$/);
  await expect(page.getByTestId(tid.dayGrid)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Oct 2026");
  await page.setViewportSize({ width: 1440, height: 900 });
  await t.checkNarrow();
}
