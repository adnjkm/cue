// Stub step until the guides workstream replaces it with its main path (docs/architecture.md section 13.3).
export default async function guides(t) {
  await t.reseed();
  await t.page.goto("/guides");
  await t.expect(t.page.getByRole("heading", { level: 1 })).toHaveText("Study guides");
  await t.checkNarrow();
}
