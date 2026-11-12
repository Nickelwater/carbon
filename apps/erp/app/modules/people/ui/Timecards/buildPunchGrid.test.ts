// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { describe, expect, it } from "vitest";
import {
  buildPunchGrid,
  chunkDayPairs,
  type DayPairCell,
  type GridPunch,
  PAIRS_PER_ROW
} from "./buildPunchGrid";

function punch(id: string, punchedAt: string): GridPunch {
  return { id, punchedAt, source: "hardware" };
}

const empty: DayPairCell = { clockIn: null, clockOut: null };

describe("chunkDayPairs", () => {
  it("pads an empty day to one row of PAIRS_PER_ROW", () => {
    expect(chunkDayPairs([])).toEqual([
      Array.from({ length: PAIRS_PER_ROW }, () => empty)
    ]);
  });

  it("keeps a single pair on one row and pads", () => {
    const pair: DayPairCell = {
      clockIn: punch("a", "2026-10-13T13:00:00.000Z"),
      clockOut: punch("b", "2026-10-13T17:00:00.000Z")
    };
    expect(chunkDayPairs([pair])).toEqual([[pair, empty]]);
  });

  it("spills pair 3+ onto a second row", () => {
    const pairs: DayPairCell[] = [1, 2, 3].map((n) => ({
      clockIn: punch(`in${n}`, `2026-10-13T1${n}:00:00.000Z`),
      clockOut: punch(`out${n}`, `2026-10-13T1${n}:30:00.000Z`)
    }));
    expect(chunkDayPairs(pairs)).toEqual([
      [pairs[0], pairs[1]],
      [pairs[2], empty]
    ]);
  });
});

describe("buildPunchGrid", () => {
  const businessDay = (instant: string) => ({
    toString: () => instant.slice(0, 10)
  });

  it("always emits In/Out 1–2 columns via fixed pair width", () => {
    const { rows } = buildPunchGrid({
      punches: [
        punch("1", "2026-10-13T13:00:00.000Z"),
        punch("2", "2026-10-13T17:00:00.000Z")
      ],
      periodStart: "2026-10-13",
      periodEnd: "2026-10-13",
      tz: "America/Chicago",
      businessDay
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].isPrimary).toBe(true);
    expect(rows[0].pairs).toHaveLength(PAIRS_PER_ROW);
    expect(rows[0].pairs[0].clockIn?.id).toBe("1");
    expect(rows[0].pairs[1].clockIn).toBeNull();
  });

  it("adds a continuation row when a day has a third pair", () => {
    const { rows } = buildPunchGrid({
      punches: [
        punch("1", "2026-10-13T12:00:00.000Z"),
        punch("2", "2026-10-13T13:00:00.000Z"),
        punch("3", "2026-10-13T14:00:00.000Z"),
        punch("4", "2026-10-13T15:00:00.000Z"),
        punch("5", "2026-10-13T16:00:00.000Z"),
        punch("6", "2026-10-13T17:00:00.000Z")
      ],
      periodStart: "2026-10-13",
      periodEnd: "2026-10-13",
      tz: "UTC",
      businessDay
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].isPrimary).toBe(true);
    expect(rows[0].pairs[0].clockIn?.id).toBe("1");
    expect(rows[0].pairs[1].clockIn?.id).toBe("3");
    expect(rows[0].dayTotalMs).toBe(3_600_000 + 3_600_000 + 3_600_000);
    expect(rows[0].hasPunchError).toBe(false);
    expect(rows[1].isPrimary).toBe(false);
    expect(rows[1].date).toBe("2026-10-13");
    expect(rows[1].pairs[0].clockIn?.id).toBe("5");
    expect(rows[1].pairs[1].clockIn).toBeNull();
    expect(rows[1].dayTotalMs).toBeNull();
  });

  it("does not treat the next day's first punch as yesterday's Out", () => {
    const { rows } = buildPunchGrid({
      punches: [
        punch("open", "2026-10-12T22:00:00.000Z"),
        punch("in", "2026-10-13T13:00:00.000Z"),
        punch("out", "2026-10-13T17:00:00.000Z")
      ],
      periodStart: "2026-10-12",
      periodEnd: "2026-10-13",
      tz: "UTC",
      businessDay
    });
    const day12 = rows.filter((r) => r.date === "2026-10-12");
    const day13 = rows.filter((r) => r.date === "2026-10-13");
    expect(day12[0]?.pairs[0].clockIn?.id).toBe("open");
    expect(day12[0]?.pairs[0].clockOut).toBeNull();
    expect(day12[0]?.hasPunchError).toBe(true);
    expect(day13[0]?.pairs[0].clockIn?.id).toBe("in");
    expect(day13[0]?.pairs[0].clockOut?.id).toBe("out");
    expect(day13[0]?.hasPunchError).toBe(false);
  });

  it("totals each 7-day week and counts hours past 40 as overtime", () => {
    const punches: GridPunch[] = [];
    for (let day = 12; day <= 16; day += 1) {
      const ymd = `2026-10-${day}`;
      punches.push(
        punch(`in-${ymd}`, `${ymd}T13:00:00.000Z`),
        punch(`out-${ymd}`, `${ymd}T22:00:00.000Z`)
      );
    }

    const { weeks } = buildPunchGrid({
      punches,
      periodStart: "2026-10-12",
      periodEnd: "2026-10-18",
      tz: "UTC",
      businessDay
    });

    expect(weeks).toEqual([
      {
        start: "2026-10-12",
        end: "2026-10-18",
        totalMs: 40 * 3_600_000,
        overtimeMs: 5 * 3_600_000
      }
    ]);
  });

  it("keeps a 40-hour week at zero overtime and splits a 14-day period", () => {
    const punches: GridPunch[] = [];
    for (let day = 12; day <= 16; day += 1) {
      const ymd = `2026-10-${day}`;
      punches.push(
        punch(`in-${ymd}`, `${ymd}T08:00:00.000Z`),
        punch(`out-${ymd}`, `${ymd}T16:00:00.000Z`)
      );
    }

    const { weeks } = buildPunchGrid({
      punches,
      periodStart: "2026-10-12",
      periodEnd: "2026-10-25",
      tz: "UTC",
      businessDay
    });

    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({
      start: "2026-10-12",
      end: "2026-10-18",
      totalMs: 40 * 3_600_000,
      overtimeMs: 0
    });
    expect(weeks[1]).toMatchObject({
      start: "2026-10-19",
      end: "2026-10-25",
      totalMs: 0,
      overtimeMs: 0
    });
  });
});
