import "server-only";
import { z } from "zod";
import { defineTasks, jsonTask } from "@/lib/ai/define";
import type { PageImage } from "@/lib/domain";
import { EXAMPLE_TIMETABLE } from "./example-timetable";
import { timetableRead, type TimetableRead } from "./schema";

const READ_SYSTEM = `You read a university student's class schedule from page images: a timetable grid, a schedule export, a registration summary or a syllabus page.
Return every course that meets on a weekly pattern, and every dated test or deadline the pages show.

"courses": one entry per course.
- "code": the course code as letters then digits, like "CSC148" or "MAT137". Drop section and campus suffixes: "CSC148H5 LEC0101" is "CSC148".
- "title": the course name if printed, else null. "instructor": the instructor if printed, else null.
- "meetings": one entry per weekly meeting. A course that meets on Tuesday and Thursday has two meetings.
  - "kind": "lecture" for lectures; "lab" for labs, tutorials, practicals and seminars.
  - "day": one of "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun".
  - "start" and "end": 24-hour local "HH:MM" read from the grid or the printed times. 2:10 pm is "14:10". A box that spans 2pm to 5pm starts at "14:00" and ends at "17:00".
  - "room": the building and room as printed ("BA 1160"), else null.

"dated": tests, quizzes, midterms, exams and due dates that have a calendar date.
- "code": the course code. "kind": "test" for anything written in a room at a set time, "deadline" for anything handed in.
- "label": the item's own name without the course code or the word "due": "Term Test 1", "Problem Set 4", "Essay 1".
- "date": "YYYY-MM-DD". When a page shows only a month and day, pick the year from the term start date in the message.
- "time": 24-hour "HH:MM" if printed, else null.

Copy only what the pages show. Never invent a course, a room, a time or a date. If the pages hold no schedule, return empty lists.`;

const pageImage = z.object({
  page: z.number().int().min(1),
  image: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/),
  text: z.string().max(20_000),
});

/** What scripts/fixtures/calendar/timetable.png shows, so the walkthrough's vision import runs with no key. */
const FIXTURE_READ: TimetableRead = {
  courses: [
    {
      code: "BIO130",
      title: "Molecular and Cell Biology",
      instructor: "Prof. Ferreira",
      meetings: [
        { kind: "lecture", day: "Mon", start: "13:00", end: "14:00", room: "MS 2172" },
        { kind: "lecture", day: "Wed", start: "13:00", end: "14:00", room: "MS 2172" },
        { kind: "lab", day: "Thu", start: "14:00", end: "17:00", room: "RW 110" },
      ],
    },
    {
      code: "PHL100",
      title: "Introduction to Philosophy",
      instructor: "Prof. Abebe",
      meetings: [
        { kind: "lecture", day: "Tue", start: "11:00", end: "12:00", room: "SS 2117" },
        { kind: "lecture", day: "Thu", start: "11:00", end: "12:00", room: "SS 2117" },
      ],
    },
  ],
  dated: [
    { code: "BIO130", kind: "test", label: "Term Test 1", date: "2026-11-04", time: "18:00" },
    { code: "PHL100", kind: "deadline", label: "Essay 1", date: "2026-11-13", time: "23:59" },
  ],
};

export const calendarTasks = defineTasks("calendar", {
  read: jsonTask({
    profile: "vision",
    maxTokens: 2000,
    temperature: 0,
    input: z.object({ pages: z.array(pageImage).min(1).max(3), termStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    output: timetableRead,
    prompt: ({ pages, termStart }) => ({
      system: READ_SYSTEM,
      user: [
        { type: "text" as const, text: `The term's current week starts on ${termStart}.` },
        ...pages.flatMap((p: PageImage) => [
          { type: "text" as const, text: `Page ${p.page}\nText layer:\n${p.text.trim() || "(none)"}` },
          { type: "image" as const, dataUrl: p.image },
        ]),
      ],
    }),
    example: { pages: [{ page: 1, image: EXAMPLE_TIMETABLE, text: "" }], termStart: "2026-10-26" },
    mock: () => FIXTURE_READ,
  }),
});
