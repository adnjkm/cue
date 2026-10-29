import { describe, expect, it } from "vitest";
import { type EpochMs, type LocalDate, type PlanInput, type StudyBlock, type TimeZone } from "@/lib/domain";
import { samplePlanInput } from "@/lib/sample/plan-input";
import { addDays, fmtRange, fmtTime, zoneOf } from "@/lib/time";
import { schedule } from "./schedule";
import { blockTitle } from "./titles";

const ZONE = "America/Toronto" as TimeZone;
const NOW = Date.parse("2026-10-27T10:12:00-04:00");
const zone = zoneOf(ZONE);
const input = samplePlanInput({ now: NOW, zone: ZONE });
const out = schedule(input);

type Row = [day: string, title: string, second: string, start: string, end: string];
const DAYS = ["Mon 26", "Tue 27", "Wed 28", "Thu 29", "Fri 30", "Sat 31", "Sun 1"];
const hhmm = (t: number) => new Date(t).toLocaleTimeString("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" });

function weekRows(plan: { input: PlanInput; blocks: readonly StudyBlock[] }, from: LocalDate): Row[] {
  const rows: (Row & { sort: string })[] = [];
  DAYS.forEach((label, i) => {
    const day = addDays(from, i);
    const onDay = (t: number) => zone.dayOf(t as EpochMs) === day;
    for (const e of plan.input.events.filter((e) => onDay(e.start))) {
      if (e.kind === "deadline") rows.push(Object.assign([label, `${e.courseId} ${e.short} due ${fmtTime(e.start, zone)}`, "", "", ""] as Row, { sort: `${i}0` }));
      else if (e.kind === "lecture") {
        rows.push(Object.assign([label, `${e.courseId} Lecture`, `${fmtRange(e, zone)} · ${e.location}`, hhmm(e.start), hhmm(e.end)] as Row, { sort: `${i}1${hhmm(e.start)}` }));
      }
    }
    for (const b of plan.blocks.filter((b) => onDay(b.start))) {
      const long = b.end - b.start > 30 * 60_000;
      const second = [long ? fmtRange(b, zone) : "", b.note ?? ""].filter(Boolean).join(" / ");
      rows.push(Object.assign([label, blockTitle(b, "calendar"), second, hhmm(b.start), hhmm(b.end)] as Row, { sort: `${i}1${hhmm(b.start)}` }));
    }
  });
  return rows.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0)).map(([a, b, c, d, e]) => [a, b, c, d, e]);
}

/** docs/design/calendar.md, "Week of Mon 26 Oct to Sun 1 Nov", without the clock-dependent " · now". */
const PAPER_WEEK: Row[] = [
  ["Mon 26", "CSC148 Lecture", "10–11am · BA 1160", "10:00", "11:00"],
  ["Mon 26", "Review · Trees", "11:15am–12pm", "11:15", "12:00"],
  ["Mon 26", "PSY100 Lecture", "2–3pm · MS 2158", "14:00", "15:00"],
  ["Mon 26", "Review · Memory", "", "15:00", "15:30"],
  ["Tue 27", "MAT137 Lecture", "9–10am · MP 102", "09:00", "10:00"],
  ["Tue 27", "Review · Recursion", "10:30–11:15am", "10:30", "11:15"],
  ["Tue 27", "Mid-week · PSY", "", "14:00", "14:30"],
  ["Tue 27", "Work block · PS4", "7–9pm", "19:00", "21:00"],
  ["Wed 28", "CSC148 A2 due 11:59pm", "", "", ""],
  ["Wed 28", "CSC148 Lecture", "10–11am · BA 1160", "10:00", "11:00"],
  ["Wed 28", "Review · Lec 9", "11:15am–12pm", "11:15", "12:00"],
  ["Wed 28", "ECO101 Lecture", "1–2pm · SS 2102", "13:00", "14:00"],
  ["Wed 28", "Review · Elasticity", "", "14:00", "14:30"],
  ["Wed 28", "A2 final push", "6–8pm", "18:00", "20:00"],
  ["Thu 29", "ECO101 PS4 due 5pm", "", "", ""],
  ["Thu 29", "MAT137 Lecture", "9–10am · MP 102", "09:00", "10:00"],
  ["Thu 29", "Review · By parts", "10:15–11am", "10:15", "11:00"],
  ["Thu 29", "Mid-week · CSC", "4–4:45pm", "16:00", "16:45"],
  ["Fri 30", "PSY100 quiz due 12pm", "", "", ""],
  ["Fri 30", "CSC148 Lecture", "10–11am · BA 1160", "10:00", "11:00"],
  ["Fri 30", "PSY100 Lecture", "2–3pm · MS 2158", "14:00", "15:00"],
  ["Fri 30", "Review · Ch. 8", "", "15:00", "15:30"],
  ["Sat 31", "End-of-week review", "11am–12:30pm", "11:00", "12:30"],
  ["Sun 1", "Test 2 prep · 1 of 4", "1–2pm", "13:00", "14:00"],
  ["Sun 1", "Midterm prep · 3 of 6", "3–5pm / Past paper, timed", "15:00", "17:00"],
];

