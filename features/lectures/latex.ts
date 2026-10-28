const SYMBOLS: Record<string, string> = {
  int: "∫",
  iint: "∬",
  oint: "∮",
  sum: "∑",
  prod: "∏",
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  cdot: "·",
  times: "×",
  div: "÷",
  pm: "±",
  mp: "∓",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
  approx: "≈",
  equiv: "≡",
  sim: "∼",
  propto: "∝",
  to: "→",
  rightarrow: "→",
  Rightarrow: "⇒",
  implies: "⇒",
  leftarrow: "←",
  iff: "⇔",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  cup: "∪",
  cap: "∩",
  forall: "∀",
  exists: "∃",
  emptyset: "∅",
  circ: "∘",
  degree: "°",
  ldots: "…",
  cdots: "⋯",
  dots: "…",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  Gamma: "Γ",
  delta: "δ",
  Delta: "Δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  Theta: "Θ",
  lambda: "λ",
  Lambda: "Λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  Pi: "Π",
  rho: "ρ",
  sigma: "σ",
  Sigma: "Σ",
  tau: "τ",
  phi: "φ",
  varphi: "φ",
  Phi: "Φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Omega: "Ω",
};

const FUNCTIONS = new Set(["sin", "cos", "tan", "sec", "csc", "cot", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "ln", "log", "exp", "lim", "max", "min", "det"]);

const SUPER: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  a: "ᵃ", b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", f: "ᶠ", g: "ᵍ", h: "ʰ", i: "ⁱ", j: "ʲ", k: "ᵏ", l: "ˡ", m: "ᵐ", n: "ⁿ", o: "ᵒ", p: "ᵖ", r: "ʳ", s: "ˢ", t: "ᵗ", u: "ᵘ", v: "ᵛ", w: "ʷ", x: "ˣ", y: "ʸ", z: "ᶻ", T: "ᵀ",
};

const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};

function script(body: string, map: Record<string, string>, mark: "^" | "_"): string {
  const chars = [...body.replace(/\s+/g, "")];
  if (chars.length > 0 && chars.every((c) => map[c])) return chars.map((c) => map[c]).join("");
  return chars.length === 1 ? `${mark}${chars[0]}` : `${mark}(${chars.join("")})`;
}

/** The body of a braced group starting at `open` (the index of "{"), and the index after its "}". */
function group(s: string, open: number): { body: string; end: number } | null {
  if (s[open] !== "{") return null;
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return { body: s.slice(open + 1, i), end: i + 1 };
  }
  return null;
}

const simple = (s: string) => /^[\w.]+$/.test(s);
const wrap = (s: string) => (simple(s) ? s : `(${s})`);

/** Expands the commands that take braced arguments, innermost first, so nested fractions come out right. */
function expandArgs(s: string): string {
  const command = /\\(frac|dfrac|tfrac|sqrt|text|textrm|mathrm|mathbf|mathit|operatorname|left|right)\b/g;
  let out = "";
  let last = 0;
  for (let m = command.exec(s); m; m = command.exec(s)) {
    const name = m[1];
    let i = m.index + m[0].length;
    out += s.slice(last, m.index);
    if (name === "left" || name === "right") {
      last = i;
      continue;
    }
    while (s[i] === " ") i++;
    const a = group(s, i);
    if (!a) {
      last = i;
      continue;
    }
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      const b = group(s, a.end);
      if (!b) {
        out += expandArgs(a.body);
        last = a.end;
        continue;
      }
      out += `${wrap(expandArgs(a.body).trim())}/${wrap(expandArgs(b.body).trim())}`;
      last = b.end;
    } else if (name === "sqrt") {
      out += `√${wrap(expandArgs(a.body).trim())}`;
      last = a.end;
    } else {
      out += expandArgs(a.body);
      last = a.end;
    }
    command.lastIndex = last;
  }
  return out + s.slice(last);
}

function convertMath(s: string): string {
  let t = expandArgs(s);
  t = t.replace(/\\[,;:!]|\\quad|\\qquad|~/g, " ");
  t = t.replace(/\\([{}%$&#])/g, "$1");
  t = t.replace(/\\([A-Za-z]+)/g, (whole, name: string) => SYMBOLS[name] ?? (FUNCTIONS.has(name) ? name : whole));
  t = t.replace(/\^\s*(\{[^{}]*\}|[A-Za-z0-9+-])/g, (_m, body: string) => script(body.startsWith("{") ? body.slice(1, -1) : body, SUPER, "^"));
  t = t.replace(/_\s*(\{[^{}]*\}|[A-Za-z0-9])/g, (_m, body: string) => script(body.startsWith("{") ? body.slice(1, -1) : body, SUB, "_"));
  t = t.replace(/\{([^{}]*)\}/g, "$1");
  return t;
}

const DELIMITED = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;

/**
 * Lightning writes LaTeX even when asked for Unicode (measured), so cleaned transcript text passes through
 * here. Delimited math is converted in full. Outside delimiters only backslash commands and single-letter
 * scripts (`x^2`, `a_1`) change, so prose such as `is_empty` survives.
 */
export function latexToUnicode(text: string): string {
  if (!/[\\^_$]/.test(text)) return text;
  let out = text.replace(DELIMITED, (_m, a?: string, b?: string, c?: string, d?: string) => convertMath(a ?? b ?? c ?? d ?? ""));
  out = expandArgs(out);
  out = out.replace(/\\[,;!]|\\quad/g, " ");
  out = out.replace(/\\([A-Za-z]+)/g, (whole, name: string) => SYMBOLS[name] ?? (FUNCTIONS.has(name) ? name : whole));
  out = out.replace(/((?<![A-Za-z0-9])[A-Za-z]|\d+|\))\^(\{[^{}]*\}|[A-Za-z0-9])/g, (_m, base: string, body: string) => base + script(body.startsWith("{") ? body.slice(1, -1) : body, SUPER, "^"));
  out = out.replace(/(?<![A-Za-z0-9_])([A-Za-z])_(\{[^{}]*\}|\d)(?![A-Za-z])/g, (_m, base: string, body: string) => base + script(body.startsWith("{") ? body.slice(1, -1) : body, SUB, "_"));
  return out.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?)])/g, "$1").replace(/\( +/g, "(");
}
