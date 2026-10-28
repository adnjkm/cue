import { TZDate } from "@date-fns/tz";
import type { EpochMs, Interval, LocalDate, Zone } from "@/lib/domain";
import { addDays, parseDay, weekdayOf } from "./zone";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function clock(t: EpochMs, zone: Zone): { h: number; m: number; meridiem: "am" | "pm" } {
  const z = new TZDate(t, zone.id);
  const h = z.getHours();
  return { h: h % 12 || 12, m: z.getMinutes(), meridiem: h < 12 ? "am" : "pm" };
}

function clockText(c: { h: number; m: number }): string {
  return c.m === 0 ? String(c.h) : `${c.h}:${String(c.m).padStart(2, "0")}`;
}

/** `9am`, `10:30am`, `12pm`. */
export function fmtTime(t: EpochMs, zone: Zone): string {
  const c = clock(t, zone);
  return `${clockText(c)}${c.meridiem}`;
}

/** `10:30–11:15am`, `11:15am–12pm`, `9–10am`: en dash, one meridiem when both ends share it. */
export function fmtRange(span: Interval, zone: Zone): string {
  const a = clock(span.start, zone);
  const b = clock(span.end, zone);
  if (a.meridiem === b.meridiem) return `${clockText(a)}–${clockText(b)}${b.meridiem}`;
  return `${clockText(a)}${a.meridiem}–${clockText(b)}${b.meridiem}`;
}

/** `45m`, `2h`, `3h 15m`. */
export function fmtDuration(ms: number): string {
  const total = Math.round(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function hms(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Countdown `31:48`, `45:00`. Rounds up, so a timer reads 45:00 until a full second has passed. */
export function fmtCountdown(ms: number): string {
  return hms(Math.max(0, Math.ceil(Math.abs(ms) / 1000 - 1e-9)));
}

/** Transcript stamp `41:05`, `1:02:03`. */
export function fmtStamp(ms: number): string {
  return hms(Math.max(0, Math.floor(ms / 1000)));
}

/** `Thu` (as in `Due Thu`), `Tuesday 27 October`, `October 2026`, `Oct – Nov 2026` for a week across two months. */
export function fmtDay(day: LocalDate, _zone: Zone, style: "weekdayShort" | "long" | "month" | "monthSpan"): string {
  const { y, m, d } = parseDay(day);
  const weekday = WEEKDAYS[weekdayOf(day) - 1];
  switch (style) {
    case "weekdayShort":
      return weekday.slice(0, 3);
    case "long":
      return `${weekday} ${d} ${MONTHS[m - 1]}`;
    case "month":
      return `${MONTHS[m - 1]} ${y}`;
    case "monthSpan": {
      const monday = addDays(day, 1 - weekdayOf(day));
      const sunday = addDays(monday, 6);
      const a = parseDay(monday);
      const b = parseDay(sunday);
      if (a.m === b.m) return `${MONTHS[a.m - 1]} ${a.y}`;
      const left = MONTHS[a.m - 1].slice(0, 3) + (a.y === b.y ? "" : ` ${a.y}`);
      return `${left} – ${MONTHS[b.m - 1].slice(0, 3)} ${b.y}`;
    }
  }
}
