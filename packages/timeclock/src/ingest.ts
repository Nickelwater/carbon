// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { parseAbsolute, parseDateTime, toZoned } from "@internationalized/date";

export type PunchStatus =
  | "pending"
  | "applied"
  | "unmapped"
  | "duplicate"
  | "error";

export type ToggleDecision =
  | { kind: "pending" }
  | { kind: "unmapped" }
  | { kind: "clockIn" }
  | { kind: "clockOut"; entryId: string }
  | { kind: "skip"; reason: "applied" | "duplicate" };

/**
 * Decide how a hardware punch should affect timeCardEntry.
 * Toggle semantics: ignore device inout for v1.
 */
export function decideToggleAction(args: {
  deviceEnabled: boolean;
  employeeId: string | null;
  openEntryId: string | null;
  punchStatus?: PunchStatus;
}): ToggleDecision {
  if (args.punchStatus === "applied") {
    return { kind: "skip", reason: "applied" };
  }
  if (args.punchStatus === "duplicate") {
    return { kind: "skip", reason: "duplicate" };
  }
  if (!args.deviceEnabled) {
    return { kind: "pending" };
  }
  if (!args.employeeId) {
    return { kind: "unmapped" };
  }
  if (args.openEntryId) {
    return { kind: "clockOut", entryId: args.openEntryId };
  }
  return { kind: "clockIn" };
}

export function punchIdempotencyKey(args: {
  companyId: string;
  serialNumber: string;
  enrollId: string;
  punchedAt: string;
  mode: number;
  event: number;
}): string {
  return [
    args.companyId,
    args.serialNumber,
    args.enrollId,
    args.punchedAt,
    String(args.mode),
    String(args.event)
  ].join("|");
}

/**
 * ProPunch terminal time `Y-m-d H:i:s` is wall clock in the company timezone
 * (same convention as `cloudtime` ACKs). Convert to an absolute UTC ISO string
 * for timestamptz insert — never treat the naive string as UTC.
 */
export function propunchTimeToIso(time: string, timeZone: string): string {
  const trimmed = time.trim();
  if (!timeZone) {
    throw new Error("propunchTimeToIso requires a company timezone");
  }
  // Already absolute (Z or numeric offset)
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return parseAbsolute(trimmed, timeZone).toAbsoluteString();
  }
  const local = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  return toZoned(parseDateTime(local), timeZone).toAbsoluteString();
}
