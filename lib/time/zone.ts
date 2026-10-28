import { TZDate, tzOffset } from "@date-fns/tz";
import type { EpochMs, Interval, IsoWeek, LocalDate, TimeZone, WallTime, Zone } from "@/lib/domain";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function parseDay(day: LocalDate): { y: number; m: number; d: number } {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
}

function dayFromUtc(ms: number): LocalDate {
  const u = new Date(ms);
  return `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())}` as LocalDate;
}

function utcOfDay(day: LocalDate): number {
  const { y, m, d } = parseDay(day);
  return Date.UTC(y, m - 1, d);
}

export function addDays(day: LocalDate, n: number): LocalDate {
  return dayFromUtc(utcOfDay(day) + n * 86_400_000);
}

export function weekdayOf(day: LocalDate): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const w = new Date(utcOfDay(day)).getUTCDay();
  return (w === 0 ? 7 : w) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export function isoWeekOfDay(day: LocalDate): IsoWeek {
  const thursday = addDays(day, 4 - weekdayOf(day));
  const { y } = parseDay(thursday);
  const week = Math.floor((utcOfDay(thursday) - Date.UTC(y, 0, 1)) / (7 * 86_400_000)) + 1;
  return `${y}-W${pad(week)}` as IsoWeek;
}

export function mondayOfWeek(week: IsoWeek): LocalDate {
  const [y, w] = week.split("-W").map(Number);
  const jan4 = dayFromUtc(Date.UTC(y, 0, 4));
  return addDays(addDays(jan4, 1 - weekdayOf(jan4)), (w - 1) * 7);
}

export function wallMinutes(time: WallTime): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function wallTime(minutes: number): WallTime {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` as WallTime;
}

export function compareDays(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((utcOfDay(b) - utcOfDay(a)) / 86_400_000);
}

const zones = new Map<string, Zone>();

// Every zone lookup goes through Intl, which was 61% of schedule()'s time. Offsets change only at transitions,
// and modern transitions fall on 15-minute UTC boundaries, so one lookup per quarter hour is exact.
const QUARTER_HOUR = 15 * 60_000;
const offsetCaches = new Map<string, Map<number, number>>();

function localMs(t: number, id: TimeZone): number {
  let offsets = offsetCaches.get(id);
  if (!offsets) offsetCaches.set(id, (offsets = new Map()));
  const bucket = Math.floor(t / QUARTER_HOUR);
  let offset = offsets.get(bucket);
  if (offset === undefined) offsets.set(bucket, (offset = tzOffset(id, new Date(t))));
  return t + offset * 60_000;
}

/** Zone arithmetic over wall-clock days. Days are calendar dates, so a 25-hour DST day is still one day. */
export function zoneOf(id: TimeZone): Zone {
  const cached = zones.get(id);
  if (cached) return cached;
  // TZDate's own rules for DST gaps and overlaps stay authoritative here, so wall times are cached, not derived.
  const instants = new Map<string, EpochMs>();
  const zone: Zone = {
    id,
    dayOf(t: EpochMs): LocalDate {
      return dayFromUtc(localMs(t, id));
    },
    weekOf(t: EpochMs | LocalDate): IsoWeek {
      return isoWeekOfDay(typeof t === "number" ? zone.dayOf(t) : t);
    },
    weekday: weekdayOf,
    at(day: LocalDate, time: WallTime): EpochMs {
      const key = `${day} ${time}`;
      const hit = instants.get(key);
      if (hit !== undefined) return hit;
      const { y, m, d } = parseDay(day);
      const minutes = wallMinutes(time);
      const t = new TZDate(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0, id).getTime() as EpochMs;
      instants.set(key, t);
      return t;
    },
    startOfDay(day: LocalDate): EpochMs {
      return zone.at(day, "00:00" as WallTime);
    },
    addDays,
    daysOfWeek(week: IsoWeek): readonly LocalDate[] {
      const monday = mondayOfWeek(week);
      return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    },
  };
  zones.set(id, zone);
  return zone;
}

/** Minutes past local midnight of instant t. */
export function minutesOfDay(t: EpochMs, zone: Zone): number {
  const local = localMs(t, zone.id);
  return Math.floor((local - utcOfDay(dayFromUtc(local))) / 60_000);
}

export function dayInterval(day: LocalDate, zone: Zone): Interval {
  return { start: zone.startOfDay(day), end: zone.startOfDay(addDays(day, 1)) };
}

export function currentZone(): TimeZone {
  return Intl.DateTimeFormat().resolvedOptions().timeZone as TimeZone;
}
