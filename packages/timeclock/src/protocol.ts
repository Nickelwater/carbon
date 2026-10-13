// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { parseAbsolute } from "@internationalized/date";

export type RegMessage = {
  cmd: "reg";
  sn: string;
  devinfo?: {
    firmware?: string;
    modelname?: string;
    time?: string;
    [key: string]: unknown;
  };
};

export type SendlogRecord = {
  enrollid: number | string;
  time: string;
  inout?: number;
  event?: number;
  mode?: number;
};

export type SendlogMessage = {
  cmd: "sendlog";
  sn: string;
  count?: number;
  record?: SendlogRecord[];
};

/** Server → clock pull request. `stn: true` starts; `stn: false` continues pagination. */
export type CollectLogCommand = {
  cmd: "getnewlog" | "getalllog";
  stn: boolean;
  from?: string;
  to?: string;
};

/** Clock → server reply to getnewlog / getalllog (uses `ret`, not `cmd`). */
export type CollectLogReply = {
  ret: "getnewlog" | "getalllog";
  result: boolean;
  count?: number;
  from?: number;
  to?: number;
  record?: SendlogRecord[];
  sn?: string;
  reason?: number | string;
};

export type ClockMessage =
  | RegMessage
  | SendlogMessage
  | CollectLogCommand
  | CollectLogReply
  | { cmd: string; sn?: string }
  | { ret: string; sn?: string; result?: boolean };

export type CollectLogMode = "new" | "all";

/** Wall-clock `Y-m-d H:i:s` in the company timezone for ProPunch `cloudtime`. */
export function formatCloudtime(
  timeZone: string,
  instant: Date = new Date()
): string {
  const z = parseAbsolute(instant.toISOString(), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${z.year}-${pad(z.month)}-${pad(z.day)} ${pad(z.hour)}:${pad(z.minute)}:${pad(z.second)}`;
}

export function ackReg(sn: string, cloudtime: string) {
  return {
    ret: "reg",
    result: true,
    cloudtime,
    sn
  };
}

export function ackSendlog(sn: string, cloudtime: string) {
  return {
    ret: "sendlog",
    result: true,
    cloudtime,
    sn
  };
}

export function getNewLogCommand(stn = true): CollectLogCommand {
  return { cmd: "getnewlog", stn };
}

/** Full attendance log on the device (not only unread since last collect). */
export function getAllLogCommand(stn = true): CollectLogCommand {
  return { cmd: "getalllog", stn };
}

export function getCollectLogCommand(
  mode: CollectLogMode = "new",
  stn = true
): CollectLogCommand {
  return mode === "all" ? getAllLogCommand(stn) : getNewLogCommand(stn);
}

/** Normalize protocol names — firmware samples sometimes include trailing spaces. */
export function normalizeProtocolName(value: string): string {
  return value.trim().toLowerCase();
}

export function isCollectLogReply(
  message: ClockMessage
): message is CollectLogReply {
  if (!("ret" in message) || typeof message.ret !== "string") return false;
  const ret = normalizeProtocolName(message.ret);
  return ret === "getnewlog" || ret === "getalllog";
}

/**
 * More pages remain when the device reports a total `count` and this page's
 * `to` index has not reached the last record (0-based inclusive).
 */
export function collectLogHasMorePages(reply: {
  count?: number;
  to?: number;
}): boolean {
  const count = reply.count ?? 0;
  if (count <= 0) return false;
  const to = reply.to;
  if (typeof to !== "number" || !Number.isFinite(to)) return false;
  return to + 1 < count;
}

export function parseClockMessage(raw: string): ClockMessage | null {
  try {
    const parsed = JSON.parse(raw) as ClockMessage;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if ("cmd" in parsed && typeof parsed.cmd === "string") {
      return parsed;
    }
    if ("ret" in parsed && typeof parsed.ret === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
