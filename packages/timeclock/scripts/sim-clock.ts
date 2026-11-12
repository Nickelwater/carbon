// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

/**
 * Minimal ProPunch simulator for local testing.
 *
 * Usage:
 *   TIMECLOCK_PORT=7788 pnpm --filter @carbon/timeclock exec tsx scripts/sim-clock.ts SN123 42
 */

import WebSocket from "ws";
import { formatCloudtime } from "../src/protocol";

const host = process.env.TIMECLOCK_HOST === "0.0.0.0"
  ? "127.0.0.1"
  : process.env.TIMECLOCK_HOST || "127.0.0.1";
const port = process.env.TIMECLOCK_PORT || "7788";
const timeZone = process.env.TIMECLOCK_TZ || "America/Chicago";
const sn = process.argv[2] || "SIM-SN-001";
const enrollId = process.argv[3] || "1001";

const url = `ws://${host}:${port}/pub/chat`;
const ws = new WebSocket(url);

ws.on("open", () => {
  ws.send(
    JSON.stringify({
      cmd: "reg",
      sn,
      devinfo: {
        firmware: "sim",
        modelname: "FPC18",
        time: formatCloudtime(timeZone)
      }
    })
  );

  setTimeout(() => {
    ws.send(
      JSON.stringify({
        cmd: "sendlog",
        sn,
        count: 1,
        record: [
          {
            enrollid: Number(enrollId) || enrollId,
            time: formatCloudtime(timeZone),
            inout: 0,
            event: 0,
            mode: 1
          }
        ]
      })
    );
  }, 500);

  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 1500);
});

ws.on("message", (data) => {
  console.log("←", data.toString());
});

ws.on("error", (err) => {
  console.error(err);
  process.exit(1);
});
