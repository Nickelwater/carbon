// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { type PunchLike, pairPunchesByDay } from "@carbon/timeclock";
import { parseDate } from "@internationalized/date";

/** Fixed In/Out column pairs per table row. Extra pairs spill to another day row. */
export const PAIRS_PER_ROW = 2;

/** FLSA-style weekly overtime threshold. */
export const WEEKLY_OVERTIME_MS = 40 * 3_600_000;

export type GridPunch = PunchLike & {
  source: string;
  note?: string | null;
};

export type DayPairCell = {
  clockIn: GridPunch | null;
  clockOut: GridPunch | null;
};

export type PunchGridRow = {
  /** Calendar day YYYY-MM-DD (company TZ). */
  date: string;
  /** First row for this date — show the date label and day total. */
  isPrimary: boolean;
  /** Always length {@link PAIRS_PER_ROW}, padded with empty cells. */
  pairs: DayPairCell[];
  /** Full-day total on the primary row only; null on continuation rows. */
  dayTotalMs: number | null;
  /** Missing Out (or other incomplete pair) on this calendar day. */
  hasPunchError: boolean;
};

/** One work week inside the pay period, aligned to the period start. */
export type WeekTotal = {
  start: string;
  end: string;
  /** Hours in the week, capped at 40. Overtime is not included. */
  totalMs: number;
  /** Hours past 40 in a full 7-day week. A short trailing week is 0. */
  overtimeMs: number;
};

/** Inclusive YYYY-MM-DD range → UTC instant bounds in company TZ. */
export function periodBoundsToInstants(
  startYmd: string,
  endYmd: string,
  tz: string
): { from: string; to: string } {
  const start = parseDate(startYmd.slice(0, 10));
  const endExclusive = parseDate(endYmd.slice(0, 10)).add({ days: 1 });
  return {
    from: start.toDate(tz).toISOString(),
    to: new Date(endExclusive.toDate(tz).getTime() - 1).toISOString()
  };
}

function eachDateInclusive(startYmd: string, endYmd: string): string[] {
  const dates: string[] = [];
  let cursor = parseDate(startYmd.slice(0, 10));
  const end = parseDate(endYmd.slice(0, 10));
  while (cursor.compare(end) <= 0) {
    dates.push(cursor.toString());
    cursor = cursor.add({ days: 1 });
  }
  return dates;
}

function emptyPair(): DayPairCell {
  return { clockIn: null, clockOut: null };
}

/** Pad/chunk day pairs into fixed-width rows of {@link PAIRS_PER_ROW}. */
export function chunkDayPairs(pairs: DayPairCell[]): DayPairCell[][] {
  const source = pairs.length === 0 ? [emptyPair()] : pairs;
  const chunks: DayPairCell[][] = [];
  for (let i = 0; i < source.length; i += PAIRS_PER_ROW) {
    const chunk = source.slice(i, i + PAIRS_PER_ROW);
    while (chunk.length < PAIRS_PER_ROW) {
      chunk.push(emptyPair());
    }
    chunks.push(chunk);
  }
  return chunks;
}

function dayTotalMs(pairs: DayPairCell[]): number {
  let total = 0;
  for (const pair of pairs) {
    if (pair.clockIn && pair.clockOut) {
      total +=
        new Date(pair.clockOut.punchedAt).getTime() -
        new Date(pair.clockIn.punchedAt).getTime();
    }
  }
  return total;
}

/**
 * Split the period into 7-day work weeks starting at `periodStart` (the pay
 * period anchor). Overtime is hours past 40 in a complete week.
 */
export function weekTotalsForDates(
  dates: string[],
  totalMsByDate: Map<string, number>
): WeekTotal[] {
  const weeks: WeekTotal[] = [];
  for (let i = 0; i < dates.length; i += 7) {
    const slice = dates.slice(i, i + 7);
    const rawMs = slice.reduce(
      (sum, date) => sum + (totalMsByDate.get(date) ?? 0),
      0
    );
    const overtimeMs =
      slice.length === 7 ? Math.max(0, rawMs - WEEKLY_OVERTIME_MS) : 0;
    weeks.push({
      start: slice[0]!,
      end: slice[slice.length - 1]!,
      totalMs: rawMs - overtimeMs,
      overtimeMs
    });
  }
  return weeks;
}

/**
 * Build a day grid for a pay period. Pairing is per business day so an open
 * In never crosses midnight. Columns are always In/Out 1–2; pairs 3+ become
 * extra rows for that day. Days with a missing Out are flagged.
 */
export function buildPunchGrid(args: {
  punches: GridPunch[];
  periodStart: string;
  periodEnd: string;
  tz: string;
  businessDay: (instant: string, tz: string) => { toString(): string };
}): { rows: PunchGridRow[]; weeks: WeekTotal[]; isOpen: boolean } {
  const dates = eachDateInclusive(args.periodStart, args.periodEnd);
  const dateSet = new Set(dates);

  const { segments, isOpen } = pairPunchesByDay(args.punches, (instant) =>
    args.businessDay(instant, args.tz).toString()
  );

  const byDate = new Map<string, DayPairCell[]>(
    dates.map((d) => [d, [] as DayPairCell[]])
  );

  for (const segment of segments) {
    const inDay = args
      .businessDay(segment.clockIn.punchedAt, args.tz)
      .toString();
    if (!dateSet.has(inDay)) continue;

    byDate.get(inDay)!.push({
      clockIn: segment.clockIn as GridPunch,
      clockOut: (segment.clockOut as GridPunch | null) ?? null
    });
  }

  const rows: PunchGridRow[] = [];
  for (const date of dates) {
    const pairs = byDate.get(date) ?? [];
    const hasPunchError = pairs.some(
      (pair) => pair.clockIn != null && pair.clockOut == null
    );
    const total = dayTotalMs(pairs);
    const chunks = chunkDayPairs(pairs);
    chunks.forEach((chunk, index) => {
      rows.push({
        date,
        isPrimary: index === 0,
        pairs: chunk,
        dayTotalMs: index === 0 ? total : null,
        hasPunchError
      });
    });
  }

  const totalsByDate = new Map(
    dates.map((date) => [date, dayTotalMs(byDate.get(date) ?? [])])
  );

  return {
    rows,
    weeks: weekTotalsForDates(dates, totalsByDate),
    isOpen
  };
}

export function formatDurationMs(ms: number): string {
  if (ms <= 0) return "0:00";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}
