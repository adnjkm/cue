// Foundation's step: the first-run state, the shell, the nav Sheet on focus screens and the narrow layout.
export default async function boot(t) {
  const { page, expect } = t;
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add your schedule to plan today.");
  await expect(page.getByRole("button", { name: "Add schedule" })).toBeVisible();
  await page.getByRole("button", { name: "Try the sample semester" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Three sessions today. Start with recursion.", { timeout: 15_000 });

  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText(["Today", "Calendar", "Study sessions", "Lecture notes", "Practice", "Study guides"]);
  await expect(nav.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  await t.shot("boot");

  await expect(page.getByTestId(t.tid.shell.spend)).toHaveCount(0);
  await page.getByRole("button", { name: "Data", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Replace with sample semester…" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Reset all data" })).toBeVisible();
  await expect(page.getByRole("menuitemcheckbox", { name: "Keyboard shortcuts" })).toBeChecked();
  // Loading the sample over stored data asks first, and cancelling keeps the data.
  await page.getByRole("menuitem", { name: "Replace with sample semester…" }).click();
  const replace = page.getByRole("alertdialog", { name: "Replace your data with the sample semester?" });
  await expect(replace).toContainText("can’t be undone");
  await replace.getByRole("button", { name: "Cancel" }).click();
  await expect(replace).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Three sessions today. Start with recursion.");

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
