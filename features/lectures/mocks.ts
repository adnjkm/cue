/** Deterministic stand-ins for the three lecture tasks, used in mock mode and by the walkthrough. */

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

/** Lower case, digits for spelled numbers, punctuation dropped: "Term Test two" and "term test 2" compare equal. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9.]+/)
    .filter(Boolean)
    .map((w) => {
      const n = NUMBER_WORDS.indexOf(w.replace(/\.$/, ""));
      return n >= 0 ? String(n) : w.replace(/\.$/, "");
    })
    .join(" ");
}

const contains = (text: string, phrase: string) => ` ${normalize(text)} `.includes(` ${normalize(phrase)} `);

export function sentencesOf(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Capital first letter and closing punctuation per sentence; the words stay as heard. */
export function demoCleanup(raw: string): string[] {
  return sentencesOf(raw.replace(/\s+/g, " ")).map((s) => {
    const capped = s.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
    return /[.!?…]$/.test(capped) ? capped : `${capped}.`;
  });
}

const HINT_CUE = /\b(will be on|be on (the )?(test|exam|midterm|final)|on (the )?(term test|midterm|exam|final|quiz)|number one mistake|you will see (this|one of these)|make sure you know)\b/i;
const TASK_CUE = /^(?:.*?\b)?(read|do (?:the )?(?:odd |even )?problems|for next week)\b/i;

interface HintsMockInput {
  window: readonly { at: string; text: string }[];
  assessments: readonly { id: string; label: string }[];
  materials: readonly { id: string; title: string; kind: string }[];
}

function partOf(sentence: string): string | null {
  const n = normalize(sentence);
  const questions = n.match(/questions? (\d+)(?: (?:to|through) (\d+))?/);
  if (questions) return questions[2] ? `Q${questions[1]}–Q${questions[2]}` : `Q${questions[1]}`;
  const section = n.match(/section (\d+(?:\.\d+)?|\d+ point \d+)/);
  if (section) return `§${section[1].replace(" point ", ".")}`;
  const slides = n.match(/slides? (\d+)(?: (?:to|through) (\d+))?/);
  if (slides) return slides[2] ? `${slides[1]}–${slides[2]}` : slides[1];
  return null;
}

export function mockHints(input: HintsMockInput) {
  const hints: { quote: string; assessment: string | null }[] = [];
  const mentions: { ref: string; quote: string; title: string | null; part: string | null; note: string | null }[] = [];
  const tasks: { text: string; ref: string | null; part: string | null }[] = [];
  const named = (sentence: string) => [...input.assessments.map((a) => ({ id: a.id, name: a.label })), ...input.materials.map((m) => ({ id: m.id, name: m.title }))].filter((x) => contains(sentence, x.name));

  for (const line of input.window) {
    for (const sentence of sentencesOf(line.text)) {
      const refs = named(sentence);
      if (HINT_CUE.test(sentence) && !hints.some((h) => h.quote === sentence)) {
        hints.push({ quote: sentence, assessment: refs.find((r) => r.id.startsWith("A"))?.id ?? null });
        continue;
      }
      if (TASK_CUE.test(sentence)) {
        tasks.push({ text: sentence.split(/\s+/).slice(0, 12).join(" ").replace(/[.,;:]$/, ""), ref: refs[0]?.id ?? null, part: partOf(sentence) });
        continue;
      }
      const names = new Set<string>();
      for (const r of [...refs.filter((x) => x.id.startsWith("M")), ...refs.filter((x) => x.id.startsWith("A"))]) {
        if (names.has(normalize(r.name)) || mentions.some((m) => m.ref === r.id)) continue;
        names.add(normalize(r.name));
        mentions.push({ ref: r.id, quote: sentence, title: null, part: partOf(sentence), note: null });
      }
    }
  }
  return { hints: hints.slice(0, 5), tasks: tasks.slice(0, 5), mentions: mentions.slice(0, 8) };
}

export function mockNotes(input: { topic: string | null; transcript: string }) {
  const lines = input.transcript
    .split("\n")
    .map((l) => l.match(/^\[(\d+:\d{2}(?::\d{2})?)\](?: \(exam hint\))? (.*)$/))
    .flatMap((m) => (m ? [{ at: m[1], text: m[2], hint: m[0].includes("(exam hint)") }] : []));
  const first = (s: string) => sentencesOf(s).find((x) => x.split(/\s+/).length >= 5) ?? sentencesOf(s)[0] ?? s;
  const shortly = (s: string) => {
    const w = first(s).split(/\s+/);
    return w.length > 15 ? `${w.slice(0, 15).join(" ").replace(/[,;:]$/, "")}…` : first(s);
  };
  const picks = [lines[0], lines.find((l) => l.hint), lines.at(-1)].filter((l, i, all): l is NonNullable<typeof l> => !!l && all.indexOf(l) === i);
  const step = Math.max(1, Math.floor(lines.length / 5));
  const points = lines.filter((l, i) => l.hint || i % step === 0).slice(0, 6);
  const spoken = lines.map((l) => l.text).join(" ").match(/\b(?:main topic is|today is|today we are covering)\s+([a-z][a-z ]{3,40}?)(?=[,.])/i)?.[1];
  const topic = input.topic || !spoken ? null : { full: spoken.replace(/^./, (c) => c.toUpperCase()), short: spoken.split(" ")[0].replace(/^./, (c) => c.toUpperCase()) };
  return {
    summary: picks.map((l) => first(l.text)).join(" ") || "The transcript was too short to summarize.",
    keyPoints: (points.length ? points : lines.slice(0, 1)).map((l) => ({ at: l.at, text: shortly(l.text) })),
    topic,
  };
}
