// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

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

export function formatCloudtime(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function ackReg(sn: string, cloudtime?: string) {
  return {
    ret: "reg",
    result: true,
    cloudtime: cloudtime ?? formatCloudtime(),
    sn
  };
}

export function ackSendlog(sn: string, cloudtime?: string) {
  return {
    ret: "sendlog",
    result: true,
    cloudtime: cloudtime ?? formatCloudtime(),
    sn
  };
}

export function getNewLogCommand() {
  return { cmd: "getnewlog" };
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
