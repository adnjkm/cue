import { describe, expect, it } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
  it("puts the count with its noun", () => {
    expect(plural(1, "course")).toBe("1 course");
    expect(plural(0, "course")).toBe("0 courses");
    expect(plural(3, "study block")).toBe("3 study blocks");
  });

  it("takes an irregular plural", () => {
    expect(plural(2, "category", "categories")).toBe("2 categories");
  });
});
