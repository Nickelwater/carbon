// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { describe, expect, it } from "vitest";
import {
  decideToggleAction,
  propunchTimeToIso,
  punchIdempotencyKey
} from "./ingest";

describe("decideToggleAction", () => {
  it("returns pending when the device is disabled", () => {
    expect(
      decideToggleAction({
        deviceEnabled: false,
        employeeId: "emp-1",
        openEntryId: null
      })
    ).toEqual({ kind: "pending" });
  });

  it("returns unmapped when enroll id has no employee", () => {
    expect(
      decideToggleAction({
        deviceEnabled: true,
        employeeId: null,
        openEntryId: null
      })
    ).toEqual({ kind: "unmapped" });
  });

  it("returns clockIn when enabled, mapped, and no open entry", () => {
    expect(
      decideToggleAction({
        deviceEnabled: true,
        employeeId: "emp-1",
        openEntryId: null
      })
    ).toEqual({ kind: "clockIn" });
  });

  it("returns clockOut when an open entry exists", () => {
    expect(
      decideToggleAction({
        deviceEnabled: true,
        employeeId: "emp-1",
        openEntryId: "tce-1"
      })
    ).toEqual({ kind: "clockOut", entryId: "tce-1" });
  });

  it("skips duplicates", () => {
    expect(
      decideToggleAction({
        deviceEnabled: true,
        employeeId: "emp-1",
        openEntryId: null,
        punchStatus: "duplicate"
      })
    ).toEqual({ kind: "skip", reason: "duplicate" });
  });
});

describe("punchIdempotencyKey", () => {
  it("joins the unique punch fields", () => {
    expect(
      punchIdempotencyKey({
        companyId: "c1",
        serialNumber: "SN1",
        enrollId: "12",
        punchedAt: "2026-10-12T09:15:00",
        mode: 0,
        event: 0
      })
    ).toBe("c1|SN1|12|2026-10-12T09:15:00|0|0");
  });
});

describe("propunchTimeToIso", () => {
  it("converts space-separated terminal time", () => {
    expect(propunchTimeToIso("2026-10-12 09:15:00")).toBe(
      "2026-10-12T09:15:00"
    );
  });
});
