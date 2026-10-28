// Stub step until the lectures workstream replaces it with its main path (docs/architecture.md section 13.3).
export default async function lectures(t) {
  await t.reseed();
  await t.page.goto("/lectures");
  await t.expect(t.page.getByRole("heading", { level: 1 })).toHaveText("Lecture notes");
  await t.checkNarrow();
}
