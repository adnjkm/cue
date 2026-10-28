import { tid } from "../../../features/today/testids.ts";

const REVIEW = "/study/review.evt_sample_csc148_l08.2";

// Today: the Paper day at 10:12, every entry point, then the missed review rescheduled from the list.
export default async function today(t) {
  const { page, expect } = t;
  await t.reseed();
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Three sessions today. Start with recursion.");
  await expect(
    page.getByText("Your CSC148 midterm is in 10 days, so Cue moved this morning's review up. Everything you need is already pulled from yesterday's lecture.", { exact: true }),
  ).toBeVisible();

  const card = page.getByTestId(tid.nextUp);
  await expect(card).toContainText("CSC148");
  await expect(card).toContainText("Next up · 10:30–11:15am · Review 1 day after lecture");
  await expect(card.getByRole("heading", { level: 2 })).toHaveText("Recursion & tree traversal");
  await expect(card.getByRole("link")).toHaveText(["Lecture 8 slides", "Lecture 8 transcript", "Lab 6 handout", "+ 12 practice Qs", "Start session"]);
  await expect(card.getByRole("link", { name: "Lecture 8 transcript" })).toHaveAttribute("href", `${REVIEW}?tab=transcript`);
  await expect(card.getByRole("link", { name: "Lab 6 handout" })).toHaveAttribute("href", `${REVIEW}?tab=handout`);
  await expect(card.getByRole("link", { name: "+ 12 practice Qs" })).toHaveAttribute("href", `/practice/${t.sample.sets.csc148Midterm2024}?topic=Recursion+%26+tree+traversal`);

  const timeline = page.getByTestId(tid.timeline);
  await expect(timeline).toContainText("4 blocks · 3h 15m of study");
  const items = page.getByRole("list", { name: "Today" }).getByRole("listitem");
  await expect(items).toHaveText([
    "9am MAT137 Lecture — Integration by parts Transcript ready",
    "10:30am CSC148 Review — Recursion & tree traversal After-lecture · 45m",
    "2pm PSY100 Mid-week review — Memory & learning Mid-week · 30m",
    "7pm ECO101 Work block — Problem Set 4 Due Thu · 2h",
  ], { useInnerText: true });
  await expect(items.nth(1)).toHaveAttribute("aria-current", "time");
  await expect(page.locator('[aria-current="time"]')).toHaveCount(1);
  await t.shot("today");

  await card.getByRole("link", { name: "Lecture 8 slides" }).click();
  await expect(page).toHaveURL(`${REVIEW}?tab=slides`);
  await expect(page.getByRole("button", { name: "End session" })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Three sessions today. Start with recursion.");

  await card.getByRole("link", { name: "Start session" }).click();
  await expect(page).toHaveURL(new RegExp(`${REVIEW.replace(/\./g, "\\.")}(\\?|$)`));
  await t.integrated("Start opens the session", async () => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("CSC148 · Recursion & tree traversal");
  });
  await page.goBack();

  await items.nth(0).getByRole("link").click();
  await expect(page).toHaveURL("/lectures/lec.evt_sample_mat137_tue");
  await page.goBack();

  // Starting the session above writes a session row once Study lands, so the missed path starts from a fresh seed.
  await t.reseed();
  await t.clock.setSystemTime("2026-10-27T11:40:00-04:00");
  await page.goto("/");
  const review = items.filter({ hasText: "Review — Recursion & tree traversal" });
  await expect(review).toHaveAttribute("data-state", "missed");
  await expect(review).toContainText("Missed · Reschedule");
  await expect(items.nth(2)).toHaveAttribute("aria-current", "time");
  await review.getByRole("button", { name: "Reschedule" }).focus();
  await page.keyboard.press("Enter");
  const moved = items.filter({ hasText: "11:45am" }).filter({ hasText: "Review — Recursion & tree traversal" });
  await expect(moved).toHaveCount(1);
  await expect(moved).toHaveAttribute("data-state", "current");
  await expect(moved.getByRole("link")).toBeFocused();
  await expect(page.getByText("Moved to 11:45am.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Three sessions today. Start with recursion.");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Moved to 11:45am.")).toHaveCount(0);
  await expect(review).toHaveAttribute("data-state", "missed");
  await expect(review).toContainText("10:30am");
  await expect(review.getByRole("link")).toBeFocused();

  await page.getByRole("button", { name: "Data", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reset all data" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reset all data" }).click();
  const h1 = page.getByRole("heading", { level: 1 });
  await expect(h1).toHaveText("Add your schedule to plan today.");
  await expect(page.getByText("Upload a course timetable or any calendar file. Cue fits study sessions around it.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Upload calendar" }).click();
  await expect(page).toHaveURL("/calendar?add=1");
  await page.goBack();
  await page.getByRole("button", { name: "Try the sample semester" }).focus();
  await page.keyboard.press("Enter");
  await expect(h1).not.toHaveText("Add your schedule to plan today.", { timeout: 15_000 });
  await expect(h1).toBeFocused();

  await t.checkNarrow();
}
