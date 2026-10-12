// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { describe, expect, it } from "vitest";
import {
  getPayPeriodContaining,
  type PunchLike,
  pairPunches,
  shiftPayPeriod
} from "./pair";

function p(id: string, punchedAt: string): PunchLike {
  return { id, punchedAt };
}

describe("pairPunches", () => {
  it("pairs the double-punch example leaving an open In at 15:30", () => {
    const punches = [
      p("a", "2026-10-12T06:00:00Z"),
      p("b", "2026-10-12T11:30:00Z"),
      p("c", "2026-10-12T12:00:00Z"),
      p("d", "2026-10-12T12:01:00Z"),
      p("e", "2026-10-12T15:30:00Z")
    ];
    const result = pairPunches(punches);
    expect(result.isOpen).toBe(true);
    expect(result.segments).toEqual([
      {
        clockIn: punches[0],
        clockOut: punches[1]
      },
      {
        clockIn: punches[2],
        clockOut: punches[3]
      },
      {
        clockIn: punches[4],
        clockOut: null
      }
    ]);
  });

  it("re-pairs after deleting the 12:01 punch", () => {
    const punches = [
      p("a", "2026-10-12T06:00:00Z"),
      p("b", "2026-10-12T11:30:00Z"),
      p("c", "2026-10-12T12:00:00Z"),
      p("e", "2026-10-12T15:30:00Z")
    ];
    const result = pairPunches(punches);
    expect(result.isOpen).toBe(false);
    expect(result.segments).toEqual([
      {
        clockIn: punches[0],
        clockOut: punches[1]
      },
      {
        clockIn: punches[2],
        clockOut: punches[3]
      }
    ]);
  });

  it("sorts by punchedAt before pairing", () => {
    const punches = [
      p("b", "2026-10-12T11:00:00Z"),
      p("a", "2026-10-12T06:00:00Z")
    ];
    const result = pairPunches(punches);
    const first = result.segments[0];
    expect(first?.clockIn.id).toBe("a");
    expect(first?.clockOut?.id).toBe("b");
  });
});

describe("pay period helpers", () => {
  it("finds the weekly period containing a date", () => {
    expect(
      getPayPeriodContaining("2026-10-15", {
        payPeriodLengthDays: 7,
        payPeriodAnchorDate: "2026-10-12"
      })
    ).toEqual({ start: "2026-10-12", end: "2026-10-18" });
  });

  it("finds a prior biweekly period", () => {
    expect(
      getPayPeriodContaining("2026-10-05", {
        payPeriodLengthDays: 14,
        payPeriodAnchorDate: "2026-10-12"
      })
    ).toEqual({ start: "2026-09-28", end: "2026-10-11" });
  });

  it("shifts periods by length", () => {
    expect(
      shiftPayPeriod({ start: "2026-10-12", end: "2026-10-18" }, 1, 7)
    ).toEqual({ start: "2026-10-19", end: "2026-10-25" });
  });
});
