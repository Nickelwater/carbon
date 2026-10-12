// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

export type PunchLike = {
  id: string;
  punchedAt: string;
  source?: string;
};

export type PairedSegment<T extends PunchLike = PunchLike> = {
  clockIn: T;
  clockOut: T | null;
};

export type PairResult<T extends PunchLike = PunchLike> = {
  segments: PairedSegment<T>[];
  /** True when the last punch is an unpaired In. */
  isOpen: boolean;
};

/**
 * Pair punches in ascending time order: 0=In, 1=Out, 2=In, …
 * A trailing In leaves the employee punched in.
 */
export function pairPunches<T extends PunchLike>(punches: T[]): PairResult<T> {
  const sorted = [...punches].sort((a, b) => {
    const cmp = a.punchedAt.localeCompare(b.punchedAt);
    if (cmp !== 0) return cmp;
    return a.id.localeCompare(b.id);
  });

  const segments: PairedSegment<T>[] = [];
  for (let i = 0; i < sorted.length; i += 2) {
    const clockIn = sorted[i];
    if (!clockIn) continue;
    const clockOut = sorted[i + 1] ?? null;
    segments.push({ clockIn, clockOut });
  }

  const last = segments[segments.length - 1];
  return {
    segments,
    isOpen: !!last && last.clockOut === null
  };
}

export type PayPeriodBounds = {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD inclusive
};

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const parts = ymd.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return { y, m, d };
}

function formatYmd(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Civil-date add in UTC calendar (period anchors are dates, not instants). */
function addDays(ymd: string, days: number): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function daysBetween(a: string, b: string): number {
  const pa = parseYmd(a);
  const pb = parseYmd(b);
  const ms = Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d);
  return Math.floor(ms / 86_400_000);
}

/**
 * Pay period containing `dateYmd` (company-local calendar date as YYYY-MM-DD).
 * Length is 7 or 14; anchor is the start of a known period.
 */
export function getPayPeriodContaining(
  dateYmd: string,
  settings: { payPeriodLengthDays: number; payPeriodAnchorDate: string }
): PayPeriodBounds {
  const length = settings.payPeriodLengthDays === 14 ? 14 : 7;
  const anchor = settings.payPeriodAnchorDate.slice(0, 10);
  const day = dateYmd.slice(0, 10);
  const offset = daysBetween(anchor, day);
  const periodIndex = Math.floor(offset / length);
  const start = addDays(anchor, periodIndex * length);
  const end = addDays(start, length - 1);
  return { start, end };
}

export function shiftPayPeriod(
  bounds: PayPeriodBounds,
  delta: number,
  lengthDays: number
): PayPeriodBounds {
  const length = lengthDays === 14 ? 14 : 7;
  const start = addDays(bounds.start, delta * length);
  const end = addDays(start, length - 1);
  return { start, end };
}
