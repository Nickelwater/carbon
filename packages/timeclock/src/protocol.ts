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

export type ClockMessage =
  | RegMessage
  | SendlogMessage
  | { cmd: string; sn?: string };

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

export function getNewLogCommand() {
  return { cmd: "getnewlog" };
}

/** Full attendance log on the device (not only unread since last collect). */
export function getAllLogCommand() {
  return { cmd: "getalllog" };
}

export type CollectLogMode = "new" | "all";

export function getCollectLogCommand(mode: CollectLogMode = "new") {
  return mode === "all" ? getAllLogCommand() : getNewLogCommand();
}

export function parseClockMessage(raw: string): ClockMessage | null {
  try {
    const parsed = JSON.parse(raw) as ClockMessage;
    if (!parsed || typeof parsed !== "object" || !("cmd" in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
