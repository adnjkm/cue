import { z } from "zod";

export const WEEKDAY_CODES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** calendar.read's strict output: day enum and HH:MM pattern. Code still validates times and expands meetings over the term. */
export const timetableRead = z.object({
  courses: z
    .array(
      z.object({
        code: z.string().min(2).max(16),
        title: z.string().max(120).nullish(),
        instructor: z.string().max(120).nullish(),
        meetings: z
          .array(
            z.object({
              kind: z.enum(["lecture", "lab"]),
              day: z.enum(WEEKDAY_CODES),
              start: hhmm,
              end: hhmm,
              room: z.string().max(60).nullish(),
            }),
          )
          .max(20),
      }),
    )
    .max(15),
  dated: z
    .array(
      z.object({
        code: z.string().min(2).max(16),
        kind: z.enum(["deadline", "test"]),
        label: z.string().min(1).max(80),
        date,
        time: hhmm.nullish(),
      }),
    )
    .max(60),
});

export type TimetableRead = z.infer<typeof timetableRead>;