/** docs/design/calendar.md, "October 2026": study chips per day, in order. `more` = chips hidden behind "+N more". */
const PAPER_MONTH: Record<string, { shown: string[]; more?: number }> = {
  "2026-10-01": { shown: ["Review · Lists"] },
  "2026-10-02": { shown: ["Review · Ch. 3"] },
  "2026-10-03": { shown: ["End-of-week review"] },
  "2026-10-04": { shown: [] },
  "2026-10-05": { shown: ["Review · Lec 5"] },
  "2026-10-06": { shown: ["Review · Limits"] },
  "2026-10-07": { shown: ["Review · Supply"] },
  "2026-10-08": { shown: ["Mid-week · CSC"] },
  "2026-10-09": { shown: ["Review · Ch. 4"] },
  "2026-10-10": { shown: ["End-of-week review"] },
  "2026-10-11": { shown: [] },
  "2026-10-12": { shown: [] },
  "2026-10-13": { shown: ["Review · Lec 6"] },
  "2026-10-14": { shown: ["Review · Demand", "Mid-week · PSY"] },
  "2026-10-15": { shown: ["Review · Chain rule"] },
  "2026-10-16": { shown: ["Review · Lec 7"] },
  "2026-10-17": { shown: ["End-of-week review"] },
  "2026-10-18": { shown: ["Test 1 prep · 1 of 3"] },
  "2026-10-19": { shown: ["Test 1 prep · 2 of 3", "Review · Lec 8"] },
  "2026-10-20": { shown: ["Test 1 prep · 3 of 3"] },
  "2026-10-21": { shown: ["Review · Elasticity"] },
  "2026-10-22": { shown: ["Mid-week · CSC"] },
  "2026-10-23": { shown: ["Review · Ch. 7"] },
  "2026-10-24": { shown: ["End-of-week review"] },
  "2026-10-25": { shown: [] },
  "2026-10-26": { shown: ["Review · Trees", "Review · Memory"] },
  "2026-10-27": { shown: ["Review · Recursion", "Mid-week · PSY"], more: 1 },
  "2026-10-28": { shown: ["Review · Lec 9"], more: 2 },
  "2026-10-29": { shown: ["Review · By parts", "Mid-week · CSC"] },
  "2026-10-30": { shown: ["Review · Ch. 8"] },
  "2026-10-31": { shown: ["End-of-week review"] },
  "2026-11-01": { shown: ["Test 2 prep · 1 of 4", "Midterm prep · 3 of 6"] },
};

const RULES_WEEK_HEADER = `Rules-week snapshot: the sample calendar with the authored Paper blocks removed and planFrom moved
to Mon 26 Oct 00:00. Reviewed once; it changes only in a reviewed commit. Expected differences from Paper:
- reviews start 15 minutes after the lecture, and a test within 21 days makes them 45 minutes plus a spaced review next day
- the personal events plan around: the café shifts (Tue 3–6:30pm, Thu 12–3:30pm) push Thu's afternoon reviews to 3:45pm and later
- the A2 work series has block 1 of 2 (Tue, 6:45pm after the shift) as well as the final push (Wed)
- the PS4 work block lands Wed 8–10pm, because the Thu shift fills its latest day before due minus 3 hours
- Wed then reaches the 240-minute cap, so both CSC148 Lecture 9 reviews and both ECO101 reviews fall on Thu
- MAT137 reviews land on Tue, Thu evening and Fri
- a mid-week review for CSC148 (Tue); MAT137's and PSY100's are unplaced by the cap
- CSC148 Lecture 10 (Fri) gets reviews on Fri and Sat
- midterm prep 1 and 2 of 6 land on Fri and Sat; prep 3 of 6 is 60 minutes with no note (only the last of a series is the timed past paper)
`;

describe("sample semester against Paper", () => {
  it("reproduces the 25-row Paper week", () => {
    expect(weekRows({ input, blocks: out.blocks }, "2026-10-26" as LocalDate)).toEqual(PAPER_WEEK);
    expect(out.conflicts).toEqual([]);
  });

  it("reproduces the October month cells", () => {
    for (const [day, cell] of Object.entries(PAPER_MONTH)) {
      const titles = out.blocks.filter((b) => zone.dayOf(b.start) === day).map((b) => blockTitle(b, "calendar"));
      expect(titles.slice(0, cell.shown.length), day).toEqual(cell.shown);
      expect(titles.length, day).toBe(cell.shown.length + (cell.more ?? 0));
    }
  });

  it("keeps the fall-back Sunday blocks at 1–2pm and 3–5pm local", () => {
    const sunday = out.blocks.filter((b) => zone.dayOf(b.start) === "2026-11-01").map((b) => fmtRange(b, zone));
    expect(sunday).toEqual(["1–2pm", "3–5pm"]);
  });

  it("matches the reviewed rules-week snapshot", async () => {
    const rules: PlanInput = { ...input, overrides: [], imports: input.imports.map((i) => ({ ...i, planFrom: zone.startOfDay("2026-10-26" as LocalDate) })) };
    const rows = weekRows({ input: rules, blocks: schedule(rules).blocks }, "2026-10-26" as LocalDate);
    const text = rows.map((r) => r.filter(Boolean).join(" | ")).join("\n");
    await expect(`${RULES_WEEK_HEADER}\n${text}\n`).toMatchFileSnapshot("./__fixtures__/rules-week.txt");
  });

  it("plans the rest of the prep series by rule after the Paper weeks", () => {
    const later = out.blocks.filter((b) => b.anchor.kind === "testPrep" && b.placement === "rule").map((b) => `${zone.dayOf(b.start)} ${blockTitle(b, "calendar")}`);
    expect(later).toEqual(expect.arrayContaining(["2026-11-05 Midterm prep · 6 of 6", "2026-11-12 Test 2 prep · 4 of 4"]));
    expect(out.blocks.some((b) => b.placement === "rule" && b.start < input.imports[0].planFrom)).toBe(false);
  });
});

