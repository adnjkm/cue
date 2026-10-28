import { tid } from "../../../features/practice/testids.ts";

const ECO_SECTION = { kind: "section", courseId: "ECO101", sectionId: "ECO101.price-elasticity-of-demand" };

/** Same codec as generateParam in lib/routes: base64url JSON. */
const generateUrl = (scope) => `/practice?generate=${Buffer.from(JSON.stringify(scope)).toString("base64url")}`;

/** Paper's screen is judged on a settled frame: fonts loaded and every entrance animation finished. */
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined)));
  });
}

// Practice: the Paper state on the sample midterm, Cue writing questions in a paper and from a guide section, then the old .verify harness on a real upload.
export default async function practice(t) {
  const { page, expect } = t;
  await t.reseed();

  await page.goto("/practice");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Practice");
  await expect(page.getByText("17 questions left to try across 3 sets.")).toBeVisible();
  const papers = page.getByRole("region", { name: "Papers" });
  await expect(papers.getByRole("link")).toHaveCount(3);
  await expect(papers.getByRole("link", { name: /^CSC148 · 2024 Midterm, 8 of 15 answered$/ })).toBeVisible();
  await settle(page);
  await t.shot("practice-index");
  await papers.getByRole("link", { name: /^CSC148 · 2024 Midterm/ }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("CSC148 · 2024 Midterm");
  await expect(page.getByText("Question 7 · Multiple choice · 2 marks")).toBeVisible();
  const choices = page.getByRole("group", { name: "Answer choices" });
  await expect(choices.getByRole("button")).toHaveCount(4);
  await expect(choices.getByRole("button").nth(1)).toContainText("D, E, B, C, A");
  await expect(choices.getByRole("button").nth(1)).toContainText("Your answer · correct");
  await expect(choices.getByRole("button").nth(2)).toContainText("That's inorder");
  await expect(choices.getByRole("button").nth(3)).toContainText("Reversed preorder");
  const solution = page.getByTestId(tid.solution);
  await expect(solution.locator("dt")).toHaveText(["B's subtree", "C's subtree", "Root"]);
  await expect(solution.locator("dd")).toHaveText(["D, E, then B", "C", "A"]);
  await expect(solution.getByText("So the order is D, E, B, C, A.")).toBeVisible();
  await expect(solution.getByText("The original exam had no answer key; Cue wrote this from Lecture 8.")).toBeVisible();
  const resources = page.getByRole("list", { name: "Relevant resources" }).getByRole("button");
  await expect(resources).toHaveText([/^Postorder traversal\s*Lecture 8 slides · Slide 17$/, /^“Delete the children before the parent”\s*Lecture 8 transcript · 41:05$/, /^Tree traversals\s*Course notes · §5\.3$/]);
  const bar = page.getByTestId(tid.bar);
  await expect(bar.getByRole("button", { name: "Question 3, missed" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Question 7, current, correct" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Question 7, current, correct" })).toHaveAttribute("aria-current", "true");
  await expect(bar.getByRole("group")).toHaveText([/^Recursion & trees\s*123478$/, /^Big-O & efficiency\s*5691011$/, /^Linked lists\s*12131415$/]);
  await settle(page);
  await t.shot("practice");

  await page.getByRole("button", { name: /^Postorder traversal Lecture 8 slides · Slide 17/ }).click();
  const peek = page.getByTestId(t.tid.source.peek);
  await expect(peek).toContainText("Slide 17");
  await expect(peek).toContainText("Postorder traversal");
  await page.keyboard.press("Escape");
  await expect(peek).toHaveCount(0);
  await expect(page.getByText("Question 7 · Multiple choice · 2 marks")).toBeVisible();

  // The bar is one Tab stop: arrows move between tiles without leaving question 7.
  await bar.getByRole("button", { name: "Question 7, current, correct" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(bar.getByRole("button", { name: "Question 8, not answered" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(bar.getByRole("button", { name: "Question 1, correct" })).toBeFocused();
  await expect(page.getByText("Question 7 · Multiple choice · 2 marks")).toBeVisible();

  const eyebrow = page.locator("article").getByText(/^Question \d+ · /);
  await bar.getByRole("button", { name: "Question 8, not answered" }).click();
  await expect(eyebrow).toHaveText(/^Question 8 · /);
  await expect(bar.getByRole("button", { name: /^Question 8, current/ })).toBeFocused();
  await page.keyboard.press("2");
  await expect(choices.getByRole("button").nth(1)).toContainText(/Your answer · (correct|wrong|checking…)/);
  const q8Resources = page.getByRole("list", { name: "Relevant resources" }).getByRole("button");
  await expect(q8Resources).toHaveCount(3, { timeout: 15_000 });
  await expect(q8Resources).toHaveText([/Lecture 8 slides · Slide \d+$/, /Lecture 8 slides · Slide \d+$/, /Lecture 8 slides · Slide \d+$/]);
  await expect(solution).toContainText("The original exam had no answer key; Cue wrote this from Lecture 8.");
  await solution.getByRole("button", { name: "Next unanswered" }).click();
  await expect(eyebrow).toHaveText(/^Question 10 · /);

  await page.getByRole("combobox", { name: "Topic" }).click();
  await page.getByRole("option", { name: "Big-O & efficiency" }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Topic" })).toBeFocused();
  await expect(bar.getByRole("button", { name: /^Question \d+,/ })).toHaveCount(5);
  await expect(eyebrow).toHaveText(/^Question 10 · /);
  await page.keyboard.press("ArrowRight");
  await expect(eyebrow).toHaveText(/^Question 11 · /);
  await page.keyboard.press("ArrowLeft");
  await expect(eyebrow).toHaveText(/^Question 10 · /);

  const askToggle = page.getByRole("button", { name: "Ask why" });
  const ask = page.getByRole("complementary", { name: "Ask why" });
  const composer = ask.getByRole("textbox", { name: "Ask about this question" });
  await askToggle.click();
  await expect(askToggle).toHaveAttribute("aria-pressed", "true");
  await expect(composer).toBeFocused();
  await composer.fill("What is this question testing?");
  await composer.press("Enter");
  await expect(ask.getByRole("log")).toContainText("Here's", { timeout: 15_000 });
  await composer.press("Escape");
  await expect(ask).toHaveCount(0);
  await expect(askToggle).toBeFocused();
  await page.locator("main").first().click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("?");
  await expect(composer).toBeFocused();
  await askToggle.click();
  await expect(ask).toHaveCount(0);

  await page.getByRole("button", { name: "Write questions" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Write new questions" });
  await expect(dialog.getByRole("combobox", { name: "Topic for new questions" })).toHaveText(/Big-O & efficiency/);
  await dialog.getByRole("button", { name: "5", exact: true }).click();
  await dialog.getByRole("button", { name: "Write questions" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(bar.locator('[data-state="generating"]')).toHaveCount(5);
  await t.shot("practice-writing");
  await expect(bar.getByRole("button", { name: /written by Cue/ })).toHaveCount(5, { timeout: 20_000 });
  await expect(bar.locator('[data-state="generating"]')).toHaveCount(0);
  await expect(bar.getByRole("group", { name: "Big-O & efficiency" }).getByRole("button")).toHaveCount(10);
  await bar.getByRole("button", { name: /^Question 16,/ }).click();
  await expect(page.getByText("Question 16 · Written by Cue · Multiple choice")).toBeVisible();
  await choices.getByRole("button").nth(2).click();
  await expect(choices.getByRole("button").nth(2)).toContainText("Your answer · correct");
  await expect(solution.getByText(/^Cue wrote this question from (Lecture \d+ and )?the 2024 Midterm\.$/)).toBeVisible();

  await page.goto(generateUrl(ECO_SECTION));
  await expect(page).toHaveURL(/\/practice\/set_[\w-]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ECO101 · Price elasticity of demand");
  await expect(page.getByText("Question 1 · Written by Cue · Multiple choice")).toBeVisible({ timeout: 15_000 });
  await expect(bar.getByRole("button", { name: /written by Cue/ })).toHaveCount(5, { timeout: 20_000 });
  await choices.getByRole("button").nth(1).click();
  await expect(choices.getByRole("button").nth(1)).toContainText("Your answer · correct");
  await expect(solution.getByText("Cue wrote this question from ECO101 guide · Price elasticity of demand.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Relevant resources" }).getByRole("button").first()).toHaveText(/^Price elasticity of demand\s*ECO101 study guide$/);
  await settle(page);
  await t.shot("practice-from-guide");

  await page.goto(`/practice?generate=${Buffer.from("{not a scope").toString("base64url")}`);
  await expect(page.getByTestId(t.tid.shell.main).getByRole("alert")).toContainText("That link to write questions is broken.");

  await page.goto("/practice/set_not_on_this_device");
  await expect(page.getByRole("main")).toContainText("This practice set isn't on this device.");

  await migratedHarness(t);

  await page.getByRole("combobox", { name: "Topic" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page).toHaveURL(/\/practice\/set_[\w-]+$/);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByRole("region", { name: "Written by Cue" }).getByRole("link", { name: /^ECO101 · Price elasticity of demand/ })).toBeVisible();
  await t.checkNarrow();

  await t.reseed();
  await page.goto(`/practice/${t.sample.sets.csc148Midterm2024}`);
  await expect(page.getByText("Question 7 · Multiple choice · 2 marks")).toBeVisible();
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
  let releaseQ4;
  const q4Held = new Promise((resolve) => (releaseQ4 = resolve));
  await page.route("**/api/ai/practice.solve", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.question?.number === "3") {
      return route.fulfill({ status: 402, contentType: "application/json", body: JSON.stringify({ error: { kind: "budget", message: "The spending cap is reached.", capUsd: 30 } }) });
    }
    if (body?.question?.number === "4") await q4Held;
    return route.continue();
  });

  await page.goto("/practice");
  await page.getByLabel("Choose a paper").setInputFiles(t.fixture("practice/sample-quiz.pdf"));
  const intake = page.getByTestId(tid.intake);
  await expect(intake.getByRole("alert")).toContainText("Nemotron is busy right now.", { timeout: 20_000 });
  await expect(intake.getByRole("alert")).toContainText("Try again in a moment.");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(intake.getByRole("status")).toContainText("Finding questions");
  await expect(intake.getByRole("progressbar", { name: "Upload progress" })).toBeVisible();
  await t.shot("practice-upload");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("CSC148 · Fall 2024 Midterm", { timeout: 30_000 });
  expect(parseCalls).toBe(2);
  const bar = page.getByTestId(tid.bar);
  await expect(bar.getByRole("button", { name: /^Question \d+,/ })).toHaveCount(5);
  const choices = page.getByRole("group", { name: "Answer choices" });

  await page.locator("main").first().click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("2");
  await expect(choices.getByRole("button").nth(1)).toContainText("Your answer · correct");
  await expect(page.getByTestId(tid.solution)).toContainText("The answer is from the official answer key");

  await bar.getByRole("button", { name: /^Question 3,/ }).click();
  await choices.getByRole("button").nth(1).click();
  await expect(page.getByTestId(tid.solution)).toContainText("The $30 spending cap is reached.");
  await expect(choices.getByRole("button").nth(1)).toContainText("Your answer · wrong");
  await expect(choices.getByRole("button").first()).toContainText("Correct answer");

  await bar.getByRole("button", { name: /^Question 4,/ }).click();
  await choices.getByRole("button").nth(2).click();
  await expect(choices.getByRole("button").nth(2)).toContainText("Your answer · checking…");
  await expect(bar.getByRole("button", { name: "Question 4, current" })).toBeVisible();
  releaseQ4();
  await expect(choices.getByRole("button").nth(2)).toContainText("Your answer · correct", { timeout: 15_000 });

  await bar.getByRole("button", { name: /^Question 5,/ }).click();
  await expect(page.getByRole("img", { name: "Figure for question 5, from page 1" })).toBeVisible();

  await page.reload();
  await expect(bar.getByRole("button", { name: "Question 1, correct" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Question 3, missed" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Question 4, correct" })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^Question 5, current/ })).toBeVisible();
  await page.unroute("**/api/ai/practice.parse");
  await page.unroute("**/api/ai/practice.solve");
}
