// Stub step until the calendar workstream replaces it with its main path (docs/architecture.md section 13.3).
export default async function calendar(t) {
  await t.reseed();
  await t.page.goto("/calendar");
  await t.expect(t.page.getByRole("heading", { level: 1 })).toHaveText("Calendar");
  await t.checkNarrow();
}
