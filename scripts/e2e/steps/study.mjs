// Stub step until the study workstream replaces it with its main path (docs/architecture.md section 13.3).
export default async function study(t) {
  await t.reseed();
  await t.page.goto("/study");
  await t.expect(t.page.getByRole("heading", { level: 1 })).toHaveText("Study sessions");
  await t.checkNarrow();
}
