// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { describe, expect, it } from "vitest";
import {
  ackReg,
  ackSendlog,
  collectLogHasMorePages,
  getAllLogCommand,
  getCollectLogCommand,
  getNewLogCommand,
  isCollectLogReply,
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

  it("builds getnewlog and getalllog with stn", () => {
    expect(getNewLogCommand()).toEqual({ cmd: "getnewlog", stn: true });
    expect(getAllLogCommand()).toEqual({ cmd: "getalllog", stn: true });
    expect(getCollectLogCommand("new")).toEqual({
      cmd: "getnewlog",
      stn: true
    });
    expect(getCollectLogCommand("all")).toEqual({
      cmd: "getalllog",
      stn: true
    });
    expect(getCollectLogCommand("all", false)).toEqual({
      cmd: "getalllog",
      stn: false
    });
  });

  it("parses cmd and ret clock messages", () => {
    expect(parseClockMessage('{"cmd":"reg","sn":"SN1"}')).toEqual({
      cmd: "reg",
      sn: "SN1"
    });
    expect(
      parseClockMessage(
        '{"ret":"getalllog","result":true,"count":2,"from":0,"to":1,"record":[]}'
      )
    ).toMatchObject({ ret: "getalllog", result: true, count: 2 });
    expect(parseClockMessage("not-json")).toBeNull();
  });

  it("detects collect-log replies even with trailing spaces on ret", () => {
    expect(
      isCollectLogReply({
        ret: "getalllog",
        result: true,
        count: 0,
        record: []
      })
    ).toBe(true);
    expect(
      isCollectLogReply({
        ret: "getnewlog ",
        result: true,
        count: 0,
        record: []
      })
    ).toBe(true);
    expect(isCollectLogReply({ cmd: "sendlog", sn: "SN1" })).toBe(false);
  });

  it("pages while to+1 < count", () => {
    expect(collectLogHasMorePages({ count: 1000, to: 49 })).toBe(true);
    expect(collectLogHasMorePages({ count: 1000, to: 999 })).toBe(false);
    expect(collectLogHasMorePages({ count: 0, to: 0 })).toBe(false);
    expect(collectLogHasMorePages({ count: 50 })).toBe(false);
  });
});
