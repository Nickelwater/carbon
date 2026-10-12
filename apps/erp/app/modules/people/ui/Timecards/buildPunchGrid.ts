// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { type PunchLike, pairPunches } from "@carbon/timeclock";
import { parseDate } from "@internationalized/date";

export type GridPunch = PunchLike & {
  source: string;
  note?: string | null;
};

export type DayPairCell = {
  clockIn: GridPunch | null;
  clockOut: GridPunch | null;
};

export type PunchGridDay = {
  date: string;
  pairs: DayPairCell[];
  dayTotalMs: number;
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

/**
 * Build a day grid for a pay period. Pairing is global (employee-wide order);
 * cells are placed on the calendar day of each punch in company TZ.
 */
export function buildPunchGrid(args: {
  punches: GridPunch[];
  periodStart: string;
  periodEnd: string;
  tz: string;
  businessDay: (instant: string, tz: string) => { toString(): string };
}): { days: PunchGridDay[]; maxPairs: number; isOpen: boolean } {
  const { segments, isOpen } = pairPunches(args.punches);
  const dates = eachDateInclusive(args.periodStart, args.periodEnd);
  const byDate = new Map<string, DayPairCell[]>(
    dates.map((d) => [d, [] as DayPairCell[]])
  );

  let maxPairs = 1;

  for (const segment of segments) {
    const inDay = args
      .businessDay(segment.clockIn.punchedAt, args.tz)
      .toString();
    const outDay = segment.clockOut
      ? args.businessDay(segment.clockOut.punchedAt, args.tz).toString()
      : inDay;

    if (!byDate.has(inDay)) {
      // Punch outside displayed period — skip for grid rows
      continue;
    }

    const inPairs = byDate.get(inDay)!;
    const cell: DayPairCell = {
      clockIn: segment.clockIn as GridPunch,
      clockOut: outDay === inDay ? (segment.clockOut as GridPunch | null) : null
    };
    inPairs.push(cell);
    maxPairs = Math.max(maxPairs, inPairs.length);

    if (segment.clockOut && outDay !== inDay && byDate.has(outDay)) {
      const outPairs = byDate.get(outDay)!;
      outPairs.push({
        clockIn: null,
        clockOut: segment.clockOut as GridPunch
      });
      maxPairs = Math.max(maxPairs, outPairs.length);
    }
  }

  const days: PunchGridDay[] = dates.map((date) => {
    const pairs = byDate.get(date) ?? [];
    let dayTotalMs = 0;
    for (const pair of pairs) {
      if (pair.clockIn && pair.clockOut) {
        dayTotalMs +=
          new Date(pair.clockOut.punchedAt).getTime() -
          new Date(pair.clockIn.punchedAt).getTime();
      }
    }
    return { date, pairs, dayTotalMs };
  });

  return { days, maxPairs, isOpen };
}

export function formatDurationMs(ms: number): string {
  if (ms <= 0) return "0:00";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}
