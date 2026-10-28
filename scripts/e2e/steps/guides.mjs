// Study guides' main path: docs/architecture.md section 13.3, "guides (G)".
import { tid } from "../../../features/guides/testids.ts";

export default async function guides(t) {
  const { page, expect } = t;
  await t.reseed();

  await page.goto("/guides");
  await expect(page).toHaveURL(/\/guides\/ECO101\/price-elasticity-of-demand$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ECO101 · Study guide");
  const contents = page.getByRole("navigation", { name: "Contents" });
  await expect(contents.getByRole("link", { name: "Price elasticity of demand", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(contents.getByRole("link")).toHaveText(["Thinking like an economist", "Gains from trade", "Supply and demand", "Elasticity", "What elasticity measures", "Price elasticity of demand", "Elasticity and total revenue", "Elasticity of supply", "Government policy"]);

  const figures = page.getByRole("article").getByRole("img");
  await expect(figures).toHaveCount(2);
  await expect(figures.nth(0)).toHaveAccessibleName(/^Elastic demand curve/);
  await expect(figures.nth(1)).toHaveAccessibleName(/^Inelastic demand curve/);
  const inelasticLabels = figures.nth(1).locator("text");
  await expect(inelasticLabels.filter({ hasText: /^Q2 Q1$/ })).toHaveCount(1);
  await expect(inelasticLabels.filter({ hasText: /^Q[12]$/ })).toHaveCount(0);
  await expect(page.getByRole("note", { name: "Common mistake · will be on the midterm" })).toBeVisible();
  await expect(page.getByRole("math")).toHaveCount(1);

  const sources = page.getByRole("region", { name: "Sources" });
  await expect(sources.getByRole("listitem")).toHaveCount(4);
  const footnoteText = sources.getByTestId(tid.footnoteText);
  await expect(footnoteText.nth(0)).toHaveText("Lecture 7 at 4:15. Textbook ch. 5, p. 92.");
  await expect(footnoteText.nth(2)).toHaveText("Lecture 7 at 18:40, redrawn from the whiteboard sketch. Textbook Figure 5-1.");
  await page.getByRole("link", { name: "Footnote 1", exact: true }).click();
  await expect(page.locator("#fn-1")).toBeFocused();
  await page.mouse.move(0, 0);
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await t.shot("guides");

  await page.getByRole("combobox", { name: "Course" }).click();
  await page.getByRole("option", { name: "CSC148" }).click();
  await expect(page).toHaveURL(/\/guides\/CSC148(\/|$)/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("CSC148 · Study guide");
  await page.evaluate(() => {
    const seen = (window.__guidePlaceholders = []);
    new MutationObserver(() => {
      const n = document.querySelectorAll('[data-state="generating"]').length;
      const blocks = document.querySelectorAll("[data-block]").length;
      if (seen.at(-1)?.join() !== [n, blocks].join()) seen.push([n, blocks]);
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
  await page.getByRole("button", { name: "Write this guide" }).click();
  await expect(page).toHaveURL(/\/guides\/CSC148\/trees-and-their-parts$/);
  await expect(page.getByRole("heading", { level: 2, name: "Trees and their parts" })).toBeVisible();
  await expect(page.locator('[data-state="generating"]').first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Writing this section from / })).toBeVisible();
  await expect(page.locator('[data-state="generating"]')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("region", { name: "Sources" }).getByRole("listitem").first()).toBeVisible();
  const fills = await page.evaluate(() => window.__guidePlaceholders);
  const partial = fills.filter(([placeholders, blocks]) => placeholders > 0 && blocks > 0);
  if (partial.length < 2) throw new Error(`Expected placeholders to fill block by block, saw ${JSON.stringify(fills)}`);
  await expect(page.getByRole("navigation", { name: "Contents" }).getByRole("link", { name: "Trees and their parts" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Quiz me on this section" })).toBeVisible();
  const code = page.getByRole("figure", { name: /^Tree\.is_empty is true/ }).locator("pre");
  await expect(code).toContainText("def is_empty(self) -> bool:");
  await expect(code).toHaveCSS("white-space", "pre");
  await expect(code).toHaveCSS("overflow-x", "auto");
  await t.checkNarrow();

  await page.goto("/guides/ECO101");
  await expect(page).toHaveURL(/\/guides\/ECO101\/price-elasticity-of-demand$/);
  await expect(page.getByRole("heading", { level: 2, name: "Price elasticity of demand" })).toBeVisible();
  await page.getByRole("button", { name: "Add material" }).click();
  const dialog = page.getByRole("dialog", { name: "Add material" });
  await dialog.getByLabel("File").setInputFiles(t.fixture("guides/eco101-lecture8-slides.pdf"));
  await dialog.getByLabel("Title (optional)").fill("Lecture 8 slides");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  const staleLine = page.getByRole("status").filter({ hasText: "Lecture 8 slides added. Rewrite this section?" });
  await expect(staleLine).toBeVisible();
  await staleLine.getByRole("button", { name: "Rewrite" }).click();
  await expect(staleLine).toHaveCount(0);
  await expect(page.locator('[data-state="generating"]')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("status").filter({ hasText: "Rewrite this section?" })).toHaveCount(0);
  await expect(page.getByRole("note", { name: "Common mistake · will be on the midterm" })).toBeVisible();

  await page.evaluate(() => {
    window.__printCalls = 0;
    window.print = () => {
      window.__printCalls += 1;
    };
  });
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect(page).toHaveURL(/\/export\/guide\/ECO101$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ECO101 · Study guide");
  await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to guide" })).toBeHidden();
  await expect(page.getByRole("heading", { level: 3, name: "Price elasticity of demand" })).toBeVisible();
  await expect(page.getByRole("img")).toHaveCount(2);
  await t.shot("guides-print");
  await page.waitForTimeout(500);
  await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);
  await page.emulateMedia({ media: "screen" });

  await page.goto("/guides/ECO101/price-elasticity-of-demand");
  await expect(page.getByRole("heading", { level: 2, name: "Price elasticity of demand" })).toBeVisible();
  await page.keyboard.press("]");
  await expect(page).toHaveURL(/\/guides\/ECO101\/elasticity-and-total-revenue$/);
  await expect(page.getByRole("heading", { level: 2, name: "Elasticity and total revenue" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Contents" }).getByRole("link", { name: "Elasticity and total revenue" })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("[");
  await expect(page).toHaveURL(/\/guides\/ECO101\/price-elasticity-of-demand$/);

  const quiz = page.getByRole("link", { name: "Quiz me on this section" });
  const target = new URL((await quiz.getAttribute("href")) ?? "", "http://cue.local");
  if (target.pathname !== "/practice") throw new Error(`Quiz me goes to ${target.pathname}, not /practice`);
  const scope = JSON.parse(Buffer.from(target.searchParams.get("generate") ?? "", "base64url").toString("utf8"));
  if (JSON.stringify(scope) !== JSON.stringify({ kind: "section", courseId: "ECO101", sectionId: "ECO101.price-elasticity-of-demand" })) {
    throw new Error(`Quiz me carries the wrong scope: ${JSON.stringify(scope)}`);
  }
  await t.integrated("Quiz me opens a generated set from this section", async () => {
    await quiz.click();
    await expect(page).toHaveURL(/\/practice\/set_[\w-]+/, { timeout: 30_000 });
    await expect(page.getByText("ECO101 guide · Price elasticity of demand").first()).toBeVisible({ timeout: 30_000 });
    await page.goto("/guides/ECO101/price-elasticity-of-demand");
  });

  await t.checkNarrow();
}
