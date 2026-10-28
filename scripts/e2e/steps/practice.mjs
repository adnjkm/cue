import { tid } from "../../../features/practice/testids.ts";

// Practice: the Paper state on the sample midterm, then the old .verify harness scenarios on a real upload.
export default async function practice(t) {
  const { page, expect } = t;
  await t.reseed();

  await page.goto("/practice");
  await page.getByRole("link", { name: /^CSC148 · 2024 Midterm/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("CSC148 · 2024 Midterm");
  await expect(page.getByText("Question 7 · Multiple choice · 2 marks")).toBeVisible();
  const choices = page.getByRole("group", { name: "Answer choices" });
  await expect(choices.getByRole("button").nth(1)).toContainText("D, E, B, C, A");
  await expect(choices.getByRole("button").nth(1)).toContainText("Your answer · correct");
  await expect(choices.getByRole("button").nth(2)).toContainText("That's inorder");
  await expect(choices.getByRole("button").nth(3)).toContainText("Reversed preorder");
  const solution = page.getByTestId(tid.solution);
  await expect(solution.locator("dt")).toHaveText(["B's subtree", "C's subtree", "Root"]);
  await expect(solution.locator("dd")).toHaveText(["D, E, then B", "C", "A"]);
  await expect(solution.getByText("So the order is D, E, B, C, A.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Relevant resources" }).getByRole("button")).toHaveCount(3);
  const bar = page.getByTestId(tid.bar);
  await expect(bar.getByRole("button", { name: "Question 3, missed" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Question 7, current, correct" })).toBeVisible();
  await t.shot("practice");

  await page.getByRole("button", { name: /^Postorder traversal Lecture 8 slides · Slide 17/ }).click();
  const peek = page.getByTestId(t.tid.source.peek);
  await expect(peek).toContainText("Slide 17");
  await expect(peek).toContainText("Postorder traversal");
  await page.keyboard.press("Escape");
  await expect(peek).toHaveCount(0);
  await expect(page.getByText("Question 7 · Multiple choice · 2 marks")).toBeVisible();

  await page.getByRole("combobox", { name: "Topic" }).click();
  await page.getByRole("option", { name: "Big-O & efficiency" }).click();
  await expect(bar.getByRole("button", { name: /^Question \d+,/ })).toHaveCount(5);

  await page.getByRole("button", { name: "Ask why" }).click();
  const ask = page.getByRole("complementary", { name: "Ask why" });
  await ask.getByRole("textbox", { name: "Ask about this question" }).fill("What is this question testing?");
  await ask.getByRole("textbox", { name: "Ask about this question" }).press("Enter");
  await expect(ask.getByRole("log")).toContainText("Here's", { timeout: 15_000 });
  await page.getByRole("button", { name: "Ask why" }).click();

  await page.getByRole("button", { name: "Write questions" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Write new questions" });
  await dialog.getByRole("button", { name: "5", exact: true }).click();
  await dialog.getByRole("button", { name: "Write questions" }).click();
  await expect(bar.locator('[data-state="generating"]')).toHaveCount(5);
  await expect(bar.getByRole("button", { name: /written by Cue/ })).toHaveCount(5, { timeout: 20_000 });
  await bar.getByRole("button", { name: /^Question 16,/ }).click();
  await expect(page.getByText("Question 16 · Written by Cue · Multiple choice")).toBeVisible();

  await migratedHarness(t);

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/practice$/);
  await t.checkNarrow();
}

/** The scenarios .verify/harness/verify.mjs ran against the pre-shell app, on the same sample PDF. */
async function migratedHarness(t) {
  const { page, expect } = t;
  t.allowFailures(/\/api\/ai\/practice\.(parse|solve)$/);
  let parseCalls = 0;
  await page.route("**/api/ai/practice.parse", async (route) => {
    parseCalls++;
    if (parseCalls === 1) return route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: { kind: "rate_limited", message: "Slow down" } }) });
    return route.continue();
  });
  await page.route("**/api/ai/practice.solve", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.question?.number === "3") {
      return route.fulfill({ status: 402, contentType: "application/json", body: JSON.stringify({ error: { kind: "budget", message: "The spending cap is reached.", capUsd: 30 } }) });
    }
    return route.continue();
  });

  await page.goto("/practice");
  await page.getByLabel("Choose a paper").setInputFiles(t.fixture("practice/sample-quiz.pdf"));
  await expect(page.getByTestId(tid.intake).getByRole("alert")).toContainText("Nemotron is busy right now.", { timeout: 20_000 });
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Finding questions")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("CSC148 · 2024 Midterm", { timeout: 30_000 });
  const bar = page.getByTestId(tid.bar);
  await expect(bar.getByRole("button", { name: /^Question \d+,/ })).toHaveCount(5);

  await page.locator("main").first().click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("2");
  await expect(page.getByRole("group", { name: "Answer choices" }).getByRole("button").nth(1)).toContainText("Your answer · correct");

  await bar.getByRole("button", { name: /^Question 3,/ }).click();
  await page.getByRole("group", { name: "Answer choices" }).getByRole("button").first().click();
  await expect(page.getByTestId(tid.solution)).toContainText("The $30 spending cap is reached.");

  await bar.getByRole("button", { name: /^Question 4,/ }).click();
  await page.getByRole("group", { name: "Answer choices" }).getByRole("button").nth(2).click();
  await expect(page.getByRole("group", { name: "Answer choices" })).toContainText(/Your answer · (checking…|correct)/);
  await expect(page.getByRole("group", { name: "Answer choices" })).toContainText("Your answer · correct", { timeout: 15_000 });

  await bar.getByRole("button", { name: /^Question 5,/ }).click();
  await expect(page.getByRole("img", { name: "Figure for question 5, from page 1" })).toBeVisible();

  await page.reload();
  await expect(bar.getByRole("button", { name: "Question 1, correct" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Question 4, correct" })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^Question 5, current/ })).toBeVisible();
  await page.unroute("**/api/ai/practice.parse");
  await page.unroute("**/api/ai/practice.solve");
}
