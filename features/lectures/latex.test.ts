import { describe, expect, it } from "vitest";
import { latexToUnicode } from "./latex";

describe("latexToUnicode", () => {
  it.each([
    ["The integral is $\\int x e^{x}\\,dx = x e^{x} - e^{x} + C$.", "The integral is ∫ x eˣ dx = x eˣ - eˣ + C."],
    ["So $u = x^2$ and $dv = \\sin x \\, dx$.", "So u = x² and dv = sin x dx."],
    ["Write it as \\(\\frac{1}{2}\\) or \\(\\frac{x+1}{x-1}\\).", "Write it as 1/2 or (x+1)/(x-1)."],
    ["$$\\sqrt{x} \\le \\sqrt{x+1}$$", "√x ≤ √(x+1)"],
    ["The terms $a_{n+1}$ and $a_1$ converge as $n \\to \\infty$.", "The terms aₙ₊₁ and a₁ converge as n → ∞."],
    ["x^2 + y^2 \\leq 1 holds", "x² + y² ≤ 1 holds"],
    ["Take e^{2x} and 10^3.", "Take e²ˣ and 10³."],
    ["\\alpha plus \\beta", "α plus β"],
    ["$\\left( x \\right)^{n+1}$", "(x)ⁿ⁺¹"],
    ["$e^{\\pi i}$", "e^(πi)"],
  ])("%s", (input, expected) => {
    expect(latexToUnicode(input)).toBe(expected);
  });

  it("leaves prose with underscores and carets alone", () => {
    expect(latexToUnicode("Notice we check is_empty before we look at the root.")).toBe("Notice we check is_empty before we look at the root.");
    expect(latexToUnicode("Okay, let’s actually do one. The integral of x e to the x, dx.")).toBe("Okay, let’s actually do one. The integral of x e to the x, dx.");
  });

  it("keeps an unknown command rather than dropping words", () => {
    expect(latexToUnicode("$\\widehat{x}$")).toBe("\\widehatx");
  });
});
