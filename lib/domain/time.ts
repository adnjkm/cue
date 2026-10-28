import type { EpochMs, IsoWeek, LocalDate, TimeZone, WallTime } from "./ids";

export interface Interval {
  start: EpochMs;
  end: EpochMs;
}

/** Zone arithmetic over wall-clock days, so the 25-hour Sun 1 Nov 2026 in Toronto works. */
export interface Zone {
  readonly id: TimeZone;
  dayOf(t: EpochMs): LocalDate;
  weekOf(t: EpochMs | LocalDate): IsoWeek;
  /** 1 = Monday … 7 = Sunday. */
  weekday(day: LocalDate): 1 | 2 | 3 | 4 | 5 | 6 | 7;
  at(day: LocalDate, time: WallTime): EpochMs;
  startOfDay(day: LocalDate): EpochMs;
  addDays(day: LocalDate, n: number): LocalDate;
  daysOfWeek(week: IsoWeek): readonly LocalDate[];
}
