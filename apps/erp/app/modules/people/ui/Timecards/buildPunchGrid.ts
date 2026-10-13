// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { type PunchLike, pairPunchesByDay } from "@carbon/timeclock";
import { parseDate } from "@internationalized/date";

/** Fixed In/Out column pairs per table row. Extra pairs spill to another day row. */
export const PAIRS_PER_ROW = 2;

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
}): { rows: PunchGridRow[]; isOpen: boolean } {
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

  return { rows, isOpen };
}

export function formatDurationMs(ms: number): string {
  if (ms <= 0) return "0:00";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}
