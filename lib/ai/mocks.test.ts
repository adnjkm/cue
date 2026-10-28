import { describe, expect, it } from "vitest";
import { registry } from "./registry";

describe("every registered task", () => {
  for (const [name, task] of Object.entries(registry)) {
    it(`${name}: example parses as input and mock(example) parses as output`, async () => {
      const input = task.input.parse(task.example);
      switch (task.kind) {
        case "json":
          expect(task.output.safeParse(await task.mock(input as never)).success).toBe(true);
          break;
        case "list": {
          const items = task.mock(input as never);
          expect(items.length).toBeGreaterThan(0);
          for (const item of items) expect(task.item.safeParse(item).success).toBe(true);
          break;
        }
        case "stream": {
          let text = "";
          for await (const e of task.mock(input as never)) if (e.type === "text") text += e.delta;
          expect(text.length).toBeGreaterThan(0);
          break;
        }
        case "embed":
          expect(task.mock(input as never).vectors).toHaveLength((input as unknown as { texts: string[] }).texts.length);
          break;
      }
    });
  }

  it("covers the shared tasks and Practice's", () => {
    expect(Object.keys(registry).sort()).toEqual(["ask", "embed", "material.read", "practice.check", "practice.generate", "practice.parse", "practice.solve"]);
  });
});
