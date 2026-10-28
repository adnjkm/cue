// Stub step until the today workstream replaces it with its main path (docs/architecture.md section 13.3).
export default async function today(t) {
  await t.reseed();
  await t.page.goto("/");
  await t.expect(t.page.getByRole("heading", { level: 1 })).toHaveText("Three sessions today. Start with recursion.");
  await t.checkNarrow();
}
