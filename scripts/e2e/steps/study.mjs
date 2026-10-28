import { tid } from "../../../features/study/testids.ts";

const at = (time) => new Date(`2026-10-27T${time}-04:00`);

// Study sessions: the Paper session at 10:30 + 13:12, Quick and Deep asks, the budget notice, End session, then a preview.
export default async function study(t) {
  const { page, expect } = t;
  const quick = { timeout: 250 };
  // The clock is paused for the timer strings. IndexedDB updates and dialog exits wait on timers, so let 1 ms pass until the check holds.
  const settle = async (check) => {
    for (let i = 0; ; i++) {
      try {
        return await check();
      } catch (e) {
        if (i >= 60) throw e;
        await page.clock.runFor(1);
      }
    }
  };
  /** Records every text the streaming reply shows, so a check can prove what came first. */
  const recordReplies = () =>
    page.evaluate((testId) => {
      const thread = document.querySelector(`[data-testid="${testId}"]`);
      window.__replies = [];
      new MutationObserver(() => {
        const busy = thread.querySelector("article[aria-busy=true]");
        const text = busy?.textContent?.trim();
        if (text && window.__replies.at(-1) !== text) window.__replies.push(text);
      }).observe(thread, { subtree: true, childList: true, characterData: true });
    }, t.tid.chat.thread);

  await t.reseed();
  await page.clock.pauseAt(at("10:30:00"));
  await page.goto(`/study/${t.sample.blocks.recursionReview}?start=1`);
  const plan = page.getByRole("list", { name: "Session plan" });
  await settle(() => expect(plan.getByRole("listitem")).toHaveCount(5, quick));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("CSC148 · Recursion & tree traversal");
  await settle(() => expect(plan.getByRole("button").nth(0)).toHaveAttribute("aria-current", "step", quick));
  await expect(page.getByPlaceholder("Ask anything about Lecture 8…")).toBeVisible();
  await settle(() => expect(page).toHaveURL(new RegExp(`/study/${t.sample.blocks.recursionReview.replace(/\./g, "\\.")}$`), quick));

  await page.clock.runFor(5 * 60_000);
  await page.getByRole("button", { name: "Next step" }).click();
  await settle(() => expect(plan.getByRole("button").nth(1)).toHaveAttribute("aria-current", "step", quick));
  await expect(plan.getByRole("listitem").nth(1)).toContainText("Slides 12–17 · 8 min");
  await expect(plan.getByRole("button").nth(0)).not.toHaveAttribute("aria-current", "step");
  const slide = page.getByRole("region", { name: "Slide viewer" });
  const label = page.getByTestId(tid.main).getByText(/^(Slide \d+ of \d+|Transcript · [\d:]+)$/);
  await slide.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await settle(() => expect(label).toHaveText("Slide 14 of 32", quick));
  await settle(() => expect(slide.getByRole("heading", { level: 2 })).toHaveText("Preorder traversal", quick));
  await expect(slide.locator("pre code")).toHaveText(/^def preorder\(self\) -> list:/);

  await page.clock.pauseAt(at("10:43:12.500"));
  await settle(() => expect(page.getByText("31:48 left", { exact: true })).toBeVisible(quick));
  await expect(page.getByRole("progressbar", { name: "Session time" })).toHaveAttribute("aria-valuenow", "29");

  await page.getByRole("button", { name: /^32:14 / }).click();
  await settle(() => expect(page.getByRole("tab", { name: "Transcript" })).toHaveAttribute("aria-selected", "true", quick));
  await expect(label).toHaveText("Transcript · 32:14");
  await page.getByRole("tab", { name: "Slides" }).click();
  await settle(() => expect(label).toHaveText("Slide 14 of 32", quick));
  await settle(() => expect(page.getByRole("tabpanel")).toHaveCount(1, quick));
  const thread = page.getByTestId(t.tid.chat.thread);
  for (const chip of ["Slide 17", "Transcript 41:05", "A2 handout §3"]) await expect(thread.getByRole("button", { name: chip, exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.getByRole("heading", { level: 1 }).click();
  await t.shot("study");

  await page.getByRole("button", { name: "Pause" }).click();
  await settle(() => expect(page.getByText("Paused · 31:48 left", { exact: true })).toBeVisible(quick));
  await page.getByRole("button", { name: "Resume" }).click();
  await settle(() => expect(page.getByText("31:48 left", { exact: true })).toBeVisible(quick));
  await page.clock.resume();

  const composer = page.getByPlaceholder("Ask anything about Lecture 8…");
  const answers = thread.getByRole("article");
  await expect(page.getByRole("radio", { name: "Quick" })).toHaveAttribute("aria-checked", "true");
  await recordReplies();
  await composer.fill("Why does preorder visit the root first?");
  await composer.press("Enter");
  await expect(answers).toHaveCount(2, { timeout: 15_000 });
  await expect(thread.locator("article[aria-busy=true]")).toHaveCount(0, { timeout: 15_000 });
  const streamed = await page.evaluate(() => window.__replies.filter((r) => r !== "Reading your material…" && r !== "Thinking…"));
  if (streamed.length < 2) throw new Error(`The Quick answer did not stream: ${JSON.stringify(streamed)}`);
  await expect(answers.last().getByRole("list", { name: "Sources" }).getByRole("button").first()).toBeVisible();
  await thread.getByRole("button", { name: "Slide 17", exact: true }).first().click();
  await expect(label).toHaveText("Slide 17 of 32");
  await expect(page.getByRole("tab", { name: "Slides" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("radio", { name: "Deep" }).click();
  await expect(page.getByRole("radio", { name: "Deep" })).toHaveAttribute("aria-checked", "true");
  await recordReplies();
  await composer.fill("Why is postorder the right order for deleting a subtree?");
  await composer.press("Enter");
  await expect(answers).toHaveCount(3, { timeout: 15_000 });
  await expect(thread.locator("article[aria-busy=true]")).toHaveCount(0, { timeout: 15_000 });
  const deep = await page.evaluate(() => window.__replies);
  const thinkingAt = deep.indexOf("Thinking…");
  const answerAt = deep.findIndex((r) => r !== "Reading your material…" && r !== "Thinking…");
  if (thinkingAt < 0 || answerAt < 0 || thinkingAt > answerAt) throw new Error(`Deep did not show Thinking… before the answer: ${JSON.stringify(deep)}`);
  await answers.last().getByRole("button", { name: "Add to study guide" }).click();
  await expect(answers.last().getByRole("button", { name: "Added to study guide" })).toBeVisible();

  t.allowFailures(/\/api\/ai\/ask$/);
  await page.route(
    "**/api/ai/ask",
    (route) => route.fulfill({ status: 402, contentType: "application/json", body: JSON.stringify({ error: { kind: "budget", message: "The spending cap is reached.", capUsd: 30 } }) }),
    { times: 1 },
  );
  await composer.fill("What is most likely on the midterm?");
  await composer.press("Enter");
  await expect(thread.getByRole("status").filter({ hasText: "The $30 spending cap is reached." })).toBeVisible({ timeout: 15_000 });
  await expect(composer).toBeDisabled();
  await page.unroute("**/api/ai/ask");

  await page.getByRole("button", { name: "End session" }).click();
  const confirm = page.getByRole("alertdialog", { name: "End this session?" });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText(/3 steps left · \d+:\d{2}/);
  await confirm.getByRole("button", { name: "End session" }).click();
  await expect(page).toHaveURL(/\/$/);
  await t.integrated("Today shows the ended review as done", async () => {
    await expect(page.getByRole("list", { name: "Today" }).getByRole("listitem").filter({ hasText: "Review — Recursion & tree traversal" })).toContainText("Done · 45m");
  });

  await page.goto("/study");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Study sessions");
  await expect(page.getByRole("list", { name: "Past sessions" }).getByRole("listitem").first()).toContainText(/Review — Recursion & tree traversal.*Ended · 1\dm of 45m/);
  await expect(page.getByRole("link", { name: "Start session" }).first()).toBeVisible();
  await t.shot("study-index");
  await t.checkNarrow();

  await page.goto(`/study/${t.sample.blocks.midweekCsc}`);
  await expect(page.getByRole("button", { name: "Start session" })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "End session" })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Session plan" }).getByRole("listitem")).toHaveCount(5);
  await page.reload();
  await expect(page.getByRole("button", { name: "Start session" })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "End session" })).toHaveCount(0);
  await t.shot("study-preview");
  await t.checkNarrow();
}
