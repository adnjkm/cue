import { describe, expect, it } from "vitest";
import { WORKSTREAMS } from "@/workstreams";
import { registry } from "./registry";

describe("every registered task", () => {
  for (const [name, task] of Object.entries(registry)) {
    it(`${name}: example parses as input and mock(example) parses as output`, async () => {
      const input = task.input.parse(task.example);
      switch (task.kind) {
        case "json": {
          const output = await task.mock(input as never);
          expect(task.output.safeParse(output).success).toBe(true);
          if (JSON.stringify(output).includes("\\n")) expect(task.multiline, `${name} returns line breaks, so it must set multiline`).toBe(true);
          break;
        }
        case "list": {
          const items = task.mock(input as never);
          expect(items.length).toBeGreaterThan(0);
          for (const item of items) expect(task.item.safeParse(item).success).toBe(true);
          if (JSON.stringify(items).includes("\\n")) expect(task.multiline, `${name} returns line breaks, so it must set multiline`).toBe(true);
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

  it("registers the shared tasks, and every other task under its workstream's prefix", () => {
    const names = Object.keys(registry);
    const shared = ["ask", "embed", "material.read"];
    expect(names).toEqual(expect.arrayContaining([...shared, "practice.check", "practice.generate", "practice.parse", "practice.solve"]));
    const prefixes = WORKSTREAMS.flatMap((w) => (w.tasks ? [`${w.tasks}.`] : []));
    expect(names.filter((n) => !shared.includes(n) && !prefixes.some((p) => n.startsWith(p)))).toEqual([]);
  });
});
