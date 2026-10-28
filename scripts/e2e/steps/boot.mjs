// Foundation's step: the first-run state, the shell, the nav Sheet on focus screens and the narrow layout.
export default async function boot(t) {
  const { page, expect } = t;
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add your schedule to plan today.");
  await expect(page.getByRole("button", { name: "Upload calendar" })).toBeVisible();
  await page.getByRole("button", { name: "Try the sample semester" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Three sessions today. Start with recursion.", { timeout: 15_000 });

  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText(["Today", "Calendar", "Study sessions", "Lecture notes", "Practice", "Study guides"]);
  await expect(nav.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  await t.shot("boot");

  await expect(page.getByTestId(t.tid.shell.spend)).toHaveCount(0);
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Load sample semester" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Reset all data" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto(`/practice/${t.sample.sets.csc148Midterm2024}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("CSC148 · 2024 Midterm");
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+b");
  const sheet = page.getByRole("dialog", { name: "Navigation" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveCount(6);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  await page.goto("/");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await t.checkNarrow();
}
