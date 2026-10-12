// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { describe, expect, it } from "vitest";
import {
  ackReg,
  ackSendlog,
  getAllLogCommand,
  getCollectLogCommand,
  getNewLogCommand,
  parseClockMessage
} from "./protocol";

describe("protocol ACKs", () => {
  it("shapes reg ACK", () => {
    expect(ackReg("SN1", "2026-10-12 09:30:00")).toEqual({
      ret: "reg",
      result: true,
      cloudtime: "2026-10-12 09:30:00",
      sn: "SN1"
    });
  });

  it("shapes sendlog ACK", () => {
    expect(ackSendlog("SN1", "2026-10-12 09:30:00")).toEqual({
      ret: "sendlog",
      result: true,
      cloudtime: "2026-10-12 09:30:00",
      sn: "SN1"
    });
  });

  it("builds getnewlog and getalllog", () => {
    expect(getNewLogCommand()).toEqual({ cmd: "getnewlog" });
    expect(getAllLogCommand()).toEqual({ cmd: "getalllog" });
    expect(getCollectLogCommand("new")).toEqual({ cmd: "getnewlog" });
    expect(getCollectLogCommand("all")).toEqual({ cmd: "getalllog" });
  });

  it("parses JSON clock messages", () => {
    expect(parseClockMessage('{"cmd":"reg","sn":"SN1"}')).toEqual({
      cmd: "reg",
      sn: "SN1"
    });
    expect(parseClockMessage("not-json")).toBeNull();
  });
});
